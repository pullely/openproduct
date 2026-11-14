// Private threads, and resolving an issue (openproduct-redesign OPR-4,
// design §7).
//
// THE ONE SIGNED-IN PATH. A private thread and its posts are readable by its
// author and by the product's crew at the time of the read, and by nobody
// else. Every read in this file goes through three repository methods —
// `listPrivateThreads`, `getPrivateThread`, `listPrivatePosts` — each of
// which is handed THE READER and checks author-or-crew in its own SQL. This
// file does not decide who may read; it passes the actor in and renders what
// comes back.
//
// EVERY REFUSAL IS ONE 404, WITH ONE BODY. A thread that does not exist, a
// private thread the reader may not see, a public thread asked for here, an
// id that is not an id, a product that is not listed: `notFound()` below,
// the same bytes each time, so no answer says "it exists, and it is not
// yours". There is no 403 in this file.
//
// NOTHING HERE IS CACHED. These routes are on the authenticated plane, which
// the gateway answers `no-store`; a private thread reaches a page only from
// a signed-in fetch after load, never from a public page's render (I6).
//
// NO ROUTE CHANGES VISIBILITY. It is written once, by `handleCreateThread`,
// and 2280's trigger refuses a statement that would turn a private thread
// public. If an answer is worth publishing, the crew asks the author to post
// it as a public thread (design §7.3).

import {
  MAX_POST_BODY,
  POST_REMOVED_NOTE,
  isMaintainerPost,
  parseBody,
  threadAcceptsPosts,
  type CrewPrivateThreadNotice,
  type PrivateThread,
  type PrivateThreadDocument,
  type PrivateThreadList,
  type PublicPost,
  type ChosenThreadTag,
} from "@openproduct/contracts";
import type { OpenproductRepository, PostRecord, PrivateThreadRecord, ThreadRecord } from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { generateId, type Uuid } from "../ids.js";
import { crewSubjects, notifyPrivateThread, publicThread, requirePerson } from "./discussions.js";

export interface TalkHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listPrivateThreads"
    | "getPrivateThread"
    | "listPrivatePosts"
    | "setThreadResolved"
    | "getThread"
    | "getPublicProfileId"
    | "getListingRole"
    | "listMaintainerSubjects"
    | "createPost"
    | "countPostVotes"
    | "getActiveHandleForSubject"
    | "writeNotification"
    | "listMutes"
    | "queueNotification"
  >;
  generateId?: () => Uuid;
  now?: () => Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The one refusal. Same status, same code, same message, every time. */
function notFound(requestId: string): Response {
  return errorResponse("not_found", "Not found", 404, requestId);
}

/** Field by field from the pinned key set, never spread from the record. */
function privateThread(record: ThreadRecord, reader: string, awaitingCrew: boolean): PrivateThread {
  return {
    ...publicThread(record),
    visibility: "private",
    mine: record.authorSubjectId === reader,
    awaitingCrew,
  };
}

/**
 * A private thread's post, in the public post's shape.
 *
 * `authorIsMaintainer` is decided against the crew NOW (`listing_maintainers`)
 * rather than the published roster a public page uses: the only readers are
 * the author and that crew, and a crew member who has not published
 * themselves on the roster is still the crew to both.
 *
 * Mentions stay plain text: no handle is resolved for a private thread.
 */
function privatePost(record: PostRecord, votes: number, crew: ReadonlySet<string>): PublicPost {
  return {
    id: record.id,
    tag: record.tag as ChosenThreadTag | null,
    authorHandle: record.authorHandle,
    authorName: record.authorName,
    body: record.state === "removed" ? [{ kind: "text", value: POST_REMOVED_NOTE }] : parseBody(record.body),
    state: record.state,
    createdAt: record.createdAt,
    editedAt: record.editedAt,
    isAnswer: record.isAnswer,
    authorIsMaintainer: isMaintainerPost(record.authorSubjectId, crew),
    parentPostId: record.parentPostId,
    votes,
  };
}

