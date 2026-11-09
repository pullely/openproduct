// The shared incremental cache and the background re-render (openproduct-
// performance OPP13), driven against fakes.
//
// Both modules are pure by construction — the Cache API, the clock, the build
// id, the worker and the request context are injected — so this lane can
// exercise every branch that matters without OpenNext's runtime:
//
//   - a document is stored and read back, keyed by build id and cache type;
//   - a NON-2xx document is never stored, because cache interception serves
//     a stored document as `200` whatever the render said (R11's 404s);
//   - an entry lives `revalidate + grace`, so a re-render that keeps failing
//     cannot serve a document past that ceiling;
//   - where the Cache API is absent, nothing is cached and nothing throws;
//   - a revalidation is scheduled with `waitUntil` and NOT awaited — the
//     stale response leaves first — and is de-duplicated while in flight.

import {
  CACHE_API_NAME,
  DEFAULT_REVALIDATE_SECONDS,
  STALE_GRACE_SECONDS,
  cacheUrl,
  createCacheApiIncrementalCache,
  openWorkersCache,
  storable,
  ttlSecondsFor,
  type CacheLike,
} from "@openproduct-web/opennext/cache-api-incremental-cache";
import {
  DEFAULT_REVALIDATION_TIMEOUT_MS,
  createInProcessQueue,
  registerSelfFetch,
  registeredSelfFetch,
  revalidationRequest,
  type RevalidationMessage,
} from "@openproduct-web/opennext/in-process-queue";

/** A Cache API that remembers what it was handed, headers included. */
function fakeCache(): CacheLike & { store: Map<string, { body: string; headers: Headers }> } {
  const store = new Map<string, { body: string; headers: Headers }>();
  return {
    store,
    async match(url) {
      const hit = store.get(url);
      return hit ? new Response(hit.body, { headers: hit.headers }) : undefined;
    },
    async put(url, response) {
      store.set(url, { body: await response.text(), headers: new Headers(response.headers) });
    },
    async delete(url) {
      return store.delete(url);
    },
  };
}

function cacheWith(cache: CacheLike | null, now = 1_000_000, buildId = "build-1") {
  return createCacheApiIncrementalCache({
    open: async () => cache,
    now: () => now,
    buildId: () => buildId,
  });
}

const page = (status?: number, revalidate: number | false = 60) => ({
  type: "app",
  html: "<html/>",
  rsc: "0:[]",
  meta: status === undefined ? { headers: {} } : { status, headers: {} },
  revalidate,
});

describe("the cache key", () => {
  it("is one URL per build, key and cache type", () => {
    expect(cacheUrl("/leaderboard", "cache", "b1")).toBe(
      "https://incremental-cache.openproduct.internal/b1/%2Fleaderboard.cache",
    );
    expect(cacheUrl("/leaderboard", "fetch", "b1")).not.toBe(cacheUrl("/leaderboard", "cache", "b1"));
    expect(cacheUrl("/leaderboard", "cache", "b2")).not.toBe(cacheUrl("/leaderboard", "cache", "b1"));
    // Any OpenNext key is one safe segment, whatever it contains.
    expect(cacheUrl("a/b?c=d#e", "cache", "b1")).toContain("/a%2Fb%3Fc%3Dd%23e.cache");
  });
});

describe("what may be stored", () => {
  it("stores a 2xx document and one that carries no status", () => {
    expect(storable(page(200), "cache")).toBe(true);
    expect(storable(page(), "cache")).toBe(true);
  });

  it("refuses a 404, a 410 and a 308 — interception would serve them as 200", () => {
    for (const status of [404, 410, 308, 500]) {
      expect([status, storable(page(status), "cache")]).toEqual([status, false]);
    }
  });

  it("stores every fetch entry: that is Next's own data cache", () => {
    expect(storable({ kind: "FETCH", data: { status: 404 } }, "fetch")).toBe(true);
  });

  it("stores nothing that is not an object", () => {
    expect(storable(null, "cache")).toBe(false);
    expect(storable("html", "cache")).toBe(false);
  });
});

