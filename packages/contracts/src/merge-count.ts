// Merged changes, counted the way the formula says (openproduct-open-builds OB2).
//
// `activity.merges.7d` and `.30d` have published one sentence since SN2:
// "changes merged into the default branch … counted once per merge and capped
// per contributor per day". Until OB2 the sweep counted every commit the
// commits API returned, uncapped, so a merge commit and the twelve commits it
// brought in were thirteen "merges", and an agent that commits a hundred times
// a day was a hundred times as active as the person reviewing it. This module
// is the sentence as code, kept pure so a test can hold every clause of it.
//
// THREE RULES, IN ORDER
//
//   1. Once per merge. Only the default branch's FIRST-PARENT history counts.
//      A pull request merged with a merge commit is one change (the merge);
//      the commits it brought in sit off the first-parent line and are not
//      counted again. A squash or a rebase lands as first-parent commits, and
//      a direct push is a change too — a solo builder who pushes to main is
//      building, and this product is for them.
//   2. Never a bot. Dependency bumps and automation are not a person building
//      (GitHub's `Bot` account type, any `[bot]` login, and the named bumpers).
//   3. Capped per contributor per UTC day. A contributor is the GitHub account
//      that authored the change, or its author email when no account matched.
//      An agent is one contributor and meets the same cap as anyone else.

/** The most changes one contributor adds to the count on one UTC day. */
export const MERGES_CAP_PER_CONTRIBUTOR_PER_DAY = 5;

/** The two windows the formulas publish, in days. */
export const MERGE_WINDOW_DAYS = { "7d": 7, "30d": 30 } as const;

/** Logins that are automation whatever their account type says. */
const BOT_LOGINS = new Set([
  "dependabot",
  "dependabot-preview",
  "renovate",
  "renovate-bot",
  "github-actions",
  "greenkeeper",
  "snyk-bot",
  "pre-commit-ci",
  "imgbot",
]);

/** One commit as the counter needs it — no message, no diff, nothing a page renders. */
export interface CommitFact {
  readonly sha: string;
  /** Parent shas in GitHub's order: the first is the first parent. */
  readonly parents: readonly string[];
  /** The authoring account's login, or its email when no account matched. */
  readonly contributor: string | null;
  readonly isBot: boolean;
  /** When the change landed on the branch (committer date), epoch ms. */
  readonly landedAt: number;
}

export interface MergeCount {
  readonly merges7d: number;
  readonly merges30d: number;
  /** Epoch seconds of the newest landed change, or null when there is none. */
  readonly lastTouchedAt: number | null;
}

/** Whether an account is automation rather than a person building. */
export function isBotAccount(login: string | null, accountType: string | null): boolean {
  if (accountType === "Bot") return true;
  if (!login) return false;
  const name = login.toLowerCase();
  return name.endsWith("[bot]") || BOT_LOGINS.has(name);
}

/**
 * Count merged changes from a commits listing whose first entry is the head
 * of the default branch (the order the commits API answers in).
 *
 * The first-parent walk follows `parents[0]` through the commits the listing
 * returned; it stops at the first parent the listing does not hold, which is
 * where the requested window (or the page) ends.
 */
export function countMergedChanges(commits: readonly CommitFact[], nowMs: number): MergeCount {
  const bySha = new Map<string, CommitFact>();
  for (const commit of commits) bySha.set(commit.sha, commit);

  const since7 = nowMs - MERGE_WINDOW_DAYS["7d"] * 86_400_000;
  const since30 = nowMs - MERGE_WINDOW_DAYS["30d"] * 86_400_000;
  const perContributorDay = new Map<string, number>();
  const seen = new Set<string>();
  let merges7d = 0;
  let merges30d = 0;
  let newest: number | null = null;

  let current = commits[0];
  while (current && !seen.has(current.sha)) {
    seen.add(current.sha);
    if (newest === null || current.landedAt > newest) newest = current.landedAt;
    if (!current.isBot && current.landedAt >= since30 && current.landedAt <= nowMs) {
      const who = (current.contributor ?? "unknown").toLowerCase();
      const day = new Date(current.landedAt).toISOString().slice(0, 10);
      const key = `${who}\u0000${day}`;
      const used = perContributorDay.get(key) ?? 0;
      if (used < MERGES_CAP_PER_CONTRIBUTOR_PER_DAY) {
        perContributorDay.set(key, used + 1);
        merges30d += 1;
        if (current.landedAt >= since7) merges7d += 1;
      }
    }
    const parent = current.parents[0];
    current = parent ? bySha.get(parent) : undefined;
  }

  return {
    merges7d,
    merges30d,
    lastTouchedAt: newest === null ? null : Math.floor(newest / 1000),
  };
}
