// The openproduct repository against a live engine — the public reads, the publish gates, tenancy, authoring, the link grant, the audit log, the exit.
//
// What a stranger can read, what a maintainer can publish and through which gates, whose rows a workspace sees, the grant column that carries S4/S5's door, the local audit trail, the visibility_narrowed consequence, and the subject's own exit by the registry (CS2) with their export (CS3).
//
// Cut from `repository-pg.test.ts` at openproduct-verification OV3, verbatim:
// the engine, the ids and the two seeds come from `./harness.js`, which
// restores the ladder's template per test instead of re-applying fifty
// migrations. Nothing a test asserts changed; what it costs did.

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { OPENPRODUCT_SUBJECT_REGISTRY, exportTables, subjectEntryKey, tombstonePredicateSql } from "../subject-registry.js";
import { db, sql, repo, ORG, ORG_OTHER, PROJECT, PROJECT_TWO, PROFILE, PROFILE_TWO, OPENING, ACTOR, ADMIN, NOW, REVIEWED_PUBLISH, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

describe("openproduct repository — the public reads cannot see private rows", () => {
  it("a draft is invisible to every public read, by slug and in the directory", async () => {
    await seedDraft();

    expect(await repo.getPublicProfile("acme-thing")).toBeNull();
    expect(await repo.listPublicCards()).toEqual([]);
    // And its children are invisible too, even addressed by profile id
    // directly — the public child reads re-assert the parent's visibility
    // rather than trusting the caller to have come through a public read.
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.setMaintainers(PROFILE, [{ subjectId: "usr_a" }]);
    expect(await repo.listPublicRoleOpenings(PROFILE)).toEqual([]);
    expect(await repo.listPublicMaintainers(PROFILE)).toEqual([]);
  });

  it("a published profile is readable with no org id and no actor", async () => {
    await seedPublished();

    const profile = await repo.getPublicProfile("acme-thing");
    expect(profile).not.toBeNull();
    expect(profile!.slug).toBe("acme-thing");
    expect(profile!.stack).toEqual(["typescript", "cloudflare"]);
    expect(profile!.repoLicence).toBe("Apache-2.0");

    const cards = await repo.listPublicCards();
    expect(cards.map((c) => c.slug)).toEqual(["acme-thing"]);
  });

  it("resolves the slug case-insensitively — one project, one URL", async () => {
    await seedPublished();
    expect(await repo.getPublicProfile("ACME-Thing")).not.toBeNull();
  });

  it("unpublishing removes it from the public plane immediately", async () => {
    await seedPublished();
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);

    expect(await repo.getPublicProfile("acme-thing")).toBeNull();
    expect(await repo.listPublicCards()).toEqual([]);
    // published_at survives: the question it answers is historical.
    const mine = await repo.getProfileForOrg(ORG, PROFILE);
    expect(mine!.publishedAt).not.toBeNull();
    expect(mine!.visibility).toBe("private");
  });
});

