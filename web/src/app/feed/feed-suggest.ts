// What the feed's right column lists (openproduct-redesign OPR-3; board
// `Feed`): "Worth following" and "Open seats", both from the directory's own
// first page.
//
// PURE, and apart from `feed-copy.ts` on purpose: these read the catalogue's
// comparator (`orderBuilds`), which the server page needs and the browser's
// list does not.

import { orderBuilds, type MediaThumbnail, type PublicProfileCard } from "@openproduct/contracts";

/** How many products "Worth following" lists. */
export const WORTH_FOLLOWING_LIMIT = 4;

/** One row of "Worth following": a PRODUCT. There is no person shape here to
 *  fill by mistake (the owner's rule: a person is followed from their own
 *  profile). */
export interface WorthFollowing {
  readonly slug: string;
  readonly line: string;
  readonly thumbnail: MediaThumbnail | null;
}

/**
 * "Worth following": the directory's most active products that are not
 * already on the page.
 *
 * FROM THE DIRECTORY'S OWN ORDER (`orderBuilds`, the published comparator),
 * so nothing here decides who is worth anything. A product with a post in
 * the list beside it is left out: its card already carries its Follow.
 */
export function worthFollowing(
  cards: readonly PublicProfileCard[],
  onPage: readonly string[] = [],
  limit = WORTH_FOLLOWING_LIMIT,
): WorthFollowing[] {
  const shown = new Set(onPage);
  return orderBuilds(cards, "most-active")
    .filter((card) => !shown.has(card.slug))
    .slice(0, limit)
    .map((card) => ({
      slug: card.slug,
      line: card.tagline ? `Product · ${card.tagline}` : "Product",
      thumbnail: card.thumbnail,
    }));
}

/** How many products the "Open seats" card names. */
export const OPEN_SEATS_LIMIT = 3;

/** The most active products with a seat open, for the "Open seats" card. */
export function openSeatProducts(
  cards: readonly PublicProfileCard[],
  limit = OPEN_SEATS_LIMIT,
): Array<{ slug: string; seats: number; stage: PublicProfileCard["stage"] }> {
  return orderBuilds(cards, "most-active")
    .filter((card) => card.roleOpeningCount > 0)
    .slice(0, limit)
    .map((card) => ({ slug: card.slug, seats: card.roleOpeningCount, stage: card.stage }));
}
