// The discussion surface (openproduct-commons CB1).
//
// THIS IS THE MILESTONE THE GATE WAS FOR. Everything else this epic adds is
// read-only or a single bit; this adds free text, written by strangers, on a
// public page, attached to somebody else's product, permanently, indexed. It
// does not merge before TS2's velocity limits and TS3's removal path are on
// `main`, and both are.
//
// THE READ IS ON THE PUBLIC BRANCH, with everything that implies: no actor is
// resolved, nothing personal enters it, and the answer is edge-cached and
// byte-identical for everyone (OPC-1, I6). A discussion is a page about a
// conversation, not a page for a viewer.
//
// THE WRITES ARE SIGNED, ALWAYS (CB-2). There is no anonymous or pseudonymous
// path, and posting requires a CG public profile — which inherits CG-2's
// eligibility bound (you cannot have a profile without being on a listed
// product) and is most of the spam defence for free.
//
// BODIES ARE RENDERED HERE, ON READ, through the contract's restricted
// subset. Never stored rendered: tightening the subset has to apply to every
// post ever written, not only to the ones written afterwards.

import {
  resolveMentions,
  mentionedHandles,
  isMaintainerPost,
  MAX_POST_BODY,
  MAX_THREAD_TITLE,
  POST_REMOVED_NOTE,
  PUBLIC_POST_KEYS,
  PUBLIC_THREAD_KEYS,
  THREAD_TAGS,
  DISCUSSIONS_COLLAPSED_MESSAGE,
  isChosenThreadTag,
  type ChosenThreadTag,
  launchThreadTitle,
  parseBody,
  eventRef,
  notificationRecipients,
  threadAcceptsPosts,
  type PublicPost,
  type NotificationKind,
  type PublicThread,
  type ThreadTag,
  FORUM_THREAD_LIMIT,
  type Forum,
  forumFormula,
  parseForumOrder,
  parseForumTag,
} from "@openproduct/contracts";
import type { OpenproductRepository, PostRecord, ThreadRecord } from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { fanOut, type InboxWriter } from "./inbox.js";
import { generateId, type Uuid } from "../ids.js";

export interface DiscussionHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listThreads"
    | "listForumThreads"
    | "getThread"
    | "listPosts"
    // CV2 — the published roster, to decide the maintainer badge.
    | "listMaintainers"
    // CV3 — the handle namespace, to decide which mentions are claimed.
    | "getSubjectsForHandles"
    | "createThread"
    | "createPost"
    // DQ0b — the listing's one comment thread, read and made on demand.
    | "getLaunchThread"
    | "ensureLaunchThread"
    // DQ1 — the public count on a comment, and the act behind it.
    | "countPostVotes"
    | "votePost"
    | "withdrawPostVote"
    // NF0 — the on-site inbox, beside CB4's outbox.
    | "writeNotification"
    | "getSlugForThread"
    | "getPostAuthor"
    | "setThreadState"
    | "markAnswer"
    | "getPublicProfileId"
    | "getListingRole"
    | "getActiveHandleForSubject"
    // CB4 — notifications. Derived participants, stored mutes, an outbox.
    | "listThreadParticipants"
    | "listMutes"
    | "queueNotification"
  >;
  generateId?: () => Uuid;
  now?: () => Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ASSEMBLED FIELD BY FIELD from the pinned key set, never spread from the
 * record — the OD3 rule, applied where getting it wrong publishes an opaque
 * subject id (I3) beside somebody's words.
 */
function publicThread(record: ThreadRecord): PublicThread {
  return {
    id: record.id,
    tag: record.tag as ThreadTag,
    title: record.title,
    authorHandle: record.authorHandle,
    authorName: record.authorName,
    state: record.state,
    createdAt: record.createdAt,
    lastPostAt: record.lastPostAt,
    postCount: record.postCount,
  };
}