describe("openproduct repository — the publish gates", () => {
  it("refuses to publish an unreviewed profile, even with a public repo", async () => {
    await seedDraft();
    await repo.recordRepoObservation(PROFILE, {
      repoVisibility: "public",
      repoLicence: null,
      observedAt: NOW,
    });

    expect(await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH)).toBeNull();
    expect(await repo.getPublicProfile("acme-thing")).toBeNull();
  });

  it("refuses to publish a reviewed profile whose repo is private", async () => {
    await seedDraft();
    await repo.reviewProfile(PROFILE, ADMIN, NOW);
    await repo.recordRepoObservation(PROFILE, {
      repoVisibility: "private",
      repoLicence: null,
      observedAt: NOW,
    });

    expect(await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH)).toBeNull();
  });

  it("clearing the repository link resets its private reading, and the listing publishes", async () => {
    await seedDraft();
    await repo.reviewProfile(PROFILE, ADMIN, NOW);
    await repo.updateProfile(ORG, PROFILE, { repoUrl: "https://github.com/acme/thing", updatedBy: ACTOR });
    await repo.recordRepoObservation(PROFILE, { repoVisibility: "private", repoLicence: null, observedAt: NOW });
    expect(await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH)).toBeNull();

    // The observation belongs to the URL it observed: clearing the link
    // clears the reading, and a listing without a repository publishes.
    const cleared = await repo.updateProfile(ORG, PROFILE, { repoUrl: null, updatedBy: ACTOR });
    expect(cleared!.repoUrl).toBeNull();
    expect(cleared!.repoVisibility).toBeNull();
    expect(cleared!.repoCheckedAt).toBeNull();
    expect(await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH)).not.toBeNull();
  });

  it("changing the repository link resets the reading too — the old repo's visibility says nothing about the new one", async () => {
    await seedDraft();
    await repo.updateProfile(ORG, PROFILE, { repoUrl: "https://github.com/acme/thing", updatedBy: ACTOR });
    await repo.recordRepoObservation(PROFILE, { repoVisibility: "public", repoLicence: "MIT", observedAt: NOW });
    const moved = await repo.updateProfile(ORG, PROFILE, { repoUrl: "https://github.com/acme/other", updatedBy: ACTOR });
    expect(moved!.repoVisibility).toBeNull();
    expect(moved!.repoLicence).toBeNull();
    // Saving the SAME link keeps the reading.
    await repo.recordRepoObservation(PROFILE, { repoVisibility: "public", repoLicence: "MIT", observedAt: NOW });
    const same = await repo.updateProfile(ORG, PROFILE, { repoUrl: "https://github.com/acme/other", updatedBy: ACTOR });
    expect(same!.repoVisibility).toBe("public");
    expect(same!.repoLicence).toBe("MIT");
  });

  it("publishes a reviewed profile with no repository at all — a listing without a repo is a listing", async () => {
    await seedDraft();
    await repo.reviewProfile(PROFILE, ADMIN, NOW);

    const published = await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    expect(published).not.toBeNull();
    expect(published!.visibility).toBe("public");
    expect(published!.repoVisibility).toBeNull();
    expect(await repo.getPublicProfile("acme-thing")).not.toBeNull();
  });

  it("keeps the first reviewer and stamp when reviewed twice", async () => {
    await seedDraft();
    await repo.reviewProfile(PROFILE, ADMIN, NOW);
    const second = await repo.reviewProfile(PROFILE, "usr_someone_else", "2026-09-01T00:00:00.000Z");

    expect(second!.reviewedBy).toBe(ADMIN);
    expect(second!.reviewedAt).toBe(new Date(NOW).toISOString());
  });

  // The CHECK is the backstop for the WHERE clause above: even a direct write
  // that skipped publishProfile cannot leave a public row AMPLIFIED without a
  // review. TS1 narrowed the rule from "public implies reviewed" (right for a
  // catalog of fifteen, an outage at 1,284) to the one that is actually true:
  // a published listing must have been read by a person OR must not be
  // amplified. The dangerous state is still refused by the schema.
  it("the schema itself refuses a public, INDEXED row with no review", async () => {
    await seedDraft();
    await expect(
      db.query(`UPDATE openproduct.profiles SET visibility = 'public' WHERE id = $1`, [PROFILE]),
    ).rejects.toThrow(/profiles_indexable_requires_review/);
  });

  it("...and permits a public, UNINDEXED row with no review — that is TS1's ladder", async () => {
    await seedDraft();
    // The state a new maker's first listing is in: live, readable by anyone
    // sent the link, and simply not amplified.
    await db.query(
      `UPDATE openproduct.profiles SET visibility = 'public', indexable = FALSE WHERE id = $1`,
      [PROFILE],
    );
    expect((await repo.getPublicProfile("acme-thing"))?.indexable).toBe(false);
  });
});

describe("openproduct repository — tenancy and orphans", () => {
  it("another org cannot read or write this org's profile", async () => {
    await seedDraft();

    expect(await repo.getProfileForOrg(ORG_OTHER, PROFILE)).toBeNull();
    expect(await repo.updateProfile(ORG_OTHER, PROFILE, { slug: "stolen", updatedBy: "usr_x" })).toBeNull();
    expect(await repo.unpublishProfile(ORG_OTHER, PROFILE, "usr_x")).toBeNull();
    expect(await repo.deleteProfile(ORG_OTHER, PROFILE)).toBe(false);
  });

  it("one slug is global: a second project cannot take a taken name", async () => {
    await seedDraft();
    await expect(seedDraft(PROFILE_TWO, PROJECT_TWO, "ACME-THING")).rejects.toThrow();
  });

  it("one profile per project", async () => {
    await seedDraft();
    await expect(seedDraft(PROFILE_TWO, PROJECT, "other-slug")).rejects.toThrow();
  });

  it("a deleted project unpublishes its listing but keeps the record (OD-G)", async () => {
    await seedPublished();

    expect(await repo.unpublishByProject(PROJECT)).toBe(1);
    expect(await repo.getPublicProfile("acme-thing")).toBeNull();
    expect(await repo.getProfileForOrg(ORG, PROFILE)).not.toBeNull();
  });

  it("deleting a profile takes its openings and maintainers with it", async () => {
    await seedDraft();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.setMaintainers(PROFILE, [{ subjectId: "usr_a" }]);

    expect(await repo.deleteProfile(ORG, PROFILE)).toBe(true);
    const openings = await db.query(`SELECT 1 FROM openproduct.role_openings`);
    const maintainers = await db.query(`SELECT 1 FROM openproduct.published_maintainers`);
    expect(openings.rows).toEqual([]);
    expect(maintainers.rows).toEqual([]);
  });
});

