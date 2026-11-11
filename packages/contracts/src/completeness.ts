// The completeness meter, and the floor (openproduct-worldclass IN3).
//
// TWO THINGS THAT LOOK LIKE ONE, AND MUST NOT BECOME ONE. WC-D's answer is
// the whole design brief and it separates them by name:
//
//   THE METER is advice to the maker. It renders in the studio, over their
//   own draft, and it orders nothing anywhere. It is never projected onto a
//   public surface.
//
//   THE FLOOR is an eligibility rule. A listing without a tagline and a topic
//   is not shown on the front page's catalogue — and it is NOT RANKED LOWER.
//   It either clears the bar or it is absent.
//
// ─── WHY A FLOOR AND NOT A WEIGHT ────────────────────────────────────────
//
// The audit asked for the other thing: *"show a completeness meter — listings
// that fill it rank better, and say so."* "And say so" satisfies OPC-4's
// letter, because the rule would be published. It strains its spirit. OPC-4
// exists because a directory that decides who is seen holds power over people
// who chose to build in the open specifically to escape opaque intermediaries,
// and *"the listing with more marketing collateral ranks higher"* reads
// exactly like the thing that audience left.
//
// An eligibility rule is a different KIND of rule, and three properties are
// why it survives where a weight does not:
//
//   1. IT NEVER DEMOTES ANYBODY. A weight reorders complete listings against
//      each other; a floor removes listings that are not ready and leaves
//      every remaining order untouched. `frontPageEligible` is a filter, and
//      a filter preserves the relative order of what it keeps — which is
//      asserted rather than assumed, because that assertion IS the milestone.
//   2. IT CANNOT COMPOUND. A listing clears the bar or it does not, and
//      clearing it twice buys nothing. There is no incentive to decorate.
//   3. IT IS ONE PUBLISHED SENTENCE, at `catalog.front-page-floor`, that a
//      reader can check against what they are looking at.
//
// ─── WHY THE COUNTED SET IS SO SHORT ─────────────────────────────────────
//
// A COUNTED ITEM MUST BE SOMETHING EVERY LISTING COULD TRUTHFULLY FILL. This
// is the rule that decided the list, and it removed most of the obvious
// candidates:
//
//   `liveUrl`     a CLI tool is not hosted anywhere
//   `installLine` a hosted product is not installed
//   `repoUrl`     a founder may list before the code has a home — which is
//                 why `repo_unlinked` was retired as a publish blocker
//   `roleOpenings` a solo maker may want no help, and that is not a gap
//   `media`       the store is still being built
//
// An item that cannot apply is a gap the maker can never close, and a meter
// full of those stops being advice and becomes nagging. Those fields are
// still worth having and the studio still asks for them; they are simply not
// counted against anybody.
//
// ─── A COUNT, NOT A PERCENTAGE, AND NEVER A SCORE ────────────────────────
//
// WC-E answered this same question for launch health — *"a checklist, not a
// score. There is no number."* — and the reasoning carries: a percentage says
// "you are 60% of a product", which is a judgement about somebody's work,
// while "4 of 6 filled in" is a fact about a form. A checklist cannot be
// sorted into a ranking and cannot be mistaken for an opinion; a score can be
// both, and the first person to sort by it makes it both.
//
// So there is no composite, no total out of ten, and no percentage anywhere
// in this module — and nothing here is exported as a comparator.

import type { FormulaId } from "./provenance.js";

/**
 * The fields the meter counts, in the order the studio walks them.
 *
 * Each is something EVERY listing could truthfully fill — see the header for
 * the five candidates that rule removed.
 */
export const COMPLETENESS_FIELDS = [
  "tagline",
  "pitch",
  "category",
  "hosting",
  "pricing",
  "stack",
  "maintainers",
] as const;
export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number];

/** What each field is called where a maker can act on it. */
export const COMPLETENESS_LABEL: Record<CompletenessField, string> = {
  tagline: "A one-line description",
  pitch: "The pitch",
  category: "A topic",
  hosting: "How it runs",
  pricing: "What it costs to use",
  stack: "What it is built with",
  maintainers: "At least one maintainer shown",
};

