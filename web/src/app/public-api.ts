// The public plane's read client (saas-openproduct OD5).
//
// COLOCATED INSIDE THE ROUTE GROUP, not in `lib/`. The OD1 import-boundary
// guard caught the first draft of this file living in `src/lib/`, and it was
// right to: a shared `lib/` module is a third console touchpoint, and
// teardown.md rows 3–4 are pure `rm -rf`s precisely because the console side of
// this epic is two leaf directories and nothing else. Keeping it here means
// deleting the route group deletes its client too.
//
// WHY THIS DOES NOT USE THE SDK CLIENT.
//
// Every other console surface goes through `createClient(target, token)`, which
// attaches a bearer when one is stored. That is exactly right for the app shell
// and exactly wrong here: a visitor who happens to have a session in another
// tab would silently send it with a request that must be anonymous, and the
// api-edge public branch would then be serving an authenticated request that it
// deliberately does not read. The guarantee "no request from these pages
// carries an Authorization header" is only worth anything if it is structural.
//
// So this module builds its own `fetch` call with an explicit, complete header
// set — never a filtered copy of anything, and with no code path that can add
// a credential. There is no `token` parameter to pass by accident.
//
// It is also the only place these pages talk to the network, so the assertion
// is checkable in one file rather than argued across a route tree.

import type {
  BoardEntry,
  MediaThumbnail,
  BuildInfo,
  ChosenThreadTag,
  CollectionCard,
  Digest,
  Forum,
  ForumOrder,
  Freshness,
  IngestionBudget,
  MakerComment,
  MakerCounts,
  MakerHistoryEntry,
  MakerLaunch,
  MakerMarkInputs,
  MakerTab,
  MakerUpvote,
  PublicCollection,
  PublicContributor,
  PublicContributorCard,
  PublicPost,
  PublicProfile,
  PublicProfileCard,
  PublicThread,
  ScreenshotBudget,
  SearchMakerHit,
  SearchTopicHit,
  SweepHealth,
  Tombstone,
  Topic,
  TopicCard,
  TransparencyReport,
} from "@openproduct/contracts";

import { openproductApiBase, siteOrigin } from "@/lib/platform";

/** Matches the API's own `max-age=60` (OD-H): the page is as fresh as the read. */
export const PUBLIC_REVALIDATE_SECONDS = 60;

/**
 * Which API to read: openproduct's own gateway (OX3) — the platform edge no
 * longer serves these routes. The auth flow is the one thing that still talks
 * to the platform, and it imports `platformApiBase` itself.
 */
export function publicApiBase(): string {
  return openproductApiBase();
}

/**
 * The public apex's absolute origin (e.g. `https://openproduct.live`), or null
 * when no public host is configured. Read from the SAME build var the
 * middleware host check uses, so the canonical URL a page advertises and the
 * host that actually serves it can never disagree. Used only for the
 * `<link rel="canonical">`: three URLs can serve one page (the apex `/slug`,
 * the console `/openproduct/slug`, and app.orunbase.com), and this names the
 * one that counts so crawl equity is not split.
 */
export function publicApexOrigin(): string | null {
  return siteOrigin();
}

/**
 * The complete header set for a public read. Two headers, both harmless.
 *
 * Exported so the OD5 test can assert what it is rather than what it is not:
 * "there is no Authorization header" is a claim about absence, and absence is
 * best checked against a closed list.
 */
export function publicReadHeaders(): Record<string, string> {
  return { accept: "application/json" };
}

export type PublicFetch = typeof fetch;

/**
 * One address in the sitemap. `path` is already the URL's path, INCLUDING the
 * `@` a profile carries — assembling it at the call site rather than here is
 * what lets one function serve two namespaces without knowing about either.
 */
export interface SitemapEntry {
  path: string;
  lastmod: string | null;
}

/**
 * The sitemap document (launch polish, widened at openproduct-commons DS4).
 *
 * Pure, and built ONLY from the public reads' own fields, so it can never
 * name anything those reads would not serve. XML-escaping is total on every
 * interpolated value.
 *
 * WHAT IS AND IS NOT IN IT (DS4's done-when, made concrete):
 *
 *   in   the directory, every indexable public listing, every public profile
 *   out  every filtered view of the directory
 *
 * The omission is the interesting half. `/?category=devtools&stack=rust` is a
 * real, useful, linkable page — and there are 2^n of them. Listing even a few
 * would ask a crawler to spend its budget on permutations of one document
 * instead of on the listings themselves, and listing all of them is not a
 * finite document. So every permutation carries `<link rel="canonical">` to
 * the bare directory instead, which says the same thing in the place a
 * crawler is already looking, and costs nothing to serve.
 */
