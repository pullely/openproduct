import {
  BUILD_ORDER_PAGE_SIZE,
  buildsBelowFloor,
  catalogueMomentCopy,
  orderBuilds,
  type PublicProfileCard,
} from "@openproduct/contracts";

import { ProductList } from "./product-list";
import { DEFAULT_PRODUCT_SORT, productsCountLine, type ProductSort } from "./products";
import { SortControl, SortMenu } from "./sort-control";

import { fetchAllDirectoryProjects, fetchDirectoryPage } from "../public-api";
import { BOARD_PAGE, PAGE_TITLE } from "../ui/design";
import { FailurePanel } from "../ui/failure";

/**
 * The Products page's body (openproduct-redesign OPR1; boards `Products`,
 * `PhoneProducts`) — drawn by `/products` in any of its sorts and, for this
 * milestone, by `/` in the default one.
 *
 * THE BOARD, WITH WHAT THE DATA HOLDS: the title and the count beside it;
 * the search-within-list field and the sort; the grid of cards; the count of
 * what is shown beside *Show more*.
 *
 * WHAT IS LEFT OUT UNTIL OPR2, AND WHERE IT GOES. A listing has no stage
 * yet, so the board's left column of stage filters (Everything / Shipping /
 * Ideas; the row of three pills on a phone) and the "9 shipping · 21 ideas"
 * half of the count line are absent. The body is ONE column for now; the
 * filter column is a sibling of `ProductList` inside the `data-products-body`
 * box when it arrives, and the count line gains its two parts in
 * `productsCountLine`.
 *
 * NOTHING HERE DECIDES AN ORDER. `orderBuilds` (the contract) applies the
 * floor and the comparator every other surface imports.
 *
 * TWO READS, BY SORT. The catalogue pages in the default order (OS-1), so
 * the default sort is the directory's first page and continues by cursor
 * from *Show more*. Any other sort needs every listed product first: the
 * whole catalogue is walked (bounded, as the sitemap's walk is), ordered,
 * and the first `BUILD_ORDER_PAGE_SIZE` are drawn with a line that says how
 * many of how many — a cursor is a position in the default order, so those
 * views have no page after.
 *
 * A CATALOGUE THAT COULD NOT BE READ SAYS SO: a null read is the failure
 * panel, an empty catalogue is the list's own empty line.
 */
export async function readProducts(sort: ProductSort): Promise<{
  cards: PublicProfileCard[];
  next: string | null;
  total: number | null;
  count: number;
  belowFloor: number;
  computedAt: string | null;
} | null> {
  if (sort === DEFAULT_PRODUCT_SORT) {
    const directory = await fetchDirectoryPage();
    if (directory === null) return null;
    const cards = orderBuilds(directory.projects, sort);
    const belowFloor = buildsBelowFloor(directory.projects);
    // `total` counts every listed product, the floor's included; the count
    // the title carries is the ones a reader can reach.
    const reachable = directory.total !== null ? Math.max(directory.total - belowFloor, cards.length) : cards.length;
    return {
      cards,
      next: directory.next,
      total: directory.next !== null ? reachable : null,
      count: directory.next !== null ? reachable : cards.length,
      belowFloor,
      computedAt: directory.computedAt,
    };
  }
  const all = await fetchAllDirectoryProjects();
  if (all === null) return null;
  const ordered = orderBuilds(all, sort);
  const cards = ordered.slice(0, BUILD_ORDER_PAGE_SIZE);
  return {
    cards,
    next: null,
    total: ordered.length > cards.length ? ordered.length : null,
    count: ordered.length,
    belowFloor: buildsBelowFloor(all),
    computedAt: null,
  };
}

export async function ProductsView({
  sort,
  returnTo,
  retryHref,
}: {
  sort: ProductSort;
  /** The address the page is drawn at: where sign-in returns a reader who
   *  pressed Follow signed out. */
  returnTo: string;
  /** Where *Try again* goes when the catalogue could not be read. */
  retryHref: string;
}) {
  const products = await readProducts(sort);
  // THE FAILURE PANEL IS A PAGE OF ITS OWN (its own `main`, its own `h1`):
  // it replaces this one rather than sitting inside it, so a failed read has
  // one heading like every other page.
  if (products === null) {
    return (
      <FailurePanel
        kind="unavailable"
        what="The products could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[{ label: "Try again", href: retryHref }]}
      />
    );
  }
  const moment = catalogueMomentCopy(products.computedAt);

  return (
    <main className={BOARD_PAGE}>
      {/* `relative`: on a phone the sort's pill is lifted into this row, at
          the title's right (`SortMenu`). */}
      <div className="relative" data-products-head>
        <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1.5 max-sm:min-h-[44px] max-sm:items-center max-sm:px-[2px] max-sm:pr-[150px]">
          <h1 className={PAGE_TITLE}>Products</h1>
          <p className="m-0 font-mono text-label uppercase tracking-[0.1em] text-muted-foreground max-sm:hidden" data-products-count>
            {productsCountLine(products.count, products.belowFloor)}
            {moment !== null ? (
              <>
                {" · "}
                <time dateTime={products.computedAt ?? undefined} data-catalogue-moment>
                  {moment}
                </time>
              </>
            ) : null}
          </p>
        </div>
        <SortMenu current={sort} />
      </div>

      <div data-products-body>
        <ProductList
          // A sort is a different list: its search and its appended pages
          // start over rather than carrying across.
          key={sort}
          cards={products.cards}
          next={products.next}
          total={products.total}
          returnTo={returnTo}
          sort={<SortControl current={sort} />}
        />
      </div>
    </main>
  );
}
