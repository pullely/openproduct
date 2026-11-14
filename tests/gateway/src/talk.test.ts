// Private threads at the gateway (openproduct-redesign OPR-4, design §7).
//
// The privacy rule is the repository's. What this layer owes it:
//
//   - a private thread is served ONLY on the signed-in plane: no public path
//     maps to it, so it is never in the edge cache;
//   - every answer about one says `no-store`;
//   - a caller with no session gets the 404 a missing thread gets — not a
//     401, and never a 403 — and core is not called;
//   - the actor core is given is the session's, never a header the caller
//     sent;
//   - a reply in a private thread is bounded like any reply, and purges
//     nothing (no cached document holds a private thread).

import { classifyWrite, internalPath, isAuthenticatedRoute, isPrivateThreadRoute, isPublicRoute, route } from "@openproduct-gateway/router";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENT_TOOLS } from "@openproduct/contracts";
import { purgeTagsForWrite } from "@openproduct-gateway/tags";
import * as targets from "@openproduct-gateway/targets";
import type { Env } from "@openproduct-gateway/env";
import { resetSubjectCache } from "@openproduct-gateway/subject";
import { resetBuckets } from "@openproduct-gateway/ratelimit";

const THREAD = "0d5e1f2a-1111-4222-8333-444455556666";
const SUBJECT = "usr_0123456789abcdef0123456789abcdef";

const PRIVATE_PATHS = [
  "/v1/openproduct/threads/private",
  `/v1/openproduct/threads/private/${THREAD}`,
  `/v1/openproduct/threads/private/${THREAD}/posts`,
];

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function coreStub(respond: () => Response, captured: Captured[] = []): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? {});
      captured.push({ url: String(input), method: init?.method ?? "GET", headers: Object.fromEntries([...headers.entries()]) });
      return respond();
    },
  } as unknown as Fetcher;
}

function envWith(core: Fetcher): Env {
  return { CORE: core, ENVIRONMENT: "test", PLATFORM_API_URL: "https://platform.test", SITE_ORIGIN: "https://openproduct.live" } as Env;
}

const realFetch = globalThis.fetch;

function stubIdentity(subjectId: string | null): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://platform.test/v1/identity/me")) {
      if (subjectId === null) return new Response("{}", { status: 401 });
      return Response.json({ data: { subjectId, displayName: "Ada" } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  resetSubjectCache();
  resetBuckets();
});

