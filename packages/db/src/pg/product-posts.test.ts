// The openproduct repository against a live engine — stage and milestones,
// product posts and their reactions (openproduct-redesign OPR-3).
//
// What is pinned here is what the SQL is trusted for: that a product's stage
// follows its milestones, that a draft or a removed post is in no public
// read, that the feed pages newest first by position, that a person holds one
// reaction per post and an author none on their own, and that the whole of it
// leaves with the listing and with the subject.

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { purgeContext } from "../purge.js";
import { sql, repo, ORG, PROJECT_TWO, PROFILE, PROFILE_TWO, OPENING, ACTOR, NOW, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

const ADA = "usr_0000000000000000000000000000ada0";
const BOB = "usr_0000000000000000000000000000bob0";
const M1 = asUuid("a1111111-1111-4111-8111-111111111111");
const M2 = asUuid("a2222222-2222-4222-8222-222222222222");
const M3 = asUuid("a3333333-3333-4333-8333-333333333333");
const P1 = asUuid("b1111111-1111-4111-8111-111111111111");
const P2 = asUuid("b2222222-2222-4222-8222-222222222222");
const P3 = asUuid("b3333333-3333-4333-8333-333333333333");
const T1 = asUuid("c1111111-1111-4111-8111-111111111111");
const T2 = asUuid("c2222222-2222-4222-8222-222222222222");
const T3 = asUuid("c3333333-3333-4333-8333-333333333333");

const FEATURE = [
  { block: "feature", value: "Dark mode" },
  { block: "what", value: "The whole app follows the system theme." },
  { block: "try", value: "https://example.com/app" },
];

/** A thread row under the system's `post` tag, the way core makes one at publish. */
async function thread(id: string, profileId: string = PROFILE, at = NOW) {
  await repo.createThread({ id: asUuid(id), profileId, tag: "post", title: "Feature shipped on acme-thing", authorSubjectId: ACTOR, at });
  return id;
}

async function published(id: typeof P1, threadId: string, at: string, profileId: typeof PROFILE = PROFILE) {
  await repo.createProductPost({ id, profileId, kind: "feature", authorSubjectId: ACTOR, blocks: FEATURE });
  await thread(threadId, profileId, at);
  return repo.publishProductPost(profileId, id, { at, blocks: FEATURE, threadId, authorSubjectId: ACTOR });
}

async function makePublic(subjectId: string, handle: string, displayName: string) {
  await repo.upsertContributor({ subjectId, displayName, bio: "Builds things." });
  await repo.claimHandle(handle, subjectId, NOW);
  await repo.setProfileVisibility(subjectId, true, NOW);
}

describe("OPR-3 — the schema (2265, 2270)", () => {
  it("a listing is an idea with no Try it address until somebody says otherwise", async () => {
    const draft = await seedDraft();
    expect(draft.stage).toBe("idea");
    expect(draft.tryUrl).toBeNull();
  });

  it("a new listing's Try it address starts as the address it declared", async () => {
    const created = await repo.createProfile({
      id: PROFILE,
      orgId: ORG,
      projectId: PROJECT_TWO,
      slug: "with-live",
      createdBy: ACTOR,
      liveUrl: "https://live.example.com/",
    });
    expect(created.tryUrl).toBe("https://live.example.com/");
  });

  it("2265's backfill copies live_url into an empty try_url and nothing else, and re-running it changes nothing", async () => {
    await seedDraft();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "second-thing");
    await sql.execute(`UPDATE openproduct.profiles SET live_url = 'https://live.example.com/', try_url = NULL WHERE id = $1`, [PROFILE]);
    await sql.execute(`UPDATE openproduct.profiles SET live_url = 'https://old.example.com/', try_url = 'https://try.example.com/' WHERE id = $1`, [PROFILE_TWO]);
    const backfill = `UPDATE openproduct.profiles SET try_url = live_url WHERE try_url IS NULL AND live_url IS NOT NULL`;
    await sql.execute(backfill);
    await sql.execute(backfill);
    const rows = await sql.execute<{ slug: string; try_url: string | null }>(`SELECT slug, try_url FROM openproduct.profiles ORDER BY slug`);
    expect(rows.rows).toEqual([
      { slug: "acme-thing", try_url: "https://live.example.com/" },
      { slug: "second-thing", try_url: "https://try.example.com/" },
    ]);
  });

  it("the stage, the kind, the state and the reaction are closed vocabularies in the schema", async () => {
    await seedPublished();
    await expect(sql.execute(`UPDATE openproduct.profiles SET stage = 'launched' WHERE id = $1`, [PROFILE])).rejects.toThrow();
    await expect(
      sql.execute(`INSERT INTO openproduct.product_posts (id, profile_id, kind) VALUES ($1, $2, 'poll')`, [P1, PROFILE]),
    ).rejects.toThrow();
    await expect(
      sql.execute(`INSERT INTO openproduct.product_posts (id, profile_id, kind, state) VALUES ($1, $2, 'idea', 'archived')`, [P1, PROFILE]),
    ).rejects.toThrow();
    // A published post names its moment; a draft has none.
    await expect(
      sql.execute(`INSERT INTO openproduct.product_posts (id, profile_id, kind, state) VALUES ($1, $2, 'idea', 'published')`, [P1, PROFILE]),
    ).rejects.toThrow();
    await expect(
      sql.execute(`INSERT INTO openproduct.product_posts (id, profile_id, kind, published_at) VALUES ($1, $2, 'idea', now())`, [P1, PROFILE]),
    ).rejects.toThrow();
    await published(P1, T1, NOW);
    await expect(
      sql.execute(`INSERT INTO openproduct.product_post_reactions (post_id, subject_id, reaction) VALUES ($1, $2, 'like')`, [P1, ADA]),
    ).rejects.toThrow();
  });

  it("a thread may carry the system's `post` tag, and still nothing outside the vocabulary", async () => {
    await seedPublished();
    await thread(T1);
    await expect(
      sql.execute(
        `INSERT INTO openproduct.threads (id, profile_id, tag, title, author_subject_id) VALUES ($1, $2, 'chat', 'x', $3)`,
        [T2, PROFILE, ACTOR],
      ),
    ).rejects.toThrow();
  });

  it("a milestone is held to the Feature shipped post's limits", async () => {
    await seedDraft();
    const insert = (code: string, title: string, summary: string | null) =>
      sql.execute(
        `INSERT INTO openproduct.product_milestones (id, profile_id, code, title, summary) VALUES ($1, $2, $3, $4, $5)`,
        [M1, PROFILE, code, title, summary],
      );
    await expect(insert("x".repeat(21), "Title", null)).rejects.toThrow();
    await expect(insert("AS1", "x".repeat(61), null)).rejects.toThrow();
    await expect(insert("AS1", "Title", "x".repeat(201))).rejects.toThrow();
    await expect(insert("", "Title", null)).rejects.toThrow();
    await insert("AS1", "x".repeat(60), "x".repeat(200));
  });
});

