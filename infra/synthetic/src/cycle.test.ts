// One cycle, end to end, with the lines it prints (OO1, OO2).

import { afterEach, describe, expect, it } from "vitest";

import type { Env } from "./env.js";
import worker, { runCycle } from "./index.js";
import { SyntheticState, type StateStorage } from "./state.js";

function namespace(): DurableObjectNamespace & { objects: Map<string, SyntheticState> } {
  const objects = new Map<string, SyntheticState>();
  const stores = new Map<string, Map<string, unknown>>();
  const ns = {
    objects,
    idFromName: (name: string) => ({ toString: () => name }),
    get: (id: { toString(): string }) => ({
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const key = id.toString();
        const map = stores.get(key) ?? new Map<string, unknown>();
        stores.set(key, map);
        const storage: StateStorage = {
          get: async <T>(k: string) => map.get(k) as T | undefined,
          put: async <T>(k: string, v: T) => {
            map.set(k, v);
          },
        };
        const object = objects.get(key) ?? new SyntheticState({ storage }, {});
        objects.set(key, object);
        return object.fetch(new Request(input instanceof Request ? input.url : String(input), init));
      },
    }),
  };
  return ns as unknown as DurableObjectNamespace & { objects: Map<string, SyntheticState> };
}

interface World {
  searchIndexHealthy: boolean;
  found: boolean;
  cache: string;
  /** OO3 — the build /health answers with, and when the per-tick phases last ran. */
  build?: { version: string; deployedAt: string };
  ranAt?: string;
  upvoteStatus?: number;
}

function product(world: World): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const noCache = new Headers(init?.headers).get("cache-control") === "no-cache";
    if (url === "https://api.test/health") {
      const ran = world.ranAt ?? "2026-09-10T11:55:00.000Z";
      return Response.json({
        data: {
          ...(world.build ? { build: { ...world.build, tag: null } } : {}),
          checks: {
            sweep: {
              reachable: true,
              healthy: world.searchIndexHealthy,
              phases: [
                { phase: "catalogue", healthy: true, reason: null, lastRunAt: ran },
                { phase: "searchIndex", healthy: world.searchIndexHealthy, reason: world.searchIndexHealthy ? null : "stale", lastRunAt: ran },
                { phase: "integrity", healthy: true, reason: null, lastRunAt: ran },
                { phase: "board", healthy: true, reason: null, lastRunAt: ran },
                { phase: "digest", healthy: true, reason: null, lastRunAt: ran },
              ],
            },
          },
        },
      });
    }
    if (url === "https://site.test/signin") return new Response("<title>Sign in · openproduct</title>");
    if (url.startsWith("https://site.test/me/endorse")) return new Response(null, { status: world.upvoteStatus ?? 401 });
    if (url === "https://site.test/") {
      return new Response("<title>openproduct</title>", { headers: { "cf-cache-status": noCache ? "MISS" : world.cache } });
    }
    if (url === "https://api.test/v1/products?limit=1") {
      return Response.json({ data: { products: [{ slug: "acme-thing", publishedAt: "2026-09-01T00:00:00Z" }] } });
    }
    if (url.startsWith("https://api.test/v1/search")) {
      return Response.json({ data: { results: world.found ? [{ kind: "product", entityId: "acme-thing" }] : [] } });
    }
    if (url === "https://site.test/acme-thing") return new Response("<title>Acme · openproduct</title>");
    if (url === "https://platform.test/seam/alert") return new Response(null, { status: 202 });
    return new Response("?", { status: 404 });
  }) as typeof fetch;
}

/* eslint-disable no-console -- the test captures the structured lines the worker prints */
const realLog = console.log;
const realWarn = console.warn;

afterEach(() => {
  console.log = realLog;
  console.warn = realWarn;
});

function capture(): { lines: Array<Record<string, unknown>> } {
  const lines: Array<Record<string, unknown>> = [];
  const push = (line: string) => {
    lines.push(JSON.parse(line) as Record<string, unknown>);
  };
  console.log = push as typeof console.log;
  console.warn = push as typeof console.warn;
  return { lines };
}

const T = (n: number) => new Date(Date.UTC(2026, 8, 10, 12, n * 5));

