/**
 * Pricing, as an address (openproduct-worldclass-v2 PP3).
 *
 * THE FILTER IS A PATH, NOT A QUERY STRING. The plan wrote `/?pricing=free`;
 * the front page is one cached document with no `searchParams` (WC-4, I6),
 * and the product's facet filters are already paths — `/topics/{value}`,
 * `/stack/{value}`. `/pricing/{value}` is the third of that kind, built the
 * way `stacks.ts` builds the second: the vocabulary is the gate, the label
 * is the page's title, and the count is the list's own length (WC-7).
 *
 * WHAT IT IS NOT. A price. This estate charges nothing and verifies no
 * figure; the field is the maintainers' own description of what using the
 * product costs, and every surface that renders it says so.
 */
import { facet } from "./facets.js";
import type { PublicProfileCard } from "./index.js";

/** The facet a pricing page IS. One constant rather than the string in five
 *  files, so a page and the count behind it cannot come apart. */
export const PRICING_FACET = "pricing";

export const PRICING_PATH = "/pricing";

/** `/pricing/{value}`. The value is a canonical facet value. */
export function pricingPath(value: string): string {
  return `${PRICING_PATH}/${encodeURIComponent(value)}`;
}

/** The published label for a canonical value, or `null` if the vocabulary
 *  does not have it — a hand-typed URL is a 404, not a page titled after
 *  whatever was in the path. */
export function pricingLabel(value: string): string | null {
  return facet(PRICING_FACET)?.values.find((v) => v.value === value)?.label ?? null;
}

/** The cards that answered this value. Absent is absent: a listing that has
 *  not said is on no pricing page, exactly as it is in no topic. */
export function cardsWithPricing(
  cards: readonly PublicProfileCard[],
  value: string,
): readonly PublicProfileCard[] {
  return cards.filter((card) => card.pricing === value);
}

/** How many listed products answered each value, in the vocabulary's order,
 *  values nobody chose included — a pricing page for a value nothing uses is
 *  a page, and the index says which those are. */
export interface PricingTally {
  readonly value: string;
  readonly label: string;
  readonly products: number;
}

export function pricingTally(cards: readonly PublicProfileCard[]): readonly PricingTally[] {
  return (facet(PRICING_FACET)?.values ?? []).map((entry) => ({
    value: entry.value,
    label: entry.label,
    products: cards.filter((card) => card.pricing === entry.value).length,
  }));
}

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

export const PRICING_TITLE = "Pricing";

export const PRICING_MEANING =
  "What using each listed product costs, as its maintainers describe it — free, open core, paid, or free to self-host. Nothing here is a price this directory charges or checks, and a product that has not said is on none of these pages.";

/** What the chip on a listing says on hover (WC-3: authored says so). */
export const PRICING_PROVENANCE_NOTE =
  "Stated by the maintainers. Not a price this directory charges or checks.";

export const PRICING_EMPTY_NOTE =
  "No listed product describes its pricing this way yet. Pricing is what a product's maintainers said, so an absence here means nobody has said it.";

/** What one pricing page's list IS, said where the list begins (OPC-4). */
export function pricingMeaning(label: string): string {
  return `Every listed product whose maintainers describe it as ${label.toLowerCase()}, most active first. This is the directory filtered, not the launch board.`;
}
