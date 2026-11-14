// Product posts, reactions and milestones (openproduct-redesign OPR-3).
//
// A PRODUCT POST IS NOT A FORUM POST. `handlers/discussions.ts` owns threads
// and the replies in them; this file owns what a product says for itself — a
// post of one of five fixed shapes (design §2.1, §6.2) — and the milestones
// its stage follows (§6.1).
//
// THREE DOORS, AND THEY DO NOT SHARE A READ.
//
//   public    the feed, one product's posts, one post. No actor, edge-cached,
//             the same bytes for everyone (OPC-1, I6). They reach only the
//             repository's `*Public*` reads, whose SQL says `state =
//             'published'` and re-asserts the listing's visibility — so a
//             draft, a removed post and an unlisted product's post cannot be
//             returned from here by a mistake in this file.
//   signed-in my reaction on a post, and what I follow.
//   crew      a product's own posts (drafts included), its milestones, and
//             "Needs you". The same authorization as role openings:
//             `authorizeFor(…, "write", …)`, and every refusal is a 404.
//
// THE TEMPLATE IS THE CONTRACT'S. `validatePostBlocks` is the one rule the
// builder and this file share; nothing here knows what a kind's blocks are.

import {
  AUTHORED_PRODUCT_POST_KINDS,
  MILESTONE_CODE_MAX,
  MILESTONE_MAX_PER_PRODUCT,
  MILESTONE_SUMMARY_MAX,
  MILESTONE_TITLE_MAX,
  ME_FOLLOWING_LIMIT,
  PRODUCT_POST_KIND_LABELS,
  decodeProductPostCursor,
  emptyReactionCounts,
  encodeProductPostCursor,
  isAuthoredProductPostKind,
  isProductPostReaction,
  parsePostBlocks,
  productPostsPageSize,
  publishedPostBlocks,
  validatePostBlocks,
  type CrewMilestone,
  type CrewNeedsYou,
  type CrewProductPost,
  type MeFollowing,
  type MediaThumbnail,
  type ProductPostBlock,
  type ProductPostReactionState,
  type ProductPostsPage,
  type PublicMilestone,
  type PublicProductPost,
} from "@openproduct/contracts";
import type {
  OpenproductRepository,
  ProductMilestoneRecord,
  ProductPostRecord,
  ProductPostsPageRecord,
  PublicProductPostRecord,
} from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import {
  generateId,
  milestonePublicId,
  parseMilestonePublicId,
  parseProductPostPublicId,
  parseRoleOpeningPublicId,
  productPostPublicId,
  roleOpeningPublicId,
  type Uuid,
} from "../ids.js";
import { thumbnailsForSlugs } from "./media.js";
import { requireUserSubject } from "./me.js";
import { authorizeFor, type ProfileHandlerDeps } from "./profiles.js";
import { auditProductWrite, offerFeaturePost, publishDraft, type PostWriteContext, type SelfPostDeps } from "./self-posts.js";

export interface ProductPostHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    // the public reads
    | "listPublicProductPosts"
    | "listPublicProductPostsForProfile"
    | "getPublicProductPost"
    | "getPublicProfileId"
    | "listPublicMediaForSlugs"
    // reactions and Following
    | "reactToProductPost"
    | "withdrawProductPostReaction"
    | "listFollowing"
    // the crew's door
    | "getProfileForOrg"
    | "getListingRole"
    | "appendAudit"
    | "createProductPost"
    | "getProductPost"
    | "listProductPostsForProfile"
    | "listProductPostDrafts"
    | "updateProductPostBlocks"
    | "publishProductPost"
    | "removeProductPost"
    | "createThread"
    | "setThreadState"
    | "listRoleOpenings"
    | "listProductMilestones"
    | "createProductMilestone"
    | "updateProductMilestone"
    | "deleteProductMilestone"
    | "reorderProductMilestones"
    | "setProductMilestoneShipped"
    | "listPendingApplicationsForProfile"
  >;
  now?: () => Date;
  generateId?: () => Uuid;
}

/** The most drafts one product may hold at once. A draft is cheap to write
 *  and nobody reads fifty of them. */
export const PRODUCT_POST_DRAFT_LIMIT = 50;

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

// ---------------------------------------------------------------------------
// Projections — field by field, from the pinned key sets (OD3)
// ---------------------------------------------------------------------------

