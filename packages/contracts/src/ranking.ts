// The published orders, as code (openproduct-commons DS4).
//
// THIS MODULE EXISTS BECAUSE OF A NEAR-MISS. DS2 shipped three sort orders
// with published sentences at `/docs/formulas`, and implemented them inline
// in the directory island — which was fine while the directory was the only
// thing that ordered listings. DS4 adds a second: the "similar products"
// panel, whose formula says "ordered by merged changes in the trailing seven
// days", which is `sort.most-active` in different words.
//
// Two implementations of one published sentence is the failure mode OPC-4 is
// built to prevent, and it is a quiet one: the two agree on the day they are
// written and drift on the day somebody fixes a tiebreak in one of them. A
// reader then has a sentence at `/docs/formulas` that is true of one panel
// and false of the other, with no way to tell which.
//
// So the comparators live HERE, once, and every surface that orders listings
// imports them. A test asserts the directory does not define its own.
//
// WHAT IS DELIBERATELY NOT HERE: anything about who is looking. These
// functions take listings and a clock and nothing else — no subject, no
// session, no history. That is OPC-1 (the page is one cacheable document) and
// OPC-4 (a ranking a reader cannot reproduce from published prose is not one
// we will ship) enforced by the signature rather than by discipline.

import type { PublicProfileCard } from "./index.js";

/**
 * Observed merges in the trailing week, or NULL when nobody has looked.
 *
 * Never 0 for "unknown". The distinction is the whole of OPC-C: a project
 * nobody has measured has not told us it is inactive, and ordering it as a
 * zero would give a live project a dead one's position on the strength of our
 * own failure to observe it.
 */
export function mergesOf(card: PublicProfileCard): number | null {
  const metric = card.metrics.find((m) => m.key === "merges.7d");
  return metric ? metric.value : null;
}

/** The observed last touch in ms, or null when nothing observed it. */
export function lastTouchedMsOf(card: PublicProfileCard): number | null {
  const metric = card.metrics.find((m) => m.key === "last_touched.all");
  return metric ? metric.value * 1000 : null;
}

/**
 * `sort.newest` — first published, most recent first.
 *
 * Also the tiebreak `sort.most-active` names for listings nobody has
 * measured, which is why it is exported rather than inlined: the tiebreak is
 * part of the published sentence, so it is part of the contract.
 */
export function byNewest(a: PublicProfileCard, b: PublicProfileCard): number {
  return Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0");
}

/**
 * The tiebreak (openproduct-scale OS1, OS-C): two listings with the same
 * activity and the same publication instant are ordered by slug, by code
 * unit — the same comparison SQL makes under `COLLATE "C"`, so a page
 * boundary that falls between them falls in the same place on both sides.
 * It was always true, by the directory read's own ORDER BY and a stable
 * sort; it was never said. Now it is said here and in the sentence.
 */