function publicPost(
  record: PostRecord,
  votes = 0,
  maintainers: ReadonlySet<string> = new Set(),
  claimedHandles: ReadonlySet<string> = new Set(),
): PublicPost {
  return {
    id: record.id,
    // PP0 — the tag, when the author chose one.
    tag: record.tag as ChosenThreadTag | null,
    authorHandle: record.authorHandle,
    authorName: record.authorName,
    // A REMOVED POST CARRIES NO BODY AND SAYS SO. The repository already
    // emptied it in SQL; this renders the note instead, so the reply is still
    // in the conversation and the reader can see that something was here
    // rather than wondering why the thread does not follow (TS-3).
    // CV3 — mentions are stamped AFTER parsing, from a read of the namespace.
    // The parser sees text; whether a handle belongs to somebody who showed up
    // is a fact about the namespace, and an unclaimed one stays plain text
    // rather than becoming a link to a person who never arrived (OPC-5).
    body:
      record.state === "removed"
        ? [{ kind: "text", value: POST_REMOVED_NOTE }]
        : resolveMentions(parseBody(record.body), claimedHandles),
    state: record.state,
    createdAt: record.createdAt,
    editedAt: record.editedAt,
    isAnswer: record.isAnswer,
    // CV2 — decided HERE, over subject ids, because that is what the roster
    // holds. The id itself never crosses the wire; only the answer does.
    authorIsMaintainer: isMaintainerPost(record.authorSubjectId, maintainers),
    // CV1 — which post this answers, or null. The nesting itself is the
    // page's (`nestPosts`); what crosses the wire is the edge.
    parentPostId: record.parentPostId,
    // DQ1 — public and identical for everybody. Whether YOU upvoted it
    // arrives after paint from the XP2 overlay, so a thread's anonymous and
    // signed-in renders stay byte-identical (I6). Honest at zero.
    votes,
  };
}

/**
 * DQ1 — the same posts, each carrying its public count, in ONE extra read.
 * A thread of forty comments would otherwise be forty counts.
 *
 * CV2 ADDED A SECOND READ, and it is a second read PER PAGE rather than per
 * post: one roster answers every post in the thread. The badge could not be
 * decided from what a post already carries — a post knows its author's
 * subject id, and whether that subject maintains this listing is a fact about
 * the LISTING. Both reads are issued together.
 */
async function withVotes(
  deps: DiscussionHandlerDeps,
  posts: readonly PostRecord[],
  /** The listing whose roster decides the badge. `null` where a thread is not
   *  attached to one — no roster, so nobody is badged, which is the honest
   *  answer rather than a guess. */
  profileId: string | null,
): Promise<PublicPost[]> {
  if (posts.length === 0) return [];
  // CV3 — the handles this thread mentions, parsed once and resolved in ONE
  // read for the whole page. Parsing here rather than inside `publicPost`
  // means each body is parsed twice; the alternative is a read per post,
  // which is the cost this file has refused twice already.
  const mentioned = [
    ...new Set(posts.flatMap((post) => mentionedHandles(parseBody(post.body)))),
  ];

  const [counts, roster, handles] = await Promise.all([
    deps.repo.countPostVotes(posts.map((post) => post.id)),
    // `ThreadRecord.profileId` is a plain string while `listMaintainers`
    // takes the branded id. The column is a UUID either way — the brand is
    // simply not tracked through `ThreadRecord` — so the assertion is where
    // the two spellings meet rather than a claim about the value.
    profileId === null ? Promise.resolve([]) : deps.repo.listMaintainers(profileId as Uuid),
    mentioned.length === 0
      ? Promise.resolve(new Map<string, string>())
      : deps.repo.getSubjectsForHandles(mentioned),
  ]);
  const maintainers = new Set(roster.map((m) => m.subjectId));
  // ACTIVE HOLDERS ONLY — `getSubjectsForHandles` omits a released handle, so
  // a mention of a name somebody gave up renders as text. Attaching it to the
  // previous holder would name a person who is no longer there.
  const claimed = new Set(handles.keys());
  return posts.map((post) => publicPost(post, counts.get(post.id) ?? 0, maintainers, claimed));
}

/**
 * Queue notifications for a thread event (CB4).
 *
 * AFTER THE WRITE, AND NEVER BEFORE IT. The post is in the thread whether or
 * not this succeeds; queueing first would risk telling people about something
 * that then failed to happen.
 *
 * FAILURES HERE DO NOT FAIL THE ACT. Somebody who wrote a reply must not lose
 * it because a notification table was unavailable — the reply is the thing
 * they came to do, and the message is a courtesy about it. The row is an
 * outbox precisely so this can be retried later; swallowing the error is the
 * cheaper failure, and it is the one whose cost falls on us rather than on
 * the person who was typing.
 */
