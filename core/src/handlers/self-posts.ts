// Posts that write themselves (openproduct-redesign OPR-3, design §6.2).
//
// Three acts on a product leave a post behind:
//
//   a milestone is marked shipped      → a DRAFT Feature shipped post
//   a seat (role opening) is opened    → a DRAFT Help wanted post
//   a listing is published, first time → its New idea post
//
// NOTHING IS PUBLISHED WITHOUT A CREW MEMBER PRESSING POST, with one
// exception the design names: the first idea post, which the act of
// publishing the listing is. Even that one is only published when the listing
// can fill every required block of the template — and a listing holds no
// "Who has it", so in practice it is written as a draft the crew finishes
// (see `writeIdeaPost`).
//
// A DRAFT THE SYSTEM WROTE HAS NO AUTHOR. Whoever presses Post becomes it.
//
// BEST-EFFORT AT THE CALL SITE. The milestone was shipped, the seat was
// opened and the listing was published whether or not a draft could be
// offered; every caller catches what this throws and carries on.
//
// This file also holds the one publish routine, because both the system's
// idea post and the crew's Post button go through it: the comment thread is
// made first, the post is published against it, and a publish that lost a
// race takes its thread back.

import {
  PRODUCT_POST_THREAD_TAG,
  prefilledPostBlocks,
  productPostThreadTitle,
  validatePostBlocks,
  type ProductPostBlock,
} from "@openproduct/contracts";
import type {
  OpenproductRepository,
  ProductMilestoneRecord,
  ProductPostRecord,
  ProfileRecord,
  RoleOpeningRecord,
} from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import { generateId, milestonePublicId, productPostPublicId, roleOpeningPublicId, type Uuid } from "../ids.js";

export interface SelfPostDeps {
  repo: Pick<
    OpenproductRepository,
    "createProductPost" | "publishProductPost" | "createThread" | "setThreadState" | "appendAudit"
  >;
  now?: () => Date;
  generateId?: () => Uuid;
}

/** Who did what to which listing, for the audit line every write leaves. */
export interface PostWriteContext {
  orgId: string;
  profile: ProfileRecord;
  actor: ActorContext;
  requestId: string;
}

/**
 * The audit entry for a product-post or milestone write. The same local
 * trail (`openproduct.audit_log`) and the same payload head as the listing's
 * own writes, so one query reads a listing's whole history.
 */
export async function auditProductWrite(
  deps: Pick<SelfPostDeps, "repo" | "now" | "generateId">,
  ctx: PostWriteContext,
  type: string,
  description: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  await deps.repo.appendAudit({
    id: (deps.generateId ?? generateId)(),
    orgId: ctx.orgId as Uuid,
    profileId: ctx.profile.id as Uuid,
    actorType: ctx.actor.subjectType,
    actorId: ctx.actor.subjectId,
    type,
    description,
    payload: { slug: ctx.profile.slug, visibility: ctx.profile.visibility, ...payload },
    requestId: ctx.requestId,
    occurredAt: now.toISOString(),
  });
}

/**
 * Publish a draft: make its comment thread, then move the post.
 *
 * THE THREAD FIRST. A published post with no thread is a post nobody can
 * comment on, and there is no transaction to hold the two together; made in
 * this order, the failure that is left is a thread nothing points at, which
 * this takes back. Null means the post was not a draft any more — somebody
 * else pressed Post — and nothing was published twice.
 */
export async function publishDraft(
  deps: SelfPostDeps,
  input: {
    profile: ProfileRecord;
    post: ProductPostRecord;
    blocks: ProductPostBlock[];
    /** Who the post is by; null when the system publishes it. */
    authorSubjectId: string | null;
    /** A thread row needs an author; the person whose act published the post. */
    threadAuthorSubjectId: string;
    at: string;
    /** `undefined` keeps the draft's link; `null` clears it. */
    milestoneId?: Uuid | null | undefined;
    roleOpeningId?: Uuid | null | undefined;
  },
): Promise<ProductPostRecord | null> {
  const threadId = (deps.generateId ?? generateId)();
  const created = await deps.repo.createThread({
    id: threadId,
    profileId: input.profile.id,
    tag: PRODUCT_POST_THREAD_TAG,
    title: productPostThreadTitle(input.post.kind, input.profile.slug),
    authorSubjectId: input.threadAuthorSubjectId,
    at: input.at,
  });
  if (!created) throw new Error("product post thread was not created");

  const published = await deps.repo.publishProductPost(input.profile.id as Uuid, input.post.id as Uuid, {
    at: input.at,
    blocks: input.blocks,
    threadId,
    authorSubjectId: input.authorSubjectId,
    milestoneId: input.milestoneId,
    roleOpeningId: input.roleOpeningId,
  });
  if (!published) {
    await deps.repo.setThreadState(threadId, "removed", ["open"]);
    return null;
  }
  return published;
}

