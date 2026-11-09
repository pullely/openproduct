// The limit is honest and published (openproduct-consumers CS1).
//
// Four properties, in the order the milestone names them: a refusal is 429
// with Retry-After and names the bucket; the count lives in one object so
// two isolates share it; an object that cannot be asked fails open to the
// old limiter and says so once; and the gateway's numbers ARE the
// contract's, by identity, so the page and the limiter cannot drift.
//
// NO MINIFLARE HERE. This suite is jest, and the object is exercised
// in-process: `RateLimitBucket` is a plain class, and the namespace below
// keeps one instance per name the way the runtime does. What that proves is
// the limiter's half — the protocol, the shared count, the fallback. That
// the binding and the migration deploy is `wrangler deploy --dry-run`'s job
// on the component's verify lane, and the allowlist test pins the config.

import { route } from "@openproduct-gateway/router";
import type { Env } from "@openproduct-gateway/env";
import { LIMITS, RateLimitBucket, resetBuckets, takeToken } from "@openproduct-gateway/ratelimit";
import { resetSubjectCache } from "@openproduct-gateway/subject";
import { AUTH_RATE_LIMITS, RATE_LIMITS, retryAfterSeconds } from "@openproduct/contracts";

function core(): Fetcher {
  return {
    fetch: async () =>
      Response.json({ data: { projects: [] } }, { headers: { "cache-control": "public, max-age=60" } }),
  } as unknown as Fetcher;
}

type Namespace = DurableObjectNamespace & { readonly objects: Map<string, RateLimitBucket> };

/**
 * An in-memory namespace: one `RateLimitBucket` per id, like the runtime's
 * one object per name. `failing` is an object that cannot be asked.
 */
function namespace(failing = false): Namespace {
  const objects = new Map<string, RateLimitBucket>();
  const ns = {
    objects,
    idFromName: (name: string) => ({ toString: () => name, name, equals: () => false }),
    get: (id: { toString(): string }) => ({
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        if (failing) throw new Error("object unreachable");
        const key = id.toString();
        const object = objects.get(key) ?? new RateLimitBucket({} as DurableObjectState, {});
        objects.set(key, object);
        return object.fetch(new Request(input instanceof Request ? input.url : String(input), init));
      },
    }),
  };
  return ns as unknown as Namespace;
}

function envWith(rateLimit?: DurableObjectNamespace): Env {
  return {
    CORE: core(),
    ENVIRONMENT: "test",
    PLATFORM_API_URL: "https://platform.test",
    SITE_ORIGIN: "https://openproduct.live",
    ...(rateLimit ? { RATE_LIMIT: rateLimit } : {}),
  } as Env;
}

const read = (ip = "203.0.113.7") =>
  new Request("https://gw.test/v1/public/openproduct/projects", { headers: { "cf-connecting-ip": ip } });

const realWarn = console.warn;
const realNow = Date.now;

/**
 * Hold the clock still while a bucket is drained through the router. The
 * anon bucket refills a token every half second (120 a minute), and 120 trips
 * through `route()` take longer than that on a loaded machine: the suite then
 * saw a refilled token and answered 200 where it meant to prove 429. The
 * limiter reads `Date.now()`; freezing it is the same move `timing.test.ts`
 * makes, and the refill arithmetic has its own test with explicit instants.
 */
function freezeClock(ms = realNow()): void {
  Date.now = () => ms;
}

afterEach(() => {
  console.warn = realWarn;
  Date.now = realNow;
  resetBuckets();
  resetSubjectCache();
});

describe("1 — a refusal is 429 with Retry-After, and it names the bucket", () => {
  it("the anon bucket, driven to exhaustion through the router", async () => {
    freezeClock();
    const env = envWith();
    for (let i = 0; i < RATE_LIMITS.anon.limit; i += 1) {
      const res = await route(read(), env);
      expect([i, res.status]).toEqual([i, 200]);
    }
    const refused = await route(read(), env);
    expect(refused.status).toBe(429);
    const body = (await refused.json()) as {
      error: { code: string; message: string; details: Record<string, unknown> };
    };
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.message).toBe(
      "Too many requests: the public read allows 120 a minute per address. Retry-After says when the next one is yours.",
    );
    expect(body.error.details).toEqual({
      bucket: "anon",
      limit: 120,
      windowSec: 60,
      retryAfterSeconds: Number(refused.headers.get("retry-after")),
    });
    expect(refused.headers.get("retry-after")).toMatch(/^[1-9]\d*$/);
    // A refusal is about this caller and must never be cached for the next one.
    expect(refused.headers.get("cache-control")).toBe("no-store");
    // Another address is another bucket.
    expect((await route(read("198.51.100.9"), env)).status).toBe(200);
  });

  it("Retry-After is the refill's answer, to the second", async () => {
    // 10 an hour: a token every 360 s. Drained at t=0 and asked again at
    // t=0, the wait is the whole gap; asked at t=180 s, half of it.
    for (let i = 0; i < 10; i += 1) expect((await takeToken("authSignUp", "ip", undefined, 0)).ok).toBe(true);
    const atOnce = await takeToken("authSignUp", "ip", undefined, 0);
    expect(atOnce).toEqual({ ok: false, bucket: "authSignUp", limit: 10, windowSec: 3600, retryAfterSec: 360 });
    const later = await takeToken("authSignUp", "ip", undefined, 180_000);
    expect(later.ok === false && later.retryAfterSec).toBe(180);
    expect(later.ok === false && later.retryAfterSec).toBe(retryAfterSeconds(0.5, 10, 3600));
    // And at 360 s the token is there.
    expect((await takeToken("authSignUp", "ip", undefined, 360_000)).ok).toBe(true);
  });
});