async function notifyThread(
  deps: DiscussionHandlerDeps,
  input: {
    threadId: string;
    actorSubjectId: string;
    kind: NotificationKind;
    causeId: string;
    /**
     * CV3 — who to tell INSTEAD of the thread's participants.
     *
     * A mention is not a thread event: the person named may never have been
     * in this conversation, which is the whole reason to tell them. So the
     * recipients are given rather than read — and everything downstream is
     * unchanged, because the two subtractions that matter (never your own
     * act, never somebody who muted) apply to any list.
     */
    recipients?: readonly string[];
  },
): Promise<void> {
  try {
    const participants = input.recipients ?? (await deps.repo.listThreadParticipants(input.threadId));
    const mutes = await deps.repo.listMutes(input.threadId, participants);
    const recipients = notificationRecipients({
      participants,
      actorSubjectId: input.actorSubjectId,
      threadMuted: mutes.thread,
      globallyMuted: mutes.global,
    });
    const ref = eventRef(input.kind, input.causeId);
    const make = deps.generateId ?? generateId;
    for (const subjectId of recipients) {
      await deps.repo.queueNotification({
        id: make(),
        subjectId,
        kind: input.kind,
        threadId: input.threadId,
        eventRef: ref,
      });
    }
  } catch {
    // Deliberately swallowed — see the header. The act already happened.
  }
}

/**
 * CV3 — tell whoever a post named.
 *
 * TWO READS AND A SUBTRACTION. The body is parsed for handles, the handles
 * are resolved to subjects in one read, and the thread's own participants are
 * removed — because they are already being told by `notifyThread`, and being
 * told twice about one post is how somebody turns all of it off.
 *
 * A HANDLE THAT RESOLVES TO NOBODY SENDS NOTHING, which is the write side of
 * the same rule the renderer applies: an unclaimed handle is text, not a
 * person (OPC-5).
 *
 * Swallowed like its sibling, and for the same reason: the post is the thing
 * somebody came to write.
 */
async function notifyMentions(
  deps: DiscussionHandlerDeps,
  input: { threadId: string; actorSubjectId: string; body: string; causeId: string },
): Promise<void> {
  try {
    const handles = mentionedHandles(parseBody(input.body));
    if (handles.length === 0) return;
    const subjects = await deps.repo.getSubjectsForHandles(handles);
    if (subjects.size === 0) return;
    const participants = new Set(await deps.repo.listThreadParticipants(input.threadId));
    const named = [...subjects.values()].filter((subjectId) => !participants.has(subjectId));
    if (named.length === 0) return;
    await notifyThread(deps, {
      threadId: input.threadId,
      actorSubjectId: input.actorSubjectId,
      kind: "mention",
      causeId: input.causeId,
      recipients: named,
    });
  } catch {
    // Deliberately swallowed — see `notifyThread`. The post already happened.
  }
}

/**
 * NF0 — the same participants CB4 mails, in the on-site inbox.
 *
 * A SECOND FAN-OUT RATHER THAN A SHARED ONE, and the difference is `mutes`.
 * CB4 drops muted threads because a mute is about being INTERRUPTED; an inbox
 * row is not an interruption, it is a line in a list somebody chose to open.
 * Muting a thread to stop the email should not also hide the replies from the
 * page you go to when you want to find them.
 *
 * SWALLOWS EVERYTHING, like CB4's. The post is in the thread whether or not we
 * managed to tell anybody.
 */
async function notifyInbox(
  deps: DiscussionHandlerDeps,
  input: { threadId: string; actorSubjectId: string; postId: string; slug?: string },
): Promise<void> {
  try {
    const participants = await deps.repo.listThreadParticipants(input.threadId);
    const slug = input.slug ?? (await deps.repo.getSlugForThread(input.threadId));
    if (!slug) return;
    const handle = (await deps.repo.getActiveHandleForSubject(input.actorSubjectId))?.handle ?? null;
    await fanOut(deps as unknown as InboxWriter, {
      kind: "post.reply",
      subjectIds: participants,
      actorSubjectId: input.actorSubjectId,
      actorHandle: handle,
      targetKind: "post",
      targetRef: slug,
      // The POST is the event: one row per person per reply, and a retry
      // writes nothing.
      eventRef: input.postId,
    });
  } catch {
    // Deliberately swallowed — see the note above.
  }
}

/** GET /internal/public/openproduct/projects/{slug}/threads */
/**
 * GET the forum index (openproduct-worldclass-v2 FO1).
 *
 * PUBLIC, ANONYMOUS, ACTOR-FREE (OPC-1, I6). Two published orders and six
 * categories, every one of them a path on the website and a query here; an
 * unknown order or tag is REFUSED rather than coerced — `?order=hot`
 * answered with the latest is one URL with two meanings.
 */
