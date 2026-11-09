// The posts this browser made, before the document has them
// (openproduct-performance OPP14).
//
// ─── THE DEFECT ───────────────────────────────────────────────────────────
//
// Pressing Post on a comment was a form POST, a 303, and a full reload of a
// document that is CACHED — at the edge for sixty seconds, in the ISR store
// behind it, and at the gateway in front of core. The reload took a second
// or two, and the comment was not in it. From where the writer stood, the
// button had eaten their words, and the only way to find out otherwise was
// to wait a minute and reload again.
//
// ─── WHAT THIS IS ─────────────────────────────────────────────────────────
//
// A store of the posts THIS visitor made in THIS browser: written the moment
// they press Post (optimistic), settled with the server's id when the write
// answers, and kept until the document itself carries that id — however
// many caches stand between the write and the page. That last part is the
// one the caches cannot do on the writer's behalf: a public document is one
// document for everybody (OPC-1, I6), so the writer's own words reach it on
// the same schedule as everyone else's, and the gap is bridged here, in the
// one place that knows what they wrote.
//
// Persisted in `localStorage` with a short TTL, so a reload or a hop away
// and back inside the cache window still shows the post — and only the
// SETTLED ones, with their server ids, because a pending post that never
// answered is not something to resurrect after a reload. Every entry here is
// PUBLIC CONTENT the visitor authored themselves; there is nothing private
// to keep out of storage.
//
// Pure by construction — the storage and the clock are injected — so
// `live-posts.test.ts` drives every transition without a browser.

export type LivePostStatus = "pending" | "posted" | "failed";

export interface LivePost {
  /** This browser's own key; the server id arrives later. */
  readonly clientId: string;
  /** The server's id once the write answered; `null` while pending or failed. */
  readonly id: string | null;
  /** `listing:<slug>` for a comment section, `thread:<id>` for a thread. */
  readonly conversation: string;
  readonly parentPostId: string | null;
  /** As typed — rendered through the same subset the server uses. */
  readonly body: string;
  readonly authorName: string | null;
  readonly authorHandle: string | null;
  readonly createdAt: string;
  readonly status: LivePostStatus;
  readonly error: string | null;
}

export type ConversationKind = "listing" | "thread";

export function conversationKey(kind: ConversationKind, id: string): string {
  return `${kind}:${id}`;
}

export const LIVE_POSTS_STORAGE_KEY = "op.live-posts";

/**
 * How long a settled post is kept after it was made. Long enough to outlast
 * every cache between the write and the page (60 s at the edge, 60 s in
 * the store, 60 s at the gateway, plus a render), short enough that a post
 * removed by moderation does not haunt its author's browser for an evening.
 */
export const LIVE_POST_TTL_MS = 10 * 60 * 1000;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Listener = () => void;

const EMPTY: readonly LivePost[] = Object.freeze([]);

let posts: readonly LivePost[] = EMPTY;
let loaded = false;
let counter = 0;
const listeners = new Set<Listener>();

let storage: () => StorageLike | null = () => {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
};
let now: () => number = () => Date.now();

export function livePosts(): readonly LivePost[] {
  return posts;
}

/** The server snapshot: the document carries nobody's pending words (I6). */
export function emptyLivePosts(): readonly LivePost[] {
  return EMPTY;
}

export function livePostsFor(conversation: string): LivePost[] {
  return posts.filter((post) => post.conversation === conversation);
}

export function subscribeLivePosts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isLivePost(value: unknown): value is LivePost {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.clientId === "string" &&
    (typeof p.id === "string" || p.id === null) &&
    typeof p.conversation === "string" &&
    (typeof p.parentPostId === "string" || p.parentPostId === null) &&
    typeof p.body === "string" &&
    (typeof p.authorName === "string" || p.authorName === null) &&
    (typeof p.authorHandle === "string" || p.authorHandle === null) &&
    typeof p.createdAt === "string" &&
    !Number.isNaN(Date.parse(p.createdAt)) &&
    (p.status === "pending" || p.status === "posted" || p.status === "failed") &&
    (typeof p.error === "string" || p.error === null)
  );
}

