import type { PublicProfileListing } from "@openproduct/contracts";

import { AppLink } from "../../ui/link";
import { ProductTile } from "../../ui/product-tile";

/**
 * A person's products, as rows (boards `Person`, `PhonePerson`): the 44px
 * tile, the name at 600 and the tagline in one muted line — and nothing drawn
 * where the listing carries none. ONE anchor per row, wrapping the whole of
 * it; 56px tall, so the row is the target on a phone too.
 *
 * Shared by the two lists a profile draws (the products they run, and the
 * ones they contribute to) and by the side card every other section shows.
 * Both render a slug that IS a link to a page that exists — the read is gated
 * on `visibility = 'public'` on both sides, so XP-5 holds by construction here
 * rather than by remembering.
 *
 * THE STAGE LINE (OPR-3). Where the page read it (`product-stages.ts`), a row
 * says where its product stands — `shipping, 3 of 4`, `idea` — in the
 * stage's own colour, in place of nothing: the tagline stays above it.
 *
 * NO OTHER FIGURES. A profile listing carries none.
 */
export function ProductRows({
  listings,
  stages = {},
}: {
  listings: readonly PublicProfileListing[];
  /** Slug → stage line, for the products whose stage was read. */
  stages?: Readonly<Record<string, string>>;
}) {
  return (
    <ul className="m-0 grid list-none p-0">
      {listings.map((listing) => (
        // A KEYBOARD ROW (QE3): `j` and `k` walk these, as they walk every
        // list of products (sourceplane/orun-cloud#1882).
        <li key={listing.slug} data-keyrow className="list-none">
          <AppLink
            href={`/${listing.slug}`}
            className="flex min-h-[56px] min-w-0 items-center gap-3 rounded-[14px] px-1.5 py-1.5 no-underline transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ProductTile slug={listing.slug} thumbnail={listing.thumbnail} size={44} />
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-[15px] font-semibold text-foreground">{listing.slug}</span>
              {listing.tagline ? (
                <span className="truncate text-[13px] text-muted-foreground">{listing.tagline}</span>
              ) : null}
              {stages[listing.slug] ? (
                <span
                  data-product-stage-line
                  className={`truncate text-[13px] ${stages[listing.slug]!.startsWith("idea") ? "text-idea" : "text-amber-ink"}`}
                >
                  {stages[listing.slug]}
                </span>
              ) : null}
            </span>
            {/* The board's row chevron: decoration — the row is the link. */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
              className="shrink-0 text-muted-foreground"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </AppLink>
        </li>
      ))}
    </ul>
  );
}
