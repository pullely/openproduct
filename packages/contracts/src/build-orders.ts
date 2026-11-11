// The front page's four orders (openproduct-open-builds OB4, D1).
//
// `/` is *Open builds*: the list of builds, led by a sort control whose four
// orders are each one published sentence. Most active is the default and the
// one the catalogue pages by; the other three are views of the same list.
//
// ─── EACH ORDER IS AN ADDRESS, NOT A QUERY STRING ─────────────────────────
//
// `/builds/newest`, `/builds/upvoted`, `/builds/roles` — path segments, for
// the reason the leaderboard's ranges are (UV2): a page that reads
// `searchParams` is dynamic in Next, `revalidate` is then ignored, and the
// document goes out `no-store` to every visitor. Each order is one cacheable
// document at one address (OPC-1), and the control is four plain links
// (OPP2's no-JavaScript posture).
//
// ─── NOTHING HERE MAKES A NEW RANKING ─────────────────────────────────────
//
// Three of the four orders were published before this module: Most active
// (OB3), Newest (DS2) and the all-time upvote order (DS2's `sort.most-saved`,
// which counts endorsements — what the site has called upvotes since UV0).
// Roles adds a FILTER over Most active, not a fifth comparator: a build with
// an open role, in the order the front page already explains.

import { byMostActive, byMostEndorsed, byNewest, mostActiveScoreOf } from "./ranking.js";
import { frontPageEligible } from "./completeness.js";
import type { FormulaId } from "./provenance.js";
import type { PublicProfileCard } from "./index.js";

export const BUILD_ORDERS = ["most-active", "newest", "upvoted", "roles"] as const;
export type BuildOrder = (typeof BUILD_ORDERS)[number];

/** The control's words, in the control's order. */
export const BUILD_ORDER_LABEL: Record<BuildOrder, string> = {
  "most-active": "Most active",
  newest: "Newest",
  upvoted: "Upvoted",
  roles: "Roles",
};

/** The sentence behind each order, at `/docs/formulas#<id>`. */
export const BUILD_ORDER_FORMULA: Record<BuildOrder, FormulaId> = {
  "most-active": "sort.most-active",
  newest: "sort.newest",
  upvoted: "sort.most-saved",
  roles: "sort.roles",
};

/** What the count line says the order is, after the count. */
export const BUILD_ORDER_PHRASE: Record<BuildOrder, string> = {
  "most-active": "most active first",
  newest: "newest first",
  upvoted: "most upvoted first",
  roles: "with an open role, most active first",
};

/** The orders that live under `/builds/`; Most active is `/` itself. */
export const BUILD_ORDER_SEGMENTS = ["newest", "upvoted", "roles"] as const satisfies readonly BuildOrder[];

export function isBuildOrder(value: unknown): value is BuildOrder {
  return typeof value === "string" && (BUILD_ORDERS as readonly string[]).includes(value);
}

/** Where an order lives. */
export function buildOrderPath(order: BuildOrder): string {
  return order === "most-active" ? "/" : `/builds/${order}`;
}

/**
 * The builds the front page shows, in one order.
 *
 * PURE — cards in, cards out. The floor (IN3) runs FIRST and is a filter: it
 * can only remove, never move (the property `feed.test.ts` has held since
 * IN3). Then the order's own comparator, the same one every other surface
 * imports from `ranking.ts`. Roles narrows to builds with at least one open
 * role and keeps the Most active order.
 */
export function orderBuilds(cards: readonly PublicProfileCard[], order: BuildOrder): PublicProfileCard[] {
  const shown = cards.filter((card) => frontPageEligible(card));
  switch (order) {
    case "most-active":
      return shown.sort(byMostActive);
    case "newest":
      return shown.sort(byNewest);
    case "upvoted":
      return shown.sort(byMostEndorsed);
    case "roles":
      return shown.filter((card) => card.roleOpeningCount > 0).sort(byMostActive);
  }
}

/** How many listed builds the floor keeps off the front page — the complement
 *  of `orderBuilds`' filter over the same array (WC-7). */
export function buildsBelowFloor(cards: readonly PublicProfileCard[]): number {
  return cards.filter((card) => !frontPageEligible(card)).length;
}

/** The most rows one order's page draws. Most active pages past it by cursor;
 *  the other three say "first N of M" rather than going quiet about the rest. */
export const BUILD_ORDER_PAGE_SIZE = 100;

/**
 * The line beside the control: how many, in what order, and what the floor
 * holds back — the catalogue line (HB0) in the words of builds.
 */
