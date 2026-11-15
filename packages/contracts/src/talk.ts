// Talk: a thread's kind and who may see it (openproduct-redesign OPR-4,
// design §7).
//
// Talk on a product is its forum — `threads` and `posts`, CB1's objects with
// CB1's rules — with three additions: a KIND (question, issue, suggestion),
// a VISIBILITY (public, private) and, for an issue, the moment the crew
// marked it resolved.
//
// ─── THE PRIVACY RULE ─────────────────────────────────────────────────────
//
// A private thread and its posts are readable by exactly two groups: the
// thread's author, and the product's crew at the time of the read. Nobody
// else is told that it exists. The rule is held in the repository's SQL
// (`packages/db`), not here and not in a page; what this file holds is the
// part every layer has to agree on:
//
//   * `PublicThread` carries NO visibility. Every thread in a public payload
//     is public, by construction of the read that produced it, so there is
//     nothing to say — and a key that could say `private` in a public shape
//     is a key somebody would one day fill.
//   * A private thread travels in `PrivateThread`, from the signed-in routes
//     in `TALK_API`, and those answer 404 to anybody who may not read it:
//     the same answer as an id that was never issued.
//   * Visibility is chosen once, when the thread starts. There is no request
//     shape that changes it.

import type { PublicPost, PublicThread } from "./discussions.js";

export const THREAD_KINDS = ["question", "issue", "suggestion"] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

export const THREAD_KIND_LABELS: Record<ThreadKind, string> = {
  question: "Question",
  issue: "Issue",
  suggestion: "Suggestion",
};

export function isThreadKind(value: unknown): value is ThreadKind {
  return typeof value === "string" && (THREAD_KINDS as readonly string[]).includes(value);
}

export const THREAD_VISIBILITIES = ["public", "private"] as const;
export type ThreadVisibility = (typeof THREAD_VISIBILITIES)[number];

export const THREAD_VISIBILITY_LABELS: Record<ThreadVisibility, string> = {
  public: "Public",
  private: "Private",
};

export function isThreadVisibility(value: unknown): value is ThreadVisibility {
  return typeof value === "string" && (THREAD_VISIBILITIES as readonly string[]).includes(value);
}

/**
 * The forum category a Talk thread is filed under.
 *
 * A thread still has one of CB-3's six tags (the forum index filters by
 * them); a thread started from Talk is given the nearest one rather than
 * asked for it. Where a thread has a kind, pages show the kind.
 */
export const THREAD_KIND_TAG = {
  question: "question",
  issue: "question",
  suggestion: "proposal",
} as const satisfies Record<ThreadKind, string>;

// ---------------------------------------------------------------------------
// Copy (boards `Product` Talk tab, `ProductIdea`, and their phone boards)
// ---------------------------------------------------------------------------

export const TALK_COMPOSER_LABEL = "Start a thread";
export const TALK_KIND_GROUP_LABEL = "Kind of thread";
export const TALK_VISIBILITY_GROUP_LABEL = "Who can see it";
export const TALK_FILTER_GROUP_LABEL = "Show threads";
export const TALK_POST_PUBLIC = "Post publicly";
export const TALK_POST_PRIVATE = "Send to the crew";
export const TALK_EMPTY = "No threads";
export const TALK_BADGE_PUBLIC = "Public";
export const TALK_BADGE_PRIVATE = "Private · crew only";
export const TALK_RESOLVED = "Resolved";
export const TALK_MARK_RESOLVED = "Mark resolved";
export const TALK_REPLY = "Reply";
export const TALK_REPLY_PRIVATE = "Reply privately";
export const TALK_ANSWER = "Answer";
export const TALK_CREW_TAG = "Crew";

export const TALK_FILTERS = ["all", "public", "private"] as const;
export type TalkFilter = (typeof TALK_FILTERS)[number];
export const TALK_FILTER_LABELS: Record<TalkFilter, string> = {
  all: "All",
  public: "Public",
  private: "Private",
};

