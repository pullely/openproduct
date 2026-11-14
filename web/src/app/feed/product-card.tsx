import { TOPIC_FACET, labelOf, type PublicProfileCard } from "@openproduct/contracts";

import { FollowProduct } from "./follow-product";
import { openSeatsLabel, productFacts } from "./products";

import { FOCUS, SEAT_RING } from "../ui/design";
import { AppLink } from "../ui/link";
import { ProductTile } from "../ui/product-tile";

/**
 * A product, as a card (openproduct-redesign OPR1; boards `Products`,
 * `PhoneProducts`). It replaced openproduct-calm's one-per-row build tile on
 * every list of products.
 *
 * THE BOARD'S CARD, TOP TO BOTTOM: the face at 44px beside the name (18px,
 * 600) and the category under it; one mono line of facts; the pitch in at
 * most two lines; and a foot with the open seats on the left and Follow on
 * the right. The top is ONE link to the product — the whole block, as the
 * board draws it — and the foot holds the card's two other controls, outside
 * that link, so no control is nested in another.
 *
 * WHAT THE DATA DOES NOT HOLD, THE CARD DOES NOT DRAW:
 *
 *   stage     a listing is not yet "shipping" or "an idea", so the board's
 *             stage label, its milestone bar and the idea's lavender card
 *             are absent (they arrive with OPR2). The line of facts sits
 *             where the stage label does.
 *   seats     the link is drawn only when a seat is open: "0 open seats" is
 *             a link to a page with nothing on it for this product.
 *   upvote    the board's card carries no vote. The act lives on the
 *             product's own page; the week's count is in the line of facts.
 *
 * NO CLIENT DIRECTIVE, AND NOTHING SERVER-ONLY. The lists render it on the
 * server; `product-list.tsx` renders the same component in the browser for
 * the pages *Show more* appends, so a product looks the same wherever it was
 * drawn. Follow resolves the visitor's own state after paint either way (I6).
 */
export function ProductCard({ card, returnTo = "/products" }: { card: PublicProfileCard; returnTo?: string }) {
  const category = card.category ? (labelOf(TOPIC_FACET, card.category) ?? card.category) : null;
  return (
    <li data-keyrow data-product-card className="flex min-w-0 list-none flex-col overflow-hidden rounded-[16px] bg-card">
      <AppLink
        href={`/${card.slug}`}
        className={`flex flex-1 flex-col gap-[10px] px-[18px] pb-3 pt-[18px] text-foreground no-underline transition-colors hover:bg-accent max-sm:gap-2 max-sm:px-[14px] max-sm:pb-1 max-sm:pt-[14px] ${FOCUS} focus-visible:-outline-offset-2`}
      >
        <span className="flex items-center gap-3">
          <ProductTile slug={card.slug} thumbnail={card.thumbnail} size={44} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-card-title font-semibold tracking-[-0.015em]">{card.slug}</span>
            {category ? <span className="truncate text-[13px] text-muted-foreground">{category}</span> : null}
          </span>
        </span>
        <span className="font-mono text-mono-label uppercase text-muted-foreground" data-product-facts>
          {productFacts(card)}
        </span>
        {/* TWO LINES at most; the product's page holds the rest. */}
        {card.tagline ? <span className="line-clamp-2 text-[15px] leading-[1.5] text-copy">{card.tagline}</span> : null}
      </AppLink>
      <div className="flex items-center justify-between gap-[10px] px-[18px] pb-4 max-sm:px-[14px] max-sm:pb-3 max-sm:pt-1">
        {card.roleOpeningCount > 0 ? (
          <AppLink
            href="/help-wanted"
            data-product-seats
            className={`inline-flex min-h-[40px] items-center gap-1.5 text-[13px] font-semibold text-seat-ink no-underline hover:underline max-sm:min-h-[44px] ${FOCUS}`}
          >
            <span aria-hidden="true" className={`h-[14px] w-[14px] border-[1.5px] ${SEAT_RING}`} />
            {openSeatsLabel(card.roleOpeningCount)}
          </AppLink>
        ) : null}
        <div className="ml-auto flex">
          <FollowProduct slug={card.slug} returnTo={returnTo} />
        </div>
      </div>
    </li>
  );
}

/** The grid the cards sit in: the board's `auto-fill` columns of at least
 *  250px with 18px between; one column, 10px apart, on a phone. */
export const PRODUCT_GRID =
  "m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-[18px] p-0 max-sm:grid-cols-1 max-sm:gap-[10px]";
