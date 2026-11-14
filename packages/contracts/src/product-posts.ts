// Product posts (openproduct-redesign OPR-3, design §6.1 and §6.2).
//
// A PRODUCT POST IS NOT A FORUM POST. `posts`, `post_votes` and `PublicPost`
// in this codebase are replies in a thread (CB1). What a product says for
// itself — a feature shipped, a version, a demo, an idea, a seat — is a
// PRODUCT POST everywhere: `product_posts` at rest, `PublicProductPost` on the
// wire, `/product-posts` in every address.
//
// TEMPLATE-ONLY (design §2.1). A post is one of five kinds; each kind has a
// fixed list of blocks in a fixed order; a maker adds or removes the optional
// ones and never reorders. This file is the single source for that list: the
// builder draws it, `validatePostBlocks` enforces it in core, and the card
// reads it to know which block is which.

import type { MediaThumbnail } from "./media.js";

// ---------------------------------------------------------------------------
// Stage and milestones (§6.1)
// ---------------------------------------------------------------------------

/** A product is an idea until its first milestone ships. */
export const PRODUCT_STAGES = ["idea", "shipping"] as const;
export type ProductStage = (typeof PRODUCT_STAGES)[number];

export const PRODUCT_STAGE_LABELS: Record<ProductStage, string> = {
  idea: "Idea",
  shipping: "Shipping",
};

export function isProductStage(value: unknown): value is ProductStage {
  return typeof value === "string" && (PRODUCT_STAGES as readonly string[]).includes(value);
}

/** The bounds a milestone is stored under. They are the Feature shipped
 *  post's own limits, so a post prefilled from a milestone always fits. */
export const MILESTONE_CODE_MAX = 20;
export const MILESTONE_TITLE_MAX = 60;
export const MILESTONE_SUMMARY_MAX = 200;
/** How many milestones one product may hold. */
export const MILESTONE_MAX_PER_PRODUCT = 60;

/** A milestone as a visitor reads it. */
export interface PublicMilestone {
  code: string;
  title: string;
  summary: string | null;
  /** Null until it shipped. */
  shippedAt: string | null;
}

export const PUBLIC_MILESTONE_KEYS = ["code", "shippedAt", "summary", "title"] as const;

/** "3 of 4": the product page's progress bar. */
export interface MilestoneCounts {
  shipped: number;
  total: number;
}

export const MILESTONE_COUNTS_KEYS = ["shipped", "total"] as const;

export function milestoneCountsOf(milestones: readonly Pick<PublicMilestone, "shippedAt">[]): MilestoneCounts {
  return {
    shipped: milestones.filter((milestone) => milestone.shippedAt !== null).length,
    total: milestones.length,
  };
}

/** A milestone as its crew edits it. */
export interface CrewMilestone extends PublicMilestone {
  id: string;
  position: number;
}

export const CREW_MILESTONE_KEYS = ["code", "id", "position", "shippedAt", "summary", "title"] as const;

export interface MilestoneRequest {
  code: string;
  title: string;
  summary?: string | null;
}

/** `PUT …/milestones` — every milestone id of the product, in the new order. */
export interface ReorderMilestonesRequest {
  order: string[];
}

// ---------------------------------------------------------------------------
// Kinds, blocks, the catalogue (§6.2)
// ---------------------------------------------------------------------------

export const PRODUCT_POST_KINDS = ["feature", "version", "demo", "idea", "seat"] as const;
export type ProductPostKind = (typeof PRODUCT_POST_KINDS)[number];

export const PRODUCT_POST_KIND_LABELS: Record<ProductPostKind, string> = {
  feature: "Feature shipped",
  version: "New version",
  demo: "Demo",
  idea: "New idea",
  seat: "Help wanted",
};

export function isProductPostKind(value: unknown): value is ProductPostKind {
  return typeof value === "string" && (PRODUCT_POST_KINDS as readonly string[]).includes(value);
}

/**
 * The kinds a crew member may author through the builder. `demo` is in the
 * vocabulary and the catalogue, and is made by recording (OPR4), never typed.
 */
export const AUTHORED_PRODUCT_POST_KINDS = ["feature", "version", "idea", "seat"] as const;
export type AuthoredProductPostKind = (typeof AUTHORED_PRODUCT_POST_KINDS)[number];