/**
 * A milestone was marked shipped: offer a Feature shipped post.
 *
 * Feature = the title, What it does = the summary, Milestone = the code, Try
 * it = the product's address when it has one. A DRAFT, linked to the
 * milestone; null when the product already holds a post about it.
 */
export async function offerFeaturePost(
  deps: SelfPostDeps,
  ctx: PostWriteContext,
  milestone: ProductMilestoneRecord,
): Promise<ProductPostRecord | null> {
  const post = await deps.repo.createProductPost({
    id: (deps.generateId ?? generateId)(),
    profileId: ctx.profile.id as Uuid,
    kind: "feature",
    authorSubjectId: null,
    blocks: prefilledPostBlocks("feature", {
      feature: milestone.title,
      what: milestone.summary,
      try: ctx.profile.tryUrl,
      milestone: milestone.code,
    }),
    milestoneId: milestone.id as Uuid,
    unless: "milestone",
  });
  if (!post) return null;
  await auditProductWrite(
    deps,
    ctx,
    "openproduct.product_post.created",
    `openproduct draft Feature shipped post offered on ${ctx.profile.slug} for milestone ${milestone.code}`,
    { postId: productPostPublicId(post.id), kind: post.kind, source: "milestone", milestoneId: milestonePublicId(milestone.id) },
  );
  return post;
}

/**
 * A seat was opened: offer a Help wanted post.
 *
 * Role = the title, What you'd do = the description, Time = the commitment —
 * each cut to its block's limit, since a role opening's own fields are
 * longer than the template's. A DRAFT, linked to the opening.
 */
export async function offerSeatPost(
  deps: SelfPostDeps,
  ctx: PostWriteContext,
  opening: RoleOpeningRecord,
): Promise<ProductPostRecord | null> {
  const post = await deps.repo.createProductPost({
    id: (deps.generateId ?? generateId)(),
    profileId: ctx.profile.id as Uuid,
    kind: "seat",
    authorSubjectId: null,
    blocks: prefilledPostBlocks("seat", {
      role: opening.title,
      what: opening.description,
      time: opening.commitment,
    }),
    roleOpeningId: opening.id as Uuid,
    unless: "role_opening",
  });
  if (!post) return null;
  await auditProductWrite(
    deps,
    ctx,
    "openproduct.product_post.created",
    `openproduct draft Help wanted post offered on ${ctx.profile.slug} for "${opening.title}"`,
    { postId: productPostPublicId(post.id), kind: post.kind, source: "role_opening", roleOpeningId: roleOpeningPublicId(opening.id) },
  );
  return post;
}

/**
 * A listing was published for the first time: write its New idea post.
 *
 * Problem = the tagline, or the pitch's opening when there is no tagline.
 * PUBLISHED ONLY IF THE TEMPLATE IS COMPLETE — and it is not: the template
 * requires "Who has it" and a listing holds nothing that answers it, so the
 * post is written as a DRAFT with the problem filled in, and it waits in
 * "Needs you" for the crew to finish and press Post. The publish branch is
 * here so that the day a listing can fill the template, the design's rule
 * (the first idea post is the act of publishing the listing) holds without
 * another change.
 */
export async function writeIdeaPost(
  deps: SelfPostDeps,
  ctx: PostWriteContext,
): Promise<{ post: ProductPostRecord; published: boolean } | null> {
  const blocks = prefilledPostBlocks("idea", {
    problem: ctx.profile.tagline ?? ctx.profile.pitchBody?.split(/\n\s*\n/)[0] ?? null,
  });
  const draft = await deps.repo.createProductPost({
    id: (deps.generateId ?? generateId)(),
    profileId: ctx.profile.id as Uuid,
    kind: "idea",
    authorSubjectId: null,
    blocks,
    unless: "idea",
  });
  if (!draft) return null;

  let post = draft;
  let published = false;
  if (validatePostBlocks("idea", blocks).length === 0) {
    const at = (deps.now ?? (() => new Date()))().toISOString();
    const live = await publishDraft(deps, {
      profile: ctx.profile,
      post: draft,
      blocks,
      // The system posted it: no author.
      authorSubjectId: null,
      threadAuthorSubjectId: ctx.actor.subjectId,
      at,
    });
    if (live) {
      post = live;
      published = true;
    }
  }
  await auditProductWrite(
    deps,
    ctx,
    published ? "openproduct.product_post.published" : "openproduct.product_post.created",
    published
      ? `openproduct New idea post published on ${ctx.profile.slug} with its listing`
      : `openproduct draft New idea post written on ${ctx.profile.slug} with its listing`,
    { postId: productPostPublicId(post.id), kind: post.kind, source: "listing" },
  );
  return { post, published };
}