export async function handlePublicForum(
  _env: Env,
  requestId: string,
  url: URL,
  deps: Pick<DiscussionHandlerDeps, "repo">,
): Promise<Response> {
  const order = parseForumOrder(url.searchParams.get("order"));
  if (order === null) return errorResponse("invalid", "Unknown order", 400, requestId);
  const tag = parseForumTag(url.searchParams.get("tag"));
  if (tag === undefined) return errorResponse("invalid", "Unknown tag", 400, requestId);

  const rows = await deps.repo.listForumThreads({ tag, order, limit: FORUM_THREAD_LIMIT });
  const forum: Forum = {
    order,
    tag,
    // The public projection, field by field, plus the listing's slug — and
    // nothing from the record that a public shape does not carry (I3).
    threads: rows.map((row) => ({ ...publicThread(row), slug: row.slug })),
    formula: forumFormula(order),
  };
  return successResponse(forum, requestId);
}

export async function handlePublicThreads(
  _env: Env,
  requestId: string,
  slug: string,
  tag: string | null,
  deps: DiscussionHandlerDeps,
): Promise<Response> {
  const profileId = await deps.repo.getPublicProfileId(slug);
  // A listing that is private, delisted, removed or nonexistent answers
  // identically — the same 404 the listing itself gives, for the same reason.
  if (!profileId) return errorResponse("not_found", "Not found", 404, requestId);

  const filter = tag && (THREAD_TAGS as readonly string[]).includes(tag) ? tag : null;

  // DQ0b — THE PRODUCT PAGE'S OWN COMMENTS TRAVEL WITH ITS DISCUSSIONS, in
  // one document. The page renders both: a flat comment section and a list of
  // titled discussions. Two endpoints would have made the most-read page on
  // the estate pay a third round trip to draw one section, and the two answers
  // could disagree about which threads exist.
  //
  // A FILTERED READ CARRIES NO LAUNCH THREAD. `?tag=question` is a request for
  // one kind of discussion, and the comment section is not one of the kinds.
  const [threads, launch] = await Promise.all([
    deps.repo.listThreads(profileId, filter, 50),
    filter === null ? deps.repo.getLaunchThread(profileId) : Promise.resolve(null),
  ]);

  // The posts, only when there is a thread to hold them. A listing nobody has
  // commented on has no thread at all — which is a state, not a failure.
  const posts = launch ? await deps.repo.listPosts(launch.id, 200) : [];

  return successResponse(
    {
      threads: threads.map(publicThread),
      // ABSENT, NEVER AN EMPTY THREAD. `null` says "nobody has commented",
      // and the page draws the design's empty note; a thread with no posts
      // would be a conversation somebody started and did not have.
      launch: launch
        ? { thread: publicThread(launch), posts: await withVotes(deps, posts, profileId) }
        : null,
    },
    requestId,
  );
}

/**
 * PP0 collapsed titled threads on the LISTING PAGE (one launch, one
 * conversation) and kept this flag so the collapse was reversible. FO0 flips
 * it: a thread has a home again — the forum (`/threads`, `/{slug}/forum`)
 * rather than a second module on the listing — and the door at
 * `/threads/new` is what creates one. The listing page is unchanged: its one
 * conversation stays the launch thread, and PP0's tags stay on comments.
 */
const TITLED_THREADS_COLLAPSED = false;

interface CommentBody {
  slug?: unknown;
  body?: unknown;
  /** PP0 — optional. */
  tag?: unknown;
}

/**
 * POST a comment on a listing (openproduct-launch DQ0b).
 *
 * THE SAME ACT AS A REPLY, reached from a page that never asked anybody to
 * name a thread. The design draws a box on the product page: you type and you
 * have said something. So this creates the listing's one `launch` thread if it
 * does not exist and posts into it if it does — one call, because the caller
 * cannot know which of those it is and should not have to.
 *
 * EVERY RULE THAT GUARDS A REPLY GUARDS THIS. Same trust floor
 * (`requireProfile`), same length bound, same render subset on the way out,
 * same CB4 notification, same TS3 removal path, and the same `createPost`
 * whose UPDATE is where a locked thread is actually enforced.
 *
 * A LOCKED LAUNCH THREAD STAYS LOCKED. `ensureLaunchThread` cannot route
 * around it: the partial unique index counts a locked thread as the one this
 * listing has, so the insert conflicts, the existing thread comes back, and
 * `createPost` refuses it. A moderator who locks a product's comments has
 * locked them.
 */
