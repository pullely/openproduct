// The fixture gateway's OPR-3 answers (openproduct-redesign OPR-3).
//
// `tests/web-perf/src/fixture.mjs` is the gateway every browser lane and
// `next build` read. A fixture that drifts from the contract is a lane that
// walks pages production never serves, so what it answers is held here to
// the contract's own key sets — and to the rule that matters most: a draft
// is in no public read.

import {
  AUTHORED_PRODUCT_POST_KINDS,
  CREW_MILESTONE_KEYS,
  CREW_NEEDS_YOU_KEYS,
  CREW_PRODUCT_POST_KEYS,
  CREW_SEAT_REQUEST_KEYS,
  FOLLOWED_PRODUCT_KEYS,
  ME_FOLLOWING_KEYS,
  ME_OVERLAY_KEYS,
  ME_OVERLAY_OPENING_ID_RE,
  MILESTONE_COUNTS_KEYS,
  MILESTONE_ID_RE,
  OVERLAY_CREW_KEYS,
  POST_BLOCK_CATALOGUE,
  PRODUCT_POSTS_PAGE_KEYS,
  PRODUCT_POST_API,
  PRODUCT_POST_ID_RE,
  PRODUCT_REF_KEYS,
  PUBLIC_MILESTONE_KEYS,
  PUBLIC_PRODUCT_POST_KEYS,
  PUBLIC_PRODUCT_POST_PRODUCT_KEYS,
  PUBLIC_PROFILE_CARD_KEYS,
  PUBLIC_PROFILE_KEYS,
  PUBLIC_ROLE_OPENING_KEYS,
  SEARCH_PERSON_KEYS,
  isProductStage,
  milestoneCountsOf,
  validatePostBlocks,
  type CrewProductPost,
  type PublicProductPost,
} from "@openproduct/contracts";

import { fetchAuthorPosts, fetchFeedPage, fetchProductPost, fetchProductPosts, isDrawablePost } from "@openproduct-web/app/posts/posts-api";
import { parseOverlay } from "@openproduct-web/app/ui/overlay";

interface Fixture {
  startGateway(): Promise<{ url: string; unmatched: string[]; close(): Promise<void> }>;
  SAMPLE_SLUG: string;
  SAMPLE_IDEA_SLUG: string;
  SAMPLE_POST: string;
  SAMPLE_POSTS: Record<string, string>;
  SAMPLE_REACTED_POST: string;
  SAMPLE_POST_THREAD: string;
  POSTS_PAGE_TWO_CURSOR: string;
  CREW_SLUG: string;
  CREW_ORG: string;
  CREW_PROFILE: string;
  SAMPLE_DRAFT_POST: string;
  SAMPLE_REQUESTED_OPENING: string;
  SAMPLE_OPENING: string;
  SAMPLE_HANDLE: string;
  REQUESTED_SEAT_SLUG: string;
  STUDIO_ORG: string;
  STUDIO_PROFILE: string;
  MOVED: Array<{ from: string; to: string; status: number }>;
}

// A `.mjs` this lane has no types for; the specifier is a value so the
// compiler does not go looking for them.
const FIXTURE_PATH = "../../web-perf/src/fixture.mjs";

let fixture: Fixture;
let gateway: Awaited<ReturnType<Fixture["startGateway"]>>;

beforeAll(async () => {
  fixture = (await import(FIXTURE_PATH)) as Fixture;
  gateway = await fixture.startGateway();
});

afterAll(async () => {
  await gateway.close();
});

const keys = (value: object) => Object.keys(value).sort();

async function get<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const res = await fetch(`${gateway.url}${path}`, init);
  const body = (await res.json().catch(() => null)) as { data?: T } | null;
  return { status: res.status, data: body?.data as T };
}

const sendJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** The website's own readers, pointed at the fixture. */
const viaFixture = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  return fetch(`${gateway.url}${url.pathname}${url.search}`, { method: init?.method ?? "GET", headers: init?.headers ?? {} });
}) as typeof fetch;

