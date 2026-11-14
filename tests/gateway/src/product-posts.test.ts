// Product posts at the gateway (openproduct-redesign OPR-3).
//
// Three things this layer owes the feature, and each is pinned here:
//
//   1. The three reads are PUBLIC: no bearer travels, the answer is cacheable
//      for sixty seconds, and it carries the tag a write will purge.
//   2. A reaction is a bounded write, per post, under the action an upvote on
//      a comment uses — and never anonymous.
//   3. A write that changed a public document purges that document's family,
//      and a write that changed none purges nothing.

import { classifyWrite, internalPath, isAuthenticatedRoute, route } from "@openproduct-gateway/router";
import type { Env } from "@openproduct-gateway/env";
import { resetSubjectCache } from "@openproduct-gateway/subject";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import { resetVelocity } from "@openproduct-gateway/velocity";
import { ALL_TAGS, TAG_LISTING, TAG_POSTS, publicCacheTags, purgeTagsForWrite } from "@openproduct-gateway/tags";
import { DEFAULT_VELOCITY_RULES, PRODUCT_POST_API } from "@openproduct/contracts";

const POST = "ppo_0d5e1f2a111142228333444455556666";
const MILESTONE = "pms_1d5e1f2a111142228333444455556666";
const ORG = "org_11111111111141118111111111111111";
const PROFILE = "opp_55555555555545558555555555555555";
const SUBJECT = "usr_0123456789abcdef0123456789abcdef";

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function coreStub(respond: () => Response, captured: Captured[] = []): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? {});
      captured.push({
        url: String(input instanceof Request ? input.url : input),
        method: init?.method ?? "GET",
        headers: Object.fromEntries([...headers.entries()]),
      });
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

beforeEach(() => {
  resetVelocity();
  resetBuckets();
  resetSubjectCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  resetSubjectCache();
});

function signed(path: string, method: string, body?: unknown, token = "tok"): Request {
  return new Request(`https://gw.test${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("the three reads are public: anonymous, cacheable, tagged", () => {
  const reads: Array<[string, string, string]> = [
    [PRODUCT_POST_API.feed(), "/internal/public/openproduct/product-posts", "op-public,op-posts"],
    [PRODUCT_POST_API.post(POST), `/internal/public/openproduct/product-posts/${POST}`, "op-public,op-posts"],
    [
      PRODUCT_POST_API.ofProduct("acme-thing"),
      "/internal/public/openproduct/projects/acme-thing/product-posts",
      "op-public,op-posts,op-listing",
    ],
  ];

  it.each(reads)("%s maps to core's %s", async (path, target, tags) => {
    const captured: Captured[] = [];
    const core = coreStub(() => Response.json({ data: { posts: [], next: null } }), captured);
    const res = await route(
      new Request(`https://gw.test${path}`, { headers: { authorization: "Bearer should-not-travel", cookie: "sid=1" } }),
      envWith(core),
    );
    expect(res.status).toBe(200);
    expect(new URL(captured[0]!.url).pathname).toBe(target);
    // A bearer arrives and dies here: the read is the same for everybody.
    expect(Object.keys(captured[0]!.headers).sort()).toEqual(["x-request-id"]);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(res.headers.get("cache-tag")).toBe(tags);
  });

  it("carries the cursor and the limit to core, which is where a cursor is judged", async () => {
    const captured: Captured[] = [];
    const core = coreStub(() => Response.json({ data: {} }), captured);
    await route(new Request(`https://gw.test${PRODUCT_POST_API.feed("abc123")}&limit=5`), envWith(core));
    await route(new Request(`https://gw.test${PRODUCT_POST_API.ofProduct("acme-thing", "abc123")}`), envWith(core));
    expect(captured.map((c) => new URL(c.url).search)).toEqual(["?cursor=abc123&limit=5", "?cursor=abc123"]);
  });

  it("an id or a slug that could never be one does not reach core", async () => {
    for (const path of [
      "/v1/public/openproduct/product-posts/nope",
      "/v1/public/openproduct/product-posts/0d5e1f2a-1111-4222-8333-444455556666",
      `/v1/public/openproduct/product-posts/${POST}/extra`,
      "/v1/public/openproduct/projects/not_a_slug/product-posts",
    ]) {
      const captured: Captured[] = [];
      const res = await route(new Request(`https://gw.test${path}`), envWith(coreStub(() => Response.json({}), captured)));
      expect([path, res.status, captured.length]).toEqual([path, 404, 0]);
    }
  });

  it("refuses a write to any of them, and never passes core's failure body through", async () => {
    const core = coreStub(() => Response.json({ error: { message: "Route not found: /internal/…" } }, { status: 404 }));
    const post = await route(new Request(`https://gw.test${PRODUCT_POST_API.feed()}`, { method: "POST" }), envWith(core));
    expect(post.status).toBe(405);
    const missing = await route(new Request(`https://gw.test${PRODUCT_POST_API.post(POST)}`), envWith(core));
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain("/internal/");
    expect(missing.headers.get("cache-control")).toBe("no-store");
  });

  it("the two families are in the vocabulary, and only the product's own list is also the listing's", () => {
    expect(ALL_TAGS).toContain(TAG_POSTS);
    expect(publicCacheTags(PRODUCT_POST_API.feed())).toEqual(["op-public", TAG_POSTS]);
    expect(publicCacheTags(PRODUCT_POST_API.ofProduct("acme-thing"))).toEqual(["op-public", TAG_POSTS, TAG_LISTING]);
  });
});

