// Products post for themselves (openproduct-redesign OPR-3).
//
// What is pinned here is the handler layer: that a public read carries
// exactly its literal and never a draft, that the crew's door is closed to
// everybody else with one 404, that a post is held to its template at the
// right strictness (a draft less one line, a publish to the whole rule), that
// a reaction is one per person and none on your own post, that the stage
// follows the milestones, that the three "posts that write themselves" are
// written as the design says, and that every write is audited.
//
// The repository is faked at its interface, with state: a small in-memory
// store that keeps the SAME rules the SQL keeps (pinned against a live engine
// in packages/db/src/pg/product-posts.test.ts) — a public read returns only
// published posts of a listed listing, publish moves only a draft, `unless`
// writes nothing when the post exists.

import {
  CREW_MILESTONE_KEYS,
  CREW_NEEDS_YOU_KEYS,
  CREW_PRODUCT_POST_KEYS,
  CREW_SEAT_REQUEST_KEYS,
  FOLLOWED_PRODUCT_KEYS,
  ME_FOLLOWING_KEYS,
  MILESTONE_COUNTS_KEYS,
  PRODUCT_POSTS_PAGE_MAX,
  PRODUCT_POSTS_PAGE_KEYS,
  PRODUCT_POST_REACTION_COUNT_KEYS,
  PRODUCT_POST_THREAD_TAG,
  PRODUCT_REF_KEYS,
  PUBLIC_MILESTONE_KEYS,
  PUBLIC_PRODUCT_POST_AUTHOR_KEYS,
  PUBLIC_PRODUCT_POST_KEYS,
  PUBLIC_PRODUCT_POST_PRODUCT_KEYS,
  SEARCH_PERSON_KEYS,
  SEARCH_RESULT_KEYS,
  decodeProductPostCursor,
  type CrewProductPost,
  type PublicProductPost,
} from "@openproduct/contracts";
import type {
  OpenproductRepository,
  ProductMilestoneRecord,
  ProductPostRecord,
  ProfileRecord,
  PublicProductPostRecord,
  RoleOpeningRecord,
} from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const ORG_UUID = "11111111-1111-4111-8111-111111111111";
const PROJECT_UUID = "33333333-3333-4333-8333-333333333333";
const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const ORG = `org_${ORG_UUID.replace(/-/g, "")}`;
const PROFILE = `opp_${PROFILE_UUID.replace(/-/g, "")}`;
const BASE = `https://openproduct.internal/internal/openproduct/orgs/${ORG}/profiles/${PROFILE}`;
const PUBLIC = "https://openproduct.internal/internal/public/openproduct";
const ME = "https://openproduct.internal/internal/openproduct/me";

const ADA = { subjectId: "usr_0000000000000000000000000000ada0", subjectType: "user" };
const BOB = { subjectId: "usr_0000000000000000000000000000bob0", subjectType: "user" };
const NOW = "2026-11-14T10:00:00.000Z";

const hex = (uuid: string) => uuid.replace(/-/g, "");
const milestoneId = (uuid: string) => `pms_${hex(uuid)}`;
const seatId = (uuid: string) => `opr_${hex(uuid)}`;

function profile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: PROFILE_UUID,
    orgId: ORG_UUID,
    projectId: PROJECT_UUID,
    slug: "acme-thing",
    visibility: "public",
    tagline: "A thing, built in the open",
    pitchBody: "We are building a thing.",
    pitchDigest: "sha256:abc",
    installLine: null,
    cleanVotes: false,
    repoUrl: null,
    liveUrl: null,
    stage: "idea",
    tryUrl: null,
    stack: [],
    stackCanonical: [],
    category: null,
    hosting: null,
    pricing: null,
    repoVisibility: null,
    repoLicence: null,
    repoCheckedAt: null,
    repoName: null,
    repoDescription: null,
    repoTopics: null,
    repoLanguage: null,
    repoPushedAt: null,
    repoOpenIssues: null,
    reviewedAt: NOW,
    reviewedBy: null,
    publishedAt: "2026-11-01T00:00:00.000Z",
    indexable: true,
    moderationState: "visible",
    moderatedAt: null,
    moderationActId: null,
    components: null,
    linkGrant: {
      doorRef: "tok_door",
      grantedBy: "usr_admin",
      grantedAt: "2026-11-01T00:00:00.000Z",
      workspaceVisibility: "public",
    },
    // created_by is TEXT here, not a UUID column — see the 1160 migration.
    // eslint-disable-next-line no-restricted-syntax
    createdBy: ADA.subjectId,
    updatedBy: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

interface Store {
  profile: ProfileRecord;
  crew: Set<string>;
  milestones: ProductMilestoneRecord[];
  posts: ProductPostRecord[];
  reactions: Map<string, string>;
  threads: Array<{ id: string; tag: string; title: string; authorSubjectId: string; state: string }>;
  openings: RoleOpeningRecord[];
  handles: Map<string, { handle: string; displayName: string | null }>;
  audits: Array<{ type: string; actorId: string; payload: Record<string, unknown> }>;
  calls: string[];
  logos: Map<string, unknown[]>;
}

