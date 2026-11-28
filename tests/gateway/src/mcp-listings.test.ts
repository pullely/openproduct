// The listing tools, over the wire (openproduct-mcp MC3).
//
// Each tool is asserted by the request it makes of core: the same route, the
// same method and only the fields the website would send — and by what it
// refuses before any request is made.

import { route } from "@openproduct-gateway/router";
import { resetAgentCache, resetSubjectCache } from "@openproduct-gateway/subject";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import type { Env } from "@openproduct-gateway/env";

const API = "https://api.openproduct.test";
const ADA = "usr_0123456789abcdef0123456789abcdef";
const ALL = "opa_test_fixture_listings_token_not_real_1";
const RESTRICTED = "opa_test_fixture_restricted_listings_not_1";
const READ = "opa_test_fixture_read_only_listings_not_r1";
const TOKENS: Record<string, { scopes: string[]; listingIds: string[] | null }> = {
  [ALL]: { scopes: ["read", "listings"], listingIds: null },
  [RESTRICTED]: { scopes: ["read", "listings"], listingIds: ["opp_one"] },
  [READ]: { scopes: ["read"], listingIds: null },
};

interface Seen {
  path: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function core(seen: Seen[], kept = new Map<string, unknown>()): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      let body: unknown = null;
      if (init?.body) {
        const raw = typeof init.body === "string" ? init.body : await new Response(init.body as BodyInit).text();
        body = raw ? JSON.parse(raw) : null;
      }
      seen.push({ path: url.pathname, method: init?.method ?? "GET", body, headers });
      const ok = (data: unknown, status = 200) => Response.json({ data, meta: {} }, { status });
      const b = body as Record<string, unknown> | null;
      switch (url.pathname) {
        case "/internal/openproduct/agent-credentials/resolve": {
          const c = TOKENS[b!.token as string];
          return ok({ credential: c ? { credentialId: `agc_${(b!.token as string).slice(-4)}`, subjectId: ADA, kind: "oauth", clientName: "Claude", ...c } : null });
        }
        case "/internal/openproduct/agent-idempotency/lookup":
          return ok({ kept: kept.get(`${b!.credentialId}/${b!.key}`) ?? null });
        case "/internal/openproduct/agent-idempotency/store":
          kept.set(`${b!.credentialId}/${b!.key}`, { method: b!.method, path: b!.path, status: b!.status, body: b!.body });
          return ok({ kept: true }, 201);
        case "/internal/openproduct/me/listings":
          return ok({ listings: [
            { id: "opp_one", orgId: "org_a", slug: "one", visibility: "private", workspaceLinkedAt: "2026-11-01T00:00:00.000Z" },
            { id: "opp_two", orgId: "org_a", slug: "two", visibility: "public", workspaceLinkedAt: "2026-11-01T00:00:00.000Z" },
          ] });
        case "/internal/openproduct/orgs/org_a/profiles":
          return ok({ profile: { slug: b?.slug, n: seen.filter((s) => s.path === url.pathname).length } }, 201);
        default:
          if (url.pathname.startsWith("/internal/openproduct/orgs/org_a/profiles/")) return ok({ done: true, method: init?.method });
          return Response.json({ error: { message: "nope" } }, { status: 404 });
      }
    },
    connect: () => {
      throw new Error("not used");
    },
  } as unknown as Fetcher;
}

function env(seen: Seen[] = [], kept?: Map<string, unknown>): Env {
  return { ENVIRONMENT: "test", CORE: core(seen, kept), PUBLIC_API_ORIGIN: API, SITE_ORIGIN: "https://openproduct.test" } as Env;
}