describe("a cycle", () => {
  it("walks, judges, remembers in its object, and says one line; a flip adds its line and, with no channel, says so", async () => {
    const ns = namespace();
    const env: Env = { ENVIRONMENT: "test", API_ORIGIN: "https://api.test", SITE_ORIGIN: "https://site.test", SYNTHETIC_STATE: ns };
    const world: World = { searchIndexHealthy: true, found: true, cache: "HIT" };
    const { lines } = capture();

    // Cycle 1: everything holds. Nothing to say but the cycle line.
    const first = await runCycle(env, product(world), T(0));
    expect(first.flips).toEqual([]);
    expect(first.state.slos["search-freshness"].holding).toBe(true);
    expect(first.state.slos["cache-hit"].holding).toBeNull(); // not yet: one sample
    expect(lines).toEqual([{ level: "info", msg: "synthetic_cycle", holding: 2, cacheStatus: "HIT", durationMs: expect.any(Number) }]);
    expect([...ns.objects.keys()]).toEqual(["state"]);

    // Cycle 2: the sweep did not run. A breach, its line, and no channel to send it on.
    lines.length = 0;
    world.searchIndexHealthy = false;
    const second = await runCycle(env, product(world), T(1));
    expect(second.flips).toEqual([{ slo: "search-freshness", state: "breached", mode: "sweep_not_run" }]);
    expect(lines).toEqual([
      { level: "warn", msg: "slo_breached", slo: "search-freshness", mode: "sweep_not_run", runbook: "sweep_not_run" },
      { level: "warn", msg: "alert_undeliverable", slo: "search-freshness", reason: "no_channel" },
      { level: "info", msg: "synthetic_cycle", holding: 1, cacheStatus: "HIT", durationMs: expect.any(Number) },
    ]);

    // Cycle 3: still broken — nothing new to say.
    lines.length = 0;
    const third = await runCycle(env, product(world), T(2));
    expect(third.flips).toEqual([]);
    expect(lines.map((l) => l.msg)).toEqual(["synthetic_cycle"]);

    // Cycle 4: the page disagrees now — the same breach, better understood, still not a flip.
    lines.length = 0;
    world.searchIndexHealthy = true;
    world.found = false;
    const fourth = await runCycle(env, product(world), T(3));
    expect(fourth.flips).toEqual([]);
    expect(fourth.state.slos["search-freshness"].mode).toBe("page_disagrees");

    // Cycle 5: recovered.
    lines.length = 0;
    world.found = true;
    const fifth = await runCycle(env, product(world), T(4));
    expect(fifth.flips).toEqual([{ slo: "search-freshness", state: "recovered", mode: null }]);
    expect(lines[0]).toEqual({ level: "info", msg: "slo_recovered", slo: "search-freshness", runbook: "recovered" });
    expect(fifth.state.slos["search-freshness"].since).toBe(T(4).toISOString());
    expect(fifth.state.cycles).toBe(5);
  });

  it("with a channel, a flip is delivered and no `alert_undeliverable` is printed; in a window it is held", async () => {
    const ns = namespace();
    const env: Env = {
      ENVIRONMENT: "test",
      API_ORIGIN: "https://api.test",
      SITE_ORIGIN: "https://site.test",
      SYNTHETIC_STATE: ns,
      ALERT_DELIVERY_URL: "https://platform.test/seam/alert",
      ALERT_SEAM_SECRET: "s",
      OPERATOR_SUBJECT_ID: "usr_op",
    };
    const { lines } = capture();
    await runCycle(env, product({ searchIndexHealthy: false, found: true, cache: "HIT" }), T(0));
    expect(lines.map((l) => l.msg)).toEqual(["slo_breached", "synthetic_cycle"]);
    lines.length = 0;
    await runCycle({ ...env, MAINTENANCE_UNTIL: T(9).toISOString() }, product({ searchIndexHealthy: true, found: true, cache: "HIT" }), T(1));
    expect(lines.map((l) => [l.msg, l.reason ?? null])).toEqual([
      ["slo_recovered", null],
      ["alert_undeliverable", "maintenance"],
      ["synthetic_cycle", null],
    ]);
  });

  it("without an object bound, the cycle still runs from this isolate's memory", async () => {
    const env: Env = { ENVIRONMENT: "local", API_ORIGIN: "https://api.test", SITE_ORIGIN: "https://site.test" };
    capture();
    const report = await runCycle(env, product({ searchIndexHealthy: true, found: true, cache: "MISS" }), T(0));
    expect(report.state.cycles).toBeGreaterThanOrEqual(1);
    expect(report.cacheStatus).toBe("MISS");
  });

  it("the worker's own document is GET / — no-store, anonymous, the state and nothing else", async () => {
    const ns = namespace();
    const env: Env = { ENVIRONMENT: "test", API_ORIGIN: "https://api.test", SITE_ORIGIN: "https://site.test", SYNTHETIC_STATE: ns };
    capture();
    await runCycle(env, product({ searchIndexHealthy: true, found: true, cache: "HIT" }), T(0));
    const res = await worker.fetch(new Request("https://synthetic.test/"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { service: string; state: { cycles: number } };
    expect(body.service).toBe("openproduct-synthetic");
    expect(body.state.cycles).toBe(1);
    expect((await worker.fetch(new Request("https://synthetic.test/anything"), env)).status).toBe(404);
    expect((await worker.fetch(new Request("https://synthetic.test/", { method: "POST" }), env)).status).toBe(405);
  });
});

describe("OO3 — a cycle verifies a deploy", () => {
  it("notices a new version, verifies it once every per-tick phase has run after it, and reports one that is not — with no channel, as a line", async () => {
    const ns = namespace();
    const env: Env = { ENVIRONMENT: "test", API_ORIGIN: "https://api.test", SITE_ORIGIN: "https://site.test", SYNTHETIC_STATE: ns };
    const { lines } = capture();
    const V1 = "7b3c9f2e-0000-4000-8000-000000000001";
    // Cycle 1 at T(1): a version uploaded at T(0); the phases last ran before it.
    const world: World = { searchIndexHealthy: true, found: true, cache: "HIT", build: { version: V1, deployedAt: T(0).toISOString() }, ranAt: "2026-09-10T11:55:00.000Z" };
    const first = await runCycle(env, product(world), T(1));
    expect(first.state.deploy).toMatchObject({ version: V1, verifiedAt: null, reportedAt: null });
    expect(lines.map((l) => l.msg)).toEqual(["deploy_noticed", "synthetic_cycle"]);
    expect(lines[0]).toEqual({ level: "info", msg: "deploy_noticed", version: V1 });
    // Cycle 2 at T(2): the tick ran after the upload. Verified.
    lines.length = 0;
    world.ranAt = T(2).toISOString();
    const second = await runCycle(env, product(world), T(2));
    expect(second.state.deploy.verifiedAt).toBe(T(2).toISOString());
    expect(lines[0]).toEqual({ level: "info", msg: "deploy_verified", version: V1, afterMs: 10 * 60_000 });
    // A second version at T(3), and the gate starts redirecting instead of refusing: twenty minutes later, unverified for the walk.
    lines.length = 0;
    const V2 = "8c4da0f3-0000-4000-8000-000000000002";
    world.build = { version: V2, deployedAt: T(3).toISOString() };
    world.ranAt = T(4).toISOString();
    world.upvoteStatus = 303;
    await runCycle(env, product(world), T(4));
    expect(lines.map((l) => l.msg)).toEqual(["deploy_noticed", "synthetic_cycle"]);
    lines.length = 0;
    const late = await runCycle(env, product(world), T(7));
    expect(late.state.deploy.reportedAt).toBe(T(7).toISOString());
    expect(lines.map((l) => [l.msg, l.reason ?? l.version ?? null])).toEqual([
      ["deploy_unverified", "walk_failed"],
      ["alert_undeliverable", "no_channel"],
      ["synthetic_cycle", null],
    ]);
    // The gate is fixed: verified, and the recovery has nowhere to go but the log.
    lines.length = 0;
    world.upvoteStatus = 401;
    await runCycle(env, product(world), T(8));
    expect(lines.map((l) => l.msg)).toEqual(["deploy_verified", "alert_undeliverable", "synthetic_cycle"]);
  });
});
