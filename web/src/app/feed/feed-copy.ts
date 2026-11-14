// The feed's pure half (openproduct-redesign OPR-3; boards `Feed`,
// `PhoneFeed`): its addresses, its words, the list's own filter, and the
// shape of the one signed-in read behind the personal columns.
//
// PURE. Nothing here fetches or renders, so the web lane calls it directly.

import {
  POSTING_DOCS_PATH,
  isProductStage,
  type FollowedProduct,
  type MediaThumbnail,
  type MilestoneCounts,
  type ProductStage,
  type PublicProductPost,
  type PublicProductPostAuthor,
} from "@openproduct/contracts";

import { isPublishedPost } from "../posts/blocks";
import { usableCounts } from "../ui/stage";

// ─── addresses ─────────────────────────────────────────────────────────────

/** The page's one heading. The board draws no visible title, so it is read
 *  out and not drawn. */
export const FEED_TITLE = "Feed";

/**
 * A page of the feed after the first, as a document: what *Show more* links
 * to, what a crawler follows and what a reader without JavaScript opens. A
 * PATH, never a query string, so every page of the feed is one cacheable
 * document (design §4).
 */
export function feedPagePath(cursor: string): string {
  return `/feed/${encodeURIComponent(cursor)}`;
}

/** The same page as JSON, for *Show more* to append in place. */
export function feedPageDataPath(cursor: string): string {
  return `${feedPagePath(cursor)}/posts`;
}

/** The signed-in read behind the left column and the Following list. */
export const FEED_MINE_PATH = "/feed/mine";

// ─── words ─────────────────────────────────────────────────────────────────

export const FEED_MORE_LABEL = "Show more";
export const FEED_MORE_LOADING = "Loading more posts";
export const FEED_MORE_FAILED = "The next posts could not be loaded.";

/** Nobody has posted yet: the state right after launch. */
export const FEED_EMPTY_TITLE = "No posts yet";
export const FEED_EMPTY_LINE = "A post appears here when a product ships a feature, cuts a version, starts as an idea or opens a seat.";
export const FEED_EMPTY_LINKS = [
  { label: "Browse products", href: "/products" },
  { label: "How posting works", href: POSTING_DOCS_PATH },
] as const;

export const FEED_FAILED_LINE =
  "The feed could not be loaded. It is not something you did, and trying again in a moment usually works.";

// ─── the list ──────────────────────────────────────────────────────────────

/**
 * The posts a feed list draws: PUBLISHED ones only, each once.
 *
 * The public read only ever sends published posts; this is the page's own
 * check on top of it, so a draft handed over by mistake is not counted, not
 * keyed and not asked about — the card would draw nothing for it either.
 * `more` is a page appended after the first: a post that moved between two
 * reads could arrive twice, and is drawn once.
 */
export function feedPosts(
  held: readonly PublicProductPost[],
  more: readonly PublicProductPost[] = [],
): PublicProductPost[] {
  const seen = new Set<string>();
  const out: PublicProductPost[] = [];
  for (const post of [...held, ...more]) {
    if (!isPublishedPost(post) || seen.has(post.id)) continue;
    seen.add(post.id);
    out.push(post);
  }
  return out;
}

// ─── the side columns ──────────────────────────────────────────────────────

/** `2 open seats` / `1 open seat`. */
export function openSeatsLine(count: number): string {
  return `${count} open ${count === 1 ? "seat" : "seats"}`;
}

// ─── the signed-in read ────────────────────────────────────────────────────

/** How many of the visitor's products the left column draws. */
export const MY_PRODUCTS_LIMIT = 6;

/** One product the visitor is on the crew of, as "Your products" draws it. */
export interface MyFeedProduct {
  slug: string;
  stage: ProductStage;
  milestoneCounts: MilestoneCounts | null;
  logo: MediaThumbnail | null;
  openSeats: number;
}

/** `GET /feed/mine`: everything personal the feed draws, in one answer. */
export interface FeedMine {
  products: MyFeedProduct[];
  following: { products: FollowedProduct[]; people: PublicProductPostAuthor[] };
}

