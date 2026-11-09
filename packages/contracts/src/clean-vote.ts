// The clean-vote mark (openproduct-worldclass PV3).
//
// EN3's integrity model already runs, already discounts, and already publishes
// what it discounted IN AGGREGATE at `/transparency`. What a reader of one
// listing has never been able to see is whether the number in front of them
// was one of the ones that needed defending. This is that, as a boolean.
//
// ─── WHAT IT IS NOT ──────────────────────────────────────────────────────
//
// It is not a count, and PV3's done-when says so: *nothing on the page reveals
// a per-listing suppression count*. EN3's fifth decision is stronger still —
// *nothing per-person is ever exposed* — and this holds both. The ratio is
// computed where the rows are, and a single `true` or `false` crosses the
// wire. `discounted` appears in no public shape, and a test asserts it.
//
// ─── THE HARD PART IS WHAT ABSENCE SAYS ──────────────────────────────────
//
// A mark shown when a listing is clean is, by construction, a mark ABSENT when
// it is not — and an absence a reader can interpret is an accusation made by a
// machine about somebody's product, in public, with no route to answer it.
// That is the shape EN3 refused for people, and it would be no better applied
// to listings.
//
// SO ABSENCE IS MADE AMBIGUOUS, DELIBERATELY, and that is the whole design.
// The mark requires BOTH a low discount ratio AND a floor of endorsements to
// have been cast at all. Below the floor there is nothing to say — a listing
// with four upvotes cannot be assessed and must not be marked either way — so
// the absent state covers two very different listings:
//
//   the one nobody has upvoted enough times to assess, which is most new
//   listings, most of the time; and
//
//   the one that was assessed and did not clear the bar.
//
// A reader looking at a listing with no mark cannot tell which, and the note
// says as much rather than leaving them to guess the worse one. **The floor is
// not a statistical nicety — it is the privacy mechanism**, and lowering it to
// "make the mark more available" would turn every absence into a finding.
//
// ─── WHY A MARK AT ALL, THEN ─────────────────────────────────────────────
//
// Because the alternative is that this product's central claim — that its
// numbers are defended — is legible only to somebody who reads
// `/transparency` and does arithmetic. A positive mark on a listing that
// earned it costs nothing and says something true. What it must never become
// is a rank input: `sort.most-saved` and the launch board read the discounted
// TOTAL, which already reflects the discount, and adding this boolean to an
// ordering would count the same defence twice.

import type { PublicProfileCard } from "./index.js";

/**
 * How many counted endorsements a listing needs before the mark can appear.
 *
 * THIS IS THE PRIVACY MECHANISM, not a confidence interval. It is what makes
 * an absent mark ambiguous between "not assessable" and "assessed and not
 * clean", and most listings on a young directory sit below it — which is the
 * point rather than a shortcoming.
 *
 * Ten, because it is high enough that the great majority of listings are
 * below it (so absence is unremarkable) and low enough that a listing with a
 * real audience reaches it.
 */
export const CLEAN_VOTE_FLOOR = 10;

/**
 * The most a listing's endorsements may be discounted and still be marked.
 *
 * A RATIO, NOT A COUNT, and never rendered as either. One discounted
 * endorsement among forty is a person who tripped a burst threshold on a busy
 * afternoon; six among forty is a pattern. The number is published at
 * `/docs/formulas` like every other rule this product orders or labels by.
 */
export const CLEAN_VOTE_MAX_RATIO = 0.05;

/** What the sweep saw for one listing. NEVER a public shape — see the header. */
export interface EndorsementIntegrity {
  /** Endorsements that counted toward the public total. */
  readonly counted: number;
  /** Endorsements the integrity model discounted. Internal, always. */
  readonly discounted: number;
}

/**
 * Does this listing carry the mark?
 *
 * Both clauses, and the floor is first because it is the one that decides most
 * listings. A listing below it returns `false` for the same reason a listing
 * over the ratio does, and nothing downstream can tell the two apart — which
 * is the property this milestone exists to preserve.
 */
export function cleanVoteMark(integrity: EndorsementIntegrity): boolean {
  const cast = integrity.counted + integrity.discounted;
  if (integrity.counted < CLEAN_VOTE_FLOOR) return false;
  if (cast === 0) return false;
  return integrity.discounted / cast <= CLEAN_VOTE_MAX_RATIO;
}

/** The mark's own words. Short: it sits beside a number, not in a paragraph. */
export const CLEAN_VOTE_LABEL = "Clean votes";

/**
 * What the mark claims, on hover and for a screen reader.
 *
 * Says what was checked and by what rule, and links nowhere a reader has to go
 * to understand it. "Verified" and "genuine" are refused for the reason
 * `INSTALL_NOTE` refuses them: this product can say what it measured, not what
 * it believes about the people involved.
 */
export const CLEAN_VOTE_TITLE =
  "This listing's upvotes were checked against the integrity model and almost none were discounted. It says nothing about any individual person.";

/**
 * WHAT AN ABSENT MARK MEANS, said out loud, wherever the mark could have been.
 *
 * The most important string in this module. Without it a reader supplies their
 * own explanation for the absence, and the one they supply is the accusation
 * this design spent a floor to avoid.
 */
export const CLEAN_VOTE_ABSENT_NOTE =
  "Most listings carry no mark: it needs enough upvotes to check. Its absence is not a finding.";

/** The published rule, at an address, like every other one. */
export const CLEAN_VOTE_FORMULA = "votes.clean" as const;

/**
 * The mark for one card, from the same two numbers the total came from.
 *
 * Takes the integrity pair rather than the card so a caller cannot accidentally
 * pass a public shape and have this quietly return `false` — a public shape
 * HAS no `discounted`, by design, and a function that accepted one would let
 * the mark silently disappear on every listing the day somebody refactored.
 */
export function cleanVoteFor(
  card: Pick<PublicProfileCard, "slug">,
  integrity: EndorsementIntegrity,
): { slug: string; clean: boolean } {
  return { slug: card.slug, clean: cleanVoteMark(integrity) };
}