/** A published post as every reader gets it. */
export function publicProductPost(
  record: PublicProductPostRecord,
  logoFor: (slug: string) => MediaThumbnail | null,
): PublicProductPost {
  return {
    id: productPostPublicId(record.id),
    kind: record.kind,
    product: {
      slug: record.slug,
      // A listing is named by its slug (the catalog's own sentence for
      // `slug`), so the two are equal; the card reads `name`.
      name: record.slug,
      stage: record.stage,
      logo: logoFor(record.slug),
    },
    // The handle IS the gate: non-null only when `/@handle` resolves. The
    // author's subject id stops here (I3).
    author: record.authorHandle ? { handle: record.authorHandle, displayName: record.authorName } : null,
    blocks: record.blocks.map((entry) => ({ block: entry.block, value: entry.value })),
    publishedAt: record.publishedAt,
    reactions: {
      useful: record.reactions.useful,
      would_use: record.reactions.would_use,
      impressive: record.reactions.impressive,
      curious: record.reactions.curious,
    },
    commentCount: record.commentCount,
    threadId: record.threadId,
  };
}

/** A milestone as a visitor reads it. */
export function publicMilestone(record: ProductMilestoneRecord): PublicMilestone {
  return { code: record.code, title: record.title, summary: record.summary, shippedAt: record.shippedAt };
}

function crewMilestone(record: ProductMilestoneRecord): CrewMilestone {
  return {
    id: milestonePublicId(record.id),
    code: record.code,
    title: record.title,
    summary: record.summary,
    position: record.position,
    shippedAt: record.shippedAt,
  };
}