export function sitemapXml(origin: string, entries: readonly SitemapEntry[]): string {
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const urls = [
    `  <url><loc>${esc(origin)}/</loc></url>`,
    ...entries.map(
      (entry) =>
        `  <url><loc>${esc(origin)}/${esc(entry.path)}</loc>${
          entry.lastmod ? `<lastmod>${esc(entry.lastmod.slice(0, 10))}</lastmod>` : ""
        }</url>`,
    ),
  ].join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

interface Envelope<T> {
  data?: T;
}

async function readPublic<T>(path: string, fetchImpl?: PublicFetch): Promise<T | null> {
  const base = publicApiBase();
  if (!base) return null;
  const doFetch = fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(`${base}${path}`, {
      method: "GET",
      headers: publicReadHeaders(),
      // No cookies. A browser would otherwise attach same-site credentials to
      // a request whose whole point is to be anonymous.
      credentials: "omit",
      // Next revalidation, matched to the API's cache-control so the page and
      // the response agree about how stale they may be.
      next: { revalidate: PUBLIC_REVALIDATE_SECONDS },
    } as RequestInit);
  } catch {
    return null;
  }

  if (!response.ok) return null;
  try {
    const body = (await response.json()) as Envelope<T>;
    return body.data ?? null;
  } catch {
    return null;
  }
}

/**
 * The directory.
 *
 * `[]` and `null` are DIFFERENT ANSWERS, and conflating them was a real bug:
 * the first draft returned `[]` for every failure, so `app.orunbase.com/openproduct`
 * cheerfully rendered "No projects are listed yet" on prod — where the flag is
 * off and the surface is supposed to be dark. An empty room and a locked door
 * look nothing alike to a visitor, and the page should not have to guess.
 *
 *   `[]`   — the directory is reachable and genuinely empty. A state, not an
 *            error: a seeding gap must not render as an outage.
 *   `null` — it could not be read at all (flag off, 404, 5xx, unreachable).
 *            The page renders a 404, because there is no directory here.
 */
export async function fetchPublicDirectory(
  fetchImpl?: PublicFetch,
): Promise<PublicProfileCard[] | null> {
  const page = await fetchDirectoryPage(null, fetchImpl);
  return page === null ? null : page.projects;
}

/**
 * OS1 — one PAGE of the directory, by position.
 *
 * `next` is the address of the page after this one (opaque; it lives in a
 * URL and nowhere else — OS-2), or null on the last page. `total` is the
 * real count over every listed row, a number about the catalogue rather
 * than about the page. A gateway deployed before OS1 answers neither; both
 * read as null and the page says nothing it cannot back.
 */
export interface DirectoryPage {
  readonly projects: PublicProfileCard[];
  readonly next: string | null;
  readonly total: number | null;
  /** OS5 — when the catalogue these rows came from was computed; null on the live join. */
  readonly computedAt: string | null;
}

export async function fetchDirectoryPage(
  cursor: string | null = null,
  fetchImpl?: PublicFetch,
): Promise<DirectoryPage | null> {
  const path =
    cursor === null
      ? "/v1/public/openproduct/projects"
      : `/v1/public/openproduct/projects?cursor=${encodeURIComponent(cursor)}`;
  const data = await readPublic<{ projects: PublicProfileCard[]; next?: unknown; total?: unknown; computedAt?: unknown }>(
    path,
    fetchImpl,
  );
  if (!data) return null;
  return {
    projects: data.projects ?? [],
    next: typeof data.next === "string" && data.next.length > 0 ? data.next : null,
    total: typeof data.total === "number" && Number.isFinite(data.total) ? data.total : null,
    computedAt: typeof data.computedAt === "string" && data.computedAt.length > 0 ? data.computedAt : null,
  };
}

/** How many pages a whole-catalogue walk will follow: fifty of the API's
 *  default page is five thousand listings, the size OS0 built the corpus at. */
export const DIRECTORY_WALK_LIMIT = 50;

/**
 * EVERY listed product, page by page — the sitemap's read (OS1). Until OS1
 * the sitemap listed the directory's first fifty and nothing said so; a
 * sitemap is the one place the whole catalogue belongs, so this follows
 * `next` to the end, bounded.
 */