export function bySlug(a: PublicProfileCard, b: PublicProfileCard): number {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/**
 * Counted upvotes in the trailing week (`endorsements.7d`: after the
 * integrity discount), or 0 when no count has been published yet.
 *
 * ZERO HERE IS A DECLARED RULE, not a coerced absence, and the sentence says
 * it: upvotes are openproduct's own count over its own complete table, so
 * "not counted yet" can only mean the recompute has not run — and the
 * catalogue tick re-counts every listed build before it orders them (OB3).
 * A build is never pushed down for our bookkeeping; it is ranked on its
 * changes alone until its count lands.
 */
export function recentEndorsementsOf(card: PublicProfileCard): number {
  const metric = card.metrics.find((m) => m.key === "endorsements.7d");
  return metric ? metric.value : 0;
}

/**
 * `sort.most-active`'s number (openproduct-open-builds OB3, D2):
 *
 *     (merges.7d + 1) × (endorsements.7d + 1)
 *
 * A product, so a build needs both work and interest to lead: a hundred
 * merges nobody wants and a hundred upvotes on a repo nobody touches both
 * lose to steady work people are asking for. Each term plus one so a zero on
 * either side does not erase the other. NULL — never a number — when the
 * changes are not observed: there is no `C` to multiply (OPC-C).
 */
export function mostActiveScoreOf(card: PublicProfileCard): number | null {
  const merges = mergesOf(card);
  if (merges === null) return null;
  return (merges + 1) * (recentEndorsementsOf(card) + 1);
}

/**
 * The one integer the catalogue orders and pages by: the score, then merged
 * changes as its tiebreak, folded so a keyset cursor still needs only three
 * keys (OS-1). `score × 1000 + changes` sorts exactly like (score, changes)
 * because a week's changes are bounded below 1000 — the sweep reads one page
 * of 100 commits and the per-contributor cap only lowers it — and the fold
 * clamps at 999 regardless, so a malformed observation can never reach into
 * the next score. SQL computes the same expression (`repository.ts`).
 */
export const MOST_ACTIVE_FOLD = 1000;

export function mostActiveKeyOf(card: PublicProfileCard): number | null {
  const score = mostActiveScoreOf(card);
  if (score === null) return null;
  return score * MOST_ACTIVE_FOLD + Math.min(mergesOf(card) ?? 0, MOST_ACTIVE_FOLD - 1);
}

/**
 * `sort.most-active` — merged changes times counted upvotes over the trailing
 * seven days, each plus one, highest first (OB3).
 *
 * FOUR RULES, ALL OF THEM PUBLISHED (read the sentence at
 * `/docs/formulas#sort-most-active` beside this):
 *
 *   1. The score, descending.
 *   2. A listing whose changes are NOT observed is ordered LAST — never as
 *      zero, and never interleaved with listings that were measured and
 *      found quiet. The two mean different things and this order says so.
 *   3. Ties go to more merged changes: of two builds people want equally,
 *      the one doing more work leads.
 *   4. Then `sort.newest`, then the address. On a young catalog almost
 *      nothing is observed yet, so an alphabetical fallback would make the
 *      default order an accident of naming.
 */
export function byMostActive(a: PublicProfileCard, b: PublicProfileCard): number {
  const ak = mostActiveKeyOf(a);
  const bk = mostActiveKeyOf(b);
  if (ak === null && bk === null) return byNewest(a, b) || bySlug(a, b);
  if (ak === null) return 1;
  if (bk === null) return -1;
  return bk - ak || byNewest(a, b) || bySlug(a, b);
}

/**
 * The published endorsement total, or NULL when there is none to read.
 *
 * Null and zero are different here, and the difference is the one this whole
 * program keeps making: zero means we counted a complete record and found
 * nobody, which is a real and useful answer; null means the recompute has not
 * run or has gone stale past its window, which is us not knowing.
 */
export function endorsementsOf(card: PublicProfileCard): number | null {
  const metric = card.metrics.find((m) => m.key === "endorsements.total");
  return metric ? metric.value : null;
}

/**
 * `sort.most-saved` — distinct non-withdrawn, non-discounted endorsers,
 * highest first.
 *
 * THE UNKNOWN GOES LAST, NOT AS ZERO, exactly as `sort.most-active` does —
 * but for a subtly different reason worth writing down, because the two look
 * identical and are not. An unmeasured repository has told us nothing about
 * its activity. An unpublished endorsement total means OUR recompute is
 * behind, which is our failure rather than the listing's, and ordering a
 * listing last for our own bookkeeping problem would be a punishment nobody
 * earned. Last is still the honest position — we cannot claim a rank we
 * cannot compute — and `sort.newest` breaks the tie among them so the order
 * is not an accident of naming.
 *
 * A GENUINE ZERO IS NOT UNKNOWN and sorts above it: "nobody has endorsed this
 * yet" is a complete answer about a listing we did count.
 */
export function byMostEndorsed(a: PublicProfileCard, b: PublicProfileCard): number {
  const ae = endorsementsOf(a);
  const be = endorsementsOf(b);
  if (ae === null && be === null) return byNewest(a, b);
  if (ae === null) return 1;
  if (be === null) return -1;
  return be - ae || byNewest(a, b);
}

// `SIMILAR_LIMIT` and `similarTo` lived here until PV2 replaced them with
// `alternatives.ts`. The published sentence at
// `/docs/formulas#similar-same-category-then-active` STAYS — it is a public
// address the panel linked from, and a rule that vanishes leaves anybody who
// followed that link with no way to find out what they had been shown. Its
// entry in `FORMULAS` now says it was superseded and by what.

