// A product page's tabs, and which page an address draws (openproduct-redesign
// OPR-3; boards `Product`, `ProductIdea`).
//
// ONE ADDRESS, TWO PAGES. `/{slug}` is the SHIPPING page when the product's
// `stage` is `shipping` and the IDEA page when it is `idea`. The stage comes
// off the public product document, so the choice is the same for every
// visitor and the page caches at the edge.
//
// THE TABS ARE ADDRESSES, NOT STATE. A shipping product's four views are four
// static routes:
//
//   Updates  /{slug}                    (and /{slug}/updates/{cursor} for the
//                                        pages after the first)
//   About    /{slug}/about
//   Crew     /{slug}/crew
//   Talk     /{slug}/talk
//
// Each is its own cached document (`revalidate = 60`, no search params read on
// the server), so a tab can be linked, shared and opened in a new tab, and
// switching one costs a navigation the router already prefetches. Nothing
// about which tab is open is kept in the browser.
//
// An idea product has NO tabs (board `ProductIdea`): everything is on the one
// page, and its `/about`, `/crew` and `/talk` addresses go to `/{slug}`.
//
// PURE, AND NO JSX: the web test lane is module-level.

import type { ProductStage } from "@openproduct/contracts";

export const PRODUCT_TABS = ["updates", "about", "crew", "talk"] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

export const PRODUCT_TAB_LABELS: Record<ProductTab, string> = {
  updates: "Updates",
  about: "About",
  crew: "Crew",
  talk: "Talk",
};

/** The tab row's accessible name (board `Product`). */
export const PRODUCT_TABS_LABEL = "Product sections";

/** Which of the two pages an address draws. */
export type ProductPageKind = "shipping" | "idea";

/**
 * The page for a stage. Only the literal `idea` draws the idea page: a
 * document cached before the stage existed carries none, and it draws the
 * shipping page — the page that address has always been.
 */
export function pageKindOf(stage: ProductStage | null | undefined | unknown): ProductPageKind {
  return stage === "idea" ? "idea" : "shipping";
}

/** A tab's address. Updates is the product's own address. */
export function productTabPath(slug: string, tab: ProductTab): string {
  return tab === "updates" ? `/${slug}` : `/${slug}/${tab}`;
}

/**
 * A later page of a product's updates. The cursor is in the PATH, as the
 * directory's is (`/products/{cursor}`): a page that read `?cursor=` would be
 * rendered per request and could not be cached.
 */
export function productUpdatesPagePath(slug: string, cursor: string): string {
  return `/${slug}/updates/${encodeURIComponent(cursor)}`;
}

/** The cursor out of that path's segment. A segment that does not decode is
 *  passed as it came: the read then answers "could not be read". */
export function updatesCursorOf(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export interface ProductTabLink {
  readonly tab: ProductTab;
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}

/** The tab row, in the board's order, with the open one marked. */
export function productTabLinks(slug: string, current: ProductTab): readonly ProductTabLink[] {
  return PRODUCT_TABS.map((tab) => ({
    tab,
    label: PRODUCT_TAB_LABELS[tab],
    href: productTabPath(slug, tab),
    current: tab === current,
  }));
}

/**
 * Where the anchors other pages link to now live.
 *
 * Before the tabs, `/{slug}#discussion`, `/{slug}#people-wanted` and
 * `/{slug}#changed` were all on the one page; a comment's return address, an
 * inbox row, a Help wanted card and the weekly digest still link to them.
 * Each now belongs to a tab, and `anchor-forward.tsx` sends an arrival at an
 * anchor that is not on the open tab to the tab that has it.
 */
export const ANCHOR_TABS: Readonly<Record<string, ProductTab>> = {
  discussion: "talk",
  talk: "talk",
  // OPR-4 — Talk's list, and Talk opened on its Private filter.
  threads: "talk",
  private: "talk",
  "people-wanted": "crew",
  seats: "crew",
  makers: "crew",
  about: "about",
  install: "about",
  milestones: "about",
  details: "about",
  changed: "about",
  launches: "about",
  post: "updates",
};

/** The tab an anchor is on, or null for an anchor no tab owns. */
export function tabForAnchor(anchor: string): ProductTab | null {
  const id = anchor.replace(/^#/, "");
  // A comment's own anchor (`comment-…`, `vote-…` inside the conversation)
  // belongs to the conversation.
  if (/^comment-/.test(id)) return "talk";
  return Object.hasOwn(ANCHOR_TABS, id) ? ANCHOR_TABS[id]! : null;
}

/**
 * Where an arrival at `/{slug}…#anchor` should be, or null when it is already
 * there (or the anchor is nobody's). The query is kept: a comment's return
 * carries `?commented=ok`.
 */
export function forwardedAddress(
  slug: string,
  current: ProductTab,
  search: string,
  hash: string,
): string | null {
  if (hash.length <= 1) return null;
  const tab = tabForAnchor(hash);
  if (tab === null || tab === current) return null;
  return `${productTabPath(slug, tab)}${search}${hash.startsWith("#") ? hash : `#${hash}`}`;
}