describe("OPR-3 — milestones, and the stage that follows them", () => {
  it("appends in order, edits in place, and reads back in the crew's order", async () => {
    await seedDraft();
    const a = await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: "Accounts." });
    const b = await repo.createProductMilestone({ id: M2, profileId: PROFILE, code: "AS2", title: "Billing", summary: null });
    expect([a.position, b.position]).toEqual([0, 1]);
    expect(a.shippedAt).toBeNull();

    const edited = await repo.updateProductMilestone(PROFILE, M2, { title: "Payments", summary: "Cards." });
    expect(edited).toMatchObject({ code: "AS2", title: "Payments", summary: "Cards." });
    const cleared = await repo.updateProductMilestone(PROFILE, M2, { summary: null });
    expect(cleared?.summary).toBeNull();
    expect(cleared?.title).toBe("Payments");

    expect((await repo.listProductMilestones(PROFILE)).map((m) => m.code)).toEqual(["AS1", "AS2"]);
  });

  it("a milestone is its product's — another product's id finds nothing", async () => {
    await seedDraft();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "second-thing");
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    expect(await repo.updateProductMilestone(PROFILE_TWO, M1, { title: "Theirs" })).toBeNull();
    expect(await repo.setProductMilestoneShipped(PROFILE_TWO, M1, NOW)).toBeNull();
    expect(await repo.deleteProductMilestone(PROFILE_TWO, M1)).toBe(false);
    expect((await repo.listProductMilestones(PROFILE))[0]?.title).toBe("Sign in");
  });

  it("reorders only when given every milestone once", async () => {
    await seedDraft();
    for (const [id, code] of [[M1, "A"], [M2, "B"], [M3, "C"]] as const) {
      await repo.createProductMilestone({ id, profileId: PROFILE, code, title: `Milestone ${code}`, summary: null });
    }
    const reordered = await repo.reorderProductMilestones(PROFILE, [M3, M1, M2]);
    expect(reordered?.map((m) => `${m.code}:${m.position}`)).toEqual(["C:0", "A:1", "B:2"]);
    expect(await repo.reorderProductMilestones(PROFILE, [M3, M1])).toBeNull();
    expect(await repo.reorderProductMilestones(PROFILE, [M3, M1, M1])).toBeNull();
    expect(await repo.reorderProductMilestones(PROFILE, [M3, M1, P1])).toBeNull();
    expect((await repo.listProductMilestones(PROFILE)).map((m) => m.code)).toEqual(["C", "A", "B"]);
    expect(await repo.reorderProductMilestones(PROFILE_TWO, [])).toEqual([]);
  });

  it("the product is shipping from its first shipped milestone, and an idea again when none is", async () => {
    await seedPublished();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    await repo.createProductMilestone({ id: M2, profileId: PROFILE, code: "AS2", title: "Billing", summary: null });
    expect((await repo.getPublicProfile("acme-thing"))?.stage).toBe("idea");

    const first = await repo.setProductMilestoneShipped(PROFILE, M1, NOW);
    expect(first).toMatchObject({ stage: "shipping", changed: true });
    expect(first?.milestone.shippedAt).toBe(new Date(NOW).toISOString());
    expect((await repo.getPublicProfile("acme-thing"))?.stage).toBe("shipping");

    // A second press is not a second ship: the first moment stands.
    const again = await repo.setProductMilestoneShipped(PROFILE, M1, "2026-09-01T00:00:00.000Z");
    expect(again).toMatchObject({ stage: "shipping", changed: false });
    expect(again?.milestone.shippedAt).toBe(first?.milestone.shippedAt);

    await repo.setProductMilestoneShipped(PROFILE, M2, NOW);
    const backOne = await repo.setProductMilestoneShipped(PROFILE, M1, null);
    expect(backOne).toMatchObject({ stage: "shipping", changed: true });
    expect(backOne?.milestone.shippedAt).toBeNull();

    const backBoth = await repo.setProductMilestoneShipped(PROFILE, M2, null);
    expect(backBoth).toMatchObject({ stage: "idea", changed: true });
    expect((await repo.getPublicProfile("acme-thing"))?.stage).toBe("idea");
  });

  it("deleting the only shipped milestone makes the product an idea again", async () => {
    await seedPublished();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    await repo.setProductMilestoneShipped(PROFILE, M1, NOW);
    expect(await repo.deleteProductMilestone(PROFILE, M1)).toBe(true);
    expect((await repo.getPublicProfile("acme-thing"))?.stage).toBe("idea");
    expect(await repo.deleteProductMilestone(PROFILE, M1)).toBe(false);
  });

  it("the stage reaches the directory card and the materialised catalogue", async () => {
    await seedPublished();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    expect((await repo.listPublicCards(10))[0]?.stage).toBe("idea");
    await repo.setProductMilestoneShipped(PROFILE, M1, NOW);
    expect((await repo.listPublicCards(10))[0]?.stage).toBe("shipping");
    await repo.rebuildCatalogue({ now: NOW, mergesSince: NOW, endorsementsSince: NOW });
    expect((await repo.listCataloguePage({ cursor: null, limit: 10 })).cards[0]?.stage).toBe("shipping");
  });

  it("a draft listing's milestones are not in the public read", async () => {
    await seedDraft();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    expect(await repo.listPublicProductMilestones(PROFILE)).toEqual([]);
    expect(await repo.listProductMilestones(PROFILE)).toHaveLength(1);
  });

  it("a listed listing's milestones are, in order", async () => {
    await seedPublished();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    await repo.createProductMilestone({ id: M2, profileId: PROFILE, code: "AS2", title: "Billing", summary: null });
    await repo.reorderProductMilestones(PROFILE, [M2, M1]);
    expect((await repo.listPublicProductMilestones(PROFILE)).map((m) => m.code)).toEqual(["AS2", "AS1"]);
  });

  it("updateProfile sets and clears the Try it address and leaves it alone when not named", async () => {
    await seedDraft();
    const set = await repo.updateProfile(ORG, PROFILE, { tryUrl: "https://try.example.com/", updatedBy: ACTOR });
    expect(set?.tryUrl).toBe("https://try.example.com/");
    const untouched = await repo.updateProfile(ORG, PROFILE, { tagline: "Another line", updatedBy: ACTOR });
    expect(untouched?.tryUrl).toBe("https://try.example.com/");
    const cleared = await repo.updateProfile(ORG, PROFILE, { tryUrl: null, updatedBy: ACTOR });
    expect(cleared?.tryUrl).toBeNull();
  });
});

