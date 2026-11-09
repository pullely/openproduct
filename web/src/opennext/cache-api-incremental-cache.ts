// The shared incremental cache (openproduct-performance OPP13).
//
// ─── WHAT WAS HAPPENING ───────────────────────────────────────────────────
//
// `open-next.config.ts` shipped with the "dummy" incremental cache, which
// caches nothing: every `get` throws an ignorable error and every `set` is
// dropped. So `revalidate = 60` on the public pages described a behaviour no
// layer implemented. A Workers-Cache miss on the apex — once per data centre
// per minute per route AND per RSC variant — was a full Next render with real
// upstream reads, measured in production on 2026-09-09 at 1.7–2.5 s to first
// byte against 0.2–0.65 s for a hit. `/docs`, which reads nothing, cost 1.1 s
// on a miss. That is the "two seconds per click".
//
// And Cloudflare does not serve stale while it revalidates: every page asked
// for after its sixty seconds came back `cf-cache-status: REVALIDATED` with a
// 2–3 s first byte. The `stale-while-revalidate=240` the pages emit is honoured
// by nothing between the browser and this worker.
//
// ─── WHAT THIS IS ─────────────────────────────────────────────────────────
//
// An OpenNext `IncrementalCache` over the Workers Cache API (`caches.open`),
// which is shared by every isolate in a data centre and needs NO BINDING —
// the property D8 (risks-and-open-questions.md) was waiting for, and the
// fact-finding D6 asked for: the Cache API works on a Workers Custom Domain.
//
// With it, ISR does what ISR was always meant to do here: a page older than
// its `revalidate` is served from this cache immediately and re-rendered in
// the background (`in-process-queue.ts`), so the visitor who lands on a stale
// document pays a cache read rather than a render. Next's `fetch` data cache
// (`next: { revalidate }` in `public-api.ts`) lands here too, so the catalogue
// read the front page and the sidebar both make is one upstream read per
// data centre per minute rather than one per request.
//
// ─── WHAT IT REFUSES TO STORE, AND WHY ────────────────────────────────────
//
// Only a 2xx document. OpenNext's cache interception serves a stored page
// with `statusCode: 200` no matter what status the render produced, so a
// stored `notFound()` — the thing R11 (`not-found-status.test.ts`) exists to
// keep at 404 — would come back as `200 OK` to the next visitor and to every
// crawler. A tombstoned listing's 410 and a `permanentRedirect()`'s 308 have
// the same problem. None of them is cached; each is rendered again, which
// costs exactly what it costs today and can never be wrong.
//
// ─── HOW LONG AN ENTRY LIVES ──────────────────────────────────────────────
//
// `revalidate + STALE_GRACE_SECONDS`. The grace is what lets a stale entry be
// served while its replacement renders; it is also the ceiling on how old a
// document can get if revalidation keeps failing (a broken core deploy, say):
// five minutes past the sixty OD-H promises, after which the entry is gone
// and the next visitor pays a render. The Cache API may evict sooner; nothing
// here depends on an entry surviving.
//
// ─── WHAT IT IS NOT ───────────────────────────────────────────────────────
//
// Cross-region. An entry written in one data centre is invisible in the
// others; each warms itself. That is the same shape as Workers Caching in
// front of this worker, and it is why this file exists rather than an R2
// bucket: the per-region cost is exactly the cost this milestone measured.
//
// Pure by construction — the Cache API, the clock and the build id are
// injected — so `incremental-cache.test.ts` can exercise every branch against
// a fake without OpenNext's runtime.

export type CacheType = "cache" | "fetch" | "composable";

/** The slice of the Cache API this module touches. */
export interface CacheLike {
  match(url: string): Promise<Response | undefined | null>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}

export interface CacheApiDeps {
  /** `caches.open(...)`, or `null` where the Cache API is absent (jest, a
   *  dry-run) — every operation then degrades to "nothing cached". */
  open(): Promise<CacheLike | null>;
  now(): number;
  buildId(): string;
}

export interface CachedEntry<T = unknown> {
  value: T;
  lastModified: number;
}

export interface IncrementalCacheLike {
  name: string;
  get<T = unknown>(key: string, cacheType?: CacheType): Promise<CachedEntry<T> | null>;
  set(key: string, value: unknown, cacheType?: CacheType): Promise<void>;
  delete(key: string): Promise<void>;
}