export function isAuthoredProductPostKind(value: unknown): value is AuthoredProductPostKind {
  return typeof value === "string" && (AUTHORED_PRODUCT_POST_KINDS as readonly string[]).includes(value);
}

export const PRODUCT_POST_STATES = ["draft", "published", "removed"] as const;
export type ProductPostState = (typeof PRODUCT_POST_STATES)[number];

/**
 * What a block holds.
 *
 *   line   one line of text
 *   text   a short paragraph; line breaks allowed
 *   lines  a list, one entry per line
 *   url    one absolute http(s) address
 *
 * A VALUE IS ALWAYS A STRING. A `lines` block is its entries joined by a line
 * break, and its limit counts the whole of it; `postBlockLines` splits it.
 */
export const POST_BLOCK_TYPES = ["line", "text", "lines", "url"] as const;
export type PostBlockType = (typeof POST_BLOCK_TYPES)[number];

export interface PostBlockSpec {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
  readonly type: PostBlockType;
  /** The most characters the value may hold. */
  readonly limit: number;
}

const block = (
  id: string,
  label: string,
  required: boolean,
  type: PostBlockType,
  limit: number,
): PostBlockSpec => ({ id, label, required, type, limit });

/** Every kind's blocks, in the order they are written and drawn. */
export const POST_BLOCK_CATALOGUE: Record<ProductPostKind, readonly PostBlockSpec[]> = {
  feature: [
    block("feature", "Feature", true, "line", 60),
    block("what", "What it does", true, "text", 200),
    block("try", "Try it", true, "url", 200),
    block("for", "For", false, "line", 60),
    block("milestone", "Milestone", false, "line", 20),
    block("screenshot", "Screenshot", false, "url", 200),
    block("demo", "Demo", false, "url", 200),
  ],
  version: [
    block("version", "Version", true, "line", 20),
    block("added", "Added", true, "lines", 300),
    block("changed", "Changed", false, "lines", 300),
    block("fixed", "Fixed", false, "lines", 300),
    block("security", "Security", false, "lines", 300),
    block("breaking", "Breaking change", false, "text", 200),
  ],
  idea: [
    block("problem", "Problem", true, "text", 200),
    block("who", "Who has it", true, "line", 80),
    block("why-now", "Why now", false, "text", 200),
    block("detail", "More detail", false, "text", 400),
    block("seats", "Seats needed", false, "line", 80),
    block("evidence", "Evidence", false, "url", 200),
  ],
  seat: [
    block("role", "Role", true, "line", 60),
    block("what", "What you'd do", true, "text", 200),
    block("time", "Time", false, "line", 40),
    block("return", "In return", false, "line", 80),
    block("skills", "Skills", false, "line", 80),
  ],
  demo: [
    block("title", "Title", false, "line", 80),
    block("note", "Note", false, "text", 200),
  ],
};

export function postBlocksOf(kind: ProductPostKind): readonly PostBlockSpec[] {
  return POST_BLOCK_CATALOGUE[kind];
}

export function postBlockSpec(kind: ProductPostKind, blockId: string): PostBlockSpec | null {
  return POST_BLOCK_CATALOGUE[kind].find((spec) => spec.id === blockId) ?? null;
}

/** One block of a post, as stored and as sent. */
export interface ProductPostBlock {
  block: string;
  value: string;
}

export const PRODUCT_POST_BLOCK_KEYS = ["block", "value"] as const;

/** The value of one block of a post, or null when the post does not carry it. */
export function postBlockValue(blocks: readonly ProductPostBlock[], blockId: string): string | null {
  return blocks.find((entry) => entry.block === blockId)?.value ?? null;
}