export async function handleCreateComment(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: DiscussionHandlerDeps,
): Promise<Response> {
  const eligible = await requireProfile(actor, requestId, deps);
  if (eligible) return eligible;

  let body: CommentBody;
  try {
    body = (await request.json()) as CommentBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const slug = typeof body.slug === "string" ? body.slug : "";
  const profileId = slug ? await deps.repo.getPublicProfileId(slug) : null;
  if (!profileId) return errorResponse("not_found", "Not found", 404, requestId);

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0 || text.length > MAX_POST_BODY) {
    return validationError(requestId, { body: [`Must be 1 to ${MAX_POST_BODY} characters`] });
  }

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const make = deps.generateId ?? generateId;

  // PP0 — OPTIONAL, and refused rather than dropped when it is not one of the
  // six: a tag the page would not render is a tag the author did not mean.
  const rawTag = body.tag;
  let tag: ChosenThreadTag | null = null;
  if (rawTag !== undefined && rawTag !== null && rawTag !== "") {
    if (typeof rawTag !== "string" || !isChosenThreadTag(rawTag)) {
      return validationError(requestId, { tag: [`Must be one of: ${THREAD_TAGS.join(", ")}`] });
    }
    tag = rawTag;
  }
  const thread = await deps.repo.ensureLaunchThread({
    id: make(),
    profileId,
    // NOBODY TYPED A TITLE, so the system writes one from the listing's own
    // name. Not shown on the product page — the section is called
    // "Discussion" there — but it is what a moderator sees in the queue, and
    // "Untitled" in that queue is a row nobody can act on.
    title: launchThreadTitle(slug),
    authorSubjectId: actor.subjectId,
  });
  if (!thread) {
    return errorResponse("internal_error", "Could not open the discussion", 500, requestId);
  }

  const postId = await deps.repo.createPost({
    id: make(),
    threadId: thread.id,
    authorSubjectId: actor.subjectId,
    body: text,
    at,
    tag,
  });
  // Null means the thread is not accepting posts — locked by a maintainer, or
  // locked before this request arrived. The UPDATE is the authority.
  if (!postId) {
    return errorResponse("conflict", "This discussion is closed to new posts", 409, requestId);
  }

  // CB4 — everybody in the thread except the person who just wrote. On the
  // first comment that is nobody, which is the correct fan-out for a
  // conversation of one.
  await notifyThread(deps, {
    threadId: thread.id,
    actorSubjectId: actor.subjectId,
    kind: "reply",
    causeId: postId,
  });
  // CV3 — AND WHOEVER THE POST NAMED. A separate fan-out from the one above
  // because it is a different question: the thread's participants are told
  // that a conversation they are in moved, and a mentioned person is told
  // that somebody named them — which is worth saying precisely when they were
  // NOT already in the thread.
  //
  // `notificationRecipients` still subtracts the actor and the mutes, so
  // naming yourself sends nothing and a muted thread stays muted. And the
  // event ref is the POST's id, so a post naming somebody four times collides
  // with itself and sends once (CB4's unique index does the collapsing).
  await notifyMentions(deps, {
    threadId: thread.id,
    actorSubjectId: actor.subjectId,
    body: text,
    causeId: postId,
  });

  await notifyInbox(deps, {
    threadId: thread.id,
    actorSubjectId: actor.subjectId,
    postId,
    slug,
  });

  return successResponse({ threadId: thread.id, postId }, requestId, 201);
}

/** GET /internal/public/openproduct/threads/{id} */
export async function handlePublicThread(
  _env: Env,
  requestId: string,
  id: string,
  deps: DiscussionHandlerDeps,
): Promise<Response> {
  if (!UUID_RE.test(id)) return errorResponse("not_found", "Not found", 404, requestId);
  const thread = await deps.repo.getThread(id);
  if (!thread) return errorResponse("not_found", "Not found", 404, requestId);

  // A REMOVED THREAD IS NOT A 404 — TS-3, the same rule the listing page
  // follows. The address resolves and says what happened; the posts do not
  // travel, because removing a thread removes the conversation.
  if (thread.state === "removed") {
    return successResponse({ thread: publicThread(thread), posts: [] }, requestId);
  }

  const posts = await deps.repo.listPosts(thread.id, 200);
  return successResponse(
    { thread: publicThread(thread), posts: await withVotes(deps, posts, thread.profileId) },
    requestId,
  );
}

interface ThreadBody {
  slug?: unknown;
  tag?: unknown;
  title?: unknown;
  body?: unknown;
}

/**
 * POST a new thread — and its opening post, in one act.
 *
 * A THREAD WITHOUT A FIRST POST IS A HEADLINE. Requiring the body here means
 * the discussion tab can never show a card that opens onto nothing, and it
 * removes the state where somebody creates a thread, loses the tab, and
 * leaves a title nobody can answer.
 */