function crewProductPost(record: ProductPostRecord): CrewProductPost {
  return {
    id: productPostPublicId(record.id),
    kind: record.kind,
    // The crew's reads never return a removed post, so the two states left
    // are the two the shape names.
    state: record.state === "published" ? "published" : "draft",
    blocks: record.blocks.map((entry) => ({ block: entry.block, value: entry.value })),
    publishedAt: record.publishedAt,
    milestoneId: record.milestoneId ? milestonePublicId(record.milestoneId) : null,
    roleOpeningId: record.roleOpeningId ? roleOpeningPublicId(record.roleOpeningId) : null,
    threadId: record.threadId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function pageOf(
  deps: Pick<ProductPostHandlerDeps, "repo">,
  page: ProductPostsPageRecord,
): Promise<ProductPostsPage> {
  // The logos, ONE read for the page — never an ordering input, and a failed
  // read leaves every card a monogram rather than failing the feed.
  const logoFor = await thumbnailsForSlugs(deps.repo, page.posts.map((post) => post.slug)).catch(
    () => () => null,
  );
  return {
    posts: page.posts.map((post) => publicProductPost(post, logoFor)),
    next: page.next === null ? null : encodeProductPostCursor(page.next),
  };
}

function cursorOf(url: URL): { ok: true; cursor: ReturnType<typeof decodeProductPostCursor> } | { ok: false } {
  const raw = url.searchParams.get("cursor");
  if (raw === null) return { ok: true, cursor: null };
  const cursor = decodeProductPostCursor(raw);
  // A cursor this feed did not issue is refused, never served as a first
  // page under a wrong address (OS1's rule).
  return cursor === null ? { ok: false } : { ok: true, cursor };
}

// ---------------------------------------------------------------------------
// The public reads
// ---------------------------------------------------------------------------

/** GET /internal/public/openproduct/product-posts?cursor=&limit= — the feed. */
export async function handleProductPostsFeed(
  _env: Env,
  url: URL,
  requestId: string,
  deps: Pick<ProductPostHandlerDeps, "repo">,
): Promise<Response> {
  const parsed = cursorOf(url);
  if (!parsed.ok) return validationError(requestId, { cursor: ["Not a position this feed issued"] });
  const page = await deps.repo.listPublicProductPosts({
    cursor: parsed.cursor,
    limit: productPostsPageSize(url.searchParams.get("limit")),
  });
  return successResponse(await pageOf(deps, page), requestId);
}

/** GET /internal/public/openproduct/projects/{slug}/product-posts — one product's posts. */
export async function handleProductPostsOfProduct(
  _env: Env,
  url: URL,
  requestId: string,
  slug: string,
  deps: Pick<ProductPostHandlerDeps, "repo">,
): Promise<Response> {
  if (!SLUG_RE.test(slug)) return errorResponse("not_found", "Not found", 404, requestId);
  // Private, delisted, removed and nonexistent answer identically — the same
  // 404 the listing itself gives.
  const profileId = await deps.repo.getPublicProfileId(slug);
  if (!profileId) return errorResponse("not_found", "Not found", 404, requestId);
  const parsed = cursorOf(url);
  if (!parsed.ok) return validationError(requestId, { cursor: ["Not a position this feed issued"] });
  const page = await deps.repo.listPublicProductPostsForProfile(profileId, {
    cursor: parsed.cursor,
    limit: productPostsPageSize(url.searchParams.get("limit")),
  });
  return successResponse(await pageOf(deps, page), requestId);
}

/** GET /internal/public/openproduct/product-posts/{id} — one post. */
export async function handlePublicProductPost(
  _env: Env,
  requestId: string,
  publicId: string,
  deps: Pick<ProductPostHandlerDeps, "repo">,
): Promise<Response> {
  const id = parseProductPostPublicId(publicId);
  if (!id) return errorResponse("not_found", "Not found", 404, requestId);
  // ONE 404 for a draft, a removed post, an unlisted product and an id that
  // never existed: telling them apart would be an oracle for drafts.
  const record = await deps.repo.getPublicProductPost(id);
  if (!record) return errorResponse("not_found", "Not found", 404, requestId);
  const logoFor = await thumbnailsForSlugs(deps.repo, [record.slug]).catch(() => () => null);
  return successResponse({ post: publicProductPost(record, logoFor) }, requestId);
}

// ---------------------------------------------------------------------------
// Signed-in: my reaction, and what I follow
// ---------------------------------------------------------------------------

/**
 * PUT    /internal/openproduct/me/product-post-reactions/{id}   `{reaction}`
 * DELETE /internal/openproduct/me/product-post-reactions/{id}
 *
 * ONE REACTION PER PERSON PER POST. Setting one when another is held replaces
 * it; clearing keeps the row withdrawn (`post_votes`' rule).
 *
 * THE POST ID IS IN THE PATH, so the gateway bounds reactions per post
 * without reading a body — the same velocity class as an upvote on a comment.
 *
 * THE AUTHOR OF A POST CANNOT REACT TO IT, the rule a comment's upvote
 * follows: a count on your own words moved by your own click. It is said in a
 * sentence here and refused again in the repository's insert. Anybody else
 * signed in may react — the bar an upvote on a product sets, not the public
 * profile a comment asks for.
 */
export async function handleProductPostReaction(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  publicId: string,
  deps: Pick<ProductPostHandlerDeps, "repo" | "now">,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const id = parseProductPostPublicId(publicId);
  if (!id) return errorResponse("not_found", "Not found", 404, requestId);
  const at = (deps.now ?? (() => new Date()))().toISOString();

  const state = async (reaction: ProductPostReactionState["reaction"]): Promise<ProductPostReactionState> => {
    const post = await deps.repo.getPublicProductPost(id);
    return { postId: productPostPublicId(id), reaction, reactions: post?.reactions ?? emptyReactionCounts() };
  };

  if (request.method === "DELETE") {
    // Clearing what you do not hold is the state you asked for, and it works
    // on a post that has since left public view: a reaction you cannot take
    // back is one you are stuck with.
    await deps.repo.withdrawProductPostReaction(id, actor.subjectId, at);
    return successResponse({ reaction: await state(null) }, requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError(requestId, { body: ["Must be a valid JSON object"] });
  }
  const reaction = (body as { reaction?: unknown } | null)?.reaction;
  if (!isProductPostReaction(reaction)) {
    return validationError(requestId, { reaction: ["Must be one of: useful, would_use, impressive, curious"] });
  }

  const post = await deps.repo.getPublicProductPost(id);
  if (!post) return errorResponse("not_found", "Not found", 404, requestId);
  if (post.authorSubjectId === actor.subjectId) {
    return errorResponse("conflict", "You cannot react to your own post", 409, requestId);
  }
  const written = await deps.repo.reactToProductPost(id, actor.subjectId, reaction, at);
  // The post left public view between the read and the write.
  if (!written) return errorResponse("not_found", "Not found", 404, requestId);
  return successResponse({ reaction: await state(reaction) }, requestId);
}

/**
 * GET /internal/openproduct/me/following — the products and people I follow.
 *
 * THE READER'S OWN LIST and nobody else's: the subject is the whole of the
 * authorization, and nothing here answers who follows anything (FL0). Never
 * cached — it rides the authenticated plane.
 */
export async function handleGetFollowing(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: Pick<ProductPostHandlerDeps, "repo">,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const record = await deps.repo.listFollowing(actor.subjectId, ME_FOLLOWING_LIMIT);
  const logoFor = await thumbnailsForSlugs(deps.repo, record.products.map((p) => p.slug)).catch(() => () => null);
  const following: MeFollowing = {
    products: record.products.map((product) => ({
      slug: product.slug,
      name: product.slug,
      stage: product.stage,
      tagline: product.tagline,
      logo: logoFor(product.slug),
    })),
    people: record.people.map((person) => ({ handle: person.handle, displayName: person.displayName })),
  };
  return successResponse({ following }, requestId);
}

// ---------------------------------------------------------------------------
// The crew's door
// ---------------------------------------------------------------------------

/**
 * Who may write for this product: the same answer role openings get.
 * The listing must be this workspace's (`getProfileForOrg` is org-scoped in
 * SQL) and the caller must be on its crew; both refusals are one 404.
 */
async function crewOf(
  env: Env,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProductPostHandlerDeps,
  requestId: string,
): Promise<{ ok: true; ctx: PostWriteContext } | { ok: false; response: Response }> {
  const [profile, auth] = await Promise.all([
    deps.repo.getProfileForOrg(orgId, profileId),
    authorizeFor(env, actor, "write", profileId, deps as unknown as ProfileHandlerDeps, requestId),
  ]);
  if (!profile) return { ok: false, response: errorResponse("not_found", "Not found", 404, requestId) };
  if (!auth.ok) return auth;
  return { ok: true, ctx: { orgId, profile, actor, requestId } };
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.trim().length === 0) return {};
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** A block error per field: `blocks.<block id>` → what is wrong with it. */
function blockFields(
  kind: ProductPostRecord["kind"],
  blocks: readonly ProductPostBlock[],
  mode: "publish" | "draft",
): Record<string, string[]> | null {
  const errors = validatePostBlocks(kind, blocks, { mode });
  if (errors.length === 0) return null;
  const fields: Record<string, string[]> = {};
  for (const error of errors) {
    const key = `blocks.${error.block}`;
    fields[key] = [...(fields[key] ?? []), error.message];
  }
  return fields;
}

const BLOCKS_SHAPE = ["Must be a list of {block, value}"];

/** GET …/product-posts — the product's posts, drafts included. */
export async function handleListCrewProductPosts(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;
  const posts = await deps.repo.listProductPostsForProfile(profileId);
  return successResponse({ posts: posts.map(crewProductPost) }, requestId);
}

/**
 * POST …/product-posts — a draft: `{kind, blocks}`.
 *
 * A DRAFT IS HELD TO THE TEMPLATE LESS ONE LINE: a required block may be
 * empty or absent. An unknown block, a block out of order, a duplicate and a
 * value over its limit are refused here as they are at publish.
 *
 * `demo` IS REFUSED. It is in the vocabulary and the catalogue, and a demo
 * post is made by recording a demo (OPR4), never typed.
 */
export async function handleCreateProductPost(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const body = await jsonBody(request);
  if (body === null) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);

  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;

  if (body.kind === "demo") {
    return validationError(requestId, {
      kind: ["A Demo post is made by recording a demo, which is not available yet"],
    });
  }
  if (!isAuthoredProductPostKind(body.kind)) {
    return validationError(requestId, { kind: [`Must be one of: ${AUTHORED_PRODUCT_POST_KINDS.join(", ")}`] });
  }
  const kind = body.kind;
  const blocks = body.blocks === undefined ? [] : parsePostBlocks(body.blocks);
  if (blocks === null) return validationError(requestId, { blocks: BLOCKS_SHAPE });
  const fields = blockFields(kind, blocks, "draft");
  if (fields) return validationError(requestId, fields);

  const drafts = await deps.repo.listProductPostDrafts(profileId);
  if (drafts.length >= PRODUCT_POST_DRAFT_LIMIT) {
    return errorResponse("conflict", `A product holds at most ${PRODUCT_POST_DRAFT_LIMIT} drafts`, 409, requestId);
  }

  const post = await deps.repo.createProductPost({
    id: (deps.generateId ?? generateId)(),
    profileId,
    kind,
    authorSubjectId: actor.subjectId,
    blocks,
  });
  if (!post) return errorResponse("internal_error", "The draft was not saved", 500, requestId);

  await auditProductWrite(
    deps,
    crew.ctx,
    "openproduct.product_post.created",
    `openproduct draft ${PRODUCT_POST_KIND_LABELS[kind]} post created on ${crew.ctx.profile.slug}`,
    { postId: productPostPublicId(post.id), kind, source: "crew" },
  );
  return successResponse({ post: crewProductPost(post) }, requestId, 201);
}

/**
 * PATCH …/product-posts/{id} — rewrite a post's blocks: `{blocks}`.
 *
 * A DRAFT is held to the draft rule. A PUBLISHED post may be edited too — its
 * `publishedAt` stands, so an edit does not move it up the feed — and is held
 * to the whole rule, because what it becomes is public at once. Both are
 * audited, and the entry says which it was.
 */
export async function handleUpdateProductPost(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  postId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const body = await jsonBody(request);
  if (body === null) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);

  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;
  const existing = await deps.repo.getProductPost(profileId, postId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);

  const blocks = parsePostBlocks(body.blocks);
  if (blocks === null) return validationError(requestId, { blocks: BLOCKS_SHAPE });
  const published = existing.state === "published";
  const fields = blockFields(existing.kind, blocks, published ? "publish" : "draft");
  if (fields) return validationError(requestId, fields);

  const updated = await deps.repo.updateProductPostBlocks(
    profileId,
    postId,
    published ? publishedPostBlocks(existing.kind, blocks) : blocks,
  );
  if (!updated) return errorResponse("not_found", "Not found", 404, requestId);

  await auditProductWrite(
    deps,
    crew.ctx,
    "openproduct.product_post.updated",
    `openproduct ${updated.state} ${PRODUCT_POST_KIND_LABELS[updated.kind]} post edited on ${crew.ctx.profile.slug}`,
    { postId: productPostPublicId(updated.id), kind: updated.kind, state: updated.state },
  );
  return successResponse({ post: crewProductPost(updated) }, requestId);
}

/**
 * POST …/product-posts/{id}/publish — press Post.
 *
 * The body is optional: `{blocks?, milestoneId?, roleOpeningId?}`. With
 * `blocks`, they replace the draft's; either way the WHOLE rule is applied —
 * every required block present and inside its limit — and a post that fails
 * is refused with the block that fails it.
 *
 * A Feature shipped post may name the milestone it is about, a Help wanted
 * post the seat; an idea post needs neither. A link to something that is not
 * this product's is refused.
 *
 * Publishing stamps `publishedAt`, makes the comment thread, and names the
 * person who pressed Post as the post's author.
 */
export async function handlePublishProductPost(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  postId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const body = await jsonBody(request);
  if (body === null) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);

  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;
  const existing = await deps.repo.getProductPost(profileId, postId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);
  if (existing.state !== "draft") {
    return errorResponse("conflict", "This post is already published", 409, requestId);
  }
  if (!isAuthoredProductPostKind(existing.kind)) {
    return validationError(requestId, { kind: ["A Demo post is published from its recording"] });
  }

  const blocks = body.blocks === undefined ? existing.blocks : parsePostBlocks(body.blocks);
  if (blocks === null) return validationError(requestId, { blocks: BLOCKS_SHAPE });
  const fields: Record<string, string[]> = blockFields(existing.kind, blocks, "publish") ?? {};

  // The links. `undefined` keeps whatever the draft holds; `null` clears it.
  let milestoneId: Uuid | null | undefined;
  if (body.milestoneId !== undefined) {
    if (body.milestoneId === null) milestoneId = null;
    else if (existing.kind !== "feature") fields.milestoneId = ["Only a Feature shipped post names a milestone"];
    else {
      const parsed = typeof body.milestoneId === "string" ? parseMilestonePublicId(body.milestoneId) : null;
      const milestones = parsed ? await deps.repo.listProductMilestones(profileId) : [];
      if (!parsed || !milestones.some((m) => m.id === parsed)) fields.milestoneId = ["Not a milestone of this product"];
      else milestoneId = parsed;
    }
  }
  let roleOpeningId: Uuid | null | undefined;
  if (body.roleOpeningId !== undefined) {
    if (body.roleOpeningId === null) roleOpeningId = null;
    else if (existing.kind !== "seat") fields.roleOpeningId = ["Only a Help wanted post names a seat"];
    else {
      const parsed = typeof body.roleOpeningId === "string" ? parseRoleOpeningPublicId(body.roleOpeningId) : null;
      const openings = parsed ? await deps.repo.listRoleOpenings(profileId) : [];
      if (!parsed || !openings.some((o) => o.id === parsed)) fields.roleOpeningId = ["Not a seat of this product"];
      else roleOpeningId = parsed;
    }
  }
  if (Object.keys(fields).length > 0) return validationError(requestId, fields);

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const published = await publishDraft(deps as unknown as SelfPostDeps, {
    profile: crew.ctx.profile,
    post: existing,
    blocks: publishedPostBlocks(existing.kind, blocks),
    authorSubjectId: actor.subjectId,
    threadAuthorSubjectId: actor.subjectId,
    at,
    milestoneId,
    roleOpeningId,
  });
  // Somebody else pressed Post between the read and the write.
  if (!published) return errorResponse("conflict", "This post is already published", 409, requestId);

  await auditProductWrite(
    deps,
    crew.ctx,
    "openproduct.product_post.published",
    `openproduct ${PRODUCT_POST_KIND_LABELS[published.kind]} post published on ${crew.ctx.profile.slug}`,
    {
      postId: productPostPublicId(published.id),
      kind: published.kind,
      publishedAt: published.publishedAt,
      threadId: published.threadId,
    },
  );
  return successResponse({ post: crewProductPost(published) }, requestId);
}