export const CACHE_API_NAME = "openproduct-incremental-cache";
export const NAME = "openproduct-cache-api-incremental-cache";

/** How long past its `revalidate` an entry may still be served (see above). */
export const STALE_GRACE_SECONDS = 300;

/** An entry that declares no `revalidate` (a fully static document) is kept
 *  this long. There are none on the public surface today; the number bounds
 *  the case rather than serving one. */
export const DEFAULT_REVALIDATE_SECONDS = 3600;

const ORIGIN = "https://incremental-cache.openproduct.internal";

/**
 * The Cache API keys by URL, so the key is written as one: the build id keeps
 * a new deploy from reading the previous build's documents, and the cache
 * type keeps a page and a `fetch` entry that happen to share a key apart.
 * `encodeURIComponent` makes any OpenNext key — a path with slashes, a hash —
 * a single safe segment.
 */
export function cacheUrl(key: string, cacheType: CacheType, buildId: string): string {
  return `${ORIGIN}/${encodeURIComponent(buildId)}/${encodeURIComponent(key)}.${cacheType}`;
}

/**
 * Whether a value may be stored at all — the 2xx rule argued above.
 *
 * Only page-shaped entries carry a status; a `fetch` entry is Next's own data
 * cache and is stored as Next hands it over.
 */
export function storable(value: unknown, cacheType: CacheType): boolean {
  if (cacheType !== "cache") return true;
  if (!value || typeof value !== "object") return false;
  const status = (value as { meta?: { status?: unknown } }).meta?.status;
  if (status === undefined || status === null) return true;
  return typeof status === "number" && status >= 200 && status < 300;
}

/** The Cache API TTL for an entry: its `revalidate` plus the grace. */
export function ttlSecondsFor(value: unknown): number {
  const raw = (value as { revalidate?: unknown } | null)?.revalidate;
  const revalidate =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0
      ? Math.round(raw)
      : DEFAULT_REVALIDATE_SECONDS;
  return revalidate + STALE_GRACE_SECONDS;
}

function isEntry(parsed: unknown): parsed is CachedEntry {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    "value" in parsed &&
    typeof (parsed as { lastModified?: unknown }).lastModified === "number"
  );
}

export function createCacheApiIncrementalCache(deps: CacheApiDeps): IncrementalCacheLike {
  const urlFor = (key: string, cacheType: CacheType) => cacheUrl(key, cacheType, deps.buildId());

  return {
    name: NAME,

    async get<T = unknown>(key: string, cacheType: CacheType = "cache"): Promise<CachedEntry<T> | null> {
      try {
        const cache = await deps.open();
        if (!cache) return null;
        const hit = await cache.match(urlFor(key, cacheType));
        if (!hit) return null;
        const parsed: unknown = await hit.json();
        return isEntry(parsed) ? (parsed as CachedEntry<T>) : null;
      } catch {
        // A cache that cannot be read is a cache that is empty. Never a 500.
        return null;
      }
    },

    async set(key: string, value: unknown, cacheType: CacheType = "cache"): Promise<void> {
      if (!storable(value, cacheType)) return;
      try {
        const cache = await deps.open();
        if (!cache) return;
        const entry: CachedEntry = { value, lastModified: deps.now() };
        await cache.put(
          urlFor(key, cacheType),
          new Response(JSON.stringify(entry), {
            headers: {
              "content-type": "application/json",
              "cache-control": `max-age=${ttlSecondsFor(value)}`,
            },
          }),
        );
      } catch {
        // A write that fails costs the next visitor a render, which is what
        // they would have paid anyway.
      }
    },

    async delete(key: string): Promise<void> {
      try {
        const cache = await deps.open();
        if (!cache) return;
        await Promise.all(
          (["cache", "fetch", "composable"] as const).map((cacheType) =>
            cache.delete(urlFor(key, cacheType)),
          ),
        );
      } catch {
        // Nothing to do: an entry that cannot be deleted expires on its own.
      }
    },
  };
}

/** `caches.open` where it exists, `null` where it does not. */
export async function openWorkersCache(): Promise<CacheLike | null> {
  const store = (globalThis as { caches?: { open?: (name: string) => Promise<CacheLike> } }).caches;
  if (!store || typeof store.open !== "function") return null;
  return store.open(CACHE_API_NAME);
}