export async function handleCreateThread(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: DiscussionHandlerDeps,
): Promise<Response> {
  const eligible = await requireProfile(actor, requestId, deps);
  if (eligible) return eligible;

  // PP0 (WC-6) — ONE LAUNCH, ONE CONVERSATION. The route stays, so a form
  // that predates the collapse gets a sentence rather than a 404, and the
  // eligibility check stays in front of it so the sentence is not a probe.
  // Everything below is unreachable and kept: the collapse is reversible.
  if (TITLED_THREADS_COLLAPSED) {
    return errorResponse("gone", DISCUSSIONS_COLLAPSED_MESSAGE, 410, requestId);
  }
  let body: ThreadBody;
  try {
    body = (await request.json()) as ThreadBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const slug = typeof body.slug === "string" ? body.slug : "";
  const profileId = slug ? await deps.repo.getPublicProfileId(slug) : null;
  if (!profileId) return errorResponse("not_found", "Not found", 404, requestId);

  const tag = body.tag;
  if (typeof tag !== "string" || !(THREAD_TAGS as readonly string[]).includes(tag)) {
    return validationError(requestId, { tag: [`Must be one of: ${THREAD_TAGS.join(", ")}`] });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length === 0 || title.length > MAX_THREAD_TITLE) {
    return validationError(requestId, { title: [`Must be 1 to ${MAX_THREAD_TITLE} characters`] });
  }

  const opening = typeof body.body === "string" ? body.body.trim() : "";
  if (opening.length === 0 || opening.length > MAX_POST_BODY) {
    return validationError(requestId, { body: [`Must be 1 to ${MAX_POST_BODY} characters`] });
  }

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const make = deps.generateId ?? generateId;
  const threadId = make();

  const created = await deps.repo.createThread({
    id: threadId,
    profileId,
    tag,
    title,
    authorSubjectId: actor.subjectId,
    at,
  });
  if (!created) return errorResponse("internal_error", "Could not start the discussion", 500, requestId);

  await deps.repo.createPost({
    id: make(),
    threadId,
    authorSubjectId: actor.subjectId,
    body: opening,
    at,
  });

  return successResponse({ threadId }, requestId, 201);
}

/** POST a reply. */
export async function handleCreatePost(
  env: Env,
  request: Request,
  requestId: string,
  threadId: string,
  actor: ActorContext,
  deps: DiscussionHandlerDeps,
): Promise<Response> {
  const eligible = await requireProfile(actor, requestId, deps);
  if (eligible) return eligible;

  if (!UUID_RE.test(threadId)) return errorResponse("not_found", "Not found", 404, requestId);

  let body: { body?: unknown; parentPostId?: unknown };
  try {
    body = (await request.json()) as { body?: unknown; parentPostId?: unknown };
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length === 0 || text.length > MAX_POST_BODY) {
    return validationError(requestId, { body: [`Must be 1 to ${MAX_POST_BODY} characters`] });
  }

  // CV1 — the post being answered, when there is one. Shape-checked here and
  // EXISTENCE-checked in the insert: the SQL requires a parent in this thread
  // that is itself top-level, so a reply to a reply and a reply across threads
  // insert nothing rather than being caught by a check that raced somebody
  // else's write.
  const parentPostId =
    typeof body.parentPostId === "string" && body.parentPostId.length > 0
      ? body.parentPostId
      : null;
  if (parentPostId !== null && !UUID_RE.test(parentPostId)) {
    return validationError(requestId, { parentPostId: ["Must be a post id"] });
  }

  const thread = await deps.repo.getThread(threadId);
  if (!thread) return errorResponse("not_found", "Not found", 404, requestId);
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
    parentPostId,
  });
  // Null means the thread stopped accepting posts between the read above and
  // the write — a maintainer locking mid-request — OR the parent did not pass
  // the insert's own guard. The UPDATE and the sub-select are the authority,
  // not the checks above, which is why the checks alone were never enough.
  if (!postId) {
    return parentPostId === null
      ? errorResponse("conflict", "This thread is closed to new posts", 409, requestId)
      : errorResponse(
          "conflict",
          "That post cannot be replied to: it is not in this thread, or it is itself a reply",
          409,
          requestId,
        );
  }

  // CB4 — everybody in the thread except the person who just wrote.
  await notifyThread(deps, {
    threadId,
    actorSubjectId: actor.subjectId,
    kind: "reply",
    causeId: postId,
  });
  // CV3 — AND WHOEVER THE POST NAMED. A separate fan-out from the one above
  // because it is a different question: the thread's participants are told
  // that a conversation they are in moved, and a mentioned person is told
  // that somebody named them — which is worth saying precisely when they were
  // NOT already in the thread.
  //
  // `notificationRecipients` still subtracts the actor and the mutes, so
  // naming yourself sends nothing and a muted thread stays muted. And the
  // event ref is the POST's id, so a post naming somebody four times collides
  // with itself and sends once (CB4's unique index does the collapsing).
  await notifyMentions(deps, {
    threadId: threadId,
    actorSubjectId: actor.subjectId,
    body: text,
    causeId: postId,
  });

  // NF0 — the same people, in the on-site inbox. TWO CHANNELS, TWO POLICIES:
  // this one names the actor because the reply is on a public page with their
  // handle beside it, and CB4's mail does not because a name in a subject line
  // is searchable and forwardable.
  await notifyInbox(deps, { threadId, actorSubjectId: actor.subjectId, postId });

  return successResponse({ postId }, requestId, 201);
}