/**
 * DELETE …/product-posts/{id} — remove a draft or a published post.
 *
 * The row stays, as `removed`: it leaves the feed, the product's list, the
 * post's own address and the crew's list, and its comment thread is removed
 * with it. There is no undo; the crew writes another.
 */
export async function handleRemoveProductPost(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  postId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;
  const existing = await deps.repo.getProductPost(profileId, postId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);
  // What it was, read before it is removed: the audit line says whether a
  // draft was discarded or a published post taken down.
  const was = existing.state;
  const removed = await deps.repo.removeProductPost(profileId, postId);
  if (!removed) return errorResponse("not_found", "Not found", 404, requestId);
  // Its comments go with it: a thread under a post nobody can open would
  // still answer at its own address. Removed the way TS3 removes a thread —
  // the rows stay — and best-effort: the post is gone from every read
  // whether or not this lands.
  if (removed.threadId) {
    try {
      await deps.repo.setThreadState(removed.threadId, "removed", ["open", "answered", "locked"]);
    } catch {
      // Deliberately swallowed.
    }
  }

  await auditProductWrite(
    deps,
    crew.ctx,
    "openproduct.product_post.removed",
    `openproduct ${was} ${PRODUCT_POST_KIND_LABELS[existing.kind]} post removed from ${crew.ctx.profile.slug}`,
    { postId: productPostPublicId(existing.id), kind: existing.kind, was },
  );
  return successResponse({ removed: true }, requestId);
}

