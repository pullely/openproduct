// The endorsement (openproduct-commons EN0).
//
// THIS MODULE'S REASON TO EXIST IS A DISTINCTION, not a feature. OPC-3 makes
// a save and an endorsement TWO OBJECTS:
//
//   a save        private. Nobody else ever learns of it. Counted nowhere.
//   an endorsement public. It has your name on it and it moves a number.
//
// The two are one keystroke apart in every UI that has ever shipped them
// together, and merging them is the accident this program keeps refusing to
// make. `saved_products` is not widened, not counted, not migrated — every
// row in it was created under a promise that nobody would ever see it, and
// counting them now would retroactively publish a private gesture made by
// people who cannot be asked and did not agree (EN-1).
//
// NOTHING HERE IS ROUTED. EN0 ships the shapes; EN1 brings the act and EN2
// the numbers. Shipping the contract first is deliberate: the integrity model
// (EN3) has to fit a shape agreed before anybody had a total they wanted to
// protect.

/**
 * What an endorsement is, at rest.
 *
 * `pending` is TS1's trust floor expressed without throwing anything away: a
 * subject below the floor may endorse, the act is recorded, and it simply
 * does not count yet. Refusing the click instead would discard a newcomer's
 * honest gesture and teach them the button is broken; recording it means it
 * counts the moment they clear.
 */
export const ENDORSEMENT_STATES = ["confirmed", "pending"] as const;
export type EndorsementState = (typeof ENDORSEMENT_STATES)[number];

export interface Endorsement {
  readonly slug: string;
  readonly state: EndorsementState;
  readonly createdAt: string;
  /** Set on withdrawal, cleared on re-endorsement. The row is never deleted. */
  readonly withdrawnAt: string | null;
}

export const ENDORSEMENT_KEYS = ["createdAt", "slug", "state", "withdrawnAt"] as const;

/**
 * WHAT THE ACT IS, IN THE WORDS THE BUTTON USES.
 *
 * Rendered beside the control, not buried in a help page. The single most
 * likely failure of this whole sub-epic is somebody clicking `▲` believing it
 * is a private bookmark, and the remedy is one sentence in the place they are
 * looking.
 *
 * THE WORD IS `UPVOTE` AND THE OBJECT IS AN ENDORSEMENT (openproduct-launch
 * OL-1, R3). Those are not in tension: an upvote IS an endorsement — one row,
 * one act, one integrity discount — and the surface calls it the shorter
 * word because the design does and because the longer one asked a stranger to
 * learn a term before they could press a button.
 *
 * What did NOT change, and this is deliberate everywhere in this file: the
 * table, the type names, the metric key and the formula id. A rename that
 * reached those would have been a migration pretending to be a copy edit.
 */
export const ENDORSEMENT_MEANING =
  "An upvote is public and has your name on it. To keep something for yourself, save it instead — a save is private and is counted nowhere.";

/** The two words the control wears. Here rather than in the component, so the
 *  feed row and the product page cannot end up saying different things about
 *  the same act. */
export const UPVOTE_LABEL = "Upvote";
export const UPVOTED_LABEL = "Upvoted";

/**
 * The sentence a ranked surface owes its reader about the number it ordered by
 * (OPC-4). Links to `endorsements.total` at `/docs/formulas`, which is the
 * published prose behind it.
 */
export const UPVOTE_DISCOUNT_NOTE = "Upvotes shown after the integrity discount";

/** The private half's counterpart sentence, for the same reason. */
export const SAVE_MEANING =
  "A save is private. Only you can see it, and it appears in no count anywhere.";

// ---------------------------------------------------------------------------
// The public total
// ---------------------------------------------------------------------------

/**
 * The public total, as a wire shape.
 *
 * `Fact<number>` at the API (CT2's rule): it is DERIVED, by a formula with
 * published prose, because a number that decides what a reader sees owes them
 * a sentence (OPC-4). `endorsements.total` is that sentence.
 *
 * DISCOUNTED AND RAW ARE NOT BOTH PUBLISHED. Only the discounted figure is,
 * and the difference is disclosed in aggregate in the transparency report and
 * never per listing — publishing both per listing would let anybody compute
 * exactly which listings we discounted and by how much, which is an
 * accusation about a specific product's supporters, made in public, by
 * arithmetic.
 */