describe("OPR-3 — a product post, from draft to removed", () => {
  it("is created a draft, with its blocks as written and no thread", async () => {
    await seedPublished();
    const draft = await repo.createProductPost({ id: P1, profileId: PROFILE, kind: "feature", authorSubjectId: ACTOR, blocks: FEATURE });
    expect(draft).toMatchObject({
      id: P1,
      kind: "feature",
      state: "draft",
      authorSubjectId: ACTOR,
      blocks: FEATURE,
      publishedAt: null,
      threadId: null,
      milestoneId: null,
      roleOpeningId: null,
      launchId: null,
    });
    expect(await repo.getProductPost(PROFILE, P1)).toEqual(draft);
    expect(await repo.getProductPost(PROFILE_TWO, P1)).toBeNull();
  });

  it("a draft's blocks are rewritten in place", async () => {
    await seedPublished();
    await repo.createProductPost({ id: P1, profileId: PROFILE, kind: "feature", authorSubjectId: ACTOR, blocks: [] });
    const updated = await repo.updateProductPostBlocks(PROFILE, P1, FEATURE.slice(0, 2));
    expect(updated?.blocks).toEqual(FEATURE.slice(0, 2));
    expect(updated?.state).toBe("draft");
    expect(await repo.updateProductPostBlocks(PROFILE_TWO, P1, FEATURE)).toBeNull();
  });

  it("publishes once: the moment, the thread, the publisher, and its links", async () => {
    await seedPublished();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    await repo.createProductPost({ id: P1, profileId: PROFILE, kind: "feature", authorSubjectId: null, blocks: [] });
    await thread(T1);
    const live = await repo.publishProductPost(PROFILE, P1, {
      at: NOW,
      blocks: FEATURE,
      threadId: T1,
      authorSubjectId: ADA,
      milestoneId: M1,
    });
    expect(live).toMatchObject({
      state: "published",
      publishedAt: new Date(NOW).toISOString(),
      threadId: T1,
      authorSubjectId: ADA,
      milestoneId: M1,
      blocks: FEATURE,
    });
    // A second press finds no draft.
    await thread(T2);
    expect(await repo.publishProductPost(PROFILE, P1, { at: "2026-09-01T00:00:00.000Z", blocks: [], threadId: T2 })).toBeNull();
    expect((await repo.getProductPost(PROFILE, P1))?.publishedAt).toBe(new Date(NOW).toISOString());
  });

  it("an edit to a published post keeps the moment it was published", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    const edited = await repo.updateProductPostBlocks(PROFILE, P1, [{ block: "feature", value: "Darker mode" }, ...FEATURE.slice(1)]);
    expect(edited?.state).toBe("published");
    expect(edited?.publishedAt).toBe(new Date(NOW).toISOString());
    expect((await repo.getPublicProductPost(P1))?.blocks[0]?.value).toBe("Darker mode");
  });

  it("a removed post leaves the crew's reads and cannot be edited, published or removed again", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    await repo.createProductPost({ id: P2, profileId: PROFILE, kind: "idea", authorSubjectId: ACTOR, blocks: [] });
    expect((await repo.removeProductPost(PROFILE, P1))?.state).toBe("removed");
    expect((await repo.removeProductPost(PROFILE, P2))?.state).toBe("removed");
    expect(await repo.removeProductPost(PROFILE, P1)).toBeNull();
    expect(await repo.getProductPost(PROFILE, P1)).toBeNull();
    expect(await repo.updateProductPostBlocks(PROFILE, P1, FEATURE)).toBeNull();
    await thread(T2);
    expect(await repo.publishProductPost(PROFILE, P2, { at: NOW, blocks: [], threadId: T2 })).toBeNull();
    expect(await repo.listProductPostsForProfile(PROFILE)).toEqual([]);
  });

  it("the crew's list holds drafts and published, and the drafts read only drafts", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    await repo.createProductPost({ id: P2, profileId: PROFILE, kind: "seat", authorSubjectId: ACTOR, blocks: [] });
    expect((await repo.listProductPostsForProfile(PROFILE)).map((p) => p.state).sort()).toEqual(["draft", "published"]);
    expect((await repo.listProductPostDrafts(PROFILE)).map((p) => p.id)).toEqual([P2]);
  });

  it("`unless` writes nothing when the product already holds that post — and a removed one does not count", async () => {
    await seedPublished();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Maintainer" });

    const forMilestone = { profileId: PROFILE, kind: "feature" as const, authorSubjectId: null, blocks: [], milestoneId: M1, unless: "milestone" as const };
    expect(await repo.createProductPost({ id: P1, ...forMilestone })).not.toBeNull();
    expect(await repo.createProductPost({ id: P2, ...forMilestone })).toBeNull();
    await repo.removeProductPost(PROFILE, P1);
    expect(await repo.createProductPost({ id: P2, ...forMilestone })).not.toBeNull();

    const forSeat = { profileId: PROFILE, kind: "seat" as const, authorSubjectId: null, blocks: [], roleOpeningId: OPENING, unless: "role_opening" as const };
    expect(await repo.createProductPost({ id: P3, ...forSeat })).not.toBeNull();
    expect(await repo.createProductPost({ id: asUuid("b4444444-4444-4444-8444-444444444444"), ...forSeat })).toBeNull();

    const idea = { profileId: PROFILE, kind: "idea" as const, authorSubjectId: null, blocks: [], unless: "idea" as const };
    expect(await repo.createProductPost({ id: asUuid("b5555555-5555-4555-8555-555555555555"), ...idea })).not.toBeNull();
    expect(await repo.createProductPost({ id: asUuid("b6666666-6666-4666-8666-666666666666"), ...idea })).toBeNull();
    // Without `unless`, a second post of the same shape is the crew's to write.
    expect(
      await repo.createProductPost({ id: asUuid("b7777777-7777-4777-8777-777777777777"), profileId: PROFILE, kind: "idea", authorSubjectId: ACTOR, blocks: [] }),
    ).not.toBeNull();
  });

  it("a post's links go NULL with what they point at, and the post stays", async () => {
    await seedPublished();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Maintainer" });
    await repo.createProductPost({ id: P1, profileId: PROFILE, kind: "feature", authorSubjectId: ACTOR, blocks: [], milestoneId: M1 });
    await repo.createProductPost({ id: P2, profileId: PROFILE, kind: "seat", authorSubjectId: ACTOR, blocks: [], roleOpeningId: OPENING });
    await repo.deleteProductMilestone(PROFILE, M1);
    await repo.deleteRoleOpening(PROFILE, OPENING);
    expect((await repo.getProductPost(PROFILE, P1))?.milestoneId).toBeNull();
    expect((await repo.getProductPost(PROFILE, P2))?.roleOpeningId).toBeNull();
  });
});