describe("a reaction is a signed, bounded write — per post", () => {
  const path = PRODUCT_POST_API.reaction(POST);

  it("is never anonymous: no bearer, no core call", async () => {
    const captured: Captured[] = [];
    const res = await route(
      new Request(`https://gw.test${path}`, { method: "PUT", body: JSON.stringify({ reaction: "useful" }) }),
      envWith(coreStub(() => Response.json({}), captured)),
    );
    expect(res.status).toBe(401);
    expect(captured).toEqual([]);
  });

  it("forwards to core with a RESOLVED subject, and is never cacheable", async () => {
    stubIdentity(SUBJECT);
    const captured: Captured[] = [];
    const core = coreStub(() => Response.json({ data: { reaction: {} } }), captured);
    const res = await route(signed(path, "PUT", { reaction: "useful" }), envWith(core));
    expect(res.status).toBe(200);
    expect(new URL(captured[0]!.url).pathname).toBe(`/internal/openproduct/me/product-post-reactions/${POST}`);
    expect(captured[0]!.headers["x-actor-subject-id"]).toBe(SUBJECT);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("cache-tag")).toBeNull();
  });

  it("is classified as the act an upvote on a comment is, with the post as its target", () => {
    expect(classifyWrite(path, "PUT")).toEqual({ action: "endorse", target: POST });
    expect(classifyWrite(path, "DELETE")).toEqual({ action: "endorse", target: POST });
    expect(classifyWrite(path, "GET")).toBeNull();
    // The same act and the same bound as DQ1's.
    expect(classifyWrite("/v1/openproduct/posts/0d5e1f2a-1111-2222-3333-444455556666/vote", "PUT")?.action).toBe("endorse");
  });

  it("a flood from one person on one post is refused here and stops reaching core", async () => {
    stubIdentity(SUBJECT);
    const rule = DEFAULT_VELOCITY_RULES.find((r) => r.action === "endorse" && r.dimension === "subject")!;
    const captured: Captured[] = [];
    const core = coreStub(() => Response.json({ data: {} }), captured);
    let refused = 0;
    for (let i = 0; i < rule.burst.limit + 3; i += 1) {
      const res = await route(signed(path, "PUT", { reaction: "useful" }), envWith(core));
      if (res.status === 429) refused += 1;
    }
    expect(refused).toBe(3);
    expect(captured).toHaveLength(rule.burst.limit);
  });
});

describe("the signed-in and crew routes are on the authenticated plane", () => {
  const crew = `/v1/organizations/${ORG}/openproduct/profiles/${PROFILE}`;
  const paths: Array<[string, string]> = [
    [PRODUCT_POST_API.following(), "/internal/openproduct/me/following"],
    [PRODUCT_POST_API.crewPosts(ORG, PROFILE), `/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/product-posts`],
    [PRODUCT_POST_API.crewPost(ORG, PROFILE, POST), `/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/product-posts/${POST}`],
    [
      PRODUCT_POST_API.crewPublish(ORG, PROFILE, POST),
      `/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/product-posts/${POST}/publish`,
    ],
    [PRODUCT_POST_API.crewMilestones(ORG, PROFILE), `/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/milestones`],
    [
      PRODUCT_POST_API.crewMilestone(ORG, PROFILE, MILESTONE),
      `/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/milestones/${MILESTONE}`,
    ],
    [
      PRODUCT_POST_API.crewMilestoneShipped(ORG, PROFILE, MILESTONE),
      `/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/milestones/${MILESTONE}/shipped`,
    ],
    [PRODUCT_POST_API.crewNeedsYou(ORG, PROFILE), `/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}/needs-you`],
  ];

  it.each(paths)("%s is dispatched, mapped to %s, and asks for a bearer", async (path, target) => {
    expect(isAuthenticatedRoute(path)).toBe(true);
    expect(internalPath(path)).toBe(target);
    const res = await route(new Request(`https://gw.test${path}`), envWith(coreStub(() => Response.json({}))));
    expect(res.status).toBe(401);
  });

  it("a signed-in read of them is never cacheable — drafts and my follows are not public documents", async () => {
    stubIdentity(SUBJECT);
    for (const path of [PRODUCT_POST_API.following(), PRODUCT_POST_API.crewPosts(ORG, PROFILE), PRODUCT_POST_API.crewNeedsYou(ORG, PROFILE)]) {
      resetSubjectCache();
      const res = await route(signed(path, "GET"), envWith(coreStub(() => Response.json({ data: {} }))));
      expect([path, res.status, res.headers.get("cache-control"), res.headers.get("cache-tag")]).toEqual([path, 200, "no-store", null]);
    }
  });

  it("every crew write is a listing write to the velocity rules — bounded per person", () => {
    for (const [path, method] of [
      [`${crew}/product-posts`, "POST"],
      [`${crew}/product-posts/${POST}`, "PATCH"],
      [`${crew}/product-posts/${POST}`, "DELETE"],
      [`${crew}/product-posts/${POST}/publish`, "POST"],
      [`${crew}/milestones`, "POST"],
      [`${crew}/milestones`, "PUT"],
      [`${crew}/milestones/${MILESTONE}`, "PATCH"],
      [`${crew}/milestones/${MILESTONE}/shipped`, "PUT"],
    ] as const) {
      expect([path, method, classifyWrite(path, method)]).toEqual([path, method, { action: "listing-write", target: null }]);
    }
    // Publishing a POST is not publishing the LISTING.
    expect(classifyWrite(`${crew}/publish`, "POST")?.action).toBe("listing-publish");
  });
});