/** "Reply", "1 reply", "4 replies" — the row's one action. A crew member
 *  looking at a thread nobody has answered is offered "Answer". */
export function talkRepliesLabel(replies: number, crew = false): string {
  if (replies <= 0) return crew ? TALK_ANSWER : TALK_REPLY;
  return replies === 1 ? "1 reply" : `${replies} replies`;
}

// ---------------------------------------------------------------------------
// The private wire shapes
// ---------------------------------------------------------------------------

/** A private thread, as its author or the crew reads it. */
export interface PrivateThread extends PublicThread {
  visibility: "private";
  /** The reader wrote it. */
  mine: boolean;
  /** The last word is not the crew's. Drives the crew's "Needs you". */
  awaitingCrew: boolean;
}

export const PRIVATE_THREAD_KEYS = [
  "authorHandle",
  "authorName",
  "awaitingCrew",
  "createdAt",
  "id",
  "kind",
  "lastPostAt",
  "mine",
  "postCount",
  "resolvedAt",
  "state",
  "tag",
  "title",
  "visibility",
] as const;

/** GET `TALK_API.privateThreads(slug)`. */
export interface PrivateThreadList {
  /** The reader is on this product's crew: they see every private thread on
   *  it. Otherwise the list is the reader's own. */
  crew: boolean;
  threads: PrivateThread[];
}

/** GET `TALK_API.privateThread(id)`. */
export interface PrivateThreadDocument {
  /** The product it is on. */
  slug: string;
  crew: boolean;
  thread: PrivateThread;
  posts: PublicPost[];
}

/** POST `TALK_API.start()`. `tag` and `body` are CB1's and stay optional
 *  when a `kind` is given: Talk's one field is the title. */
export interface StartThreadRequest {
  slug: string;
  title: string;
  kind: ThreadKind;
  visibility: ThreadVisibility;
  body?: string;
}

/** One row of the crew's "Needs you": somebody started a private thread and
 *  the crew has not had the last word. No title — the board's row has none. */
export interface CrewPrivateThreadNotice {
  id: string;
  authorHandle: string | null;
  authorName: string | null;
  createdAt: string;
}

export const CREW_PRIVATE_THREAD_NOTICE_KEYS = ["authorHandle", "authorName", "createdAt", "id"] as const;

export const TALK_API = {
  /** POST `StartThreadRequest` → `{threadId, visibility}`. CB1's route. */
  start: (): string => "/v1/openproduct/threads",
  /** GET — the private threads on a product the reader may see. */
  privateThreads: (slug: string): string =>
    `/v1/openproduct/threads/private?slug=${encodeURIComponent(slug)}`,
  /** GET — one private thread with its posts. 404 for anybody else. */
  privateThread: (threadId: string): string => `/v1/openproduct/threads/private/${threadId}`,
  /** POST `{body}` — reply in a private thread. 404 for anybody else. */
  privateReply: (threadId: string): string => `/v1/openproduct/threads/private/${threadId}/posts`,
  /** PUT marks an issue resolved, DELETE reopens it. Crew only (404). */
  resolved: (threadId: string): string => `/v1/openproduct/threads/${threadId}/resolved`,
} as const;

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/**
 * A private thread's page. ONE SHELL FOR EVERY ID: the document is the same
 * bytes whatever the id and whoever asks, and the thread arrives from a
 * signed-in read after load — or the site's not-found does.
 */
export function privateThreadPath(threadId: string): string {
  return `/threads/private/${threadId}`;
}

/** A public thread's page (FO1). */
export function publicThreadPath(threadId: string): string {
  return `/threads/${threadId}`;
}

/** Where Talk is: a built product's tab; an idea's section of its page. */
export function talkPath(slug: string, stage: string | null | undefined): string {
  return stage === "idea" ? `/${slug}#talk` : `/${slug}/talk`;
}