export async function fetchAllDirectoryProjects(fetchImpl?: PublicFetch): Promise<PublicProfileCard[] | null> {
  const out: PublicProfileCard[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < DIRECTORY_WALK_LIMIT; pages += 1) {
    const page: DirectoryPage | null = await fetchDirectoryPage(cursor, fetchImpl);
    if (page === null) return pages === 0 ? null : out;
    out.push(...page.projects);
    cursor = page.next;
    if (cursor === null) break;
  }
  return out;
}

/**
 * LC2 — the directory WITH its strip.
 *
 * A SECOND FUNCTION RATHER THAN A WIDENED FIRST ONE, because the sitemap
 * calls `fetchPublicDirectory` and has no use for a strip. Both read the same
 * endpoint, so this costs no extra request — Next dedupes the fetch — and the
 * caller that wants addresses is not made to think about freshness.
 */
export async function fetchDirectoryWithStrip(
  fetchImpl?: PublicFetch,
): Promise<{ projects: PublicProfileCard[]; freshness?: Freshness; threshold?: number } | null> {
  const data = await readPublic<{
    projects: PublicProfileCard[];
    freshness?: Freshness;
    freshnessThreshold?: number;
  }>("/v1/public/openproduct/projects", fetchImpl);
  if (!data) return null;
  return {
    projects: data.projects ?? [],
    // Optional on the way through: a document cached before LC2 shipped has
    // neither field, and the strip falls back to naming the catalog's size
    // rather than rendering nothing.
    ...(data.freshness ? { freshness: data.freshness } : {}),
    ...(typeof data.freshnessThreshold === "number" ? { threshold: data.freshnessThreshold } : {}),
  };
}

/**
 * One project page. `null` covers unknown, unpublished, and unreachable
 * alike — the API answers the first two identically on purpose, and the page
 * renders a 404 for all three rather than leaking which it was.
 */
export async function fetchPublicProfile(
  slug: string,
  fetchImpl?: PublicFetch,
): Promise<PublicProfile | null> {
  return fetchListing(slug, fetchImpl).then((r) => r?.profile ?? null);
}

/**
 * The same read, keeping the tombstone (TS3).
 *
 * TWO FUNCTIONS RATHER THAN A WIDER ONE, and the older name keeps its exact
 * meaning: every caller that only wants a listing to render still gets `null`
 * for a removed one and 404s, which is right for a sitemap entry or an
 * embedded card. The `[slug]` page is the one surface that must say what
 * happened instead of pretending nothing is there, so it is the one surface
 * that asks for this.
 *
 * A removed listing comes back with a tombstone and NO profile; a delisted
 * one comes back with both, because delisting means "not amplified", not
 * "not shown".
 */
export interface ListingRead {
  profile?: PublicProfile;
  tombstone?: Tombstone;
}

export async function fetchListing(
  slug: string,
  fetchImpl?: PublicFetch,
): Promise<ListingRead | null> {
  return readPublic<ListingRead>(
    `/v1/public/openproduct/projects/${encodeURIComponent(slug)}`,
    fetchImpl,
  );
}


/**
 * CG2 — the contributors directory.
 *
 * A different read from `fetchPublicPeople`, deliberately: that one carries
 * addresses because a sitemap needs addresses, and this carries what a card
 * draws. One endpoint serving both would end up carrying the union.
 *
 * `null` means the read failed and is NOT an empty directory — the page
 * distinguishes them, because an empty room and a locked door look nothing
 * alike to a visitor (the OD5 finding).
 */
export async function fetchContributorsDirectory(
  fetchImpl?: PublicFetch,
): Promise<PublicContributorCard[] | null> {
  const data = await readPublic<{ contributors: PublicContributorCard[] }>(
    "/v1/public/openproduct/contributors",
    fetchImpl,
  );
  return data ? (data.contributors ?? []) : null;
}

/**
 * DS4 — the ADDRESS of every public profile, for the sitemap.
 *
 * Handles and dates. Not a people directory: a public endpoint returning
 * every contributor's name and biography would be a scrapeable database
 * assembled from pages people published one at a time, which is a materially
 * different thing from what any of them agreed to. CG2 builds the human-
 * facing directory, and it will read the profiles it shows.
 *
 * `null` means the read failed and is NOT an empty list — the sitemap route
 * distinguishes them, because a sitemap that quietly drops every profile when
 * the API blinks tells crawlers those pages were removed.
 */