describe("a write purges the public documents it changed, and no others", () => {
  const crew = `/v1/organizations/${ORG}/openproduct/profiles/${PROFILE}`;

  it("a reaction purges the posts family; an upvote on a product still purges nothing", () => {
    expect(purgeTagsForWrite(PRODUCT_POST_API.reaction(POST), "endorse")).toEqual([TAG_POSTS]);
    expect(purgeTagsForWrite("/v1/openproduct/me/endorsements/acme-thing", "endorse")).toEqual([]);
  });

  it("publishing, editing or removing a product post purges the posts family", () => {
    expect(purgeTagsForWrite(`${crew}/product-posts/${POST}/publish`, "listing-write")).toEqual([TAG_POSTS]);
    expect(purgeTagsForWrite(`${crew}/product-posts/${POST}`, "listing-write")).toEqual([TAG_POSTS]);
  });

  it("creating a draft purges nothing — no public read returns it", () => {
    expect(purgeTagsForWrite(`${crew}/product-posts`, "listing-write")).toEqual([]);
  });

  it("a milestone write purges the product page; shipping one purges the feed too, whose cards carry the stage", () => {
    expect(purgeTagsForWrite(`${crew}/milestones`, "listing-write")).toEqual([TAG_LISTING]);
    expect(purgeTagsForWrite(`${crew}/milestones/${MILESTONE}`, "listing-write")).toEqual([TAG_LISTING]);
    expect(purgeTagsForWrite(`${crew}/milestones/${MILESTONE}/shipped`, "listing-write")).toEqual([TAG_LISTING, TAG_POSTS]);
  });

  it("patching the listing — its name, its tagline, its Try it address — purges the product page", () => {
    expect(purgeTagsForWrite(crew, "listing-write")).toEqual([TAG_LISTING]);
  });

  it("the crew writes that change no public document this layer caches purge nothing", () => {
    for (const path of [`${crew}/role-openings`, `${crew}/media`, `${crew}/maintainers`, `${crew}/launches`, `/v1/organizations/${ORG}/openproduct/profiles`]) {
      expect([path, purgeTagsForWrite(path, "listing-write")]).toEqual([path, []]);
    }
  });

  it("every tag a write names is one a public document carries", () => {
    for (const tag of [
      ...purgeTagsForWrite(PRODUCT_POST_API.reaction(POST), "endorse"),
      ...purgeTagsForWrite(`${crew}/milestones/${MILESTONE}/shipped`, "listing-write"),
    ]) {
      expect((ALL_TAGS as readonly string[]).includes(tag)).toBe(true);
    }
    expect(publicCacheTags(PRODUCT_POST_API.feed())).toContain(TAG_POSTS);
    expect(publicCacheTags(PRODUCT_POST_API.post(POST))).toContain(TAG_POSTS);
    expect(publicCacheTags("/v1/public/openproduct/projects/acme-thing")).toContain(TAG_LISTING);
  });

  it("the purge rides the answer: after it, and only when the write landed", async () => {
    stubIdentity(SUBJECT);
    const purged: string[][] = [];
    const scheduled: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => {
        scheduled.push(promise);
      },
      cache: {
        purge: async ({ tags }: { tags: string[] }) => {
          purged.push(tags);
          return { success: true };
        },
      },
    };
    const ok = await route(
      signed(`${crew}/product-posts/${POST}/publish`, "POST", {}),
      envWith(coreStub(() => Response.json({ data: { post: {} } }))),
      { ctx },
    );
    await Promise.all(scheduled);
    expect(ok.status).toBe(200);
    expect(purged).toEqual([[TAG_POSTS]]);

    resetSubjectCache();
    const refused = await route(
      signed(`${crew}/product-posts/${POST}/publish`, "POST", {}, "tok2"),
      envWith(coreStub(() => Response.json({ error: { code: "validation_failed" } }, { status: 422 }))),
      { ctx },
    );
    expect(refused.status).toBe(422);
    expect(purged).toHaveLength(1);
  });
});
