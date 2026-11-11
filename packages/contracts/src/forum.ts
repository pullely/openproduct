/**
 * The forum index (openproduct-worldclass-v2 FO1).
 *
 * `/threads` was a flat list; the benchmark has categories and two orders.
 * This is that, without a *hot* sort and without a new object: a thread is
 * still a thread on a listing, and the index is every one of them on public
 * listings, in one of two PUBLISHED orders (OPC-4) — *Latest* (newest
 * thread first) and *Most replied* (the visible-post count, the same count
 * the row shows and the launch row shows, so it is one number).
 *
 * THE CATEGORIES ARE THE SIX TAGS THE THREAD PLANE ALREADY HAS. The plan
 * wrote four; the vocabulary that exists is six and closed (`THREAD_TAGS`),
 * and a fourth-of-six is a filter nobody could type. The launch thread's
 * `launch` tag is not a category here — that thread is a listing's comment
 * section and lives on the listing.
 *
 * THE ORDER AND THE TAG ARE PATH SEGMENTS, not query parameters, for the
 * reason `leaderboard.ts` gives: a page that reads `searchParams` is dynamic
 * and goes out `no-store`. `/threads` is the latest; `/threads/replied` the
 * most replied; `/threads/tag/<tag>` and `/threads/tag/<tag>/replied` the
 * same two, filtered.
 */
import { THREAD_TAGS, THREAD_TAG_LABELS, type ChosenThreadTag, type PublicThread } from "./discussions.js";
import type { FormulaId } from "./provenance.js";

export const FORUM_PATH = "/threads";

export const FORUM_ORDERS = ["latest", "replied"] as const;
export type ForumOrder = (typeof FORUM_ORDERS)[number];

/** An absent order is the latest; an unknown one is refused, never coerced. */
export function parseForumOrder(raw: string | null | undefined): ForumOrder | null {
  if (raw === null || raw === undefined || raw === "") return "latest";
  return (FORUM_ORDERS as readonly string[]).includes(raw) ? (raw as ForumOrder) : null;
}

/** A tag filter: one of the six, or none. An unknown tag is refused. */
export function parseForumTag(raw: string | null | undefined): ChosenThreadTag | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  return (THREAD_TAGS as readonly string[]).includes(raw) ? (raw as ChosenThreadTag) : undefined;
}

/** `/threads`, `/threads/replied`, `/threads/tag/<tag>`, `/threads/tag/<tag>/replied`. */
export function forumPath(order: ForumOrder = "latest", tag: ChosenThreadTag | null = null): string {
  const base = tag ? `${FORUM_PATH}/tag/${encodeURIComponent(tag)}` : FORUM_PATH;
  return order === "latest" ? base : `${base}/replied`;
}

export const FORUM_ORDER_LABEL: Readonly<Record<ForumOrder, string>> = {
  latest: "Latest",
  replied: "Most replied",
};

export const FORUM_THREAD_LIMIT = 50;

/**
 * A thread tile's figures, each named once (openproduct-calm-pages CP3,
 * CL-R4): the visible replies, and when the thread last moved — its last
 * reply, or when it was started if nobody has replied.
 */
export const THREAD_TILE_LABEL = {
  replies: "Replies",
  lastReply: "Last reply",
  started: "Started",
} as const;

/** One row of the index: the thread, and the listing it lives on. */
export interface ForumThread extends PublicThread {
  /** The listing's slug — the row's second line and the thread's home. */
  readonly slug: string;
}

export const FORUM_THREAD_KEYS = [
  "id",
  "tag",
  "title",
  "authorHandle",
  "authorName",
  "state",
  "createdAt",
  "lastPostAt",
  "postCount",
  "slug",
] as const;

export interface Forum {
  readonly order: ForumOrder;
  readonly tag: ChosenThreadTag | null;
  readonly threads: readonly ForumThread[];
  /** The order's own formula, so the page links the sentence (OPC-4). */
  readonly formula: FormulaId;
}

export const FORUM_LATEST_FORMULA: FormulaId = "threads.latest";
export const FORUM_REPLIED_FORMULA: FormulaId = "threads.most-replied";

export function forumFormula(order: ForumOrder): FormulaId {
  return order === "latest" ? FORUM_LATEST_FORMULA : FORUM_REPLIED_FORMULA;
}

/** The chips over the list: every category, labelled from the vocabulary. */
export function forumCategories(): readonly { value: ChosenThreadTag; label: string }[] {
  return THREAD_TAGS.map((value) => ({ value, label: THREAD_TAG_LABELS[value] }));
}

// ---------------------------------------------------------------------------
// FO2 — one forum per product
// ---------------------------------------------------------------------------

/** `/{slug}/forum` — the launch thread plus every thread that tagged the
 *  listing. The SAME document the listing page reads (PP0's), at an address
 *  of its own, so a link to "the conversation about X" has somewhere to go
 *  that is not the middle of the product page. */
export function listingForumPath(slug: string): string {
  return `/${encodeURIComponent(slug)}/forum`;
}

export const LISTING_FORUM_TITLE = "Forum";

/** What the page is, said under its heading. */
export function listingForumMeaning(slug: string): string {
  return `Everything said about ${slug} here: the comments on its launch, and every thread somebody started about it. A thread started here is also on /threads.`;
}

export const LISTING_FORUM_THREADS_HEADING = "Threads about this product";

export const LISTING_FORUM_EMPTY_NOTE =
  "No threads yet. A thread is a titled conversation — a question, a proposal, a design note — with an address of its own.";

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

export const FORUM_TITLE = "Threads";

export const FORUM_MEANING =
  "Every thread on a public listing, in one of two orders: newest first, or by how many people have replied. Nothing here is weighted by who is reading, and nothing is hot.";

export const FORUM_EMPTY_NOTE =
  "No threads yet. A thread is a titled conversation about one product — start one and it lives here and on the product's forum.";

/** What the list IS, said where it begins. */
export function forumMeaning(order: ForumOrder, tag: ChosenThreadTag | null): string {
  const scope = tag ? `${THREAD_TAG_LABELS[tag]} threads` : "Every thread";
  return order === "latest"
    ? `${scope} on a public listing, newest first.`
    : `${scope} on a public listing, by visible replies, most first — ties by the latest reply.`;
}
