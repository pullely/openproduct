// The walk: six reads, as a visitor, each a fact (OO1, OO-B, OO-4).

import { describe, expect, it } from "vitest";

import { USER_AGENT, walk } from "./walk.js";

const ENV = { API_ORIGIN: "https://api.test", SITE_ORIGIN: "https://site.test" };

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
}

type Answer = (seen: Seen, nth: number) => Response | Error;

const HEALTH = {
  data: {
    checks: {
      sweep: {
        reachable: true,
        healthy: false,
        phases: [
          { phase: "catalogue", healthy: true, reason: null, lastRunAt: "2026-09-10T11:50:00.000Z" },
          { phase: "searchIndex", healthy: false, reason: "stale", lastRunAt: "2026-09-10T10:00:00.000Z" },
          { phase: "integrity", healthy: true, reason: null, lastRunAt: null },
        ],
      },
    },
    build: { version: "7b3c9f2e-0000-4000-8000-000000000001", deployedAt: "2026-09-10T11:00:00.000Z", tag: null },
  },
};

function product(): Response {
  return Response.json({ data: { products: [{ slug: "acme-thing", publishedAt: "2026-09-01T00:00:00Z" }], next: null, total: 1, computedAt: null } });
}

function site(cacheStatus: string | null): Response {
  return new Response("<html><head><title>openproduct · products built in the open</title></head><body></body></html>", {
    headers: cacheStatus ? { "cf-cache-status": cacheStatus, "content-type": "text/html" } : { "content-type": "text/html" },
  });
}

function fake(answer: Answer): { fetch: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const counts = new Map<string, number>();
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const record = { url, method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()) };
    seen.push(record);
    const nth = (counts.get(url) ?? 0) + 1;
    counts.set(url, nth);
    // Every read is bounded.
    if (!(init?.signal instanceof AbortSignal)) throw new Error("unbounded fetch");
    const out = answer(record, nth);
    if (out instanceof Error) throw out;
    return out;
  }) as typeof fetch;
  return { fetch: fetchImpl, seen };
}

const healthy: Answer = (seen, nth) => {
  if (seen.url === "https://api.test/health") return Response.json(HEALTH);
  if (seen.url === "https://site.test/") return site(nth === 1 ? "MISS" : "HIT");
  if (seen.url === "https://api.test/v1/products?limit=1") return product();
  if (seen.url === "https://api.test/v1/search?q=acme-thing&limit=10") {
    return Response.json({ data: { query: "acme-thing", results: [{ kind: "product", entityId: "acme-thing", title: "Acme", summary: null, matched: "slug" }] } });
  }
  if (seen.url === "https://site.test/acme-thing") return site(null);
  if (seen.url === "https://site.test/signin") return site(null);
  if (seen.url === "https://site.test/me/endorse?slug=acme-thing") return new Response(null, { status: seen.method === "POST" ? 401 : 405 });
  return new Response("?", { status: 404 });
};