async function call(token: string, name: string, args: Record<string, unknown>, e: Env): Promise<any> {
  const res = await route(
    new Request(`${API}/mcp/me`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    e,
  );
  return ((await res.json()) as { result: unknown }).result;
}

const crewCalls = (seen: Seen[]) => seen.filter((s) => s.path.startsWith("/internal/openproduct/orgs/"));

beforeEach(() => {
  resetAgentCache();
  resetSubjectCache();
  resetBuckets();
});

describe("MC3 — update_listing and change_stage are the website's own writes", () => {
  it("patches only the fields sent, as the person, carrying the credential", async () => {
    const seen: Seen[] = [];
    await call(ALL, "update_listing", { slug: "one", tagline: "New line", pitch: "# Hello", links: [{ label: "Docs", url: "https://d.example" }], newSlug: "uno", bogus: 1 }, env(seen));
    const [patch] = crewCalls(seen);
    expect(patch).toMatchObject({ path: "/internal/openproduct/orgs/org_a/profiles/opp_one", method: "PATCH" });
    expect(patch!.body).toEqual({ tagline: "New line", pitch: "# Hello", links: [{ label: "Docs", url: "https://d.example" }], slug: "uno" });
    expect(patch!.headers["x-actor-subject-id"]).toBe(ADA);
    expect(patch!.headers["x-actor-agent-credential"]).toMatch(/^agc_/);
  });

  it("refuses an empty edit without asking core", async () => {
    const seen: Seen[] = [];
    expect((await call(ALL, "update_listing", { slug: "one" }, env(seen))).isError).toBe(true);
    expect(crewCalls(seen)).toEqual([]);
  });

  it("moves the stage with the step's own fields", async () => {
    const seen: Seen[] = [];
    await call(ALL, "change_stage", { slug: "one", to: "building", repository: "https://github.com/a/b", firstMilestone: "MVP" }, env(seen));
    expect(crewCalls(seen)[0]).toMatchObject({ path: "/internal/openproduct/orgs/org_a/profiles/opp_one/stage", method: "PUT", body: { to: "building", repository: "https://github.com/a/b", firstMilestone: "MVP" } });
  });
});

describe("MC3 — publishing asks the person first", () => {
  it("refuses publish without acknowledged: true, and offers the checklist", async () => {
    const seen: Seen[] = [];
    expect((await call(ALL, "publish_listing", { slug: "one" }, env(seen))).content[0].text).toContain("get_publish_checklist");
    expect(crewCalls(seen)).toEqual([]);
    const checklist = await call(ALL, "get_publish_checklist", { slug: "one" }, env());
    expect(checklist.structuredContent.becomesPublic.listing).toContain("slug");
    await call(ALL, "publish_listing", { slug: "one", acknowledged: true }, env(seen));
    expect(crewCalls(seen)[0]).toMatchObject({ path: "/internal/openproduct/orgs/org_a/profiles/opp_one/publish", method: "POST" });
  });

  it("unpublishes with the website's DELETE", async () => {
    const seen: Seen[] = [];
    await call(ALL, "unpublish_listing", { slug: "two" }, env(seen));
    expect(crewCalls(seen)[0]).toMatchObject({ path: "/internal/openproduct/orgs/org_a/profiles/opp_two/publish", method: "DELETE" });
  });
});

describe("MC3 — creating a listing", () => {
  it("needs the workspace's link grant, and says where the person gets one", async () => {
    const result = await call(ALL, "create_listing", { workspace: "org_a", slug: "three" }, env());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("https://openproduct.test/me");
  });

  it("is refused to a connection limited to named listings", async () => {
    const result = await call(RESTRICTED, "create_listing", { workspace: "org_a", grant: "g", slug: "three" }, env());
    expect(result.content[0].text).toContain("limited to named listings");
  });

  it("creates once for one idempotency key", async () => {
    const seen: Seen[] = [];
    const kept = new Map<string, unknown>();
    const e = env(seen, kept);
    const first = await call(ALL, "create_listing", { workspace: "org_a", grant: "g", slug: "three", idempotencyKey: "k-1" }, e);
    const again = await call(ALL, "create_listing", { workspace: "org_a", grant: "g", slug: "three", idempotencyKey: "k-1" }, e);
    expect(again.structuredContent).toEqual(first.structuredContent);
    expect(seen.filter((s) => s.path === "/internal/openproduct/orgs/org_a/profiles" && s.method === "POST")).toHaveLength(1);
  });

  it("refuses a key that was kept for a different call", async () => {
    const kept = new Map<string, unknown>([["agc_al_1/k-2", { method: "PATCH", path: "/v1/elsewhere", status: 200, body: {} }]]);
    const seen: Seen[] = [];
    const result = await call(ALL, "create_listing", { workspace: "org_a", grant: "g", slug: "four", idempotencyKey: "k-2" }, env(seen, kept));
    expect(result.isError).toBe(true);
    expect(seen.some((s) => s.path === "/internal/openproduct/orgs/org_a/profiles")).toBe(false);
  });

  it("lists the workspaces and where to link another", async () => {
    const result = await call(READ, "list_workspaces", {}, env());
    expect(result.structuredContent.workspaces).toEqual([{ workspace: "org_a", listings: ["one", "two"], linkedAt: "2026-11-01T00:00:00.000Z" }]);
    expect(result.structuredContent.linkAnother.open).toBe("https://openproduct.test/me");
  });
});

describe("MC3 — scopes and the restriction still hold", () => {
  it("refuses a listing write to a read-only connection", async () => {
    const seen: Seen[] = [];
    expect((await call(READ, "update_listing", { slug: "one", tagline: "x" }, env(seen))).isError).toBe(true);
    expect(crewCalls(seen)).toEqual([]);
  });

  it("refuses a listing outside the restriction before any write", async () => {
    const seen: Seen[] = [];
    expect((await call(RESTRICTED, "unpublish_listing", { slug: "two" }, env(seen))).isError).toBe(true);
    expect(crewCalls(seen)).toEqual([]);
  });
});