describe("how long an entry lives", () => {
  it("is the document's revalidate plus the grace", () => {
    expect(ttlSecondsFor(page(200, 60))).toBe(60 + STALE_GRACE_SECONDS);
    expect(ttlSecondsFor(page(200, 3600))).toBe(3600 + STALE_GRACE_SECONDS);
  });

  it("bounds a document that declares none", () => {
    expect(ttlSecondsFor(page(200, false))).toBe(DEFAULT_REVALIDATE_SECONDS + STALE_GRACE_SECONDS);
    expect(ttlSecondsFor({})).toBe(DEFAULT_REVALIDATE_SECONDS + STALE_GRACE_SECONDS);
  });

  it("keeps the grace within OD-H's spirit: minutes, not hours", () => {
    expect(STALE_GRACE_SECONDS).toBeGreaterThanOrEqual(60);
    expect(STALE_GRACE_SECONDS).toBeLessThanOrEqual(600);
  });
});

describe("the incremental cache", () => {
  it("round-trips a document with the time it was written", async () => {
    const store = fakeCache();
    const cache = cacheWith(store, 1_700_000_000_000);
    await cache.set("/leaderboard", page(200), "cache");
    const hit = await cache.get("/leaderboard", "cache");
    expect(hit).toEqual({ value: page(200), lastModified: 1_700_000_000_000 });
    const stored = store.store.get(cacheUrl("/leaderboard", "cache", "build-1"));
    expect(stored?.headers.get("cache-control")).toBe(`max-age=${60 + STALE_GRACE_SECONDS}`);
    expect(stored?.headers.get("content-type")).toBe("application/json");
  });

  it("defaults the cache type to a page, on both sides", async () => {
    const cache = cacheWith(fakeCache());
    await cache.set("/x", page(200));
    expect((await cache.get("/x"))?.value).toEqual(page(200));
    expect(await cache.get("/x", "fetch")).toBeNull();
  });

  it("never stores a non-2xx document, and reads nothing back for it", async () => {
    const store = fakeCache();
    const cache = cacheWith(store);
    await cache.set("/missing", page(404), "cache");
    expect(store.store.size).toBe(0);
    expect(await cache.get("/missing", "cache")).toBeNull();
  });

  it("keeps builds apart", async () => {
    const store = fakeCache();
    await cacheWith(store, 1, "build-1").set("/x", page(200));
    expect(await cacheWith(store, 1, "build-2").get("/x")).toBeNull();
  });

  it("deletes every type under a key", async () => {
    const store = fakeCache();
    const cache = cacheWith(store);
    await cache.set("/x", page(200), "cache");
    await cache.set("/x", { kind: "FETCH", data: {}, revalidate: 60 }, "fetch");
    expect(store.store.size).toBe(2);
    await cache.delete("/x");
    expect(store.store.size).toBe(0);
  });

  it("reads a corrupt entry as a miss", async () => {
    const store = fakeCache();
    store.store.set(cacheUrl("/x", "cache", "build-1"), { body: "not json", headers: new Headers() });
    expect(await cacheWith(store).get("/x")).toBeNull();
    store.store.set(cacheUrl("/y", "cache", "build-1"), { body: '{"nope":1}', headers: new Headers() });
    expect(await cacheWith(store).get("/y")).toBeNull();
  });

  it("is an empty cache where the Cache API is absent, and throws nothing", async () => {
    const cache = cacheWith(null);
    await expect(cache.set("/x", page(200))).resolves.toBeUndefined();
    await expect(cache.get("/x")).resolves.toBeNull();
    await expect(cache.delete("/x")).resolves.toBeUndefined();
  });

  it("survives a Cache API that throws", async () => {
    const broken: CacheLike = {
      match: async () => {
        throw new Error("boom");
      },
      put: async () => {
        throw new Error("boom");
      },
      delete: async () => {
        throw new Error("boom");
      },
    };
    const cache = cacheWith(broken);
    await expect(cache.set("/x", page(200))).resolves.toBeUndefined();
    await expect(cache.get("/x")).resolves.toBeNull();
    await expect(cache.delete("/x")).resolves.toBeUndefined();
  });

  it("opens the Workers cache by name where `caches` exists, and not otherwise", async () => {
    const g = globalThis as { caches?: unknown };
    const before = g.caches;
    try {
      delete g.caches;
      expect(await openWorkersCache()).toBeNull();
      const opened: string[] = [];
      g.caches = { open: async (name: string) => (opened.push(name), fakeCache()) };
      expect(await openWorkersCache()).not.toBeNull();
      expect(opened).toEqual([CACHE_API_NAME]);
    } finally {
      if (before === undefined) delete g.caches;
      else g.caches = before;
    }
  });
});

