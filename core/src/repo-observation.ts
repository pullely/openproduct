// What a repository read says, as the row stores it (openproduct-open-builds OB2).
//
// Two doors write `profiles.repo_*`: the maintainer's check (PUT
// /repo-observation, since OX3) and, from OB2, the hourly sweep's observation
// (POST /internal/openproduct/signals/observation). Both carry the gateway's
// `RepoObservation` shape, and both must read it with the same fail-closed
// posture — so the reading lives here once rather than twice and drifting.
//
// FAIL CLOSED. Anything that is not exactly "public" is private, because this
// value is what lets a page become readable by anyone. A private repository
// observes none of the descriptive columns: its words are not ours to repeat
// on a public listing, and the gateway already declines to send them.

import type { RepoObservation } from "@openproduct/db";

export interface ReadRepoObservation {
  /** Whether the body named a linked repository at all. */
  readonly linked: boolean;
  readonly observation: RepoObservation;
}

export function readRepoObservation(
  body: Record<string, unknown>,
  observedAt: string,
): ReadRepoObservation {
  const linked = body.linked === true;
  const visibility = linked && body.visibility === "public" ? "public" : "private";
  const licence = typeof body.licence === "string" && body.licence.length > 0 ? body.licence : null;
  const open = linked && visibility === "public";

  // IN2 — WHITESPACE IS COLLAPSED HERE, not only trimmed. A GitHub
  // description can carry newlines and runs of spaces, and this column is
  // rendered; core is the one place both writers cross.
  const observedText = (value: unknown, max = 500): string | null => {
    if (!open || typeof value !== "string") return null;
    const collapsed = value.replace(/\s+/g, " ").trim();
    return collapsed.length > 0 ? collapsed.slice(0, max) : null;
  };
  // A moment, parsed rather than pattern-matched — what matters is whether it
  // IS one, and `Date` is the answer to that question.
  const observedInstant = (value: unknown): string | null => {
    if (!open || typeof value !== "string") return null;
    const at = Date.parse(value);
    return Number.isNaN(at) ? null : new Date(at).toISOString();
  };
  // A count. Bounded and non-negative, because it is rendered and it comes
  // from somewhere we do not control.
  const observedCount = (value: unknown): number | null => {
    if (!open || typeof value !== "number" || !Number.isFinite(value)) return null;
    const n = Math.trunc(value);
    return n >= 0 && n <= 1_000_000 ? n : null;
  };
  const observedTopics =
    open && Array.isArray(body.topics)
      ? body.topics
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0 && t.length <= 64)
          .slice(0, 20)
      : null;

  return {
    linked,
    observation: {
      // An unlinked project records "no repository": NULL, which blocks
      // nothing and is still distinct from `private`, which does.
      repoVisibility: linked ? visibility : null,
      repoLicence: linked ? licence : null,
      observedAt,
      repoName: observedText(body.name),
      repoDescription: observedText(body.description),
      repoTopics: observedTopics,
      // PV0 — the rest of the observed row, read the same way.
      repoLanguage: observedText(body.language, 64),
      repoPushedAt: observedInstant(body.pushedAt),
      repoOpenIssues: observedCount(body.openIssues),
    },
  };
}