// ─── milestones ─────────────────────────────────────────────────────────────

/** One line, trimmed, inside a bound — or the reason it is not. */
function lineOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > max || /[\r\n]/.test(text)) return null;
  return text;
}

/** `undefined` = not in the body; `null` = cleared; a string = set. */
function summaryOf(value: unknown): string | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return "invalid";
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text.length === 0) return null;
  return text.length > MILESTONE_SUMMARY_MAX ? "invalid" : text;
}

const CODE_RULE = [`One line of 1–${MILESTONE_CODE_MAX} characters`];
const TITLE_RULE = [`One line of 1–${MILESTONE_TITLE_MAX} characters`];
const SUMMARY_RULE = [`At most ${MILESTONE_SUMMARY_MAX} characters`];

/** GET …/milestones — the product's milestones in its crew's order, and its stage. */
export async function handleListMilestones(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;
  const milestones = await deps.repo.listProductMilestones(profileId);
  return successResponse({ milestones: milestones.map(crewMilestone), stage: crew.ctx.profile.stage }, requestId);
}

/** POST …/milestones — `{code, title, summary?}`, appended to the order. */
export async function handleCreateMilestone(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const body = await jsonBody(request);
  if (body === null) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;

  const fields: Record<string, string[]> = {};
  const code = lineOf(body.code, MILESTONE_CODE_MAX);
  if (code === null) fields.code = CODE_RULE;
  const title = lineOf(body.title, MILESTONE_TITLE_MAX);
  if (title === null) fields.title = TITLE_RULE;
  const summary = summaryOf(body.summary);
  if (summary === "invalid") fields.summary = SUMMARY_RULE;
  if (Object.keys(fields).length > 0) return validationError(requestId, fields);

  const existing = await deps.repo.listProductMilestones(profileId);
  if (existing.length >= MILESTONE_MAX_PER_PRODUCT) {
    return errorResponse("conflict", `A product holds at most ${MILESTONE_MAX_PER_PRODUCT} milestones`, 409, requestId);
  }

  const milestone = await deps.repo.createProductMilestone({
    id: (deps.generateId ?? generateId)(),
    profileId,
    code: code!,
    title: title!,
    summary: (summary as string | null | undefined) ?? null,
  });
  await auditProductWrite(
    deps,
    crew.ctx,
    "openproduct.milestone.created",
    `openproduct milestone ${milestone.code} added to ${crew.ctx.profile.slug}`,
    { milestoneId: milestonePublicId(milestone.id), code: milestone.code },
  );
  return successResponse({ milestone: crewMilestone(milestone), stage: crew.ctx.profile.stage }, requestId, 201);
}

