// The openproduct repository against a live engine — collections, the digest by email, appeals and the transparency record, the inbox.
//
// LC4's signed and ordered collections, LC5's digest mail, TS5's appeals and the record they feed, and NF0's inbox.
//
// Cut from `repository-pg.test.ts` at openproduct-verification OV3, verbatim:
// the engine, the ids and the two seeds come from `./harness.js`, which
// restores the ladder's template per test instead of re-applying fifty
// migrations. Nothing a test asserts changed; what it costs did.

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { sql, repo, ORG, PROJECT_TWO, PROFILE, PROFILE_TWO, ACTOR, ADMIN, NOW, REVIEWED_PUBLISH, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

describe("openproduct — collections, signed and ordered (openproduct-commons LC4)", () => {
  const COLL = asUuid("dddddddd-4444-4444-8444-dddddddddd01");
  const COLL_TWO = asUuid("dddddddd-4444-4444-8444-dddddddddd02");
  const LATER = "2026-08-17T13:00:00.000Z";

  /** A curator: somebody whose handle resolves, which means a published
   *  listing plus a public contributor profile (CG4's biconditional). */
  async function seedCurator(subjectId = ACTOR, handle = "ada") {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId }]);
    await repo.claimHandle(handle, subjectId, NOW);
    await repo.upsertContributor({ subjectId, displayName: null, bio: null });
    await repo.setProfileVisibility(subjectId, true, NOW);
    return handle;
  }

  it("says who may curate, and it is CG4's biconditional", async () => {
    // "Signed" has to mean a name a reader can go and look at, so every leg
    // of the biconditional is required and each is checked as it arrives.
    await seedPublished();
    // A published listing alone is not a signature.
    expect(await repo.curatorHandleFor(ACTOR)).toBeNull();

    await repo.setMaintainers(PROFILE, [{ subjectId: ACTOR }]);
    await repo.claimHandle("ada", ACTOR, NOW);
    await repo.upsertContributor({ subjectId: ACTOR, displayName: null, bio: null });
    // A handle whose profile is private still does not resolve.
    expect(await repo.curatorHandleFor(ACTOR)).toBeNull();

    await repo.setProfileVisibility(ACTOR, true, NOW);
    expect(await repo.curatorHandleFor(ACTOR)).toBe("ada");
  });

  it("a curator who goes private stops being one", async () => {
    await seedCurator();
    await repo.setProfileVisibility(ACTOR, false, LATER);
    // The judgement was only publishable while it was attributable.
    expect(await repo.curatorHandleFor(ACTOR)).toBeNull();
  });

  it("creates a draft, and refuses a taken address", async () => {
    await seedCurator();
    const made = await repo.createCollection({
      id: COLL,
      slug: "eight-things",
      title: "Eight things",
      blurb: null,
      curatorSubjectId: ACTOR,
      at: NOW,
    });
    expect(made).toMatchObject({ state: "draft", publishedAt: null });
    // A null rather than a thrown driver message the caller has to classify.
    expect(
      await repo.createCollection({
        id: COLL_TWO,
        slug: "eight-things",
        title: "Another",
        blurb: null,
        curatorSubjectId: ACTOR,
        at: NOW,
      }),
    ).toBeNull();
    // And a malformed address is refused by the schema, not silently
    // normalised: an address that changes shape between what somebody typed
    // and what got stored is an address they cannot predict.
    await expect(
      repo.createCollection({
        id: COLL_TWO,
        slug: "Eight Things",
        title: "Another",
        blurb: null,
        curatorSubjectId: ACTOR,
        at: NOW,
      }),
    ).rejects.toThrow();
  });

  it("a draft renders nowhere public", async () => {
    await seedCurator();
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW });
    expect(await repo.getPublicCollection("picks")).toBeNull();
    expect(await repo.listPublishedCollections(20)).toEqual([]);
  });

  it("publishes, and then renders with its curator's handle", async () => {
    const handle = await seedCurator();
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: "Why these", curatorSubjectId: ACTOR, at: NOW,
    });
    await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: "the good one", at: NOW });
    expect(await repo.setCollectionState(COLL, ACTOR, "published", LATER)).toMatchObject({
      state: "published",
      publishedAt: LATER,
    });

    const live = await repo.getPublicCollection("picks");
    expect(live).toMatchObject({ slug: "picks", title: "Picks", curatorHandle: handle });
    expect(live!.items).toHaveLength(1);
    expect(live!.items[0]!.note).toBe("the good one");
    expect(live!.items[0]!.card.slug).toBe("acme-thing");
    // A HANDLE, never a subject id (I3, OPC-6).
    expect(JSON.stringify(live)).not.toContain(ACTOR);
  });

  it("HIDES an item whose listing stopped being public, and keeps the row", async () => {
    // The milestone's own done-when: a collection containing an unpublished
    // listing hides that item rather than 404ing.
    await seedCurator();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW });
    await repo.addCollectionItem({ collectionId: COLL, slug: "other-thing", note: null, at: NOW });
    await repo.setCollectionState(COLL, ACTOR, "published", LATER);
    expect((await repo.getPublicCollection("picks"))!.items).toHaveLength(2);

    await repo.unpublishProfile(ORG, PROFILE_TWO, ACTOR);
    const after = await repo.getPublicCollection("picks");
    // The collection still exists and still renders — one item is simply not
    // in it today.
    expect(after).not.toBeNull();
    expect(after!.items.map((i) => i.card.slug)).toEqual(["acme-thing"]);
    // And the ROW SURVIVES: republishing brings the item back where it was.
    await repo.publishProfile(ORG, PROFILE_TWO, LATER, ACTOR, REVIEWED_PUBLISH);
    expect((await repo.getPublicCollection("picks"))!.items).toHaveLength(2);
  });

  it("counts what it SHOWS, on the index card as well", async () => {
    await seedCurator();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW });
    await repo.addCollectionItem({ collectionId: COLL, slug: "other-thing", note: null, at: NOW });
    await repo.setCollectionState(COLL, ACTOR, "published", LATER);
    expect((await repo.listPublishedCollections(20))[0]!.count).toBe(2);

    await repo.unpublishProfile(ORG, PROFILE_TWO, ACTOR);
    // A card promising eight that opens onto five is a number the page could
    // have got right and did not.
    expect((await repo.listPublishedCollections(20))[0]!.count).toBe(1);
  });

  it("drops out of public reads when its curator stops resolving", async () => {
    await seedCurator();
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW });
    await repo.setCollectionState(COLL, ACTOR, "published", LATER);
    expect(await repo.getPublicCollection("picks")).not.toBeNull();

    await repo.setProfileVisibility(ACTOR, false, LATER);
    // The coupling IS the design: a curator who takes their profile private
    // takes their collections with it.
    expect(await repo.getPublicCollection("picks")).toBeNull();
    expect(await repo.listPublishedCollections(20)).toEqual([]);
  });

  it("keeps the curator's order, and renumbers densely on a move", async () => {
    await seedCurator();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW });
    await repo.addCollectionItem({ collectionId: COLL, slug: "other-thing", note: null, at: NOW });
    await repo.setCollectionState(COLL, ACTOR, "published", LATER);
    expect((await repo.getPublicCollection("picks"))!.items.map((i) => i.card.slug)).toEqual([
      "acme-thing",
      "other-thing",
    ]);

    expect(await repo.reorderCollectionItems(COLL, ["other-thing", "acme-thing"], LATER)).toBe(2);
    expect((await repo.getPublicCollection("picks"))!.items.map((i) => i.card.slug)).toEqual([
      "other-thing",
      "acme-thing",
    ]);
  });

  it("refuses to add a listing that is not publicly addable", async () => {
    await seedCurator();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "unpublished-thing");
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    // Checked in the INSERT's own SELECT, not in a read above it: a check
    // split from the write is a check a race walks through, and this one
    // decides whether a private listing can be named on a public page.
    expect(
      await repo.addCollectionItem({ collectionId: COLL, slug: "unpublished-thing", note: null, at: NOW }),
    ).toBe(false);
    expect(
      await repo.addCollectionItem({ collectionId: COLL, slug: "no-such-listing", note: null, at: NOW }),
    ).toBe(false);
  });

  it("refuses the same listing twice, so a curator moves rather than duplicates", async () => {
    await seedCurator();
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    expect(await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW })).toBe(true);
    expect(await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW })).toBe(false);
  });

  it("scopes every write to the curator, in the WHERE", async () => {
    await seedCurator();
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    // An ownership test a caller can forget is an ownership test somebody
    // will forget, so it is in the statement.
    expect(await repo.setCollectionState(COLL, ADMIN, "published", LATER)).toBeNull();
    expect(await repo.getCuratorCollection(COLL, ADMIN)).toBeNull();
    expect(await repo.getCuratorCollection(COLL, ACTOR)).toMatchObject({ slug: "picks" });
  });

  it("shows a curator both counts, so a hidden item does not look deleted", async () => {
    await seedCurator();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW });
    await repo.addCollectionItem({ collectionId: COLL, slug: "other-thing", note: null, at: NOW });
    await repo.unpublishProfile(ORG, PROFILE_TWO, ACTOR);

    const mine = await repo.listCollectionsForCurator(ACTOR);
    // Telling them only the visible count would make a listing that went
    // private look like something they had deleted.
    expect(mine[0]).toMatchObject({ held: 2, visible: 1 });
  });

  it("retires from published only, and keeps the address taken", async () => {
    await seedCurator();
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW });
    // Cannot retire a draft — it was never out.
    expect(await repo.setCollectionState(COLL, ACTOR, "retired", LATER)).toBeNull();
    await repo.setCollectionState(COLL, ACTOR, "published", LATER);
    const retired = await repo.setCollectionState(COLL, ACTOR, "retired", LATER);
    // Its `published_at` survives, so its history reads correctly.
    expect(retired).toMatchObject({ state: "retired", publishedAt: LATER, retiredAt: LATER });
    expect(await repo.getPublicCollection("picks")).toBeNull();
    // And the address stays taken: a link somebody shared must not become
    // somebody else's page later.
    expect(
      await repo.createCollection({
        id: COLL_TWO, slug: "picks", title: "Mine now", blurb: null, curatorSubjectId: ADMIN, at: LATER,
      }),
    ).toBeNull();
  });

  it("counts a curator's live collections, for the index bound", async () => {
    await seedCurator();
    await repo.createCollection({
      id: COLL, slug: "picks", title: "Picks", blurb: null, curatorSubjectId: ACTOR, at: NOW,
    });
    expect(await repo.countLiveCollections(ACTOR)).toBe(0);
    await repo.addCollectionItem({ collectionId: COLL, slug: "acme-thing", note: null, at: NOW });
    await repo.setCollectionState(COLL, ACTOR, "published", LATER);
    expect(await repo.countLiveCollections(ACTOR)).toBe(1);
  });
});

