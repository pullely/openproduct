// The publish-time repo read, S8 (19-openproduct-seam.md) — landed at OX3
// with the gateway rather than OX4, because `profiles.repo_url` already
// carries the coordinates and the facade's exit should not leave a dead
// maintainer button behind.
//
// The two facts a listing needs — the repo is public, and its declared
// licence — are facts about a PUBLIC repo, and GitHub's public API answers
// them without custody of anything. The SSRF concern that made OD route this
// through the platform's App dies here structurally: the fetch host is
// pinned to api.github.com, and the only maintainer-controlled input is an
// owner/repo pair that must match a strict slug shape. An optional token
// (OX-D) buys rate headroom; the unauthenticated read is the degraded mode.
//
// The non-negotiable carried over from the facade: an OUTAGE IS NOT AN
// OBSERVATION. GitHub unreachable → a retriable error, never "private".

import { countMergedChanges, isBotAccount, type CommitFact } from "@openproduct/contracts";

export interface RepoObservation {
  linked: boolean;
  visibility: "public" | "private" | null;
  licence: string | null;
  /**
   * IN2 — WHAT THE REPOSITORY SAYS ABOUT ITSELF, and it cost no extra
   * request: this response already carried `name`, `description` and
   * `topics`, and the first version of this function simply did not read
   * them.
   *
   * OBSERVED, in exactly the sense `licence` is (OPC-2). These are never a
   * maintainer's words — they are what GitHub answered, written down beside
   * what the maintainer wrote rather than over it, so the studio can say
   * which of the two a reader is looking at.
   *
   * `null` on all three when the repo is private or unlinked: an observation
   * we could not make is not an empty one.
   */
  name: string | null;
  description: string | null;
  topics: string[] | null;
  /**
   * PV0 — the three remaining signals a PUBLIC read can see, and they were in
   * this response too.
   *
   * `tests` IS NOT AMONG THEM, and its absence is a decision `provenance.ts`
   * recorded before this milestone existed: a `declared_repo` read has no App
   * and cannot see CI, "so there is no tests figure and the field is absent
   * rather than empty". PV0 ships four signals rather than five because the
   * fifth would have to be guessed.
   */
  language: string | null;
  /** ISO 8601 — when the default branch was last pushed to. */
  pushedAt: string | null;
  /** GitHub counts open pull requests in this number. Recorded as it is
   *  answered; the formula says so rather than the reader assuming. */
  openIssues: number | null;
}

const SLUG = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;

/** Strictly `https://github.com/{owner}/{repo}` (an optional `.git` / trailing
 *  slash tolerated). Anything else — other hosts, extra segments — is null. */
export function parseGithubRepo(repoUrl: string): { owner: string; repo: string } | null {
  let url: URL;
  try {
    url = new URL(repoUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
  const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/, "");
  if (!SLUG.test(owner) || !SLUG.test(repo)) return null;
  return { owner, repo };
}

/** Nothing observed — the shape a refusal or an unlinked repo records. */
const UNOBSERVED = {
  visibility: null,
  licence: null,
  name: null,
  description: null,
  topics: null,
  language: null,
  pushedAt: null,
  openIssues: null,
} as const;

/** A bounded string, or null. GitHub's fields are free text written by
 *  somebody else, so length is capped here rather than at the column. */
function text(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

/** GitHub's repository topics: lowercase slugs, at most twenty of them.
 *  Bounded and shape-checked because they land in a JSONB column and are
 *  rendered — an unbounded list from an external API is an unbounded page. */
function topics(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0 && v.length <= 64)
    .slice(0, 20);
  return out;
}

/** An ISO instant, or null. Parsed rather than pattern-matched: what matters
 *  is whether it is a moment, and `Date` is the answer to that question. */
function timestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

/** A non-negative count, or null. Bounded, because it is rendered and it
 *  comes from somewhere we do not control. */
function count(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n >= 0 && n <= 1_000_000 ? n : null;
}

export type ObserveResult =
  | { ok: true; observation: RepoObservation }
  | { ok: false };

export async function observeRepo(
  owner: string,
  repo: string,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<ObserveResult> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "openproduct-gateway",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  } catch {
    return { ok: false };
  }

  // 404 is an ANSWER on the public API: private and nonexistent are
  // deliberately indistinguishable, and for the publish gate both mean the
  // same thing — the promise "read the code" does not hold at this URL.
  if (res.status === 404) {
    return { ok: true, observation: { ...UNOBSERVED, linked: true, visibility: "private" } };
  }
  if (!res.ok) {
    // 403 here is almost always the unauthenticated rate limit — an outage
    // for our purposes, never an observation.
    return { ok: false };
  }

  let body: {
    private?: boolean;
    license?: { spdx_id?: string | null } | null;
    name?: unknown;
    description?: unknown;
    topics?: unknown;
    language?: unknown;
    pushed_at?: unknown;
    open_issues_count?: unknown;
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false };
  }
  const spdx = body.license?.spdx_id ?? null;
  const isPrivate = body.private === true;
  return {
    ok: true,
    observation: {
      linked: true,
      visibility: isPrivate ? "private" : "public",
      licence: spdx && spdx !== "NOASSERTION" ? spdx : null,
      // A PRIVATE REPO TELLS US NOTHING WE MAY REPEAT. GitHub answers this
      // shape for a repo the token can see but the public cannot, and
      // copying its description onto a public listing would publish
      // something nobody chose to publish. The visibility is the observation
      // there; the words are not ours to take.
      name: isPrivate ? null : text(body.name),
      description: isPrivate ? null : text(body.description),
      topics: isPrivate ? null : topics(body.topics),
      language: isPrivate ? null : text(body.language, 64),
      pushedAt: isPrivate ? null : timestamp(body.pushed_at),
      openIssues: isPrivate ? null : count(body.open_issues_count),
    },
  };
}

