// The openproduct repository against a live engine — the two-sided roster, the grandfather, the profile stats, the launch, the week, the strip, consequence.
//
// CG3's roster and OPC-G, CG4's two stats, the launch distinct from the publish, LC1's published week, LC2's strip counts, and what consequence leaves behind (TS3).
//
// Cut from `repository-pg.test.ts` at openproduct-verification OV3, verbatim:
// the engine, the ids and the two seeds come from `./harness.js`, which
// restores the ladder's template per test instead of re-applying fifty
// migrations. Nothing a test asserts changed; what it costs did.

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { sql, repo, ORG, PROJECT, PROJECT_TWO, PROFILE, PROFILE_TWO, OPENING, ACTOR, ADMIN, NOW, REVIEWED_PUBLISH, EN3_REASONS, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

describe("openproduct — the two-sided roster (openproduct-commons CG3)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const NOW_TS = "2026-08-17T12:00:00.000Z";

  // THE PROPERTY UNDER TEST THROUGHOUT: a name reaches a public page only
  // when the person it belongs to put it there (OPC-5).
  it("a PENDING edge is invisible to the public and visible to both parties", async () => {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: "maintainer" }]);
    await repo.inviteToRoster({
      profileId: PROFILE,
      subjectId: ADA,
      roleLabel: "reviewer",
      invitedBy: ACTOR,
      at: NOW_TS,
    });

    // The public sees nothing — and the filter is in SQL, so there is no
    // caller who could forget to check.
    expect(await repo.listRoster(PROFILE)).toEqual([]);
    // The named person sees an invitation they can answer.
    const mine = await repo.listRosterForSubject(ADA);
    expect(mine.invitations.map((i) => i.slug)).toEqual(["acme-thing"]);
    expect(mine.confirmed).toEqual([]);
    // The maintainer sees the edge exists.
    expect(await repo.getRosterEdge(PROFILE, ADA)).toMatchObject({ state: "pending" });
  });

  it("confirming publishes them — and NOTHING else does", async () => {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: "maintainer" }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    expect(await repo.listRoster(PROFILE)).toEqual([]);

    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);
    const roster = await repo.listRoster(PROFILE);
    expect(roster.map((r) => r.subjectId)).toEqual([ADA]);
    // The maintainer's label wins where they wrote one — it is the
    // publication list's field and always has been.
    expect(roster[0]!.roleLabel).toBe("maintainer");
  });

  it("RECONCILES: publication list AND consent, never one alone", async () => {
    await seedPublished();
    // Confirmed, but the maintainer never published them.
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: BOB, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, BOB, NOW_TS);
    expect(await repo.listRoster(PROFILE)).toEqual([]);

    // Published, but never confirmed.
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    expect(await repo.listRoster(PROFILE)).toEqual([]);

    // Both halves. Only now.
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);
    expect((await repo.listRoster(PROFILE)).map((r) => r.subjectId)).toEqual([ADA]);

    // And removing them from the publication list takes them off the roster
    // without touching their consent — the maintainer's list is still the
    // maintainer's list.
    await repo.setMaintainers(PROFILE, []);
    expect(await repo.listRoster(PROFILE)).toEqual([]);
    expect(await repo.getRosterEdge(PROFILE, ADA)).toMatchObject({ state: "confirmed" });
  });

  it("declining leaves NO ROW", async () => {
    await seedPublished();
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    expect(await repo.declineRosterEdge(PROFILE, ADA)).toBe(true);
    // "I was never part of this" should leave no record that they were asked.
    expect(await repo.getRosterEdge(PROFILE, ADA)).toBeNull();
    // Declining twice is a no-op rather than an error.
    expect(await repo.declineRosterEdge(PROFILE, ADA)).toBe(false);
  });

  it("retiring KEEPS the row, because the work happened", async () => {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);

    await repo.retireRosterEdge(PROFILE, ADA, ADA, "2026-08-20T00:00:00.000Z");
    expect(await repo.listRoster(PROFILE)).toEqual([]);
    // The row survives — CG4's `contributes to` counts over history, and
    // somebody who spent two years on a product did that whether or not they
    // are on it today.
    expect(await repo.getRosterEdge(PROFILE, ADA)).toMatchObject({ state: "retired" });
    expect(await repo.countRosterMemberships(ADA)).toBe(1);
  });

  it("re-inviting somebody who RETIRED reopens the invitation, not the membership", async () => {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);
    await repo.retireRosterEdge(PROFILE, ADA, ACTOR, "2026-08-20T00:00:00.000Z");

    const again = await repo.inviteToRoster({
      profileId: PROFILE,
      subjectId: ADA,
      roleLabel: "back again",
      invitedBy: ACTOR,
      at: "2026-08-21T00:00:00.000Z",
    });
    // Asking somebody back is a new invitation, not a resurrection: they get
    // to answer it again, and the public sees nothing until they do.
    expect(again.state).toBe("pending");
    expect(await repo.listRoster(PROFILE)).toEqual([]);
  });

  it("UV2 — the batched read applies the SAME reconciliation as the single one", async () => {
    // The leaderboard reads rosters for a whole table at once. It must be the
    // batched version of `listRoster` and not a looser rule: a second answer
    // to "who is publicly on this product" is how an unconsented name reaches
    // a page.
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");

    // One listing: published AND confirmed — visible.
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: "maintainer" }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);

    // The other: published but NEVER CONFIRMED — invisible, and the batch must
    // not be the place that forgets.
    await repo.setMaintainers(PROFILE_TWO, [{ subjectId: BOB, displayName: "Bob", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE_TWO, subjectId: BOB, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });

    const batch = await repo.listRostersFor([PROFILE, PROFILE_TWO]);
    expect(batch.get(PROFILE)?.map((r) => r.subjectId)).toEqual([ADA]);
    // ABSENT, not an empty array: the caller renders nothing either way, and
    // an absent key cannot be mistaken for a measured emptiness.
    expect(batch.has(PROFILE_TWO)).toBe(false);

    // And it agrees with the single read, row for row.
    expect(batch.get(PROFILE)).toEqual(await repo.listRoster(PROFILE));
    expect(await repo.listRoster(PROFILE_TWO)).toEqual([]);
  });

  it("UV2 — the batched read asks once for many listings, and nothing for none", async () => {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);

    // A duplicate id is not two rows: the leaderboard can hold two launches of
    // one listing, and the read de-duplicates rather than returning them twice.
    const dup = await repo.listRostersFor([PROFILE, PROFILE]);
    expect(dup.get(PROFILE)).toHaveLength(1);

    // An empty ask is an empty map, and touches the database not at all.
    expect(await repo.listRostersFor([])).toEqual(new Map());
  });

  it("re-inviting somebody who already CONFIRMED does not reset them", async () => {
    // The bug this catches: a maintainer editing a role label and silently
    // un-publishing somebody who had agreed.
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);

    const again = await repo.inviteToRoster({
      profileId: PROFILE,
      subjectId: ADA,
      roleLabel: "new label",
      invitedBy: ACTOR,
      at: "2026-08-21T00:00:00.000Z",
    });
    expect(again.state).toBe("confirmed");
    expect((await repo.listRoster(PROFILE)).map((r) => r.subjectId)).toEqual([ADA]);
  });

  it("links a name to a profile only when the profile RESOLVES (XP-5)", async () => {
    // CG4 STRENGTHENED THIS. The handle used to appear as soon as somebody
    // ticked "public", and that was a dead link: `getPublicContributor` also
    // requires STANDING — an owner or maintainer role on a published listing
    // — and being on this roster is not standing. A credited designer with no
    // edit access has a consented place on a product and no page of their own.
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);
    // No public profile at all: plain text, on both reads.
    expect((await repo.listRoster(PROFILE))[0]!.handle).toBeNull();
    expect((await repo.listPublicMaintainers(PROFILE))[0]!.handle).toBeNull();

    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada Fenwick", bio: null });
    await repo.claimHandle("ada", ADA, NOW_TS);
    await repo.setProfileVisibility(ADA, true, NOW_TS);
    // OPTED IN, BUT NO STANDING — and this is the case that used to hand out
    // a 404. The profile read says there is no page; both roster reads must
    // agree, or somebody's name links into nothing.
    expect(await repo.getPublicContributor("ada")).toBeNull();
    expect((await repo.listRoster(PROFILE))[0]!.handle).toBeNull();
    expect((await repo.listPublicMaintainers(PROFILE))[0]!.handle).toBeNull();

    // Standing arrives; the page exists; the name becomes a link.
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    expect(await repo.getPublicContributor("ada")).not.toBeNull();
    const linked = (await repo.listRoster(PROFILE))[0]!;
    expect(linked.handle).toBe("ada");
    // The ROSTER shows the person's own name; the product page's credits show
    // what the maintainer wrote. Two deliberate answers, not a drift.
    expect(linked.displayName).toBe("Ada Fenwick");
    const credited = (await repo.listPublicMaintainers(PROFILE))[0]!;
    expect(credited.handle).toBe("ada");
    expect(credited.displayName).toBe("Ada");
  });

  it("takes the link away again when the profile stops resolving", async () => {
    // The failure a denormalised flag would produce: a link that outlives the
    // page it points at. Both reads compute it as a JOIN, so unpublishing the
    // listing that granted standing withdraws the link with nothing else
    // touched — and republishing restores it.
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);
    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada Fenwick", bio: null });
    await repo.claimHandle("ada", ADA, NOW_TS);
    await repo.setProfileVisibility(ADA, true, NOW_TS);
    // Her standing comes from the OTHER listing, so this one can be left alone.
    await repo.addListingMaintainer(PROFILE_TWO, ADA, "maintainer", ACTOR);
    expect((await repo.listPublicMaintainers(PROFILE))[0]!.handle).toBe("ada");

    await repo.unpublishProfile(ORG, PROFILE_TWO, ACTOR);
    expect(await repo.getPublicContributor("ada")).toBeNull();
    expect((await repo.listPublicMaintainers(PROFILE))[0]!.handle).toBeNull();
    expect((await repo.listRoster(PROFILE))[0]!.handle).toBeNull();

    await repo.publishProfile(ORG, PROFILE_TWO, NOW, ACTOR, REVIEWED_PUBLISH);
    expect((await repo.listPublicMaintainers(PROFILE))[0]!.handle).toBe("ada");
  });

  it("hiding a profile withdraws the link, without touching the roster", async () => {
    // Their own act, and it must be enough on its own. Somebody who unticks
    // "public" has withdrawn a page, not a place on a product: the row stays,
    // the name stays, the link goes.
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);
    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada Fenwick", bio: null });
    await repo.claimHandle("ada", ADA, NOW_TS);
    await repo.setProfileVisibility(ADA, true, NOW_TS);
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    expect((await repo.listPublicMaintainers(PROFILE))[0]!.handle).toBe("ada");

    await repo.setProfileVisibility(ADA, false, NOW_TS);
    const row = (await repo.listPublicMaintainers(PROFILE))[0]!;
    expect(row.handle).toBeNull();
    expect(row.displayName).toBe("Ada");
    expect(await repo.listRoster(PROFILE)).toHaveLength(1);
  });

  it("a RELEASED handle never links — it belongs to whoever holds it next", async () => {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);
    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada Fenwick", bio: null });
    await repo.claimHandle("ada", ADA, NOW_TS);
    await repo.setProfileVisibility(ADA, true, NOW_TS);
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    expect((await repo.listPublicMaintainers(PROFILE))[0]!.handle).toBe("ada");

    // A tombstone still has her subject id on it. Resolving through it would
    // hand her old address — and whoever claims it next — to every reader of
    // this product page.
    await repo.releaseHandle(ADA, NOW_TS);
    expect((await repo.listPublicMaintainers(PROFILE))[0]!.handle).toBeNull();
    expect((await repo.listRoster(PROFILE))[0]!.handle).toBeNull();
  });

  it("counts memberships over PUBLIC listings only, and over history", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    for (const id of [PROFILE, PROFILE_TWO]) {
      await repo.inviteToRoster({ profileId: id, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
      await repo.confirmRosterEdge(id, ADA, NOW_TS);
    }
    expect(await repo.countRosterMemberships(ADA)).toBe(2);

    // A draft's edge does not count: a profile stat that included drafts
    // would reveal how many unpublished things somebody is on.
    await repo.unpublishProfile(ORG, PROFILE_TWO, ACTOR);
    expect(await repo.countRosterMemberships(ADA)).toBe(1);

    // A pending edge never counts — they have not agreed.
    await repo.inviteToRoster({ profileId: PROFILE_TWO, subjectId: BOB, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    expect(await repo.countRosterMemberships(BOB)).toBe(0);
  });
});

describe("openproduct — OPC-G, the grandfather (CG3)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const NOW_TS = "2026-08-17T12:00:00.000Z";

  it("marks a carried-over edge as one nobody confirmed", async () => {
    // The migration ran at bootstrap over an empty table, so this replays
    // what it does: a published maintainer with no consent becomes a
    // confirmed edge MARKED `grandfathered`.
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: "maintainer" }]);
    await sql.execute(
      `INSERT INTO openproduct.product_people
         (profile_id, subject_id, state, origin, role_label, invited_by, invited_at, confirmed_at)
       VALUES ($1, $2, 'confirmed', 'grandfathered', NULL, 'grandfathered', $3, $3)`,
      [PROFILE, ADA, NOW_TS],
    );

    // It renders exactly like a real one — the roster cannot usefully caveat
    // every row, and a half-visible person is worse than either state.
    expect((await repo.listRoster(PROFILE)).map((r) => r.subjectId)).toEqual([ADA]);
    // ...but the estate knows, and can say how many consents it assumed.
    expect(await repo.countGrandfathered()).toBe(1);
    // And the person is told, by name, which of their listings it was.
    expect((await repo.listRosterForSubject(ADA)).grandfathered).toEqual(["acme-thing"]);
  });

  it("says nothing about a grandfathered edge on a DRAFT", async () => {
    // Telling somebody "you are listed and never agreed" about a listing
    // nobody can see would be an alarm about nothing.
    await seedDraft();
    await sql.execute(
      `INSERT INTO openproduct.product_people
         (profile_id, subject_id, state, origin, role_label, invited_by, invited_at, confirmed_at)
       VALUES ($1, $2, 'confirmed', 'grandfathered', NULL, 'grandfathered', $3, $3)`,
      [PROFILE, ADA, NOW_TS],
    );
    expect((await repo.listRosterForSubject(ADA)).grandfathered).toEqual([]);
  });

  it("stops counting somebody who has since actually confirmed", async () => {
    // Somebody carried over who then said yes HAS consented, and the estate
    // should stop counting them among the consents it assumed.
    await seedPublished();
    await sql.execute(
      `INSERT INTO openproduct.product_people
         (profile_id, subject_id, state, origin, role_label, invited_by, invited_at, confirmed_at)
       VALUES ($1, $2, 'pending', 'grandfathered', NULL, 'grandfathered', $3, NULL)`,
      [PROFILE, ADA, NOW_TS],
    );
    expect(await repo.countGrandfathered()).toBe(0);
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);
    const edge = await repo.getRosterEdge(PROFILE, ADA);
    expect(edge).toMatchObject({ state: "confirmed", origin: "confirmed_by_subject" });
    expect(await repo.countGrandfathered()).toBe(0);
  });
});

