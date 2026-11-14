// Product posts: the readers, the reader's own writes, and the crew's client
// (openproduct-redesign OPR-3).
//
// What is pinned here is each call's FAILURE SHAPE, because the pages react
// to the difference:
//
//   a public read      `null` is "could not be read", an empty page is "nobody
//                      has posted" — never the same answer (the OD5 finding)
//   a signed-in write  `unauthorized` bounces through sign-in, `refused` is an
//                      answer with a status (409: your own post), `unavailable`
//                      is an outage
//   a crew call        the same four, with core's field errors carried verbatim
//
// and the two structural rules: a public read carries no credential, and a
// crew route's ids come from core's own crew check, never from a caller.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCT_POST_API } from "@openproduct/contracts";

import {
  createCrewMilestone,
  createCrewPost,
  deleteCrewMilestone,
  fetchNeedsYou,
  listCrewMilestones,
  listCrewPosts,
  publishCrewPost,
  removeCrewPost,
  reorderCrewMilestones,
  resolveCrew,
  setCrewMilestoneShipped,
  updateCrewMilestone,
  updateCrewPost,
  updateCrewProfile,
} from "@openproduct-web/app/posts/crew-api";
import {
  clearReaction,
  fetchFeedPage,
  fetchFollowing,
  fetchProductPost,
  fetchProductPosts,
  isDrawablePost,
  setReaction,
} from "@openproduct-web/app/posts/posts-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  init: RequestInit | undefined;
}

