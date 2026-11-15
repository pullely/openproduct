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

import type { ProductPostBlock } from "./product-post-blocks.js";
import type { CrewPrivateThreadNotice } from "./talk.js";

// ---------------------------------------------------------------------------
// Stage and milestones (§6.1)
// ---------------------------------------------------------------------------

/**
 * SC-2 (openproduct-stages-crew, design §1) — the four stages, in order. Set
 * by the crew by hand, one step at a time (`validateStageChange` in
 * `stage-change.ts`); milestones no longer move it. OPR-3's two stages
 * (`idea`, `shipping`) are gone: migration 2285 made every `shipping` row
 * `stage` when it had a try link and `building` when it did not.
 */
export const PRODUCT_STAGES = ["idea", "building", "stage", "production"] as const;
export type ProductStage = (typeof PRODUCT_STAGES)[number];

/** The stage as a word, in sentence case: `Idea`, `On stage`. */
export const PRODUCT_STAGE_LABELS: Record<ProductStage, string> = {
  idea: "Idea",
  building: "Building",
  stage: "On stage",
  production: "In production",
};

/** The stage as its mono mark says it (boards `Product`, `Stage`). */
export const PRODUCT_STAGE_MARKS: Record<ProductStage, string> = {
  idea: "IDEA",
  building: "BUILDING",
  stage: "ON STAGE",
  production: "IN PRODUCTION",
};

/** The line under each stage in the Change stage popup (board `Stage`). */
export const PRODUCT_STAGE_SUBS: Record<ProductStage, string> = {
  idea: "A problem worth building for",
  building: "Code and a first milestone",
  stage: "People can try it",
  production: "Real people use it",
};

/** The stage after this one, or null at the last. */
export function nextStage(stage: ProductStage): ProductStage | null {
  return PRODUCT_STAGES[PRODUCT_STAGES.indexOf(stage) + 1] ?? null;
}

/** The stage before this one, or null at the first. */
export function previousStage(stage: ProductStage): ProductStage | null {
  const index = PRODUCT_STAGES.indexOf(stage);
  return index > 0 ? PRODUCT_STAGES[index - 1]! : null;
}

/** Whether a product at this stage has been built at all: everything but an
 *  idea. The product page draws the tabbed page for these. */
export function isBuiltStage(stage: ProductStage): boolean {
  return stage !== "idea";
}

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

// The blocks themselves — the catalogue, a post's `{block, value}` entries and
// the validator — are in `product-post-blocks.ts` (it says why).

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
  /** How many of the product's milestones have shipped, of how many — what a
   *  feature card's progress bars draw, without a read per card. */
  milestoneCounts: MilestoneCounts;
}

export const PUBLIC_PRODUCT_POST_PRODUCT_KEYS = ["logo", "milestoneCounts", "name", "slug", "stage"] as const;

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
  /** OPR-4 — private threads where the last word is not the crew's. Who
   *  started each and when; never its title or its text. */
  threads: CrewPrivateThreadNotice[];
}

export const CREW_NEEDS_YOU_KEYS = ["drafts", "requests", "threads"] as const;

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
  /** GET — the published posts one person pressed Post on, newest first.
   *  The handle is the canonical (lower-case) one; a person with no public
   *  page answers 404. */
  ofAuthor: (handle: string, cursor?: string | null): string =>
    withCursor(`/v1/public/openproduct/people/${encodeURIComponent(handle)}/product-posts`, cursor),
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
  /** SC-2 — PUT `ChangeStageRequest`: one step forward or back. */
  crewStage: (org: string, profile: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/stage`,
  /** GET — pending requests to join and the product's drafts. */
  crewNeedsYou: (org: string, profile: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/needs-you`,
  /** POST `{title, description?, commitment?, status?}` opens a seat (a role
   *  opening) and prepares its draft Help wanted post. */
  crewSeats: (org: string, profile: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/role-openings`,
  /** PUT edits a seat (the same body; `status` closes or reopens it);
   *  DELETE removes it. */
  crewSeat: (org: string, profile: string, openingId: string): string =>
    `/v1/organizations/${org}/openproduct/profiles/${profile}/role-openings/${openingId}`,
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