describe("openproduct — the two profile stats (openproduct-commons CG4)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const AT = "2026-08-17T12:00:00.000Z";

  /** Ada with a public profile and one listing she RUNS, so she has standing. */
  async function withStanding() {
    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada Fenwick" });
    await repo.claimHandle("ada", ADA, NOW);
    await repo.setProfileVisibility(ADA, true, NOW);
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
  }

  /** A second published listing she does NOT run — somewhere to be named. */
  async function elsewhere() {
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "ledgerwick");
  }

  async function confirmedOn(profileId = PROFILE_TWO) {
    await repo.inviteToRoster({
      profileId,
      subjectId: ADA,
      roleLabel: "reviewer",
      invitedBy: ACTOR,
      at: AT,
    });
    await repo.confirmRosterEdge(profileId, ADA, AT);
  }

  it("counts a confirmed place on somebody else's published listing", async () => {
    await withStanding();
    await elsewhere();
    // Before she answers: nothing. A pending invitation is a thing the
    // maintainer did, and OPC-5 says a person's own act is what publishes.
    await repo.inviteToRoster({
      profileId: PROFILE_TWO,
      subjectId: ADA,
      roleLabel: "reviewer",
      invitedBy: ACTOR,
      at: AT,
    });
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toEqual([]);

    await repo.confirmRosterEdge(PROFILE_TWO, ADA, AT);
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toEqual([
      { slug: "ledgerwick", tagline: "A thing, built in the open" },
    ]);
  });

  it("SUBTRACTS what `maintains` already counted — never both", async () => {
    // THE BUG THIS EXISTS TO STOP: a profile reading "maintains 1 ·
    // contributes to 1" about ONE product. Somebody who runs a listing and
    // also confirmed a place on it did one thing, not two, and a reader
    // adding the two numbers would get a count of products that do not exist.
    await withStanding();
    await confirmedOn(PROFILE);

    const profile = (await repo.getPublicContributor("ada"))!;
    expect(profile.maintains.map((l) => l.slug)).toEqual(["acme-thing"]);
    expect(profile.contributesTo).toEqual([]);
    // And the subtraction is against the AUTHORITY table, which is what
    // `maintains` is computed from. Subtracting the published list instead
    // would let the two disagree the moment a maintainer edited their credits.
    const slugs = new Set(profile.maintains.map((l) => l.slug));
    expect(profile.contributesTo.filter((l) => slugs.has(l.slug))).toEqual([]);
  });

  it("KEEPS a place they retired from — leaving costs them nothing here", async () => {
    // CG3 made retiring unilateral so that leaving a product is never a
    // negotiation. A profile that erased the work on the way out would put
    // the cost straight back, and quietly: the person would find out by
    // watching their own page shrink.
    await withStanding();
    await elsewhere();
    await confirmedOn();
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toHaveLength(1);

    await repo.retireRosterEdge(PROFILE_TWO, ADA, ADA, AT);
    // Gone from the PRODUCT's roster — they are not there any more...
    expect(await repo.listRoster(PROFILE_TWO)).toEqual([]);
    // ...and still on their own profile, because the work happened.
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toEqual([
      { slug: "ledgerwick", tagline: "A thing, built in the open" },
    ]);
  });

  it("drops a place whose listing is UNPUBLISHED, and returns it on republish", async () => {
    // The same join-not-a-flag property `maintains` has. A profile naming a
    // product nobody can open is a dead link on the most exposed page in the
    // estate (XP-5), and the listing's owner unpublishing it is not an event
    // anybody thought to tell this page about.
    await withStanding();
    await elsewhere();
    await confirmedOn();
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toHaveLength(1);

    await repo.unpublishProfile(ORG, PROFILE_TWO, ACTOR);
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toEqual([]);

    await repo.publishProfile(ORG, PROFILE_TWO, NOW, ACTOR, REVIEWED_PUBLISH);
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toHaveLength(1);
  });

  it("does not count an invitation that was DECLINED", async () => {
    await withStanding();
    await elsewhere();
    await repo.inviteToRoster({
      profileId: PROFILE_TWO,
      subjectId: ADA,
      roleLabel: null,
      invitedBy: ACTOR,
      at: AT,
    });
    await repo.declineRosterEdge(PROFILE_TWO, ADA);
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toEqual([]);
  });

  it("the CARD's count and the PAGE's list are the same answer", async () => {
    // Two queries, two surfaces, one sentence. They are written out
    // separately because each projects what its surface needs — and the way
    // that stops being a duplication bug is this test, run against the same
    // fixtures, rather than a promise in a comment.
    await withStanding();
    await elsewhere();
    await confirmedOn();

    const card = (await repo.listPublicContributorCards(50)).find((c) => c.handle === "ada")!;
    const page = (await repo.getPublicContributor("ada"))!;
    expect(card.contributesTo).toBe(page.contributesTo.length);
    // A NUMBER, not the string a bigint driver hands back. `"0"` is truthy,
    // and a card that trusted it would render every contributor as having
    // contributed to something.
    expect(typeof card.contributesTo).toBe("number");

    // And zero is zero on both, rather than one of them omitting the person.
    await repo.retireRosterEdge(PROFILE_TWO, ADA, ADA, AT);
    await repo.unpublishProfile(ORG, PROFILE_TWO, ACTOR);
    const empty = (await repo.listPublicContributorCards(50)).find((c) => c.handle === "ada")!;
    expect(empty.contributesTo).toBe(0);
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toEqual([]);
  });

  it("counts nobody else's edges into this person's profile", async () => {
    // The subquery correlates on `c.subject_id`. A stray join condition here
    // would show one person another person's work, which is the worst thing
    // this page could get wrong.
    const BOB = "usr_0000000000000000000000000000bob0";
    await withStanding();
    await elsewhere();
    await repo.inviteToRoster({
      profileId: PROFILE_TWO,
      subjectId: BOB,
      roleLabel: null,
      invitedBy: ACTOR,
      at: AT,
    });
    await repo.confirmRosterEdge(PROFILE_TWO, BOB, AT);
    expect((await repo.getPublicContributor("ada"))!.contributesTo).toEqual([]);
  });
});