function harness(overrides: Partial<ProfileRecord> = {}) {
  let n = 0;
  const generateId = () => `0000000${(n += 1).toString(16)}-0000-4000-8000-000000000000`.slice(-36) as never;
  const store: Store = {
    profile: profile(overrides),
    crew: new Set([ADA.subjectId]),
    milestones: [],
    posts: [],
    reactions: new Map(),
    threads: [],
    openings: [],
    handles: new Map(),
    audits: [],
    calls: [],
    logos: new Map(),
  };
  const listed = () => store.profile.visibility === "public" && store.profile.moderationState === "visible";
  const publicRecord = (post: ProductPostRecord): PublicProductPostRecord => {
    const counts = { useful: 0, would_use: 0, impressive: 0, curious: 0 };
    for (const [key, reaction] of store.reactions) {
      if (key.startsWith(`${post.id}|`)) counts[reaction as keyof typeof counts] += 1;
    }
    const author = post.authorSubjectId ? store.handles.get(post.authorSubjectId) : undefined;
    return {
      id: post.id,
      kind: post.kind,
      blocks: post.blocks,
      publishedAt: post.publishedAt!,
      threadId: post.threadId,
      authorSubjectId: post.authorSubjectId,
      authorHandle: author?.handle ?? null,
      authorName: author?.displayName ?? null,
      slug: store.profile.slug,
      stage: store.profile.stage,
      milestoneCounts: {
        shipped: store.milestones.filter((m) => m.shippedAt !== null).length,
        total: store.milestones.length,
      },
      reactions: counts,
      commentCount: 2,
    };
  };
  const publicPosts = () =>
    listed()
      ? store.posts
          .filter((p) => p.state === "published")
          .sort((a, b) => (a.publishedAt! < b.publishedAt! ? 1 : -1))
      : [];
  const syncStage = () => {
    store.profile = { ...store.profile, stage: store.milestones.some((m) => m.shippedAt !== null) ? "shipping" : "idea" };
  };

  const repo = {
    async getListingRole(_profileId: string, subjectId: string) {
      return store.crew.has(subjectId) ? "owner" : null;
    },
    async getProfileForOrg(orgId: string, profileId: string) {
      return orgId === store.profile.orgId && profileId === store.profile.id ? store.profile : null;
    },
    async getPublicProfileId(slug: string) {
      return listed() && slug === store.profile.slug ? store.profile.id : null;
    },
    async getPublicProfile(slug: string) {
      return listed() && slug === store.profile.slug ? store.profile : null;
    },
    async appendAudit(input: { type: string; actorId: string; payload?: Record<string, unknown> | null }) {
      store.audits.push({ type: input.type, actorId: input.actorId, payload: input.payload ?? {} });
    },
    async listPublicMediaForSlugs(slugs: string[]) {
      store.calls.push(`media:${slugs.join("|")}`);
      return store.logos;
    },

    // ── milestones ──
    async listProductMilestones() {
      return [...store.milestones].sort((a, b) => a.position - b.position);
    },
    async listPublicProductMilestones() {
      return listed() ? [...store.milestones].sort((a, b) => a.position - b.position) : [];
    },
    async createProductMilestone(input: { id: string; code: string; title: string; summary: string | null }) {
      const row: ProductMilestoneRecord = {
        id: input.id,
        profileId: PROFILE_UUID,
        code: input.code,
        title: input.title,
        summary: input.summary,
        position: store.milestones.length,
        shippedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      store.milestones.push(row);
      return row;
    },
    async updateProductMilestone(_p: string, id: string, input: { code?: string; title?: string; summary?: string | null }) {
      const row = store.milestones.find((m) => m.id === id);
      if (!row) return null;
      if (input.code !== undefined) row.code = input.code;
      if (input.title !== undefined) row.title = input.title;
      if (input.summary !== undefined) row.summary = input.summary;
      return row;
    },
    async deleteProductMilestone(_p: string, id: string) {
      const before = store.milestones.length;
      store.milestones = store.milestones.filter((m) => m.id !== id);
      syncStage();
      return store.milestones.length < before;
    },
    async reorderProductMilestones(_p: string, ids: readonly string[]) {
      const held = new Set(store.milestones.map((m) => m.id));
      if (new Set(ids).size !== ids.length || ids.length !== held.size || !ids.every((id) => held.has(id))) return null;
      ids.forEach((id, index) => {
        store.milestones.find((m) => m.id === id)!.position = index;
      });
      return [...store.milestones].sort((a, b) => a.position - b.position);
    },
    async setProductMilestoneShipped(_p: string, id: string, at: string | null) {
      const row = store.milestones.find((m) => m.id === id);
      if (!row) return null;
      const was = row.shippedAt;
      row.shippedAt = at === null ? null : (row.shippedAt ?? at);
      syncStage();
      return { milestone: row, stage: store.profile.stage, changed: (was === null) !== (row.shippedAt === null) };
    },

    // ── product posts ──
    async createProductPost(input: {
      id: string;
      kind: ProductPostRecord["kind"];
      authorSubjectId: string | null;
      blocks: ProductPostRecord["blocks"];
      milestoneId?: string | null;
      roleOpeningId?: string | null;
      unless?: "milestone" | "role_opening" | "idea";
    }) {
      const live = store.posts.filter((p) => p.state !== "removed");
      if (input.unless === "milestone" && live.some((p) => p.milestoneId === input.milestoneId)) return null;
      if (input.unless === "role_opening" && live.some((p) => p.roleOpeningId === input.roleOpeningId)) return null;
      if (input.unless === "idea" && live.some((p) => p.kind === "idea")) return null;
      const row: ProductPostRecord = {
        id: input.id,
        profileId: PROFILE_UUID,
        kind: input.kind,
        authorSubjectId: input.authorSubjectId,
        blocks: input.blocks,
        state: "draft",
        publishedAt: null,
        milestoneId: input.milestoneId ?? null,
        roleOpeningId: input.roleOpeningId ?? null,
        launchId: null,
        threadId: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      store.posts.push(row);
      return row;
    },
    async getProductPost(_p: string, id: string) {
      return store.posts.find((p) => p.id === id && p.state !== "removed") ?? null;
    },
    async listProductPostsForProfile() {
      return store.posts.filter((p) => p.state !== "removed");
    },
    async listProductPostDrafts() {
      return store.posts.filter((p) => p.state === "draft");
    },
    async updateProductPostBlocks(_p: string, id: string, blocks: ProductPostRecord["blocks"]) {
      const row = store.posts.find((p) => p.id === id && p.state !== "removed");
      if (!row) return null;
      row.blocks = blocks;
      return row;
    },
    async publishProductPost(
      _p: string,
      id: string,
      input: {
        at: string;
        blocks: ProductPostRecord["blocks"];
        threadId: string;
        authorSubjectId?: string | null;
        milestoneId?: string | null;
        roleOpeningId?: string | null;
      },
    ) {
      const row = store.posts.find((p) => p.id === id && p.state === "draft");
      if (!row) return null;
      row.state = "published";
      row.publishedAt = input.at;
      row.blocks = input.blocks;
      row.threadId = input.threadId;
      row.authorSubjectId = input.authorSubjectId ?? row.authorSubjectId;
      if (input.milestoneId !== undefined) row.milestoneId = input.milestoneId;
      if (input.roleOpeningId !== undefined) row.roleOpeningId = input.roleOpeningId;
      return row;
    },
    async removeProductPost(_p: string, id: string) {
      const row = store.posts.find((p) => p.id === id && p.state !== "removed");
      if (!row) return null;
      row.state = "removed";
      return row;
    },
    async createThread(input: { id: string; tag: string; title: string; authorSubjectId: string }) {
      store.threads.push({ id: input.id, tag: input.tag, title: input.title, authorSubjectId: input.authorSubjectId, state: "open" });
      return input.id;
    },
    async setThreadState(id: string, state: string) {
      const thread = store.threads.find((t) => t.id === id);
      if (thread) thread.state = state;
      return Boolean(thread);
    },

    // ── the public reads ──
    async listPublicProductPosts(input: { cursor: { publishedAt: string; id: string } | null; limit: number }) {
      store.calls.push(`feed:${input.limit}:${input.cursor ? `${input.cursor.publishedAt}|${input.cursor.id}` : "start"}`);
      const all = publicPosts();
      const from = input.cursor ? all.findIndex((p) => p.id === input.cursor!.id) + 1 : 0;
      const rows = all.slice(from, from + input.limit).map(publicRecord);
      const last = rows[rows.length - 1];
      return {
        posts: rows,
        next: from + input.limit < all.length && last ? { publishedAt: last.publishedAt, id: last.id } : null,
      };
    },
    async listPublicProductPostsForProfile(_profileId: string, input: { limit: number }) {
      return { posts: publicPosts().slice(0, input.limit).map(publicRecord), next: null };
    },
    async listPublicProductPostsByAuthor(subjectId: string, input: { cursor: { publishedAt: string; id: string } | null; limit: number }) {
      store.calls.push(`by-author:${subjectId}:${input.limit}:${input.cursor ? input.cursor.id : "start"}`);
      const all = publicPosts().filter((p) => p.authorSubjectId === subjectId);
      const from = input.cursor ? all.findIndex((p) => p.id === input.cursor!.id) + 1 : 0;
      const rows = all.slice(from, from + input.limit).map(publicRecord);
      const last = rows[rows.length - 1];
      return {
        posts: rows,
        next: from + input.limit < all.length && last ? { publishedAt: last.publishedAt, id: last.id } : null,
      };
    },
    // A person's page resolves only for a handle on record (CG1's gates are
    // the repository's; here, the handle map is who has a public page).
    async getPublicContributor(handle: string) {
      const entry = [...store.handles.entries()].find(([, value]) => value.handle === handle);
      return entry ? { handle, displayName: entry[1].displayName } : null;
    },
    async getSubjectsForHandles(handles: string[]) {
      const out = new Map<string, string>();
      for (const [subjectId, value] of store.handles) if (handles.includes(value.handle)) out.set(value.handle, subjectId);
      return out;
    },
    async getPublicProductPost(id: string) {
      const post = publicPosts().find((p) => p.id === id);
      return post ? publicRecord(post) : null;
    },

    // ── reactions, Following ──
    async reactToProductPost(id: string, subjectId: string, reaction: string) {
      const post = publicPosts().find((p) => p.id === id);
      if (!post || post.authorSubjectId === subjectId) return false;
      store.reactions.set(`${id}|${subjectId}`, reaction);
      return true;
    },
    async withdrawProductPostReaction(id: string, subjectId: string) {
      return store.reactions.delete(`${id}|${subjectId}`);
    },
    async listFollowing(subjectId: string, limit: number) {
      store.calls.push(`following:${subjectId}:${limit}`);
      return {
        products: [{ slug: "acme-thing", tagline: "A thing, built in the open", stage: "shipping" as const }],
        people: [{ handle: "ada", displayName: "Ada Iyer" }],
      };
    },

    // ── seats ──
    async listRoleOpenings() {
      return store.openings;
    },
    async upsertRoleOpening(input: { id: string; title: string; description?: string | null; commitment?: string | null; status?: string }) {
      const row: RoleOpeningRecord = {
        id: input.id,
        profileId: PROFILE_UUID,
        title: input.title,
        description: input.description ?? null,
        commitment: input.commitment ?? null,
        status: (input.status ?? "open") as RoleOpeningRecord["status"],
        joinLinkRef: null,
        sortOrder: 0,
      };
      store.openings = [...store.openings.filter((o) => o.id !== row.id), row];
      return row;
    },
    async setRoleOpeningJoinLink(id: string, ref: string) {
      const row = store.openings.find((o) => o.id === id);
      if (row) row.joinLinkRef = ref;
      return row ?? null;
    },
    async listPendingApplicationsForProfile() {
      return [
        {
          id: "e1111111-1111-4111-8111-111111111111",
          roleOpeningId: "77777777-7777-4777-8777-777777777777",
          openingTitle: "Maintainer",
          jrRequestRef: "jrq_1",
          requesterHandle: null,
          requesterName: "Bea Park",
          createdAt: NOW,
        },
      ];
    },

    // ── the listing's own writes the self-posts hang off ──
    async listMaintainers() {
      return [];
    },
    async getTrustLevel() {
      return { subjectId: ADA.subjectId, level: "established", setBy: "test", reason: null, setAt: NOW };
    },
    async countUnreviewedPublished() {
      return 0;
    },
    async publishProfile() {
      store.profile = { ...store.profile, visibility: "public", publishedAt: store.profile.publishedAt ?? NOW };
      return store.profile;
    },
    async updateProfile(_o: string, _p: string, input: { tryUrl?: string | null; tagline?: string | null; slug?: string }) {
      store.calls.push(`updateProfile:${JSON.stringify({ tryUrl: input.tryUrl, tagline: input.tagline, slug: input.slug })}`);
      store.profile = {
        ...store.profile,
        ...(input.tryUrl !== undefined ? { tryUrl: input.tryUrl } : {}),
        ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
      };
      return store.profile;
    },
  } as unknown as OpenproductRepository;

  const deps = { repo, now: () => new Date(NOW), generateId } as unknown as ProfileHandlerDeps;
  return { store, deps };
}

type H = ReturnType<typeof harness>;

const ENV = { ENVIRONMENT: "test" } as Env;

async function call(
  h: H,
  method: string,
  url: string,
  actor: { subjectId: string; subjectType: string } | null,
  body?: unknown,
) {
  const headers: Record<string, string> = { "x-request-id": "req_opr3" };
  if (actor) {
    headers["x-actor-subject-id"] = actor.subjectId;
    headers["x-actor-subject-type"] = actor.subjectType;
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await route(
    new Request(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    ENV,
    h.deps,
  );
  const json = (await res.json()) as {
    data?: Record<string, unknown>;
    error?: { code: string; message: string; details?: { fields?: Record<string, string[]> } };
  };
  return { status: res.status, data: json.data ?? {}, error: json.error ?? null, fields: json.error?.details?.fields ?? {} };
}

const FEATURE = [
  { block: "feature", value: "Dark mode" },
  { block: "what", value: "The whole app follows the system theme." },
  { block: "try", value: "https://example.com/app" },
];

/** A draft through the crew's door, and its public id. */
async function draft(h: H, kind = "feature", blocks: unknown = FEATURE) {
  const res = await call(h, "POST", `${BASE}/product-posts`, ADA, { kind, blocks });
  expect(res.status).toBe(201);
  return (res.data.post as CrewProductPost).id;
}

async function publish(h: H, id: string, body?: unknown) {
  return call(h, "POST", `${BASE}/product-posts/${id}/publish`, ADA, body);
}

const keysOf = (value: unknown) => Object.keys(value as object).sort();

// ─────────────────────────────────────────────────────────────────────────────

describe("the public reads — one document for everybody, and never a draft", () => {
  it("the feed carries exactly its literal, at every depth", async () => {
    const h = harness();
    h.store.handles.set(ADA.subjectId, { handle: "ada", displayName: "Ada Iyer" });
    await publish(h, await draft(h));
    const res = await call(h, "GET", `${PUBLIC}/product-posts`, null);
    expect(res.status).toBe(200);
    expect(keysOf(res.data)).toEqual([...PRODUCT_POSTS_PAGE_KEYS]);
    const [post] = res.data.posts as PublicProductPost[];
    expect(keysOf(post)).toEqual([...PUBLIC_PRODUCT_POST_KEYS]);
    expect(keysOf(post!.product)).toEqual([...PUBLIC_PRODUCT_POST_PRODUCT_KEYS]);
    expect(keysOf(post!.author)).toEqual([...PUBLIC_PRODUCT_POST_AUTHOR_KEYS]);
    expect(keysOf(post!.reactions)).toEqual([...PRODUCT_POST_REACTION_COUNT_KEYS]);
    expect(post).toMatchObject({
      kind: "feature",
      // The product's progress rides on the post, so a card draws its bars
      // without a read per card.
      product: { slug: "acme-thing", name: "acme-thing", stage: "idea", logo: null, milestoneCounts: { shipped: 0, total: 0 } },
      author: { handle: "ada", displayName: "Ada Iyer" },
      blocks: FEATURE,
      publishedAt: NOW,
      reactions: { useful: 0, would_use: 0, impressive: 0, curious: 0 },
      commentCount: 2,
    });
    expect(post!.id).toMatch(/^ppo_[0-9a-f]{32}$/);
    // The author's subject id stops at the handler (I3), and so does every
    // table id but the thread's, which is how a thread is addressed.
    expect(JSON.stringify(res.data)).not.toContain("usr_");
    expect(JSON.stringify(res.data)).not.toContain(PROFILE_UUID);
  });

  it("a post's product carries its milestone counts at their literal", async () => {
    const h = harness();
    const made = await call(h, "POST", `${BASE}/milestones`, ADA, { code: "AS1", title: "Sign in" });
    await call(h, "POST", `${BASE}/milestones`, ADA, { code: "AS2", title: "Exports" });
    await call(h, "PUT", `${BASE}/milestones/${(made.data.milestone as { id: string }).id}/shipped`, ADA);
    await publish(h, await draft(h));
    const [post] = (await call(h, "GET", `${PUBLIC}/product-posts`, null)).data.posts as PublicProductPost[];
    expect(post!.product.milestoneCounts).toEqual({ shipped: 1, total: 2 });
    expect(keysOf(post!.product.milestoneCounts)).toEqual([...MILESTONE_COUNTS_KEYS]);
  });

  it("one person's posts: the feed's literal, for a handle whose page resolves, paged like the feed", async () => {
    const h = harness();
    h.store.handles.set(ADA.subjectId, { handle: "ada", displayName: "Ada Iyer" });
    const first = await draft(h);
    await publish(h, first);
    await publish(h, await draft(h));
    // A draft of theirs is in nobody's list.
    await draft(h);
    const res = await call(h, "GET", `${PUBLIC}/people/ada/product-posts`, null);
    expect(res.status).toBe(200);
    expect(keysOf(res.data)).toEqual([...PRODUCT_POSTS_PAGE_KEYS]);
    const posts = res.data.posts as PublicProductPost[];
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      expect(keysOf(post)).toEqual([...PUBLIC_PRODUCT_POST_KEYS]);
      expect(post.author).toEqual({ handle: "ada", displayName: "Ada Iyer" });
    }
    expect(JSON.stringify(res.data)).not.toContain("usr_");
    // Bounded like the feed, and paged by the feed's own cursor.
    const one = await call(h, "GET", `${PUBLIC}/people/ada/product-posts?limit=1`, null);
    expect((one.data.posts as unknown[]).length).toBe(1);
    expect(typeof one.data.next).toBe("string");
    const two = await call(h, "GET", `${PUBLIC}/people/ada/product-posts?limit=1&cursor=${encodeURIComponent(String(one.data.next))}`, null);
    expect((two.data.posts as PublicProductPost[]).map((p) => p.id)).not.toEqual((one.data.posts as PublicProductPost[]).map((p) => p.id));
    expect(two.data.next).toBeNull();
    await call(h, "GET", `${PUBLIC}/people/ada/product-posts?limit=100000`, null);
    expect(h.store.calls.filter((c) => c.startsWith("by-author:")).at(-1)).toBe(`by-author:${ADA.subjectId}:${PRODUCT_POSTS_PAGE_MAX}:start`);
    expect((await call(h, "GET", `${PUBLIC}/people/ada/product-posts?cursor=nonsense`, null)).status).toBe(422);
  });

  it("one person's posts: one 404 for a handle that is malformed, unknown, or has no public page", async () => {
    const h = harness();
    await publish(h, await draft(h));
    // Ada wrote a post and has no public page: her list is not served.
    for (const handle of ["ada", "nobody-here", "A", "has space", "x"]) {
      const res = await call(h, "GET", `${PUBLIC}/people/${encodeURIComponent(handle)}/product-posts`, null);
      expect([handle, res.status]).toEqual([handle, 404]);
    }
    expect(h.store.calls.filter((c) => c.startsWith("by-author:"))).toEqual([]);
    // And it is a read.
    h.store.handles.set(ADA.subjectId, { handle: "ada", displayName: "Ada Iyer" });
    expect((await call(h, "POST", `${PUBLIC}/people/ada/product-posts`, null, {})).status).toBeGreaterThanOrEqual(400);
  });

  it("an author with no public page is not named — there is nothing to link", async () => {
    const h = harness();
    await publish(h, await draft(h));
    const res = await call(h, "GET", `${PUBLIC}/product-posts`, null);
    expect((res.data.posts as PublicProductPost[])[0]!.author).toBeNull();
  });

  it("never a draft, never a removed post, and nothing from an unlisted product", async () => {
    const h = harness();
    const live = await draft(h);
    await draft(h, "seat", []);
    expect(((await call(h, "GET", `${PUBLIC}/product-posts`, null)).data.posts as unknown[]).length).toBe(0);
    expect((await call(h, "GET", `${PUBLIC}/product-posts/${live}`, null)).status).toBe(404);

    await publish(h, live);
    expect(((await call(h, "GET", `${PUBLIC}/product-posts`, null)).data.posts as unknown[]).length).toBe(1);
    expect((await call(h, "GET", `${PUBLIC}/product-posts/${live}`, null)).status).toBe(200);

    h.store.profile = { ...h.store.profile, visibility: "private" };
    expect(((await call(h, "GET", `${PUBLIC}/product-posts`, null)).data.posts as unknown[]).length).toBe(0);
    expect((await call(h, "GET", `${PUBLIC}/product-posts/${live}`, null)).status).toBe(404);
    expect((await call(h, "GET", `${PUBLIC}/projects/acme-thing/product-posts`, null)).status).toBe(404);

    h.store.profile = { ...h.store.profile, visibility: "public" };
    await call(h, "DELETE", `${BASE}/product-posts/${live}`, ADA);
    expect((await call(h, "GET", `${PUBLIC}/product-posts/${live}`, null)).status).toBe(404);
  });

  it("one post: 404 for an id that is not one, that names another kind of thing, or that nobody holds", async () => {
    const h = harness();
    for (const id of ["nope", "ppo_xyz", `opr_${"0".repeat(32)}`, `ppo_${"0".repeat(32)}`]) {
      expect([id, (await call(h, "GET", `${PUBLIC}/product-posts/${id}`, null)).status]).toEqual([id, 404]);
    }
  });

  it("one product's posts carry the same literal, and an unknown product is the listing's own 404", async () => {
    const h = harness();
    await publish(h, await draft(h));
    const res = await call(h, "GET", `${PUBLIC}/projects/acme-thing/product-posts`, null);
    expect(res.status).toBe(200);
    expect(keysOf(res.data)).toEqual([...PRODUCT_POSTS_PAGE_KEYS]);
    expect(keysOf((res.data.posts as unknown[])[0])).toEqual([...PUBLIC_PRODUCT_POST_KEYS]);
    expect((await call(h, "GET", `${PUBLIC}/projects/nobody/product-posts`, null)).status).toBe(404);
    expect((await call(h, "GET", `${PUBLIC}/projects/not_a_slug/product-posts`, null)).status).toBe(404);
  });

  it("pages by position: `next` is a cursor this feed issued, and a cursor it did not issue is refused", async () => {
    const h = harness();
    for (let i = 0; i < 3; i += 1) await publish(h, await draft(h));
    // Three posts published in the same instant in this fake; a page of two.
    const first = await call(h, "GET", `${PUBLIC}/product-posts?limit=2`, null);
    expect((first.data.posts as unknown[]).length).toBe(2);
    const next = first.data.next as string;
    expect(decodeProductPostCursor(next)).not.toBeNull();
    const second = await call(h, "GET", `${PUBLIC}/product-posts?limit=2&cursor=${next}`, null);
    expect((second.data.posts as unknown[]).length).toBe(1);
    expect(second.data.next).toBeNull();

    const refused = await call(h, "GET", `${PUBLIC}/product-posts?cursor=not-a-cursor`, null);
    expect(refused.status).toBe(422);
    expect(refused.fields.cursor).toBeDefined();
  });

  it("bounds a hostile limit before it reaches the repository", async () => {
    const h = harness();
    await call(h, "GET", `${PUBLIC}/product-posts?limit=100000`, null);
    await call(h, "GET", `${PUBLIC}/product-posts?limit=-4`, null);
    expect(h.store.calls.filter((c) => c.startsWith("feed:"))).toEqual(["feed:50:start", "feed:20:start"]);
  });

  it("reads the logos once for the page, and a failed media read is a monogram, never a failed feed", async () => {
    const h = harness();
    await publish(h, await draft(h));
    await publish(h, await draft(h));
    await call(h, "GET", `${PUBLIC}/product-posts`, null);
    expect(h.store.calls.filter((c) => c.startsWith("media:"))).toEqual(["media:acme-thing"]);

    (h.deps.repo as unknown as { listPublicMediaForSlugs: () => Promise<never> }).listPublicMediaForSlugs = async () => {
      throw new Error("media is down");
    };
    const res = await call(h, "GET", `${PUBLIC}/product-posts`, null);
    expect(res.status).toBe(200);
    expect((res.data.posts as PublicProductPost[])[0]!.product.logo).toBeNull();
  });

  it("refuses a write on the public path", async () => {
    const h = harness();
    expect((await call(h, "POST", `${PUBLIC}/product-posts`, ADA, {})).status).toBe(405);
  });
});

describe("the public product document says its stage, its milestones and where to try it", () => {
  it("carries stage, tryUrl, the milestones in order and their count — each at its literal", async () => {
    const h = harness({ tryUrl: "https://try.example.com/" });
    const a = await call(h, "POST", `${BASE}/milestones`, ADA, { code: "AS1", title: "Sign in", summary: "Accounts." });
    await call(h, "POST", `${BASE}/milestones`, ADA, { code: "AS2", title: "Billing" });
    await call(h, "PUT", `${BASE}/milestones/${(a.data.milestone as { id: string }).id}/shipped`, ADA);

    // The fake's public document read needs only what `handlePublicProfile` asks.
    Object.assign(h.deps.repo, {
      async listPublicMaintainers() {
        return [];
      },
      async listPublicRoleOpenings() {
        return [];
      },
      async latestMetrics() {
        return [];
      },
      async countOpeningDemand() {
        return [];
      },
      async listLaunchesForProfile() {
        return [];
      },
      async latestSnapshotBefore() {
        return null;
      },
      async countFollowers() {
        return new Map();
      },
      async listFeedLaunches() {
        return [];
      },
      async listPublicMedia() {
        return [];
      },
    });
    const res = await call(h, "GET", `${PUBLIC}/projects/acme-thing`, null);
    expect(res.status).toBe(200);
    const doc = res.data.profile as Record<string, unknown>;
    expect(doc.stage).toBe("shipping");
    expect(doc.tryUrl).toBe("https://try.example.com/");
    expect(doc.milestones).toEqual([
      { code: "AS1", title: "Sign in", summary: "Accounts.", shippedAt: NOW },
      { code: "AS2", title: "Billing", summary: null, shippedAt: null },
    ]);
    for (const milestone of doc.milestones as unknown[]) expect(keysOf(milestone)).toEqual([...PUBLIC_MILESTONE_KEYS]);
    expect(doc.milestoneCounts).toEqual({ shipped: 1, total: 2 });
    expect(keysOf(doc.milestoneCounts)).toEqual([...MILESTONE_COUNTS_KEYS]);
    // A milestone's id is the crew's, not a reader's.
    expect(JSON.stringify(doc.milestones)).not.toContain("pms_");
  });
});

describe("my reaction on a product post", () => {
  async function livePost(h: H) {
    const id = await draft(h);
    await publish(h, id);
    return id;
  }
  const reactions = (res: Awaited<ReturnType<typeof call>>) => res.data.reaction as { postId: string; reaction: string | null; reactions: Record<string, number> };

  it("sets one, replaces it, and clears it — and answers with the counts each time", async () => {
    const h = harness();
    const id = await livePost(h);
    const url = `${ME}/product-post-reactions/${id}`;

    const set = await call(h, "PUT", url, BOB, { reaction: "useful" });
    expect(set.status).toBe(200);
    expect(reactions(set)).toEqual({ postId: id, reaction: "useful", reactions: { useful: 1, would_use: 0, impressive: 0, curious: 0 } });

    // One per person: a second reaction replaces the first.
    const changed = await call(h, "PUT", url, BOB, { reaction: "curious" });
    expect(reactions(changed).reactions).toEqual({ useful: 0, would_use: 0, impressive: 0, curious: 1 });

    const cleared = await call(h, "DELETE", url, BOB);
    expect(reactions(cleared)).toEqual({ postId: id, reaction: null, reactions: { useful: 0, would_use: 0, impressive: 0, curious: 0 } });
    // Clearing what you do not hold is the state you asked for.
    expect((await call(h, "DELETE", url, BOB)).status).toBe(200);
  });

  it("the post's author cannot react to their own post, and is told so", async () => {
    const h = harness();
    const id = await livePost(h);
    const res = await call(h, "PUT", `${ME}/product-post-reactions/${id}`, ADA, { reaction: "impressive" });
    expect(res.status).toBe(409);
    expect(res.error?.message).toBe("You cannot react to your own post");
    expect(h.store.reactions.size).toBe(0);
  });

  it("refuses a word that is not a reaction, a draft, an unknown post, an anonymous caller and a machine", async () => {
    const h = harness();
    const id = await livePost(h);
    const url = `${ME}/product-post-reactions/${id}`;
    expect((await call(h, "PUT", url, BOB, { reaction: "like" })).status).toBe(422);
    expect((await call(h, "PUT", url, BOB, {})).status).toBe(422);
    const unpublished = await draft(h);
    expect((await call(h, "PUT", `${ME}/product-post-reactions/${unpublished}`, BOB, { reaction: "useful" })).status).toBe(404);
    expect((await call(h, "PUT", `${ME}/product-post-reactions/ppo_${"0".repeat(32)}`, BOB, { reaction: "useful" })).status).toBe(404);
    expect((await call(h, "PUT", `${ME}/product-post-reactions/nope`, BOB, { reaction: "useful" })).status).toBe(404);
    expect((await call(h, "PUT", url, null, { reaction: "useful" })).status).toBe(401);
    expect((await call(h, "PUT", url, { subjectId: "sp_1", subjectType: "service_principal" }, { reaction: "useful" })).status).toBe(403);
    expect((await call(h, "POST", url, BOB, { reaction: "useful" })).status).toBe(405);
  });
});

describe("GET what I follow", () => {
  it("answers my products and people at their literals, with the product's logo and name", async () => {
    const h = harness();
    const res = await call(h, "GET", `${ME}/following`, BOB);
    expect(res.status).toBe(200);
    const following = res.data.following as { products: unknown[]; people: unknown[] };
    expect(keysOf(following)).toEqual([...ME_FOLLOWING_KEYS]);
    expect(keysOf(following.products[0])).toEqual([...FOLLOWED_PRODUCT_KEYS]);
    expect(following.products[0]).toEqual({
      slug: "acme-thing",
      name: "acme-thing",
      stage: "shipping",
      tagline: "A thing, built in the open",
      logo: null,
    });
    expect(following.people).toEqual([{ handle: "ada", displayName: "Ada Iyer" }]);
    // The reader's own list: the subject is the whole of the question.
    expect(h.store.calls).toContain(`following:${BOB.subjectId}:200`);
  });

  it("is not for an anonymous caller, and takes no write", async () => {
    const h = harness();
    expect((await call(h, "GET", `${ME}/following`, null)).status).toBe(401);
    expect((await call(h, "PUT", `${ME}/following`, BOB, {})).status).toBe(405);
  });
});

describe("the crew's door is closed to everybody else, with one 404", () => {
  // Three members in every row: a row shorter than the test's parameter
  // list would hand jest's `done` callback to the last one.
  const NO_BODY = undefined;
  const routes: Array<[string, string, unknown]> = [
    ["GET", "/product-posts", NO_BODY],
    ["POST", "/product-posts", { kind: "feature", blocks: [] }],
    ["PATCH", `/product-posts/ppo_${"1".repeat(32)}`, { blocks: [] }],
    ["DELETE", `/product-posts/ppo_${"1".repeat(32)}`, NO_BODY],
    ["POST", `/product-posts/ppo_${"1".repeat(32)}/publish`, NO_BODY],
    ["GET", "/milestones", NO_BODY],
    ["POST", "/milestones", { code: "A", title: "T" }],
    ["PUT", "/milestones", { order: [] }],
    ["PATCH", `/milestones/pms_${"1".repeat(32)}`, { title: "T" }],
    ["DELETE", `/milestones/pms_${"1".repeat(32)}`, NO_BODY],
    ["PUT", `/milestones/pms_${"1".repeat(32)}/shipped`, NO_BODY],
    ["DELETE", `/milestones/pms_${"1".repeat(32)}/shipped`, NO_BODY],
    ["GET", "/needs-you", NO_BODY],
  ];

  it.each(routes)("%s %s — a signed-in stranger gets 404 and nothing is written", async (method, path, body) => {
    const h = harness();
    const res = await call(h, method, `${BASE}${path}`, BOB, body);
    expect(res.status).toBe(404);
    expect(h.store.posts).toEqual([]);
    expect(h.store.milestones).toEqual([]);
    expect(h.store.audits).toEqual([]);
  });

  it.each(routes)("%s %s — no actor is 401, before anything is read", async (method, path, body) => {
    const h = harness();
    expect((await call(h, method, `${BASE}${path}`, null, body)).status).toBe(401);
  });

  it("a listing addressed under another workspace is the same 404", async () => {
    const h = harness();
    const other = `org_${"2".repeat(32)}`;
    const url = `https://openproduct.internal/internal/openproduct/orgs/${other}/profiles/${PROFILE}/product-posts`;
    expect((await call(h, "GET", url, ADA)).status).toBe(404);
  });

  it("an id of the wrong kind in the path is a 404, never a different object", async () => {
    const h = harness();
    expect((await call(h, "DELETE", `${BASE}/product-posts/pms_${"1".repeat(32)}`, ADA)).status).toBe(404);
    expect((await call(h, "PUT", `${BASE}/milestones/ppo_${"1".repeat(32)}/shipped`, ADA)).status).toBe(404);
  });
});

describe("a draft is held to the template, less one line", () => {
  it("creates a draft with nothing filled in, at the crew literal", async () => {
    const h = harness();
    const res = await call(h, "POST", `${BASE}/product-posts`, ADA, { kind: "idea" });
    expect(res.status).toBe(201);
    const post = res.data.post as CrewProductPost;
    expect(keysOf(post)).toEqual([...CREW_PRODUCT_POST_KEYS]);
    expect(post).toMatchObject({ kind: "idea", state: "draft", blocks: [], publishedAt: null, threadId: null, milestoneId: null, roleOpeningId: null });
    expect(h.store.posts[0]!.authorSubjectId).toBe(ADA.subjectId);
    expect(h.store.audits.map((a) => a.type)).toEqual(["openproduct.product_post.created"]);
    expect(h.store.audits[0]!.payload).toMatchObject({ postId: post.id, kind: "idea", source: "crew" });
  });

  it("lets required blocks be empty or absent", async () => {
    const h = harness();
    const res = await call(h, "POST", `${BASE}/product-posts`, ADA, { kind: "feature", blocks: [{ block: "feature", value: "" }] });
    expect(res.status).toBe(201);
  });

  it.each([
    ["an unknown block", [{ block: "poll", value: "x" }], "blocks.poll"],
    ["a block out of order", [{ block: "what", value: "x" }, { block: "feature", value: "y" }], "blocks.feature"],
    ["a block twice", [{ block: "feature", value: "x" }, { block: "feature", value: "y" }], "blocks.feature"],
    ["a value over its limit", [{ block: "feature", value: "x".repeat(61) }], "blocks.feature"],
    ["a url that is not http(s)", [{ block: "try", value: "javascript:alert(1)" }], "blocks.try"],
  ])("refuses %s, and names the block", async (_name, blocks, field) => {
    const h = harness();
    const res = await call(h, "POST", `${BASE}/product-posts`, ADA, { kind: "feature", blocks });
    expect(res.status).toBe(422);
    expect(Object.keys(res.fields)).toEqual([field]);
    expect(h.store.posts).toEqual([]);
  });

  it("refuses `demo` with a sentence — a demo post is made by recording one", async () => {
    const h = harness();
    const res = await call(h, "POST", `${BASE}/product-posts`, ADA, { kind: "demo", blocks: [] });
    expect(res.status).toBe(422);
    expect(res.fields.kind).toEqual(["A Demo post is made by recording a demo, which is not available yet"]);
    expect(h.store.posts).toEqual([]);
  });

  it("refuses a kind that is not one, blocks that are not a list, and a body that is not JSON", async () => {
    const h = harness();
    expect((await call(h, "POST", `${BASE}/product-posts`, ADA, { kind: "poll" })).fields.kind).toBeDefined();
    expect((await call(h, "POST", `${BASE}/product-posts`, ADA, { kind: "idea", blocks: "x" })).fields.blocks).toBeDefined();
    expect((await call(h, "POST", `${BASE}/product-posts`, ADA, { kind: "idea", blocks: [{ block: 1 }] })).fields.blocks).toBeDefined();
    const res = await route(
      new Request(`${BASE}/product-posts`, {
        method: "POST",
        headers: { "x-actor-subject-id": ADA.subjectId, "x-actor-subject-type": "user" },
        body: "{not json",
      }),
      ENV,
      h.deps,
    );
    expect(res.status).toBe(400);
  });

  it("holds a product to fifty drafts", async () => {
    const h = harness();
    for (let i = 0; i < 50; i += 1) await draft(h, "idea", []);
    const res = await call(h, "POST", `${BASE}/product-posts`, ADA, { kind: "idea", blocks: [] });
    expect(res.status).toBe(409);
    expect(h.store.posts).toHaveLength(50);
  });

  it("an edit to a draft is held to the same rule, and audited", async () => {
    const h = harness();
    const id = await draft(h, "feature", []);
    const ok = await call(h, "PATCH", `${BASE}/product-posts/${id}`, ADA, { blocks: FEATURE.slice(0, 1) });
    expect(ok.status).toBe(200);
    expect((ok.data.post as CrewProductPost).blocks).toEqual(FEATURE.slice(0, 1));
    const bad = await call(h, "PATCH", `${BASE}/product-posts/${id}`, ADA, { blocks: [{ block: "nope", value: "" }] });
    expect(bad.status).toBe(422);
    expect((await call(h, "PATCH", `${BASE}/product-posts/${id}`, ADA, {})).fields.blocks).toBeDefined();
    expect(h.store.audits.map((a) => a.type)).toEqual(["openproduct.product_post.created", "openproduct.product_post.updated"]);
    expect(h.store.audits[1]!.payload).toMatchObject({ state: "draft" });
  });

  it("the crew's list holds drafts and published posts, and never a removed one", async () => {
    const h = harness();
    const a = await draft(h);
    const b = await draft(h, "seat", []);
    await publish(h, a);
    await call(h, "DELETE", `${BASE}/product-posts/${b}`, ADA);
    const res = await call(h, "GET", `${BASE}/product-posts`, ADA);
    expect((res.data.posts as CrewProductPost[]).map((p) => `${p.kind}:${p.state}`)).toEqual(["feature:published"]);
  });
});

describe("Post — the whole rule, a thread, a moment, and the person who pressed it", () => {
  it("publishes a complete draft: publishedAt, the comment thread under the system's tag, the author", async () => {
    const h = harness();
    const id = await draft(h);
    const res = await publish(h, id);
    expect(res.status).toBe(200);
    const post = res.data.post as CrewProductPost;
    expect(post).toMatchObject({ state: "published", publishedAt: NOW });
    expect(h.store.threads).toEqual([
      { id: post.threadId, tag: PRODUCT_POST_THREAD_TAG, title: "Feature shipped on acme-thing", authorSubjectId: ADA.subjectId, state: "open" },
    ]);
    expect(h.store.posts[0]!.authorSubjectId).toBe(ADA.subjectId);
    const audit = h.store.audits.at(-1)!;
    expect(audit.type).toBe("openproduct.product_post.published");
    expect(audit.payload).toMatchObject({ postId: id, kind: "feature", publishedAt: NOW, threadId: post.threadId });
  });

  it("refuses a draft missing a required block, names the block, and makes no thread", async () => {
    const h = harness();
    const id = await draft(h, "feature", FEATURE.slice(0, 2));
    const res = await publish(h, id);
    expect(res.status).toBe(422);
    expect(res.fields).toEqual({ "blocks.try": ["Try it is required"] });
    expect(h.store.threads).toEqual([]);
    expect(h.store.posts[0]!.state).toBe("draft");
  });

  it("a refused Post still saves the blocks that came with it, so nothing typed is lost", async () => {
    const h = harness();
    const id = await draft(h, "feature", []);
    const typed = [
      { block: "feature", value: "Dark mode" },
      { block: "what", value: "The whole app follows the system theme." },
    ];
    // Try it is required and missing: the press is refused…
    const res = await publish(h, id, { blocks: typed });
    expect(res.status).toBe(422);
    expect(res.fields).toEqual({ "blocks.try": ["Try it is required"] });
    // …the post is still a draft, with no thread…
    expect(h.store.posts[0]!.state).toBe("draft");
    expect(h.store.threads).toEqual([]);
    // …and it holds what was typed, written once, by this request.
    expect(h.store.posts[0]!.blocks).toEqual(typed);
    expect(h.store.audits.map((a) => a.type)).toEqual([
      "openproduct.product_post.created",
      "openproduct.product_post.updated",
    ]);
    // The crew's read returns it, so the builder reopens on the same words.
    const listed = (await call(h, "GET", `${BASE}/product-posts`, ADA)).data.posts as CrewProductPost[];
    expect(listed[0]!.blocks).toEqual(typed);
  });

  it("a refused Post saves nothing a draft could not hold, nothing unchanged, and nothing when no blocks came", async () => {
    const h = harness();
    const id = await draft(h, "feature", FEATURE.slice(0, 2));
    const before = h.store.audits.length;
    // No blocks with the press: the draft is what it was.
    expect((await publish(h, id)).status).toBe(422);
    // The same blocks again: nothing to write.
    expect((await publish(h, id, { blocks: FEATURE.slice(0, 2) })).status).toBe(422);
    // Over a limit: a draft may not hold it either, so it is refused and not stored.
    const over = [{ block: "feature", value: "x".repeat(500) }, FEATURE[1]!];
    const res = await publish(h, id, { blocks: over });
    expect(res.status).toBe(422);
    expect(Object.keys(res.fields)).toContain("blocks.feature");
    expect(h.store.posts[0]!.blocks).toEqual(FEATURE.slice(0, 2));
    expect(h.store.audits.length).toBe(before);
  });

  it("publishes the blocks sent with the press, stored without the optional ones left empty", async () => {
    const h = harness();
    const id = await draft(h, "feature", []);
    const res = await publish(h, id, { blocks: [...FEATURE, { block: "for", value: "" }, { block: "milestone", value: "AS3" }] });
    expect(res.status).toBe(200);
    expect((res.data.post as CrewProductPost).blocks).toEqual([...FEATURE, { block: "milestone", value: "AS3" }]);
  });

  it.each([
    ["idea", [{ block: "problem", value: "Leaving is hard." }, { block: "who", value: "People who leave." }]],
    ["seat", [{ block: "role", value: "Maintainer" }, { block: "what", value: "Keep the lights on." }]],
    ["version", [{ block: "version", value: "1.2.0" }, { block: "added", value: "Search\nShortcuts" }]],
  ])("publishes a %s post with no link at all", async (kind, blocks) => {
    const h = harness();
    const res = await publish(h, await draft(h, kind, blocks));
    expect(res.status).toBe(200);
    expect(res.data.post).toMatchObject({ milestoneId: null, roleOpeningId: null });
  });

  it("a Feature shipped post may name its milestone — one of this product's", async () => {
    const h = harness();
    const created = await call(h, "POST", `${BASE}/milestones`, ADA, { code: "AS1", title: "Sign in" });
    const mid = (created.data.milestone as { id: string }).id;
    const ok = await publish(h, await draft(h), { milestoneId: mid });
    expect(ok.status).toBe(200);
    expect((ok.data.post as CrewProductPost).milestoneId).toBe(mid);

    const stranger = await publish(h, await draft(h), { milestoneId: milestoneId("99999999-9999-4999-8999-999999999999") });
    expect(stranger.fields.milestoneId).toEqual(["Not a milestone of this product"]);
    const seat = await publish(h, await draft(h, "seat", [{ block: "role", value: "M" }, { block: "what", value: "W" }]), { milestoneId: mid });
    expect(seat.fields.milestoneId).toEqual(["Only a Feature shipped post names a milestone"]);
  });

  it("a Help wanted post may name its seat — one of this product's", async () => {
    const h = harness();
    const SEAT = "77777777-7777-4777-8777-777777777777";
    h.store.openings.push({ id: SEAT, profileId: PROFILE_UUID, title: "Maintainer", description: null, commitment: null, status: "open", joinLinkRef: null, sortOrder: 0 });
    const blocks = [{ block: "role", value: "Maintainer" }, { block: "what", value: "Keep the lights on." }];
    const ok = await publish(h, await draft(h, "seat", blocks), { roleOpeningId: seatId(SEAT) });
    expect((ok.data.post as CrewProductPost).roleOpeningId).toBe(seatId(SEAT));
    const stranger = await publish(h, await draft(h, "seat", blocks), { roleOpeningId: seatId("99999999-9999-4999-8999-999999999999") });
    expect(stranger.fields.roleOpeningId).toEqual(["Not a seat of this product"]);
    const feature = await publish(h, await draft(h), { roleOpeningId: seatId(SEAT) });
    expect(feature.fields.roleOpeningId).toEqual(["Only a Help wanted post names a seat"]);
  });

  it("pressing Post twice publishes once", async () => {
    const h = harness();
    const id = await draft(h);
    expect((await publish(h, id)).status).toBe(200);
    const again = await publish(h, id);
    expect(again.status).toBe(409);
    expect(h.store.threads).toHaveLength(1);
  });

  it("a publish that lost the race takes its thread back", async () => {
    const h = harness();
    const id = await draft(h);
    (h.deps.repo as unknown as { publishProductPost: () => Promise<null> }).publishProductPost = async () => null;
    const res = await publish(h, id);
    expect(res.status).toBe(409);
    expect(h.store.threads.map((t) => t.state)).toEqual(["removed"]);
  });

  it("a published post's blocks can be edited: publishedAt stands, the whole rule applies, and it is audited", async () => {
    const h = harness();
    const id = await draft(h);
    await publish(h, id);
    const edited = await call(h, "PATCH", `${BASE}/product-posts/${id}`, ADA, {
      blocks: [{ block: "feature", value: "Darker mode" }, ...FEATURE.slice(1)],
    });
    expect(edited.status).toBe(200);
    expect(edited.data.post).toMatchObject({ state: "published", publishedAt: NOW });
    expect((edited.data.post as CrewProductPost).blocks[0]).toEqual({ block: "feature", value: "Darker mode" });
    // What it becomes is public at once, so a required block may not be emptied.
    const emptied = await call(h, "PATCH", `${BASE}/product-posts/${id}`, ADA, { blocks: FEATURE.slice(0, 2) });
    expect(emptied.fields).toEqual({ "blocks.try": ["Try it is required"] });
    const audit = h.store.audits.at(-1)!;
    expect(audit.type).toBe("openproduct.product_post.updated");
    expect(audit.payload).toMatchObject({ postId: id, state: "published" });
  });

  it("removes a draft or a published post, audited with what it was", async () => {
    const h = harness();
    const id = await draft(h);
    await publish(h, id);
    const res = await call(h, "DELETE", `${BASE}/product-posts/${id}`, ADA);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ removed: true });
    expect(h.store.audits.at(-1)).toMatchObject({ type: "openproduct.product_post.removed", payload: { postId: id, was: "published" } });
    // Its comment thread goes with it.
    expect(h.store.threads.map((t) => t.state)).toEqual(["removed"]);
    expect((await call(h, "DELETE", `${BASE}/product-posts/${id}`, ADA)).status).toBe(404);
  });
});

describe("milestones, and the stage that follows them", () => {
  async function milestone(h: H, body: unknown = { code: "AS1", title: "Sign in", summary: "Accounts." }) {
    const res = await call(h, "POST", `${BASE}/milestones`, ADA, body);
    expect(res.status).toBe(201);
    return res.data.milestone as { id: string; code: string; position: number; shippedAt: string | null };
  }

  it("creates at the crew literal, appended, and lists in order with the stage", async () => {
    const h = harness();
    const a = await milestone(h);
    const b = await milestone(h, { code: "AS2", title: "Billing" });
    expect(keysOf(a)).toEqual([...CREW_MILESTONE_KEYS]);
    expect([a.position, b.position]).toEqual([0, 1]);
    const list = await call(h, "GET", `${BASE}/milestones`, ADA);
    expect((list.data.milestones as Array<{ code: string }>).map((m) => m.code)).toEqual(["AS1", "AS2"]);
    expect(list.data.stage).toBe("idea");
    expect(h.store.audits.map((x) => x.type)).toEqual(["openproduct.milestone.created", "openproduct.milestone.created"]);
  });

  it.each([
    [{ title: "Sign in" }, "code"],
    [{ code: "x".repeat(21), title: "Sign in" }, "code"],
    [{ code: "AS1" }, "title"],
    [{ code: "AS1", title: "x".repeat(61) }, "title"],
    [{ code: "AS1", title: "two\nlines" }, "title"],
    [{ code: "AS1", title: "Sign in", summary: "x".repeat(201) }, "summary"],
    [{ code: "AS1", title: "Sign in", summary: 7 }, "summary"],
  ])("refuses %j on %s", async (body, field) => {
    const h = harness();
    const res = await call(h, "POST", `${BASE}/milestones`, ADA, body);
    expect(res.status).toBe(422);
    expect(Object.keys(res.fields)).toEqual([field]);
    expect(h.store.milestones).toEqual([]);
  });

  it("edits in place, clears a summary, and 404s a milestone that is not this product's", async () => {
    const h = harness();
    const a = await milestone(h);
    const edited = await call(h, "PATCH", `${BASE}/milestones/${a.id}`, ADA, { title: "Accounts", summary: null });
    expect(edited.data.milestone).toMatchObject({ code: "AS1", title: "Accounts", summary: null });
    expect((await call(h, "PATCH", `${BASE}/milestones/${a.id}`, ADA, { code: "" })).status).toBe(422);
    expect((await call(h, "PATCH", `${BASE}/milestones/pms_${"9".repeat(32)}`, ADA, { title: "X" })).status).toBe(404);
    expect(h.store.audits.at(-1)!.type).toBe("openproduct.milestone.updated");
  });

  it("reorders only when given every milestone once", async () => {
    const h = harness();
    const a = await milestone(h);
    const b = await milestone(h, { code: "AS2", title: "Billing" });
    const ok = await call(h, "PUT", `${BASE}/milestones`, ADA, { order: [b.id, a.id] });
    expect((ok.data.milestones as Array<{ code: string }>).map((m) => m.code)).toEqual(["AS2", "AS1"]);
    expect(h.store.audits.at(-1)!.type).toBe("openproduct.milestone.reordered");
    for (const order of [[a.id], [a.id, a.id], [a.id, "nope"], "x"]) {
      expect([order, (await call(h, "PUT", `${BASE}/milestones`, ADA, { order })).status]).toEqual([order, 422]);
    }
  });

  it("the first shipped milestone makes the product shipping; taking it back makes it an idea again", async () => {
    const h = harness();
    const a = await milestone(h);
    const shipped = await call(h, "PUT", `${BASE}/milestones/${a.id}/shipped`, ADA);
    expect(shipped.status).toBe(200);
    expect(shipped.data).toMatchObject({ stage: "shipping", milestone: { shippedAt: NOW } });
    expect(h.store.audits.map((x) => x.type)).toContain("openproduct.milestone.shipped");

    const back = await call(h, "DELETE", `${BASE}/milestones/${a.id}/shipped`, ADA);
    expect(back.data).toMatchObject({ stage: "idea", milestone: { shippedAt: null }, offeredPost: null });
    expect(h.store.audits.at(-1)!.type).toBe("openproduct.milestone.unshipped");
  });

  it("deleting the only shipped milestone makes the product an idea again, and says so", async () => {
    const h = harness();
    const a = await milestone(h);
    await call(h, "PUT", `${BASE}/milestones/${a.id}/shipped`, ADA);
    const res = await call(h, "DELETE", `${BASE}/milestones/${a.id}`, ADA);
    expect(res.data).toEqual({ deleted: true, stage: "idea" });
    expect(h.store.audits.at(-1)!.type).toBe("openproduct.milestone.deleted");
    expect((await call(h, "DELETE", `${BASE}/milestones/${a.id}`, ADA)).status).toBe(404);
  });

  it("holds a product to sixty milestones", async () => {
    const h = harness();
    for (let i = 0; i < 60; i += 1) await milestone(h, { code: `M${i}`, title: `Milestone ${i}` });
    expect((await call(h, "POST", `${BASE}/milestones`, ADA, { code: "M61", title: "One more" })).status).toBe(409);
  });
});

describe("posts that write themselves (design §6.2)", () => {
  it("a milestone marked shipped offers a DRAFT Feature shipped post, prefilled from it", async () => {
    const h = harness({ tryUrl: "https://try.example.com/" });
    const created = await call(h, "POST", `${BASE}/milestones`, ADA, { code: "AS3", title: "Dark mode", summary: "Follows the system theme." });
    const mid = (created.data.milestone as { id: string }).id;
    const res = await call(h, "PUT", `${BASE}/milestones/${mid}/shipped`, ADA);

    const offered = res.data.offeredPost as CrewProductPost;
    expect(keysOf(offered)).toEqual([...CREW_PRODUCT_POST_KEYS]);
    expect(offered).toMatchObject({ kind: "feature", state: "draft", publishedAt: null, milestoneId: mid });
    expect(offered.blocks).toEqual([
      { block: "feature", value: "Dark mode" },
      { block: "what", value: "Follows the system theme." },
      { block: "try", value: "https://try.example.com/" },
      { block: "milestone", value: "AS3" },
    ]);
    // Offered, never published: nothing reached the feed, and no thread exists.
    expect(((await call(h, "GET", `${PUBLIC}/product-posts`, null)).data.posts as unknown[]).length).toBe(0);
    expect(h.store.threads).toEqual([]);
    // The system wrote it; whoever presses Post becomes its author.
    expect(h.store.posts[0]!.authorSubjectId).toBeNull();
    expect(h.store.audits.at(-1)).toMatchObject({
      type: "openproduct.product_post.created",
      payload: { source: "milestone", milestoneId: mid, kind: "feature" },
    });
    // And the offered draft is complete, so it can be posted as it is.
    expect((await publish(h, offered.id)).status).toBe(200);
    expect(h.store.posts[0]!.authorSubjectId).toBe(ADA.subjectId);
  });

  it("offers nothing when there is no Try it address to fill in — the draft waits for one", async () => {
    const h = harness();
    const created = await call(h, "POST", `${BASE}/milestones`, ADA, { code: "AS3", title: "Dark mode" });
    const res = await call(h, "PUT", `${BASE}/milestones/${(created.data.milestone as { id: string }).id}/shipped`, ADA);
    expect((res.data.offeredPost as CrewProductPost).blocks).toEqual([
      { block: "feature", value: "Dark mode" },
      { block: "milestone", value: "AS3" },
    ]);
  });

  it("offers one post per milestone: pressing shipped again, or un-shipping and re-shipping, offers no second", async () => {
    const h = harness();
    const created = await call(h, "POST", `${BASE}/milestones`, ADA, { code: "AS3", title: "Dark mode" });
    const url = `${BASE}/milestones/${(created.data.milestone as { id: string }).id}/shipped`;
    expect((await call(h, "PUT", url, ADA)).data.offeredPost).not.toBeNull();
    expect((await call(h, "PUT", url, ADA)).data.offeredPost).toBeNull();
    await call(h, "DELETE", url, ADA);
    expect((await call(h, "PUT", url, ADA)).data.offeredPost).toBeNull();
    expect(h.store.posts).toHaveLength(1);
  });

  it("a draft that cannot be written does not fail the mark — the milestone shipped", async () => {
    const h = harness();
    const created = await call(h, "POST", `${BASE}/milestones`, ADA, { code: "AS3", title: "Dark mode" });
    (h.deps.repo as unknown as { createProductPost: () => Promise<never> }).createProductPost = async () => {
      throw new Error("the table is away");
    };
    const res = await call(h, "PUT", `${BASE}/milestones/${(created.data.milestone as { id: string }).id}/shipped`, ADA);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ stage: "shipping", offeredPost: null });
  });

  it("opening a seat offers a DRAFT Help wanted post, prefilled and cut to the template's limits", async () => {
    const h = harness();
    const res = await call(h, "POST", `${BASE}/role-openings`, ADA, {
      title: `Maintainer ${"of everything ".repeat(7)}`,
      description: "Keep the lights on.",
      commitment: "A few hours a week",
    });
    expect(res.status).toBe(201);
    const [post] = h.store.posts;
    // The answer names the draft it prepared, so the page that opened the
    // seat can offer "Continue" on it.
    expect(keysOf(res.data)).toEqual(["offeredPostId", "roleOpening"]);
    expect(res.data.offeredPostId).toMatch(/^ppo_[0-9a-f]{32}$/);
    expect((await call(h, "GET", `${BASE}/product-posts`, ADA)).data.posts).toEqual([
      expect.objectContaining({ id: res.data.offeredPostId, kind: "seat", state: "draft" }),
    ]);
    expect(post).toMatchObject({ kind: "seat", state: "draft", authorSubjectId: null });
    expect(post!.roleOpeningId).toBe(h.store.openings[0]!.id);
    expect(post!.blocks.map((b) => b.block)).toEqual(["role", "what", "time"]);
    expect(post!.blocks[0]!.value.length).toBeLessThanOrEqual(60);
    expect(post!.blocks.slice(1)).toEqual([
      { block: "what", value: "Keep the lights on." },
      { block: "time", value: "A few hours a week" },
    ]);
    expect(h.store.audits.map((a) => a.type)).toEqual([
      "openproduct.role_opening.created",
      "openproduct.product_post.created",
    ]);
    expect(h.store.audits[1]!.payload).toMatchObject({ source: "role_opening", kind: "seat" });
    // It waits in "Needs you"; nothing is public.
    expect(((await call(h, "GET", `${PUBLIC}/product-posts`, null)).data.posts as unknown[]).length).toBe(0);
  });

  it("editing a seat, or opening one that is not open, offers nothing", async () => {
    const h = harness();
    const filled = await call(h, "POST", `${BASE}/role-openings`, ADA, { title: "Filled already", status: "filled" });
    expect(filled.data.offeredPostId).toBeNull();
    expect(h.store.posts).toEqual([]);
    await call(h, "POST", `${BASE}/role-openings`, ADA, { title: "Maintainer" });
    expect(h.store.posts).toHaveLength(1);
    const id = seatId(h.store.openings.find((o) => o.title === "Maintainer")!.id);
    const edited = await call(h, "PUT", `${BASE}/role-openings/${id}`, ADA, { title: "Maintainer, evenings" });
    expect(edited.data.offeredPostId).toBeNull();
    expect(h.store.posts).toHaveLength(1);
  });

  it("a listing's FIRST publish writes its New idea post — as a draft, because a listing cannot say who has the problem", async () => {
    const h = harness({ visibility: "private", publishedAt: null });
    const res = await call(h, "POST", `${BASE}/publish`, ADA);
    expect(res.status).toBe(200);
    const [post] = h.store.posts;
    expect(post).toMatchObject({ kind: "idea", state: "draft", authorSubjectId: null, publishedAt: null });
    // Problem = the tagline. "Who has it" is required and the listing holds
    // nothing that answers it, so the post waits for the crew.
    expect(post!.blocks).toEqual([{ block: "problem", value: "A thing, built in the open" }]);
    expect(h.store.threads).toEqual([]);
    expect(h.store.audits.map((a) => a.type)).toEqual([
      "openproduct.profile.published",
      "openproduct.product_post.created",
    ]);
    expect(h.store.audits[1]!.payload).toMatchObject({ source: "listing", kind: "idea" });
    expect(((await call(h, "GET", `${PUBLIC}/product-posts`, null)).data.posts as unknown[]).length).toBe(0);
  });

  it("the idea post falls back to the pitch's opening when there is no tagline", async () => {
    const h = harness({ visibility: "private", publishedAt: null, tagline: null, pitchBody: "We are building a thing.\n\nIn the open." });
    await call(h, "POST", `${BASE}/publish`, ADA);
    expect(h.store.posts[0]!.blocks).toEqual([{ block: "problem", value: "We are building a thing." }]);
  });

  it("a listing published AGAIN writes no second idea post", async () => {
    // Unpublished and published again: `published_at` is the first publish's.
    const h = harness({ visibility: "private", publishedAt: "2026-11-01T00:00:00.000Z" });
    const res = await call(h, "POST", `${BASE}/publish`, ADA);
    expect(res.status).toBe(200);
    expect(h.store.posts).toEqual([]);
    expect(h.store.audits.map((a) => a.type)).toEqual(["openproduct.profile.published"]);
  });
});