describe("openproduct repository — the studio's maintainer handles (openproduct-studio OSD7)", () => {
  it("maps each listed person to their ACTIVE handle, on a draft too, and omits the rest", async () => {
    // The People step pre-fills `@handle | label` from this, and a draft is
    // exactly where a maker edits the list — so, unlike the public roster,
    // it does not require a published listing or a confirmed edge.
    await seedDraft();
    await repo.setMaintainers(PROFILE, [{ subjectId: "usr_ada" }, { subjectId: "usr_bob" }, { subjectId: "usr_cy" }]);
    await repo.claimHandle("ada", "usr_ada", NOW);
    await repo.claimHandle("bob", "usr_bob", NOW);
    // A released handle has no holder — the same rule `getSubjectsForHandles`
    // resolves by, so a pre-filled line always saves back to the same person.
    await repo.releaseHandle("usr_bob", NOW);

    const handles = await repo.listMaintainerHandles(PROFILE);
    expect([...handles.entries()]).toEqual([["usr_ada", "ada"]]);
    expect(await repo.listMaintainerHandles(PROFILE_TWO)).toEqual(new Map());
  });
});

describe("openproduct repository — authoring", () => {
  it("updates only what is named, and clears what is explicitly cleared", async () => {
    await seedDraft();

    const renamed = await repo.updateProfile(ORG, PROFILE, { slug: "acme-two", updatedBy: ACTOR });
    expect(renamed!.slug).toBe("acme-two");
    expect(renamed!.tagline).toBe("A thing, built in the open");

    const cleared = await repo.updateProfile(ORG, PROFILE, { tagline: null, updatedBy: ACTOR });
    expect(cleared!.tagline).toBeNull();
    expect(cleared!.slug).toBe("acme-two");
  });

  it("counts only OPEN role openings on a directory card", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Open one" });
    await repo.upsertRoleOpening({
      id: asUuid("88888888-8888-4888-8888-888888888888"),
      profileId: PROFILE,
      title: "Filled one",
      status: "filled",
    });

    const [card] = await repo.listPublicCards();
    expect(card!.roleOpeningCount).toBe(1);
  });

  it("replaces the maintainer set rather than accumulating it", async () => {
    await seedDraft();
    await repo.setMaintainers(PROFILE, [
      { subjectId: "usr_a", roleLabel: "maintainer" },
      { subjectId: "usr_b", roleLabel: "design lead" },
    ]);
    const after = await repo.setMaintainers(PROFILE, [{ subjectId: "usr_a", roleLabel: "maintainer" }]);

    expect(after.map((m) => m.subjectId)).toEqual(["usr_a"]);
  });

  it("carries the join link ref on a role opening once OD4 mints one", async () => {
    await seedDraft();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });

    const linked = await repo.setRoleOpeningJoinLink(OPENING, "jl_abc123");
    expect(linked!.joinLinkRef).toBe("jl_abc123");
  });
});

