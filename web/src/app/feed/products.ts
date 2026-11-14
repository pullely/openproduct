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
  mergesOf,
  recentEndorsementsOf,
  type BuildOrder,
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
 * Where a sort lives: the default is the page itself, the others are a path
 * under it.
 *
 * A PATH, NEVER A QUERY STRING. A page that reads `?sort=` is rendered per
 * request and goes out `no-store`; a path is one static, revalidated
 * document the edge can keep (design.md §4, I6 — the rule the old
 * `/builds/{order}` pages recorded).
 */
export function productsPath(sort: ProductSort = DEFAULT_PRODUCT_SORT): string {
  return sort === DEFAULT_PRODUCT_SORT ? "/products" : `/products/${PRODUCTS_ORDER_SEGMENT}/${sort}`;
}

const plural = (count: number, one: string, many: string) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/**
 * The line beside the title: how many products there are.
 *
 * THE BOARD'S LINE HAS THREE PARTS ("30 products · 9 shipping · 21 ideas");
 * a listing has no stage yet, so only the first is said (the other two
 * arrive with OPR2). What the floor is holding back is still confessed here
 * (HB0, WC-7): a count that hides a filter is the one thing this line may
 * not be.
 */
export function productsCountLine(count: number, belowFloor = 0): string {
  const head = plural(count, "product", "products");
  return belowFloor > 0 ? `${head} · ${belowFloor.toLocaleString("en-US")} more below the floor` : head;
}

/** The line beside *Show more*: how many of how many are on the page. With
 *  no total to compare against, only what is shown is said. */
export function productsShownLine(shown: number, total: number | null): string {
  return total !== null && total > shown
    ? `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} shown`
    : `${shown.toLocaleString("en-US")} shown`;
}

/**
 * A card's line of facts: what was observed about the product this week.
 *
 * IT SITS WHERE THE BOARD HAS THE STAGE ("Shipping · 3 of 4") and says what
 * the data holds instead. Changes are named only when the repository was
 * read — an unobserved repository is not zero changes (OPC-C), so it is left
 * out rather than dashed; upvotes are zero by the declared rule the Most
 * active sentence states, so they are always said.
 */
export function productFacts(card: PublicProfileCard): string {
  const changes = mergesOf(card);
  const parts = [
    ...(changes === null ? [] : [plural(changes, "change", "changes")]),
    plural(recentEndorsementsOf(card), "upvote", "upvotes"),
    "7 days",
  ];
  return parts.join(" · ");
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