describe("OPR-3 — the public reads never hold a draft, a removed post or an unlisted product", () => {
  it("a draft is in no public read", async () => {
    await seedPublished();
    await repo.createProductPost({ id: P1, profileId: PROFILE, kind: "feature", authorSubjectId: ACTOR, blocks: FEATURE });
    expect((await repo.listPublicProductPosts({ cursor: null, limit: 20 })).posts).toEqual([]);
    expect((await repo.listPublicProductPostsForProfile(PROFILE, { cursor: null, limit: 20 })).posts).toEqual([]);
    expect(await repo.getPublicProductPost(P1)).toBeNull();
  });

  it("a removed post is in no public read", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    expect(await repo.getPublicProductPost(P1)).not.toBeNull();
    await repo.removeProductPost(PROFILE, P1);
    expect((await repo.listPublicProductPosts({ cursor: null, limit: 20 })).posts).toEqual([]);
    expect((await repo.listPublicProductPostsForProfile(PROFILE, { cursor: null, limit: 20 })).posts).toEqual([]);
    expect(await repo.getPublicProductPost(P1)).toBeNull();
  });

  it("a published post on a listing that is private, delisted or removed is in no public read", async () => {
    await seedPublished();
    await published(P1, T1, NOW);

    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect((await repo.listPublicProductPosts({ cursor: null, limit: 20 })).posts).toEqual([]);
    expect(await repo.getPublicProductPost(P1)).toBeNull();

    await sql.execute(`UPDATE openproduct.profiles SET visibility = 'public' WHERE id = $1`, [PROFILE]);
    expect(await repo.getPublicProductPost(P1)).not.toBeNull();

    for (const state of ["delisted", "removed"]) {
      await sql.execute(`UPDATE openproduct.profiles SET moderation_state = $2, moderated_at = now() WHERE id = $1`, [PROFILE, state]);
      expect([state, (await repo.listPublicProductPosts({ cursor: null, limit: 20 })).posts]).toEqual([state, []]);
      expect([state, (await repo.listPublicProductPostsForProfile(PROFILE, { cursor: null, limit: 20 })).posts]).toEqual([state, []]);
      expect([state, await repo.getPublicProductPost(P1)]).toEqual([state, null]);
    }
  });

  it("a published post carries what its card draws", async () => {
    await seedPublished();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    await repo.setProductMilestoneShipped(PROFILE, M1, NOW);
    await published(P1, T1, NOW);
    expect(await repo.getPublicProductPost(P1)).toEqual({
      id: P1,
      kind: "feature",
      blocks: FEATURE,
      publishedAt: new Date(NOW).toISOString(),
      threadId: T1,
      authorSubjectId: ACTOR,
      // The author has no public page, so there is nothing to link.
      authorHandle: null,
      authorName: null,
      slug: "acme-thing",
      stage: "shipping",
      reactions: { useful: 0, would_use: 0, impressive: 0, curious: 0 },
      commentCount: 0,
    });
  });

  it("names its author only when their public page resolves", async () => {
    await seedPublished();
    await makePublic(ACTOR, "ada", "Ada Iyer");
    await published(P1, T1, NOW);
    expect(await repo.getPublicProductPost(P1)).toMatchObject({ authorHandle: "ada", authorName: "Ada Iyer" });
    await repo.setProfileVisibility(ACTOR, false, NOW);
    expect(await repo.getPublicProductPost(P1)).toMatchObject({ authorHandle: null, authorName: null });
  });

  it("counts the visible comments in its thread, and none once the thread is removed", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    const first = await repo.createPost({ id: asUuid("d1111111-1111-4111-8111-111111111111"), threadId: T1, authorSubjectId: ADA, body: "Nice.", at: NOW });
    await repo.createPost({ id: asUuid("d2222222-2222-4222-8222-222222222222"), threadId: T1, authorSubjectId: BOB, body: "Agreed.", at: NOW });
    expect((await repo.getPublicProductPost(P1))?.commentCount).toBe(2);
    await repo.setPostModerationState(first!, "removed", NOW);
    expect((await repo.getPublicProductPost(P1))?.commentCount).toBe(1);
    await repo.setThreadState(T1, "removed", ["open"]);
    expect((await repo.getPublicProductPost(P1))?.commentCount).toBe(0);
  });

  it("the feed is newest first across products, and pages by position without a gap or a repeat", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "second-thing");
    await published(P1, T1, "2026-08-17T10:00:00.000Z");
    await published(P2, T2, "2026-08-17T11:00:00.000Z", PROFILE_TWO);
    await published(P3, T3, "2026-08-17T12:00:00.000Z");

    const all = await repo.listPublicProductPosts({ cursor: null, limit: 20 });
    expect(all.posts.map((p) => p.id)).toEqual([P3, P2, P1]);
    expect(all.posts.map((p) => p.slug)).toEqual(["acme-thing", "second-thing", "acme-thing"]);
    expect(all.next).toBeNull();

    const one = await repo.listPublicProductPosts({ cursor: null, limit: 2 });
    expect(one.posts.map((p) => p.id)).toEqual([P3, P2]);
    expect(one.next).toEqual({ publishedAt: "2026-08-17T11:00:00.000Z", id: P2 });
    const two = await repo.listPublicProductPosts({ cursor: one.next, limit: 2 });
    expect(two.posts.map((p) => p.id)).toEqual([P1]);
    expect(two.next).toBeNull();
  });

  it("two posts published in the same instant page by id, never twice and never skipped", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    await published(P2, T2, NOW);
    await published(P3, T3, NOW);
    const seen: string[] = [];
    let cursor: { publishedAt: string; id: string } | null = null;
    for (let page = 0; page < 5; page += 1) {
      const res = await repo.listPublicProductPosts({ cursor, limit: 1 });
      seen.push(...res.posts.map((p) => p.id));
      cursor = res.next;
      if (cursor === null) break;
    }
    expect(seen).toEqual([P3, P2, P1]);
  });

  it("one product's posts are that product's only", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "second-thing");
    await published(P1, T1, "2026-08-17T10:00:00.000Z");
    await published(P2, T2, "2026-08-17T11:00:00.000Z", PROFILE_TWO);
    await published(P3, T3, "2026-08-17T12:00:00.000Z");
    expect((await repo.listPublicProductPostsForProfile(PROFILE, { cursor: null, limit: 20 })).posts.map((p) => p.id)).toEqual([P3, P1]);
    expect((await repo.listPublicProductPostsForProfile(PROFILE_TWO, { cursor: null, limit: 20 })).posts.map((p) => p.id)).toEqual([P2]);
  });

  it("the page size is bounded whatever is asked", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    expect((await repo.listPublicProductPosts({ cursor: null, limit: 0 })).posts).toHaveLength(1);
    expect((await repo.listPublicProductPosts({ cursor: null, limit: 100_000 })).posts).toHaveLength(1);
  });

  it("a post's comment thread is not one of the listing's discussions, the forum's, or the sidebar's", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    await repo.createPost({ id: asUuid("d1111111-1111-4111-8111-111111111111"), threadId: T1, authorSubjectId: ADA, body: "Nice.", at: NOW });
    expect(await repo.listThreads(PROFILE, null, 50)).toEqual([]);
    expect(await repo.listForumThreads({ tag: null, order: "latest", limit: 50 })).toEqual([]);
    expect(await repo.listRecentlyRepliedThreads(5)).toEqual([]);
    // And it is read by its id, like any thread.
    expect((await repo.getThread(T1))?.tag).toBe("post");
    expect(await repo.listPosts(T1, 50)).toHaveLength(1);
  });
});

