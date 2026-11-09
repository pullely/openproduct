// Collections (openproduct-commons LC4).
//
// THE GATE IS THE MILESTONE. Everything else here is bookkeeping around one
// rule: a collection carries its curator's name, and that name has to lead
// somewhere. `curatorHandle` is where that is enforced, it is called by every
// write, and it asks CG4's biconditional rather than inventing a second idea
// of who is nameable.
//
// The refusal it produces is aimed at somebody who has done nothing wrong —
// they signed in, they tried to make a collection, and the answer is no. So
// it says what the bar IS and how to clear it. A "403 forbidden" here would
// be technically accurate and would read as a door with no handle.
//
// WHY THE PUBLIC READS RESOLVE NO ACTOR. Same as every other public read on
// the estate (OPC-1, I6): the collection is one document, identical for
// everybody, which is what lets it be cached and what makes it quotable. The
// curator sees the same page their readers do — there is no "your view" of
// somebody's published judgement.

import {
  COLLECTION_REFUSALS,
  MAX_COLLECTION_ITEMS,
  MAX_ITEM_NOTE,
  MAX_COLLECTION_BLURB,
  MAX_LIVE_COLLECTIONS_PER_CURATOR,
  collectionSlugIsWellFormed,
  titleIsAcceptable,
  type CollectionRefusalReason,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { generateId, type Uuid } from "../ids.js";
import { thumbnailsForSlugs } from "./media.js";

export interface CollectionHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "curatorHandleFor"
    | "getPublicProfileId"
    | "countLiveCollections"
    | "listPublishedCollections"
    | "getPublicCollection"
    | "listCollectionsForCurator"
    | "getCuratorCollection"
    | "createCollection"
    | "addCollectionItem"
    | "removeCollectionItem"
    | "reorderCollectionItems"
    | "setCollectionState"
    // openproduct-studio OSD3 — the items' logos, one read per collection.
    | "listPublicMediaForSlugs"
  >;
  now?: () => Date;
  generateId?: () => Uuid;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(reason: CollectionRefusalReason, requestId: string, status = 409): Response {
  return errorResponse(reason, COLLECTION_REFUSALS[reason].says, status, requestId);
}

/**
 * The one gate, asked once per write.
 *
 * Returns the handle rather than a boolean, because every caller that needs
 * to know "may they" also needs to know "under what name" — and two calls
 * would be two chances for the answer to change between them.
 */
async function curatorHandle(
  actor: ActorContext,
  deps: CollectionHandlerDeps,
): Promise<string | null> {
  return deps.repo.curatorHandleFor(actor.subjectId);
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/** The index. Published collections whose curator still resolves. */
export async function handleCollectionsIndex(
  _env: Env,
  request: Request,
  requestId: string,
  deps: CollectionHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  const collections = await deps.repo.listPublishedCollections(100);
  return successResponse({ collections }, requestId, 200);
}

/**
 * One collection.
 *
 * A 404 WHEN IT IS NOT PUBLISHED OR ITS CURATOR STOPPED RESOLVING, and the
 * two are deliberately indistinguishable from outside: telling a stranger
 * "this exists but its curator went private" reports on somebody's privacy
 * setting to people who have no business knowing about it.
 */
export async function handleCollection(
  _env: Env,
  request: Request,
  slug: string,
  requestId: string,
  deps: CollectionHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  const collection = await deps.repo.getPublicCollection(slug);
  if (!collection) {
    return errorResponse("not_found", "No collection at that address", 404, requestId);
  }
  // openproduct-studio OSD3 — `CollectionItem.card` is a `PublicProfileCard`,
  // whose `thumbnail` the repository's card row does not carry: filled here,
  // in one batched read over the collection's slugs, in the curator's order.
  const thumbnailFor = await thumbnailsForSlugs(deps.repo, collection.items.map((item) => item.card.slug));
  return successResponse(
    {
      collection: {
        ...collection,
        items: collection.items.map((item) => ({
          ...item,
          card: { ...item.card, thumbnail: thumbnailFor(item.card.slug) },
        })),
      },
    },
    requestId,
    200,
  );
}

// ---------------------------------------------------------------------------
// The curator's own surface
// ---------------------------------------------------------------------------

/**
 * What this person has curated, and whether they may curate at all.
 *
 * `eligible` is returned even when the list is empty, because the studio has
 * to render two quite different pages — "you have none yet" and "you cannot
 * yet, and here is why" — and cannot tell them apart from an empty array.
 */
export async function handleMyCollections(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: CollectionHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  const handle = await curatorHandle(actor, deps);
  const collections = await deps.repo.listCollectionsForCurator(actor.subjectId);
  return successResponse(
    { eligible: handle !== null, curatorHandle: handle, collections },
    requestId,
    200,
  );
}

interface CreateBody {
  slug?: unknown;
  title?: unknown;
  blurb?: unknown;
}

export async function handleCreateCollection(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: CollectionHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  const handle = await curatorHandle(actor, deps);
  if (handle === null) return refuse("not-a-curator", requestId, 403);

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return validationError(requestId, { body: ["Expected a JSON object"] });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const blurb =
    typeof body.blurb === "string" && body.blurb.trim().length > 0
      ? body.blurb.trim().slice(0, MAX_COLLECTION_BLURB)
      : null;

  if (!titleIsAcceptable(title)) return refuse("title-required", requestId, 422);
  if (!collectionSlugIsWellFormed(slug)) return refuse("slug-shape", requestId, 422);

  const created = await deps.repo.createCollection({
    id: (deps.generateId ?? generateId)(),
    slug,
    title,
    blurb,
    curatorSubjectId: actor.subjectId,
    at: (deps.now?.() ?? new Date()).toISOString(),
  });
  // Null means the address is taken — by another collection, since the slug
  // namespaces are separate tables under one route prefix.
  if (!created) return refuse("slug-taken", requestId);

  return successResponse({ collection: created }, requestId, 201);
}

interface ItemBody {
  collectionId?: unknown;
  slug?: unknown;
  note?: unknown;
  order?: unknown;
}

/**
 * Add, remove, or reorder — one handler, dispatched on the method's own
 * intent field, because all three need the same ownership check and the same
 * eligibility gate and three copies of that pair is two too many.
 */
export async function handleCollectionItems(
  _env: Env,
  request: Request,
  intent: "add" | "remove" | "reorder",
  requestId: string,
  actor: ActorContext,
  deps: CollectionHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  if ((await curatorHandle(actor, deps)) === null) {
    return refuse("not-a-curator", requestId, 403);
  }

  let body: ItemBody;
  try {
    body = (await request.json()) as ItemBody;
  } catch {
    return validationError(requestId, { body: ["Expected a JSON object"] });
  }

  const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
  if (!UUID_RE.test(collectionId)) return refuse("unknown-collection", requestId, 404);

  // OWNERSHIP FIRST, and through the repository's own curator-scoped read —
  // so "is this mine" is answered by the same statement that fetches it,
  // rather than by a comparison this handler could forget.
  const owned = await deps.repo.getCuratorCollection(collectionId as Uuid, actor.subjectId);
  if (!owned) return refuse("not-yours", requestId, 404);

  const at = (deps.now?.() ?? new Date()).toISOString();

  if (intent === "reorder") {
    const order = Array.isArray(body.order) ? body.order.filter((s): s is string => typeof s === "string") : null;
    if (!order) return validationError(requestId, { order: ["Expected an array of slugs"] });
    const moved = await deps.repo.reorderCollectionItems(collectionId as Uuid, order, at);
    return successResponse({ reordered: moved }, requestId, 200);
  }

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (slug.length === 0) return refuse("unknown-listing", requestId, 404);

  if (intent === "remove") {
    const removed = await deps.repo.removeCollectionItem(collectionId as Uuid, slug);
    if (!removed) return refuse("unknown-listing", requestId, 404);
    return successResponse({ removed: true }, requestId, 200);
  }

  // THE BOUND IS CHECKED AGAINST WHAT IS HELD, not what is visible. A curator
  // at the limit whose listings went private has not freed a slot — the items
  // are still theirs and still come back.
  if (owned.held >= MAX_COLLECTION_ITEMS) return refuse("too-many-items", requestId);

  const note =
    typeof body.note === "string" && body.note.trim().length > 0
      ? body.note.trim().slice(0, MAX_ITEM_NOTE)
      : null;
  const added = await deps.repo.addCollectionItem({
    collectionId: collectionId as Uuid,
    slug,
    note,
    at,
  });
  // False means one of two things and they are different to the person: the
  // listing is not publicly addable, or it is already in. Classified by a
  // read AFTER the failed write, never before it — the INSERT's own SELECT is
  // the correctness guard (a check split from the write is a check a race
  // walks through); this read only decides which sentence to show.
  if (!added) {
    const addable = await deps.repo.getPublicProfileId(slug);
    return refuse(addable === null ? "unknown-listing" : "already-in", requestId);
  }
  return successResponse({ added: true }, requestId, 201);
}

interface StateBody {
  collectionId?: unknown;
  state?: unknown;
}

export async function handleCollectionState(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: CollectionHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  if ((await curatorHandle(actor, deps)) === null) {
    return refuse("not-a-curator", requestId, 403);
  }

  let body: StateBody;
  try {
    body = (await request.json()) as StateBody;
  } catch {
    return validationError(requestId, { body: ["Expected a JSON object"] });
  }

  const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
  if (!UUID_RE.test(collectionId)) return refuse("unknown-collection", requestId, 404);
  const state = body.state === "published" || body.state === "retired" ? body.state : null;
  if (state === null) {
    return validationError(requestId, { state: ["Expected 'published' or 'retired'"] });
  }

  const owned = await deps.repo.getCuratorCollection(collectionId as Uuid, actor.subjectId);
  if (!owned) return refuse("not-yours", requestId, 404);

  if (state === "published") {
    // AN EMPTY COLLECTION CANNOT BE PUBLISHED, checked against `held` rather
    // than `visible`: a collection whose items are all currently private is
    // not empty, it is having a bad day, and refusing to publish it would be
    // refusing on the strength of somebody else's unpublish.
    if (owned.held === 0) return refuse("empty-collection", requestId, 422);
    const live = await deps.repo.countLiveCollections(actor.subjectId);
    if (live >= MAX_LIVE_COLLECTIONS_PER_CURATOR) {
      return refuse("too-many-collections", requestId);
    }
  }

  const moved = await deps.repo.setCollectionState(
    collectionId as Uuid,
    actor.subjectId,
    state,
    (deps.now?.() ?? new Date()).toISOString(),
  );
  // Null means the transition was not legal from where it is: publish from
  // draft, retire from published, and nothing else.
  if (!moved) return refuse("unknown-collection", requestId);

  return successResponse({ collection: moved }, requestId, 200);
}