describe("openproduct — the launch, distinct from the publish (openproduct-commons LC0)", () => {
  const AT = "2026-09-01T09:00:00.000Z";
  const LATER = "2026-09-03T09:00:00.000Z";
  const L1 = asUuid("aaaaaaaa-0000-4000-8000-000000000001");
  const L2 = asUuid("aaaaaaaa-0000-4000-8000-000000000002");
  const L3 = asUuid("aaaaaaaa-0000-4000-8000-000000000003");

  const schedule = (id: string, versionLabel: string, scheduledFor: string, profileId = PROFILE) =>
    repo.scheduleLaunch({
      id: id as never,
      profileId: profileId as never,
      versionLabel,
      scheduledFor,
      scheduledBy: ACTOR,
    });

  it("a scheduled launch is invisible until its moment, and then it is live", async () => {
    await seedPublished();
    await schedule(L1, "1.0", LATER);
    expect((await repo.listLaunchesForProfile(PROFILE))[0]).toMatchObject({
      state: "scheduled",
      launchedAt: null,
    });

    // Before the moment: nothing fires. The embargo is the state, and there is
    // no second mechanism that could disagree with it.
    expect(await repo.fireDueLaunches(AT)).toEqual({ live: 0, missed: 0, fired: [] });
    expect((await repo.getLaunch(L1))!.state).toBe("scheduled");

    // NF0 WIDENED THIS RETURN: the sweep now says WHAT fired, not only how
    // many, so a caller announcing launches does not have to re-read the day
    // it just wrote — and cannot re-read it and get a different answer.
    // `topic` is the listing's category, and null here because this fixture
    // has none: a launch in no topic tells nobody, which is correct.
    expect(await repo.fireDueLaunches("2026-09-03T09:00:01.000Z")).toEqual({
      live: 1,
      missed: 0,
      fired: [{ slug: "acme-thing", topic: null }],
    });
    const fired = (await repo.getLaunch(L1))!;
    expect(fired.state).toBe("live");
    // `launched_at` IS THE MOMENT THEY CHOSE, not the moment the sweep ran.
    // LC-2 tie-breaks the board by earliest launch time, and stamping the
    // sweep's clock would order the board by cron jitter.
    expect(fired.launchedAt).toBe(LATER);
  });

  it("MISSES rather than announcing a page nobody can open", async () => {
    // The rule this state exists for: a launch cannot fire while its listing
    // is unpublished. Firing anyway would announce a 404.
    await seedPublished();
    await schedule(L1, "1.0", LATER);
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);

    // MISSED IS NOT FIRED, and the list says so: nobody is told about a
    // launch that announced nothing.
    expect(await repo.fireDueLaunches("2026-09-03T09:00:01.000Z")).toEqual({
      live: 0,
      missed: 1,
      fired: [],
    });
    const missed = (await repo.getLaunch(L1))!;
    expect(missed.state).toBe("missed");
    expect(missed.launchedAt).toBeNull();
  });

  it("a missed launch RELEASES its version, and can be rescheduled", async () => {
    // Nothing was announced, so there is nothing for the once-per-version rule
    // to protect anybody from — and the alternative is a maker who unpublished
    // for an hour losing their 2.0 launch forever.
    await seedPublished();
    await schedule(L1, "1.0", LATER);
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    await repo.fireDueLaunches("2026-09-03T09:00:01.000Z");
    expect((await repo.launchEligibility(PROFILE)).consumedVersions).toEqual([]);

    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    const moved = await repo.rescheduleLaunch(L1, "2026-09-10T09:00:00.000Z");
    expect(moved).toMatchObject({ state: "scheduled", missedAt: null });
    expect((await repo.launchEligibility(PROFILE)).consumedVersions).toEqual(["1.0"]);
  });

  it("a LIVE launch cannot be moved or cancelled — the record is public", async () => {
    // The state filter is in the UPDATE's WHERE clause rather than in a
    // read-then-write, so a launch that fires between the studio rendering its
    // Move button and the form posting lands here instead of rewriting a
    // public record.
    await seedPublished();
    await schedule(L1, "1.0", LATER);
    await repo.fireDueLaunches("2026-09-03T09:00:01.000Z");

    expect(await repo.rescheduleLaunch(L1, "2026-10-01T09:00:00.000Z")).toBeNull();
    expect(await repo.cancelLaunch(L1, ACTOR, AT)).toBeNull();
    expect((await repo.getLaunch(L1))!.state).toBe("live");
  });

  it("a cancelled launch releases its version and stops firing", async () => {
    await seedPublished();
    await schedule(L1, "1.0", LATER);
    expect(await repo.cancelLaunch(L1, ACTOR, AT)).toMatchObject({ state: "cancelled" });
    expect(await repo.fireDueLaunches("2026-09-03T09:00:01.000Z")).toEqual({
      live: 0,
      missed: 0,
      fired: [],
    });
    expect((await repo.launchEligibility(PROFILE)).consumedVersions).toEqual([]);

    // ...and the version can be used again, which is the point of releasing it.
    await schedule(L2, "1.0", "2026-09-10T09:00:00.000Z");
    expect((await repo.launchEligibility(PROFILE)).consumedVersions).toEqual(["1.0"]);
  });

  it("the DATABASE refuses a duplicate version, not just the handler", async () => {
    // The check in `core` is advisory and explains; these indexes are what
    // hold under a race that beats the read.
    await seedPublished();
    await schedule(L1, "1.0", LATER);
    await repo.fireDueLaunches("2026-09-03T09:00:01.000Z");
    await expect(schedule(L2, "1.0", "2026-10-01T09:00:00.000Z")).rejects.toThrow();
  });

  it("...and refuses it through a CASE or WHITESPACE variation", async () => {
    // `2.0` and `V2.0 ` are one version to every reader. The index normalises
    // the same way the contract's `sameVersion` does, or the rule is defeated
    // by a capital letter.
    await seedPublished();
    await schedule(L1, "2.0", LATER);
    await expect(schedule(L2, " v2.0 ", "2026-10-01T09:00:00.000Z")).rejects.toThrow();
    await expect(schedule(L3, "V2.0", "2026-10-01T09:00:00.000Z")).rejects.toThrow();
  });

  it("refuses a SECOND scheduled launch — move the first instead", async () => {
    await seedPublished();
    await schedule(L1, "1.0", LATER);
    await expect(schedule(L2, "2.0", "2026-10-01T09:00:00.000Z")).rejects.toThrow();
  });

  it("scopes every rule to ONE listing", async () => {
    // The indexes are per `profile_id`. A shared uniqueness would make one
    // maker's "1.0" block everybody else's, which is the kind of bug that only
    // shows up once two products exist.
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await schedule(L1, "1.0", LATER);
    await schedule(L2, "1.0", LATER, PROFILE_TWO);
    expect((await repo.launchEligibility(PROFILE)).consumedVersions).toEqual(["1.0"]);
    expect((await repo.launchEligibility(PROFILE_TWO)).consumedVersions).toEqual(["1.0"]);
  });

  it("answers every eligibility fact from ONE read of one instant", async () => {
    // Reading these separately would let a cooldown be checked before a
    // concurrent launch fires and a version list after it, which passes a
    // check against a state that never existed.
    await seedPublished();
    const empty = await repo.launchEligibility(PROFILE);
    expect(empty).toEqual({
      profileId: PROFILE,
      // LC1 added this: the studio's crumbs name the listing rather than
      // echoing an opaque id back at the person who maintains it.
      slug: "acme-thing",
      isPublished: true,
      consumedVersions: [],
      lastLaunchedAt: null,
      hasScheduled: false,
    });

    await schedule(L1, "1.0", LATER);
    await repo.fireDueLaunches("2026-09-03T09:00:01.000Z");
    await schedule(L2, "2.0", "2026-10-01T09:00:00.000Z");
    const full = await repo.launchEligibility(PROFILE);
    expect(full.hasScheduled).toBe(true);
    expect([...full.consumedVersions].sort()).toEqual(["1.0", "2.0"]);
    expect(full.lastLaunchedAt).toBe(LATER);
    // ISO STRINGS, not driver `Date`s: the studio renders these and the
    // contract promises strings. CG2's sitemap paid for this lesson once.
    expect(typeof full.lastLaunchedAt).toBe("string");
  });

  it("a listing that does not exist is not launchable, in the same shape", async () => {
    // Not a null the caller has to remember to check twice.
    expect(await repo.launchEligibility(PROFILE_TWO)).toMatchObject({
      profileId: null,
      isPublished: false,
    });
  });

  it("says a DRAFT is not published, without refusing to answer", async () => {
    await seedDraft();
    expect(await repo.launchEligibility(PROFILE)).toMatchObject({
      profileId: PROFILE,
      isPublished: false,
    });
  });

  it("deleting a listing takes its launches", async () => {
    // The FK cascade stays inside the teardown unit, like every other table in
    // this schema.
    await seedPublished();
    await schedule(L1, "1.0", LATER);
    await repo.deleteProfile(ORG, PROFILE);
    expect(await repo.getLaunch(L1)).toBeNull();
  });

  it("fires many at once, oldest moment first", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await schedule(L1, "1.0", "2026-09-02T09:00:00.000Z");
    await schedule(L2, "1.0", "2026-09-01T09:00:00.000Z", PROFILE_TWO);
    const swept = await repo.fireDueLaunches("2026-09-03T00:00:00.000Z");
    expect(swept.live).toBe(2);
    expect(swept.missed).toBe(0);
    // One entry per launch, so NF0's fan-out announces each of them once.
    expect([...swept.fired].map((f) => f.slug).sort()).toEqual(["acme-thing", "beta-thing"]);
    // Each keeps its OWN moment, so the board's tie-break is meaningful.
    expect((await repo.getLaunch(L1))!.launchedAt).toBe("2026-09-02T09:00:00.000Z");
    expect((await repo.getLaunch(L2))!.launchedAt).toBe("2026-09-01T09:00:00.000Z");
  });

  it("is idempotent — a second sweep over the same instant fires nothing", async () => {
    await seedPublished();
    await schedule(L1, "1.0", LATER);
    expect(await repo.fireDueLaunches("2026-09-03T09:00:01.000Z")).toEqual({
      live: 1,
      missed: 0,
      fired: [{ slug: "acme-thing", topic: null }],
    });
    // The second sweep announces nothing, which is what keeps NF0's fan-out
    // from telling a topic's followers twice about the same launch — before
    // its event key ever has to.
    expect(await repo.fireDueLaunches("2026-09-03T09:00:01.000Z")).toEqual({
      live: 0,
      missed: 0,
      fired: [],
    });
  });
});

