/**
 * The Products page, as pure functions (openproduct-redesign OPR1; boards
 * `Products`, `PhoneProducts`).
 *
 * SEPARATE FROM THE COMPONENTS for the reason `tile.ts` is: the web test lane
 * has no JSX, so a rule that lives inside a `.tsx` is a rule no test can hold.
 * What a sort is called, where it lives, what the count line says and which
 * card a search keeps are decided here and drawn elsewhere.
 *
 * NOTHING HERE MAKES AN ORDER. The three sorts are three of the contract's
 * four published orders (`build-orders.ts`), under the names they already
 * have; `orderBuilds` still applies the floor and the comparator.
 */
import {
  BUILD_ORDER_LABEL,
  type BuildOrder,
  type ProductStage,
  type PublicProfileCard,
} from "@openproduct/contracts";

/**
 * The sorts the page offers, in the control's order.
 *
 * THREE OF THE FOUR ORDERS. `roles` is not a sort of products: it is the
 * Help wanted section (`/help-wanted`) and a FILTER over Most active, so it
 * cannot stand in for the board's "Most open seats" either — no published
 * order sorts by the number of open seats, and the page does not invent one.
 */
export const PRODUCT_SORTS = ["most-active", "newest", "upvoted"] as const satisfies readonly BuildOrder[];
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Today's default order, and so the page's. */
export const DEFAULT_PRODUCT_SORT: ProductSort = "most-active";

/** The control's words: the orders' own published names. */
export const PRODUCT_SORT_LABEL: Record<ProductSort, string> = {
  "most-active": BUILD_ORDER_LABEL["most-active"],
  newest: BUILD_ORDER_LABEL.newest,
  upvoted: BUILD_ORDER_LABEL.upvoted,
};

export function isProductSort(value: unknown): value is ProductSort {
  return typeof value === "string" && (PRODUCT_SORTS as readonly string[]).includes(value);
}

/**
 * The path segment the other orders live under: `/products/by/<order>`.
 *
 * IT SITS BESIDE `/products/[cursor]`, and the two cannot be confused. A
 * cursor is one segment and is base64url of a JSON array (`encodeCursor`),
 * so it always begins with `W` and `by` never decodes to one; an order's
 * address is two segments, which a cursor's never is. The continuation page
 * refuses this word outright rather than asking the directory about it.
 */
export const PRODUCTS_ORDER_SEGMENT = "by";

/** The orders that have an address under `/products/by/`: every sort but
 *  the default, whose one address is `/products`. */
export const PRODUCT_ORDER_SEGMENTS = PRODUCT_SORTS.filter(
  (sort): sort is Exclude<ProductSort, typeof DEFAULT_PRODUCT_SORT> => sort !== DEFAULT_PRODUCT_SORT,
);

/**
 * The sort a `/products/by/<segment>` address names, or null.
 *
 * NULL IS A 404. A path is an address a page was published at, and an order
 * that was never published has no page — unlike a query string, there is no
 * "the list they meant" to fall back to without serving one document under
 * unbounded addresses. The default order is null here too: it lives at
 * `/products` and nowhere else, so it has exactly one address.
 */
export function productSortOfSegment(segment: unknown): ProductSort | null {
  return isProductSort(segment) && segment !== DEFAULT_PRODUCT_SORT ? segment : null;
}

/**
 * The stage filter (openproduct-redesign OPR-3; boards `Products`,
 * `PhoneProducts`): everything, the products that are shipping, the ideas.
 * `all` is no filter; the other two are the contract's own stages.
 */
export const PRODUCT_STAGE_FILTERS = ["all", "shipping", "idea"] as const satisfies readonly ("all" | ProductStage)[];
export type ProductStageFilter = (typeof PRODUCT_STAGE_FILTERS)[number];

/** No filter: the page as it was before there were stages. */
export const DEFAULT_PRODUCT_STAGE: ProductStageFilter = "all";

/** The filter's words (board `Products`). */
export const PRODUCT_STAGE_FILTER_LABEL: Record<ProductStageFilter, string> = {
  all: "Everything",
  shipping: "Shipping",
  idea: "Ideas",
};

/**
 * The path segment the filtered lists live under: `/products/stage/<stage>`.
 *
 * BESIDE `by`, AND FOR THE SAME REASON. It is a static segment next to
 * `/products/[cursor]`: a cursor is one segment of base64url that begins with
 * `W`, so it is never this word, and a filtered list's address is at least
 * two segments, which a cursor's never is. The continuation page refuses the
 * word outright, as it refuses `by`.
 */
export const PRODUCTS_STAGE_SEGMENT = "stage";

/** A stage's word in an address: the filter's own label, lower-cased —
 *  `/products/stage/shipping`, `/products/stage/ideas`. */
export const PRODUCT_STAGE_SEGMENT: Record<Exclude<ProductStageFilter, "all">, string> = {
  shipping: "shipping",
  idea: "ideas",
};

/** The stages that have an address under `/products/stage/`: both of them.
 *  Everything is `/products` and nowhere else. */
export const PRODUCT_STAGE_SEGMENTS = Object.values(PRODUCT_STAGE_SEGMENT);

/** The stage a `/products/stage/<segment>` address names, or null — and null
 *  is a 404, as an unpublished order is (`productSortOfSegment`). */