export async function fetchPublicPeople(
  fetchImpl?: PublicFetch,
): Promise<Array<{ handle: string; publishedAt: string }> | null> {
  const data = await readPublic<{ people: Array<{ handle: string; publishedAt: string }> }>(
    "/v1/public/openproduct/people",
    fetchImpl,
  );
  return data ? (data.people ?? []) : null;
}

/**
 * What a visitor sees where a maintainer has not named a person. PP's
 * discipline: a written fallback, never a raw subject id and never an endless
 * skeleton.
 */
export const MAINTAINER_FALLBACK_LABEL = "A maintainer";

export function maintainerLabel(displayName: string | null): string {
  const name = (displayName ?? "").trim();
  return name.length > 0 ? name : MAINTAINER_FALLBACK_LABEL;
}

/**
 * LC1 — one week's digest.
 *
 * `null` covers three different things and the page treats them as one: a
 * week that never was (`2026-w54`), a week not yet over, and a read that
 * failed. Only the third is a failure, and distinguishing it here would buy
 * the page nothing — all three render as "there is no digest at that
 * address", which is true of all three.
 */
export async function fetchDigest(
  weekId: string,
  fetchImpl?: PublicFetch,
): Promise<Digest | null> {
  return readPublic<{ digest: Digest }>(
    `/v1/public/openproduct/digest/${encodeURIComponent(weekId)}`,
    fetchImpl,
  ).then((data) => data?.digest ?? null);
}

/** LC1 — the weeks that held something. `null` is a failed read, and the
 *  index distinguishes it from an empty archive (the OD5 finding). */
export async function fetchDigestWeeks(fetchImpl?: PublicFetch): Promise<string[] | null> {
  const data = await readPublic<{ weeks: string[] }>(
    "/v1/public/openproduct/digest",
    fetchImpl,
  );
  return data?.weeks ?? null;
}

/** LC4 — the published collections, most recent first. `null` is a failed
 *  read, which the index renders differently from an empty one. */
export async function fetchCollections(
  fetchImpl?: PublicFetch,
): Promise<CollectionCard[] | null> {
  const data = await readPublic<{ collections: CollectionCard[] }>(
    "/v1/public/openproduct/collections",
    fetchImpl,
  );
  return data?.collections ?? null;
}

/** LC4 — one collection, with the items that are public right now, in the
 *  curator's order. Null when it is not published or its curator no longer
 *  resolves; the two are deliberately indistinguishable. */
export async function fetchCollection(
  slug: string,
  fetchImpl?: PublicFetch,
): Promise<PublicCollection | null> {
  return readPublic<{ collection: PublicCollection }>(
    `/v1/public/openproduct/collections/${encodeURIComponent(slug)}`,
    fetchImpl,
  ).then((data) => data?.collection ?? null);
}

/**
 * TS5 — the transparency record.
 *
 * `null` is a failed read and the page renders it as one, which matters more
 * here than anywhere else on the estate: a transparency page that quietly
 * showed zeroes when it could not reach the database would be publishing the
 * single most flattering possible number by accident.
 */
export async function fetchTransparency(
  fetchImpl?: PublicFetch,
): Promise<{ transparency: TransparencyReport; windowDays: number } | null> {
  return readPublic<{ transparency: TransparencyReport; windowDays: number }>(
    "/v1/public/openproduct/transparency",
    fetchImpl,
  );
}

// OB4 / OB7 — `fetchFeed` and `fetchLeaderboard` lived here. The front page
// stopped drawing the week's board at OB4 and the leaderboard folded into the
// Upvoted order at OB7, so neither read had a caller left. Core still serves
// both documents; the day's own board reads its own (`fetchBoard`).


/**
 * MP0 — a maker's page, header and one tab, as ONE document.
 *
 * The tab is part of the address rather than a query parameter, so the page
 * stays cacheable: a Next page that reads `searchParams` is dynamic, its
 * `revalidate` is silently ignored, and every response goes out `no-store`.
 * UV2 shipped that mistake once and the budget lane caught it; this is the
 * most linked-to surface on the estate and it must not happen here.
 */
