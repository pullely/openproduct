// The directory's strip (openproduct-commons LC2).
//
// THE MOCK SAYS `PUBLISHED TODAY · 12 NEW LISTINGS`, and on the day this
// product opens it will say `PUBLISHED TODAY · 0 NEW LISTINGS` — which is
// worse than saying nothing at all, because it is the site announcing its own
// emptiness in the largest type on the page.
//
// OPC-H is the epic's largest non-technical risk and software does not solve
// it. What software CAN do is make the surface degrade honestly instead of
// looking dead, and that is the whole of this module.
//
// ─── THE LADDER ──────────────────────────────────────────────────────────
//
// Widen the window until the number is worth saying: today → this week →
// this month. Pick the NARROWEST window that clears the threshold, because a
// narrow window is a stronger claim — "twelve today" says more than "twelve
// this month" — and taking the widest available would understate a busy day.
//
// AND THE WINDOW IS NAMED ON SCREEN (LC-3). A strip that widened silently
// would be a strip that says "12 new" on a day with one, which is the same
// lie the empty version tells, in the other direction.
//
// ─── WHAT IT BOTTOMS OUT AT, WHICH IS THE ACTUAL DESIGN DECISION ─────────
//
// The obvious ladder keeps widening — quarter, year, all time — and that is
// wrong, because past a point "recently" stops meaning anything and the strip
// becomes a euphemism. `Published this year · 3 new listings` is a sentence
// admitting the catalog is tiny while pretending to announce something.
//
// So the ladder CAPS at a month, and below that it stops framing the number
// as recency at all: it says what the catalog IS. `1,284 products listed` is
// the mock's own other number, it is always true, it is never embarrassing,
// and it is what a visitor actually wants to know about a place they have
// just arrived at. A young directory looks small — which it is — rather than
// looking broken.
//
// The one case that never renders is `0 new`. That is not a fact worth a
// strip; it is the absence of one.

/** The windows the strip can name, narrowest first. */
export const FRESHNESS_WINDOWS = ["today", "week", "month"] as const;
export type FreshnessWindow = (typeof FRESHNESS_WINDOWS)[number];

/**
 * What the strip is saying.
 *
 * `recent` names a window and a count. `size` abandons the recency framing
 * and states the catalog's own size — the honest fallback for a directory
 * that is young rather than quiet.
 */
export type Freshness =
  | { readonly kind: "recent"; readonly window: FreshnessWindow; readonly count: number }
  | { readonly kind: "size"; readonly total: number };

/** The counts core reads, and the total behind the fallback. */
export interface FreshnessCounts {
  readonly today: number;
  readonly week: number;
  readonly month: number;
  readonly total: number;
}

export const FRESHNESS_COUNT_KEYS = ["month", "today", "total", "week"] as const;

/**
 * How many listings make a window worth naming.
 *
 * FIVE, and the reasoning is about how a row reads rather than about
 * statistics: a strip pointing at one or two things reads as an accident, and
 * a reader who clicks through to find two items learns not to click again.
 * Five is the smallest number that looks deliberate.
 *
 * Configuration rather than code (LC-3), because the right number depends on
 * a catalog nobody has seen yet, and finding out it should be eight must not
 * cost a deploy.
 */
export const DEFAULT_FRESHNESS_THRESHOLD = 5;

/** Read the threshold from configuration. A bad value falls back rather than
 *  becoming zero — a zero threshold makes every window qualify, and `today ·
 *  0 new` is the one sentence this module exists to prevent. */
export function parseFreshnessThreshold(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.trunc(parsed)
    : DEFAULT_FRESHNESS_THRESHOLD;
}

/**
 * Choose what the strip says.
 *
 * ORDERED NARROWEST FIRST, so a busy day is reported as a busy day. The cap
 * is deliberate: below a month the strip stops claiming recency rather than
 * reaching for a wider one (see the module header).
 */
export function chooseFreshness(
  counts: FreshnessCounts,
  threshold: number = DEFAULT_FRESHNESS_THRESHOLD,
): Freshness {
  for (const window of FRESHNESS_WINDOWS) {
    if (counts[window] >= threshold) return { kind: "recent", window, count: counts[window] };
  }
  // Nothing cleared the bar. If the widest window holds SOMETHING, say it —
  // "3 this month" is a small true sentence, and a young catalog saying so is
  // not the failure; a young catalog pretending otherwise is.
  if (counts.month > 0) return { kind: "recent", window: "month", count: counts.month };
  // Nothing at all this month. The strip stops being about recency and says
  // what the place is instead, which is always true and never advertises an
  // absence.
  return { kind: "size", total: counts.total };
}

/** The strip's label, with the window named on screen (LC-3). */
export function freshnessLabel(freshness: Freshness): string {
  if (freshness.kind === "size") {
    return freshness.total === 1 ? "1 product listed" : `${format(freshness.total)} products listed`;
  }
  const heading = {
    today: "Published today",
    week: "Published this week",
    month: "Published this month",
  }[freshness.window];
  const noun = freshness.count === 1 ? "new listing" : "new listings";
  return `${heading} · ${format(freshness.count)} ${noun}`;
}

/**
 * The sentence beneath it, for the degraded cases.
 *
 * SAID ONLY WHERE IT ADDS SOMETHING. A busy day needs no explanation; a strip
 * that has widened or fallen back is making a choice, and a reader who can
 * see the choice can trust the number.
 */
export function freshnessNote(freshness: Freshness, threshold: number): string | null {
  if (freshness.kind === "size") {
    return "Nothing new this month. This is a young directory rather than a quiet one — the weekly digest is where each week's arrivals land.";
  }
  if (freshness.window === "today") return null;
  return `Fewer than ${threshold} were published in a narrower window, so this one is wider. The window is always named.`;
}

/** `1,284`. The mock's own formatting, and the one place a number here is
 *  grouped — a count of new listings is small enough to read bare. */
function format(value: number): string {
  return value.toLocaleString("en-GB");
}