/**
 * PUT / DELETE an upvote on a comment (openproduct-launch DQ1).
 *
 * THE SAME ACT AS AN ENDORSEMENT, one level down: public, one per person, with
 * your name on it, and withdrawable. What differs is what it moves — a
 * listing's total orders the directory, the board and the leaderboard, while
 * this orders nothing at all, which is the argument at the top of the
 * migration for why it carries no integrity discount.
 *
 * THE POST ID IS IN THE PATH, so TS2 can bound votes per POST without reading
 * a body. A brigade on one comment is the shape this defends against, and the
 * target has to be visible to the layer doing the bounding.
 *
 * EVERY REFUSAL IS ONE 404 OR ONE 403. A self-vote (refused by the schema's
 * trigger), a post that does not exist, and a post removed mid-request are the
 * same answer, because telling them apart would make this an existence oracle
 * for post ids — the discipline `getPublicContributor` already applies to
 * handles.
 */
export async function handleVotePost(
  _env: Env,
  request: Request,
  requestId: string,
  postId: string,
  actor: ActorContext,
  deps: DiscussionHandlerDeps,
): Promise<Response> {
  const eligible = await requireProfile(actor, requestId, deps);
  if (eligible) return eligible;

  if (!UUID_RE.test(postId)) return errorResponse("not_found", "Not found", 404, requestId);

  const at = (deps.now ?? (() => new Date()))().toISOString();

  if (request.method === "DELETE") {
    // WITHDRAWING WHAT YOU HAVE NOT VOTED ON IS THE STATE YOU ASKED FOR. The
    // repository answers false and this answers 200, because a caller pressing
    // an already-unvoted control wants it unvoted (FL0's `unfollow`, same
    // reasoning).
    await deps.repo.withdrawPostVote(postId, actor.subjectId, at);
    return successResponse({ voted: false }, requestId);
  }

  const ok = await deps.repo.votePost(postId, actor.subjectId, at);
  if (ok) {
    // NF0 — the comment's AUTHOR, and nobody else. HOW MANY, NEVER WHO: an
    // upvote's count is public and its voters are listed nowhere, so naming
    // them here would be the one place on the estate that did.
    //
    // THE EVENT IS THE VOTER, not the post: a second person upvoting the same
    // comment is a second event, and keying on the post alone would tell the
    // author about the first and never again.
    await notifyUpvote(deps, postId, actor.subjectId);
  }
  if (!ok) {
    // The one refusal a person can actually cause is voting on their own
    // comment, and it gets a sentence rather than a silence — a control that
    // renders and then does nothing is worse than one that says why.
    return errorResponse("conflict", "You cannot upvote your own comment", 409, requestId);
  }
  return successResponse({ voted: true }, requestId);
}

/**
 * NF0 — tell a comment's author it was upvoted.
 *
 * SWALLOWS EVERYTHING. The vote is cast whether or not we managed to say so.
 */
async function notifyUpvote(
  deps: DiscussionHandlerDeps,
  postId: string,
  actorSubjectId: string,
): Promise<void> {
  try {
    const author = await deps.repo.getPostAuthor(postId);
    // The self-vote cannot happen (the schema refuses it), so this is only
    // ever somebody else's comment — but the fan-out drops the actor anyway,
    // because a rule enforced in one place is a rule that moves.
    if (!author) return;
    const slug = await deps.repo.getSlugForThread(author.threadId);
    if (!slug) return;
    const counts = await deps.repo.countPostVotes([postId]);
    await fanOut(deps as unknown as InboxWriter, {
      kind: "post.upvoted",
      subjectIds: [author.authorSubjectId],
      actorSubjectId,
      // NO ACTOR HANDLE. The sentence says how many, not who.
      actorHandle: null,
      targetKind: "post",
      targetRef: slug,
      eventRef: `${postId}:${actorSubjectId}`,
      figure: counts.get(postId) ?? 1,
    });
  } catch {
    // Deliberately swallowed.
  }
}

interface MaintainBody {
  intent?: unknown;
  postId?: unknown;
}

