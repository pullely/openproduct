import {
  BUILD_ORDER_PAGE_SIZE,
  buildsBelowFloor,
  catalogueMomentCopy,
  orderBuilds,
  type PublicProfileCard,
} from "@openproduct/contracts";

import { ProductList } from "./product-list";
import {
  DEFAULT_PRODUCT_SORT,
  DEFAULT_PRODUCT_STAGE,
  filterByStage,
  productStageCounts,
  productsCountLine,
  type ProductSort,
  type ProductStageCounts,
  type ProductStageFilter,
} from "./products";
import { StageFilter } from "./products-stage";
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
 * THE STAGE FILTER (OPR-3). A product is an idea until its first milestone
 * ships; the left column (three pills on a phone) narrows the list to one
 * stage, and the count line says how many there are of each. Each filtered
 * list is an ADDRESS (`productsPath(sort, stage)`), so the filter is links
 * and every view stays one cacheable document.
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
export async function readProducts(
  sort: ProductSort,
  stage: ProductStageFilter = DEFAULT_PRODUCT_STAGE,
): Promise<{
  cards: PublicProfileCard[];
  next: string | null;
  total: number | null;
  count: number;
  belowFloor: number;
  computedAt: string | null;
  /** How many reachable products are at each stage — the whole catalogue's,
   *  whichever view is drawn; null when it could not be counted. */
  stages: ProductStageCounts | null;
} | null> {
  if (sort === DEFAULT_PRODUCT_SORT && stage === DEFAULT_PRODUCT_STAGE) {
    const directory = await fetchDirectoryPage();
    if (directory === null) return null;
    const cards = orderBuilds(directory.projects, sort);
    const belowFloor = buildsBelowFloor(directory.projects);
    // `total` counts every listed product, the floor's included; the count
    // the title carries is the ones a reader can reach.
    const reachable = directory.total !== null ? Math.max(directory.total - belowFloor, cards.length) : cards.length;
    // The stage counts are the WHOLE catalogue's. When this page holds all of
    // it they are counted here; otherwise the catalogue is walked for them
    // (bounded, cached like every public read), and a walk that failed
    // leaves the two stage parts unsaid rather than wrong.
    const whole = directory.next === null ? cards : await fetchAllDirectoryProjects().then((all) => (all ? orderBuilds(all, sort) : null));
    return {
      cards,
      next: directory.next,
      total: directory.next !== null ? reachable : null,
      count: directory.next !== null ? reachable : cards.length,
      belowFloor,
      computedAt: directory.computedAt,
      stages: whole ? productStageCounts(whole) : null,
    };
  }
  const all = await fetchAllDirectoryProjects();
  if (all === null) return null;
  const everything = orderBuilds(all, sort);
  const ordered = filterByStage(everything, stage);
  const cards = ordered.slice(0, BUILD_ORDER_PAGE_SIZE);
  return {
    cards,
    next: null,
    total: ordered.length > cards.length ? ordered.length : null,
    // The title's count is the catalogue's, in every view: the filter's own
    // count is on the filter.
    count: everything.length,
    belowFloor: buildsBelowFloor(all),
    computedAt: null,
    stages: productStageCounts(everything),
  };
}

export async function ProductsView({
  sort,
  stage = DEFAULT_PRODUCT_STAGE,
  returnTo,
  retryHref,
}: {
  sort: ProductSort;
  /** The stage filter the address names; everything when it names none. */
  stage?: ProductStageFilter;
  /** The address the page is drawn at: where sign-in returns a reader who
   *  pressed Follow signed out. */
  returnTo: string;
  /** Where *Try again* goes when the catalogue could not be read. */
  retryHref: string;
}) {
  const products = await readProducts(sort, stage);
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
            {productsCountLine(products.count, products.belowFloor, products.stages)}
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
        <SortMenu current={sort} stage={stage} />
      </div>

      {/* The board's two columns: the stage filter beside the list; on a
          phone the filter is a row of three pills over it. */}
      <div data-products-body className="flex items-start gap-7 max-md:flex-col max-md:items-stretch max-md:gap-2.5">
        <div className="w-[250px] shrink-0 max-lg:w-[220px] max-md:w-auto">
          <StageFilter current={stage} sort={sort} counts={products.stages} />
        </div>
        <div className="min-w-0 flex-1">
          <ProductList
            // A sort or a stage is a different list: its search and its
            // appended pages start over rather than carrying across.
            key={`${stage}:${sort}`}
            cards={products.cards}
            next={products.next}
            total={products.total}
            returnTo={returnTo}
            sort={<SortControl current={sort} stage={stage} />}
          />
        </div>
      </div>
    </main>
  );
}