function recordingFetch(answer: (call: Call) => { status?: number; body: unknown } | "throw") {
  const calls: Call[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const call: Call = {
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
      init,
    };
    calls.push(call);
    const said = answer(call);
    if (said === "throw") throw new Error("network");
    return new Response(said.body === undefined ? null : JSON.stringify(said.body), {
      status: said.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const PPO = `ppo_${"0".repeat(31)}1`;
const PMS = `pms_${"0".repeat(31)}1`;

const post = (over: Record<string, unknown> = {}) => ({
  id: PPO,
  kind: "feature",
  product: { slug: "ackstack", name: "ackstack", stage: "shipping", logo: null },
  author: { handle: "ada", displayName: "Ada" },
  blocks: [{ block: "feature", value: "Exports" }],
  publishedAt: "2026-05-30T10:00:00.000Z",
  reactions: { useful: 1, would_use: 0, impressive: 0, curious: 0 },
  commentCount: 0,
  threadId: null,
  ...over,
});

const pathOf = (call: Call) => {
  const url = new URL(call.url);
  return url.pathname + url.search;
};

describe("the public reads", () => {
  it("ask the contract's addresses, anonymously, with the 60s revalidate", async () => {
    const f = recordingFetch(() => ({ body: { data: { posts: [post()], next: "abc" } } }));
    await fetchFeedPage(null, f.fetchImpl);
    await fetchFeedPage("abc", f.fetchImpl);
    await fetchProductPosts("ackstack", null, f.fetchImpl);
    await fetchProductPost(PPO, f.fetchImpl);
    expect(f.calls.map(pathOf)).toEqual([
      PRODUCT_POST_API.feed(),
      PRODUCT_POST_API.feed("abc"),
      PRODUCT_POST_API.ofProduct("ackstack"),
      PRODUCT_POST_API.post(PPO),
    ]);
    for (const call of f.calls) {
      // The closed header set of every public read: no credential can ride.
      expect(call.headers).toEqual({ accept: "application/json" });
      expect(call.init?.credentials).toBe("omit");
      expect((call.init as { next?: { revalidate?: number } }).next).toEqual({ revalidate: 60 });
    }
    // And there is no token parameter to pass by accident: they go through
    // the one anonymous read.
    const src = code("posts/posts-api.ts");
    expect(src).toContain("readPublic<");
    expect(src.match(/export async function fetch(FeedPage|ProductPosts|ProductPost)\([^)]*token/g)).toBeNull();
  });

  it("tell an EMPTY feed from one that could not be read", async () => {
    const empty = recordingFetch(() => ({ body: { data: { posts: [], next: null } } }));
    expect(await fetchFeedPage(null, empty.fetchImpl)).toEqual({ posts: [], next: null });
    expect(await fetchProductPosts("ackstack", null, empty.fetchImpl)).toEqual({ posts: [], next: null });

    for (const failing of [
      recordingFetch(() => ({ status: 500, body: { error: {} } })),
      recordingFetch(() => ({ status: 404, body: { error: {} } })),
      // A cursor the API did not issue.
      recordingFetch(() => ({ status: 422, body: { error: {} } })),
      recordingFetch(() => "throw"),
      // An envelope that is not a page.
      recordingFetch(() => ({ body: { data: { next: null } } })),
      recordingFetch(() => ({ body: {} })),
    ]) {
      expect(await fetchFeedPage(null, failing.fetchImpl)).toBeNull();
      expect(await fetchProductPosts("ackstack", null, failing.fetchImpl)).toBeNull();
    }
  });

  it("hand on a cursor only when there is one, and only posts a card can draw", async () => {
    const f = recordingFetch(() => ({
      body: { data: { posts: [post(), { id: "x" }, null, post({ kind: "announcement" }), post({ id: `ppo_${"0".repeat(31)}2` })], next: "" } },
    }));
    const page = await fetchFeedPage(null, f.fetchImpl);
    expect(page?.posts.map((p) => p.id)).toEqual([PPO, `ppo_${"0".repeat(31)}2`]);
    expect(page?.next).toBeNull();
    expect(isDrawablePost(post())).toBe(true);
    expect(isDrawablePost(post({ blocks: "none" }))).toBe(false);
    expect(isDrawablePost(post({ product: null }))).toBe(false);
  });

  it("answer null for one post that is not there, not readable, or not a post id", async () => {
    const ok = recordingFetch(() => ({ body: { data: { post: post() } } }));
    expect((await fetchProductPost(PPO, ok.fetchImpl))?.id).toBe(PPO);
    for (const failing of [
      recordingFetch(() => ({ status: 404, body: {} })),
      recordingFetch(() => ({ status: 503, body: {} })),
      recordingFetch(() => "throw"),
      recordingFetch(() => ({ body: { data: { post: { id: PPO } } } })),
    ]) {
      expect(await fetchProductPost(PPO, failing.fetchImpl)).toBeNull();
    }
    // An id that is not a post id never reaches the network.
    const never = recordingFetch(() => ({ body: { data: { post: post() } } }));
    expect(await fetchProductPost("../../me", never.fetchImpl)).toBeNull();
    expect(await fetchProductPost("thr_000000000000000000000001", never.fetchImpl)).toBeNull();
    expect(never.calls).toEqual([]);
  });
});

describe("my reaction, and what I follow", () => {
  it("sets with PUT {reaction} and clears with DELETE, with the bearer, uncached", async () => {
    const f = recordingFetch(() => ({
      body: { data: { reaction: { postId: PPO, reaction: "useful", reactions: { useful: 2, would_use: 0, impressive: 0, curious: 0 } } } },
    }));
    const set = await setReaction("tok", PPO, "useful", f.fetchImpl);
    await clearReaction("tok", PPO, f.fetchImpl);
    expect(set.kind).toBe("ok");
    expect(f.calls.map((c) => [c.method, pathOf(c), c.body])).toEqual([
      ["PUT", PRODUCT_POST_API.reaction(PPO), JSON.stringify({ reaction: "useful" })],
      ["DELETE", PRODUCT_POST_API.reaction(PPO), undefined],
    ]);
    expect(f.calls[0]!.headers).toEqual({
      accept: "application/json",
      authorization: "Bearer tok",
      "content-type": "application/json",
    });
    expect(f.calls[1]!.headers).toEqual({ accept: "application/json", authorization: "Bearer tok" });
    for (const call of f.calls) expect(call.init?.cache).toBe("no-store");
  });

  it("tells a dead token, your own post, and an outage apart", async () => {
    const dead = recordingFetch(() => ({ status: 401, body: {} }));
    expect(await setReaction("tok", PPO, "useful", dead.fetchImpl)).toEqual({ kind: "unauthorized" });

    const own = recordingFetch(() => ({ status: 409, body: { error: { message: "You cannot react to your own post" } } }));
    expect(await setReaction("tok", PPO, "useful", own.fetchImpl)).toEqual({
      kind: "refused",
      status: 409,
      message: "You cannot react to your own post",
      fields: {},
    });

    const gone = recordingFetch(() => ({ status: 404, body: {} }));
    expect((await clearReaction("tok", PPO, gone.fetchImpl)).kind).toBe("refused");

    for (const down of [recordingFetch(() => ({ status: 502, body: {} })), recordingFetch(() => "throw"), recordingFetch(() => ({ body: {} }))]) {
      expect(await setReaction("tok", PPO, "useful", down.fetchImpl)).toEqual({ kind: "unavailable" });
    }
  });

  it("reads Following as signed-out, unavailable, or two lists", async () => {
    const ok = recordingFetch(() => ({
      body: { data: { following: { products: [{ slug: "a", name: "a", stage: "idea", tagline: null, logo: null }], people: [] } } },
    }));
    const read = await fetchFollowing("tok", ok.fetchImpl);
    expect(pathOf(ok.calls[0]!)).toBe(PRODUCT_POST_API.following());
    expect(ok.calls[0]!.init?.cache).toBe("no-store");
    expect(read).toEqual({
      kind: "ok",
      data: { following: { products: [{ slug: "a", name: "a", stage: "idea", tagline: null, logo: null }], people: [] } },
    });
    // A list that is not a list is an empty one, never `undefined` to a page.
    const odd = recordingFetch(() => ({ body: { data: { following: { products: "none" } } } }));
    expect(await fetchFollowing("tok", odd.fetchImpl)).toEqual({ kind: "ok", data: { following: { products: [], people: [] } } });

    expect(await fetchFollowing("tok", recordingFetch(() => ({ status: 401, body: {} })).fetchImpl)).toEqual({ kind: "unauthorized" });
    for (const down of [recordingFetch(() => ({ status: 500, body: {} })), recordingFetch(() => ({ status: 404, body: {} })), recordingFetch(() => "throw")]) {
      expect(await fetchFollowing("tok", down.fetchImpl)).toEqual({ kind: "unavailable" });
    }
  });
});

describe("the crew's client", () => {
  const ids = { org: "org_1", profile: "opp_1" };

  it("has a call for every crew route, at the contract's address with its method", async () => {
    const f = recordingFetch(() => ({ body: { data: { ok: true } } }));
    await listCrewPosts("tok", ids, f.fetchImpl);
    await createCrewPost("tok", ids, { kind: "feature" }, f.fetchImpl);
    await updateCrewPost("tok", ids, PPO, [{ block: "feature", value: "x" }], f.fetchImpl);
    await publishCrewPost("tok", ids, PPO, { milestoneId: PMS }, f.fetchImpl);
    await removeCrewPost("tok", ids, PPO, f.fetchImpl);
    await listCrewMilestones("tok", ids, f.fetchImpl);
    await createCrewMilestone("tok", ids, { code: "AS1", title: "First" }, f.fetchImpl);
    await updateCrewMilestone("tok", ids, PMS, { title: "Renamed" }, f.fetchImpl);
    await reorderCrewMilestones("tok", ids, [PMS], f.fetchImpl);
    await deleteCrewMilestone("tok", ids, PMS, f.fetchImpl);
    await setCrewMilestoneShipped("tok", ids, PMS, true, f.fetchImpl);
    await setCrewMilestoneShipped("tok", ids, PMS, false, f.fetchImpl);
    await fetchNeedsYou("tok", ids, f.fetchImpl);
    await updateCrewProfile("tok", ids, { tryUrl: "https://example.com" }, f.fetchImpl);

    const A = PRODUCT_POST_API;
    expect(f.calls.map((c) => [c.method, pathOf(c)])).toEqual([
      ["GET", A.crewPosts("org_1", "opp_1")],
      ["POST", A.crewPosts("org_1", "opp_1")],
      ["PATCH", A.crewPost("org_1", "opp_1", PPO)],
      ["POST", A.crewPublish("org_1", "opp_1", PPO)],
      ["DELETE", A.crewPost("org_1", "opp_1", PPO)],
      ["GET", A.crewMilestones("org_1", "opp_1")],
      ["POST", A.crewMilestones("org_1", "opp_1")],
      ["PATCH", A.crewMilestone("org_1", "opp_1", PMS)],
      ["PUT", A.crewMilestones("org_1", "opp_1")],
      ["DELETE", A.crewMilestone("org_1", "opp_1", PMS)],
      ["PUT", A.crewMilestoneShipped("org_1", "opp_1", PMS)],
      ["DELETE", A.crewMilestoneShipped("org_1", "opp_1", PMS)],
      ["GET", A.crewNeedsYou("org_1", "opp_1")],
      ["PATCH", "/v1/organizations/org_1/openproduct/profiles/opp_1"],
    ]);
    // The bodies that carry something.
    expect(JSON.parse(f.calls[1]!.body!)).toEqual({ kind: "feature", blocks: [] });
    expect(JSON.parse(f.calls[2]!.body!)).toEqual({ blocks: [{ block: "feature", value: "x" }] });
    expect(JSON.parse(f.calls[3]!.body!)).toEqual({ milestoneId: PMS });
    expect(JSON.parse(f.calls[8]!.body!)).toEqual({ order: [PMS] });
    expect(JSON.parse(f.calls[13]!.body!)).toEqual({ tryUrl: "https://example.com" });
    // Every one carries the bearer and is never cached.
    for (const call of f.calls) {
      expect(call.headers.authorization).toBe("Bearer tok");
      expect(call.init?.cache).toBe("no-store");
    }
  });

  it("carries core's refusal verbatim: the status, the code, the field errors", async () => {
    const invalid = recordingFetch(() => ({
      status: 422,
      body: { error: { code: "validation_failed", message: "Invalid", details: { fields: { "blocks.try": ["Try it must be an http(s) address"] } } } },
    }));
    expect(await publishCrewPost("tok", ids, PPO, {}, invalid.fetchImpl)).toEqual({
      kind: "refused",
      status: 422,
      code: "validation_failed",
      message: "Invalid",
      fields: { "blocks.try": ["Try it must be an http(s) address"] },
    });
    // 404 is core's answer to "not on the crew" and "not there" alike.
    const hidden = recordingFetch(() => ({ status: 404, body: { error: { code: "not_found", message: "Not found" } } }));
    expect(await listCrewPosts("tok", ids, hidden.fetchImpl)).toEqual({
      kind: "refused",
      status: 404,
      code: "not_found",
      message: "Not found",
      fields: {},
    });
    expect(await listCrewPosts("tok", ids, recordingFetch(() => ({ status: 401, body: {} })).fetchImpl)).toEqual({ kind: "unauthorized" });
    for (const down of [recordingFetch(() => ({ status: 500, body: {} })), recordingFetch(() => "throw"), recordingFetch(() => ({ body: {} }))]) {
      expect(await listCrewPosts("tok", ids, down.fetchImpl)).toEqual({ kind: "unavailable" });
    }
  });

  it("does not reach into the studio for its client", () => {
    // Nothing outside `studio/` imports from `studio/`.
    for (const file of ["posts/crew-api.ts", "posts/posts-api.ts", "posts/crew-handler.ts", "posts/crew-route.ts"]) {
      expect([file, /from ["'][^"']*studio\//.test(code(file))]).toEqual([file, false]);
    }
  });
});

describe("who is on the crew is asked of core, with the caller's token", () => {
  const overlay = (crew: unknown) => ({ body: { data: { overlay: { crew } } } });

  it("asks the overlay about exactly this slug and returns its ids", async () => {
    const f = recordingFetch(() => overlay([{ slug: "ackstack", org: "org_9", profile: "opp_9" }]));
    expect(await resolveCrew("tok", "ackstack", f.fetchImpl)).toEqual({
      kind: "ok",
      crew: { slug: "ackstack", org: "org_9", profile: "opp_9" },
    });
    expect(pathOf(f.calls[0]!)).toBe("/v1/openproduct/me/overlay?ids=ackstack");
    expect(f.calls[0]!.headers.authorization).toBe("Bearer tok");
  });

  it("says not-crew for anybody else, and never borrows another product's ids", async () => {
    for (const crew of [[], undefined, "yes", [{ slug: "other", org: "org_9", profile: "opp_9" }], [{ slug: "ackstack", org: 7 }], [null]]) {
      const f = recordingFetch(() => overlay(crew));
      expect(await resolveCrew("tok", "ackstack", f.fetchImpl)).toEqual({ kind: "not-crew" });
    }
  });

  it("keeps a dead token and an outage apart from not-crew", async () => {
    expect(await resolveCrew("tok", "ackstack", recordingFetch(() => ({ status: 401, body: {} })).fetchImpl)).toEqual({ kind: "unauthorized" });
    expect(await resolveCrew("tok", "ackstack", recordingFetch(() => ({ status: 500, body: {} })).fetchImpl)).toEqual({ kind: "unavailable" });
    expect(await resolveCrew("tok", "ackstack", recordingFetch(() => "throw").fetchImpl)).toEqual({ kind: "unavailable" });
  });
});