export async function fetchMakerPage(
  handle: string,
  tab: MakerTab,
  /** PE1 — the history page before a moment; null for the first page. */
  before: string | null = null,
  fetchImpl?: PublicFetch,
): Promise<MakerDocument | null> {
  const qs = before ? `?before=${encodeURIComponent(before)}` : "";
  return readPublic<MakerDocument>(
    `/v1/public/openproduct/people/${encodeURIComponent(handle)}/tab/${tab}${qs}`,
    fetchImpl,
  );
}

export interface MakerDocument {
  /** The SAME projection `/people/{handle}` serves, so the header on a maker
   *  page and the header CG1 published cannot become two different people. */
  contributor: PublicContributor;
  tab: MakerTab;
  counts: MakerCounts;
  /** The rows of ONE tab. Three shapes rather than one with two thirds of its
   *  fields null, so an absent fact and an inapplicable one stay different
   *  things (OPC-C). */
  rows: readonly (MakerLaunch | MakerUpvote | MakerComment | MakerHistoryEntry)[];
  /** PE1 — the moment the next history page is before, or null on the last. */
  nextCursor: string | null;
  /** PE2 — what the person's marks are derived from. */
  marks: MakerMarkInputs;
  observedAt: string;
}

/** TP0 — every topic a live listing has chosen, with its product count. */
export async function fetchTopics(fetchImpl?: PublicFetch): Promise<TopicsDocument | null> {
  return readPublic<TopicsDocument>("/v1/public/openproduct/topics", fetchImpl);
}

/**
 * SR0 — the search results page's one read.
 *
 * THE SAME ENDPOINT THE PALETTE USES, widened rather than duplicated: one
 * ranking, one eligibility rule, one place where "what does search look at"
 * is decided. A second endpoint for the page would be a second answer to that
 * question, and the two would drift.
 *
 * `null` is a failed read and NOT an empty result — the page tells them apart
 * (OD5), because "we could not search" and "nothing matched" ask a visitor to
 * do completely different things.
 */
export async function fetchSearch(
  query: string,
  fetchImpl?: PublicFetch,
): Promise<SearchDocument | null> {
  return readPublic<SearchDocument>(`/v1/search?q=${encodeURIComponent(query)}`, fetchImpl);
}

export interface SearchDocument {
  query: string;
  /** Products, ranked by the published `search.relevance`. */
  results: Array<{
    kind: string;
    entityId: string;
    title: string;
    summary: string | null;
    matched: string;
    /** openproduct-studio OSD3 — a product hit's logo, else null. */
    thumbnail: MediaThumbnail | null;
  }>;
  /** SR0 — public profiles, read live so the eligibility rule cannot go stale
   *  in the direction "still findable after they turned it off". */
  makers: SearchMakerHit[];
  /** SR0 — matched against the contract's own vocabulary; no read at all. */
  topics: SearchTopicHit[];
}

export interface TopicsDocument {
  /** FL0 — each card gains its follower count, honest at zero now that
   *  something observes a follow. */
  topics: Array<TopicCard & { followers: number }>;
  meaning: string;
  windowDays: number;
}

/** TP0 — one topic. `null` covers both a failed read and a topic nobody has
 *  chosen; the page 404s on the second, which core answers with a 404 too. */
export async function fetchTopic(
  value: string,
  fetchImpl?: PublicFetch,
): Promise<TopicDocument | null> {
  return readPublic<TopicDocument>(
    `/v1/public/openproduct/topics/${encodeURIComponent(value)}`,
    fetchImpl,
  );
}

export interface TopicDocument extends Topic {
  windowDays: number;
  meaning: string;
  emptyNote: string;
  /** FL0 — counted, never listed. */
  followers: number;
}

/** LC3 — one day's board, already ordered by core. `null` is a failed read,
 *  which the page renders differently from a quiet day (the OD5 finding). */
export async function fetchBoard(
  dayId: string,
  fetchImpl?: PublicFetch,
): Promise<{ day: string; open: boolean; observedAt: string | null; board: BoardEntry[] } | null> {
  return readPublic<{ day: string; open: boolean; observedAt: string | null; board: BoardEntry[] }>(
    `/v1/public/openproduct/launches/${encodeURIComponent(dayId)}`,
    fetchImpl,
  );
}

/** LC3 — the days that hold a board, most recent first. */
export async function fetchBoardDays(
  fetchImpl?: PublicFetch,
): Promise<Array<{ day: string; launches: number }> | null> {
  const data = await readPublic<{ days: Array<{ day: string; launches: number }> }>(
    "/v1/public/openproduct/launches",
    fetchImpl,
  );
  return data?.days ?? null;
}