describe("2 — the count is one object per key, shared by every isolate", () => {
  it("an isolate that has never seen this address is refused, because the object has", async () => {
    freezeClock();
    const shared = namespace();
    const first = envWith(shared);
    for (let i = 0; i < RATE_LIMITS.anon.limit; i += 1) {
      expect((await route(read(), first)).status).toBe(200);
    }
    // A cold isolate: no local buckets at all — only the object remembers.
    resetBuckets();
    const second = envWith(shared);
    const refused = await route(read(), second);
    expect(refused.status).toBe(429);
    expect(((await refused.json()) as { error: { details: { bucket: string } } }).error.details.bucket).toBe("anon");
    // Exactly one object was addressed, by the bucket's own name.
    expect([...shared.objects.keys()]).toEqual(["anon:203.0.113.7"]);
  });

  it("the object speaks the step: a bad body is 400, a good one is allowed/retryAfterSec", async () => {
    const object = new RateLimitBucket({} as DurableObjectState, {});
    const take = (body: string) =>
      object.fetch(new Request("https://rate-limit.internal/take", { method: "POST", body }));
    expect((await take("not json")).status).toBe(400);
    expect((await take(JSON.stringify({ limit: "two" }))).status).toBe(400);
    expect((await take(JSON.stringify({ limit: 0, windowSec: 60 }))).status).toBe(400);
    for (let i = 0; i < 2; i += 1) {
      expect(await (await take(JSON.stringify({ limit: 2, windowSec: 60 }))).json()).toEqual({ allowed: true, retryAfterSec: 0 });
    }
    const refused = (await (await take(JSON.stringify({ limit: 2, windowSec: 60 }))).json()) as { allowed: boolean; retryAfterSec: number };
    expect(refused.allowed).toBe(false);
    // Two a minute is a token every 30 s; just drained, the wait rounds up to 30.
    expect(refused.retryAfterSec).toBe(30);
  });
});

describe("3 — an object that cannot be asked fails open to the old limiter, and says so once", () => {
  it("allows what the per-isolate bucket allows, refuses what it refuses, logs one line a minute", async () => {
    freezeClock();
    const lines: string[] = [];
    console.warn = ((line: string) => {
      lines.push(line);
    }) as typeof console.warn;
    const env = envWith(namespace(true));
    // Within the per-isolate allowance every request passes — the outage
    // refuses nobody who would have been allowed before CS1.
    for (let i = 0; i < RATE_LIMITS.anon.limit; i += 1) {
      expect([i, (await route(read(), env)).status]).toEqual([i, 200]);
    }
    // And the in-isolate bucket still bounds a flood from one isolate.
    expect((await route(read(), env)).status).toBe(429);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual({ level: "warn", msg: "rate_limit_unavailable", bucket: "anon", reason: "unreachable" });
  });

  it("a non-2xx and a body that is not an answer are failures too, each by its word", async () => {
    const lines: string[] = [];
    console.warn = ((line: string) => {
      lines.push(line);
    }) as typeof console.warn;
    const refusing = {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => ({ fetch: async () => new Response("busy", { status: 503 }) }),
    } as unknown as DurableObjectNamespace;
    expect((await takeToken("anon", "a", { RATE_LIMIT: refusing }, 1_000)).ok).toBe(true);
    resetBuckets();
    const babbling = {
      idFromName: (name: string) => ({ toString: () => name }),
      get: () => ({ fetch: async () => Response.json({ hello: "there" }) }),
    } as unknown as DurableObjectNamespace;
    expect((await takeToken("anon", "a", { RATE_LIMIT: babbling }, 2_000)).ok).toBe(true);
    expect(lines.map((line) => (JSON.parse(line) as { reason: string }).reason)).toEqual(["refused", "malformed"]);
  });
});

describe("4 — the numbers on the page are the numbers enforced", () => {
  it("the gateway's buckets are the contract's objects, not copies of them", () => {
    expect(LIMITS.anon).toBe(RATE_LIMITS.anon);
    expect(LIMITS.identity).toBe(RATE_LIMITS.identity);
    expect(LIMITS.org).toBe(RATE_LIMITS.org);
    expect(LIMITS.authSignUp).toBe(AUTH_RATE_LIMITS.authSignUp);
    expect(Object.keys(LIMITS).sort()).toEqual([...Object.keys(RATE_LIMITS), ...Object.keys(AUTH_RATE_LIMITS)].sort());
  });
});

describe("CS0 → CS1 — a notice reaches the wire", () => {
  it("no header today; a synthetic open notice is Deprecation and Sunset on the public read", async () => {
    const env = envWith();
    const quiet = await route(read(), env);
    expect(quiet.headers.has("deprecation")).toBe(false);
    expect(quiet.headers.has("sunset")).toBe(false);
    const announced = await route(read(), env, {
      deprecations: [{ key: "media", shape: "card", since: "2026-09-01", until: "2030-01-01", sentence: "A test." }],
    });
    expect(announced.status).toBe(200);
    expect(announced.headers.get("deprecation")).toBe(`@${Date.parse("2026-09-01") / 1000}`);
    expect(announced.headers.get("sunset")).toBe("Tue, 01 Jan 2030 00:00:00 GMT");
    // It is still the cacheable public document — the notice is for everybody.
    expect(announced.headers.get("cache-control")).toBe("public, max-age=60");
  });
});
