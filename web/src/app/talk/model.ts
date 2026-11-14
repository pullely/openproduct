// Talk, as data (openproduct-redesign OPR-4; boards `Product` Talk tab,
// `ProductIdea`, and their phone boards).
//
// PURE, AND NO JSX: the web test lane is module-level. Everything a Talk
// surface decides — which threads a filter shows, what a row says, where a
// thread lives, what a form posts — is here, so it can be asserted without a
// browser.
//
// THE RULE THIS FILE SERVES (design §4, §7): a public page is the same bytes
// for everybody, so the server render of Talk holds PUBLIC threads only. A
// private thread reaches the page from a signed-in fetch after load — and
// only for its author or the product's crew, which core decides.

import {
  TALK_BADGE_PRIVATE,
  TALK_BADGE_PUBLIC,
  TALK_FILTERS,
  THREAD_KINDS,
  THREAD_KIND_LABELS,
  THREAD_TAG_LABELS,
  privateThreadPath,
  publicThreadPath,
  talkRepliesLabel,
  type PrivateThread,
  type PublicThread,
  type TalkFilter,
  type ThreadKind,
  type ThreadVisibility,
} from "@openproduct/contracts";

/** A thread as a Talk list holds it: public from the page, private from the
 *  signed-in read. */
export interface TalkThread {
  readonly id: string;
  readonly visibility: ThreadVisibility;
  readonly title: string;
  readonly kind: ThreadKind | null;
  readonly tag: PublicThread["tag"];
  readonly authorHandle: string | null;
  readonly authorName: string | null;
  readonly createdAt: string;
  readonly lastPostAt: string | null;
  readonly postCount: number;
  readonly resolvedAt: string | null;
  readonly state: PublicThread["state"];
  /** Private only: the reader wrote it. */
  readonly mine: boolean;
}

export function talkThreadOf(thread: PublicThread | PrivateThread): TalkThread {
  const isPrivate = "visibility" in thread && thread.visibility === "private";
  return {
    id: thread.id,
    visibility: isPrivate ? "private" : "public",
    title: thread.title,
    kind: thread.kind ?? null,
    tag: thread.tag,
    authorHandle: thread.authorHandle,
    authorName: thread.authorName,
    createdAt: thread.createdAt,
    lastPostAt: thread.lastPostAt,
    postCount: thread.postCount,
    resolvedAt: thread.resolvedAt ?? null,
    state: thread.state,
    mine: isPrivate ? (thread as PrivateThread).mine : false,
  };
}

/**
 * How many public threads the page holds — or null when they could not be
 * read. "We could not ask" is not "there are none" (OD5): a null draws no
 * count and no "No threads".
 */
export function publicThreadCount(threads: readonly PublicThread[] | null | undefined): number | null {
  return threads ? threads.length : null;
}

/** When a thread last moved: its latest post, or its start. */
function movedAt(thread: TalkThread): number {
  const at = Date.parse(thread.lastPostAt ?? thread.createdAt);
  return Number.isNaN(at) ? 0 : at;
}

/**
 * The page's public threads and the reader's private ones, as one list:
 * most recently active first, each thread once. A private thread can never
 * replace a public one of the same id (ids are unique; this is belt and
 * braces for a list built from two reads).
 */
export function mergeThreads(
  publicThreads: readonly PublicThread[],
  privateThreads: readonly PrivateThread[],
): TalkThread[] {
  const seen = new Set<string>();
  const out: TalkThread[] = [];
  for (const thread of [...publicThreads.map(talkThreadOf), ...privateThreads.map(talkThreadOf)]) {
    if (seen.has(thread.id)) continue;
    seen.add(thread.id);
    out.push(thread);
  }
  return out.sort((a, b) => movedAt(b) - movedAt(a) || (a.id < b.id ? -1 : 1));
}

export function filterThreads(threads: readonly TalkThread[], filter: TalkFilter): TalkThread[] {
  return filter === "all" ? [...threads] : threads.filter((thread) => thread.visibility === filter);
}

/**
 * The filter's segments. `Private` is offered only to a signed-in reader:
 * to anybody else there is nothing it could show, and offering it would be
 * a control that only ever answers "nothing".
 */
export function talkFilters(signedIn: boolean): readonly TalkFilter[] {
  return signedIn ? TALK_FILTERS : TALK_FILTERS.filter((filter) => filter !== "private");
}