/** Which studio step fills each field, so the meter can point somewhere. */
export const COMPLETENESS_STEP: Record<CompletenessField, "details" | "topics" | "people"> = {
  tagline: "details",
  pitch: "details",
  category: "topics",
  hosting: "topics",
  pricing: "topics",
  stack: "topics",
  maintainers: "people",
};

/**
 * The two the FRONT PAGE requires, and nothing else.
 *
 * A listing needs a sentence saying what it is and a topic saying where it
 * sits. Both are the minimum a reader needs to decide whether to click, which
 * is the only thing the front page is for — and both are one field each, so
 * a listing kept off is one edit away rather than a project.
 *
 * DELIBERATELY NOT THE WHOLE METER. The floor and the meter are different
 * rules with different audiences (see the header), and a floor that demanded
 * everything the meter asks for would be a weight with a threshold.
 */
export const FLOOR_FIELDS: readonly CompletenessField[] = ["tagline", "category"];

/** The published rule the floor answers to. */
export const FLOOR_FORMULA: FormulaId = "catalog.front-page-floor";

/** The shape either surface reads a listing through. */
export interface CompletenessSubject {
  readonly tagline?: string | null;
  readonly pitch?: string | null;
  readonly category?: string | null;
  readonly hosting?: string | null;
  readonly pricing?: string | null;
  readonly stack?: readonly string[] | null;
  readonly maintainers?: readonly unknown[] | null;
}

/** Whether one field is filled. Whitespace is not an answer. */
export function filled(subject: CompletenessSubject, field: CompletenessField): boolean {
  const value = subject[field];
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim().length > 0;
}

/** What the studio renders: which are filled, which are not, and how many. */
export interface Completeness {
  readonly filled: readonly CompletenessField[];
  readonly missing: readonly CompletenessField[];
  /** A COUNT, never a percentage — see the header. */
  readonly of: number;
  /** Which of the missing ones keep this listing off the front page. */
  readonly belowFloor: readonly CompletenessField[];
}

/** The meter, for one listing. */
export function completenessOf(subject: CompletenessSubject): Completeness {
  const filledFields = COMPLETENESS_FIELDS.filter((f) => filled(subject, f));
  const missing = COMPLETENESS_FIELDS.filter((f) => !filled(subject, f));
  return {
    filled: filledFields,
    missing,
    of: COMPLETENESS_FIELDS.length,
    belowFloor: FLOOR_FIELDS.filter((f) => !filled(subject, f)),
  };
}

/**
 * Whether a listing may appear in the front page's catalogue.
 *
 * A FILTER, AND THE FACT THAT IT IS A FILTER IS THE MILESTONE. It answers a
 * boolean and takes no position on order, so a listing that clears it holds
 * exactly the rank it held before this function existed. That property is
 * asserted in the tests rather than left to reading, because the failure it
 * guards against — somebody later making this return a number and sorting by
 * it — is a two-line change that would look like a refinement.
 */
export function frontPageEligible(subject: CompletenessSubject): boolean {
  return FLOOR_FIELDS.every((field) => filled(subject, field));
}

// ---------------------------------------------------------------------------
// What the studio says
// ---------------------------------------------------------------------------

export const COMPLETENESS_HEADING = "What is filled in";

/**
 * The sentence that has to be there, and the reason IN3 has a done-when about
 * it: a meter with no such line is read as a score by everybody who sees one.
 */
export const COMPLETENESS_NOTE =
  "This is a checklist for you, not a rating. Nothing here changes where your listing is ordered — the catalogue is ordered by observed activity, and filling this in does not move you up it.";

/** Said when every counted field is filled. */
export const COMPLETENESS_DONE = "Everything on this list is filled in.";

/**
 * Said when the listing is below the floor — the ONE consequence the meter
 * has, stated where the maker can act on it rather than discovered by their
 * listing quietly not appearing.
 */
export const FLOOR_NOTE =
  "Until this listing has a one-line description and a topic, it will not appear in the catalogue on the front page. It is not ranked lower — it is not listed there yet.";

/** Said when the floor is met, so its absence is never ambiguous. */
export const FLOOR_MET_NOTE = "This listing appears in the catalogue on the front page.";