/**
 * A maintainer's acts on their own listing's thread: lock, unlock, answer.
 *
 * REMOVAL IS NOT HERE. Removing a post is a TS3 act with a ledger row and a
 * reason, taken by an operator — not something a maintainer does to a reply
 * they disliked on their own product. A maintainer who wants a thread to stop
 * can lock it, which ends the conversation without retracting it, and can
 * report a post like anybody else.
 */
export async function handleMaintainThread(
  env: Env,
  request: Request,
  requestId: string,
  threadId: string,
  actor: ActorContext,
  deps: DiscussionHandlerDeps,
): Promise<Response> {
  if (!UUID_RE.test(threadId)) return errorResponse("not_found", "Not found", 404, requestId);

  const thread = await deps.repo.getThread(threadId);
  if (!thread?.profileId) return errorResponse("not_found", "Not found", 404, requestId);

  const role = await deps.repo.getListingRole(thread.profileId as Uuid, actor.subjectId);
  if (!role) return errorResponse("forbidden", "This discussion is not yours to manage", 403, requestId);

  let body: MaintainBody;
  try {
    body = (await request.json()) as MaintainBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  if (body.intent === "lock") {
    const ok = await deps.repo.setThreadState(threadId, "locked", ["open", "answered"]);
    if (!ok) return errorResponse("conflict", "That thread cannot be locked from here", 409, requestId);
    return successResponse({ state: "locked" }, requestId);
  }
  if (body.intent === "unlock") {
    const ok = await deps.repo.setThreadState(threadId, "open", ["locked"]);
    if (!ok) return errorResponse("conflict", "That thread is not locked", 409, requestId);
    return successResponse({ state: "open" }, requestId);
  }
  if (body.intent === "answer") {
    if (typeof body.postId !== "string" || !UUID_RE.test(body.postId)) {
      return validationError(requestId, { postId: ["Must be a post id"] });
    }
    const ok = await deps.repo.markAnswer(threadId, body.postId);
    if (!ok) {
      return errorResponse("conflict", "That post cannot be marked as the answer", 409, requestId);
    }
    await notifyThread(deps, {
      threadId,
      actorSubjectId: actor.subjectId,
      kind: "answered",
      causeId: body.postId,
    });
    return successResponse({ state: "answered" }, requestId);
  }

  return validationError(requestId, { intent: ["Must be one of: lock, unlock, answer"] });
}

/**
 * CB-2, as a gate: a public profile is required to post.
 *
 * Returns a Response when the actor may NOT post, and undefined when they
 * may. Written that way so every write path is one line and cannot forget the
 * check by forgetting to read a boolean.
 *
 * The handle IS the eligibility: CG1 only issues one to somebody who opted in
 * and has standing, and CG-2 only gives standing to somebody on a listed
 * product. So this one read carries the whole of the bound, and the spam
 * defence is a consequence of the signature rather than a separate system.
 */
async function requireProfile(
  actor: ActorContext,
  requestId: string,
  deps: DiscussionHandlerDeps,
): Promise<Response | undefined> {
  if (actor.subjectType !== "user") {
    return errorResponse("forbidden", "Posts come from people — this credential is not one", 403, requestId);
  }
  const handle = await deps.repo.getActiveHandleForSubject(actor.subjectId);
  if (!handle) {
    return errorResponse(
      "forbidden",
      "Posting needs a public profile, so that every post is signed with one.",
      403,
      requestId,
    );
  }
  return undefined;
}

/**
 * A maintainer's own listing's threads (CB1).
 *
 * The SAME public shape a reader gets, deliberately: a maintainer who is
 * shown something readers are not is a maintainer moderating a page they
 * cannot see. The one addition is the slug, so the studio breadcrumb can name
 * the listing rather than echoing an opaque id.
 */
export async function handleListProfileThreads(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  profileId: Uuid,
  deps: DiscussionHandlerDeps & { repo: Pick<OpenproductRepository, "getProfileForOrg"> },
  orgId: Uuid,
): Promise<Response> {
  const role = await deps.repo.getListingRole(profileId, actor.subjectId);
  if (!role) return errorResponse("forbidden", "That listing is not yours", 403, requestId);

  const [threads, profile] = await Promise.all([
    deps.repo.listThreads(profileId, null, 100),
    deps.repo.getProfileForOrg(orgId, profileId),
  ]);
  return successResponse(
    { threads: threads.map(publicThread), slug: profile?.slug ?? null },
    requestId,
  );
}

/** Exported for the key-set invariant (I2). */
export const DISCUSSION_KEY_SETS = {
  thread: PUBLIC_THREAD_KEYS,
  post: PUBLIC_POST_KEYS,
} as const;