describe("Needs you — pending requests and drafts, in one read", () => {
  it("answers both at their literals; a request carries its reference, where it is decided", async () => {
    const h = harness();
    await draft(h, "idea", []);
    await publish(h, await draft(h));
    const res = await call(h, "GET", `${BASE}/needs-you`, ADA);
    expect(res.status).toBe(200);
    const needsYou = res.data.needsYou as { requests: Array<Record<string, unknown>>; drafts: CrewProductPost[] };
    expect(keysOf(needsYou)).toEqual([...CREW_NEEDS_YOU_KEYS]);
    expect(keysOf(needsYou.requests[0])).toEqual([...CREW_SEAT_REQUEST_KEYS]);
    expect(needsYou.requests[0]).toEqual({
      id: "e1111111-1111-4111-8111-111111111111",
      roleOpeningId: seatId("77777777-7777-4777-8777-777777777777"),
      roleTitle: "Maintainer",
      requestRef: "jrq_1",
      requester: { handle: null, displayName: "Bea Park" },
      createdAt: NOW,
    });
    // The drafts only — a published post needs nobody.
    expect(needsYou.drafts.map((d) => `${d.kind}:${d.state}`)).toEqual(["idea:draft"]);
    // No requester's subject id crosses the wire.
    expect(JSON.stringify(needsYou)).not.toContain("usr_");
  });
});