describe("a private thread is on the signed-in plane and nowhere else", () => {
  it("every private-thread path is authenticated, mapped, and not public", () => {
    for (const path of PRIVATE_PATHS) {
      expect([path, isPrivateThreadRoute(path)]).toEqual([path, true]);
      expect([path, isAuthenticatedRoute(path)]).toEqual([path, true]);
      expect([path, isPublicRoute(path)]).toEqual([path, false]);
      expect(internalPath(path)).toBe(`/internal/openproduct${path.slice("/v1/openproduct".length)}`);
    }
    // And the public thread paths are not private ones.
    expect(isPrivateThreadRoute(`/v1/public/openproduct/threads/${THREAD}`)).toBe(false);
    expect(isPrivateThreadRoute(`/v1/openproduct/threads/${THREAD}`)).toBe(false);
    // No `/v1/public/…/private` path exists to be cached.
    expect(isPublicRoute("/v1/public/openproduct/threads/private")).toBe(false);
    expect(isPublicRoute(`/v1/public/openproduct/threads/private/${THREAD}`)).toBe(false);
  });

  it("answers 404 — not 401, not 403 — with no session, for any id, without calling core", async () => {
    const bodies: string[] = [];
    for (const path of [...PRIVATE_PATHS, "/v1/openproduct/threads/private/99999999-9999-4999-8999-999999999999"]) {
      stubIdentity(null);
      resetSubjectCache();
      const captured: Captured[] = [];
      const core = coreStub(() => Response.json({ data: { thread: { title: "SECRET" } } }), captured);
      for (const headers of [{}, { authorization: "Bearer not-a-session" }] as Array<Record<string, string>>) {
        const res = await route(new Request(`https://gw.test${path}`, { headers: { ...headers, "x-request-id": "req_talk_gateway" } }), envWith(core));
        expect([path, res.status]).toEqual([path, 404]);
        expect(res.headers.get("cache-control")).toBe("no-store");
        const text = await res.text();
        expect(text).not.toContain("SECRET");
        expect(text).not.toContain("forbidden");
        expect(text).not.toContain("unauthenticated");
        bodies.push(text);
      }
      expect(captured).toEqual([]);
    }
    // One body, whatever the id and whether or not a bearer was sent.
    expect(new Set(bodies).size).toBe(1);
  });

  it("another signed-in route with no session still answers 401: the 404 is the private routes' alone", async () => {
    stubIdentity(null);
    const res = await route(new Request("https://gw.test/v1/openproduct/me"), envWith(coreStub(() => Response.json({}))));
    expect(res.status).toBe(401);
  });

  it("passes core's 404 through unchanged for a signed-in stranger, and says no-store", async () => {
    stubIdentity(SUBJECT);
    const captured: Captured[] = [];
    const core = coreStub(
      () => Response.json({ error: { code: "not_found", message: "Not found", details: {}, requestId: "r" } }, { status: 404 }),
      captured,
    );
    const res = await route(
      new Request(`https://gw.test/v1/openproduct/threads/private/${THREAD}`, {
        headers: { authorization: "Bearer t", "x-actor-subject-id": "usr_forged" },
      }),
      envWith(core),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    // The reader core checks is the SESSION'S subject — a forged header dies here.
    expect(captured[0]!.url).toContain(`/internal/openproduct/threads/private/${THREAD}`);
    expect(captured[0]!.headers["x-actor-subject-id"]).toBe(SUBJECT);
  });

  it("serves a readable private thread no-store, with no cache tag", async () => {
    stubIdentity(SUBJECT);
    const core = coreStub(() =>
      Response.json({ data: { thread: { id: THREAD } } }, { headers: { "cache-control": "public, max-age=60", "cache-tag": "op-threads" } }),
    );
    const res = await route(
      new Request(`https://gw.test/v1/openproduct/threads/private?slug=acme-thing`, { headers: { authorization: "Bearer t" } }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    // Whatever a downstream said, a signed-in answer is never cacheable.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("the writes are bounded, and a private reply purges nothing", () => {
  it("classifies a private reply and a resolve as a post on that thread", () => {
    expect(classifyWrite(`/v1/openproduct/threads/private/${THREAD}/posts`, "POST")).toEqual({ action: "post", target: THREAD });
    expect(classifyWrite(`/v1/openproduct/threads/${THREAD}/resolved`, "PUT")).toEqual({ action: "post", target: THREAD });
    expect(classifyWrite(`/v1/openproduct/threads/${THREAD}/resolved`, "DELETE")).toEqual({ action: "post", target: THREAD });
    // A read is not a write.
    expect(classifyWrite(`/v1/openproduct/threads/private/${THREAD}`, "GET")).toBeNull();
    expect(classifyWrite("/v1/openproduct/threads/private", "GET")).toBeNull();
  });

  it("purges the thread documents when an issue is resolved, and nothing for a private reply", () => {
    expect(purgeTagsForWrite(`/v1/openproduct/threads/${THREAD}/resolved`, "post")).toEqual(["op-threads"]);
    expect(purgeTagsForWrite(`/v1/openproduct/threads/private/${THREAD}/posts`, "post")).toEqual([]);
  });
});

describe("the agent surface (MCP) cannot answer with a thread", () => {
  const GATEWAY = resolve(dirname(fileURLToPath(import.meta.url)), "../../../gateway/src");

  it("no tool is about threads, and no target the tools read is a thread path", () => {
    for (const tool of AGENT_TOOLS) {
      expect([tool.name, /thread|talk|discussion|post/i.test(tool.name)]).toEqual([tool.name, false]);
    }
    // A target is a path, or a function of a slug that builds one.
    const paths = (Object.values(targets) as unknown[]).map((value) =>
      typeof value === "function" ? String((value as (slug: string) => string)("acme-thing")) : String(value),
    );
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect([path, /thread|private/i.test(path)]).toEqual([path, false]);
    // The server itself names no thread route, public or private.
    const mcp = readFileSync(resolve(GATEWAY, "mcp.ts"), "utf-8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(mcp).not.toMatch(/\/threads|openproduct\/threads|threads\/private/);
  });
});