describe("openproduct — the week, published (openproduct-commons LC1)", () => {
  // 2026-w33 is Mon 10 – Sun 16 August. The window is half-open.
  const START = "2026-08-10T00:00:00.000Z";
  const END = "2026-08-17T00:00:00.000Z";
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const L1 = asUuid("bbbbbbbb-0000-4000-8000-000000000001");
  const L2 = asUuid("bbbbbbbb-0000-4000-8000-000000000002");

  async function launchedAt(id: string, profileId: string, at: string, version = "1.0") {
    await repo.scheduleLaunch({
      id: id as never,
      profileId: profileId as never,
      versionLabel: version,
      scheduledFor: at,
      scheduledBy: ACTOR,
    });
    await repo.fireDueLaunches(new Date(Date.parse(at) + 1000).toISOString());
  }

  /** Endorse, then move `created_at` back to the moment the test means. The
   *  repository stamps `now()`, and every claim here is about WHICH WEEK an
   *  endorsement fell in. */
  async function endorse(profileId: string, subjectId: string, at: string) {
    await repo.endorse(profileId as never, subjectId, "confirmed", at);
    await sql.execute(
      `UPDATE openproduct.endorsements SET created_at = $2
        WHERE profile_id = $1 AND subject_id = $3`,
      [profileId, at, subjectId],
    );
  }

  it("lists the launches inside the window, earliest first", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await launchedAt(L1, PROFILE, "2026-08-14T09:00:00.000Z");
    await launchedAt(L2, PROFILE_TWO, "2026-08-11T09:00:00.000Z");

    const week = await repo.listLaunchesInWindow(START, END);
    expect(week.map((l) => l.slug)).toEqual(["beta-thing", "acme-thing"]);
    expect(week[0]!.versionLabel).toBe("1.0");
  });

  it("is HALF-OPEN, so no launch lands in two digests", async () => {
    // A closed range double-counts the instant two weeks meet, and the one
    // launch scheduled for exactly midnight Monday would appear in both — two
    // archive documents disagreeing about the same fact.
    await seedPublished();
    await launchedAt(L1, PROFILE, END);
    expect(await repo.listLaunchesInWindow(START, END)).toEqual([]);
    expect(
      (await repo.listLaunchesInWindow(END, "2026-08-24T00:00:00.000Z")).map((l) => l.slug),
    ).toEqual(["acme-thing"]);
  });

  it("drops a launch whose listing has since been UNPUBLISHED", async () => {
    // The launch happened and the row stays. But a digest is a page of links,
    // and a link to a 404 is worse than a shorter week.
    await seedPublished();
    await launchedAt(L1, PROFILE, "2026-08-14T09:00:00.000Z");
    expect(await repo.listLaunchesInWindow(START, END)).toHaveLength(1);
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await repo.listLaunchesInWindow(START, END)).toEqual([]);
  });

  it("counts endorsements over THE WEEK, not a trailing window", async () => {
    // THE CORRECTNESS CLAIM OF THIS MILESTONE. `endorsements.7d` answers "the
    // last seven days as of the last sweep"; for an archived week that is the
    // wrong seven days entirely.
    await seedPublished();
    await endorse(PROFILE, ADA, "2026-08-12T09:00:00.000Z");
    await endorse(PROFILE, BOB, "2026-08-30T09:00:00.000Z");

    const week = await repo.listMostEndorsedInWindow(START, END);
    expect(week).toEqual([
      { slug: "acme-thing", tagline: "A thing, built in the open", endorsements: 1 },
    ]);
  });

  it("applies the SAME integrity discount the product page does", async () => {
    // The digest and the listing must not disagree about whether an
    // endorsement counted.
    await seedPublished();
    await endorse(PROFILE, ADA, "2026-08-12T09:00:00.000Z");
    await endorse(PROFILE, BOB, "2026-08-12T10:00:00.000Z");
    expect((await repo.listMostEndorsedInWindow(START, END))[0]!.endorsements).toBe(2);

    await repo.restateIntegrity({
      findings: [{ profileId: PROFILE, subjectId: BOB, reason: "ring" }],
      windowStart: "2026-08-01T00:00:00.000Z",
      reasons: EN3_REASONS,
      decidedBy: "sweep",
      at: "2026-08-31T00:00:00.000Z",
    });
    expect((await repo.listMostEndorsedInWindow(START, END))[0]!.endorsements).toBe(1);
  });

  it("omits a listing nobody endorsed — absence, not zero", async () => {
    // A listing with no endorsements that week does not appear. Absence here
    // means nobody endorsed it in those seven days, not that it was judged.
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await endorse(PROFILE, ADA, "2026-08-12T09:00:00.000Z");
    const week = await repo.listMostEndorsedInWindow(START, END);
    expect(week.map((e) => e.slug)).toEqual(["acme-thing"]);
  });

  it("does not count a WITHDRAWN endorsement", async () => {
    await seedPublished();
    await endorse(PROFILE, ADA, "2026-08-12T09:00:00.000Z");
    await repo.withdrawEndorsement(PROFILE, ADA, "2026-08-25T00:00:00.000Z");
    expect(await repo.listMostEndorsedInWindow(START, END)).toEqual([]);
  });

  it("resolves a note's author to a handle only when the profile RESOLVES", async () => {
    // The same gates every other name on a public surface goes through (CG4's
    // shared join): present if and only if `/@handle` resolves.
    await sql.execute(
      `INSERT INTO openproduct.digest_notes (week_id, body, author_subject_id, written_at)
       VALUES ('2026-w33', 'A quiet week.', $1, '2026-08-17T09:00:00.000Z')`,
      [ADA],
    );
    expect((await repo.getDigestNote("2026-w33"))!.byHandle).toBeNull();

    await repo.upsertContributor({ subjectId: ADA, displayName: "Ada" });
    await repo.claimHandle("ada", ADA, NOW);
    await repo.setProfileVisibility(ADA, true, NOW);
    await seedPublished();
    await repo.addListingMaintainer(PROFILE, ADA, "maintainer", ACTOR);
    const note = (await repo.getDigestNote("2026-w33"))!;
    expect(note.byHandle).toBe("ada");
    expect(note.body).toBe("A quiet week.");
  });

  it("refuses a note whose week id is not the canonical spelling", async () => {
    // The same normalisation the route enforces, held one layer lower — the
    // table cannot hold `2026-w4` and `2026-w04` as two weeks.
    for (const bad of ["2026-w4", "2026-W04", "2026-w00", "2026-w54", "week-33"]) {
      await expect(
        sql.execute(
          `INSERT INTO openproduct.digest_notes (week_id, body, author_subject_id)
           VALUES ($1, 'x', $2)`,
          [bad, ADA],
        ),
      ).rejects.toThrow();
    }
  });

  it("refuses a note with no author", async () => {
    // An unsigned weekly note reads as the platform's opinion, which is
    // precisely the authority OPC-6 says the estate does not hold.
    await expect(
      sql.execute(
        `INSERT INTO openproduct.digest_notes (week_id, body, author_subject_id)
         VALUES ('2026-w33', 'x', NULL)`,
        [],
      ),
    ).rejects.toThrow();
  });

  it("lists the weeks that held something, newest first", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await launchedAt(L1, PROFILE, "2026-08-12T09:00:00.000Z");
    await launchedAt(L2, PROFILE_TWO, "2026-07-08T09:00:00.000Z");
    await sql.execute(
      `INSERT INTO openproduct.digest_notes (week_id, body, author_subject_id)
       VALUES ('2026-w20', 'A note in a week nothing launched.', $1)`,
      [ADA],
    );
    // A week with only a NOTE still counts: somebody wrote something, and an
    // index that hid it would hide the one authored thing on the surface.
    expect(await repo.listDigestWeeks()).toEqual(["2026-w33", "2026-w28", "2026-w20"]);
  });
});