describe("OPR-3 — reactions: one per person per post", () => {
  it("counts a reaction, replaces it on change, and reuses the row after a withdrawal", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    expect(await repo.reactToProductPost(P1, ADA, "useful", NOW)).toBe(true);
    expect(await repo.reactToProductPost(P1, BOB, "useful", NOW)).toBe(true);
    expect((await repo.getPublicProductPost(P1))?.reactions).toEqual({ useful: 2, would_use: 0, impressive: 0, curious: 0 });

    // Changing replaces: one person, one reaction.
    expect(await repo.reactToProductPost(P1, ADA, "curious", "2026-08-18T00:00:00.000Z")).toBe(true);
    expect((await repo.getPublicProductPost(P1))?.reactions).toEqual({ useful: 1, would_use: 0, impressive: 0, curious: 1 });

    expect(await repo.withdrawProductPostReaction(P1, ADA, "2026-08-19T00:00:00.000Z")).toBe(true);
    expect(await repo.withdrawProductPostReaction(P1, ADA, "2026-08-19T00:00:00.000Z")).toBe(false);
    expect((await repo.getPublicProductPost(P1))?.reactions).toEqual({ useful: 1, would_use: 0, impressive: 0, curious: 0 });

    // The row survives the withdrawal, and giving one again reuses it.
    expect(await repo.reactToProductPost(P1, ADA, "impressive", "2026-08-20T00:00:00.000Z")).toBe(true);
    const rows = await sql.execute<{ subject_id: string; reaction: string; withdrawn: boolean; created_at: Date | string }>(
      `SELECT subject_id, reaction, withdrawn_at IS NOT NULL AS withdrawn, created_at
         FROM openproduct.product_post_reactions ORDER BY subject_id`,
    );
    expect(rows.rows.map((r) => `${r.subject_id.slice(-4)}:${r.reaction}:${r.withdrawn}`)).toEqual(["ada0:impressive:false", "bob0:useful:false"]);
    // `created_at` is when they first reacted, not when they last changed it.
    expect(new Date(rows.rows[0]!.created_at).toISOString()).toBe(new Date(NOW).toISOString());
  });

  it("a post's author cannot react to their own post", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    expect(await repo.reactToProductPost(P1, ACTOR, "useful", NOW)).toBe(false);
    expect((await repo.getPublicProductPost(P1))?.reactions.useful).toBe(0);
  });

  it("a post the system wrote has no author, so anybody may react", async () => {
    await seedPublished();
    await repo.createProductPost({ id: P1, profileId: PROFILE, kind: "idea", authorSubjectId: null, blocks: [] });
    await thread(T1);
    await repo.publishProductPost(PROFILE, P1, { at: NOW, blocks: [], threadId: T1 });
    expect(await repo.reactToProductPost(P1, ACTOR, "curious", NOW)).toBe(true);
  });

  it("refuses a draft, a removed post, an unlisted product's post and an unknown id", async () => {
    await seedPublished();
    await repo.createProductPost({ id: P1, profileId: PROFILE, kind: "feature", authorSubjectId: ACTOR, blocks: FEATURE });
    expect(await repo.reactToProductPost(P1, ADA, "useful", NOW)).toBe(false);
    await published(P2, T2, NOW);
    await repo.removeProductPost(PROFILE, P2);
    expect(await repo.reactToProductPost(P2, ADA, "useful", NOW)).toBe(false);
    await published(P3, T3, NOW);
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await repo.reactToProductPost(P3, ADA, "useful", NOW)).toBe(false);
    expect(await repo.reactToProductPost(T1, ADA, "useful", NOW)).toBe(false);
    expect((await sql.execute(`SELECT 1 FROM openproduct.product_post_reactions`)).rows).toEqual([]);
  });

  it("the overlay's read is bounded by the ids it was asked about, and leaves out a withdrawn reaction", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    await published(P2, T2, NOW);
    await published(P3, T3, NOW);
    await repo.reactToProductPost(P1, ADA, "useful", NOW);
    await repo.reactToProductPost(P2, ADA, "curious", NOW);
    await repo.reactToProductPost(P3, ADA, "impressive", NOW);
    await repo.withdrawProductPostReaction(P2, ADA, NOW);
    expect(await repo.listProductPostReactionsBy(ADA, [P1, P2])).toEqual([{ postId: P1, reaction: "useful" }]);
    expect(await repo.listProductPostReactionsBy(ADA, [])).toEqual([]);
    expect(await repo.listProductPostReactionsBy(BOB, [P1, P2, P3])).toEqual([]);
  });
});