export function productStageOfSegment(segment: unknown): Exclude<ProductStageFilter, "all"> | null {
  if (segment === PRODUCT_STAGE_SEGMENT.shipping) return "shipping";
  if (segment === PRODUCT_STAGE_SEGMENT.idea) return "idea";
  return null;
}

/**
 * Where a view of the list lives: a sort, a stage, or both.
 *
 *   /products                               everything, most active
 *   /products/by/<order>                    everything, another order
 *   /products/stage/<stage>                 one stage, most active
 *   /products/stage/<stage>/by/<order>      one stage, another order
 *
 * A PATH, NEVER A QUERY STRING. A page that reads `?sort=` or `?stage=` is
 * rendered per request and goes out `no-store`; a path is one static,
 * revalidated document the edge can keep (design.md §4, I6 — the rule the
 * old `/builds/{order}` pages recorded). Two filters and three orders is nine
 * addresses, every one of them enumerable (`productViews`), so every one is
 * prerendered and none is unbounded. Each view has exactly ONE address: the
 * defaults are never spelt.
 */
export function productsPath(
  sort: ProductSort = DEFAULT_PRODUCT_SORT,
  stage: ProductStageFilter = DEFAULT_PRODUCT_STAGE,
): string {
  const staged = stage === "all" ? "/products" : `/products/${PRODUCTS_STAGE_SEGMENT}/${PRODUCT_STAGE_SEGMENT[stage]}`;
  return sort === DEFAULT_PRODUCT_SORT ? staged : `${staged}/${PRODUCTS_ORDER_SEGMENT}/${sort}`;
}

/** Every view of the list there is: each stage in each order. The sitemap
 *  and the routes' `generateStaticParams` are both read from this. */
export function productViews(): { sort: ProductSort; stage: ProductStageFilter; path: string }[] {
  return PRODUCT_STAGE_FILTERS.flatMap((stage) =>
    PRODUCT_SORTS.map((sort) => ({ sort, stage, path: productsPath(sort, stage) })),
  );
}

/** How many products are at each stage. */
export interface ProductStageCounts {
  readonly all: number;
  readonly shipping: number;
  readonly idea: number;
}

/** Count a list of cards by stage. A card with no stage (a gateway deployed
 *  before OPR-3) counts in `all` only: it is not guessed into either. */
export function productStageCounts(cards: readonly Pick<PublicProfileCard, "stage">[]): ProductStageCounts {
  return {
    all: cards.length,
    shipping: cards.filter((card) => card.stage === "shipping").length,
    idea: cards.filter((card) => card.stage === "idea").length,
  };
}

/** The cards a stage filter keeps. `all` keeps every one. */
export function filterByStage<T extends Pick<PublicProfileCard, "stage">>(cards: readonly T[], stage: ProductStageFilter): T[] {
  return stage === "all" ? [...cards] : cards.filter((card) => card.stage === stage);
}

const plural = (count: number, one: string, many: string) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/**
 * The line beside the title: how many products there are, and how many of
 * them are shipping and how many are ideas — the board's three parts
 * ("30 products · 9 shipping · 21 ideas"). The two stage parts are said when
 * the catalogue's stages were counted (`stages`), and left out when they
 * were not. What the floor is holding back is still confessed here (HB0,
 * WC-7): a count that hides a filter is the one thing this line may not be.
 */
export function productsCountLine(count: number, belowFloor = 0, stages: ProductStageCounts | null = null): string {
  const parts = [plural(count, "product", "products")];
  if (stages !== null) {
    parts.push(`${stages.shipping.toLocaleString("en-US")} shipping`, plural(stages.idea, "idea", "ideas"));
  }
  if (belowFloor > 0) parts.push(`${belowFloor.toLocaleString("en-US")} more below the floor`);
  return parts.join(" · ");
}

/** The line beside *Show more*: how many of how many are on the page. With
 *  no total to compare against, only what is shown is said. */
export function productsShownLine(shown: number, total: number | null): string {
  return total !== null && total > shown
    ? `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} shown`
    : `${shown.toLocaleString("en-US")} shown`;
}

/** The card's teal link: how many seats are open. */
export function openSeatsLabel(count: number): string {
  return plural(count, "open seat", "open seats");
}

/**
 * Does a card match what was typed into *Search products*?
 *
 * The board's own rule: the name or the pitch contains the words, without
 * regard to case. An empty search keeps everything. It filters the cards the
 * page holds; the header's search is the one that reads the whole catalogue.
 */
export function matchesProductQuery(card: Pick<PublicProfileCard, "slug" | "tagline">, query: string): boolean {
  const words = query.trim().toLowerCase();
  if (words.length === 0) return true;
  return card.slug.toLowerCase().includes(words) || (card.tagline ?? "").toLowerCase().includes(words);
}

/** What the list says when the search keeps nothing — the board's sentence. */
export function noProductsMatch(query: string): string {
  return `No products match “${query.trim()}”.`;
}

/** What the list says when there is nothing listed at all. */
export const PRODUCTS_EMPTY = "No products are listed yet.";

/** The control under the list, and what it says while and after it reads. */
export const PRODUCTS_MORE_LABEL = "Show more";
export const PRODUCTS_MORE_LOADING = "Loading more products";
export const PRODUCTS_MORE_FAILED = "The next products could not be loaded.";