export interface EndorsementTotal {
  /** Distinct non-withdrawn, non-discounted endorsing subjects. */
  readonly total: number;
  /** Added in the trailing seven days and not since withdrawn. */
  readonly recent: number;
}

export const ENDORSEMENT_TOTAL_KEYS = ["recent", "total"] as const;

/**
 * What a listing's `▲` renders when nobody has endorsed it.
 *
 * ZERO IS THE HONEST ANSWER HERE, and this is the one place in the whole
 * program where that is true — which is worth saying out loud, because
 * everywhere else (SN2's metrics, CG5's profile stats) a zero is forbidden.
 *
 * The difference: an unobserved METRIC means nobody looked. A total of zero
 * means we looked at a complete record and found nothing — the record is the
 * endorsements table, we have all of it, and "nobody has upvoted this yet" is
 * a true and useful thing to tell a reader. Absence here would be a coyness
 * that helps nobody.
 */
export const ENDORSEMENT_EMPTY_NOTE = "no one yet";

/**
 * What the `▲` count means, where a reader hovers it (EN2).
 *
 * Says the two things a number on a card cannot say for itself: that it is
 * people rather than points, and that it is a discounted figure rather than a
 * raw tally. The second matters because somebody comparing a listing's total
 * against the endorsements they can see would otherwise conclude we cannot
 * count.
 */
export const ENDORSEMENT_TOTAL_TITLE =
  "People who upvoted this and have not withdrawn, after the integrity discount. One person counts once.";

/**
 * What the dash means, and why it is not a zero
 * (openproduct-worldclass VC3).
 *
 * OPC-C is the rule that a zero is a claim: `0` says *we counted, and found
 * nobody*, while `—` says *we have not counted*. Keeping them apart is one of
 * the most defensible things this product does, and on 7 Sep it was rendered
 * as one listing showing `0` and the one beside it showing `—`, with **no
 * explanation anywhere on the page** — the box's `title` was literally
 * `undefined` for exactly the case that needed one.
 *
 * A distinction a reader cannot see is not a distinction; it is a
 * typographical inconsistency, and it reads as a bug in a product whose whole
 * pitch is that its numbers are trustworthy.
 */
export const ENDORSEMENT_UNCOUNTED_TITLE =
  "Not counted yet. The daily sweep publishes a total once the day closes — this is not zero upvotes, it is no measurement.";

/**
 * The same fact, said once under the list.
 *
 * The tooltip only reaches somebody who hovers a 58px box and waits, which is
 * nobody on a phone and nobody in a hurry. The legend is what actually answers
 * the question, for everybody, without being asked — so the tooltip is the
 * detail and this is the explanation.
 */
export const UNCOUNTED_LEGEND = "— means not counted yet, which is not the same as zero.";

/**
 * Does this endorsement count toward the public total?
 *
 * One function, so the recompute, the API and any future backfill cannot
 * disagree about what a total means. Three ways not to count, and they are
 * different things:
 *
 *   withdrawn   the person took it back
 *   pending     they have not cleared TS1's floor
 *   discounted  the integrity model's opinion (EN-4), which the person is
 *               never told and never implicitly accused of
 */
export function countsTowardTotal(input: {
  readonly state: EndorsementState;
  readonly withdrawnAt: string | null;
  readonly discounted: boolean;
}): boolean {
  return input.withdrawnAt === null && input.state === "confirmed" && !input.discounted;
}

/**
 * What state a new endorsement starts in, given the endorser's trust level
 * (openproduct-commons EN1, gated on TS1).
 *
 * ONE FUNCTION, because the difference between "recorded" and "counted" is
 * the kind of rule that grows a second, disagreeing copy the moment a second
 * caller needs it — and the two copies disagreeing means somebody's
 * endorsement counts on one surface and not another.
 *
 * `restricted` still ENDORSES. That looks wrong for about a second: the point
 * of restriction is that a person's public writes wait for review, not that
 * their opinion is deleted. A `pending` row is the honest record of what they
 * did, it moves no number, and it is there to count if the restriction is
 * lifted or appealed.
 */
export function endorsementStateFor(
  level: "new" | "established" | "trusted" | "restricted",
): EndorsementState {
  return level === "established" || level === "trusted" ? "confirmed" : "pending";
}