describe("openproduct — the directory's strip counts (openproduct-commons LC2)", () => {
  const AT = "2026-09-01T12:00:00.000Z";

  /** Publish a listing and move its `published_at` to the moment meant. */
  async function publishedAt(id: string, projectId: string, slug: string, at: string) {
    await seedPublished(id as never, projectId as never, slug);
    await sql.execute(`UPDATE openproduct.profiles SET published_at = $2 WHERE id = $1`, [id, at]);
  }

  it("counts each window from the SAME instant, in one read", async () => {
    // Separately counted windows can disagree across a concurrent publish,
    // and the strip's whole claim is that the number and the window belong
    // together.
    await publishedAt(PROFILE, PROJECT, "acme-thing", "2026-09-01T09:00:00.000Z");
    await publishedAt(PROFILE_TWO, PROJECT_TWO, "beta-thing", "2026-08-28T09:00:00.000Z");

    expect(await repo.countPublishedWindows(AT)).toEqual({
      today: 1,
      week: 2,
      month: 2,
      total: 2,
    });
  });

  it("uses TRAILING windows, not calendar days", async () => {
    // A calendar day makes the strip depend on a timezone the reader cannot
    // see, and a page saying "today" differently to two people at the same
    // moment is worse than one that means a rolling window and says so.
    // 23 hours ago is "today"; 25 hours ago is not.
    await publishedAt(PROFILE, PROJECT, "acme-thing", "2026-08-31T13:00:00.000Z");
    expect((await repo.countPublishedWindows(AT)).today).toBe(1);

    await sql.execute(`UPDATE openproduct.profiles SET published_at = $1 WHERE id = $2`, [
      "2026-08-31T11:00:00.000Z",
      PROFILE,
    ]);
    const counts = await repo.countPublishedWindows(AT);
    expect(counts.today).toBe(0);
    expect(counts.week).toBe(1);
  });

  it("counts only PUBLIC listings, in every window and in the total", async () => {
    // A draft is not in the directory, so it is not in a number describing
    // the directory — including the total the fallback strip names.
    await publishedAt(PROFILE, PROJECT, "acme-thing", "2026-09-01T09:00:00.000Z");
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    expect(await repo.countPublishedWindows(AT)).toEqual({
      today: 1,
      week: 1,
      month: 1,
      total: 1,
    });

    // ...and unpublishing removes it from all four at once.
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await repo.countPublishedWindows(AT)).toEqual({
      today: 0,
      week: 0,
      month: 0,
      total: 0,
    });
  });

  it("answers zeroes on an empty catalog rather than failing", async () => {
    // The cold-start case, which is the one this whole mechanism is for.
    expect(await repo.countPublishedWindows(AT)).toEqual({
      today: 0,
      week: 0,
      month: 0,
      total: 0,
    });
  });
});