export function buildsMeta(order: BuildOrder, count: number, belowFloor = 0, total: number | null = null): string {
  const noun = (n: number) => (n === 1 ? "build" : "builds");
  const phrase = BUILD_ORDER_PHRASE[order];
  // `total` counts every listed build, the floor's included, so "first N of
  // M" is said only when there is more than the shown and the withheld.
  const head =
    total !== null && total > count + belowFloor
      ? `first ${count} of ${total.toLocaleString("en-US")} ${noun(total)}`
      : `${count} ${noun(count)}`;
  return belowFloor > 0 ? `${head} · ${phrase} · ${belowFloor} more below the floor` : `${head} · ${phrase}`;
}

/** What an order with nothing in it says — Roles is the one that can be empty
 *  while the catalogue is not. */
export const BUILD_ORDER_EMPTY: Record<BuildOrder, string> = {
  "most-active": "No builds are listed yet.",
  newest: "No builds are listed yet.",
  upvoted: "No builds are listed yet.",
  roles: "No build has an open role right now. A maintainer opens one from their studio.",
};

// ─── the build tile (openproduct-calm CL2) ───────────────────────────────

/**
 * A tile's three figures, each named ONCE (CL-R3, CL-R4): the row used to
 * say "changes this week" and "roles open" as a sentence beside every
 * number; the tile names each figure in a small label and lets the number
 * stand.
 */
export const BUILD_TILE_LABEL = {
  changes: "Changes · 7d",
  upvotes: "Upvotes · 7d",
  roles: "Roles open",
} as const;

/**
 * The caption beside the sort tabs: each order in one line (CL-R5, CL-R6).
 * It replaced the margin's four paragraphs; it links to the order's
 * published sentence, which still says everything.
 */
export const BUILD_ORDER_CAPTION: Record<BuildOrder, string> = {
  "most-active": "(changes + 1) × (upvotes + 1) · 7 days",
  newest: "first published, newest first",
  upvoted: "all-time upvotes, most first",
  roles: "builds with an open role, most active first",
};

/** What the endless list says while it reads the next page (CL-R7). */
export const MORE_BUILDS_LOADING = "Loading more builds";

/** What it says when that read failed. The plain link stays beside it. */
export const MORE_BUILDS_FAILED = "The next builds could not be loaded.";

// ─── the sidebar's explainer ─────────────────────────────────────────────

/** The card that says how the default order works, in the margin of `/`. */
export const MOST_ACTIVE_CARD_HEADING = "How Most active works";

/** Its three lines: the formula, why a product, and what a dash means. */
export const MOST_ACTIVE_CARD_LINES = [
  "Merged changes times upvotes over the last seven days, each plus one.",
  "A build needs both work and interest to lead, and neither alone can carry it.",
  "A build whose repo we cannot read shows a dash, never a zero, and sorts after every observed build.",
] as const;

// ─── the build page's rank (OB5) ─────────────────────────────────────────

/**
 * A build's position in the front page's Most active order, read from the
 * same catalogue document the front page orders — so the build page and the
 * list cannot disagree about who is third (OL-2a, OPC-4).
 *
 * NULL, never a number, when there is no honest position to give: the build
 * is below the floor (it is not on the list), its changes are not observed
 * (no score, and "last" is not a rank), or it is not in the catalogue read
 * at all (past the first page). The page renders a dash for each.
 */
export function mostActiveRankOf(cards: readonly PublicProfileCard[], slug: string): number | null {
  const ordered = orderBuilds(cards, "most-active");
  const index = ordered.findIndex((card) => card.slug === slug);
  if (index === -1) return null;
  if (mostActiveScoreOf(ordered[index]!) === null) return null;
  return index + 1;
}

/** The build page's stat strip (OB5), in its order: how the build is moving,
 *  moved up from the rail so it is the first thing under the name. */
export const BUILD_STAT_LABEL = {
  changes: "Changes, 7 days",
  upvotes: "Upvotes, 7 days",
  rank: "Most active",
  lastMerge: "Last merge",
} as const;

/** The rail's third panel: what the maintainers answered about the build. */
export const BUILD_DETAILS_HEADING = "Details";

/** The build page's roles section, in the reader's word (D4). */
export const BUILD_ROLES_HEADING = "Open roles";

/** The hero's pill: how many roles are open, said as roles (D4). */
export function rolesOpenLabel(count: number): string {
  return count === 1 ? "1 role open" : `${count} roles open`;
}