/**
 * GET /internal/openproduct/threads/private?slug={slug}
 *
 * The private threads on a product that THIS reader may see: their own, or —
 * on the crew — all of them. Somebody with none gets an empty list, which is
 * also what an unlisted or unknown product answers: the list never says
 * whether there is anything to be kept from you.
 */
export async function handleListPrivateThreads(
  _env: Env,
  requestId: string,
  url: URL,
  actor: ActorContext,
  deps: TalkHandlerDeps,
): Promise<Response> {
  const refusal = requirePerson(actor, requestId);
  if (refusal) return notFound(requestId);

  const slug = url.searchParams.get("slug") ?? "";
  const profileId = slug ? await deps.repo.getPublicProfileId(slug) : null;
  const empty: PrivateThreadList = { crew: false, threads: [] };
  if (!profileId) return successResponse(empty, requestId);

  const [rows, role] = await Promise.all([
    deps.repo.listPrivateThreads(profileId, actor.subjectId, 100),
    deps.repo.getListingRole(profileId as Uuid, actor.subjectId),
  ]);
  const list: PrivateThreadList = {
    crew: role !== null,
    threads: rows.map((row: PrivateThreadRecord) => privateThread(row, actor.subjectId, row.awaitingCrew)),
  };
  return successResponse(list, requestId);
}

/** GET /internal/openproduct/threads/private/{id} */
export async function handleGetPrivateThread(
  _env: Env,
  requestId: string,
  id: string,
  actor: ActorContext,
  deps: TalkHandlerDeps,
): Promise<Response> {
  if (requirePerson(actor, requestId)) return notFound(requestId);
  if (!UUID_RE.test(id)) return notFound(requestId);

  const thread = await deps.repo.getPrivateThread(id, actor.subjectId);
  if (!thread?.profileId || !thread.slug) return notFound(requestId);

  // The posts carry the same predicate in their own statement: were the
  // reader removed from the crew between the two reads, this comes back
  // empty rather than trusting the read above.
  const [posts, crew] = await Promise.all([
    deps.repo.listPrivatePosts(thread.id, actor.subjectId, 200),
    crewSubjects(deps, thread.profileId),
  ]);
  const crewSet = new Set(crew);
  const counts = posts.length > 0 ? await deps.repo.countPostVotes(posts.map((post) => post.id)) : new Map<string, number>();
  const last = posts[posts.length - 1];
  const document: PrivateThreadDocument = {
    slug: thread.slug,
    crew: crewSet.has(actor.subjectId),
    thread: privateThread(thread, actor.subjectId, last ? !crewSet.has(last.authorSubjectId) : true),
    posts: posts.map((post) => privatePost(post, counts.get(post.id) ?? 0, crewSet)),
  };
  return successResponse(document, requestId);
}

/**
 * POST /internal/openproduct/threads/private/{id}/posts  `{body}`
 *
 * A reply from the author or the crew. THE WRITE IS GUARDED TWICE: the read
 * below answers 404 to anybody else, and `createPost`'s own UPDATE refuses a
 * private thread to a writer who may not read it — so losing a place on the
 * crew between the two is a refusal, not a post.
 *
 * WHO IS TOLD: a crew reply reaches the author's Activity; the author's
 * reply reaches the crew's. Never a mention, never the thread's past
 * participants.
 */