describe("openproduct — the digest by email (openproduct-commons LC5)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const D1 = asUuid("eeeeeeee-5555-4555-8555-eeeeeeeeee01");
  const D2 = asUuid("eeeeeeee-5555-4555-8555-eeeeeeeeee02");
  const LATER = "2026-08-17T13:00:00.000Z";

  const queueDigest = (id: string, subjectId: string, week = "2026-W34") =>
    repo.queueNotification({
      id: id as never,
      subjectId,
      kind: "digest",
      threadId: null,
      eventRef: `digest:${week}`,
    });

  it("absence means NEVER ASKED, which is not the same as having left", async () => {
    // The control says different things to those two people: one is an
    // invitation, the other has to say "you can come back".
    expect(await repo.getDigestStanding(ADA)).toEqual({ standing: "never", since: null });

    await repo.setDigestSubscription(ADA, true, NOW);
    expect(await repo.getDigestStanding(ADA)).toEqual({ standing: "subscribed", since: NOW });

    await repo.setDigestSubscription(ADA, false, LATER);
    // The ROW SURVIVES an unsubscribe — somebody who leaves and returns is
    // not somebody who has never been asked.
    expect(await repo.getDigestStanding(ADA)).toEqual({ standing: "unsubscribed", since: NOW });
  });

  it("keeps the original date for somebody who never left, and resets it for somebody who came back", async () => {
    await repo.setDigestSubscription(ADA, true, NOW);
    // Subscribing again without having left must not rewrite when they first
    // said yes.
    await repo.setDigestSubscription(ADA, true, LATER);
    expect((await repo.getDigestStanding(ADA)).since).toBe(NOW);

    await repo.setDigestSubscription(ADA, false, LATER);
    await repo.setDigestSubscription(ADA, true, "2026-08-18T09:00:00.000Z");
    // Coming back IS a new start, and the date says so.
    expect(await repo.getDigestStanding(ADA)).toEqual({
      standing: "subscribed",
      since: "2026-08-18T09:00:00.000Z",
    });
  });

  it("lists only the currently subscribed", async () => {
    await repo.setDigestSubscription(ADA, true, NOW);
    await repo.setDigestSubscription(BOB, true, NOW);
    expect((await repo.listDigestSubscribers(100)).sort()).toEqual([ADA, BOB].sort());
    await repo.setDigestSubscription(BOB, false, LATER);
    expect(await repo.listDigestSubscribers(100)).toEqual([ADA]);
  });

  it("queues one digest per person per week, reusing CB4's index", async () => {
    await repo.setDigestSubscription(ADA, true, NOW);
    expect(await queueDigest(D1, ADA)).toBe(true);
    // A retried send, two workers racing, and a re-run after a partial
    // failure all collide here rather than sending the same week twice.
    expect(await queueDigest(D2, ADA)).toBe(false);
    expect(await repo.listPendingDigests(100)).toHaveLength(1);
  });

  it("UNSUBSCRIBING REACHES A DIGEST ALREADY QUEUED", async () => {
    // The promise the copy makes, and the reason the pending read joins the
    // subscription instead of trusting what was queued. Without it the
    // promise would be true only for people who left before the weekly run —
    // most of them, and not all, which is the worst kind of almost-true.
    await repo.setDigestSubscription(ADA, true, NOW);
    await queueDigest(D1, ADA);
    expect(await repo.listPendingDigests(100)).toHaveLength(1);

    await repo.setDigestSubscription(ADA, false, LATER);
    expect(await repo.listPendingDigests(100)).toEqual([]);

    // And it comes back if they change their mind before the send runs.
    await repo.setDigestSubscription(ADA, true, LATER);
    expect(await repo.listPendingDigests(100)).toHaveLength(1);
  });

  it("marks delivered once, and never twice", async () => {
    await repo.setDigestSubscription(ADA, true, NOW);
    await queueDigest(D1, ADA);
    const pending = await repo.listPendingDigests(100);
    expect(await repo.markDigestDelivered(pending.map((p) => p.id), LATER)).toBe(1);
    // Delivered rows leave the queue, so a second run cannot re-send them.
    expect(await repo.listPendingDigests(100)).toEqual([]);
    expect(await repo.markDigestDelivered(pending.map((p) => p.id), LATER)).toBe(0);
  });

  it("stops retrying a permanently failing row", async () => {
    await repo.setDigestSubscription(ADA, true, NOW);
    await queueDigest(D1, ADA);
    const ids = (await repo.listPendingDigests(100)).map((p) => p.id);
    for (let i = 0; i < 5; i += 1) await repo.recordDigestAttempt(ids);
    // Bounded by the column rather than by a caller counting: a queue that
    // only grows is the failure this ceiling exists to prevent.
    expect(await repo.listPendingDigests(100)).toEqual([]);
  });

  it("carries no address anywhere, as a schema fact", async () => {
    const cols = await sql.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'openproduct' AND table_name = 'digest_subscriptions'`,
      [],
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names.length).toBeGreaterThan(0);
    // I3, for the second time. A schema that cannot hold an address cannot
    // leak one, and cannot grow a "just this once" export either.
    for (const forbidden of ["email", "address", "phone", "push_token", "recipient", "reason"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("REFUSES a kind nobody wrote copy for", async () => {
    // The CHECK was widened to four, not replaced with open text.
    await expect(
      repo.queueNotification({
        id: D1,
        subjectId: ADA,
        kind: "newsletter" as never,
        threadId: null,
        eventRef: "x",
      }),
    ).rejects.toThrow();
  });
});

describe("openproduct — appeals and the transparency record (openproduct-commons TS5)", () => {
  const MAKER = "usr_00000000000000000000000000maker";
  const OTHER_MAKER = "usr_0000000000000000000000000othr";
  const OP = "usr_00000000000000000000000000oprtr";
  const A1 = asUuid("a5000000-0000-4000-8000-000000000001");
  const A2 = asUuid("a5000000-0000-4000-8000-000000000002");
  const ACT1 = asUuid("a5000000-0000-4000-8000-000000000011");
  const ACT2 = asUuid("a5000000-0000-4000-8000-000000000012");
  const FILED = "2026-08-20T09:00:00.000Z";
  const DECIDED = "2026-08-21T09:00:00.000Z";

  async function seedAct(id: string, slug: string, act: string, at = NOW) {
    return repo.appendModerationAct({
      id: asUuid(id),
      subjectKind: "listing",
      subjectRef: slug,
      act,
      actorId: OP,
      reason: `Because of ${act}.`,
      occurredAt: at,
    });
  }

  it("reads one act back by id, which is what an appeal is filed against", async () => {
    await seedAct(ACT1, "appealed-thing", "delist");
    const read = await repo.getModerationAct(ACT1);
    expect(read).toMatchObject({ act: "delist", subjectRef: "appealed-thing" });
    expect(await repo.getModerationAct(asUuid("a5000000-0000-4000-8000-0000000000ff"))).toBeNull();
  });

  it("reads every act against a SET of listings, which is the maintainer's own view", async () => {
    await seedAct("a5000000-0000-4000-8000-000000000013", "mine-one", "delist");
    await seedAct("a5000000-0000-4000-8000-000000000014", "mine-two", "deindex");
    await seedAct("a5000000-0000-4000-8000-000000000015", "not-mine", "remove");
    const acts = await repo.listModerationActsForSubjects("listing", ["mine-one", "mine-two"]);
    expect(acts.map((a) => a.subjectRef).sort()).toEqual(["mine-one", "mine-two"]);
    // An empty set is an empty answer WITHOUT a round trip — the common case
    // is somebody who maintains nothing, and asking the database to confirm
    // that on every page load is a query per visit for a guaranteed nothing.
    expect(await repo.listModerationActsForSubjects("listing", [])).toEqual([]);
  });

  it("files an appeal, and refuses the same person filing against the same act twice", async () => {
    await seedAct(ACT2, "twice-thing", "delist");
    const filed = await repo.createAppeal({
      id: A1,
      actId: ACT2,
      subjectKind: "listing",
      subjectRef: "twice-thing",
      appellantSubjectId: MAKER,
      says: "It is not a mirror; I wrote it.",
      filedAt: FILED,
    });
    expect(filed).toMatchObject({ state: "open", appellantSubjectId: MAKER });
    expect(filed?.decidedAt).toBeNull();

    // Null, not a throw — the handler turns it into a sentence.
    const again = await repo.createAppeal({
      id: A2,
      actId: ACT2,
      subjectKind: "listing",
      subjectRef: "twice-thing",
      appellantSubjectId: MAKER,
      says: "Saying it again, differently.",
      filedAt: FILED,
    });
    expect(again).toBeNull();

    // A CO-MAINTAINER FILING DURING AN OPEN APPEAL IS REFUSED WITH NULL, not
    // with a constraint violation. This assertion is the correction: the
    // first draft guarded only "the same person", so this call reached
    // 1510's partial unique index and THREW — a person doing an ordinary
    // thing got a 500 where they should have got a sentence. The index is now
    // a concurrency backstop and the NOT EXISTS is what callers meet.
    const bySomebodyElse = await repo.createAppeal({
      id: A2,
      actId: ACT2,
      subjectKind: "listing",
      subjectRef: "twice-thing",
      appellantSubjectId: OTHER_MAKER,
      says: "I also maintain this and it is not a mirror.",
      filedAt: FILED,
    });
    expect(bySomebodyElse).toBeNull();
    // And the handler can tell the two refusals apart afterwards, which is
    // what makes them two different sentences.
    expect(await repo.hasAppealed(ACT2, MAKER)).toBe(true);
    expect(await repo.hasAppealed(ACT2, OTHER_MAKER)).toBe(false);
  });

  it("lets a co-maintainer appeal once the first appeal has been decided", async () => {
    // The open guard is about ONE QUESTION AT A TIME, not about silencing the
    // other maintainers of a listing forever.
    const act = "a5000000-0000-4000-8000-000000000016";
    const first = asUuid("a5000000-0000-4000-8000-000000000021");
    await seedAct(act, "contested", "remove");
    expect(
      await repo.createAppeal({
        id: first,
        actId: asUuid(act),
        subjectKind: "listing",
        subjectRef: "contested",
        appellantSubjectId: MAKER,
        says: "Please look again at this decision.",
        filedAt: FILED,
      }),
    ).not.toBeNull();
    await repo.resolveAppeal({
      id: first,
      state: "refused",
      outcomeActId: asUuid("a5000000-0000-4000-8000-000000000036"),
      reversalActId: null,
      decidedBy: OP,
      at: DECIDED,
    });
    expect(
      await repo.createAppeal({
        id: asUuid("a5000000-0000-4000-8000-000000000022"),
        actId: asUuid(act),
        subjectKind: "listing",
        subjectRef: "contested",
        appellantSubjectId: OTHER_MAKER,
        says: "I also maintain this, and here is what the first appeal missed.",
        filedAt: DECIDED,
      }),
    ).not.toBeNull();
  });

  it("resolves once, and only from open", async () => {
    const act = "a5000000-0000-4000-8000-000000000017";
    const appealId = asUuid("a5000000-0000-4000-8000-000000000023");
    await seedAct(act, "resolve-once", "delist");
    await repo.createAppeal({
      id: appealId,
      actId: asUuid(act),
      subjectKind: "listing",
      subjectRef: "resolve-once",
      appellantSubjectId: MAKER,
      says: "This was a misreading of the licence.",
      filedAt: FILED,
    });

    const outcome = asUuid("a5000000-0000-4000-8000-000000000031");
    const reversal = asUuid("a5000000-0000-4000-8000-000000000032");
    const decided = await repo.resolveAppeal({
      id: appealId,
      state: "upheld",
      outcomeActId: outcome,
      reversalActId: reversal,
      decidedBy: OP,
      at: DECIDED,
    });
    expect(decided).toMatchObject({ state: "upheld", decidedBy: OP });
    expect(decided?.reversalActId).toBe(reversal);

    // Terminal. Re-deciding would rewrite who decided it and when, and the
    // ledger row recording the first decision is append-only — the two would
    // disagree forever with no way to tell which was real.
    expect(
      await repo.resolveAppeal({
        id: appealId,
        state: "refused",
        outcomeActId: asUuid("a5000000-0000-4000-8000-000000000033"),
        reversalActId: null,
        decidedBy: ADMIN,
        at: DECIDED,
      }),
    ).toBeNull();

    // And a decided act is appealable again by nobody: the person rule holds
    // after the decision, which is the asymmetry with reports.
    expect(await repo.hasAppealed(asUuid(act), MAKER)).toBe(true);
    expect(
      await repo.createAppeal({
        id: asUuid("a5000000-0000-4000-8000-000000000024"),
        actId: asUuid(act),
        subjectKind: "listing",
        subjectRef: "resolve-once",
        appellantSubjectId: MAKER,
        says: "I would like to argue this one again please.",
        filedAt: DECIDED,
      }),
    ).toBeNull();
  });

  it("upholds with NO reversal, because sometimes there is nothing left to undo", async () => {
    const act = "a5000000-0000-4000-8000-000000000018";
    const appealId = asUuid("a5000000-0000-4000-8000-000000000025");
    await seedAct(act, "already-back", "delist");
    await repo.createAppeal({
      id: appealId,
      actId: asUuid(act),
      subjectKind: "listing",
      subjectRef: "already-back",
      appellantSubjectId: MAKER,
      says: "Somebody already put this back, but I still want it on the record.",
      filedAt: FILED,
    });
    const decided = await repo.resolveAppeal({
      id: appealId,
      state: "upheld",
      outcomeActId: asUuid("a5000000-0000-4000-8000-000000000034"),
      reversalActId: null,
      decidedBy: OP,
      at: DECIDED,
    });
    // The 1510 CHECK permits it: a NOT NULL here would force a handler to
    // invent a reversal act that reversed nothing.
    expect(decided).toMatchObject({ state: "upheld" });
    expect(decided?.reversalActId).toBeNull();
  });

  it("REFUSES a decided appeal that names nobody, and a refusal that reverses", async () => {
    const act = "a5000000-0000-4000-8000-000000000019";
    await seedAct(act, "check-thing", "delist");
    const appealId = asUuid("a5000000-0000-4000-8000-000000000026");
    await repo.createAppeal({
      id: appealId,
      actId: asUuid(act),
      subjectKind: "listing",
      subjectRef: "check-thing",
      appellantSubjectId: MAKER,
      says: "The listing is mine and the repository is public.",
      filedAt: FILED,
    });
    // The one rule only the database can hold: a decided appeal names its
    // decider, its moment and its ledger row.
    await expect(
      sql.execute(
        `UPDATE openproduct.appeals SET state = 'refused' WHERE id = $1`,
        [appealId],
      ),
    ).rejects.toThrow();
    // And a refusal reverses nothing.
    await expect(
      sql.execute(
        `UPDATE openproduct.appeals
            SET state = 'refused', decided_at = $2, decided_by = $3,
                outcome_act_id = $4, reversal_act_id = $4
          WHERE id = $1`,
        [appealId, DECIDED, OP, asUuid("a5000000-0000-4000-8000-000000000035")],
      ),
    ).rejects.toThrow();
  });

  it("works the queue oldest first, and only the open ones", async () => {
    // Three acts, three appeals, filed out of order, one already decided.
    const filings = [
      { act: "a5000000-0000-4000-8000-000000000051", slug: "queue-c", at: "2026-08-22T09:00:00.000Z" },
      { act: "a5000000-0000-4000-8000-000000000052", slug: "queue-a", at: "2026-08-18T09:00:00.000Z" },
      { act: "a5000000-0000-4000-8000-000000000053", slug: "queue-b", at: "2026-08-20T09:00:00.000Z" },
    ];
    for (const [i, filing] of filings.entries()) {
      await seedAct(filing.act, filing.slug, "delist");
      await repo.createAppeal({
        id: asUuid(`a5000000-0000-4000-8000-00000000006${i}`),
        actId: asUuid(filing.act),
        subjectKind: "listing",
        subjectRef: filing.slug,
        appellantSubjectId: MAKER,
        says: `This decision about ${filing.slug} was wrong, and here is why.`,
        filedAt: filing.at,
      });
    }
    // One decided, so the queue has something to leave out.
    await repo.resolveAppeal({
      id: asUuid("a5000000-0000-4000-8000-000000000060"),
      state: "refused",
      outcomeActId: asUuid("a5000000-0000-4000-8000-000000000037"),
      reversalActId: null,
      decidedBy: OP,
      at: DECIDED,
    });

    const rows = await repo.listOpenAppeals();
    // OLDEST FIRST. A queue worked newest-first never reaches its tail, and
    // the appeals at the tail are from the people waiting longest.
    expect(rows.map((r) => r.subjectRef)).toEqual(["queue-a", "queue-b"]);
    for (const row of rows) expect(row.state).toBe("open");
  });

  it("gives the appellant their own appeals and nobody else's", async () => {
    await seedAct("a5000000-0000-4000-8000-000000000054", "mine-appeal", "delist");
    await seedAct("a5000000-0000-4000-8000-000000000055", "theirs-appeal", "delist");
    await repo.createAppeal({
      id: asUuid("a5000000-0000-4000-8000-000000000071"),
      actId: asUuid("a5000000-0000-4000-8000-000000000054"),
      subjectKind: "listing",
      subjectRef: "mine-appeal",
      appellantSubjectId: MAKER,
      says: "This one is mine and the decision was wrong.",
      filedAt: FILED,
    });
    await repo.createAppeal({
      id: asUuid("a5000000-0000-4000-8000-000000000072"),
      actId: asUuid("a5000000-0000-4000-8000-000000000055"),
      subjectKind: "listing",
      subjectRef: "theirs-appeal",
      appellantSubjectId: OTHER_MAKER,
      says: "This one is theirs and the decision was wrong.",
      filedAt: FILED,
    });

    const mine = await repo.listAppealsByAppellant(MAKER);
    expect(mine.map((r) => r.subjectRef)).toEqual(["mine-appeal"]);
  });

  it("counts appeals by state, and reversals on the date DECIDED", async () => {
    for (const [i, state] of (["upheld", "upheld", "refused"] as const).entries()) {
      const act = `a5000000-0000-4000-8000-00000000008${i}`;
      const id = asUuid(`a5000000-0000-4000-8000-00000000009${i}`);
      await seedAct(act, `counted-${i}`, "delist");
      await repo.createAppeal({
        id,
        actId: asUuid(act),
        subjectKind: "listing",
        subjectRef: `counted-${i}`,
        appellantSubjectId: MAKER,
        says: `The decision about counted-${i} was wrong.`,
        filedAt: FILED,
      });
      await repo.resolveAppeal({
        id,
        state,
        outcomeActId: asUuid(`a5000000-0000-4000-8000-0000000000a${i}`),
        // Only the FIRST uphold actually reversed anything. The second had
        // nothing left to undo, which is why the two figures differ.
        reversalActId: state === "upheld" && i === 0
          ? asUuid("a5000000-0000-4000-8000-0000000000b0")
          : null,
        decidedBy: OP,
        at: DECIDED,
      });
    }

    const states = Object.fromEntries(
      (await repo.countAppealsSince("2026-01-01T00:00:00.000Z")).map((r) => [r.state, r.count]),
    );
    expect(states).toEqual({ upheld: 2, refused: 1 });

    // Dated to the DECISION, not the filing: this figure sits beside "acts
    // taken" in the window, and an appeal filed in one window and upheld in
    // the next reversed something in the NEXT one.
    expect(await repo.countAppealReversalsSince("2026-01-01T00:00:00.000Z")).toBe(1);
    expect(await repo.countAppealReversalsSince("2026-12-01T00:00:00.000Z")).toBe(0);
  });

  it("counts reports by state, including the ones still waiting", async () => {
    await repo.createReport({
      id: asUuid("a5000000-0000-4000-8000-0000000000c1"),
      subjectKind: "listing",
      subjectRef: "reported-thing",
      reporterSubjectId: MAKER,
      reason: "spam",
    });
    const declined = await repo.createReport({
      id: asUuid("a5000000-0000-4000-8000-0000000000c2"),
      subjectKind: "listing",
      subjectRef: "other-thing",
      reporterSubjectId: OTHER_MAKER,
      reason: "spam",
    });
    await repo.resolveReport(asUuid(declined!.id), "declined", OP, DECIDED);

    const byState = Object.fromEntries(
      (await repo.countReportsSince("2026-01-01T00:00:00.000Z")).map((r) => [r.state, r.count]),
    );
    // A growing tail is a fact about our capacity, and publishing only what
    // we resolved would hide exactly the failure worth knowing about.
    expect(byState).toEqual({ open: 1, declined: 1 });
  });

  it("counts acts by kind, which is what the published report is generated from", async () => {
    await seedAct("a5000000-0000-4000-8000-0000000000d1", "counted-a", "delist");
    await seedAct("a5000000-0000-4000-8000-0000000000d2", "counted-b", "delist");
    await seedAct("a5000000-0000-4000-8000-0000000000d3", "counted-a", "relist");
    const acts = Object.fromEntries(
      (await repo.countModerationActsSince("2026-01-01T00:00:00.000Z")).map((r) => [r.act, r.count]),
    );
    expect(acts).toEqual({ delist: 2, relist: 1 });
    // Bounded by the window, so a rolling report cannot quietly become a
    // cumulative one.
    expect(await repo.countModerationActsSince("2026-12-01T00:00:00.000Z")).toEqual([]);
  });

  it("re-indexing an unreviewed public listing returns false rather than throwing", async () => {
    // 1370's CHECK would REJECT the statement, not return no rows, and a
    // constraint violation thrown out of an appeal decision would abort the
    // decision after its ledger row was written. So the WHERE states the
    // CHECK's own condition and the method answers honestly instead.
    const id = asUuid("a5000000-0000-4000-8000-000000000041");
    await seedDraft(id, asUuid("a5000000-0000-4000-8000-000000000042"), "unreviewed-thing");
    await repo.recordRepoObservation(id, {
      repoVisibility: "public",
      repoLicence: "Apache-2.0",
      observedAt: NOW,
    });
    // Public and never reviewed: exactly the row 1370 forbids from being
    // indexable.
    await sql.execute(
      `UPDATE openproduct.profiles SET visibility = 'public', indexable = FALSE WHERE id = $1`,
      [id],
    );
    expect(await repo.setListingIndexable(id, true)).toBe(false);
  });
});

describe("openproduct — the inbox (openproduct-launch NF0)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const CEE = "usr_0000000000000000000000000000cee0";
  const TH = asUuid("aaaaaaaa-ffff-4fff-8fff-aaaaaaaaaaa1");
  const P1 = asUuid("bbbbbbbb-ffff-4fff-8fff-bbbbbbbbbbb1");
  const AT = "2026-08-17T12:00:00.000Z";
  const LATER = "2026-08-17T13:00:00.000Z";
  const LATEST = "2026-08-17T14:00:00.000Z";

  let seq = 0;
  function nid() {
    seq += 1;
    return asUuid(`dddddddd-ffff-4fff-8fff-${String(seq).padStart(12, "0")}`);
  }

  function row(over: Partial<Parameters<typeof repo.writeNotification>[0]> = {}) {
    return {
      id: nid() as never,
      subjectId: ADA,
      kind: "post.reply",
      eventKey: "post.reply:post-1",
      actor: "bob",
      targetKind: "post",
      targetRef: "acme-thing",
      figure: null,
      ...over,
    } as Parameters<typeof repo.writeNotification>[0];
  }

  it("writes once per event per person, and a retry writes nothing", async () => {
    // THE SCHEMA IS THE GUARANTEE, not a check in a handler. A retried sweep,
    // a redelivered seam event and two workers racing all land on DO NOTHING
    // rather than on a duplicate in somebody's inbox.
    expect(await repo.writeNotification(row())).toBe(true);
    expect(await repo.writeNotification(row())).toBe(false);
    expect(await repo.countUnreadNotifications(ADA)).toBe(1);

    // The SAME event for a DIFFERENT person is a different row: the key is
    // the pair, so one event reaches everybody it should.
    expect(await repo.writeNotification(row({ subjectId: BOB }))).toBe(true);
    expect(await repo.countUnreadNotifications(BOB)).toBe(1);
  });

  it("shows a person only their own rows", async () => {
    await repo.writeNotification(row({ subjectId: ADA, eventKey: "post.reply:a" }));
    await repo.writeNotification(row({ subjectId: BOB, eventKey: "post.reply:b" }));
    const mine = await repo.listNotifications(ADA, 50);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.targetRef).toBe("acme-thing");
    expect(await repo.countUnreadNotifications(CEE)).toBe(0);
  });

  it("orders newest first and bounds what it returns", async () => {
    for (let i = 0; i < 5; i += 1) {
      await sql.execute(
        `INSERT INTO openproduct.notifications
           (id, subject_id, kind, event_key, target_kind, target_ref, created_at)
         VALUES ($1, $2, 'post.reply', $3, 'post', 'acme-thing', $4)`,
        [nid(), ADA, `post.reply:${i}`, `2026-08-1${i + 1}T12:00:00.000Z`],
      );
    }
    const rows = await repo.listNotifications(ADA, 3);
    expect(rows).toHaveLength(3);
    const times = rows.map((r) => Date.parse(r.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // A limit outside the range is clamped rather than obeyed: a page whose
    // row count grows with a person's whole history here needs a ceiling that
    // does not depend on the caller getting it right.
    expect((await repo.listNotifications(ADA, 0)).length).toBe(1);
    expect((await repo.listNotifications(ADA, 10_000)).length).toBe(5);
  });

  it("computes `unread` against the reader's OWN cursor, and stores it per row nowhere", async () => {
    await sql.execute(
      `INSERT INTO openproduct.notifications
         (id, subject_id, kind, event_key, target_kind, target_ref, created_at)
       VALUES ($1, $2, 'post.reply', 'post.reply:old', 'post', 'acme-thing', $3),
              ($4, $2, 'post.reply', 'post.reply:new', 'post', 'acme-thing', $5)`,
      [nid(), ADA, AT, nid(), LATEST],
    );
    // Before any mark, everything is unread.
    expect((await repo.listNotifications(ADA, 50)).every((r) => r.unread)).toBe(true);
    expect(await repo.countUnreadNotifications(ADA)).toBe(2);

    await repo.markNotificationsRead(ADA, LATER);
    const rows = await repo.listNotifications(ADA, 50);
    expect(rows.map((r) => r.unread)).toEqual([true, false]);
    expect(await repo.countUnreadNotifications(ADA)).toBe(1);

    // ONE ROW OF READ STATE, not one per notification. The rows themselves
    // were never touched, which is what makes reading a page not a write.
    const marks = await sql.execute<{ n: string | number }>(
      `SELECT count(*) AS n FROM openproduct.notification_reads WHERE subject_id = $1`,
      [ADA],
    );
    expect(Number(marks.rows[0]!.n)).toBe(1);
  });

  it("MOVES THE CURSOR ONLY FORWARD", async () => {
    // A clock that went backwards — two workers, a retried request — would
    // otherwise un-read things somebody has already seen, which is the one
    // direction this must not go.
    await repo.writeNotification(row({ eventKey: "post.reply:x" }));
    await repo.markNotificationsRead(ADA, LATEST);
    await repo.markNotificationsRead(ADA, AT);
    const at = await sql.execute<{ read_at: string | Date }>(
      `SELECT read_at FROM openproduct.notification_reads WHERE subject_id = $1`,
      [ADA],
    );
    expect(new Date(at.rows[0]!.read_at).toISOString()).toBe(LATEST);
  });

  it("marks a cursor for somebody with nothing to read, without inventing rows", async () => {
    await repo.markNotificationsRead(CEE, LATER);
    expect(await repo.listNotifications(CEE, 50)).toEqual([]);
    expect(await repo.countUnreadNotifications(CEE)).toBe(0);
  });

  it("refuses a kind or a target the contract does not name", async () => {
    // The vocabulary is a CHECK rather than a convention: a row whose kind no
    // phrasebook can render is a row the page falls through on.
    await expect(repo.writeNotification(row({ kind: "follow.maker" as never }))).rejects.toThrow();
    await expect(repo.writeNotification(row({ targetKind: "person" as never }))).rejects.toThrow();
  });

  it("carries a figure, or honestly carries none", async () => {
    await repo.writeNotification(row({ eventKey: "rank.first:2026-08-17", kind: "rank.first", targetKind: "listing", figure: 40 }));
    await repo.writeNotification(row({ eventKey: "post.reply:none" }));
    const rows = await repo.listNotifications(ADA, 50);
    const ranked = rows.find((r) => r.kind === "rank.first");
    expect(ranked!.figure).toBe(40);
    // Null, not zero. "Reached #1 with 0 upvotes" is a sentence a zero
    // standing in for an absence would produce (OPC-C).
    expect(rows.find((r) => r.kind === "post.reply")!.figure).toBeNull();
  });

  describe("the four reads the fan-out depends on", () => {
    async function seedThread() {
      await seedPublished();
      await repo.createThread({
        id: TH as never,
        profileId: PROFILE,
        tag: "question",
        title: "How do I run this locally?",
        authorSubjectId: ADA,
        at: AT,
      });
      await repo.createPost({ id: P1 as never, threadId: TH, authorSubjectId: ADA, body: "One.", at: AT });
    }

    it("finds the listing a thread belongs to", async () => {
      await seedThread();
      expect(await repo.getSlugForThread(TH)).toBe("acme-thing");
      expect(await repo.getSlugForThread(asUuid("aaaaaaaa-ffff-4fff-8fff-aaaaaaaaaaaf"))).toBeNull();
    });

    it("still finds it after the listing is DELISTED", async () => {
      // Deliberate, and the opposite of every public read on this repository.
      // A thread on a listing that has since been delisted still happened to
      // the person being told about it; the PAGE decides what they may see
      // when they follow the link, which is where that decision belongs.
      await seedThread();
      await sql.execute(`UPDATE openproduct.profiles SET visibility = 'private' WHERE id = $1`, [PROFILE]);
      expect(await repo.getSlugForThread(TH)).toBe("acme-thing");
    });

    it("finds a comment's author and its thread in one read", async () => {
      await seedThread();
      expect(await repo.getPostAuthor(P1)).toEqual({ authorSubjectId: ADA, threadId: TH });
      expect(await repo.getPostAuthor(asUuid("bbbbbbbb-ffff-4fff-8fff-bbbbbbbbbbbf"))).toBeNull();
    });

    it("does NOT find the author of a REMOVED comment", async () => {
      // A comment taken down under TS3 is not a thing anybody is notified
      // about. Telling its author it was upvoted would be the product
      // congratulating them on a post it had just removed.
      await seedThread();
      await sql.execute(
        `UPDATE openproduct.posts SET moderation_state = 'removed', moderated_at = $2 WHERE id = $1`,
        [P1, LATER],
      );
      expect(await repo.getPostAuthor(P1)).toBeNull();
    });

    it("lists a topic's followers, bounded and oldest first", async () => {
      await repo.follow(ADA, "topic", "developer-tools");
      await repo.follow(BOB, "topic", "developer-tools");
      await repo.follow(CEE, "topic", "design");
      expect(await repo.listTopicFollowers("developer-tools", 5000)).toEqual([ADA, BOB]);
      expect(await repo.listTopicFollowers("developer-tools", 1)).toEqual([ADA]);
      expect(await repo.listTopicFollowers("nobody-follows-this", 5000)).toEqual([]);
    });

    it("CANNOT BE POINTED AT PEOPLE, whatever it is passed", async () => {
      // FL0 promised, on the page where somebody decides to make their profile
      // public: "How many people follow you — a count only, never who they
      // are, not even to you." One table holds both kinds, so the read that
      // could break that promise is the read that takes a kind. This one does
      // not: `kind = 'topic'` is a LITERAL in the SQL, and a caller passing a
      // handle gets the topic of that name — which is nothing — rather than a
      // person's followers.
      await repo.follow(BOB, "topic", "developer-tools");
      await repo.follow(BOB, "person", "ada");
      expect(await repo.listTopicFollowers("ada", 5000)).toEqual([]);
    });

    it("drops a follower who unfollowed before the launch fired", async () => {
      await repo.follow(ADA, "topic", "developer-tools");
      await repo.unfollow(ADA, "topic", "developer-tools");
      expect(await repo.listTopicFollowers("developer-tools", 5000)).toEqual([]);
    });

    it("lists a listing's maintainers, once each", async () => {
      // The same edge a maker page's `maintains` reads, so "whose launch is
      // this" and "whose page does it appear on" are one answer.
      await seedPublished();
      await repo.addListingMaintainer(PROFILE, ADA, "owner", ADA);
      await repo.addListingMaintainer(PROFILE, BOB, "maintainer", ADA);
      await repo.addListingMaintainer(PROFILE, BOB, "maintainer", ADA);
      // ACTOR is here because `createProfile` wrote the first edge: whoever
      // creates a listing maintains it. That is the same row a maker page
      // reads, which is the point of using this table rather than a second one.
      expect((await repo.listMaintainerSubjects(PROFILE)).sort()).toEqual([ACTOR, ADA, BOB].sort());
      expect(await repo.listMaintainerSubjects(asUuid("55555555-5555-4555-8555-55555555555f"))).toEqual([]);
    });
  });
});