export function filterCount(threads: readonly TalkThread[], filter: TalkFilter): number {
  return filterThreads(threads, filter).length;
}

/** "Question" — the thread's kind; an older thread shows its forum category. */
export function threadKindLabel(thread: Pick<TalkThread, "kind" | "tag">): string {
  return thread.kind ? THREAD_KIND_LABELS[thread.kind] : THREAD_TAG_LABELS[thread.tag];
}

/** Who a row names. "You" for the reader's own private thread (the board). */
export function threadAuthor(thread: Pick<TalkThread, "authorName" | "authorHandle" | "mine">): string {
  if (thread.mine) return "You";
  return thread.authorName ?? thread.authorHandle ?? "Somebody";
}

/** The avatar's letter: the author's first, as the board draws it. */
export function threadMonogram(author: string): string {
  const letter = author.trim().replace(/^@/, "")[0];
  return letter ? letter.toUpperCase() : "·";
}

/** The badge at a row's right. Shorter on a phone (board `PhoneProduct`). */
export function threadBadge(visibility: ThreadVisibility): { label: string; short: string } {
  return visibility === "private"
    ? { label: TALK_BADGE_PRIVATE, short: "Private" }
    : { label: TALK_BADGE_PUBLIC, short: TALK_BADGE_PUBLIC };
}

/** Where a thread is read: its own address, by visibility. */
export function threadHref(thread: Pick<TalkThread, "id" | "visibility">): string {
  return thread.visibility === "private" ? privateThreadPath(thread.id) : publicThreadPath(thread.id);
}

/** The row's one action: "Reply", "1 reply", "4 replies"; "Answer" for the
 *  crew on a thread nobody has answered. */
export function threadRepliesLabel(thread: Pick<TalkThread, "postCount">, crew: boolean): string {
  return talkRepliesLabel(thread.postCount, crew);
}

/** An issue the crew may mark resolved. */
export function canResolve(thread: Pick<TalkThread, "kind" | "state">, crew: boolean): boolean {
  return crew && thread.kind === "issue" && thread.state !== "removed";
}

/** Whether a row says "Resolved" — to everybody. */
export function isResolved(thread: Pick<TalkThread, "kind" | "resolvedAt">): boolean {
  return thread.kind === "issue" && thread.resolvedAt !== null;
}

// ─── the composer's form ───────────────────────────────────────────────────

export const TALK_FIELD_TITLE = "title";
export const TALK_FIELD_KIND = "kind";
export const TALK_FIELD_VISIBILITY = "visibility";

/** The kinds, in the board's order, with the one checked by default. */
export const TALK_KIND_DEFAULT: ThreadKind = "question";
export const TALK_VISIBILITY_DEFAULT: ThreadVisibility = "public";
export { THREAD_KINDS };

// ─── addresses on this site ────────────────────────────────────────────────

/** POST — start a thread on this product. */
export function talkStartRoute(slug: string): string {
  return `/${slug}/talk/start`;
}

/** GET — the reader's private threads on this product (JSON, no-store). */
export function talkPrivateRoute(slug: string): string {
  return `/${slug}/talk/private`;
}

/** GET — one private thread (JSON, no-store; 404 for anybody else). */
export function privateThreadDataRoute(threadId: string): string {
  return `/threads/private/${threadId}/data`;
}

/** POST — reply in a private thread. */
export function privateThreadReplyRoute(threadId: string): string {
  return `/threads/private/${threadId}/reply`;
}

/** POST — mark an issue resolved or open again (`resolved` = `1` | `0`). */
export function threadResolveRoute(threadId: string): string {
  return `/threads/${threadId}/resolve`;
}

/** The fragment that opens Talk on its Private filter ("Needs you" → Open). */
export const TALK_PRIVATE_ANCHOR = "private";

/** What the page says after an act came back (`?talk=…`). */
export const TALK_NOTICES: Readonly<Record<string, string>> = {
  invalid: "A thread needs a few words, up to 160 characters",
  profile: "Posting publicly needs a public profile. A private thread does not",
  failed: "That did not go through. Try again in a moment",
};

export function talkNotice(code: string | null | undefined): string | null {
  return code && Object.hasOwn(TALK_NOTICES, code) ? TALK_NOTICES[code]! : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isThreadId(value: string): boolean {
  return UUID_RE.test(value);
}
