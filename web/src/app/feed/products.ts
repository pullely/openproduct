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
 * The sort a `?sort=` value names.
 *
 * ANYTHING ELSE IS THE DEFAULT, never a 404 and never an error: a query
 * string is typed by hand and shared half-remembered, and the page a reader
 * meant is the list. A repeated parameter reads as its first value.
 */
export function productSortOf(raw: string | readonly string[] | null | undefined): ProductSort {
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return isProductSort(value) ? value : DEFAULT_PRODUCT_SORT;
}

/** Where a sort lives: the default is the page itself, with no query string,
 *  so the default order has exactly one address. */
export function productsPath(sort: ProductSort = DEFAULT_PRODUCT_SORT): string {
  return sort === DEFAULT_PRODUCT_SORT ? "/products" : `/products?sort=${sort}`;
}

/**
 * Where an old `/builds/{order}` address went, or null for a segment that
 * was never an order (a 404, as it always was).
 *
 * `roles` is Help wanted; the other orders are the Products page's sorts.
 * `most-active` never had an address under `/builds/` — it was `/` — and is
 * answered anyway, because the segment is a real order's name and the
 * honest answer to it is the default list.
 */
export function buildOrderRedirect(order: string): string | null {
  if (order === "roles") return "/help-wanted";
  return isProductSort(order) ? productsPath(order) : null;
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
