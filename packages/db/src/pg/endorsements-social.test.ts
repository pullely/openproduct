// The openproduct repository against a live engine — the endorsement, the consented maintainer list, follows, the comment upvote, one discussion per listing, a maker's tabs, open roles.
//
// EN0–EN3 against the engine, CG3's reconciliation of the public maintainer list with consent, FL0's follows, DQ1's upvote on a comment, DQ0b's one discussion, MP0's three maker tabs and FL1's open roles across listings.
//
// Cut from `repository-pg.test.ts` at openproduct-verification OV3, verbatim:
// the engine, the ids and the two seeds come from `./harness.js`, which
// restores the ladder's template per test instead of re-applying fifty
// migrations. Nothing a test asserts changed; what it costs did.

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { sql, repo, ORG, PROJECT, PROJECT_TWO, PROFILE, PROFILE_TWO, OPENING, ACTOR, ADMIN, NOW, REVIEWED_PUBLISH, EN3_REASONS, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

describe("openproduct — the endorsement (openproduct-commons EN0)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const NOW_TS = "2026-08-17T12:00:00.000Z";

  it("EN-1 — `saved_products` is UNTOUCHED: not widened, not counted, not migrated", async () => {
    // The pressure to "just add a public flag to saves" returns every time
    // somebody notices the two tables look similar. Every row in
    // `saved_products` was created under a promise that nobody would ever see
    // it, and counting them now would retroactively publish a private gesture
    // made by people who cannot be asked and did not agree.
    const columns = await sql.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'openproduct' AND table_name = 'saved_products'
        ORDER BY column_name`,
    );
    expect(columns.rows.map((r) => r.column_name)).toEqual(["created_at", "profile_id", "subject_id"]);

    // And a save moves NO public number.
    await seedPublished();
    await repo.saveProduct(ADA, PROFILE);
    expect(await repo.countEndorsements(PROFILE, NOW_TS)).toEqual({ total: 0, recent: 0, discounted: 0 });
  });

  it("endorsing twice is a no-op; withdrawing and re-endorsing REUSES the row", async () => {
    await seedPublished();
    const first = await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    const again = await repo.endorse(PROFILE, ADA, "confirmed", "2026-08-18T12:00:00.000Z");
    expect(await repo.countEndorsements(PROFILE, NOW_TS)).toEqual({ total: 1, recent: 1, discounted: 0 });
    // `created_at` is NOT rewritten: the trailing-week figure is about when
    // somebody first said this, and re-stamping would let a withdraw and
    // re-endorse cycle manufacture recency.
    expect(again.createdAt).toBe(first.createdAt);

    await repo.withdrawEndorsement(PROFILE, ADA, "2026-08-19T12:00:00.000Z");
    expect(await repo.countEndorsements(PROFILE, NOW_TS)).toEqual({ total: 0, recent: 0, discounted: 0 });

    const back = await repo.endorse(PROFILE, ADA, "confirmed", "2026-08-20T12:00:00.000Z");
    expect(back.withdrawnAt).toBeNull();
    expect(back.createdAt).toBe(first.createdAt);
    expect(await repo.countEndorsements(PROFILE, NOW_TS)).toEqual({ total: 1, recent: 1, discounted: 0 });
  });

  it("withdrawing NEVER deletes — EN3 must be able to restate what it restated", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    await repo.withdrawEndorsement(PROFILE, ADA, "2026-08-19T12:00:00.000Z");
    const row = await repo.getEndorsement(PROFILE, ADA);
    expect(row).not.toBeNull();
    expect(row!.withdrawnAt).not.toBeNull();

    // Withdrawing what is already withdrawn is a no-op, not an error.
    expect(await repo.withdrawEndorsement(PROFILE, ADA, "2026-08-20T12:00:00.000Z")).toBeNull();
  });

  it("a PENDING endorsement is recorded and does not count", async () => {
    await seedPublished();
    // TS1's floor, expressed without throwing anything away: refusing the
    // click would discard a newcomer's honest gesture and teach them the
    // button is broken.
    await repo.endorse(PROFILE, ADA, "pending", NOW_TS);
    expect((await repo.getEndorsement(PROFILE, ADA))?.state).toBe("pending");
    expect(await repo.countEndorsements(PROFILE, NOW_TS)).toEqual({ total: 0, recent: 0, discounted: 0 });

    // ...and it counts the moment they clear.
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    expect(await repo.countEndorsements(PROFILE, NOW_TS)).toEqual({ total: 1, recent: 1, discounted: 0 });
  });

  it("the integrity discount is applied to the total and says nothing to anyone", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    await repo.endorse(PROFILE, BOB, "confirmed", NOW_TS);
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(2);

    await sql.execute(
      `INSERT INTO openproduct.endorsement_integrity (profile_id, subject_id, reason, decided_by)
       VALUES ($1, $2, 'ring', 'automatic')`,
      [PROFILE, BOB],
    );
    // The machine's opinion moves the public number. It does NOT touch the
    // endorsement row: the act stands, and the person is never told, and
    // never implicitly accused, that theirs was judged fake (EN-4).
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(1);
    expect((await repo.getEndorsement(PROFILE, BOB))?.withdrawnAt).toBeNull();

    // Reversing the opinion restores the count without erasing why it was
    // first applied.
    await sql.execute(
      `UPDATE openproduct.endorsement_integrity SET reversed_at = now(), reversed_by = 'usr_admin'
        WHERE profile_id = $1 AND subject_id = $2`,
      [PROFILE, BOB],
    );
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(2);
  });

  it("`recent` is the trailing week, and an old endorsement is in the total but not in it", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", "2026-07-01T12:00:00.000Z");
    await repo.endorse(PROFILE, BOB, "confirmed", "2026-08-15T12:00:00.000Z");
    expect(await repo.countEndorsements(PROFILE, NOW_TS)).toEqual({ total: 2, recent: 1, discounted: 0 });
  });

  it("the overlay's question is bounded by the page, and never marks a private slug", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    await repo.endorse(PROFILE_TWO, ADA, "confirmed", NOW_TS);

    expect(await repo.endorsedSlugsAmong(ADA, ["acme-thing"])).toEqual(["acme-thing"]);
    expect(await repo.endorsedSlugsAmong(ADA, ["ACME-Thing", "beta-thing"])).toEqual([
      "acme-thing",
      "beta-thing",
    ]);
    expect(await repo.endorsedSlugsAmong(ADA, [])).toEqual([]);

    // Marking a private slug would confirm that a listing by that name exists.
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await repo.endorsedSlugsAmong(ADA, ["acme-thing", "beta-thing"])).toEqual(["beta-thing"]);
  });

  it("an integrity opinion cannot exist without the act it is about", async () => {
    await seedPublished();
    await expect(
      sql.execute(
        `INSERT INTO openproduct.endorsement_integrity (profile_id, subject_id, reason, decided_by)
         VALUES ($1, $2, 'ring', 'automatic')`,
        [PROFILE, ADA],
      ),
    ).rejects.toThrow();

    // ...and a discount nobody can account for is a discount nobody can appeal.
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    await expect(
      sql.execute(
        `INSERT INTO openproduct.endorsement_integrity (profile_id, subject_id, reason, decided_by)
         VALUES ($1, $2, '  ', 'automatic')`,
        [PROFILE, ADA],
      ),
    ).rejects.toThrow(/endorsement_integrity_reason_present/);
  });

  // ─── EN3 — the restatement ───────────────────────────────────────────
  //
  // The property under test throughout: A TOTAL IS RESTATED, NEVER ERASED.
  // Every endorsement survives every one of these, and the discount is an
  // opinion recorded beside it.
  it("reads the window with each subject's first-ever endorsement time", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.endorse(PROFILE, ADA, "confirmed", "2026-08-01T00:00:00.000Z");
    await repo.endorse(PROFILE_TWO, ADA, "confirmed", "2026-08-20T00:00:00.000Z");

    // The window starts AFTER Ada's first endorsement, and she must still be
    // reported as first seen in August rather than as new — an account that
    // has been endorsing for weeks is not new because this window is short.
    const rows = await repo.listEndorsementsForIntegrity("2026-08-15T00:00:00.000Z", 100);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.profileId).toBe(PROFILE_TWO);
    expect(Date.parse(rows[0]!.subjectFirstSeenAt)).toBe(Date.parse("2026-08-01T00:00:00.000Z"));
    // ISO strings, not driver Dates — the sweep does `Date.parse` on both.
    expect(typeof rows[0]!.createdAt).toBe("string");
    expect(typeof rows[0]!.subjectFirstSeenAt).toBe("string");
  });

  it("skips a withdrawn endorsement — it already counts for nothing", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    await repo.withdrawEndorsement(PROFILE, ADA, NOW_TS);
    expect(await repo.listEndorsementsForIntegrity("2026-01-01T00:00:00.000Z", 100)).toEqual([]);
  });

  it("applies a discount, and the total moves without the row moving", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    await repo.endorse(PROFILE, BOB, "confirmed", NOW_TS);
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(2);

    const first = await repo.restateIntegrity({
      findings: [{ profileId: PROFILE, subjectId: ADA, reason: "ring" }],
      windowStart: "2026-01-01T00:00:00.000Z",
      decidedBy: "automatic",
      reasons: EN3_REASONS,
      at: NOW_TS,
    });
    expect(first).toMatchObject({ applied: 1, reversed: 0, touchedProfileIds: [PROFILE] });
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(1);
    // THE ACT SURVIVES. Ada's endorsement is still there, still not withdrawn
    // — a restated total can be restated again; a deleted row cannot.
    const row = await repo.getEndorsement(PROFILE, ADA);
    expect(row).toMatchObject({ withdrawnAt: null, state: "confirmed" });
  });

  it("is idempotent — re-running the same sweep changes nothing", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    const input = {
      findings: [{ profileId: PROFILE, subjectId: ADA, reason: "ring" }],
      windowStart: "2026-01-01T00:00:00.000Z",
      decidedBy: "automatic",
      reasons: EN3_REASONS,
      at: NOW_TS,
    };
    expect((await repo.restateIntegrity(input)).applied).toBe(1);
    // A second sweep that found the same thing did not restate anything, so
    // it must report nothing — otherwise every sweep writes an audit row
    // saying a number moved when it did not.
    expect(await repo.restateIntegrity(input)).toMatchObject({ applied: 0, reversed: 0 });
  });

  it("REVERSES a discount the sweep no longer holds, and restores the total", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    await repo.restateIntegrity({
      findings: [{ profileId: PROFILE, subjectId: ADA, reason: "ring" }],
      windowStart: "2026-01-01T00:00:00.000Z",
      decidedBy: "automatic",
      reasons: EN3_REASONS,
      at: NOW_TS,
    });
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(0);

    // The ring broke up; this sweep names nobody.
    const second = await repo.restateIntegrity({
      findings: [],
      windowStart: "2026-01-01T00:00:00.000Z",
      decidedBy: "automatic",
      reasons: EN3_REASONS,
      at: "2026-08-18T12:00:00.000Z",
    });
    expect(second).toMatchObject({ applied: 0, reversed: 1, touchedProfileIds: [PROFILE] });
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(1);
  });

  it("BOUNDS the reversal to the window it looked at", async () => {
    // THE BUG THIS EXISTS TO CATCH: a short sweep silently restoring every
    // historical discount it simply did not read. A ring caught last month
    // must not come back because today's sweep only looked at today.
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", "2026-06-01T00:00:00.000Z");
    await repo.restateIntegrity({
      findings: [{ profileId: PROFILE, subjectId: ADA, reason: "ring" }],
      windowStart: "2026-05-01T00:00:00.000Z",
      decidedBy: "automatic",
      reasons: EN3_REASONS,
      at: "2026-06-02T00:00:00.000Z",
    });
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(0);

    // A later sweep over a window that does not reach June.
    const recent = await repo.restateIntegrity({
      findings: [],
      windowStart: "2026-08-01T00:00:00.000Z",
      decidedBy: "automatic",
      reasons: EN3_REASONS,
      at: NOW_TS,
    });
    expect(recent).toMatchObject({ applied: 0, reversed: 0 });
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(0);
  });

  it("re-discounts after a reversal by REUSING the row, not stacking one", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    const window = { windowStart: "2026-01-01T00:00:00.000Z", decidedBy: "automatic", reasons: EN3_REASONS };
    await repo.restateIntegrity({ ...window, findings: [{ profileId: PROFILE, subjectId: ADA, reason: "ring" }], at: NOW_TS });
    await repo.restateIntegrity({ ...window, findings: [], at: "2026-08-18T00:00:00.000Z" });
    const again = await repo.restateIntegrity({
      ...window,
      findings: [{ profileId: PROFILE, subjectId: ADA, reason: "ring" }],
      at: "2026-08-19T00:00:00.000Z",
    });
    expect(again).toMatchObject({ applied: 1, reversed: 0 });
    expect((await repo.countEndorsements(PROFILE, NOW_TS)).total).toBe(0);
    // ONE row for the pair, whatever the history — the same shape the
    // endorsement itself has (EN0).
    const rows = await sql.execute<{ n: string }>(
      `SELECT count(*) AS n FROM openproduct.endorsement_integrity
        WHERE profile_id = $1 AND subject_id = $2`,
      [PROFILE, ADA],
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);
  });

  it("records a CHANGED reason, and reports it as a restatement", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    const window = { windowStart: "2026-01-01T00:00:00.000Z", decidedBy: "automatic", reasons: EN3_REASONS, at: NOW_TS };
    await repo.restateIntegrity({ ...window, findings: [{ profileId: PROFILE, subjectId: ADA, reason: "burst" }] });
    // The sweep now sees the same account as part of a ring. That is a
    // different claim and the record should say so.
    const changed = await repo.restateIntegrity({
      ...window,
      findings: [{ profileId: PROFILE, subjectId: ADA, reason: "ring" }],
    });
    expect(changed.applied).toBe(1);
    const rows = await sql.execute<{ reason: string }>(
      `SELECT reason FROM openproduct.endorsement_integrity WHERE profile_id = $1 AND subject_id = $2`,
      [PROFILE, ADA],
    );
    expect(rows.rows[0]!.reason).toBe("ring");
  });

  it("discloses BY REASON and by nothing else (EN-4)", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    await repo.endorse(PROFILE, BOB, "confirmed", NOW_TS);
    await repo.endorse(PROFILE_TWO, ADA, "confirmed", NOW_TS);
    await repo.restateIntegrity({
      windowStart: "2026-01-01T00:00:00.000Z",
      decidedBy: "automatic",
      reasons: EN3_REASONS,
      at: NOW_TS,
      findings: [
        { profileId: PROFILE, subjectId: ADA, reason: "ring" },
        { profileId: PROFILE_TWO, subjectId: ADA, reason: "ring" },
        { profileId: PROFILE, subjectId: BOB, reason: "burst" },
      ],
    });

    const disclosure = await repo.integrityDisclosure("2026-01-01T00:00:00.000Z");
    expect(disclosure).toEqual([
      { reason: "burst", discounted: 1 },
      { reason: "ring", discounted: 2 },
    ]);
    // Never a listing, never a subject: either would be an accusation about
    // a specific product's supporters, or about a person, made in public by
    // arithmetic.
    for (const row of disclosure) expect(Object.keys(row).sort()).toEqual(["discounted", "reason"]);
  });

  it("counts a REVERSED discount in no disclosure", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    const window = { windowStart: "2026-01-01T00:00:00.000Z", decidedBy: "automatic", reasons: EN3_REASONS };
    await repo.restateIntegrity({ ...window, findings: [{ profileId: PROFILE, subjectId: ADA, reason: "ring" }], at: NOW_TS });
    await repo.restateIntegrity({ ...window, findings: [], at: "2026-08-18T00:00:00.000Z" });
    // "N endorsements discounted this week" must mean N that are actually
    // discounted right now, or the transparency report is a count of our own
    // past mistakes.
    expect(await repo.integrityDisclosure("2026-01-01T00:00:00.000Z")).toEqual([]);
  });

  it("keeps the sweep's floor in the DATABASE, and starts it due", async () => {
    // Null means never swept, which is due — a fresh estate should assess as
    // soon as it is asked to rather than waiting out a floor it has not
    // started. The seed row exists so the state is a row rather than an
    // absence somebody has to special-case.
    expect(await repo.getIntegritySweptAt()).toBeNull();

    await repo.markIntegritySwept(NOW_TS);
    expect(await repo.getIntegritySweptAt()).toBe(NOW_TS);

    // Upsert, not update: a database restored without the seed row would
    // otherwise never record a sweep and would sweep on every tick forever —
    // the exact failure the floor exists to prevent, arriving through the
    // floor's own absence.
    await sql.execute(`DELETE FROM openproduct.integrity_sweep_state`, []);
    await repo.markIntegritySwept("2026-08-19T00:00:00.000Z");
    expect(await repo.getIntegritySweptAt()).toBe("2026-08-19T00:00:00.000Z");
  });

  it("deleting a listing takes its endorsements and their opinions", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW_TS);
    await sql.execute(
      `INSERT INTO openproduct.endorsement_integrity (profile_id, subject_id, reason, decided_by)
       VALUES ($1, $2, 'ring', 'automatic')`,
      [PROFILE, ADA],
    );
    await repo.deleteProfile(ORG, PROFILE);
    // An opinion whose subject is gone is not a record, it is a leak waiting
    // for a join.
    const left = await sql.execute(`SELECT 1 FROM openproduct.endorsement_integrity`);
    expect(left.rows).toHaveLength(0);
  });
});

describe("openproduct — the public maintainer list is reconciled with consent (CG3)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const NOW_TS = "2026-08-17T12:00:00.000Z";

  // THE MOST IMPORTANT ASSERTION IN CG3, and it had no test before this
  // milestone: `listPublicMaintainers` used to return the maintainer's
  // publication list alone, so a maintainer typing a name put a stranger on
  // a public page. Only a NEGATIVE case existed (a draft shows nobody), which
  // is why widening the query to require consent passed silently — the gap
  // that hid the bug and the gap that hid the fix were the same gap.
  it("does NOT publish somebody the maintainer named but who never confirmed", async () => {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: "maintainer" }]);
    expect(await repo.listPublicMaintainers(PROFILE)).toEqual([]);
    // And the projection every public surface reads agrees.
    expect((await repo.listPublicCards()).length).toBe(1);
  });

  it("publishes them once THEY confirm, keeping the maintainer's label and order", async () => {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: "maintainer" }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);

    const published = await repo.listPublicMaintainers(PROFILE);
    expect(published.map((m) => m.subjectId)).toEqual([ADA]);
    // Reconciled, not merged: the label and the ordering are still the
    // maintainer's, because the publication list is still theirs.
    expect(published[0]!.roleLabel).toBe("maintainer");
    expect(published[0]!.displayName).toBe("Ada");
  });

  it("takes them off again when they leave", async () => {
    await seedPublished();
    await repo.setMaintainers(PROFILE, [{ subjectId: ADA, displayName: "Ada", roleLabel: null }]);
    await repo.inviteToRoster({ profileId: PROFILE, subjectId: ADA, roleLabel: null, invitedBy: ACTOR, at: NOW_TS });
    await repo.confirmRosterEdge(PROFILE, ADA, NOW_TS);
    expect(await repo.listPublicMaintainers(PROFILE)).toHaveLength(1);

    await repo.retireRosterEdge(PROFILE, ADA, ADA, NOW_TS);
    // Leaving is immediate and needs nobody's agreement.
    expect(await repo.listPublicMaintainers(PROFILE)).toEqual([]);
  });
});

describe("openproduct — follows (openproduct-launch FL0)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";

  it("follows a topic and a person, and following twice is following once", async () => {
    expect(await repo.follow(ADA, "topic", "dev-tools")).toBe(true);
    expect(await repo.follow(ADA, "topic", "dev-tools")).toBe(true);
    expect(await repo.follow(ADA, "person", BOB)).toBe(true);
    expect((await repo.countFollowers("topic", ["dev-tools"])).get("dev-tools")).toBe(1);
    expect((await repo.countFollowers("person", [BOB])).get(BOB)).toBe(1);
  });

  it("UNFOLLOWING DELETES — no tombstone survives it", async () => {
    // A follow has no restatement, so a tombstone would be a durable private
    // record that this person once followed that person: kept by us, asked
    // for by nobody. CG3's declineRosterEdge deletes for the same reason.
    await repo.follow(ADA, "topic", "dev-tools");
    expect(await repo.unfollow(ADA, "topic", "dev-tools")).toBe(true);
    expect((await repo.countFollowers("topic", ["dev-tools"])).has("dev-tools")).toBe(false);
    expect(await repo.listFollowed(ADA, [{ kind: "topic", target: "dev-tools" }])).toEqual([]);
    // And unfollowing what you do not follow is the state you asked for.
    expect(await repo.unfollow(ADA, "topic", "dev-tools")).toBe(false);
  });

  it("NOBODY FOLLOWS THEMSELVES — refused before the row, and by the schema", async () => {
    expect(await repo.follow(ADA, "person", ADA)).toBe(false);
    expect((await repo.countFollowers("person", [ADA])).has(ADA)).toBe(false);
    // The CHECK is the guarantee at rest: a write path that forgot the guard
    // above still cannot land the row.
    await expect(
      sql.execute(
        `INSERT INTO openproduct.follows (subject_id, kind, target) VALUES ($1, 'person', $1)`,
        [ADA],
      ),
    ).rejects.toThrow();
  });

  it("counts MANY targets in one read, and a target nobody follows is ABSENT", async () => {
    await repo.follow(ADA, "topic", "dev-tools");
    await repo.follow(BOB, "topic", "dev-tools");
    await repo.follow(ADA, "topic", "data");
    const counts = await repo.countFollowers("topic", ["dev-tools", "data", "security"]);
    expect(counts.get("dev-tools")).toBe(2);
    expect(counts.get("data")).toBe(1);
    // Absent rather than zero: the caller renders zero either way, and an
    // absent key cannot be mistaken for a measured emptiness.
    expect(counts.has("security")).toBe(false);
  });

  it("answers `what am I following` BOUNDED by what was asked", async () => {
    // An unbounded read would turn one page's personalisation into a listing
    // of the visitor's whole subscription history.
    await repo.follow(ADA, "topic", "dev-tools");
    await repo.follow(ADA, "topic", "data");
    await repo.follow(ADA, "person", BOB);
    const asked = await repo.listFollowed(ADA, [
      { kind: "topic", target: "dev-tools" },
      { kind: "topic", target: "security" },
    ]);
    expect(asked).toEqual([{ kind: "topic", target: "dev-tools" }]);
    // Bob's follow and the `data` follow are real and simply were not asked
    // about — the answer is the intersection, never the whole set.
    expect(await repo.listFollowed(ADA, [])).toEqual([]);
  });

  it("keeps two people's follows apart", async () => {
    await repo.follow(ADA, "topic", "dev-tools");
    expect(await repo.listFollowed(BOB, [{ kind: "topic", target: "dev-tools" }])).toEqual([]);
    expect((await repo.countFollowers("topic", ["dev-tools"])).get("dev-tools")).toBe(1);
  });

  it("resolves many handles to their ACTIVE holders in one read", async () => {
    // A released handle has no holder: answering with its previous one would
    // attach a follow to somebody who gave the name up.
    await repo.claimHandle("ada", ADA, NOW);
    const found = await repo.getSubjectsForHandles(["ada", "never-claimed"]);
    expect(found.get("ada")).toBe(ADA);
    expect(found.has("never-claimed")).toBe(false);
    expect(await repo.getSubjectsForHandles([])).toEqual(new Map());
  });
});

describe("openproduct — the upvote on a comment (openproduct-launch DQ1)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const TH = asUuid("aaaaaaaa-eeee-4eee-8eee-aaaaaaaaaaa1");
  const P1 = asUuid("bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbb1");
  const P2 = asUuid("bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbb2");
  const AT = "2026-08-17T12:00:00.000Z";
  const LATER = "2026-08-17T13:00:00.000Z";

  /** A published listing with a thread and two comments: ADA wrote the first,
   *  BOB the second. */
  async function seedComments() {
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
    await repo.createPost({ id: P2 as never, threadId: TH, authorSubjectId: BOB, body: "Two.", at: LATER });
  }

  it("counts one vote per person, and voting twice is voting once", async () => {
    await seedComments();
    expect(await repo.votePost(P1, BOB, AT)).toBe(true);
    expect(await repo.votePost(P1, BOB, LATER)).toBe(true);
    expect((await repo.countPostVotes([P1])).get(P1)).toBe(1);
  });

  it("WITHDRAWING KEEPS THE ROW, unlike a follow", async () => {
    // A public number anything may ever have to RESTATE needs a log rather
    // than a presence test. FL0's `unfollow` deletes and says why it may.
    await seedComments();
    await repo.votePost(P1, BOB, AT);
    expect(await repo.withdrawPostVote(P1, BOB, LATER)).toBe(true);
    expect((await repo.countPostVotes([P1])).has(P1)).toBe(false);

    const rows = await sql.execute<{ n: string | number }>(
      `SELECT count(*) AS n FROM openproduct.post_votes WHERE post_id = $1 AND subject_id = $2`,
      [P1, BOB],
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);
    // Withdrawing what you have not voted on is the state you asked for.
    expect(await repo.withdrawPostVote(P1, BOB, LATER)).toBe(false);
  });

  it("RE-VOTING reuses the row and does not re-stamp `created_at`", async () => {
    // "Voted, withdrew, voted again" is one row with a history rather than
    // three facts nobody can reconcile — and re-stamping would let a cycle
    // manufacture recency for anything that ever reads it.
    await seedComments();
    await repo.votePost(P1, BOB, AT);
    await repo.withdrawPostVote(P1, BOB, LATER);
    await repo.votePost(P1, BOB, "2026-08-19T09:00:00.000Z");

    const rows = await sql.execute<{ n: string | number; created_at: string | Date }>(
      `SELECT count(*) OVER () AS n, created_at FROM openproduct.post_votes
        WHERE post_id = $1 AND subject_id = $2`,
      [P1, BOB],
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);
    expect(new Date(rows.rows[0]!.created_at).toISOString()).toBe(AT);
    expect((await repo.countPostVotes([P1])).get(P1)).toBe(1);
  });

  it("NOBODY UPVOTES THEIR OWN COMMENT — the trigger is the guarantee", async () => {
    await seedComments();
    // ADA wrote P1.
    expect(await repo.votePost(P1, ADA, AT)).toBe(false);
    expect((await repo.countPostVotes([P1])).has(P1)).toBe(false);
    // And the raw insert cannot get round it either: a future write path that
    // forgets the handler guard is still a write path.
    await expect(
      sql.execute(
        `INSERT INTO openproduct.post_votes (post_id, subject_id) VALUES ($1, $2)`,
        [P1, ADA],
      ),
    ).rejects.toThrow();
  });

  it("counts MANY posts in one read, and a post nobody voted on is ABSENT", async () => {
    await seedComments();
    await repo.votePost(P1, BOB, AT);
    await repo.votePost(P2, ADA, AT);
    await repo.votePost(P2, "usr_0000000000000000000000000000cee0", AT);

    const counts = await repo.countPostVotes([P1, P2, asUuid("bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbb9")]);
    expect(counts.get(P1)).toBe(1);
    expect(counts.get(P2)).toBe(2);
    // Absent rather than zero: the caller renders zero either way, and an
    // absent key cannot be mistaken for a measured emptiness (OPC-C).
    expect(counts.has(asUuid("bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbb9"))).toBe(false);
    expect(await repo.countPostVotes([])).toEqual(new Map());
  });

  it("answers `which of these have I voted on`, BOUNDED by what was asked", async () => {
    // An unbounded read would turn one page's personalisation into a listing
    // of everything this visitor has ever upvoted.
    await seedComments();
    // BOB can only vote on ADA's comment and ADA only on BOB's — the trigger
    // sees to that, and it makes this a stronger test: real votes on both
    // sides, and the two answers still do not bleed into each other.
    await repo.votePost(P1, BOB, AT);
    await repo.votePost(P2, ADA, AT);

    // BOUNDED: asked about one, answered about one, even though there is
    // another vote by this person that was not asked about.
    expect(await repo.listPostVotesBy(BOB, [P1])).toEqual([P1]);
    expect(await repo.listPostVotesBy(BOB, [P1, P2])).toEqual([P1]);
    expect(await repo.listPostVotesBy(ADA, [P1, P2])).toEqual([P2]);
    expect(await repo.listPostVotesBy(BOB, [])).toEqual([]);
  });

  it("a withdrawn vote is not in the overlay's answer either", async () => {
    await seedComments();
    await repo.votePost(P1, BOB, AT);
    await repo.withdrawPostVote(P1, BOB, LATER);
    expect(await repo.listPostVotesBy(BOB, [P1])).toEqual([]);
  });

  it("a vote on a post that does not exist does not happen", async () => {
    // The FK refuses it, and the repository folds that into the same false
    // every other refusal gets — telling them apart would make this an
    // existence oracle for post ids.
    await seedComments();
    expect(await repo.votePost(asUuid("bbbbbbbb-eeee-4eee-8eee-bbbbbbbbbbbf"), BOB, AT)).toBe(false);
  });
});

describe("openproduct — one discussion per listing (openproduct-launch DQ0b)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const T1 = asUuid("aaaaaaaa-dddd-4ddd-8ddd-aaaaaaaaaaa1");
  const T2 = asUuid("aaaaaaaa-dddd-4ddd-8ddd-aaaaaaaaaaa2");
  const P1 = asUuid("bbbbbbbb-dddd-4ddd-8ddd-bbbbbbbbbbb1");
  const P2 = asUuid("bbbbbbbb-dddd-4ddd-8ddd-bbbbbbbbbbb2");
  const ACT = asUuid("cccccccc-dddd-4ddd-8ddd-ccccccccccc1");
  const AT = "2026-08-17T12:00:00.000Z";
  const LATER = "2026-08-17T13:00:00.000Z";

  const ensure = (id: string, subjectId = ADA) =>
    repo.ensureLaunchThread({
      id: id as never,
      profileId: PROFILE,
      title: "Comments on acme-thing",
      authorSubjectId: subjectId,
    });

  it("makes the thread on first use and REUSES it after", async () => {
    await seedPublished();
    const first = await ensure(T1);
    expect(first).toMatchObject({ id: T1, created: true });

    // The second caller gets the SAME thread and is told it made nothing —
    // which is what a caller that notifies participants needs to know.
    const second = await ensure(T2, BOB);
    expect(second).toEqual({ id: T1, created: false });
  });

  it("AT MOST ONE, and the INDEX is what says so", async () => {
    // Two people commenting within the same second is the ordinary case, not
    // the exotic one. A read-then-write would give them a thread each, after
    // which the page shows one and the other is unreachable.
    await seedPublished();
    await ensure(T1);
    await expect(
      sql.execute(
        `INSERT INTO openproduct.threads (id, profile_id, tag, title, author_subject_id)
         VALUES ($1, $2, 'launch', 'A second one', $3)`,
        [T2, PROFILE, BOB],
      ),
    ).rejects.toThrow();
  });

  it("the CHECK admits `launch` and still refuses anything else", async () => {
    await seedPublished();
    await expect(
      sql.execute(
        `INSERT INTO openproduct.threads (id, profile_id, tag, title, author_subject_id)
         VALUES ($1, $2, 'chatter', 'Not a tag', $3)`,
        [T2, PROFILE, ADA],
      ),
    ).rejects.toThrow();
  });

  it("is EXCLUDED from the listing's discussions, and asked for by name", async () => {
    // It is not one of the listing's discussions; it is the product page's own
    // comment section, rendered flat beneath it. Leaving it in the list would
    // show one conversation twice on one page.
    await seedPublished();
    await ensure(T1);
    await repo.createThread({
      id: T2 as never,
      profileId: PROFILE,
      tag: "question",
      title: "How do I run this locally?",
      authorSubjectId: ADA,
      at: AT,
    });

    expect((await repo.listThreads(PROFILE)).map((t) => t.tag)).toEqual(["question"]);
    expect((await repo.listThreads(PROFILE, "launch")).map((t) => t.id)).toEqual([T1]);
    // And a filtered read for a REAL tag still excludes it.
    expect((await repo.listThreads(PROFILE, "question")).map((t) => t.id)).toEqual([T2]);
  });

  it("reads back as the one thread, with its posts", async () => {
    await seedPublished();
    await ensure(T1);
    await repo.createPost({ id: P1 as never, threadId: T1, authorSubjectId: ADA, body: "One.", at: AT });
    await repo.createPost({ id: P2 as never, threadId: T1, authorSubjectId: BOB, body: "Two.", at: LATER });

    const thread = await repo.getLaunchThread(PROFILE);
    expect(thread).toMatchObject({ id: T1, tag: "launch", state: "open", postCount: 2 });
    expect((await repo.listPosts(T1, 50)).map((p) => p.id)).toEqual([P1, P2]);
  });

  it("A LOCKED thread stays the one, and cannot be routed around", async () => {
    // Replacing a locked thread would be a way around the lock, so the index
    // counts it — `ensureLaunchThread` hands it back and `createPost` refuses.
    await seedPublished();
    await ensure(T1);
    expect(await repo.setThreadState(T1, "locked", ["open", "answered"])).toBe(true);

    expect(await ensure(T2, BOB)).toEqual({ id: T1, created: false });
    expect(
      await repo.createPost({ id: P1 as never, threadId: T1, authorSubjectId: BOB, body: "Hi.", at: AT }),
    ).toBeNull();
  });

  it("A REMOVED thread is outside the index, so the next commenter gets a new one", async () => {
    // Removal ends a conversation; it does not close the product to
    // conversation for ever. The alternative is posting into a tombstone or
    // being silently refused.
    await seedPublished();
    await ensure(T1);
    await repo.setThreadState(T1, "removed", ["open", "answered", "locked"]);
    expect(await repo.getLaunchThread(PROFILE)).toBeNull();

    const again = await ensure(T2, BOB);
    expect(again).toMatchObject({ id: T2, created: true });
    expect((await repo.getLaunchThread(PROFILE))!.id).toBe(T2);
  });

  it("a listing that is not public has no readable comment section", async () => {
    await seedPublished();
    await ensure(T1);
    expect(await repo.getLaunchThread(PROFILE)).not.toBeNull();

    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await repo.getLaunchThread(PROFILE)).toBeNull();
    expect(await repo.listThreads(PROFILE, "launch")).toEqual([]);
  });

  it("a DELISTED listing's comments go quiet, exactly as CB1's threads do", async () => {
    // NOT THE ANSWER I EXPECTED WHEN I WROTE THIS TEST, and the reason it is
    // pinned rather than changed: every thread read on this estate applies
    // `visibility = public AND moderation_state = visible`, so CB1's threads
    // have disappeared on delist since CB1. DQ0b's comment section is one more
    // thread read and behaves identically — which is the property worth
    // holding, because a comment section that outlived a delisting while the
    // discussions above it did not would be two rules on one page.
    //
    // There IS a tension with TS3's "a delisted listing keeps its whole page":
    // its openings and its maintainers survive, its conversations do not.
    // Resolving that is a decision about what delisting means, not a thing to
    // settle inside a milestone about a comment box — so this records the
    // behaviour and names the question.
    await seedPublished();
    await ensure(T1);
    await repo.setListingModerationState({
      slug: "acme-thing",
      state: "delisted",
      at: AT,
      actId: ACT,
      legalFrom: ["visible"],
    });
    expect(await repo.getLaunchThread(PROFILE)).toBeNull();
    // The same answer the discussions above it give — one rule, not two.
    expect(await repo.listThreads(PROFILE)).toEqual([]);
    // And the ROW survives: relisting brings the conversation back.
    await repo.setListingModerationState({
      slug: "acme-thing",
      state: "visible",
      at: LATER,
      actId: asUuid("cccccccc-dddd-4ddd-8ddd-ccccccccccc2"),
      legalFrom: ["delisted"],
    });
    expect((await repo.getLaunchThread(PROFILE))!.id).toBe(T1);
  });
});

describe("openproduct — a maker's three tabs (openproduct-launch MP0)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const LATER = "2026-08-18T09:00:00.000Z";
  const L1 = asUuid("bbbbbbbb-9999-4999-8999-bbbbbbbbbbb1");
  const L2 = asUuid("bbbbbbbb-9999-4999-8999-bbbbbbbbbbb2");
  const M1 = asUuid("cccccccc-9999-4999-8999-ccccccccccc1");
  const M2 = asUuid("cccccccc-9999-4999-8999-ccccccccccc2");
  const TH1 = asUuid("dddddddd-9999-4999-8999-ddddddddddd1");
  const TH2 = asUuid("dddddddd-9999-4999-8999-ddddddddddd2");
  const PO1 = asUuid("eeeeeeee-9999-4999-8999-eeeeeeee0001");
  const PO2 = asUuid("eeeeeeee-9999-4999-8999-eeeeeeee0002");
  const PO3 = asUuid("eeeeeeee-9999-4999-8999-eeeeeeee0003");

  /** A published listing ADA maintains, with a live launch on `at`. */
  async function seedMakerLaunch(
    profileId = PROFILE,
    projectId = PROJECT,
    slug = "acme-thing",
    launchId = L1,
    at = "2026-08-17T09:00:00.000Z",
    maintainer = ADA,
  ) {
    await seedPublished(profileId, projectId, slug);
    // `listing_maintainers` is the edge `maintains` reads on the same page —
    // NOT `published_maintainers`, which is CG3's consent-based public credit
    // list. A maker's launches are the launches of listings they RUN, and
    // the two tables answer different questions.
    await repo.addListingMaintainer(profileId, maintainer, "maintainer", ACTOR);
    await repo.scheduleLaunch({
      id: launchId,
      profileId,
      versionLabel: "1.0",
      scheduledFor: at,
      scheduledBy: ACTOR,
    });
    await repo.fireDueLaunches("2026-08-18T00:00:00.000Z");
  }

  describe("launched", () => {
    it("lists launches of the listings they maintain, newest first", async () => {
      await seedMakerLaunch();
      await seedMakerLaunch(PROFILE_TWO, PROJECT_TWO, "other-thing", L2, "2026-08-16T09:00:00.000Z");

      const rows = await repo.listMakerLaunches(ADA, 10);
      expect(rows.map((r) => r.slug)).toEqual(["acme-thing", "other-thing"]);
      expect(rows[0]).toMatchObject({ day: "2026-08-17", versionLabel: "1.0" });
    });

    it("A DAY THE SWEEP HAS NOT COUNTED HAS NO ORDINAL — null, not 1", async () => {
      // `1` for a position nobody computed is the most confident-looking
      // wrong number this page could carry (OPC-C).
      await seedMakerLaunch();
      expect((await repo.listMakerLaunches(ADA, 10))[0]!.rank).toBeNull();
      expect((await repo.listMakerLaunches(ADA, 10))[0]!.counted).toBe(0);
    });

    it("reads the BOARD's ordinal — a position among everybody who launched that day", async () => {
      // Not a rank among this person's own launches: the number on a maker's
      // page and the number on that day's board are the same number.
      await seedMakerLaunch();
      // BOB's listing, not ADA's — so ADA's page shows one launch and the
      // ordinal on it is a position among BOTH.
      await seedMakerLaunch(
        PROFILE_TWO,
        PROJECT_TWO,
        "other-thing",
        L2,
        "2026-08-17T10:00:00.000Z",
        BOB,
      );
      await repo.writeBoardRanks({
        day: "2026-08-17",
        observedAt: "2026-08-18T00:00:00.000Z",
        ranks: [
          { launchId: L1, profileId: PROFILE, countedId: M1, ineligibleId: asUuid("cccccccc-9999-4999-8999-ccccccccccc3"), counted: 2, ineligible: 0 },
          { launchId: L2, profileId: PROFILE_TWO, countedId: M2, ineligibleId: asUuid("cccccccc-9999-4999-8999-ccccccccccc4"), counted: 9, ineligible: 0 },
        ],
      });

      // BOB's one launch won the day, so ADA's sits second — even though it
      // is the only one on ADA's page.
      const ada = await repo.listMakerLaunches(ADA, 10);
      expect(ada).toHaveLength(1);
      expect(ada[0]).toMatchObject({ slug: "acme-thing", rank: 2, counted: 2 });

      const bob = await repo.listMakerLaunches(BOB, 10);
      expect(bob[0]).toMatchObject({ slug: "other-thing", rank: 1, counted: 9 });
    });

    it("PE2 — the first launch day and the clean-vote count, and both leave with the listing", async () => {
      expect(await repo.firstMakerLaunchDay(ADA)).toBeNull();
      expect(await repo.countMakerCleanVoteListings(ADA)).toBe(0);
      await seedMakerLaunch();
      expect(await repo.firstMakerLaunchDay(ADA)).toBe("2026-08-17");
      expect(await repo.firstMakerLaunchDay(BOB)).toBeNull();
      await sql.execute(`UPDATE openproduct.profiles SET clean_votes = true WHERE id = $1`, [PROFILE]);
      expect(await repo.countMakerCleanVoteListings(ADA)).toBe(1);
      expect(await repo.countMakerCleanVoteListings(BOB)).toBe(0);
      await repo.unpublishProfile(ORG, PROFILE, ACTOR);
      expect(await repo.firstMakerLaunchDay(ADA)).toBeNull();
      expect(await repo.countMakerCleanVoteListings(ADA)).toBe(0);
    });

    it("a listing that stopped being public takes its launches with it", async () => {
      await seedMakerLaunch();
      expect(await repo.listMakerLaunches(ADA, 10)).toHaveLength(1);
      await repo.unpublishProfile(ORG, PROFILE, ACTOR);
      expect(await repo.listMakerLaunches(ADA, 10)).toEqual([]);
    });
  });

  describe("upvoted", () => {
    it("lists what they upvoted, most recently upvoted first", async () => {
      await seedPublished();
      await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
      await repo.endorse(PROFILE, ADA, "confirmed", "2026-08-10T00:00:00.000Z");
      await repo.endorse(PROFILE_TWO, ADA, "confirmed", "2026-08-12T00:00:00.000Z");

      const rows = await repo.listMakerUpvotes(ADA, 10);
      expect(rows.map((r) => r.slug)).toEqual(["other-thing", "acme-thing"]);
      expect(rows[0]!.counting).toBe(true);
    });

    it("A WITHDRAWN UPVOTE IS ABSENT, not struck through", async () => {
      // Withdrawal is the act of unsaying something in public, and a record
      // that survived it would make it unsayable.
      await seedPublished();
      await repo.endorse(PROFILE, ADA, "confirmed", NOW);
      expect(await repo.listMakerUpvotes(ADA, 10)).toHaveLength(1);
      await repo.withdrawEndorsement(PROFILE, ADA, LATER);
      expect(await repo.listMakerUpvotes(ADA, 10)).toEqual([]);
    });

    it("lists a PENDING upvote and says it does not count yet", async () => {
      // TS1's floor records a new account's upvote and does not count it.
      // The act is theirs either way; hiding it would make the page disagree
      // with what they did.
      await seedPublished();
      await repo.endorse(PROFILE, ADA, "pending", NOW);
      const rows = await repo.listMakerUpvotes(ADA, 10);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.counting).toBe(false);
    });

    it("keeps two people's upvotes apart, and never reads a SAVE", async () => {
      await seedPublished();
      await repo.endorse(PROFILE, ADA, "confirmed", NOW);
      expect(await repo.listMakerUpvotes(BOB, 10)).toEqual([]);
    });
  });

  describe("comments", () => {
    async function seedComment(
      threadId: string,
      postId: string,
      profileId = PROFILE,
      at = NOW,
      author = ADA,
    ) {
      await repo.createThread({
        id: threadId as never,
        profileId,
        tag: "question",
        title: "How do I run this locally?",
        authorSubjectId: author,
        at,
      });
      await repo.createPost({ id: postId as never, threadId, authorSubjectId: author, body: "A line.", at });
    }

    it("lists LISTINGS, with how many of THEIR comments are on each", async () => {
      // Not a transcript. Every post is already public and carries its
      // author's handle; a per-person index of everything somebody has said
      // is a different artefact, and this read declines to build it.
      await seedPublished();
      await seedComment(TH1, PO1);
      await repo.createPost({ id: PO2 as never, threadId: TH1, authorSubjectId: ADA, body: "And another.", at: LATER });

      const rows = await repo.listMakerComments(ADA, 10);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ slug: "acme-thing", comments: 2, threadId: TH1 });
      // The row carries no body text at all.
      expect(JSON.stringify(rows)).not.toContain("A line.");
    });

    it("names a THREAD only when all their comments are in one", async () => {
      await seedPublished();
      await seedComment(TH1, PO1);
      await seedComment(TH2, PO3, PROFILE, LATER);
      // Two conversations on one listing: there is no single one to send a
      // reader to, so the listing's own discussion is the honest landing.
      expect((await repo.listMakerComments(ADA, 10))[0]).toMatchObject({
        comments: 2,
        threadId: null,
      });
    });

    it("PE1 — the history lists each comment as a dated act, newest first, and pages by moment", async () => {
      await seedPublished();
      await seedComment(TH1, PO1);
      await repo.createPost({ id: PO2 as never, threadId: TH1, authorSubjectId: ADA, body: "And another.", at: LATER });

      const page = await repo.listMakerHistory(ADA, 10, null);
      expect(page.map((r) => r.kind)).toEqual(["commented", "commented"]);
      expect(page[0]!.at > page[1]!.at).toBe(true);
      expect(page[0]).toMatchObject({ slug: "acme-thing", ref: TH1 });
      expect(typeof page[0]!.detail).toBe("string");
      expect(Object.keys(page[0]!).sort()).toEqual(["at", "detail", "kind", "ref", "slug", "tagline"]);

      // Everything strictly BEFORE the moment: the newer row is gone, the
      // older stays, and the row at the moment itself is not repeated.
      const earlier = await repo.listMakerHistory(ADA, 10, page[0]!.at);
      expect(earlier).toHaveLength(1);
      expect(earlier[0]!.at).toBe(page[1]!.at);
      expect(await repo.listMakerHistory(ADA, 10, page[1]!.at)).toEqual([]);
      // Nobody else's acts.
      expect(await repo.listMakerHistory(BOB, 10, null)).toEqual([]);
    });

    it("a REMOVED comment is absent", async () => {
      await seedPublished();
      await seedComment(TH1, PO1);
      expect(await repo.listMakerComments(ADA, 10)).toHaveLength(1);
      await repo.setPostModerationState(PO1, "removed", LATER);
      expect(await repo.listMakerComments(ADA, 10)).toEqual([]);
    });

    it("a comment on a listing that is no longer public is absent with it", async () => {
      await seedPublished();
      await seedComment(TH1, PO1);
      await repo.unpublishProfile(ORG, PROFILE, ACTOR);
      expect(await repo.listMakerComments(ADA, 10)).toEqual([]);
    });
  });

  describe("the counts", () => {
    it("agree with the lists, under the SAME visibility filters", async () => {
      // The milestone's own done-when. A counter computed under looser rules
      // than the tab beneath it is right about the database and wrong about
      // the page.
      await seedMakerLaunch();
      await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
      await repo.endorse(PROFILE_TWO, ADA, "confirmed", NOW);
      await repo.createThread({
        id: TH1 as never,
        profileId: PROFILE,
        tag: "question",
        title: "How do I run this locally?",
        authorSubjectId: ADA,
        at: NOW,
      });
      await repo.createPost({ id: PO1 as never, threadId: TH1, authorSubjectId: ADA, body: "A line.", at: NOW });

      const counts = await repo.countMakerActivity(ADA);
      expect(counts).toEqual({ launched: 1, upvotesGiven: 1, comments: 1 });
      expect((await repo.listMakerLaunches(ADA, 50)).length).toBe(counts.launched);
      expect((await repo.listMakerUpvotes(ADA, 50)).length).toBe(counts.upvotesGiven);
    });

    it("counts POSTS, while the tab lists LISTINGS", async () => {
      // Somebody with two comments on one product said two things, and a tab
      // reading `1` would be counting the wrong noun.
      await seedPublished();
      await repo.createThread({
        id: TH1 as never,
        profileId: PROFILE,
        tag: "question",
        title: "How do I run this locally?",
        authorSubjectId: ADA,
        at: NOW,
      });
      await repo.createPost({ id: PO1 as never, threadId: TH1, authorSubjectId: ADA, body: "One.", at: NOW });
      await repo.createPost({ id: PO2 as never, threadId: TH1, authorSubjectId: ADA, body: "Two.", at: LATER });

      expect((await repo.countMakerActivity(ADA)).comments).toBe(2);
      expect(await repo.listMakerComments(ADA, 10)).toHaveLength(1);
    });

    it("is all zeroes for somebody who has done nothing — measured, not missing", async () => {
      await seedPublished();
      expect(await repo.countMakerActivity(BOB)).toEqual({
        launched: 0,
        upvotesGiven: 0,
        comments: 0,
      });
    });
  });
});

describe("openproduct — open roles across listings (openproduct-launch FL1)", () => {
  const OPENING_TWO = asUuid("78787878-7878-4878-8878-787878787878");
  const OPENING_THREE = asUuid("79797979-7979-4979-8979-797979797979");

  /** Push a row's `created_at` back, so the ORDER is a fact rather than a race
   *  between two `now()`s a microsecond apart. */
  const openedAt = (id: string, at: string) =>
    sql.execute(`UPDATE openproduct.role_openings SET created_at = $2 WHERE id = $1`, [id, at]);

  it("reads open roles from PUBLISHED listings, most recently opened first", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.upsertRoleOpening({
      id: OPENING_TWO,
      profileId: PROFILE_TWO,
      title: "Docs",
      commitment: "a-few-hours-a-week",
    });
    await openedAt(OPENING, "2026-08-01T00:00:00.000Z");
    await openedAt(OPENING_TWO, "2026-08-10T00:00:00.000Z");

    const roles = await repo.listOpenRoles(10);
    expect(roles.map((r) => r.id)).toEqual([OPENING_TWO, OPENING]);
    // The LISTING's slug travels with the role — a panel row that named only
    // a role would be asking a reader to click to find out whose it is.
    expect(roles[0]).toMatchObject({
      title: "Docs",
      slug: "other-thing",
      commitment: "a-few-hours-a-week",
    });
    // ABSENT, NOT "unspecified". A maintainer who did not name a commitment is
    // not a maintainer who said "any".
    expect(roles[1]!.commitment).toBeNull();
  });

  it("WEIGHTED BY NOTHING — a role on a quiet listing sorts by its own age", async () => {
    // The whole point of the panel: a role on a product nobody has upvoted is
    // as findable as a role on a busy one, which is most of what a directory
    // of small open products is for. The only inputs are "open" and "when".
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Loud" });
    await repo.upsertRoleOpening({ id: OPENING_TWO, profileId: PROFILE_TWO, title: "Quiet" });
    await openedAt(OPENING, "2026-08-01T00:00:00.000Z");
    await openedAt(OPENING_TWO, "2026-08-10T00:00:00.000Z");
    // Give the older listing every signal this estate has.
    await repo.endorse(PROFILE, "usr_0000000000000000000000000000ada0", "confirmed", NOW);
    await repo.endorse(PROFILE, "usr_0000000000000000000000000000bob0", "confirmed", NOW);

    expect((await repo.listOpenRoles(10)).map((r) => r.title)).toEqual(["Quiet", "Loud"]);
  });

  it("a FILLED role is not an open one", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({
      id: OPENING,
      profileId: PROFILE,
      title: "Filled",
      status: "filled",
    });
    await repo.upsertRoleOpening({ id: OPENING_TWO, profileId: PROFILE, title: "Open" });
    expect((await repo.listOpenRoles(10)).map((r) => r.title)).toEqual(["Open"]);
  });

  it("a role on a listing that is not public is not readable, by any route in", async () => {
    // The panel is a PUBLIC document. `listPublicRoleOpenings` re-asserts the
    // parent's visibility for one listing; this read has to do it across all
    // of them, and a cross-listing read that forgot would publish a draft's
    // roles on the front page.
    await seedDraft();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Secret" });
    expect(await repo.listOpenRoles(10)).toEqual([]);

    // The SAME listing, published — so what changed between the two answers
    // is the listing's visibility and nothing else.
    await repo.recordRepoObservation(PROFILE, {
      repoVisibility: "public",
      repoLicence: "Apache-2.0",
      observedAt: NOW,
    });
    await repo.reviewProfile(PROFILE, ADMIN, NOW);
    await repo.publishProfile(ORG, PROFILE, NOW, ACTOR, REVIEWED_PUBLISH);
    expect(await repo.listOpenRoles(10)).toHaveLength(1);

    // And it leaves again when the listing does.
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await repo.listOpenRoles(10)).toEqual([]);
  });

  it("clamps the limit rather than trusting a caller's number", async () => {
    await seedPublished();
    for (const [i, id] of [OPENING, OPENING_TWO, OPENING_THREE].entries()) {
      await repo.upsertRoleOpening({ id, profileId: PROFILE, title: `Role ${i}` });
    }
    expect(await repo.listOpenRoles(2)).toHaveLength(2);
    // A page asking for none gets one, not an empty answer it would render as
    // "nobody is looking for anybody".
    expect(await repo.listOpenRoles(0)).toHaveLength(1);
    expect(await repo.listOpenRoles(10_000)).toHaveLength(3);
  });
});
