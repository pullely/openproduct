import { ChevronIcon, SortIcon } from "../ui/icons";
import { AppLink } from "../ui/link";
import { FOCUS } from "../ui/design";

import { PRODUCT_SORTS, PRODUCT_SORT_LABEL, productsPath, type ProductSort } from "./products";

/**
 * The Products page's sort (openproduct-redesign OPR1; boards `Products`,
 * `PhoneProducts`).
 *
 * LINKS, NOT A WIDGET. Each sort is an address — `/products` for the default,
 * `/products/by/<order>` for the others (`products.ts`) — so the control is
 * a row of plain links that work with no JavaScript, and the current one
 * carries `aria-current`. A client-side re-sort would order only the cards
 * the page happens to hold, which is not the order the site publishes.
 *
 * TWO DRAWINGS OF ONE CONTROL, as the boards have it:
 *
 *   SortControl   from `sm` up: a pill-shaped track with the sorts inside
 *                 it, the current one on the card colour.
 *   SortMenu      on a phone: a pill beside the title that names the current
 *                 sort, and opens the same track under the title. A
 *                 `<details>`, so it opens without JavaScript; each option
 *                 is 44px tall.
 *
 * NO ACCENT. The current sort is the card colour on the track, in ink.
 */
const OPTION =
  "inline-flex items-center justify-center whitespace-nowrap rounded-full px-[14px] text-[13px] no-underline transition-colors";

function option(on: boolean): string {
  return on ? "bg-card font-semibold text-foreground" : "font-medium text-copy hover:text-foreground";
}

export function SortControl({ current }: { current: ProductSort }) {
  return (
    <nav aria-label="Sort" data-product-sort className="flex shrink-0 gap-[2px] rounded-full bg-foreground/[0.06] p-1 max-sm:hidden">
      {PRODUCT_SORTS.map((sort) => (
        <AppLink
          key={sort}
          href={productsPath(sort)}
          aria-current={sort === current ? "page" : undefined}
          data-product-sort-option={sort}
          className={`${OPTION} min-h-[36px] ${option(sort === current)} ${FOCUS}`}
        >
          {PRODUCT_SORT_LABEL[sort]}
        </AppLink>
      ))}
    </nav>
  );
}

export function SortMenu({ current }: { current: ProductSort }) {
  return (
    // The summary is lifted into the title's row (the page's head is the
    // positioned box); what it opens flows under the title, full width.
    <details data-product-sort-menu className="group sm:hidden">
      <summary
        aria-label={`Sort: ${PRODUCT_SORT_LABEL[current]}`}
        className={`absolute right-0 top-0 flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-full bg-foreground/[0.06] px-[14px] text-[13px] font-semibold text-foreground [&::-webkit-details-marker]:hidden ${FOCUS}`}
      >
        <SortIcon className="h-[14px] w-[14px] shrink-0" />
        {PRODUCT_SORT_LABEL[current]}
        <ChevronIcon className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <nav aria-label="Sort" className="mt-[10px] flex gap-[2px] rounded-full bg-foreground/[0.06] p-[3px]">
        {PRODUCT_SORTS.map((sort) => (
          <AppLink
            key={sort}
            href={productsPath(sort)}
            aria-current={sort === current ? "page" : undefined}
            className={`${OPTION} min-h-[44px] flex-auto px-3 ${option(sort === current)} ${FOCUS}`}
          >
            {PRODUCT_SORT_LABEL[sort]}
          </AppLink>
        ))}
      </nav>
    </details>
  );
}