/** PATCH …/milestones/{id} — any of `{code, title, summary}`. */
export async function handleUpdateMilestone(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  milestoneId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const body = await jsonBody(request);
  if (body === null) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;

  const fields: Record<string, string[]> = {};
  let code: string | undefined;
  if (body.code !== undefined) {
    const parsed = lineOf(body.code, MILESTONE_CODE_MAX);
    if (parsed === null) fields.code = CODE_RULE;
    else code = parsed;
  }
  let title: string | undefined;
  if (body.title !== undefined) {
    const parsed = lineOf(body.title, MILESTONE_TITLE_MAX);
    if (parsed === null) fields.title = TITLE_RULE;
    else title = parsed;
  }
  const summary = summaryOf(body.summary);
  if (summary === "invalid") fields.summary = SUMMARY_RULE;
  if (Object.keys(fields).length > 0) return validationError(requestId, fields);

  const milestone = await deps.repo.updateProductMilestone(profileId, milestoneId, {
    code,
    title,
    summary: summary as string | null | undefined,
  });
  if (!milestone) return errorResponse("not_found", "Not found", 404, requestId);
  await auditProductWrite(
    deps,
    crew.ctx,
    "openproduct.milestone.updated",
    `openproduct milestone ${milestone.code} edited on ${crew.ctx.profile.slug}`,
    { milestoneId: milestonePublicId(milestone.id), code: milestone.code },
  );
  return successResponse({ milestone: crewMilestone(milestone), stage: crew.ctx.profile.stage }, requestId);
}