describe("the profile PATCH takes the Try it address, and still the name and the tagline", () => {
  it("accepts an http or https address, normalised, and the maintainer shape carries it with the stage", async () => {
    const h = harness();
    const res = await call(h, "PATCH", BASE, ADA, { tryUrl: "http://PREVIEW.example.com/app" });
    expect(res.status).toBe(200);
    expect(res.data.profile).toMatchObject({ tryUrl: "http://preview.example.com/app", stage: "idea" });
    expect(h.store.audits.at(-1)!.type).toBe("openproduct.profile.updated");
  });

  it.each([null, ""])("clears it with %j", async (value) => {
    const h = harness({ tryUrl: "https://try.example.com/" });
    const res = await call(h, "PATCH", BASE, ADA, { tryUrl: value });
    expect((res.data.profile as { tryUrl: string | null }).tryUrl).toBeNull();
  });

  it.each(["example.com", "javascript:alert(1)", "ftp://example.com/x", 7, `https://example.com/${"a".repeat(200)}`])(
    "refuses %j",
    async (value) => {
      const h = harness();
      const res = await call(h, "PATCH", BASE, ADA, { tryUrl: value });
      expect(res.status).toBe(422);
      expect(Object.keys(res.fields)).toEqual(["tryUrl"]);
      expect(h.store.calls.some((c) => c.startsWith("updateProfile:"))).toBe(false);
    },
  );

  it("leaves the address alone when the body does not name it, and edits the name and the tagline in place", async () => {
    const h = harness({ tryUrl: "https://try.example.com/" });
    const res = await call(h, "PATCH", BASE, ADA, { slug: "acme-renamed", tagline: "A better line" });
    expect(res.status).toBe(200);
    expect(res.data.profile).toMatchObject({ slug: "acme-renamed", tagline: "A better line", tryUrl: "https://try.example.com/" });
    expect(h.store.calls).toContain('updateProfile:{"tagline":"A better line","slug":"acme-renamed"}');
  });

  it("the stage is not the crew's to set by hand", async () => {
    const h = harness();
    const res = await call(h, "PATCH", BASE, ADA, { stage: "shipping" });
    expect(res.status).toBe(200);
    expect((res.data.profile as { stage: string }).stage).toBe("idea");
  });
});