/** How many things the visitor follows: products and people. */
export function followingCount(mine: Pick<FeedMine, "following">): number {
  return mine.following.products.length + mine.following.people.length;
}

function thumbnailOf(value: unknown): MediaThumbnail | null {
  return typeof value === "object" && value !== null ? (value as MediaThumbnail) : null;
}

/**
 * Read a `/feed/mine` body, or refuse. Every member is checked and a member
 * that is not the shape is dropped: a body this page does not understand
 * reads as "nothing personal", which is the signed-out page and always
 * correct.
 */
export function parseFeedMine(body: unknown): FeedMine | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const { products, following } = data as { products?: unknown; following?: unknown };
  if (!Array.isArray(products) || typeof following !== "object" || following === null) return null;
  const follows = following as { products?: unknown; people?: unknown };

  const mine: MyFeedProduct[] = [];
  for (const entry of products) {
    if (typeof entry !== "object" || entry === null) continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.slug !== "string" || p.slug.length === 0 || !isProductStage(p.stage)) continue;
    mine.push({
      slug: p.slug,
      stage: p.stage,
      milestoneCounts: usableCounts(p.milestoneCounts as MilestoneCounts | null | undefined),
      logo: thumbnailOf(p.logo),
      openSeats: typeof p.openSeats === "number" && Number.isFinite(p.openSeats) && p.openSeats > 0 ? Math.floor(p.openSeats) : 0,
    });
  }

  const followedProducts: FollowedProduct[] = [];
  for (const entry of Array.isArray(follows.products) ? follows.products : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.slug !== "string" || p.slug.length === 0 || !isProductStage(p.stage)) continue;
    followedProducts.push({
      slug: p.slug,
      name: typeof p.name === "string" && p.name.length > 0 ? p.name : p.slug,
      stage: p.stage,
      tagline: typeof p.tagline === "string" ? p.tagline : null,
      logo: thumbnailOf(p.logo),
    });
  }

  const followedPeople: PublicProductPostAuthor[] = [];
  for (const entry of Array.isArray(follows.people) ? follows.people : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const p = entry as Record<string, unknown>;
    if (typeof p.handle !== "string" || p.handle.length === 0) continue;
    followedPeople.push({ handle: p.handle, displayName: typeof p.displayName === "string" ? p.displayName : null });
  }

  return { products: mine, following: { products: followedProducts, people: followedPeople } };
}

// ─── focus as you scroll ───────────────────────────────────────────────────

/** The attribute a feed card's list item wears; the rule below finds it. */
export const FEED_CARD_ATTRIBUTE = "data-feed-card";

/**
 * The board's "focus as you scroll": a card fully on screen is at rest, and
 * one entering or leaving sits very slightly back (scale .985).
 *
 * A SCROLL-DRIVEN ANIMATION, AS THE BOARD HAS IT, and nothing else: no
 * script, no observer, no state. It is a transform, so it moves no layout
 * (nothing for CLS to count), and it is inside `@supports` and
 * `prefers-reduced-motion: no-preference`, so a browser without view
 * timelines and a reader who asked for less motion both get the plain list.
 *
 * THE BOARD ALSO DIMS (opacity .85). That half is deliberately absent: the
 * muted text is 4.5:1 on the card at full opacity (design §3), so any
 * dimming puts the words of a card that is half on screen under AA — and the
 * first card below the fold is in exactly that state when the page loads.
 */
export const FEED_FOCUS_CSS =
  "@media (prefers-reduced-motion: no-preference){@supports (animation-timeline: view()){" +
  "@keyframes op-feed-focus{entry 0%{transform:scale(.985)}entry 100%{transform:scale(1)}exit 0%{transform:scale(1)}exit 100%{transform:scale(.985)}}" +
  `[${FEED_CARD_ATTRIBUTE}]{transform-origin:50% 50%;animation:op-feed-focus linear both;animation-timeline:view();animation-range:entry 0% exit 100%}` +
  "}}";
