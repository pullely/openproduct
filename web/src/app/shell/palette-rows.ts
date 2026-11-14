// The header search's pure half (openproduct-commons DS3; the card's row model
// since openproduct-redesign OPR1).
//
// Separated from `palette.tsx` for the reason the overlay store is: the web
// test lane is module-level and cannot compile JSX, so logic that deserves
// direct assertions has to live outside a component. That constraint keeps
// pushing the right way — what a search result BECOMES, which rows the card
// shows, and where the arrow keys go next are rules about the product, not
// about a React tree.

import {
  SEE_ALL_RESULTS,
  makerPath,
  searchPath,
  type SearchMakerHit,
} from "@openproduct/contracts";

/** One hit as the DS0 index returns it. */
export interface SearchHit {
  readonly kind: string;
  readonly entityId: string;
  readonly title: string;
  readonly summary: string | null;
  readonly matched: string;
}

/**
 * A maker as `/v1/search` returns one, plus the one field the card can use
 * and the read does not send yet.
 *
 * `products` IS NOT IN TODAY'S RESPONSE. The design's person row opens to
 * show that person's products (design.md §2 rule 6); the search read returns
 * a handle, a name and which field matched, and nothing about what the
 * person makes. The row model takes the list when a response carries it and
 * a person row without one simply has nothing to open — the card never
 * makes up products for somebody.
 */
export interface SearchMaker extends SearchMakerHit {
  readonly products?: readonly { readonly slug: string; readonly title: string }[];
}

/** What a row is. `all` is the door out of the card rather than a result. */
export type PaletteRowType = "product" | "person" | "all";

export interface PaletteRow {
  readonly type: PaletteRowType;
  readonly id: string;
  readonly title: string;
  /** The word at the row's right edge, saying what the row is. */
  readonly kind: string | null;
  readonly href: string;
  /** Two letters for the row's tile (a product) or disc (a person). */
  readonly initials?: string;
  /** A person's products, shown indented under the row once it is opened. */
  readonly products?: readonly PaletteRow[];
  /** The person this row is indented under, when it is one of their products. */
  readonly under?: string;
}

/**
 * The word a row wears at its right edge.
 *
 * A PRODUCT SAYS "Product", NOT ITS STAGE. The board prints "Shipping" or
 * "Idea" there. The index returns a slug, a title and a summary and no
 * stage (a product has no stored stage until OPR2 adds `profiles.stage`),
 * so the row says the one thing the read knows: what kind of thing it is.
 */
export const ROW_KIND: Record<Exclude<PaletteRowType, "all">, string> = {
  product: "Product",
  person: "Person",
};

/** How many of each the card holds. It is a jump, not the results page:
 *  past this, `See all results` is the answer. */
export const PRODUCT_ROW_LIMIT = 5;
export const PERSON_ROW_LIMIT = 3;

/** What the card says when the read answered and nothing matched. */
export const NO_MATCHES = "No matches";

/** At most two letters, never empty — the same rule the feed's tile follows. */
export function initialsOf(value: string): string {
  const words = value.split(/[\s\-_.]+/).filter((word) => word.length > 0);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * Turn the search read into the card's rows: products, then people.
 *
 * TWO CLASSES, AS THE BOARD DRAWS THEM. The dropdown this replaced also
 * derived a stack row and topic rows from the query. The card holds products
 * and people; topics and stacks are answered on the results page, where
 * `See all results` goes.
 *
 * PEOPLE ARRIVE WITH THE PRODUCTS, from the same read: `/v1/search` resolves
 * public profiles live, so somebody who turned their profile off stops being
 * findable on the next keystroke rather than on the next cache expiry.
 */
export function toRows(
  results: readonly SearchHit[],
  makers: readonly SearchMaker[] = [],
): PaletteRow[] {
  const rows: PaletteRow[] = [];
  for (const result of results) {
    if (result.kind !== "product") continue;
    if (rows.length >= PRODUCT_ROW_LIMIT) break;
    rows.push(productRow(result.entityId, result.title));
  }
  for (const maker of makers.slice(0, PERSON_ROW_LIMIT)) {
    // THEIR NAME IF THEY WROTE ONE, their handle otherwise — never a
    // generated stand-in.
    const name = maker.displayName ?? `@${maker.handle}`;
    const products = (maker.products ?? []).map((product) =>
      productRow(product.slug, product.title, maker.handle),
    );
    rows.push({
      type: "person",
      id: maker.handle,
      title: name,
      kind: ROW_KIND.person,
      href: makerPath(maker.handle),
      initials: initialsOf(name),
      ...(products.length > 0 ? { products } : {}),
    });
  }
  return rows;
}

function productRow(slug: string, title: string, under?: string): PaletteRow {
  return {
    type: "product",
    id: under ? `${under}/${slug}` : slug,
    title,
    kind: ROW_KIND.product,
    href: `/${slug}`,
    initials: initialsOf(title),
    ...(under ? { under } : {}),
  };
}

/** Can this row be opened to show something beneath it? */
export function canExpand(row: PaletteRow): boolean {
  return row.type === "person" && (row.products?.length ?? 0) > 0;
}

/**
 * The rows as the card draws them, top to bottom — and therefore the order
 * the arrow keys walk.
 *
 * A PERSON IS ONE ROW UNTIL SOMEBODY OPENS IT (design.md §2 rule 6).
 * `expanded` holds the handles a reader has opened; it starts empty, so
 * every person row starts collapsed and their products are not in the list
 * at all. Opening one puts their products directly beneath them.
 *
 * THE DOOR OUT IS LAST, and it is there whenever there is a query —
 * including when nothing matched: "nothing here, and here is where to look
 * properly" is more useful than an empty box.
 */
export function visibleRows(
  rows: readonly PaletteRow[],
  expanded: ReadonlySet<string>,
  query: string,
): PaletteRow[] {
  const out: PaletteRow[] = [];
  for (const row of rows) {
    out.push(row);
    if (canExpand(row) && expanded.has(row.id)) out.push(...(row.products ?? []));
  }
  if (query.trim().length > 0) {
    out.push({
      type: "all",
      id: "__all__",
      title: SEE_ALL_RESULTS,
      kind: null,
      href: searchPath(query),
    });
  }
  return out;
}

/**
 * Where the highlight goes on an arrow key: one row, wrapping at both ends.
 * `-1` is "no row" — the state before the first arrow, in which Enter means
 * the whole query. An empty list has nowhere to go.
 */
export function nextActive(count: number, active: number, step: 1 | -1): number {
  if (count <= 0) return -1;
  if (active < 0) return step === 1 ? 0 : count - 1;
  return (active + step + count) % count;
}

/**
 * Is the card open?
 *
 * IT OPENS ON INPUT AND ON NOTHING ELSE. Focus alone leaves the field a
 * field; the card appears with the first character and goes when the text is
 * cleared. `dismissed` is Escape or a click outside: the text stays in the
 * field, the card is put away until the reader types or returns to it.
 */
export function cardOpen(query: string, dismissed: boolean): boolean {
  return query.trim().length > 0 && !dismissed;
}