describe("search says a product's stage and what a person makes", () => {
  function searchHarness() {
    const calls: string[] = [];
    const repo = {
      async searchCandidates() {
        return [
          { kind: "product", entityId: "kettleworks", title: "kettleworks", summary: "A job queue", terms: ["kettleworks"], facets: {} },
          { kind: "product", entityId: "kettle-notes", title: "kettle-notes", summary: null, terms: ["kettle", "notes"], facets: {} },
        ];
      },
      async searchPublicContributors() {
        return [{ handle: "kettle-ada", displayName: "Ada Iyer", bio: null }];
      },
      async listPublicMediaForSlugs() {
        return new Map();
      },
      async listStagesForSlugs(slugs: readonly string[]) {
        calls.push(`stages:${slugs.join("|")}`);
        return new Map([["kettleworks", "shipping" as const]]);
      },
      async listProductsForHandles(handles: readonly string[], perPerson: number) {
        calls.push(`products:${handles.join("|")}:${perPerson}`);
        return new Map([["kettle-ada", [{ slug: "kettleworks", tagline: "A job queue", stage: "shipping" as const }]]]);
      },
    } as unknown as OpenproductRepository;
    return { calls, deps: { repo } as unknown as ProfileHandlerDeps };
  }

  async function search(deps: ProfileHandlerDeps) {
    const res = await route(new Request(`${PUBLIC}/search?q=kettle`), ENV, deps);
    return (await res.json()) as {
      data: {
        results: Array<Record<string, unknown>>;
        makers: Array<{ handle: string; products: Array<Record<string, unknown>> }>;
      };
    };
  }

  it("a product hit carries its stage, read once after the rank; one the read does not find carries null", async () => {
    const h = searchHarness();
    const body = await search(h.deps);
    expect(keysOf(body.data.results[0])).toEqual([...SEARCH_RESULT_KEYS]);
    expect(Object.fromEntries(body.data.results.map((r) => [r.entityId, r.stage]))).toEqual({
      kettleworks: "shipping",
      "kettle-notes": null,
    });
    // ONE read, for every ranked product hit at once.
    const reads = h.calls.filter((c) => c.startsWith("stages:"));
    expect(reads).toHaveLength(1);
    expect(reads[0]!.slice("stages:".length).split("|").sort()).toEqual(["kettle-notes", "kettleworks"]);
  });

  it("a person carries their listed products as {slug, name, stage}, bounded at six", async () => {
    const h = searchHarness();
    const body = await search(h.deps);
    expect(keysOf(body.data.makers[0])).toEqual([...SEARCH_PERSON_KEYS]);
    expect(body.data.makers[0]!.products).toEqual([{ slug: "kettleworks", name: "kettleworks", stage: "shipping" }]);
    expect(keysOf(body.data.makers[0]!.products[0])).toEqual([...PRODUCT_REF_KEYS]);
    expect(h.calls).toContain("products:kettle-ada:6");
  });

  it("either read failing costs its own decoration, never the search", async () => {
    const h = searchHarness();
    Object.assign(h.deps.repo, {
      async listStagesForSlugs() {
        throw new Error("down");
      },
      async listProductsForHandles() {
        throw new Error("down");
      },
    });
    const body = await search(h.deps);
    expect(body.data.results.map((r) => r.stage)).toEqual([null, null]);
    expect(body.data.makers[0]!.products).toEqual([]);
  });
});
