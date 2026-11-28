// The post, milestone and launch tools, over the wire (openproduct-mcp MC5).
//
// One table: each tool call and the exact request the website's own control
// sends — route, method, body. And what each refuses before asking core.

import { AUTHORED_PRODUCT_POST_KINDS } from "@openproduct/contracts";
import { route } from "@openproduct-gateway/router";
import { resetAgentCache, resetSubjectCache } from "@openproduct-gateway/subject";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import type { Env } from "@openproduct-gateway/env";

const API = "https://api.openproduct.test";
const POSTS = "opa_test_fixture_posts_token_not_a_real_1";
const POST_ID = "ppo_0123456789abcdef0123456789abcdef";
const BASE = "/internal/openproduct/orgs/org_a/profiles/opp_one";

interface Seen {
  path: string;
  method: string;
  body: unknown;
}

function core(seen: Seen[]): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const raw = init?.body ? (typeof init.body === "string" ? init.body : await new Response(init.body as BodyInit).text()) : "";
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ path: url.pathname, method: init?.method ?? "GET", body });
      const ok = (data: unknown) => Response.json({ data, meta: {} });
      if (url.pathname === "/internal/openproduct/agent-credentials/resolve") {
        return ok({ credential: body.token === POSTS ? { credentialId: "agc_posts", subjectId: "usr_0123456789abcdef0123456789abcdef", kind: "oauth", clientName: "Claude", scopes: ["read", "posts"], listingIds: null } : null });
      }
      if (url.pathname === "/internal/openproduct/me/listings") return ok({ listings: [{ id: "opp_one", orgId: "org_a", slug: "one" }] });
      return ok({ ok: true });
    },
    connect: () => {
      throw new Error("not used");
    },
  } as unknown as Fetcher;
}

async function call(name: string, args: Record<string, unknown>, seen: Seen[]): Promise<any> {
  const e = { ENVIRONMENT: "test", CORE: core(seen), PUBLIC_API_ORIGIN: API } as Env;
  const res = await route(
    new Request(`${API}/mcp/me`, {
      method: "POST",
      headers: { authorization: `Bearer ${POSTS}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    e,
  );
  return ((await res.json()) as { result: unknown }).result;
}

const crew = (seen: Seen[]) => seen.filter((s) => s.path.startsWith(BASE)).map((s) => [s.method, s.path.slice(BASE.length), s.body]);

beforeEach(() => {
  resetAgentCache();
  resetSubjectCache();
  resetBuckets();
});

const BLOCKS = [{ block: "problem", value: "It is slow." }];

const CASES: Array<[string, Record<string, unknown>, [string, string, unknown]]> = [
  ["list_posts", {}, ["GET", "/product-posts", null]],
  ["create_post", { kind: "idea", blocks: BLOCKS }, ["POST", "/product-posts", { kind: "idea", blocks: BLOCKS }]],
  ["update_post", { postId: POST_ID, blocks: BLOCKS }, ["PATCH", `/product-posts/${POST_ID}`, { blocks: BLOCKS }]],
  ["publish_post", { postId: POST_ID, milestoneId: "pms_1" }, ["POST", `/product-posts/${POST_ID}/publish`, { milestoneId: "pms_1" }]],
  ["delete_post", { postId: POST_ID }, ["DELETE", `/product-posts/${POST_ID}`, null]],
  ["list_milestones", {}, ["GET", "/milestones", null]],
  ["create_milestone", { title: "MVP", code: "v1" }, ["POST", "/milestones", { title: "MVP", code: "v1" }]],
  ["update_milestone", { milestoneId: "pms_1", summary: "Soon" }, ["PATCH", "/milestones/pms_1", { summary: "Soon" }]],
  ["reorder_milestones", { order: ["pms_2", "pms_1"] }, ["PUT", "/milestones", { order: ["pms_2", "pms_1"] }]],
  ["ship_milestone", { milestoneId: "pms_1", shipped: true }, ["PUT", "/milestones/pms_1/shipped", {}]],
  ["ship_milestone", { milestoneId: "pms_1", shipped: false }, ["DELETE", "/milestones/pms_1/shipped", null]],
  ["delete_milestone", { milestoneId: "pms_1" }, ["DELETE", "/milestones/pms_1", null]],
  ["list_listing_launches", {}, ["GET", "/launches", null]],
  ["schedule_launch", { versionLabel: "2.0", scheduledFor: "2026-12-01T09:00:00Z" }, ["POST", "/launches", { versionLabel: "2.0", scheduledFor: "2026-12-01T09:00:00Z" }]],
  ["reschedule_launch", { launchId: "lch_1", scheduledFor: "2026-12-02T09:00:00Z" }, ["PATCH", "/launches/lch_1", { scheduledFor: "2026-12-02T09:00:00Z" }]],
  ["cancel_launch", { launchId: "lch_1" }, ["DELETE", "/launches/lch_1", null]],
  ["get_needs_you", {}, ["GET", "/needs-you", null]],
];

describe("MC5 — each tool is the website's own request", () => {
  it.each(CASES)("%s %j", async (name, args, expected) => {
    const seen: Seen[] = [];
    const result = await call(name, { slug: "one", ...args }, seen);
    expect(result.isError).toBeFalsy();
    expect(crew(seen)).toEqual([expected]);
  });
});

describe("MC5 — refusals before any request", () => {
  it("names the post kinds and their blocks", async () => {
    const result = await call("describe_post_kinds", {}, []);
    expect(result.structuredContent.kinds.map((k: { kind: string }) => k.kind)).toEqual([...AUTHORED_PRODUCT_POST_KINDS]);
  });

  it.each([
    ["create_post", { kind: "demo", blocks: BLOCKS }],
    ["create_post", { kind: "idea", blocks: "not a list" }],
    ["update_post", { postId: "nope", blocks: BLOCKS }],
    ["create_milestone", {}],
    ["update_milestone", { milestoneId: "pms_1" }],
    ["ship_milestone", { milestoneId: "pms_1" }],
    ["reorder_milestones", { order: "pms_1" }],
  ])("%s %j", async (name, args) => {
    const seen: Seen[] = [];
    expect((await call(name as string, { slug: "one", ...(args as object) }, seen)).isError).toBe(true);
    expect(crew(seen)).toEqual([]);
  });
});
