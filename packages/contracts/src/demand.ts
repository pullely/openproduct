// How many people are waiting (openproduct-commons CB2).
//
// THE MOCK'S OWN STRING IS NOT SHIPPABLE AS DRAWN, and this module is why.
// It renders `1 waiting on a decision` on an opening card. On a small opening,
// beside a visible recent-activity feed, "1 waiting" IS a name: the reader
// takes the one recent arrival and the one pending decision and joins them.
// The person who quietly offered to help a stranger's project has then been
// published as having done so, by a number nobody thought of as personal.
//
// OPC-F's rule, in three parts:
//
//   1. COUNTS ONLY, NEVER A LIST. No names, no handles, no avatars, no "and
//      2 others" — the count is the whole of what a reader gets.
//   2. FLOORED AT THREE. Below that the line is PROSE. Two people waiting and
//      three people waiting are the same fact to a maintainer deciding
//      whether to write a README; they are very different facts to somebody
//      trying to work out who applied.
//   3. NEVER JOINED TO THE ACTIVITY STREAM. Not in the SQL, not in the
//      response, not on the page. The join is the attack, so the join does
//      not exist anywhere it could be made accidentally.
//
// AND THE FLOORING HAPPENS BEFORE THE NUMBER LEAVES THE ESTATE. `chooseDemand`
// runs in core, and the wire shape carries only its result. A response that
// said `{ pending: 1 }` while the page rendered "a few" would have published
// the exact number to everybody who opened the network tab — which is the
// whole population that would ever have tried.

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------

/**
 * Three, and the number is a judgement rather than a calculation.
 *
 * At one, the count is a person. At two, it is two people and a reader who
 * knows one of them knows the other. At three the set is large enough that
 * naming any member of it is a guess, and small enough that the maintainer
 * still learns something true about demand.
 */
export const DEMAND_FLOOR = 3;

/** How long "recently" is, for the offers-this-week half. */
export const DEMAND_WINDOW_DAYS = 7;

/**
 * How old an opening must be before "nobody yet" is worth saying.
 *
 * An opening posted an hour ago has nobody waiting, and saying so reads as a
 * verdict on the product rather than a fact about the clock. After a week it
 * is information: the maintainer can act on it, and a reader considering
 * offering learns the field is open rather than crowded.
 */
export const DEMAND_QUIET_DAYS = 7;

// ---------------------------------------------------------------------------
// The shape
// ---------------------------------------------------------------------------

/**
 * What a public surface may say about demand.
 *
 * A UNION, so there is no shape in which an exact number below the floor can
 * be represented at all. A nullable `pending: number | null` would have been
 * the obvious model and it is the wrong one: it puts the dangerous value and
 * the safe value in the same field, and every consumer then has to remember
 * which is which.
 */
export type Demand =
  | { kind: "none" }
  | { kind: "quiet"; days: number }
  | { kind: "few" }
  | { kind: "counted"; pending: number };

export const DEMAND_KINDS = ["none", "quiet", "few", "counted"] as const;

/**
 * The decision, made once, server-side.
 *
 * `openedDaysAgo` is here rather than on the page because the "nobody yet"
 * branch needs it and a page computing its own age would be a second rule
 * that can drift from this one.
 */
export function chooseDemand(input: { pending: number; openedDaysAgo: number }): Demand {
  const pending = Math.max(0, Math.trunc(input.pending));
  if (pending >= DEMAND_FLOOR) return { kind: "counted", pending };
  if (pending > 0) return { kind: "few" };
  return input.openedDaysAgo >= DEMAND_QUIET_DAYS
    ? { kind: "quiet", days: Math.trunc(input.openedDaysAgo) }
    : { kind: "none" };
}

/**
 * The sentence.
 *
 * `none` renders NOTHING — not "0 waiting", not "no offers yet". A brand new
 * opening with an emptiness announced under it is a listing arguing against
 * itself, and OPC-C's rule is that absence is not zero.
 */
export function demandLine(demand: Demand): string | null {
  switch (demand.kind) {
    case "none":
      return null;
    case "quiet":
      // Says the age, because the age is what makes it information rather
      // than a verdict.
      return `Nobody yet — this opening is ${weeks(demand.days)} old.`;
    case "few":
      // The exact number is deliberately unavailable to say. "A few" is true
      // for one and for two, which is the point: the reader cannot subtract.
      return "A few people are waiting on a decision.";
    case "counted":
      return `${demand.pending} people are waiting on a decision.`;
  }
}

function weeks(days: number): string {
  if (days < 14) return "a week";
  const n = Math.floor(days / 7);
  return n >= 8 ? "a couple of months" : `${n} weeks`;
}

/** The sidebar's summary, over a whole listing rather than one opening. */
export function takingOffersLine(demand: Demand): string {
  switch (demand.kind) {
    case "counted":
      return `Taking offers · ${demand.pending} pending`;
    case "few":
      return "Taking offers · a few pending";
    default:
      return "Taking offers";
  }
}

/**
 * What the estate says about why the number is vague.
 *
 * PUBLISHED RATHER THAN HIDDEN. A count that is sometimes exact and sometimes
 * "a few" looks broken unless the reason is available, and the reason is one
 * a reader will approve of. Saying it also commits us: a version that dropped
 * the floor would have to delete this sentence first.
 */
export const DEMAND_FLOOR_NOTE =
  `Exact numbers appear at ${DEMAND_FLOOR} or more. Below that, a number plus the rest of this ` +
  `page could identify who applied, and who applied is theirs to say.`;

/** Pinned so no surface can add a field to the wire shape. */
export const OPENING_DEMAND_KEYS = ["roleOpeningId", "demand"] as const;
