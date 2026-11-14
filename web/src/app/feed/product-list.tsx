"use client";

import * as React from "react";

import { cataloguePagePath, type PublicProfileCard } from "@openproduct/contracts";

import { PRODUCT_GRID, ProductCard } from "./product-card";
import {
  PRODUCTS_EMPTY,
  PRODUCTS_MORE_FAILED,
  PRODUCTS_MORE_LABEL,
  PRODUCTS_MORE_LOADING,
  matchesProductQuery,
  noProductsMatch,
  productsShownLine,
} from "./products";

import { BTN_SOFT, EMPTY_NOTE, FOCUS } from "../ui/design";
import { SearchIcon } from "../ui/icons";
import { AppLink } from "../ui/link";

/**
 * The list of products under the title (openproduct-redesign OPR1; boards
 * `Products`, `PhoneProducts`): the search-within-list field beside the sort,
 * the grid of cards, and the line that says how many are shown beside *Show
 * more*.
 *
 * A PROGRESSIVE LAYER OVER A SERVER RENDER. The page is one document with
 * the catalogue's first page in it, the same bytes for every visitor (I6):
 * this component's server render IS that list. In the browser it adds two
 * things and nothing else —
 *
 *   SEARCH   typing narrows the cards the page holds, by name or pitch (the
 *            board's rule, `matchesProductQuery`). The field is also a plain
 *            form to `/search`, so Enter — or a reader with no JavaScript —
 *            reaches the search that reads the whole catalogue.
 *   MORE     *Show more* is a LINK to `/products/{cursor}`, the page a
 *            crawler follows and a reader without JavaScript opens. Pressed
 *            in a browser, the same directory page is read as JSON from
 *            `/api/builds/{cursor}` and its cards are appended under the
 *            server's, drawn by the same `ProductCard`. A failed read says
 *            so in one line and leaves the link a link.
 *
 * WHY "SHOW MORE" AND NOT THE DESKTOP BOARD'S NUMBERED PAGER. The catalogue
 * is paged by an opaque, forward-only cursor (OS-1, OS-2): there is a page
 * after this one and no page seven to jump to, so numbered pages would be
 * numbers this component made up. The phone board's footer — a count and
 * *Show more* — is what the data supports, and it is drawn at every width.
 *
 * NOTHING PERSONAL. The reads are anonymous; each card's Follow resolves its
 * own state from the overlay, as the server-rendered ones do.
 */
export function ProductList({
  cards,
  next = null,
  total = null,
  returnTo,
  sort,
}: {
  cards: readonly PublicProfileCard[];
  /** The cursor of the page after this one, or null when there is none (the
   *  last page, and every sort but the default — a cursor is a position in
   *  the default order). */
  next?: string | null;
  /** How many products there are in all, when that is more than the page
   *  holds and the catalogue said so. */
  total?: number | null;
  /** Where sign-in returns a reader who pressed Follow signed out. */
  returnTo: string;
  /** The sort control, rendered by the server page beside the search. */
  sort?: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const [more, setMore] = React.useState<PublicProfileCard[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(next);
  const [state, setState] = React.useState<"idle" | "loading" | "failed">("idle");

  const held = React.useMemo(() => [...cards, ...more], [cards, more]);
  const shown = held.filter((card) => matchesProductQuery(card, query));
  const searching = query.trim().length > 0;

  const readMore = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // A modified click opens the page itself; so does a click after a failed
    // read, which is the link doing what a link does.
    if (cursor === null || state === "failed" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (state === "loading") return;
    setState("loading");
    fetch(`/api/builds/${encodeURIComponent(cursor)}`, { headers: { accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((page: { builds?: PublicProfileCard[]; next?: unknown }) => {
        setMore((appended) => {
          // A listing that moved between two reads could arrive twice; it is
          // drawn once.
          const seen = new Set([...cards, ...appended].map((card) => card.slug));
          return [...appended, ...(page.builds ?? []).filter((card) => !seen.has(card.slug))];
        });
        setCursor(typeof page.next === "string" && page.next.length > 0 ? page.next : null);
        setState("idle");
      })
      .catch(() => setState("failed"));
  };

  return (
    <section aria-labelledby="products-list" className="flex min-w-0 flex-col gap-[18px] max-sm:gap-[10px]">
      <h2 id="products-list" className="sr-only">
        Products
      </h2>

      {/* The phone board has no field here — its search is the header's —
          and its sort sits beside the title (`SortMenu`). */}
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:hidden" data-products-toolbar>
        <form
          role="search"
          action="/search"
          method="get"
          className="flex min-h-[40px] max-w-[380px] flex-[1_1_260px] items-center gap-2 rounded-full bg-card px-4 ring-1 ring-inset ring-foreground/[0.07] focus-within:ring-2 focus-within:ring-ring"
        >
          <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <label htmlFor="products-search" className="sr-only">
            Search products
          </label>
          <input
            id="products-search"
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products"
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </form>
        {sort}
      </div>

      {shown.length > 0 ? (
        <ul className={PRODUCT_GRID} data-product-cards>
          {shown.map((card) => (
            <ProductCard key={card.slug} card={card} returnTo={returnTo} />
          ))}
        </ul>
      ) : (
        <p className={EMPTY_NOTE} role={searching ? "status" : undefined}>
          {searching ? noProductsMatch(query) : PRODUCTS_EMPTY}
        </p>
      )}

      {shown.length > 0 || cursor !== null ? (
        <nav aria-label="More products" className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 pt-1 max-sm:px-[2px] max-sm:pt-0">
          <span className="font-mono text-label uppercase tracking-[0.1em] text-muted-foreground max-sm:text-mono-label" data-products-shown>
            {productsShownLine(shown.length, cursor !== null ? total : null)}
          </span>
          {state !== "idle" ? (
            <span role="status" className="text-[13px] text-muted-foreground">
              {state === "loading" ? PRODUCTS_MORE_LOADING : PRODUCTS_MORE_FAILED}
            </span>
          ) : null}
          {cursor !== null ? (
            <AppLink
              href={cataloguePagePath(cursor)}
              onClick={readMore}
              data-catalogue-next
              aria-busy={state === "loading" ? true : undefined}
              className={`${BTN_SOFT} ${FOCUS}`}
            >
              {PRODUCTS_MORE_LABEL}
            </AppLink>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