describe("the six reads", () => {
  it("in order, anonymously, named — and the cache sample comes from the PLAIN read after a no-cache one", async () => {
    const { fetch: f, seen } = fake(healthy);
    let t = 1_000;
    const obs = await walk(ENV, f, () => (t += 250));
    expect(seen.map((s) => s.url)).toEqual([
      "https://api.test/health",
      "https://site.test/",
      "https://site.test/",
      "https://api.test/v1/products?limit=1",
      "https://api.test/v1/search?q=acme-thing&limit=10",
      "https://site.test/acme-thing",
      "https://site.test/signin",
      "https://site.test/me/endorse?slug=acme-thing",
    ]);
    // OO3 — RS4's gate is asked as a POST wanting JSON, so the refusal is a 401 and not a redirect to follow.
    expect(seen[7]!.method).toBe("POST");
    expect(seen[7]!.headers.accept).toBe("application/json");
    expect(seen.slice(0, 7).every((s) => s.method === "GET")).toBe(true);
    // OO-B: the first front-page read asks for a fresh copy, the second does not.
    expect(seen[1]!.headers["cache-control"]).toBe("no-cache");
    expect(seen[2]!.headers["cache-control"]).toBeUndefined();
    // OO-4: no cookie, no bearer, on any read; and it says who it is.
    for (const s of seen) {
      expect(Object.keys(s.headers)).not.toContain("cookie");
      expect(Object.keys(s.headers)).not.toContain("authorization");
      expect(s.headers["user-agent"]).toBe(USER_AGENT);
    }
    expect(obs.health).toEqual({
      reachable: true,
      status: 200,
      phases: {
        catalogue: { healthy: true, reason: null, lastRunAt: "2026-09-10T11:50:00.000Z" },
        searchIndex: { healthy: false, reason: "stale", lastRunAt: "2026-09-10T10:00:00.000Z" },
        integrity: { healthy: true, reason: null, lastRunAt: null },
      },
      build: { version: "7b3c9f2e-0000-4000-8000-000000000001", deployedAt: "2026-09-10T11:00:00.000Z" },
    });
    expect(obs.rs4).toEqual({ upvoteGate: true, signinOwned: true });
    expect(obs.front).toEqual({ reachable: true, status: 200, cacheStatus: "HIT", titled: true });
    expect(obs.seeded).toEqual({ reachable: true, slug: "acme-thing", publishedAt: "2026-09-01T00:00:00Z" });
    expect(obs.search).toEqual({ reachable: true, found: true });
    expect(obs.listing).toEqual({ reachable: true, status: 200, titled: true });
    expect(obs.durationMs).toBe(250);
  });

  it("a gateway that cannot ask core is `phases: null`, distinct from a gateway that did not answer", async () => {
    const unreachableCore = fake((seen, nth) =>
      seen.url === "https://api.test/health" ? Response.json({ data: { checks: { sweep: { reachable: false, healthy: false, phases: [] } } } }) : healthy(seen, nth),
    );
    const noBuild = { version: null, deployedAt: null };
    expect((await walk(ENV, unreachableCore.fetch)).health).toEqual({ reachable: true, status: 200, phases: null, build: noBuild });
    const down = fake((seen, nth) => (seen.url === "https://api.test/health" ? new Response("gone", { status: 503 }) : healthy(seen, nth)));
    expect((await walk(ENV, down.fetch)).health).toEqual({ reachable: false, status: 503, phases: null, build: noBuild });
    const thrown = fake((seen, nth) => (seen.url === "https://api.test/health" ? new Error("ECONNRESET") : healthy(seen, nth)));
    expect((await walk(ENV, thrown.fetch)).health).toEqual({ reachable: false, status: null, phases: null, build: noBuild });
  });

  it("no seeded slug means no search and no listing read, and a slug that is not a slug is ignored", async () => {
    const empty = fake((seen, nth) =>
      seen.url === "https://api.test/v1/products?limit=1" ? Response.json({ data: { products: [], next: null, total: 0, computedAt: null } }) : healthy(seen, nth),
    );
    const obs = await walk(ENV, empty.fetch);
    expect(obs.seeded).toEqual({ reachable: true, slug: null, publishedAt: null });
    expect(obs.search).toEqual({ reachable: null, found: null });
    expect(obs.listing).toBeNull();
    // No slug: no search, no listing, no upvote to refuse — but the door is still checked.
    expect(obs.rs4).toEqual({ upvoteGate: null, signinOwned: true });
    expect(empty.seen).toHaveLength(5);
    const odd = fake((seen, nth) =>
      seen.url === "https://api.test/v1/products?limit=1" ? Response.json({ data: { products: [{ slug: "../etc", publishedAt: null }] } }) : healthy(seen, nth),
    );
    expect((await walk(ENV, odd.fetch)).seeded.slug).toBeNull();
  });

  it("search that does not list the slug is `found: false`; a front page without the brand is untitled; a missing cache header is null", async () => {
    const f = fake((seen, nth) => {
      if (seen.url.startsWith("https://api.test/v1/search")) return Response.json({ data: { query: "acme-thing", results: [{ kind: "product", entityId: "other-thing" }] } });
      if (seen.url === "https://site.test/") return new Response("<html><title>Something else</title></html>");
      return healthy(seen, nth);
    });
    const obs = await walk(ENV, f.fetch);
    expect(obs.search).toEqual({ reachable: true, found: false });
    expect(obs.front).toEqual({ reachable: true, status: 200, cacheStatus: null, titled: false });
  });

  it("OO3 — a gate that redirects instead of refusing, or a door that is not ours, is a failed walk; a down site asks neither", async () => {
    const leaky = fake((seen, nth) => {
      if (seen.url.startsWith("https://site.test/me/endorse")) return new Response(null, { status: 303, headers: { location: "/signin" } });
      if (seen.url === "https://site.test/signin") return new Response("<title>Somebody else</title>");
      return healthy(seen, nth);
    });
    expect((await walk(ENV, leaky.fetch)).rs4).toEqual({ upvoteGate: false, signinOwned: false });
    const down = fake((seen, nth) => (seen.url === "https://site.test/" ? new Response("no", { status: 502 }) : healthy(seen, nth)));
    const obs = await walk(ENV, down.fetch);
    expect(obs.rs4).toEqual({ upvoteGate: null, signinOwned: null });
    expect(down.seen.some((s) => s.url === "https://site.test/signin")).toBe(false);
  });
});