describe("the background re-render", () => {
  const message: RevalidationMessage = {
    MessageBody: { host: "openproduct.live", url: "/leaderboard", eTag: "e", lastModified: 1 },
    MessageDeduplicationId: "dedup-1",
    MessageGroupId: "group",
  };

  it("sends the request OpenNext's own queues send", () => {
    const request = revalidationRequest(message, "preview-id");
    expect(request.method).toBe("HEAD");
    expect(request.url).toBe("https://openproduct.live/leaderboard");
    expect(request.headers.get("x-prerender-revalidate")).toBe("preview-id");
    expect(request.headers.get("x-isr")).toBe("1");
    expect(revalidationRequest({ ...message, MessageBody: { ...message.MessageBody, host: "localhost:3002" } }, "p").url).toBe(
      "http://localhost:3002/leaderboard",
    );
  });

  it("schedules the render with waitUntil and returns before it finishes", async () => {
    const scheduled: Promise<unknown>[] = [];
    const calls: Request[] = [];
    let release!: (r: Response) => void;
    const queue = createInProcessQueue({
      self: () => async (request) => {
        calls.push(request);
        return new Promise<Response>((r) => {
          release = r;
        });
      },
      context: () => ({ env: {}, ctx: { waitUntil: (p) => scheduled.push(p) } }),
      previewModeId: () => "preview-id",
    });
    await queue.send(message);
    // Returned, with the render still in flight.
    expect(scheduled).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("x-prerender-revalidate")).toBe("preview-id");
    release(new Response(null, { status: 200 }));
    await scheduled[0];
  });

  it("de-duplicates a render that is already in flight, and forgets it after", async () => {
    const scheduled: Promise<unknown>[] = [];
    let calls = 0;
    let release!: (r: Response) => void;
    const queue = createInProcessQueue({
      self: () => async () => {
        calls++;
        return new Promise<Response>((r) => {
          release = r;
        });
      },
      context: () => ({ env: {}, ctx: { waitUntil: (p) => scheduled.push(p) } }),
      previewModeId: () => "p",
    });
    await queue.send(message);
    await queue.send(message);
    expect(calls).toBe(1);
    release(new Response(null, { status: 200 }));
    await Promise.all(scheduled);
    await queue.send(message);
    expect(calls).toBe(2);
    // Let the second render finish too, or its timeout keeps the process up.
    release(new Response(null, { status: 200 }));
    await Promise.all(scheduled);
  });

  it("does nothing, quietly, where no worker is registered", async () => {
    const logged: string[] = [];
    const queue = createInProcessQueue({
      self: () => null,
      context: () => ({ env: {}, ctx: { waitUntil: () => {} } }),
      previewModeId: () => "p",
      log: (m) => logged.push(m),
    });
    await expect(queue.send(message)).resolves.toBeUndefined();
    expect(logged).toHaveLength(1);
  });

  it("does nothing outside a request context", async () => {
    let called = false;
    const queue = createInProcessQueue({
      self: () => async () => ((called = true), new Response(null)),
      context: () => null,
      previewModeId: () => "p",
    });
    await queue.send(message);
    expect(called).toBe(false);
  });

  it("logs a failed render and releases the de-duplication key", async () => {
    const scheduled: Promise<unknown>[] = [];
    const logged: string[] = [];
    let attempts = 0;
    const queue = createInProcessQueue({
      self: () => async () => {
        attempts++;
        throw new Error("render exploded");
      },
      context: () => ({ env: {}, ctx: { waitUntil: (p) => scheduled.push(p) } }),
      previewModeId: () => "p",
      log: (m) => logged.push(m),
    });
    await queue.send(message);
    await Promise.all(scheduled);
    expect(logged.join("\n")).toContain("render exploded");
    await queue.send(message);
    expect(attempts).toBe(2);
  });

  it("abandons a render that outlives the timeout", async () => {
    const scheduled: Promise<unknown>[] = [];
    const logged: string[] = [];
    const queue = createInProcessQueue({
      self: () => () => new Promise<Response>(() => {}),
      context: () => ({ env: {}, ctx: { waitUntil: (p) => scheduled.push(p) } }),
      previewModeId: () => "p",
      timeoutMs: 5,
      log: (m) => logged.push(m),
    });
    await queue.send(message);
    await Promise.all(scheduled);
    expect(logged.join("\n")).toContain("timed out");
    expect(DEFAULT_REVALIDATION_TIMEOUT_MS).toBe(10_000);
  });

  it("finds the worker `worker.ts` registered on the global scope", () => {
    const fetchImpl = async () => new Response(null);
    registerSelfFetch(fetchImpl);
    expect(registeredSelfFetch()).toBe(fetchImpl);
  });
});