describe("the feed", () => {
  it("holds a post of every authored kind, across a shipping product and an idea", async () => {
    const page = (await get<{ posts: PublicProductPost[]; next: string | null }>(PRODUCT_POST_API.feed())).data;
    expect(keys(page)).toEqual([...PRODUCT_POSTS_PAGE_KEYS]);
    expect([...new Set(page.posts.map((p) => p.kind))].sort()).toEqual([...AUTHORED_PRODUCT_POST_KINDS].sort());
    expect([...new Set(page.posts.map((p) => p.product.stage))].sort()).toEqual(["idea", "shipping"]);
    expect(page.posts.find((p) => p.kind === "idea")!.product.slug).toBe(fixture.SAMPLE_IDEA_SLUG);
    expect(page.posts.find((p) => p.kind === "feature")!.product.slug).toBe(fixture.SAMPLE_SLUG);
    // The ids the lanes are told they can rely on are the ones served.
    for (const kind of AUTHORED_PRODUCT_POST_KINDS) {
      expect(page.posts.find((p) => p.kind === kind)!.id).toBe(fixture.SAMPLE_POSTS[kind]);
    }
    // Newest first.
    const times = page.posts.map((p) => Date.parse(p.publishedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("every post is exactly the contract's shape, with blocks its kind's catalogue would publish", async () => {
    const first = (await get<{ posts: PublicProductPost[] }>(PRODUCT_POST_API.feed())).data.posts;
    const second = (await get<{ posts: PublicProductPost[] }>(PRODUCT_POST_API.feed(fixture.POSTS_PAGE_TWO_CURSOR))).data.posts;
    const all = [...first, ...second];
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const post of all) {
      expect([post.id, keys(post)]).toEqual([post.id, [...PUBLIC_PRODUCT_POST_KEYS]]);
      expect(post.id).toMatch(PRODUCT_POST_ID_RE);
      expect(keys(post.product)).toEqual([...PUBLIC_PRODUCT_POST_PRODUCT_KEYS]);
      expect(isProductStage(post.product.stage)).toBe(true);
      // A post in the feed is one core would have published: every required
      // block present, in order, within its limit.
      expect([post.id, validatePostBlocks(post.kind, post.blocks)]).toEqual([post.id, []]);
      expect(isDrawablePost(post)).toBe(true);
      // And nothing here is a draft: the public shape has no `state` at all.
      expect("state" in post).toBe(false);
    }
    // Some counts are zero on purpose, so a lane sees a card with no count.
    expect(all.some((p) => Object.values(p.reactions).every((n) => n === 0) && p.commentCount === 0)).toBe(true);
    expect(all.some((p) => p.commentCount > 0)).toBe(true);
    // One post has nobody to name.
    expect(all.some((p) => p.author === null)).toBe(true);
  });

  it("pages with a cursor, and refuses one it did not issue", async () => {
    const first = (await get<{ next: string | null }>(PRODUCT_POST_API.feed())).data;
    expect(first.next).toBe(fixture.POSTS_PAGE_TWO_CURSOR);
    const last = await get<{ posts: unknown[]; next: string | null }>(PRODUCT_POST_API.feed(first.next));
    expect(last.data.posts.length).toBeGreaterThan(0);
    expect(last.data.next).toBeNull();
    expect((await get(PRODUCT_POST_API.feed("made-up"))).status).toBe(422);
    // The website's reader takes that refusal as "could not be read".
    expect(await fetchFeedPage("made-up", viaFixture)).toBeNull();
    expect((await fetchFeedPage(null, viaFixture))?.posts).toHaveLength(4);
  });

  it("the draft that waits on the crew is in no public read", async () => {
    const draft = fixture.SAMPLE_DRAFT_POST;
    const feed = [
      ...(await get<{ posts: PublicProductPost[] }>(PRODUCT_POST_API.feed())).data.posts,
      ...(await get<{ posts: PublicProductPost[] }>(PRODUCT_POST_API.feed(fixture.POSTS_PAGE_TWO_CURSOR))).data.posts,
    ];
    const ofProduct = (await get<{ posts: PublicProductPost[] }>(PRODUCT_POST_API.ofProduct(fixture.CREW_SLUG))).data.posts;
    expect(feed.map((p) => p.id)).not.toContain(draft);
    expect(ofProduct.map((p) => p.id)).not.toContain(draft);
    expect((await get(PRODUCT_POST_API.post(draft))).status).toBe(404);
    expect(await fetchProductPost(draft, viaFixture)).toBeNull();
  });
});

describe("a product's posts, and one post", () => {
  it("a product's own posts are only its own; a quiet product is an empty page; an unknown one a 404", async () => {
    const own = (await get<{ posts: PublicProductPost[]; next: string | null }>(PRODUCT_POST_API.ofProduct(fixture.SAMPLE_SLUG))).data;
    expect(own.posts.length).toBeGreaterThanOrEqual(3);
    expect(own.posts.every((p) => p.product.slug === fixture.SAMPLE_SLUG)).toBe(true);
    expect((await get<{ posts: unknown[] }>(PRODUCT_POST_API.ofProduct("product-05"))).data.posts).toEqual([]);
    expect((await get(PRODUCT_POST_API.ofProduct("no-such-product"))).status).toBe(404);
    expect(await fetchProductPosts("product-05", null, viaFixture)).toEqual({ posts: [], next: null });
    expect(await fetchProductPosts("no-such-product", null, viaFixture)).toBeNull();
  });

  it("the sample post has a comment thread behind it", async () => {
    const post = (await get<{ post: PublicProductPost }>(PRODUCT_POST_API.post(fixture.SAMPLE_POST))).data.post;
    expect(post.kind).toBe("feature");
    expect(post.threadId).toBe(fixture.SAMPLE_POST_THREAD);
    expect(post.commentCount).toBeGreaterThan(0);
    const thread = (await get<{ thread: { id: string }; posts: unknown[] }>(`/v1/public/openproduct/threads/${post.threadId}`)).data;
    expect(thread.thread.id).toBe(fixture.SAMPLE_POST_THREAD);
    expect(thread.posts.length).toBeGreaterThan(0);
    expect((await get(PRODUCT_POST_API.post(`ppo_${"f".repeat(32)}`))).status).toBe(404);
  });
});

describe("stage and milestones on the product documents and cards", () => {
  it("every card says its stage, and carries every key the contract names", async () => {
    const cards = (await get<{ projects: Array<Record<string, unknown>> }>("/v1/public/openproduct/projects")).data.projects;
    for (const card of cards) {
      // Every contract key is answered. (The fixture's card has long carried
      // one member more than the contract, `indexable`; that predates OPR-3
      // and is not this suite's to change.)
      expect(PUBLIC_PROFILE_CARD_KEYS.filter((key) => !(key in card))).toEqual([]);
      expect(isProductStage(card.stage)).toBe(true);
    }
    expect(new Set(cards.map((c) => c.stage)).size).toBe(2);
  });

  it("a card carries its own progress and crew count, and they are the product document's", async () => {
    const cards = (await get<{ projects: Array<{ slug: string; stage: string; milestoneCounts: { shipped: number; total: number }; crewCount: number }> }>(
      "/v1/public/openproduct/projects",
    )).data.projects;
    const bySlug = new Map(cards.map((card) => [card.slug, card]));
    expect(bySlug.get(fixture.SAMPLE_SLUG)!.milestoneCounts).toEqual({ shipped: 3, total: 4 });
    for (const slug of [fixture.SAMPLE_SLUG, fixture.SAMPLE_IDEA_SLUG, "product-04"]) {
      const card = bySlug.get(slug)!;
      const profile = (await get<{ profile: { milestoneCounts: unknown; maintainers: unknown[] } }>(`/v1/public/openproduct/projects/${slug}`)).data.profile;
      expect(keys(card.milestoneCounts)).toEqual([...MILESTONE_COUNTS_KEYS]);
      // The list and the page cannot disagree: one says the count, the other
      // lists the rows.
      expect([slug, card.milestoneCounts]).toEqual([slug, profile.milestoneCounts]);
      expect([slug, card.crewCount]).toEqual([slug, profile.maintainers.length]);
    }
    // An idea's crew is only its maker, so its card and its page both say it
    // needs a first builder.
    expect(bySlug.get(fixture.SAMPLE_IDEA_SLUG)!.crewCount).toBe(1);
    // A post's product carries the same counts, so a feed card draws its bars.
    const feed = (await get<{ posts: PublicProductPost[] }>(PRODUCT_POST_API.feed())).data.posts;
    for (const post of feed) {
      expect(keys(post.product)).toEqual([...PUBLIC_PRODUCT_POST_PRODUCT_KEYS]);
      expect([post.product.slug, post.product.milestoneCounts]).toEqual([post.product.slug, bySlug.get(post.product.slug)!.milestoneCounts]);
    }
  });

  it("one person's posts are theirs, in the feed's shape, and nobody else's page answers", async () => {
    const page = await fetchAuthorPosts(fixture.SAMPLE_HANDLE, null, viaFixture);
    expect(page).not.toBeNull();
    expect(page!.posts.length).toBeGreaterThan(0);
    for (const post of page!.posts) {
      expect(keys(post)).toEqual([...PUBLIC_PRODUCT_POST_KEYS]);
      expect(post.author?.handle).toBe(fixture.SAMPLE_HANDLE);
    }
    expect(await fetchAuthorPosts("nobody-here", null, viaFixture)).toBeNull();
  });

  it("a shipping product has an address to try and shipped milestones; an idea has neither", async () => {
    const read = async (slug: string) =>
      (await get<{ profile: Record<string, unknown> }>(`/v1/public/openproduct/projects/${slug}`)).data.profile as {
        stage: string;
        tryUrl: string | null;
        milestones: Array<{ shippedAt: string | null }>;
        milestoneCounts: { shipped: number; total: number };
      } & Record<string, unknown>;
    const shipping = await read(fixture.SAMPLE_SLUG);
    expect(shipping.stage).toBe("shipping");
    expect(shipping.tryUrl).toMatch(/^https:\/\//);
    expect(shipping.milestoneCounts).toEqual({ shipped: 3, total: 4 });
    const idea = await read(fixture.SAMPLE_IDEA_SLUG);
    expect(idea.stage).toBe("idea");
    expect(idea.tryUrl).toBeNull();
    expect(idea.milestoneCounts.shipped).toBe(0);
    for (const profile of [shipping, idea, await read("product-04")]) {
      // The counts are the list's own, and the stage follows them.
      expect(profile.milestoneCounts).toEqual(milestoneCountsOf(profile.milestones));
      expect(keys(profile.milestoneCounts)).toEqual([...MILESTONE_COUNTS_KEYS]);
      expect(profile.stage).toBe(profile.milestoneCounts.shipped > 0 ? "shipping" : "idea");
      for (const milestone of profile.milestones) expect(keys(milestone)).toEqual([...PUBLIC_MILESTONE_KEYS]);
      // Every key the contract names is there (optional ones may be absent).
      for (const key of ["stage", "tryUrl", "milestones", "milestoneCounts"]) {
        expect([...PUBLIC_PROFILE_KEYS]).toContain(key);
      }
    }
  });
});

describe("the signed-in lanes", () => {
  it("the overlay answers the three new keys, each bounded by what was asked", async () => {
    const asked = await get<{ overlay: Record<string, unknown> }>(
      `/v1/openproduct/me/overlay?ids=${fixture.CREW_SLUG},${fixture.SAMPLE_IDEA_SLUG}&productPosts=${fixture.SAMPLE_REACTED_POST},${fixture.SAMPLE_POST}&openings=${fixture.SAMPLE_REQUESTED_OPENING}`,
    );
    expect(keys(asked.data.overlay)).toEqual([...ME_OVERLAY_KEYS].sort());
    const overlay = parseOverlay({ data: asked.data })!;
    expect(overlay.reactions).toEqual({ [fixture.SAMPLE_REACTED_POST]: "curious" });
    expect(overlay.crew).toEqual([{ slug: fixture.CREW_SLUG, org: fixture.CREW_ORG, profile: fixture.CREW_PROFILE }]);
    expect(keys(overlay.crew[0]!)).toEqual([...OVERLAY_CREW_KEYS]);
    expect(overlay.requestedOpenings).toEqual([fixture.SAMPLE_REQUESTED_OPENING]);
    expect(fixture.SAMPLE_REQUESTED_OPENING).toMatch(ME_OVERLAY_OPENING_ID_RE);

    // A page that asked about none of it gets none of it.
    const bare = parseOverlay({ data: (await get<{ overlay: unknown }>("/v1/openproduct/me/overlay")).data })!;
    expect([bare.reactions, bare.crew, bare.requestedOpenings]).toEqual([{}, [], []]);
    // Not on the crew of a product it did not ask about, or is not on.
    const other = parseOverlay({ data: (await get<{ overlay: unknown }>("/v1/openproduct/me/overlay?ids=product-05")).data })!;
    expect(other.crew).toEqual([]);
  });

  it("the seat the walker asked for is one a product really shows", async () => {
    const profile = (
      await get<{ profile: { roleOpenings: Array<{ id: string }> } }>(`/v1/public/openproduct/projects/${fixture.REQUESTED_SEAT_SLUG}`)
    ).data.profile;
    expect(profile.roleOpenings.map((o) => o.id)).toContain(fixture.SAMPLE_REQUESTED_OPENING);
  });

  it("the walker did not write the post they reacted to", async () => {
    // Core refuses a reaction to your own post, so a fixture that showed one
    // would be a state production cannot reach.
    const post = (await get<{ post: PublicProductPost }>(PRODUCT_POST_API.post(fixture.SAMPLE_REACTED_POST))).data.post;
    expect(post.author).toBeNull();
  });

  it("a reaction write answers with the caller's reaction and the counts", async () => {
    const set = await get<{ reaction: { postId: string; reaction: string | null; reactions: Record<string, number> } }>(
      PRODUCT_POST_API.reaction(fixture.SAMPLE_REACTED_POST),
      sendJson("PUT", { reaction: "useful" }),
    );
    expect(set.data.reaction.postId).toBe(fixture.SAMPLE_REACTED_POST);
    expect(set.data.reaction.reaction).toBe("useful");
    expect(set.data.reaction.reactions.useful).toBeGreaterThan(0);
    const cleared = await get<{ reaction: { reaction: string | null } }>(PRODUCT_POST_API.reaction(fixture.SAMPLE_REACTED_POST), { method: "DELETE" });
    expect(cleared.data.reaction.reaction).toBeNull();
  });

  it("Following is products and people, in the contract's shapes", async () => {
    const following = (await get<{ following: { products: object[]; people: object[] } }>(PRODUCT_POST_API.following())).data.following;
    expect(keys(following)).toEqual([...ME_FOLLOWING_KEYS]);
    expect(following.products.length).toBeGreaterThan(0);
    for (const product of following.products) expect(keys(product)).toEqual([...FOLLOWED_PRODUCT_KEYS]);
    expect(following.people.length).toBeGreaterThan(0);
  });

  it("search carries a product's stage and a person's products", async () => {
    const people = (await get<{ makers: Array<{ products: object[] } & object> }>("/v1/search?q=ada")).data.makers;
    expect(keys(people[0]!)).toEqual([...SEARCH_PERSON_KEYS]);
    expect(people[0]!.products.length).toBeGreaterThan(0);
    for (const product of people[0]!.products) expect(keys(product)).toEqual([...PRODUCT_REF_KEYS]);
    const hits = (await get<{ results: Array<{ stage: unknown }> }>("/v1/search?q=product")).data.results;
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => isProductStage(hit.stage))).toBe(true);
  });
});

describe("the crew routes, for the signed-in maker", () => {
  const root = () => ({ org: fixture.CREW_ORG, profile: fixture.CREW_PROFILE });

  it("needs-you holds a draft and a pending seat request that is decided on Orunbase", async () => {
    const { org, profile } = root();
    const needsYou = (await get<{ needsYou: { requests: Array<Record<string, unknown>>; drafts: CrewProductPost[] } }>(PRODUCT_POST_API.crewNeedsYou(org, profile))).data
      .needsYou;
    expect(keys(needsYou)).toEqual([...CREW_NEEDS_YOU_KEYS]);
    expect(needsYou.drafts).toHaveLength(1);
    expect(needsYou.drafts[0]!.id).toBe(fixture.SAMPLE_DRAFT_POST);
    expect(needsYou.drafts[0]!.state).toBe("draft");
    expect(keys(needsYou.drafts[0]!)).toEqual([...CREW_PRODUCT_POST_KEYS]);
    // A draft is unfinished by nature: it stores, and it would not publish.
    expect(validatePostBlocks("feature", needsYou.drafts[0]!.blocks, { mode: "draft" })).toEqual([]);
    expect(validatePostBlocks("feature", needsYou.drafts[0]!.blocks).length).toBeGreaterThan(0);
    expect(needsYou.requests).toHaveLength(1);
    expect(keys(needsYou.requests[0]!)).toEqual([...CREW_SEAT_REQUEST_KEYS]);
    // Where it is reviewed: there is no accept or decline here.
    expect(typeof needsYou.requests[0]!.requestRef).toBe("string");
  });

  it("opens, edits and deletes a seat at core's role-opening routes; opening one names the draft post it prepared", async () => {
    const { org, profile } = root();
    const made = await get<{ roleOpening: { id: string; title: string; status: string }; offeredPostId: string | null }>(
      PRODUCT_POST_API.crewSeats(org, profile),
      sendJson("POST", { title: "HR-compliance advisor", description: "Advise on state rules.", commitment: "2 hours a week" }),
    );
    expect(keys(made.data)).toEqual(["offeredPostId", "roleOpening"]);
    expect(keys(made.data.roleOpening)).toEqual([...PUBLIC_ROLE_OPENING_KEYS].filter((key) => key !== "demand"));
    expect(made.data.roleOpening).toMatchObject({ title: "HR-compliance advisor", status: "open" });
    expect(made.data.roleOpening.id).toMatch(ME_OVERLAY_OPENING_ID_RE);
    expect(made.data.offeredPostId).toBe(fixture.SAMPLE_DRAFT_POST);
    // An edit (closing is an edit that says so) prepares nothing.
    const closed = await get<{ roleOpening: { status: string }; offeredPostId: string | null }>(
      PRODUCT_POST_API.crewSeat(org, profile, fixture.SAMPLE_OPENING),
      sendJson("PUT", { title: "Frontend contributor", status: "closed" }),
    );
    expect(closed.data).toMatchObject({ roleOpening: { status: "closed" }, offeredPostId: null });
    expect((await get<{ deleted: boolean }>(PRODUCT_POST_API.crewSeat(org, profile, fixture.SAMPLE_OPENING), { method: "DELETE" })).data).toEqual({ deleted: true });
    // A seat with no role is refused, as core refuses it.
    expect((await get(PRODUCT_POST_API.crewSeats(org, profile), sendJson("POST", { title: "  " }))).status).toBe(422);
    // And the seat a product's page shows wears the real id grammar, so the
    // crew's form names one core would accept.
    const opening = (await get<{ profile: { roleOpenings: Array<{ id: string }> } }>(`/v1/public/openproduct/projects/${fixture.CREW_SLUG}`)).data.profile.roleOpenings[0]!;
    expect(opening.id).toBe(fixture.SAMPLE_OPENING);
    expect(opening.id).toMatch(ME_OVERLAY_OPENING_ID_RE);
  });

  it("the maintainer's read of the crew's listing says it is published — what its base address forwards on", async () => {
    const { org, profile } = root();
    const read = (await get<{ profile: { slug: string; visibility: string } }>(`/v1/organizations/${org}/openproduct/profiles/${profile}`)).data.profile;
    expect(read).toMatchObject({ slug: fixture.CREW_SLUG, visibility: "public" });
    // (Found by its address: OPR-4 pushed the discussions forward after it.)
    expect(fixture.MOVED.find((row) => row.from === `/studio/${fixture.STUDIO_ORG}/${fixture.STUDIO_PROFILE}`)).toEqual({
      from: `/studio/${fixture.STUDIO_ORG}/${fixture.STUDIO_PROFILE}`,
      to: `/studio/${fixture.STUDIO_ORG}/${fixture.STUDIO_PROFILE}/settings`,
      status: 307,
    });
  });

  it("lists the product's posts with the draft first, and its milestones with their ids", async () => {
    const { org, profile } = root();
    const posts = (await get<{ posts: CrewProductPost[] }>(PRODUCT_POST_API.crewPosts(org, profile))).data.posts;
    expect(posts.map((p) => p.state)).toEqual(["draft", "published", "published", "published"]);
    for (const post of posts) expect(keys(post)).toEqual([...CREW_PRODUCT_POST_KEYS]);
    const milestones = (await get<{ milestones: Array<{ id: string; shippedAt: string | null }>; stage: string }>(PRODUCT_POST_API.crewMilestones(org, profile))).data;
    expect(milestones.stage).toBe("shipping");
    expect(milestones.milestones.map((m) => m.shippedAt !== null)).toEqual([true, true, true, false]);
    for (const milestone of milestones.milestones) {
      expect(keys(milestone)).toEqual([...CREW_MILESTONE_KEYS]);
      expect(milestone.id).toMatch(MILESTONE_ID_RE);
    }
  });

  it("answers every write the way core would", async () => {
    const { org, profile } = root();
    const A = PRODUCT_POST_API;
    const draft = fixture.SAMPLE_DRAFT_POST;
    const created = await get<{ post: CrewProductPost }>(A.crewPosts(org, profile), sendJson("POST", { kind: "idea", blocks: [] }));
    expect([created.data.post.kind, created.data.post.state]).toEqual(["idea", "draft"]);
    const saved = await get<{ post: CrewProductPost }>(A.crewPost(org, profile, draft), sendJson("PATCH", { blocks: [{ block: "feature", value: "Renamed" }] }));
    expect(saved.data.post.blocks).toEqual([{ block: "feature", value: "Renamed" }]);
    const published = await get<{ post: CrewProductPost }>(A.crewPublish(org, profile, draft), sendJson("POST", {}));
    expect(published.data.post.state).toBe("published");
    expect((await get<{ removed: boolean }>(A.crewPost(org, profile, draft), { method: "DELETE" })).data.removed).toBe(true);

    const milestones = (await get<{ milestones: Array<{ id: string }> }>(A.crewMilestones(org, profile))).data.milestones;
    const last = milestones[milestones.length - 1]!.id;
    const shipped = await get<{ milestone: { shippedAt: string | null }; stage: string; offeredPost: CrewProductPost | null }>(
      A.crewMilestoneShipped(org, profile, last),
      { method: "PUT" },
    );
    expect(shipped.data.milestone.shippedAt).not.toBeNull();
    // Shipping prepares a draft Feature shipped post.
    expect([shipped.data.offeredPost?.kind, shipped.data.offeredPost?.state]).toEqual(["feature", "draft"]);
    const unshipped = await get<{ offeredPost: unknown }>(A.crewMilestoneShipped(org, profile, last), { method: "DELETE" });
    expect(unshipped.data.offeredPost).toBeNull();
    const reordered = await get<{ milestones: Array<{ id: string }> }>(
      A.crewMilestones(org, profile),
      sendJson("PUT", { order: [...milestones].reverse().map((m) => m.id) }),
    );
    expect(reordered.data.milestones.map((m) => m.id)).toEqual([...milestones].reverse().map((m) => m.id));
    expect((await get<{ milestone: { code: string } }>(A.crewMilestones(org, profile), sendJson("POST", { code: "AS5", title: "Next" }))).data.milestone.code).toBe("AS5");
    expect((await get<{ deleted: boolean }>(A.crewMilestone(org, profile, last), { method: "DELETE" })).data.deleted).toBe(true);
    const patched = await get<{ profile: { tryUrl: string } }>(
      `/v1/organizations/${org}/openproduct/profiles/${profile}`,
      sendJson("PATCH", { tryUrl: "https://try.example" }),
    );
    expect(patched.data.profile.tryUrl).toBe("https://try.example");
  });

  it("answered everything it was asked", () => {
    // The receipt the browser lanes rely on: no read fell through to a 502.
    expect(gateway.unmatched).toEqual([]);
  });
});

describe("the catalogue the fixture's posts are written against", () => {
  it("is the contract's, so a block renamed there fails here first", () => {
    expect(Object.keys(POST_BLOCK_CATALOGUE).sort()).toEqual(["demo", "feature", "idea", "seat", "version"]);
  });
});