/** A `lines` block's entries: one per line, blank lines dropped. */
export function postBlockLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** An absolute http(s) address, normalised; null for anything else. */
export function postUrl(value: string): string | null {
  const text = value.trim();
  if (text.length === 0 || /\s/.test(text)) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const POST_BLOCK_ERROR_CODES = [
  "unknown_block",
  "out_of_order",
  "duplicate",
  "over_limit",
  "required",
  "invalid_value",
] as const;
export type PostBlockErrorCode = (typeof POST_BLOCK_ERROR_CODES)[number];

export interface PostBlockError {
  /** The block the error is about: its id, as sent. */
  block: string;
  code: PostBlockErrorCode;
  message: string;
}

export interface ValidatePostBlocksOptions {
  /**
   * `publish` (the default) is the whole rule. `draft` is the same rule less
   * one line: a required block may be empty or absent, because a draft is a
   * post somebody has not finished.
   */
  mode?: "publish" | "draft";
}

/** A post never holds more blocks than its kind has. */
export const POST_BLOCKS_MAX = 8;

/**
 * Read `blocks` from an untrusted body: a list of `{block, value}` with string
 * members, or null. Values are trimmed and line endings normalised, so a limit
 * counts what a reader sees.
 */
export function parsePostBlocks(raw: unknown): ProductPostBlock[] | null {
  if (!Array.isArray(raw) || raw.length > POST_BLOCKS_MAX * 2) return null;
  const out: ProductPostBlock[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { block: id, value } = entry as { block?: unknown; value?: unknown };
    if (typeof id !== "string" || typeof value !== "string") return null;
    out.push({ block: id, value: value.replace(/\r\n?/g, "\n").trim() });
  }
  return out;
}

/**
 * Check a post's blocks against its kind's catalogue.
 *
 * PURE, and the one validator: the builder calls it to enable Post, core calls
 * it before every write. An empty list is "nothing to say"; each entry names
 * the block it is about.
 *
 *   unknown_block  the kind has no such block
 *   duplicate      the block appears twice
 *   out_of_order   the block comes before one the catalogue puts ahead of it
 *   over_limit     the value is longer than the block allows
 *   invalid_value  a line holding a line break, or a url that is not http(s)
 *   required       (publish only) a required block is absent or empty
 */
export function validatePostBlocks(
  kind: ProductPostKind,
  blocks: readonly ProductPostBlock[],
  options: ValidatePostBlocksOptions = {},
): PostBlockError[] {
  const mode = options.mode ?? "publish";
  const specs = POST_BLOCK_CATALOGUE[kind];
  const errors: PostBlockError[] = [];
  const seen = new Set<string>();
  let lastIndex = -1;

  for (const entry of blocks) {
    const index = specs.findIndex((spec) => spec.id === entry.block);
    const spec = specs[index];
    if (!spec) {
      errors.push({ block: entry.block, code: "unknown_block", message: `${PRODUCT_POST_KIND_LABELS[kind]} has no such block` });
      continue;
    }
    if (seen.has(spec.id)) {
      errors.push({ block: spec.id, code: "duplicate", message: `${spec.label} appears twice` });
      continue;
    }
    seen.add(spec.id);
    if (index < lastIndex) {
      errors.push({ block: spec.id, code: "out_of_order", message: `${spec.label} is out of order` });
    } else {
      lastIndex = index;
    }
    const value = entry.value;
    if (value.length > spec.limit) {
      errors.push({ block: spec.id, code: "over_limit", message: `${spec.label} is at most ${spec.limit} characters` });
    }
    if (value.length === 0) continue;
    if (spec.type === "line" && /[\r\n]/.test(value)) {
      errors.push({ block: spec.id, code: "invalid_value", message: `${spec.label} is one line` });
    }
    if (spec.type === "url" && postUrl(value) === null) {
      errors.push({ block: spec.id, code: "invalid_value", message: `${spec.label} must be an http(s) address` });
    }
  }

  if (mode === "publish") {
    for (const spec of specs) {
      if (!spec.required) continue;
      const value = postBlockValue(blocks, spec.id);
      if (value === null || value.trim().length === 0) {
        errors.push({ block: spec.id, code: "required", message: `${spec.label} is required` });
      }
    }
  }
  return errors;
}

/** Whether Post may be pressed. */
export function postBlocksPublishable(kind: ProductPostKind, blocks: readonly ProductPostBlock[]): boolean {
  return validatePostBlocks(kind, blocks).length === 0;
}

/**
 * The blocks a published post stores: an optional block left empty is not
 * part of the post, so it is dropped; a url is stored normalised.
 */
export function publishedPostBlocks(kind: ProductPostKind, blocks: readonly ProductPostBlock[]): ProductPostBlock[] {
  const out: ProductPostBlock[] = [];
  for (const entry of blocks) {
    const spec = postBlockSpec(kind, entry.block);
    if (!spec || entry.value.length === 0) continue;
    out.push({ block: spec.id, value: spec.type === "url" ? (postUrl(entry.value) ?? entry.value) : entry.value });
  }
  return out;
}

/**
 * Build a post's blocks from what something else already holds (a milestone,
 * a role opening, a listing): catalogue order, empty values dropped, each
 * value cut to its block's limit so the draft it makes is always storable.
 */
export function prefilledPostBlocks(
  kind: ProductPostKind,
  values: Readonly<Record<string, string | null | undefined>>,
): ProductPostBlock[] {
  const out: ProductPostBlock[] = [];
  for (const spec of POST_BLOCK_CATALOGUE[kind]) {
    const raw = values[spec.id];
    if (typeof raw !== "string") continue;
    let value = raw.replace(/\r\n?/g, "\n").trim();
    if (spec.type === "line") value = value.replace(/\s*\n\s*/g, " ");
    if (spec.type === "url") {
      const url = postUrl(value);
      if (url === null || url.length > spec.limit) continue;
      value = url;
    }
    value = value.slice(0, spec.limit).trim();
    if (value.length > 0) out.push({ block: spec.id, value });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export const PRODUCT_POST_REACTIONS = ["useful", "would_use", "impressive", "curious"] as const;
export type ProductPostReaction = (typeof PRODUCT_POST_REACTIONS)[number];

export const PRODUCT_POST_REACTION_LABELS: Record<ProductPostReaction, string> = {
  useful: "Useful",
  would_use: "I'd use this",
  impressive: "Impressive",
  curious: "Curious",
};

export function isProductPostReaction(value: unknown): value is ProductPostReaction {
  return typeof value === "string" && (PRODUCT_POST_REACTIONS as readonly string[]).includes(value);
}

/** How many people hold each reaction. Zero is sent; the page hides it. */
export type ProductPostReactionCounts = Record<ProductPostReaction, number>;

export const PRODUCT_POST_REACTION_COUNT_KEYS = ["curious", "impressive", "useful", "would_use"] as const;

export function emptyReactionCounts(): ProductPostReactionCounts {
  return { useful: 0, would_use: 0, impressive: 0, curious: 0 };
}

export interface SetProductPostReactionRequest {
  reaction: ProductPostReaction;
}

/** What a reaction write answers with: the caller's reaction now, and the counts. */
export interface ProductPostReactionState {
  postId: string;
  reaction: ProductPostReaction | null;
  reactions: ProductPostReactionCounts;
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/** The product a post belongs to, as the card draws it. */
export interface PublicProductPostProduct {
  slug: string;
  /** The product's name. A listing is named by its slug, so the two are equal
   *  today; the card reads this one. */
  name: string;
  stage: ProductStage;
  /** The product's logo, or null for the monogram. */
  logo: MediaThumbnail | null;
}

export const PUBLIC_PRODUCT_POST_PRODUCT_KEYS = ["logo", "name", "slug", "stage"] as const;

export interface PublicProductPostAuthor {
  handle: string;
  displayName: string | null;
}

export const PUBLIC_PRODUCT_POST_AUTHOR_KEYS = ["displayName", "handle"] as const;

/** A published product post, identical for every reader. */
export interface PublicProductPost {
  id: string;
  kind: ProductPostKind;
  product: PublicProductPostProduct;
  /** Who pressed Post, when their public page resolves; null when the system
   *  wrote the post or the author has no public page. */
  author: PublicProductPostAuthor | null;
  blocks: ProductPostBlock[];
  publishedAt: string;
  reactions: ProductPostReactionCounts;
  /** Visible comments in the post's thread. */
  commentCount: number;
  /** The thread that holds the post's comments (`/v1/public/openproduct/threads/{id}`). */
  threadId: string | null;
}

export const PUBLIC_PRODUCT_POST_KEYS = [
  "author",
  "blocks",
  "commentCount",
  "id",
  "kind",
  "product",
  "publishedAt",
  "reactions",
  "threadId",
] as const;

/** One page of posts, newest first. `next` is null on the last page. */
export interface ProductPostsPage {
  posts: PublicProductPost[];
  next: string | null;
}

export const PRODUCT_POSTS_PAGE_KEYS = ["next", "posts"] as const;

export const PRODUCT_POSTS_PAGE_DEFAULT = 20;
export const PRODUCT_POSTS_PAGE_MAX = 50;

export function productPostsPageSize(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return PRODUCT_POSTS_PAGE_DEFAULT;
  return Math.min(n, PRODUCT_POSTS_PAGE_MAX);
}

/** A position in the feed: the last post a page held. */
export interface ProductPostCursor {
  readonly publishedAt: string;
  readonly id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const toBase64Url = (text: string): string =>
  btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (text: string): string | null => {
  try {
    return atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
  } catch {
    return null;
  }
};

export function encodeProductPostCursor(cursor: ProductPostCursor): string {
  return toBase64Url(JSON.stringify([cursor.publishedAt, cursor.id]));
}

/** A cursor this API issued, or null. A cursor it did not issue is refused. */
export function decodeProductPostCursor(text: string | null | undefined): ProductPostCursor | null {
  if (typeof text !== "string" || text.length === 0 || text.length > 256) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const json = fromBase64Url(text);
  if (json === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null;
  const [publishedAt, id] = parsed as [unknown, unknown];
  if (typeof publishedAt !== "string" || Number.isNaN(Date.parse(publishedAt))) return null;
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  return { publishedAt, id };
}

/** A post as its crew sees it: drafts included, never a removed one. */
export interface CrewProductPost {
  id: string;
  kind: ProductPostKind;
  state: Exclude<ProductPostState, "removed">;
  blocks: ProductPostBlock[];
  publishedAt: string | null;
  /** The milestone a Feature shipped post is about, when it names one. */
  milestoneId: string | null;
  /** The seat a Help wanted post is about, when it names one. */
  roleOpeningId: string | null;
  threadId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CREW_PRODUCT_POST_KEYS = [
  "blocks",
  "createdAt",
  "id",
  "kind",
  "milestoneId",
  "publishedAt",
  "roleOpeningId",
  "state",
  "threadId",
  "updatedAt",
] as const;

export interface CreateProductPostRequest {
  kind: AuthoredProductPostKind;
  blocks: ProductPostBlock[];
}

export interface UpdateProductPostRequest {
  blocks: ProductPostBlock[];
}

/** `POST …/product-posts/{id}/publish`. Every member is optional. */
export interface PublishProductPostRequest {
  /** The blocks to publish, when they differ from the draft's. */
  blocks?: ProductPostBlock[];
  /** A Feature shipped post may name the milestone it is about. */
  milestoneId?: string | null;
  /** A Help wanted post may name the seat it is about. */
  roleOpeningId?: string | null;
}

// ---------------------------------------------------------------------------
// "Needs you" and Following
// ---------------------------------------------------------------------------

/** One pending request to join, as the product's crew sees it. */
export interface CrewSeatRequest {
  id: string;
  roleOpeningId: string;
  /** The seat's title; null when the seat has since been deleted. */
  roleTitle: string | null;
  /** The request's reference on Orunbase, where it is approved or denied. */
  requestRef: string | null;
  /**
   * Who asked: the name they wrote about themselves, and their handle when
   * their public page resolves — so `handle` is a link or it is null.
   */
  requester: CrewSeatRequester;
  createdAt: string;
}

export interface CrewSeatRequester {
  handle: string | null;
  displayName: string | null;
}

export const CREW_SEAT_REQUEST_KEYS = ["createdAt", "id", "requestRef", "requester", "roleOpeningId", "roleTitle"] as const;
export const CREW_SEAT_REQUESTER_KEYS = ["displayName", "handle"] as const;

/** `GET …/needs-you` — what waits on the crew, in one read. */
export interface CrewNeedsYou {
  requests: CrewSeatRequest[];
  drafts: CrewProductPost[];
}

export const CREW_NEEDS_YOU_KEYS = ["drafts", "requests"] as const;

/** A product somebody follows or a person lists. */
export interface ProductRef {
  slug: string;
  name: string;
  stage: ProductStage;
}

export const PRODUCT_REF_KEYS = ["name", "slug", "stage"] as const;

export interface FollowedProduct extends ProductRef {
  tagline: string | null;
  logo: MediaThumbnail | null;
}

export const FOLLOWED_PRODUCT_KEYS = ["logo", "name", "slug", "stage", "tagline"] as const;

/** `GET /v1/openproduct/me/following`. */
export interface MeFollowing {
  products: FollowedProduct[];
  people: PublicProductPostAuthor[];
}

export const ME_FOLLOWING_KEYS = ["people", "products"] as const;

/** How many of each one read returns. */
export const ME_FOLLOWING_LIMIT = 200;

/** How many of a person's products a search row carries. */
export const SEARCH_MAKER_PRODUCT_LIMIT = 6;

/** One product the visitor is on the crew of, for the page's maker view. */
export interface OverlayCrew {
  slug: string;
  /** The workspace, as the crew routes address it (`org_…`). */
  org: string;
  /** The listing, as the crew routes address it (`opp_…`). */
  profile: string;
}

export const OVERLAY_CREW_KEYS = ["org", "profile", "slug"] as const;

// ---------------------------------------------------------------------------
// The comment thread
// ---------------------------------------------------------------------------

/** The title of the thread that holds a post's comments. Nobody typed one, so
 *  the system writes it; a moderator reads it in the queue. */
export function productPostThreadTitle(kind: ProductPostKind, slug: string): string {
  return `${PRODUCT_POST_KIND_LABELS[kind]} on ${slug}`.slice(0, 160);
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** A post's public id: `ppo_` and 32 hex characters. */
export const PRODUCT_POST_ID_RE = /^ppo_[0-9a-f]{32}$/;
/** A milestone's public id: `pms_` and 32 hex characters. */
export const MILESTONE_ID_RE = /^pms_[0-9a-f]{32}$/;

const withCursor = (path: string, cursor?: string | null): string =>
  cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path;

/** The gateway's addresses. Public reads first, then signed-in, then crew. */
export const PRODUCT_POST_API = {
  /** GET — the feed: every listed product's published posts, newest first. */
  feed: (cursor?: string | null): string => withCursor("/v1/public/openproduct/product-posts", cursor),
  /** GET — one published post. */
  post: (postId: string): string => `/v1/public/openproduct/product-posts/${postId}`,
  /** GET — one product's published posts, newest first. */
  ofProduct: (slug: string, cursor?: string | null): string =>
    withCursor(`/v1/public/openproduct/projects/${encodeURIComponent(slug)}/product-posts`, cursor),
  /** PUT `{reaction}` sets my reaction; DELETE clears it. */
  reaction: (postId: string): string => `/v1/openproduct/me/product-post-reactions/${postId}`,
  /** GET — the products and people I follow. */
  following: (): string => "/v1/openproduct/me/following",
  /** GET lists a product's posts, drafts included; POST creates a draft. */
  crewPosts: (org: string, profile: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/product-posts`,
  /** PATCH `{blocks}` edits; DELETE removes. */
  crewPost: (org: string, profile: string, postId: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/product-posts/${postId}`,
  /** POST — publish a draft. */
  crewPublish: (org: string, profile: string, postId: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/product-posts/${postId}/publish`,
  /** GET lists; POST creates; PUT `{order}` reorders. */
  crewMilestones: (org: string, profile: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/milestones`,
  /** PATCH edits; DELETE deletes. */
  crewMilestone: (org: string, profile: string, milestoneId: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/milestones/${milestoneId}`,
  /** PUT marks shipped; DELETE marks not shipped. */
  crewMilestoneShipped: (org: string, profile: string, milestoneId: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/milestones/${milestoneId}/shipped`,
  /** GET — pending requests to join and the product's drafts. */
  crewNeedsYou: (org: string, profile: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/needs-you`,
} as const;

/** A post's page on the site. */
export function productPostPagePath(slug: string, postId: string): string {
  return `/${slug}/posts/${postId}`;
}

/** The post builder's page on the site. */
export function composePostPagePath(slug: string, kind?: AuthoredProductPostKind): string {
  return kind ? `/${slug}/new?kind=${kind}` : `/${slug}/new`;
}

/** Where the templates are documented. */
export const POSTING_DOCS_PATH = "/docs/posting";
