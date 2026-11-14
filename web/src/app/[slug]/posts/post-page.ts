// A post's own page, the pure half (openproduct-redesign OPR-3; boards
// `Post`, `PhonePost`): what the address resolves to, the page's words, its
// two anchors and the side column's list.
//
// PURE. Nothing here fetches or renders, so the web lane calls it directly.

import {
  PRODUCT_POST_KIND_LABELS,
  productPostPagePath,
  threadAcceptsPosts,
  type PublicPost,
  type PublicProductPost,
  type PublicThread,
} from "@openproduct/contracts";

import { isPublishedPost, postHeadline, postSummary } from "../../posts/blocks";

// ─── the address ───────────────────────────────────────────────────────────

/**
 * What `/{slug}/posts/{id}` is, given what the public read answered.
 *
 *   missing   no such post, a draft, a removed one, a post whose product is
 *             not listed, or a read that failed — the public read answers all
 *             of them with nothing, and so does this page: the site's
 *             not-found, which never says which it was.
 *   moved     the post is real and published, and the slug in the address is
 *             not its product's. A product's name IS its slug and a rename
 *             changes the address, so every link written before the rename
 *             says the old one: the page redirects to the post's own address
 *             rather than 404 a post that exists. It discloses nothing — the
 *             post is public, and its id was already in the address.
 *   here      this is the post's address.
 */
export type PostPageVerdict =
  | { readonly kind: "missing" }
  | { readonly kind: "moved"; readonly to: string }
  | { readonly kind: "here"; readonly post: PublicProductPost };

export function postPageVerdict(post: unknown, slug: string): PostPageVerdict {
  // The public read sends published posts only; this is the page's own check
  // on top of it, so a draft that reached here by any path is still a 404.
  if (!isPublishedPost(post)) return { kind: "missing" };
  if (post.product.slug !== slug) return { kind: "moved", to: productPostPagePath(post.product.slug, post.id) };
  return { kind: "here", post };
}

// ─── the anchors ───────────────────────────────────────────────────────────

/** The comments section's id: a card's `N comments` link lands here. */
export const POST_COMMENTS_ID = "comments";
/** The comment box's id: a card's *Comment* lands here. */
export const POST_COMMENT_ID = "comment";

/** Where a comment on this post is sent: this page's own route. */
export function postCommentPath(slug: string, postId: string): string {
  return `${productPostPagePath(slug, postId)}/comment`;
}

// ─── the words ─────────────────────────────────────────────────────────────

/** The tab's title: the post's headline and whose it is. */
export function postPageTitle(post: Pick<PublicProductPost, "kind" | "blocks" | "product">): string {
  return `${postHeadline(post)} · ${post.product.name}`;
}

/** The page's one heading, read out (the card draws the headline itself). */
export function postPageHeading(post: Pick<PublicProductPost, "kind" | "blocks" | "product">): string {
  return `${post.product.name}: ${postHeadline(post)}`;
}

const DESCRIPTION_MAX = 200;

/** The description a search result or a share card shows: the post's own
 *  summary, or what kind of post it is. Never empty. */
export function postPageDescription(post: Pick<PublicProductPost, "kind" | "blocks" | "product">): string {
  const summary = postSummary(post);
  const text = summary ?? `${PRODUCT_POST_KIND_LABELS[post.kind]} from ${post.product.name}.`;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > DESCRIPTION_MAX ? `${flat.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : flat;
}

export const POST_COMMENTS_CLOSED = "Closed to new comments.";
export const POST_COMMENTS_UNREAD = "The comments could not be loaded. Trying again in a moment usually works.";
export const POST_COMMENT_REMOVED = "This comment was removed.";
export const POST_SHARE_LABEL = "Share";
export const POST_SHARE_COPIED = "Link copied";
export const POST_SHARE_FAILED = "Could not copy";

/** `2 replies` / `1 reply`: the phone's toggle. */
export function repliesLabel(count: number): string {
  return `${count} ${count === 1 ? "reply" : "replies"}`;
}

/** What the route's redirect says back, read by the comment box. */
export const POST_COMMENT_NOTICES: Readonly<Record<string, string>> = {
  invalid: "That comment was empty or too long to post.",
  failed: "That comment did not post. Comments may be closed, or your account may not be eligible yet.",
};

// ─── the thread ────────────────────────────────────────────────────────────

/**
 * Can somebody comment? Only on a post that has a thread, when that thread
 * was read and is open. `unread` is a thread that exists and did not answer:
 * the box stays (the write goes to the post, not to this read) and the list
 * says it could not be loaded.
 */
export type PostThreadState = "open" | "closed" | "unread" | "none";

export function postThreadState(
  post: Pick<PublicProductPost, "threadId">,
  read: { thread: Pick<PublicThread, "state"> } | null,
): PostThreadState {
  if (!post.threadId) return "none";
  if (!read) return "unread";
  return threadAcceptsPosts(read.thread.state) ? "open" : "closed";
}

/** The comments a reader can see, counted the way the cards count them:
 *  removed ones keep their place and are not counted. */
export function visibleCommentCount(posts: readonly Pick<PublicPost, "state">[]): number {
  return posts.filter((post) => post.state !== "removed").length;
}

// ─── the side column ───────────────────────────────────────────────────────

/** How many other posts "More from" lists. */
export const MORE_POSTS_LIMIT = 4;

/**
 * "More from {product}": the product's other published posts, newest first.
 * The post being read is not one of them, and a draft never is.
 */
export function morePostsOf(
  posts: readonly PublicProductPost[],
  currentId: string,
  limit = MORE_POSTS_LIMIT,
): PublicProductPost[] {
  return posts.filter((post) => isPublishedPost(post) && post.id !== currentId).slice(0, limit);
}