export async function handleCreatePrivatePost(
  _env: Env,
  request: Request,
  requestId: string,
  threadId: string,
  actor: ActorContext,
  deps: TalkHandlerDeps,
): Promise<Response> {
  if (requirePerson(actor, requestId)) return notFound(requestId);
  if (!UUID_RE.test(threadId)) return notFound(requestId);

  const thread = await deps.repo.getPrivateThread(threadId, actor.subjectId);
  if (!thread?.profileId || !thread.slug) return notFound(requestId);

  let body: { body?: unknown };
  try {
    body = (await request.json()) as { body?: unknown };
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0 || text.length > MAX_POST_BODY) {
    return validationError(requestId, { body: [`Must be 1 to ${MAX_POST_BODY} characters`] });
  }
  if (!threadAcceptsPosts(thread.state)) {
    return errorResponse("conflict", "This thread is closed to new posts", 409, requestId);
  }

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const postId = await deps.repo.createPost({
    id: (deps.generateId ?? generateId)(),
    threadId,
    authorSubjectId: actor.subjectId,
    body: text,
    at,
  });
  // Null: locked mid-request, or the writer stopped being a reader. The
  // second is the same 404 the read would now give.
  if (!postId) {
    const still = await deps.repo.getPrivateThread(threadId, actor.subjectId);
    return still
      ? errorResponse("conflict", "This thread is closed to new posts", 409, requestId)
      : notFound(requestId);
  }

  const crew = await crewSubjects(deps, thread.profileId);
  const authorWrote = actor.subjectId === thread.authorSubjectId;
  await notifyPrivateThread(deps, {
    kind: authorWrote ? "thread.private.reply" : "thread.private.answered",
    threadId,
    slug: thread.slug,
    actorSubjectId: actor.subjectId,
    recipients: authorWrote ? crew : [thread.authorSubjectId],
    eventRef: postId,
  });

  return successResponse({ postId }, requestId, 201);
}

/**
 * PUT / DELETE /internal/openproduct/threads/{id}/resolved
 *
 * The crew marks an issue resolved, or opens it again. On a public issue the
 * moment is on the public thread and shows to everyone; on a private one it
 * shows to the two groups who can read it.
 *
 * CREW ONLY, AND A REFUSAL IS A 404 — for a public thread too. One answer for
 * "not the crew", "not an issue's thread you can see" and "no such thread"
 * means this route cannot be used to ask whether an id is a private thread.
 */
export async function handleResolveThread(
  _env: Env,
  request: Request,
  requestId: string,
  threadId: string,
  actor: ActorContext,
  deps: TalkHandlerDeps,
): Promise<Response> {
  if (requirePerson(actor, requestId)) return notFound(requestId);
  if (!UUID_RE.test(threadId)) return notFound(requestId);

  // A public thread by the public read; a private one by the signed-in read,
  // which only returns it to its author or the crew.
  const thread =
    (await deps.repo.getThread(threadId)) ?? (await deps.repo.getPrivateThread(threadId, actor.subjectId));
  if (!thread?.profileId) return notFound(requestId);

  const role = await deps.repo.getListingRole(thread.profileId as Uuid, actor.subjectId);
  if (!role) return notFound(requestId);

  if (thread.kind !== "issue" || thread.state === "removed") {
    return errorResponse("conflict", "Only an issue can be marked resolved", 409, requestId);
  }

  const resolvedAt = request.method === "DELETE" ? null : (deps.now ?? (() => new Date()))().toISOString();
  const ok = await deps.repo.setThreadResolved(threadId, resolvedAt);
  if (!ok) return errorResponse("conflict", "Only an issue can be marked resolved", 409, requestId);
  return successResponse({ resolvedAt }, requestId);
}

/**
 * The crew's "Needs you" rows for private threads: the ones where the last
 * word is not the crew's. Read through the signed-in path AS THE ACTOR, so a
 * caller who reached the crew's door some other way (an operator) is given
 * only what the privacy rule gives them — their own.
 *
 * NO TITLE. The board's row is "{somebody} started a private thread", and the
 * thread is opened to be read.
 */
export async function privateThreadNotices(
  deps: { repo: Pick<OpenproductRepository, "listPrivateThreads" | "getListingRole"> },
  profileId: string,
  actor: ActorContext,
): Promise<CrewPrivateThreadNotice[]> {
  const role = await deps.repo.getListingRole(profileId as Uuid, actor.subjectId);
  if (!role) return [];
  const rows = await deps.repo.listPrivateThreads(profileId, actor.subjectId, 100);
  return rows
    .filter((row) => row.awaitingCrew && row.state === "open" && row.resolvedAt === null && row.authorSubjectId !== actor.subjectId)
    .map((row) => ({
      id: row.id,
      authorHandle: row.authorHandle,
      authorName: row.authorName,
      createdAt: row.createdAt,
    }));
}