describe("openproduct — consequence, and what is left behind (openproduct-commons TS3)", () => {
  const ACT = asUuid("aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa");
  const ACT_TWO = asUuid("bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb");
  const ACT_THREE = asUuid("cccccccc-3333-4333-8333-cccccccccccc");
  const LATER = "2026-08-17T13:00:00.000Z";

  /**
   * The two writes core makes, in core's order: LEDGER FIRST, then state.
   *
   * Written out here rather than hidden behind a repository method, because
   * the ordering IS the guarantee and a test that could not get it wrong
   * would not be testing it. The executor is non-transactional, so an
   * append that succeeds followed by a state write that does not leaves a
   * recorded-but-uncarried-out act; the reverse would leave a removal with
   * no appealable record, which TS-4 forbids.
   */
  async function act(
    id: string,
    slug: string,
    name: "delist" | "remove" | "relist" | "restore",
    from: readonly ("visible" | "delisted" | "removed")[],
    at = NOW,
  ) {
    await repo.appendModerationAct({
      id: asUuid(id),
      subjectKind: "listing",
      subjectRef: slug,
      act: name,
      actorId: ADMIN,
      reason: "a reason, because an act without one cannot be appealed",
      reportId: null,
      occurredAt: at,
    });
    return repo.setListingModerationState({
      slug,
      state: name === "delist" ? "delisted" : name === "remove" ? "removed" : "visible",
      at,
      actId: name === "delist" || name === "remove" ? asUuid(id) : null,
      legalFrom: from,
    });
  }

  it("a published listing starts visible, having been acted on by nobody", async () => {
    await seedPublished();
    const profile = await repo.getPublicProfile("acme-thing");
    expect(profile?.moderationState).toBe("visible");
    expect(profile?.moderatedAt).toBeNull();
    expect(profile?.moderationActId).toBeNull();
  });

  // THE CLAIM TS-3 IS ABOUT. A removed listing must still be readable by
  // slug, or the page cannot render a tombstone and removal becomes
  // indistinguishable from a broken link.
  it("a removed listing STILL resolves by slug — it is a tombstone, not a 404", async () => {
    await seedPublished();
    await act(ACT, "acme-thing", "remove", ["visible", "delisted"]);

    const profile = await repo.getPublicProfile("acme-thing");
    expect(profile).not.toBeNull();
    expect(profile?.moderationState).toBe("removed");
    expect(profile?.moderatedAt).toBe(NOW);
    // The tombstone traces back to an appealable act (TS-4).
    expect(profile?.moderationActId).toBe(ACT);
  });

  it("but it leaves the directory, and everything else that amplifies", async () => {
    await seedPublished();
    expect(await repo.listPublicCards()).toHaveLength(1);

    await act(ACT, "acme-thing", "remove", ["visible", "delisted"]);
    expect(await repo.listPublicCards()).toEqual([]);
    // LC2's strip counts what is LISTED, so a removed listing stops being
    // counted the moment it is removed — the number and the directory beneath
    // it cannot disagree.
    expect((await repo.countPublishedWindows(NOW)).total).toBe(0);
  });

  // Delisting is not a weaker removal, it is a different claim.
  it("a DELISTED listing leaves the directory but keeps its whole page", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({
      id: OPENING,
      profileId: PROFILE,
      title: "Someone who likes tests",
      description: null,
      commitment: null,
      status: "open",
      sortOrder: 0,
    });
    await act(ACT, "acme-thing", "delist", ["visible"]);

    expect(await repo.listPublicCards()).toEqual([]);
    const profile = await repo.getPublicProfile("acme-thing");
    expect(profile?.moderationState).toBe("delisted");
    // Everything the page renders is still there — the sub-reads are scoped
    // to a listing already resolved by slug and do not re-apply the filter,
    // which is what "renders in full" means in SQL.
    expect(profile?.tagline).toBe("A thing, built in the open");
    expect(await repo.listPublicRoleOpenings(PROFILE)).toHaveLength(1);
  });

  // The transition table, enforced where it cannot be argued with.
  it("refuses an act that is not legal from where the listing is now", async () => {
    await seedPublished();
    await act(ACT, "acme-thing", "delist", ["visible"]);

    // `restore` undoes a removal, never a delisting. A relist is the undo
    // here, and recording the wrong one would answer an appeal wrongly for
    // ever, because the ledger is append-only.
    expect(await act(ACT_TWO, "acme-thing", "restore", ["removed"])).toBeNull();
    expect((await repo.getPublicProfile("acme-thing"))?.moderationState).toBe("delisted");

    // A THIRD id, because the refused act above still wrote its ledger row.
    // That is the non-transactional ordering showing through, and it is the
    // harmless direction: the ledger over-reports an attempt nobody carried
    // out, rather than a removal nobody recorded.
    expect(await act(ACT_THREE, "acme-thing", "relist", ["delisted"])).not.toBeNull();
    expect((await repo.getPublicProfile("acme-thing"))?.moderationState).toBe("visible");
  });

  it("a relisted listing carries no date and no act — visible is the absence of one", async () => {
    await seedPublished();
    await act(ACT, "acme-thing", "delist", ["visible"]);
    const back = await act(ACT_TWO, "acme-thing", "relist", ["delisted"]);

    expect(back?.moderationState).toBe("visible");
    expect(back?.moderatedAt).toBeNull();
    expect(back?.moderationActId).toBeNull();
    expect(await repo.listPublicCards()).toHaveLength(1);
  });

  // MODERATION IS NOT VISIBILITY, and this is the test that says so. A
  // maintainer republishing must not undo an act taken against them.
  it("a maintainer cannot unpublish and republish their way out of a removal", async () => {
    await seedPublished();
    await act(ACT, "acme-thing", "remove", ["visible", "delisted"]);

    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);

    const profile = await repo.getPublicProfile("acme-thing");
    expect(profile?.moderationState).toBe("removed");
    expect(await repo.listPublicCards()).toEqual([]);
  });

  it("the ledger keeps every act, including the ones that undid the others", async () => {
    await seedPublished();
    await act(ACT, "acme-thing", "delist", ["visible"]);
    await act(ACT_TWO, "acme-thing", "relist", ["delisted"], LATER);

    // Distinct moments, or the newest-first ORDER BY has nothing to order on
    // and this asserts whatever the planner happened to return.
    const acts = await repo.listModerationActsForSubject("listing", "acme-thing");
    // Append-only: a restore is a NEW row, never an edit of the removal,
    // because an appeal has to ask what was done AND when it was undone.
    expect(acts.map((a) => a.act)).toEqual(["relist", "delist"]);
    expect(acts.every((a) => a.reason.length > 0)).toBe(true);
  });
});