// ─── openproduct-independence (OX5): the stored link grant ───
describe("the link grant column — the stored half of S4/S5", () => {
  const GRANT = {
    doorRef: "tok_listed_door_secret",
    grantedBy: ADMIN,
    grantedAt: NOW,
    workspaceVisibility: "public" as const,
  };

  it("stores the grant at create and reads it back whole", async () => {
    const created = await repo.createProfile({
      id: PROFILE,
      orgId: ORG,
      projectId: PROJECT,
      slug: "acme-thing",
      createdBy: ACTOR,
      tagline: null,
      pitchBody: null,
      pitchDigest: null,
      stack: [],
      linkGrant: GRANT,
    });
    expect(created.linkGrant).toEqual(GRANT);

    const read = await repo.getProfileForOrg(ORG, PROFILE);
    expect(read!.linkGrant).toEqual(GRANT);
  });

  it("a pre-seam listing reads NULL — never a guessed grant", async () => {
    await seedDraft();
    const read = await repo.getProfileForOrg(ORG, PROFILE);
    expect(read!.linkGrant).toBeNull();
  });

  it("setProfileLinkGrant attaches (and refreshes) the grant on an existing row", async () => {
    await seedDraft();
    const linked = await repo.setProfileLinkGrant(PROFILE, GRANT);
    expect(linked!.linkGrant).toEqual(GRANT);

    const refreshed = await repo.setProfileLinkGrant(PROFILE, { ...GRANT, doorRef: "tok_two" });
    expect(refreshed!.linkGrant!.doorRef).toBe("tok_two");
  });

  it("listProfilesMaintainedBy answers across ORGS from listing_maintainers alone", async () => {
    // Two listings in two workspaces, both maintained by ACTOR (creators are
    // backfilled as owners); a third subject maintains nothing.
    await seedDraft();
    await repo.createProfile({
      id: PROFILE_TWO,
      orgId: ORG_OTHER,
      projectId: PROJECT_TWO,
      slug: "other-thing",
      createdBy: ACTOR,
      tagline: null,
      pitchBody: null,
      pitchDigest: null,
      stack: [],
      linkGrant: GRANT,
    });

    const mine = await repo.listProfilesMaintainedBy(ACTOR);
    expect(mine.map((p) => p.slug).sort()).toEqual(["acme-thing", "other-thing"]);
    // The link fact rides along — the landing renders the remedy from it.
    expect(mine.find((p) => p.slug === "other-thing")!.linkGrant).toEqual(GRANT);
    expect(mine.find((p) => p.slug === "acme-thing")!.linkGrant).toBeNull();

    expect(await repo.listProfilesMaintainedBy("usr_nobody")).toEqual([]);
  });
});

// ─── openproduct-independence (OX5c): the local plane ───
describe("the LOCAL audit log — the last platform write, re-homed", () => {
  const AUDIT_ID = asUuid("99999999-9999-4999-8999-999999999999");

  it("appends and reads back whole, newest first, profile-scoped", async () => {
    await seedDraft();
    await repo.appendAudit({
      id: AUDIT_ID,
      orgId: ORG,
      profileId: PROFILE,
      actorType: "user",
      actorId: ACTOR,
      type: "openproduct.profile.updated",
      description: "openproduct listing acme-thing updated",
      payload: { slug: "acme-thing" },
      requestId: "req_1",
      occurredAt: NOW,
    });
    await repo.appendAudit({
      id: asUuid("88888888-9999-4999-8999-999999999999"),
      orgId: ORG,
      profileId: PROFILE,
      actorType: "user",
      actorId: ACTOR,
      type: "openproduct.profile.published",
      description: "openproduct listing acme-thing published",
      occurredAt: "2026-08-17T13:00:00.000Z",
    });

    const trail = await repo.listAuditForProfile(PROFILE);
    expect(trail).toHaveLength(2);
    expect(trail[0]!.type).toBe("openproduct.profile.published");
    expect(trail[1]!.payload).toEqual({ slug: "acme-thing" });
    expect(trail[1]!.requestId).toBe("req_1");
  });

  it("survives the profile it describes — FK-free by design", async () => {
    await seedDraft();
    await repo.appendAudit({
      id: AUDIT_ID,
      orgId: ORG,
      profileId: PROFILE,
      actorType: "user",
      actorId: ACTOR,
      type: "openproduct.profile.created",
      description: "created",
      occurredAt: NOW,
    });
    await repo.deleteProfile(ORG, PROFILE);
    expect(await repo.listAuditForProfile(PROFILE)).toHaveLength(1);
  });
});

describe("revokeWorkspaceEligibility — the visibility_narrowed consequence (OX5c)", () => {
  it("clears grants AND takes public pages down for the org, in one statement", async () => {
    await seedPublished();
    await repo.setProfileLinkGrant(PROFILE, {
      doorRef: "tok_door",
      grantedBy: ADMIN,
      grantedAt: NOW,
      workspaceVisibility: "public",
    });
    // A second org's listing is untouched.
    await repo.createProfile({
      id: PROFILE_TWO, orgId: ORG_OTHER, projectId: PROJECT_TWO, slug: "other-thing",
      createdBy: ACTOR, tagline: null, pitchBody: null, pitchDigest: null, stack: [],
      linkGrant: { doorRef: "tok_two", grantedBy: ADMIN, grantedAt: NOW, workspaceVisibility: "public" },
    });

    const revoked = await repo.revokeWorkspaceEligibility(ORG);
    expect(revoked).toEqual([PROFILE]);

    const mine = await repo.getProfileForOrg(ORG, PROFILE);
    expect(mine!.visibility).toBe("private");
    expect(mine!.linkGrant).toBeNull();
    const other = await repo.getProfileForOrg(ORG_OTHER, PROFILE_TWO);
    expect(other!.linkGrant).not.toBeNull();

    // Idempotent: the second delivery matches nothing.
    expect(await repo.revokeWorkspaceEligibility(ORG)).toEqual([]);
  });
});