/**
 * A listing's discussions (CB1). Anonymous and edge-cached like every other
 * public read: the tab is the same document for everybody, which is what
 * lets it be one cacheable page (OPC-1) and keeps I6.
 */
export async function fetchThreads(
  slug: string,
  tag?: string | null,
  fetchImpl?: PublicFetch,
): Promise<PublicThread[] | null> {
  return fetchDiscussion(slug, tag, fetchImpl).then((data) => data?.threads ?? null);
}

/**
 * DQ0b — a listing's discussions AND its comment section, in one read.
 *
 * The product page draws both, and two endpoints would have made the most-read
 * page on the estate pay a third round trip to fill one section — and let the
 * two answers disagree about which threads exist.
 *
 * `launch` is null when nobody has commented, which is a STATE and not a
 * failure: the thread is written by the first person who says something, so a
 * quiet product simply has none.
 */
export async function fetchDiscussion(
  slug: string,
  tag?: string | null,
  fetchImpl?: PublicFetch,
): Promise<DiscussionDocument | null> {
  const query = tag ? `?tag=${encodeURIComponent(tag)}` : "";
  return readPublic<DiscussionDocument>(
    `/v1/public/openproduct/projects/${encodeURIComponent(slug)}/threads${query}`,
    fetchImpl,
  );
}

export interface DiscussionDocument {
  threads: PublicThread[];
  launch: { thread: PublicThread; posts: PublicPost[] } | null;
}

/** FO1 — the forum index, for one order and an optional category. */
export async function fetchForum(
  order: ForumOrder,
  tag: ChosenThreadTag | null,
  fetchImpl?: PublicFetch,
): Promise<Forum | null> {
  const query = new URLSearchParams();
  if (order !== "latest") query.set("order", order);
  if (tag) query.set("tag", tag);
  const qs = query.size > 0 ? `?${query.toString()}` : "";
  return readPublic<Forum>(`/v1/public/openproduct/threads${qs}`, fetchImpl);
}

export async function fetchThread(
  id: string,
  fetchImpl?: PublicFetch,
): Promise<{ thread: PublicThread; posts: PublicPost[] } | null> {
  return readPublic<{ thread: PublicThread; posts: PublicPost[] }>(
    `/v1/public/openproduct/threads/${encodeURIComponent(id)}`,
    fetchImpl,
  );
}

/**
 * The sweep, as the gateway assesses it (openproduct-worldclass-v2 LI3).
 *
 * `/health` is the gateway's own liveness document — anonymous, computed by
 * nobody the page could name, and the same read a deploy gate or a synthetic
 * would make. `/docs/checks` renders its `sweep` block so what runs
 * automatically is a page a visitor can read rather than a document only an
 * operator opens. A null is "could not be asked", and the page says so
 * rather than inventing a state (RS1's third answer, kept).
 */
export interface SweepDocument {
  readonly sweep: SweepHealth;
  /** OO3 — which build is answering: the Worker version and its upload moment;
   *  null on a gateway deployed before it was reported, or one without the binding. */
  readonly build: BuildInfo | null;
  /** LI4 — the outward phase's budget; null on a gateway deployed before it was reported. */
  readonly ingestion: IngestionBudget | null;
  /** MD4 — whether this environment captures screenshots, and its budget;
   *  null on a gateway deployed before it was reported. */
  readonly screenshots: ScreenshotBudget | null;
}

export async function fetchSweepHealth(fetchImpl?: PublicFetch): Promise<SweepDocument | null> {
  const data = await readPublic<{
    build?: BuildInfo;
    checks?: { sweep?: SweepHealth; ingestion?: IngestionBudget; screenshots?: ScreenshotBudget };
  }>("/health", fetchImpl);
  const sweep = data?.checks?.sweep;
  if (!sweep || !Array.isArray(sweep.phases)) return null;
  const ingestion = data?.checks?.ingestion;
  const screenshots = data?.checks?.screenshots;
  const build = data?.build;
  return {
    sweep,
    build: build && typeof build === "object" && "version" in build ? build : null,
    ingestion: ingestion && typeof ingestion.authenticated === "boolean" ? ingestion : null,
    screenshots: screenshots && typeof screenshots.configured === "boolean" ? screenshots : null,
  };
}
