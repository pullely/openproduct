// The contributor's tools, over the wire (openproduct-mcp MC7).
//
// One table: each tool call and the exact request the website's own control
// sends — route, method, body. And what each refuses before asking core.

import { route } from "@openproduct-gateway/router";
import { resetAgentCache, resetSubjectCache } from "@openproduct-gateway/subject";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import type { Env } from "@openproduct-gateway/env";

const API = "https://api.openproduct.test";
const POSTS = "opa_test_fixture_everyone_token_not_real_1";

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
        const base = { subjectId: "usr_0123456789abcdef0123456789abcdef", kind: "oauth", clientName: "Claude", scopes: ["read", "listings", "media", "posts", "crew", "community", "profile"] };
        return ok({ credential: body.token === POSTS ? { ...base, credentialId: "agc_crew", listingIds: null } : null });
      }
      if (url.pathname === "/internal/openproduct/me/listings") return ok({ listings: [{ id: "opp_one", orgId: "org_a", slug: "one" }] });
      return ok({ ok: true });
    },
    connect: () => {
      throw new Error("not used");
    },
  } as unknown as Fetcher;
}

async function call(name: string, args: Record<string, unknown>, seen: Seen[], token = POSTS): Promise<any> {
  const e = { ENVIRONMENT: "test", CORE: core(seen), PUBLIC_API_ORIGIN: API } as Env;
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

const crew = (seen: Seen[]) =>
  seen
    .filter((s) => !["/internal/openproduct/agent-credentials/resolve", "/internal/openproduct/me/listings"].includes(s.path))
    .map((s) => [s.method, s.path, s.body]);

beforeEach(() => {
  resetAgentCache();
  resetSubjectCache();
  resetBuckets();
});

const PP = "ppo_0123456789abcdef0123456789abcdef";
const POST = "0b8f8a47-62a1-4d6c-9e4f-6f0b8f8a4762";

const CASES: Array<[string, Record<string, unknown>, [string, string, unknown]]> = [
  ["comment", { slug: "one", body: "Lovely." }, ["POST", "/internal/openproduct/comments", { slug: "one", body: "Lovely." }]],
  ["create_thread", { slug: "one", title: "Why?", body: "Because.", kind: "question" }, ["POST", "/internal/openproduct/threads", { slug: "one", title: "Why?", body: "Because.", kind: "question" }]],
  ["reply", { threadId: "thr_1", body: "Yes." }, ["POST", "/internal/openproduct/threads/thr_1/posts", { body: "Yes." }]],
  ["vote", { postId: POST, on: true }, ["PUT", `/internal/openproduct/posts/${POST}/vote`, {}]],
  ["vote", { postId: POST, on: false }, ["DELETE", `/internal/openproduct/posts/${POST}/vote`, null]],
  ["react", { postId: PP, reaction: "useful", on: true }, ["PUT", `/internal/openproduct/me/product-post-reactions/${PP}`, { reaction: "useful" }]],
  ["follow", { kind: "topic", value: "dev-tools", on: true }, ["PUT", "/internal/openproduct/me/follows/topic/dev-tools", {}]],
  ["follow", { kind: "person", value: "@ada", on: false }, ["DELETE", "/internal/openproduct/me/follows/person/ada", null]],
  ["save", { slug: "one", on: true }, ["PUT", "/internal/openproduct/me/saved", { slug: "one" }]],
  ["save", { slug: "one", on: false }, ["DELETE", "/internal/openproduct/me/saved/one", null]],
  ["endorse", { slug: "one", on: true }, ["PUT", "/internal/openproduct/me/endorsements/one", {}]],
  ["report", { subjectKind: "listing", subjectRef: "one", reason: "spam" }, ["POST", "/internal/openproduct/reports", { subjectKind: "listing", subjectRef: "one", reason: "spam" }]],
  ["create_collection", { slug: "picks", title: "Picks" }, ["POST", "/internal/openproduct/me/collections", { slug: "picks", title: "Picks" }]],
  ["edit_collection", { collectionId: "col_1", action: "add", slug: "one" }, ["POST", "/internal/openproduct/me/collections/add", { collectionId: "col_1", slug: "one" }]],
  ["set_collection_state", { collectionId: "col_1", state: "published" }, ["POST", "/internal/openproduct/me/collections/state", { collectionId: "col_1", state: "published" }]],
  ["list_saved", {}, ["GET", "/internal/openproduct/me/saved", null]],
  ["list_following", {}, ["GET", "/internal/openproduct/me/following", null]],
  ["list_my_collections", {}, ["GET", "/internal/openproduct/me/collections", null]],
  ["list_my_applications", {}, ["GET", "/internal/openproduct/me/applications", null]],
  ["list_notifications", {}, ["GET", "/internal/openproduct/me/notifications", null]],
  ["mark_notifications_read", {}, ["PUT", "/internal/openproduct/me/notifications", {}]],
  ["get_digest_subscription", {}, ["GET", "/internal/openproduct/me/digest", null]],
  ["list_roster_invitations", {}, ["GET", "/internal/openproduct/me/roster", null]],
  ["list_my_appeals", {}, ["GET", "/internal/openproduct/me/appeals", null]],
  ["update_my_profile", { displayName: "Ada" }, ["PUT", "/internal/openproduct/me", { displayName: "Ada" }]],
  ["claim_handle", { handle: "ada" }, ["PUT", "/internal/openproduct/me/handle", { handle: "ada" }]],
  ["set_profile_visibility", { public: true }, ["PUT", "/internal/openproduct/me/profile-visibility", { public: true }]],
  ["set_digest_subscription", { subscribed: false }, ["PUT", "/internal/openproduct/me/digest", { subscribed: false }]],
  ["answer_roster", { listing: "one", answer: "confirm" }, ["POST", "/internal/openproduct/me/roster/one/confirm", {}]],
  ["list_open_roles", { slug: "one" }, ["GET", "/internal/public/openproduct/projects/one", null]],
];

describe("MC7 — each tool is the website's own request", () => {
  it.each(CASES)("%s %j", async (name, args, expected) => {
    const seen: Seen[] = [];
    const result = await call(name, args, seen);
    expect(result.isError).toBeFalsy();
    expect(crew(seen)).toEqual([expected]);
  });
});

describe("MC7 — refusals before any request", () => {
  it.each([
    ["vote", { postId: POST }],
    ["vote", { postId: "pst_1", on: true }],
    ["follow", { kind: "Topic!", value: "x", on: true }],
    ["edit_collection", { collectionId: "c", action: "delete" }],
    ["answer_roster", { listing: "one", answer: "maybe" }],
    ["update_my_profile", {}],
    ["set_profile_visibility", { public: "yes" }],
  ])("%s %j", async (name, args) => {
    const seen: Seen[] = [];
    expect((await call(name as string, args as Record<string, unknown>, seen)).isError).toBe(true);
    expect(crew(seen)).toEqual([]);
  });
});