// ─── openproduct-commons SN1 — the activity read ───
//
// The same host-pinned, slug-bounded surface OX3 already built for S8. SN1
// asks it two more questions, and asks them of the SAME endpoint family:
// there is no new outbound host, no new user-controlled URL, and therefore
// no new SSRF surface to reason about. That is the whole reason this lives
// here rather than in a fresh ingester.
//
// WHAT IS OBSERVABLE WITHOUT AN APP, and what is not:
//
//   pushed_at      yes — on the repo object we already fetch
//   merged changes yes — the commits list on the default branch, windowed
//   CI results     NO  — check runs need an installation token, so a
//                        declared repo has no tests figure AT ALL, not a
//                        zero one (SN-1, OPC-C)
//
// AN OUTAGE IS NOT AN OBSERVATION, carried verbatim from `observeRepo`: every
// failure path returns `ok: false`, and the caller records a source failure
// rather than a metric. A number we could not read is never a number we read
// as zero.

export interface ActivityObservation {
  /** Merged changes on the default branch in the trailing seven days, counted
   *  as `activity.merges.7d` says (OB2: first-parent, no bots, capped). */
  merges: number;
  /** The same, over thirty days (`activity.merges.30d`). */
  merges30d: number;
  /** Epoch seconds of the last push, or null when the repo has never been
   *  pushed to — which is a real, observed answer and not an absence. */
  lastTouchedAt: number | null;
}

/**
 * `rateLimited` is a third answer, and OB2 is why it exists: GitHub's rate
 * limit is a statement about THIS CALLER, not about the repository. Charging
 * it to the source would withdraw healthy listings after eight bad hours, so
 * the sweep stops asking for the rest of the run instead and charges nobody.
 */
export type ObserveActivityResult =
  | { ok: true; observation: ActivityObservation }
  | { ok: false; rateLimited?: boolean };

/** GitHub caps a page at 100. We ask for exactly that and count what we got:
 *  a listing with more than 100 changes in a month is doing well enough that
 *  the exact figure is not what a reader is deciding on, and paging for it
 *  would multiply our request budget by an unbounded factor (SN4's concern).
 *  The first-parent walk stops where the page ends, so a cut page is an
 *  honest lower bound rather than a wrong number. */
const PER_PAGE = 100;

/** A primary or secondary rate limit, as GitHub signals either. */
export function isRateLimited(res: Response): boolean {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  return res.headers.get("x-ratelimit-remaining") === "0" || res.headers.get("retry-after") !== null;
}

interface CommitEntry {
  sha?: unknown;
  parents?: Array<{ sha?: unknown }> | null;
  author?: { login?: unknown; type?: unknown } | null;
  commit?: {
    author?: { email?: unknown } | null;
    committer?: { date?: unknown } | null;
  } | null;
}

/** One commits-API entry as the counter needs it, or null when it is not a commit. */
function commitFactOf(entry: CommitEntry): CommitFact | null {
  if (!entry || typeof entry.sha !== "string") return null;
  const date = entry.commit?.committer?.date;
  const landedAt = typeof date === "string" ? Date.parse(date) : NaN;
  if (Number.isNaN(landedAt)) return null;
  const login = typeof entry.author?.login === "string" ? entry.author.login : null;
  const type = typeof entry.author?.type === "string" ? entry.author.type : null;
  const email = typeof entry.commit?.author?.email === "string" ? entry.commit.author.email : null;
  const parents = Array.isArray(entry.parents)
    ? entry.parents.map((p) => (typeof p?.sha === "string" ? p.sha : "")).filter((sha) => sha.length > 0)
    : [];
  return { sha: entry.sha, parents, contributor: login ?? email, isBot: isBotAccount(login, type), landedAt };
}

export async function observeActivity(
  owner: string,
  repo: string,
  sinceIso: string,
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
  nowMs: number = Date.now(),
): Promise<ObserveActivityResult> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "openproduct-gateway",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  // `since` is ours, not the maintainer's — an ISO string this module builds.
  // owner/repo were slug-validated by parseGithubRepo before they got here.
  const url =
    `https://api.github.com/repos/${owner}/${repo}/commits` +
    `?since=${encodeURIComponent(sinceIso)}&per_page=${PER_PAGE}`;

  let res: Response;
  try {
    res = await fetchImpl(url, { headers });
  } catch {
    return { ok: false };
  }

  // 409 is GitHub's answer for an EMPTY repository. That is an observation —
  // there is nothing merged because there is nothing — and it is materially
  // different from a repository we could not read.
  if (res.status === 409) {
    return { ok: true, observation: { merges: 0, merges30d: 0, lastTouchedAt: null } };
  }
  if (isRateLimited(res)) return { ok: false, rateLimited: true };
  // 404 (private or gone) is not an activity answer: the publish gate already
  // handles that fact through observeRepo, and pretending zero here would put
  // a private listing at the bottom of "most active" rather than out of it.
  if (!res.ok) return { ok: false };

  let entries: CommitEntry[];
  try {
    entries = (await res.json()) as CommitEntry[];
  } catch {
    return { ok: false };
  }
  if (!Array.isArray(entries)) return { ok: false };

  const facts = entries.map(commitFactOf).filter((fact): fact is CommitFact => fact !== null);
  const counted = countMergedChanges(facts, nowMs);
  return {
    ok: true,
    observation: {
      merges: counted.merges7d,
      merges30d: counted.merges30d,
      lastTouchedAt: counted.lastTouchedAt,
    },
  };
}
