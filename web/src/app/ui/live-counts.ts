// The visitor's own acts, as numbers, kept until the caches catch up.
//
// THE PROBLEM THIS SOLVES. A vote posts, the box flips at once (`use-toggle`
// adds one to the number on the page), and then the visitor navigates: the
// next document is the CACHED one — sixty seconds at the API, sixty more in
// the page cache — so the count they just moved reads its old value again for
// up to two minutes, while the box still says "Upvoted". A number that goes
// backwards after you pressed it reads as the press not having worked.
//
// So every act's delta is remembered HERE, per key, with the moment it was
// made, and every control that shows that number adds the remembered delta to
// whatever the document said — until the delta is old enough that every cache
// has certainly turned over, at which point it is dropped and the document's
// own number (which now includes the act) is shown alone. The same shape
// `live-posts.ts` uses to keep a just-posted comment on the page.
//
// Deltas cancel: a vote then an unvote sums to nothing and the entry goes.
// `localStorage`, because the act should survive a reload and a new tab; it
// is this browser's own memory of what this browser did, never shared, and a
// page renders correctly without it.

export const LIVE_COUNTS_STORAGE_KEY = "op.live-counts";

/** Long enough for the API's 60s and the page cache's 60s to both turn over,
 *  with room for the edge; short enough that a stale entry cannot double-count
 *  for long if a cache did revalidate early. */
export const LIVE_COUNT_TTL_MS = 3 * 60 * 1000;

interface Entry {
  readonly delta: number;
  readonly at: number;
}

type Counts = Readonly<Record<string, Entry>>;
type Listener = () => void;

const EMPTY: Counts = Object.freeze({});
let counts: Counts = EMPTY;
let loaded = false;
const listeners = new Set<Listener>();

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let storage: () => StorageLike | null = () => {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
};
let now: () => number = () => Date.now();

/** A key for a count: `endorse:kettleworks`, `follow:topic:dev-tools`, `post:abc`. */
export function liveCountKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export function liveCounts(): Counts {
  return counts;
}

export function emptyLiveCounts(): Counts {
  return EMPTY;
}

/** The remembered delta for one key, or 0 — expired entries count for nothing. */
export function liveCountDelta(state: Counts, key: string): number {
  const entry = state[key];
  if (!entry || now() - entry.at >= LIVE_COUNT_TTL_MS) return 0;
  return entry.delta;
}

export function subscribeLiveCounts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.delta === "number" &&
    Number.isFinite(e.delta) &&
    typeof e.at === "number" &&
    Number.isFinite(e.at)
  );
}

function fresh(state: Counts): Counts {
  const next: Record<string, Entry> = {};
  for (const [key, entry] of Object.entries(state)) {
    if (entry.delta !== 0 && now() - entry.at < LIVE_COUNT_TTL_MS) next[key] = entry;
  }
  return next;
}

function persist(): void {
  const store = storage();
  if (!store) return;
  try {
    if (Object.keys(counts).length === 0) store.removeItem(LIVE_COUNTS_STORAGE_KEY);
    else store.setItem(LIVE_COUNTS_STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // Storage refused (private mode, quota): the act still shows for this
    // page's life through the in-memory copy.
  }
}

function publish(next: Counts): void {
  counts = next;
  persist();
  for (const listener of listeners) listener();
}

/** Read what this browser remembered, once, before the first render needs it. */
export function loadLiveCounts(): void {
  if (loaded) return;
  loaded = true;
  const store = storage();
  if (!store) return;
  let parsed: unknown;
  try {
    const raw = store.getItem(LIVE_COUNTS_STORAGE_KEY);
    if (!raw) return;
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return;
  const restored: Record<string, Entry> = {};
  for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (isEntry(entry)) restored[key] = entry;
  }
  const merged = fresh({ ...restored, ...counts });
  if (Object.keys(merged).length === 0 && Object.keys(counts).length === 0) return;
  publish(merged);
}

/**
 * Move a count by `step`, remembering the moment. A step that cancels an
 * earlier one removes the entry, so a vote undone leaves no trace.
 */
export function bumpLiveCount(key: string, step: number): void {
  const current = liveCountDelta(counts, key);
  const delta = current + step;
  const next: Record<string, Entry> = { ...fresh(counts) };
  if (delta === 0) delete next[key];
  else next[key] = { delta, at: now() };
  publish(next);
}

export function __resetLiveCountsForTests(overrides?: {
  storage?: () => StorageLike | null;
  now?: () => number;
}): void {
  counts = EMPTY;
  loaded = false;
  listeners.clear();
  storage =
    overrides?.storage ??
    (() => {
      try {
        return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
      } catch {
        return null;
      }
    });
  now = overrides?.now ?? (() => Date.now());
}