describe("OPR-3 — the overlay's crew and seat questions, Needs you, Following, search", () => {
  it("names the asked slugs the subject is on the crew of, drafts included, and no others", async () => {
    await seedPublished();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "second-thing");
    expect(await repo.listCrewOf(ACTOR, ["ACME-thing", "second-thing", "nope"])).toEqual([
      { slug: "acme-thing", orgId: ORG, profileId: PROFILE },
      { slug: "second-thing", orgId: ORG, profileId: PROFILE_TWO },
    ]);
    expect(await repo.listCrewOf(ACTOR, ["acme-thing"])).toHaveLength(1);
    expect(await repo.listCrewOf(ADA, ["acme-thing", "second-thing"])).toEqual([]);
    expect(await repo.listCrewOf(ACTOR, [])).toEqual([]);
  });

  it("names the asked seats the subject has a PENDING request for", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Maintainer" });
    const other = asUuid("78888888-8888-4888-8888-888888888888");
    await repo.upsertRoleOpening({ id: other, profileId: PROFILE, title: "Designer" });
    await repo.recordApplication({ id: asUuid("e1111111-1111-4111-8111-111111111111"), subjectId: ADA, profileId: PROFILE, roleOpeningId: OPENING, jrRequestRef: "jr_1" });
    await repo.recordApplication({ id: asUuid("e2222222-2222-4222-8222-222222222222"), subjectId: ADA, profileId: PROFILE, roleOpeningId: other, jrRequestRef: "jr_2" });
    await repo.setApplicationStatusByRequestRef("jr_2", "denied");
    expect(await repo.listPendingApplicationOpenings(ADA, [OPENING, other])).toEqual([OPENING]);
    expect(await repo.listPendingApplicationOpenings(ADA, [other])).toEqual([]);
    expect(await repo.listPendingApplicationOpenings(BOB, [OPENING, other])).toEqual([]);
    expect(await repo.listPendingApplicationOpenings(ADA, [])).toEqual([]);
  });

  it("a product's pending requests are its own, oldest first, with the seat and the request's reference", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "second-thing");
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Maintainer" });
    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada Iyer", bio: null });
    await repo.recordApplication({ id: asUuid("e1111111-1111-4111-8111-111111111111"), subjectId: ADA, profileId: PROFILE, roleOpeningId: OPENING, jrRequestRef: "jr_1" });
    await repo.recordApplication({ id: asUuid("e2222222-2222-4222-8222-222222222222"), subjectId: BOB, profileId: PROFILE, roleOpeningId: OPENING, jrRequestRef: "jr_2" });
    await repo.setApplicationStatusByRequestRef("jr_2", "approved");

    const pending = await repo.listPendingApplicationsForProfile(PROFILE);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      roleOpeningId: OPENING,
      openingTitle: "Maintainer",
      jrRequestRef: "jr_1",
      // What they wrote about themselves; no handle, because their page is not public.
      requesterName: "Ada Iyer",
      requesterHandle: null,
    });
    expect(await repo.listPendingApplicationsForProfile(PROFILE_TWO)).toEqual([]);
  });

  it("Following is the reader's own listed products and public people, and nobody else's", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "second-thing");
    await makePublic(ACTOR, "maker", "The Maker");
    await repo.follow(ADA, "listing", "acme-thing");
    await repo.follow(ADA, "listing", "second-thing");
    await repo.follow(ADA, "person", ACTOR);
    await repo.follow(ADA, "topic", "developer-tools");
    await repo.follow(BOB, "listing", "second-thing");

    const following = await repo.listFollowing(ADA, 50);
    expect(following.products.map((p) => p.slug).sort()).toEqual(["acme-thing", "second-thing"]);
    expect(following.products[0]).toMatchObject({ stage: "idea", tagline: "A thing, built in the open" });
    expect(following.people).toEqual([{ handle: "maker", displayName: "The Maker" }]);
    expect((await repo.listFollowing(BOB, 50)).products.map((p) => p.slug)).toEqual(["second-thing"]);

    // An unlisted product and a person whose page is off are not links.
    await repo.unpublishProfile(ORG, PROFILE_TWO, ACTOR);
    await repo.setProfileVisibility(ACTOR, false, NOW);
    const after = await repo.listFollowing(ADA, 50);
    expect(after.products.map((p) => p.slug)).toEqual(["acme-thing"]);
    expect(after.people).toEqual([]);
  });

  it("reads each listed slug's stage in one read, and nothing for an unlisted one", async () => {
    await seedPublished();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "second-thing");
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    await repo.setProductMilestoneShipped(PROFILE, M1, NOW);
    const stages = await repo.listStagesForSlugs(["Acme-Thing", "second-thing", "nope"]);
    expect([...stages.entries()]).toEqual([["acme-thing", "shipping"]]);
    expect((await repo.listStagesForSlugs([])).size).toBe(0);
  });

  it("names the listed products a handle's holder maintains, newest first and bounded", async () => {
    await seedPublished();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "second-thing");
    await makePublic(ACTOR, "maker", "The Maker");
    const products = await repo.listProductsForHandles(["maker", "nobody"], 6);
    expect([...products.keys()]).toEqual(["maker"]);
    // The draft is not listed, so it is not named.
    expect(products.get("maker")).toEqual([{ slug: "acme-thing", tagline: "A thing, built in the open", stage: "idea" }]);

    await repo.recordRepoObservation(PROFILE_TWO, { repoVisibility: "public", repoLicence: "MIT", observedAt: NOW });
    await repo.reviewProfile(PROFILE_TWO, ACTOR, NOW);
    await repo.publishProfile(ORG, PROFILE_TWO, "2026-08-18T12:00:00.000Z", ACTOR, { allowWithoutReview: false, indexable: true });
    expect((await repo.listProductsForHandles(["maker"], 6)).get("maker")?.map((p) => p.slug)).toEqual(["second-thing", "acme-thing"]);
    expect((await repo.listProductsForHandles(["maker"], 1)).get("maker")?.map((p) => p.slug)).toEqual(["second-thing"]);
    expect((await repo.listProductsForHandles([], 6)).size).toBe(0);
  });
});