function expired(post: LivePost): boolean {
  return now() - Date.parse(post.createdAt) >= LIVE_POST_TTL_MS;
}

function persist(): void {
  const store = storage();
  if (!store) return;
  const keep = posts.filter((post) => post.status === "posted" && post.id !== null);
  try {
    if (keep.length === 0) store.removeItem(LIVE_POSTS_STORAGE_KEY);
    else store.setItem(LIVE_POSTS_STORAGE_KEY, JSON.stringify(keep));
  } catch {
    // Storage that refuses is storage that forgets; the page still works.
  }
}

function publish(next: readonly LivePost[]): void {
  posts = next;
  persist();
  for (const listener of listeners) listener();
}

/**
 * Bring back what an earlier document in this browser settled, once per
 * page load. Never during render: the first paint is the server's document,
 * and this lands after it.
 */
export function loadLivePosts(): void {
  if (loaded) return;
  loaded = true;
  const store = storage();
  if (!store) return;
  let parsed: unknown;
  try {
    const raw = store.getItem(LIVE_POSTS_STORAGE_KEY);
    if (!raw) return;
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  const known = new Set(posts.map((post) => post.clientId));
  const restored = parsed.filter(
    (entry): entry is LivePost =>
      isLivePost(entry) && entry.status === "posted" && !expired(entry) && !known.has(entry.clientId),
  );
  if (restored.length === 0) return;
  publish([...restored, ...posts]);
}

export interface NewLivePost {
  conversation: string;
  parentPostId: string | null;
  body: string;
  authorName: string | null;
  authorHandle: string | null;
}

/**
 * The moment they press Post. A failed post in the same conversation is
 * dropped: the words it held are the words being posted again.
 */
export function addLivePost(input: NewLivePost): string {
  counter += 1;
  const clientId = `live-${now().toString(36)}-${counter}`;
  const post: LivePost = {
    clientId,
    id: null,
    conversation: input.conversation,
    parentPostId: input.parentPostId,
    body: input.body,
    authorName: input.authorName,
    authorHandle: input.authorHandle,
    createdAt: new Date(now()).toISOString(),
    status: "pending",
    error: null,
  };
  publish([
    ...posts.filter((p) => !(p.conversation === input.conversation && p.status === "failed")),
    post,
  ]);
  return clientId;
}

/** The write answered with an id: from now on the document can catch up. */
export function settleLivePost(clientId: string, id: string): void {
  publish(posts.map((p) => (p.clientId === clientId ? { ...p, id, status: "posted", error: null } : p)));
}

export function failLivePost(clientId: string, error: string): void {
  publish(posts.map((p) => (p.clientId === clientId ? { ...p, status: "failed", error } : p)));
}

export function dropLivePost(clientId: string): void {
  publish(posts.filter((p) => p.clientId !== clientId));
}

/**
 * The document arrived with these ids: whichever of ours it now carries is
 * its to render, and whichever has outlived the TTL is gone.
 */
export function reconcileLivePosts(conversation: string, renderedIds: readonly string[]): void {
  const rendered = new Set(renderedIds);
  const next = posts.filter(
    (p) => !(p.conversation === conversation && p.id !== null && rendered.has(p.id)) && !expired(p),
  );
  if (next.length !== posts.length) publish(next);
}

/** Test seam. */
export function resetLivePostsForTests(overrides?: {
  storage?: StorageLike | null;
  now?: () => number;
}): void {
  posts = EMPTY;
  loaded = false;
  counter = 0;
  listeners.clear();
  storage =
    overrides && "storage" in overrides
      ? () => overrides.storage ?? null
      : () => {
          try {
            return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
          } catch {
            return null;
          }
        };
  now = overrides?.now ?? (() => Date.now());
}