/** PUT …/milestones — `{order: [id, …]}`: every milestone, once, in the new order. */
export async function handleReorderMilestones(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const body = await jsonBody(request);
  if (body === null) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;

  const rule = { order: ["Must name every milestone of the product once"] };
  if (!Array.isArray(body.order) || body.order.length > MILESTONE_MAX_PER_PRODUCT) {
    return validationError(requestId, rule);
  }
  const ids: Uuid[] = [];
  for (const entry of body.order) {
    const id = typeof entry === "string" ? parseMilestonePublicId(entry) : null;
    if (!id) return validationError(requestId, rule);
    ids.push(id);
  }
  const milestones = await deps.repo.reorderProductMilestones(profileId, ids);
  if (milestones === null) return validationError(requestId, rule);

  await auditProductWrite(
    deps,
    crew.ctx,
    "openproduct.milestone.reordered",
    `openproduct milestones reordered on ${crew.ctx.profile.slug} (${milestones.length})`,
    { count: milestones.length },
  );
  return successResponse({ milestones: milestones.map(crewMilestone), stage: crew.ctx.profile.stage }, requestId);
}

/** DELETE …/milestones/{id}. The stage follows: deleting the only shipped
 *  milestone makes the product an idea again. */
export async function handleDeleteMilestone(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  milestoneId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;
  const deleted = await deps.repo.deleteProductMilestone(profileId, milestoneId);
  if (!deleted) return errorResponse("not_found", "Not found", 404, requestId);

  await auditProductWrite(
    deps,
    crew.ctx,
    "openproduct.milestone.deleted",
    `openproduct milestone removed from ${crew.ctx.profile.slug}`,
    { milestoneId: milestonePublicId(milestoneId) },
  );
  const after = await deps.repo.getProfileForOrg(orgId, profileId);
  return successResponse({ deleted: true, stage: after?.stage ?? crew.ctx.profile.stage }, requestId);
}