describe("eraseSubject — the subject's own exit, by the registry (OX5c; CS2)", () => {
  const T = "2026-08-17T13:00:00.000Z";
  const THREAD_X = asUuid("c5c5c5c5-c5c5-4c5c-8c5c-c5c5c5c5c5c5");
  const POST_X = asUuid("c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6");
  const POST_Y = asUuid("c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c7");
  const ACT_X = asUuid("c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7");
  const REPORT_X = asUuid("c8c8c8c8-c8c8-4c8c-8c8c-c8c8c8c8c8c8");
  const APPEAL_X = asUuid("c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9");
  const FLAG_X = asUuid("cacacaca-caca-4aca-8aca-cacacacacaca");
  const LAUNCH_X = asUuid("cbcbcbcb-cbcb-4bcb-8bcb-cbcbcbcbcbcb");
  const COLLECTION_X = asUuid("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  const NOTIF_X = asUuid("cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd");
  const OUTBOX_X = asUuid("cececece-cece-4ece-8ece-cececececece");
  const ACTIVITY_X = asUuid("cfcfcfcf-cfcf-4fcf-8fcf-cfcfcfcfcfcf");
  const AUDIT_X = asUuid("d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0");
  const APPLICATION_X = asUuid("d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1");

  /**
   * A subject (ACTOR) who has done everything the product allows, and has
   * been done to: every column the registry classifies carries them at least
   * once. `seedPublished` already makes ACTOR the listing's creator.
   */
  async function seedEverything() {
    await seedPublished();
    await sql.execute(`UPDATE openproduct.profiles SET updated_by = $1, reviewed_by = $1 WHERE id = $2`, [ACTOR, PROFILE]);
    await repo.upsertContributor({ subjectId: ACTOR, displayName: "Ada", bio: "Leaving." });
    await repo.claimHandle("ada-leaves", ACTOR, NOW);
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.recordApplication({ id: APPLICATION_X, subjectId: ACTOR, profileId: PROFILE, roleOpeningId: OPENING, jrRequestRef: "jrq_x" });
    await repo.saveProductBySlug(ACTOR, "acme-thing");
    await repo.follow(ACTOR, "listing", "acme-thing");
    await repo.endorse(PROFILE, ACTOR, "confirmed", NOW);
    await repo.discountCohort({ profileId: PROFILE, subjectIds: [ACTOR], reason: "ring", decidedBy: ACTOR, at: NOW });
    await sql.execute(`UPDATE openproduct.endorsement_integrity SET reversed_by = $1, reversed_at = now() WHERE subject_id = $1`, [ACTOR]);
    await repo.createThread({ id: THREAD_X, profileId: PROFILE, tag: "question", title: "Before I go", authorSubjectId: ACTOR, at: NOW });
    await repo.createPost({ id: POST_X, threadId: THREAD_X, authorSubjectId: ACTOR, body: "Thanks, all.", at: NOW });
    // A vote on somebody else's post: an author cannot upvote their own (DQ1).
    await repo.createPost({ id: POST_Y, threadId: THREAD_X, authorSubjectId: ADMIN, body: "Take care.", at: NOW });
    expect(await repo.votePost(POST_Y, ACTOR, NOW)).toBe(true);
    await repo.setThreadMute(ACTOR, THREAD_X, true);
    await repo.setNotificationPref(ACTOR, true);
    await repo.markNotificationsRead(ACTOR, NOW);
    await repo.writeNotification({ id: NOTIF_X, subjectId: ACTOR, kind: "post.reply", eventKey: "ev-x", actor: "someone", targetKind: "post", targetRef: POST_X });
    await repo.queueNotification({ id: OUTBOX_X, subjectId: ACTOR, kind: "reply", threadId: THREAD_X, eventRef: "ev-x" });
    await repo.setDigestSubscription(ACTOR, true, NOW);
    await repo.issueAuthSession({ tokenHash: "h".repeat(64), subjectId: ACTOR, at: NOW, expiresAt: "2026-09-17T12:00:00.000Z" });
    await repo.writeCredential({ subjectId: ACTOR, verifier: "v".repeat(64), at: NOW });
    await repo.issueCredentialToken({ tokenHash: "t".repeat(64), purpose: "reset", subjectId: ACTOR, at: NOW, expiresAt: "2026-08-18T12:00:00.000Z" });
    await repo.setTrustLevel(ACTOR, "established", ADMIN, null);
    await repo.setTrustLevel(ADMIN, "trusted", ACTOR, "set by the leaver");
    await repo.addListingMaintainer(PROFILE, ACTOR, "maintainer", ADMIN);
    await repo.addListingMaintainer(PROFILE, ADMIN, "maintainer", ACTOR);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ACTOR, roleLabel: "Maintainer", invitedBy: ADMIN, at: NOW });
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADMIN, roleLabel: "Maintainer", invitedBy: ACTOR, at: NOW });
    await repo.retireRosterEdge(PROFILE, ADMIN, ACTOR, NOW);
    await repo.setMaintainers(PROFILE, [{ subjectId: ACTOR, displayName: "Ada" }]);
    await repo.createCollection({ id: COLLECTION_X, slug: "ada-picks", title: "Ada's picks", blurb: null, curatorSubjectId: ACTOR, at: NOW });
    await repo.appendActivity({ id: ACTIVITY_X, profileId: PROFILE, kind: "thread", summary: "Opened a thread", actorSubjectId: ACTOR, source: "seam", occurredAt: NOW });
    await repo.appendAudit({ id: AUDIT_X, orgId: ORG, profileId: PROFILE, actorType: "user", actorId: ACTOR, type: "profile.updated", description: "edited", occurredAt: NOW });
    await repo.appendModerationAct({ id: ACT_X, subjectKind: "listing", subjectRef: "acme-thing", act: "deindex", actorId: ACTOR, reason: "recorded for the transparency report", occurredAt: NOW });
    await repo.createReport({ id: REPORT_X, subjectKind: "listing", subjectRef: "acme-thing", reporterSubjectId: ACTOR, reason: "other" });
    await repo.resolveReport(REPORT_X, "declined", ACTOR, NOW);
    await repo.createAppeal({ id: APPEAL_X, actId: ACT_X, subjectKind: "subject", subjectRef: ACTOR, appellantSubjectId: ACTOR, says: "It was fine.", filedAt: NOW });
    await sql.execute(`UPDATE openproduct.appeals SET decided_by = $1, decided_at = now(), state = 'refused', outcome_act_id = $3 WHERE id = $2`, [ACTOR, APPEAL_X, ACT_X]);
    await repo.raiseFlag({ id: FLAG_X, kind: "ring", subjectKind: "listing", subjectRef: "acme-thing", evidence: "three accounts, one minute", consequence: "queue-only", at: NOW });
    await repo.resolveFlag(FLAG_X, "dismissed", ACTOR, NOW);
    await repo.scheduleLaunch({ id: LAUNCH_X, profileId: PROFILE, versionLabel: "2.0", scheduledFor: "2026-09-01T09:00:00.000Z", scheduledBy: ACTOR });
    await repo.cancelLaunch(LAUNCH_X, ACTOR, NOW);
    await sql.execute(`INSERT INTO openproduct.digest_notes (week_id, body, author_subject_id) VALUES ('2026-w33', 'A quiet week.', $1)`, [ACTOR]);
  }

  async function transparency() {
    return {
      acts: await repo.countModerationActsSince("2026-01-01T00:00:00.000Z"),
      reports: await repo.countReportsSince("2026-01-01T00:00:00.000Z"),
      appeals: await repo.countAppealsSince("2026-01-01T00:00:00.000Z"),
      integrity: await repo.integrityDisclosure("2026-01-01T00:00:00.000Z"),
    };
  }

  it("the fixture touches every classified column — a subject who has done everything, and been done to", async () => {
    await seedEverything();
    const before = await repo.subjectFootprint(ACTOR);
    const missing = OPENPRODUCT_SUBJECT_REGISTRY.map(subjectEntryKey).filter((k) => !before.has(k));
    expect(missing).toEqual([]);
  });

  it("after the exit no classified column carries the subject; theirs is gone, the rest is tombstoned; the records count the same", async () => {
    await seedEverything();
    const before = await repo.subjectFootprint(ACTOR);
    const recordBefore = await transparency();
    const total = [...before.values()].reduce((a, b) => a + b, 0);

    // What each statement should find: the footprint, less the rows a
    // `theirs` column on the same table deletes first (a maintainer row the
    // subject added for THEMSELVES carries them twice and goes once).
    const expected: Record<string, number> = {};
    for (const e of OPENPRODUCT_SUBJECT_REGISTRY) {
      const own = OPENPRODUCT_SUBJECT_REGISTRY.find((x) => x.table === e.table && x.class === "theirs");
      const kind = e.when ? ` AND ${e.when.column} = '${e.when.equals}'` : "";
      const survives = e.class !== "theirs" && own ? ` AND ${own.column} <> $1` : "";
      const text = `SELECT count(*) AS n FROM openproduct.${e.table} WHERE ${e.column} = $1${kind}${survives}`;
      let res;
      try {
        res = await sql.execute<{ n: string }>(text, [ACTOR]);
      } catch (error) {
        throw new Error(`${text} :: ${String(error)}`);
      }
      if (Number(res.rows[0]!.n) > 0) expected[subjectEntryKey(e)] = Number(res.rows[0]!.n);
    }

    const erased = await repo.eraseSubject(ACTOR, T);
    // Every row was handled by its own statement — none by a cascade it was
    // not counted through (the integrity record's key moves with the vote's).
    expect(erased.columns).toEqual(expected);
    expect(erased.deleted + erased.anonymised).toBe(Object.values(expected).reduce((a, b) => a + b, 0));
    expect(erased.deleted + erased.anonymised).toBeLessThanOrEqual(total);
    expect(erased.deleted).toBe(
      OPENPRODUCT_SUBJECT_REGISTRY.filter((e) => e.class === "theirs").reduce((n, e) => n + (before.get(subjectEntryKey(e)) ?? 0), 0),
    );

    // Nothing left anywhere, by the same read.
    expect(await repo.subjectFootprint(ACTOR)).toEqual(new Map());

    // Theirs: gone. Not one tombstone in a `theirs` table — a deleted row
    // leaves no pseudonym behind.
    for (const e of OPENPRODUCT_SUBJECT_REGISTRY.filter((x) => x.class === "theirs")) {
      const res = await sql.execute<{ n: string }>(
        `SELECT count(*) AS n FROM openproduct.${e.table} WHERE ${e.column} LIKE 'usr_gone%'`,
      );
      expect(Number(res.rows[0]!.n)).toBe(0);
    }
    expect(await repo.getContributor(ACTOR)).toBeNull();
    expect(await repo.listSavedPublicCards(ACTOR)).toEqual([]);

    // Kept: every anonymise/record row is still there, carrying the tombstone
    // the column's shape calls for — NULL, the fixed value, or the derived one.
    for (const e of OPENPRODUCT_SUBJECT_REGISTRY.filter((x) => x.class !== "theirs")) {
      const wanted = expected[subjectEntryKey(e)] ?? 0;
      const kind = e.when ? ` AND ${e.when.column} = '${e.when.equals}'` : "";
      const predicate = tombstonePredicateSql(e);
      const res = await sql.execute<{ n: string }>(
        `SELECT count(*) AS n FROM openproduct.${e.table} WHERE ${predicate}${kind}`,
        predicate.includes("$1") ? [ACTOR] : [],
      );
      expect(Number(res.rows[0]!.n)).toBeGreaterThanOrEqual(wanted);
    }
    // The handle is RELEASED, not deleted: the row stands, nobody holds it,
    // nobody will be given it.
    const handle = await sql.execute<{ subject_id: string | null; released_at: string | Date | null }>(
      `SELECT subject_id, released_at FROM openproduct.handles WHERE handle = 'ada-leaves'`,
    );
    expect(handle.rows[0]!.subject_id).toMatch(/^usr_gone_[0-9a-f]{32}$/);
    expect(new Date(handle.rows[0]!.released_at!).toISOString()).toBe(T);
    // The conversation stands with its author gone.
    expect((await repo.listThreads(PROFILE)).map((t) => t.title)).toEqual(["Before I go"]);
    // The listing is untouched and still public.
    expect(await repo.getPublicProfile("acme-thing")).not.toBeNull();
    // The transparency record counts exactly what it counted (CS-5, OS-5).
    expect(await transparency()).toEqual(recordBefore);

    // Idempotent: the second exit finds nothing.
    expect(await repo.eraseSubject(ACTOR, T)).toEqual({ deleted: 0, anonymised: 0, columns: {} });
  });

  it("CS3 — the export is the registry's `rows` columns and the listings, with no secret, no other subject, and ids made to mean something", async () => {
    await seedEverything();
    const doc = await repo.exportSubject(ACTOR, T);
    expect(doc.exportedAt).toBe(T);
    expect(doc.subjectId).toBe(ACTOR);
    // One list, two readers: the tables are exactly the registry's export set.
    expect(Object.keys(doc.tables).sort()).toEqual([...exportTables()].sort());
    // Every exported table has the row the fixture put there.
    for (const table of exportTables()) expect(doc.tables[table]!.length).toBeGreaterThan(0);
    const text = JSON.stringify(doc);
    // No secret leaves: not the verifier, not a session or token hash.
    expect(text).not.toContain("v".repeat(64));
    expect(text).not.toContain("h".repeat(64));
    expect(text).not.toContain("t".repeat(64));
    // Nobody else's id leaves: the admin who added, invited and set things.
    expect(text).not.toContain(ADMIN);
    // Their own words and acts are there, with the ids resolved.
    const post = doc.tables.posts!.find((r) => r.id === POST_X)!;
    expect(post.body).toBe("Thanks, all.");
    expect(post.thread).toEqual({ title: "Before I go", slug: "acme-thing" });
    expect(doc.tables.endorsements![0]!.slug).toBe("acme-thing");
    expect(doc.tables.saved_products![0]!.slug).toBe("acme-thing");
    expect(doc.tables.handles![0]!.handle).toBe("ada-leaves");
    // The listings they maintain, as the studio shows them, less the door token.
    expect(doc.listings.map((l) => l.slug)).toEqual(["acme-thing"]);
    expect(doc.listings[0]!.linkGrant).toBeUndefined();
    expect(doc.listings[0]!.createdBy).toBeUndefined();
    // Nothing that is a record, and nobody else's post.
    expect(doc.tables.moderation_acts).toBeUndefined();
    expect(doc.tables.posts!.some((r) => r.id === POST_Y)).toBe(false);
  });

  it("CS3 — an exit right after an export removes exactly the exported `theirs` tables and keeps the rest without them", async () => {
    await seedEverything();
    const doc = await repo.exportSubject(ACTOR, T);
    await repo.eraseSubject(ACTOR, T);
    for (const table of Object.keys(doc.tables)) {
      const entries = OPENPRODUCT_SUBJECT_REGISTRY.filter((e) => e.table === table && e.export === "rows");
      for (const e of entries) {
        const left = await sql.execute<{ n: string }>(`SELECT count(*) AS n FROM openproduct.${e.table} WHERE ${e.column} = $1`, [ACTOR]);
        expect(Number(left.rows[0]!.n)).toBe(0);
        const predicate = tombstonePredicateSql(e);
        const kept = await sql.execute<{ n: string }>(`SELECT count(*) AS n FROM openproduct.${e.table} WHERE ${predicate}`, predicate.includes("$1") ? [ACTOR] : []);
        // Theirs: gone without a trace. Their words and acts: still there, without them.
        expect(Number(kept.rows[0]!.n)).toBe(e.class === "theirs" ? 0 : doc.tables[table]!.length);
      }
    }
    // And a second export finds nothing of theirs.
    const after = await repo.exportSubject(ACTOR, T);
    expect(Object.values(after.tables).every((rows) => rows.length === 0)).toBe(true);
    expect(after.listings).toEqual([]);
  });

  it("touches nobody else's own rows: a second subject's `theirs` rows are exactly as they were", async () => {
    await seedEverything();
    const theirs = new Set(OPENPRODUCT_SUBJECT_REGISTRY.filter((e) => e.class === "theirs").map(subjectEntryKey));
    const own = (m: Map<string, number>) => new Map([...m].filter(([k]) => theirs.has(k)));
    const other = await repo.subjectFootprint(ADMIN);
    expect(own(other).size).toBeGreaterThan(0);
    await repo.eraseSubject(ACTOR, T);
    // ADMIN's own rows stand. Where ADMIN appears as context on a row that
    // was ACTOR's (the level ADMIN set for ACTOR, the invitation ADMIN sent
    // ACTOR) the row went with ACTOR — those are ACTOR's rows, not ADMIN's.
    expect(own(await repo.subjectFootprint(ADMIN))).toEqual(own(other));
  });
});

// ─── openproduct-commons SN1 — ingestion, against a live engine ───