describe("OPR-3 — it all leaves with the listing, and with the subject", () => {
  it("a workspace purge takes the milestones, the posts and the reactions with the listing", async () => {
    await seedPublished();
    await repo.createProductMilestone({ id: M1, profileId: PROFILE, code: "AS1", title: "Sign in", summary: null });
    await published(P1, T1, NOW);
    await repo.createProductPost({ id: P2, profileId: PROFILE, kind: "idea", authorSubjectId: ACTOR, blocks: [] });
    await repo.reactToProductPost(P1, ADA, "useful", NOW);

    const outcome = await purgeContext(sql, "openproduct", ORG);
    expect(outcome.done).toBe(true);
    for (const table of ["product_milestones", "product_posts", "product_post_reactions", "threads"]) {
      const left = await sql.execute(`SELECT 1 FROM openproduct.${table}`);
      expect([table, left.rows.length]).toEqual([table, 0]);
    }
  });

  it("an exit deletes the subject's reactions and keeps their product posts under the tombstone", async () => {
    await seedPublished();
    await published(P1, T1, NOW);
    await repo.reactToProductPost(P1, ADA, "useful", NOW);

    await repo.eraseSubject(ADA, NOW);
    expect((await repo.getPublicProductPost(P1))?.reactions.useful).toBe(0);

    await repo.eraseSubject(ACTOR, NOW);
    const post = await repo.getPublicProductPost(P1);
    // The post is the product's and stands; its author reads as nobody.
    expect(post?.authorSubjectId).toBe("usr_gone");
    expect(post?.authorHandle).toBeNull();
    const footprint = await repo.subjectFootprint(ACTOR);
    expect(footprint.get("product_posts.author_subject_id") ?? 0).toBe(0);
  });
});