/**
 * PUT    …/milestones/{id}/shipped   mark it shipped
 * DELETE …/milestones/{id}/shipped   mark it not shipped
 *
 * THE STAGE FOLLOWS, in the repository's own write: the product is `shipping`
 * from its first shipped milestone and an `idea` again when none is.
 *
 * A MILESTONE THAT WENT FROM NOT SHIPPED TO SHIPPED OFFERS A POST — a draft
 * Feature shipped post prefilled from it, unless the product already holds a
 * post about that milestone (design §6.2). Offered, never published: the
 * answer carries it as `offeredPost` so the page can open the builder on it,
 * and `null` when there was nothing to offer. A draft that could not be
 * written does not fail the mark; the milestone shipped either way.
 */
export async function handleSetMilestoneShipped(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  milestoneId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;

  const shipped = request.method !== "DELETE";
  const at = shipped ? (deps.now ?? (() => new Date()))().toISOString() : null;
  const result = await deps.repo.setProductMilestoneShipped(profileId, milestoneId, at);
  if (!result) return errorResponse("not_found", "Not found", 404, requestId);

  if (result.changed) {
    await auditProductWrite(
      deps,
      crew.ctx,
      shipped ? "openproduct.milestone.shipped" : "openproduct.milestone.unshipped",
      `openproduct milestone ${result.milestone.code} marked ${shipped ? "shipped" : "not shipped"} on ${crew.ctx.profile.slug}`,
      { milestoneId: milestonePublicId(result.milestone.id), code: result.milestone.code, stage: result.stage },
    );
  }

  let offered: ProductPostRecord | null = null;
  if (shipped && result.changed) {
    try {
      offered = await offerFeaturePost(deps as unknown as SelfPostDeps, crew.ctx, result.milestone);
    } catch {
      // Deliberately swallowed — see `self-posts.ts`. The milestone shipped.
    }
  }
  return successResponse(
    {
      milestone: crewMilestone(result.milestone),
      stage: result.stage,
      offeredPost: offered ? crewProductPost(offered) : null,
    },
    requestId,
  );
}

// ─── "Needs you" ────────────────────────────────────────────────────────────

/**
 * GET …/needs-you — what waits on the crew, in one read: pending requests to
 * join, and the product's drafts.
 *
 * A REQUEST IS DECIDED ON ORUNBASE, NOT HERE. A request to join is a join
 * request of the workspace behind the listing; this estate holds a snapshot
 * of its status, written by the platform's seam events, and has no binding
 * through which to approve or deny one. Each row carries `requestRef`, the
 * request's reference there, so the page can send the crew to it.
 */
export async function handleNeedsYou(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProductPostHandlerDeps,
): Promise<Response> {
  const crew = await crewOf(env, actor, orgId, profileId, deps, requestId);
  if (!crew.ok) return crew.response;
  const [requests, drafts] = await Promise.all([
    deps.repo.listPendingApplicationsForProfile(profileId),
    deps.repo.listProductPostDrafts(profileId),
  ]);
  const needsYou: CrewNeedsYou = {
    requests: requests.map((request) => ({
      id: request.id,
      roleOpeningId: roleOpeningPublicId(request.roleOpeningId),
      roleTitle: request.openingTitle,
      requestRef: request.jrRequestRef,
      requester: { handle: request.requesterHandle, displayName: request.requesterName },
      createdAt: request.createdAt,
    })),
    drafts: drafts.map(crewProductPost),
  };
  return successResponse({ needsYou }, requestId);
}
