// The openproduct repository against a live engine — the signal plane, the widened card, trust and safety, the schema boundary, the teardown.
//
// Ingestion against a live engine (SN1), the card's observed columns (CT1), reports and moderation acts (TS0), the signal sources (SN0), the schema boundary OD2a draws, and teardown.md's row 10 — one DROP SCHEMA, re-applied cleanly.
//
// Cut from `repository-pg.test.ts` at openproduct-verification OV3, verbatim:
// the engine, the ids and the two seeds come from `./harness.js`, which
// restores the ladder's template per test instead of re-applying fifty
// migrations. Nothing a test asserts changed; what it costs did.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { db, repo, ORG, PROJECT_TWO, PROFILE, PROFILE_TWO, OPENING, MIGRATIONS, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

describe("the signal plane in motion (SN1)", () => {
  const NOW = "2026-08-25T12:00:00.000Z";

  async function seedSource(source: "linked_repo" | "declared_repo" = "linked_repo") {
    await seedPublished();
    return repo.upsertSignalSource(PROFILE, source, "example/acme-thing");
  }

  it("a never-read source is the MOST urgent thing in the queue", async () => {
    await seedSource();
    const due = await repo.listDueSignalSources(NOW);
    // NULLS FIRST. A source we have never read is not the least urgent thing
    // in the queue, which is what a naive ORDER BY would make it.
    expect(due).toHaveLength(1);
    expect(due[0]?.lastSuccessAt).toBeNull();
    // The listing's coordinates come with it, so the poller needs one read.
    expect(due[0]?.slug).toBe("acme-thing");
    expect(due[0]?.repoUrl).toBe("https://github.com/acme/thing");
  });

  it("a source that answered drops out of the queue until its window passes", async () => {
    await seedSource();
    await repo.recordSignalSuccess(PROFILE, "linked_repo", NOW);
    expect(await repo.listDueSignalSources(NOW)).toHaveLength(0);
    expect(await repo.listDueSignalSources("2026-08-26T12:00:00.000Z")).toHaveLength(1);
  });

  it("withdraws at its tolerance, in the same statement that counts the failure", async () => {
    await seedSource();
    for (let i = 1; i < 3; i += 1) {
      const s = await repo.recordSignalFailure(PROFILE, "linked_repo", "timeout", NOW, 3);
      expect(s?.failureCount).toBe(i);
      expect(s?.withdrawnAt).toBeNull();
    }
    const withdrawn = await repo.recordSignalFailure(PROFILE, "linked_repo", "timeout", NOW, 3);
    expect(withdrawn?.failureCount).toBe(3);
    expect(withdrawn?.withdrawnAt).not.toBeNull();
    // Withdrawal stops the polling. It also stops the rendering — that half
    // is `renderableValue`'s, and the two go together on purpose.
    expect(await repo.listDueSignalSources("2027-01-01T00:00:00.000Z")).toHaveLength(0);
  });

  it("re-declaring a source un-withdraws it, because the coordinates changed", async () => {
    await seedSource();
    await repo.recordSignalFailure(PROFILE, "linked_repo", "gone", NOW, 1);
    const revived = await repo.upsertSignalSource(PROFILE, "linked_repo", "acme/renamed");
    expect(revived.withdrawnAt).toBeNull();
    expect(revived.failureCount).toBe(0);
    expect(revived.locator).toBe("acme/renamed");
  });

  it("a private listing is never polled — we do not read what we do not show", async () => {
    await seedDraft();
    await repo.upsertSignalSource(PROFILE, "linked_repo", "example/acme-thing");
    expect(await repo.listDueSignalSources(NOW)).toHaveLength(0);
  });

  // ─── OB2 — every listed build with a GitHub URL is watched ───

  it("seeds a declared_repo source for a listed build, once, and it is due at once", async () => {
    await seedPublished();
    expect(await repo.seedDeclaredRepoSources(NOW)).toEqual({ seeded: 1, withdrawn: 0 });
    // Idempotent: an unchanged corpus writes nothing.
    expect(await repo.seedDeclaredRepoSources(NOW)).toEqual({ seeded: 0, withdrawn: 0 });
    const due = await repo.listDueSignalSources(NOW);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ source: "declared_repo", locator: "https://github.com/acme/thing" });
  });

  it("seeds nothing for a draft — we do not read what we do not show", async () => {
    await seedDraft();
    expect(await repo.seedDeclaredRepoSources(NOW)).toEqual({ seeded: 0, withdrawn: 0 });
  });

  it("leaves a build an App already watches to the App", async () => {
    await seedSource("linked_repo");
    expect((await repo.seedDeclaredRepoSources(NOW)).seeded).toBe(0);
  });

  it("never revives a source its failures withdrew while the URL is unchanged", async () => {
    await seedPublished();
    await repo.seedDeclaredRepoSources(NOW);
    await repo.recordSignalFailure(PROFILE, "declared_repo", "repo_url_unreadable", NOW, 1);
    expect((await repo.seedDeclaredRepoSources(NOW)).seeded).toBe(0);
    expect(await repo.listDueSignalSources("2027-01-01T00:00:00.000Z")).toHaveLength(0);
  });

  it("a new URL is a new question: fresh run, due at once", async () => {
    await seedPublished();
    await repo.seedDeclaredRepoSources(NOW);
    await repo.recordSignalFailure(PROFILE, "declared_repo", "gone", NOW, 1);
    await db.query(`UPDATE openproduct.profiles SET repo_url = 'https://github.com/acme/renamed' WHERE id = $1`, [PROFILE]);
    expect((await repo.seedDeclaredRepoSources(NOW)).seeded).toBe(1);
    const due = await repo.listDueSignalSources(NOW);
    expect(due[0]).toMatchObject({ locator: "https://github.com/acme/renamed", failureCount: 0, withdrawnAt: null });
  });

  it("withdraws the source when the URL is cleared or leaves github.com", async () => {
    await seedPublished();
    await repo.seedDeclaredRepoSources(NOW);
    await db.query(`UPDATE openproduct.profiles SET repo_url = NULL WHERE id = $1`, [PROFILE]);
    expect(await repo.seedDeclaredRepoSources(NOW)).toEqual({ seeded: 0, withdrawn: 1 });
    expect(await repo.listDueSignalSources("2027-01-01T00:00:00.000Z")).toHaveLength(0);
  });

  it("reads the LATEST observation per metric, and keeps the ones before it", async () => {
    await seedPublished();
    for (const [n, value, at] of [
      [1, 30, "2026-08-24T10:00:00Z"],
      [2, 38, "2026-08-25T10:00:00Z"],
    ] as const) {
      await repo.writeMetric({
        id: asUuid(`b000000${n}-0000-4000-8000-00000000000${n}`),
        profileId: PROFILE,
        metric: "merges",
        window: "7d",
        value,
        source: "linked_repo",
        observedAt: at,
      });
    }
    const latest = await repo.latestMetrics(PROFILE);
    // One row out, the newest. The older observation is still in the table —
    // the history exists so a restatement can be SEEN, not so the page has to
    // fold it.
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({ metric: "merges", window: "7d", value: 38 });
  });

  it("reads every listing's metrics in ONE query, keyed by slug", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    for (const [n, id, value] of [
      [1, PROFILE, 38],
      [2, PROFILE_TWO, 4],
    ] as const) {
      await repo.writeMetric({
        id: asUuid(`c000000${n}-0000-4000-8000-00000000000${n}`),
        profileId: id,
        metric: "merges",
        window: "7d",
        value,
        source: "linked_repo",
        observedAt: "2026-08-25T10:00:00Z",
      });
    }
    // The directory assembles once per cache fill; an N+1 there is an N+1
    // against every cold edge.
    const byslug = await repo.latestMetricsForSlugs(["acme-thing", "other-thing", "nonexistent"]);
    expect(byslug.get("acme-thing")?.[0]?.value).toBe(38);
    expect(byslug.get("other-thing")?.[0]?.value).toBe(4);
    expect(byslug.has("nonexistent")).toBe(false);
  });

  it("appends activity, bounds the summary, and cascades with the listing", async () => {
    await seedPublished();
    await repo.appendActivity({
      id: asUuid("d0000001-0000-4000-8000-000000000001"),
      profileId: PROFILE,
      kind: "merged",
      // Longer than the column's rendered width. Bounded at the write, not
      // trimmed at the read: this text lands on a crawled public page.
      summary: "x".repeat(400),
      actorSubjectId: null,
      source: "linked_repo",
      occurredAt: "2026-08-25T10:00:00Z",
    });
    const [event] = await repo.listActivity(PROFILE);
    expect(event?.kind).toBe("merged");
    expect(event?.summary.length).toBe(200);

    expect(await repo.deleteProfile(ORG, PROFILE)).toBe(true);
    expect(await repo.listActivity(PROFILE)).toEqual([]);
  });
});

// ─── openproduct-commons CT1 — the widened record, against a live engine ───

describe("the widened record (CT1)", () => {
  it("derives stack_canonical from the authored stack, and keeps both", async () => {
    await seedDraft();
    const updated = await repo.updateProfile(ORG, PROFILE, {
      // Two spellings of one language, one thing nobody has heard of.
      stack: ["TypeScript", "ts", "Hand-rolled CRDT", "k8s"],
      updatedBy: "usr_a",
    });
    // Authored: exactly what was written, in order, untouched.
    expect(updated?.stack).toEqual(["TypeScript", "ts", "Hand-rolled CRDT", "k8s"]);
    // Canonical: resolved, de-duplicated, and the unrecognised entry absent.
    // One input produced both columns, so they cannot be set out of step.
    expect(updated?.stackCanonical).toEqual(["typescript", "kubernetes"]);
  });

  it("stores an assigned facet, and clearing it is distinct from never setting it", async () => {
    await seedDraft();
    const assigned = await repo.updateProfile(ORG, PROFILE, {
      category: "dev-tools",
      hosting: "self-hosted",
      pricing: "open-core",
      updatedBy: "usr_a",
    });
    expect(assigned?.category).toBe("dev-tools");
    expect(assigned?.hosting).toBe("self-hosted");
    // PP3 — the third assigned facet takes the same road.
    expect(assigned?.pricing).toBe("open-core");

    // Omitted: unchanged.
    const untouched = await repo.updateProfile(ORG, PROFILE, { tagline: "x", updatedBy: "usr_a" });
    expect(untouched?.category).toBe("dev-tools");

    // Explicit null: cleared. "We do not answer this" is a different
    // statement from "nobody asked", and the write path can make both.
    const cleared = await repo.updateProfile(ORG, PROFILE, { category: null, updatedBy: "usr_a" });
    expect(cleared?.category).toBeNull();
    expect(cleared?.hosting).toBe("self-hosted");
    expect(cleared?.pricing).toBe("open-core");
    const priceless = await repo.updateProfile(ORG, PROFILE, { pricing: null, updatedBy: "usr_a" });
    expect(priceless?.pricing).toBeNull();
    expect(priceless?.hosting).toBe("self-hosted");
  });

  it("a new listing starts with no facets, and canonicalises at create", async () => {
    await seedDraft();
    const profile = await repo.getProfileForOrg(ORG, PROFILE);
    // Never a default bucket. A listing that has not answered has not answered.
    expect(profile?.category).toBeNull();
    expect(profile?.hosting).toBeNull();
    expect(profile?.pricing).toBeNull();
    // The seed writes ["typescript", "cloudflare"]. `typescript` resolves;
    // `cloudflare` does not — the vocabulary knows "Cloudflare Workers", and
    // a bare "Cloudflare" could as easily mean R2, D1 or Pages. Guessing
    // would put this listing in a facet its maintainer did not choose, so it
    // stays authored text and is not counted. Both halves survive.
    expect(profile?.stack).toEqual(["typescript", "cloudflare"]);
    expect(profile?.stackCanonical).toEqual(["typescript"]);
  });

  it("the card carries the widened shape through the visibility filter", async () => {
    await seedPublished();
    await repo.updateProfile(ORG, PROFILE, {
      stack: ["Go", "Postgres"],
      category: "infrastructure",
      updatedBy: "usr_a",
    });
    const [card] = await repo.listPublicCards();
    expect(card?.stackCanonical).toEqual(["go", "postgres"]);
    expect(card?.category).toBe("infrastructure");
    expect(card?.hosting).toBeNull();
    expect(card?.pricing).toBeNull();
  });
});

// ─── openproduct-commons TS0 — trust and safety ───

describe("trust and safety (TS0)", () => {
  const REPORTER = "usr_00000000000000000000000000reprt";
  const OTHER = "usr_0000000000000000000000000other";

  it("absence of a trust row is the answer — no shadow user directory", async () => {
    // The caller applies DEFAULT_TRUST_LEVEL. Writing a row for every subject
    // who signs in would make this table a list of everyone who ever visited.
    expect(await repo.getTrustLevel(REPORTER)).toBeNull();
    const set = await repo.setTrustLevel(REPORTER, "established", "usr_op", "shipped three listings");
    expect(set.level).toBe("established");
    expect(await repo.getTrustLevel(REPORTER)).toMatchObject({ level: "established" });
  });

  it("refuses a level outside the ladder", async () => {
    await expect(
      repo.setTrustLevel(REPORTER, "superuser" as never, "usr_op", null),
    ).rejects.toThrow();
  });

  it("files a report and puts it at the back of the queue", async () => {
    const created = await repo.createReport({
      id: asUuid("d1000000-0000-4000-8000-000000000001"),
      subjectKind: "listing",
      subjectRef: "acme-thing",
      reporterSubjectId: REPORTER,
      reason: "not-the-maintainer",
      detail: "I maintain this and did not list it",
    });
    expect(created?.state).toBe("open");
    const queue = await repo.listOpenReports();
    expect(queue.map((r) => r.subjectRef)).toContain("acme-thing");
    expect(queue[0]?.alsoReported).toBe(0);
  });

  it("refuses the same reporter naming the same subject twice while unresolved", async () => {
    await repo.createReport({
      id: asUuid("d1000000-0000-4000-8000-000000000002"),
      subjectKind: "listing",
      subjectRef: "dupe-thing",
      reporterSubjectId: REPORTER,
      reason: "spam",
    });
    // The same person again is not a second signal — and letting it through
    // would let one motivated reporter drown the queue without tripping any
    // velocity limit. Null, not a throw: the handler answers 200 either way,
    // so an error code cannot be used to probe the queue.
    const dupe = await repo.createReport({
      id: asUuid("d1000000-0000-4000-8000-000000000003"),
      subjectKind: "listing",
      subjectRef: "dupe-thing",
      reporterSubjectId: REPORTER,
      reason: "spam",
    });
    expect(dupe).toBeNull();

    // A DIFFERENT reporter is a real second signal, and triage sees it.
    const second = await repo.createReport({
      id: asUuid("d1000000-0000-4000-8000-000000000004"),
      subjectKind: "listing",
      subjectRef: "dupe-thing",
      reporterSubjectId: OTHER,
      reason: "spam",
    });
    expect(second).not.toBeNull();
    const queue = await repo.listOpenReports();
    const dupes = queue.filter((r) => r.subjectRef === "dupe-thing");
    expect(dupes).toHaveLength(2);
    expect(dupes.every((r) => r.alsoReported === 1)).toBe(true);
  });

  it("resolving is terminal, names who, and cannot be re-resolved", async () => {
    const id = asUuid("d1000000-0000-4000-8000-000000000005");
    await repo.createReport({
      id,
      subjectKind: "profile",
      subjectRef: "@someone",
      reporterSubjectId: OTHER,
      reason: "impersonation",
    });
    const triaged = await repo.triageReport(id, "2026-08-25T10:00:00.000Z");
    expect(triaged?.state).toBe("triaged");

    const resolved = await repo.resolveReport(id, "actioned", "usr_op", "2026-08-25T11:00:00.000Z");
    expect(resolved?.state).toBe("actioned");
    expect(resolved?.resolvedBy).toBe("usr_op");

    // Re-resolving would rewrite who closed it and when — the one thing the
    // appeal path has to be able to trust.
    expect(
      await repo.resolveReport(id, "declined", "usr_other_op", "2026-08-25T12:00:00.000Z"),
    ).toBeNull();
    // And once resolved, the reporter may file again — the subject may have
    // gone wrong a second time.
    const again = await repo.createReport({
      id: asUuid("d1000000-0000-4000-8000-000000000006"),
      subjectKind: "profile",
      subjectRef: "@someone",
      reporterSubjectId: OTHER,
      reason: "impersonation",
    });
    expect(again).not.toBeNull();
  });

  it("a restore is a NEW act, never an edit of the removal", async () => {
    const removed = await repo.appendModerationAct({
      id: asUuid("ac000000-0000-4000-8000-000000000001"),
      subjectKind: "post",
      subjectRef: "post_1",
      act: "remove",
      actorId: "usr_op",
      reason: "abusive toward a named person",
      occurredAt: "2026-08-25T10:00:00.000Z",
    });
    await repo.appendModerationAct({
      id: asUuid("ac000000-0000-4000-8000-000000000002"),
      subjectKind: "post",
      subjectRef: "post_1",
      act: "restore",
      actorId: "usr_op",
      reason: "appeal upheld — the quoted text was the reporter's own",
      reportId: null,
      occurredAt: "2026-08-26T10:00:00.000Z",
    });
    const trail = await repo.listModerationActsForSubject("post", "post_1");
    // BOTH acts survive, newest first. An appeal has to be able to ask what
    // was done and when it was undone; an edited row cannot answer that.
    expect(trail.map((a) => a.act)).toEqual(["restore", "remove"]);
    expect(trail[1]?.id).toBe(removed.id);
  });

  it("no automated removal — automation may only de-index (TS-5)", async () => {
    // Enforced in the database as well as in the contract, so the two cannot
    // disagree. A false positive on removal erases a real person's work from
    // a page search engines have already crawled.
    await expect(
      repo.appendModerationAct({
        id: asUuid("ac000000-0000-4000-8000-000000000003"),
        subjectKind: "listing",
        subjectRef: "acme-thing",
        act: "remove",
        actorId: "automatic",
        reason: "classifier said so",
        occurredAt: "2026-08-25T10:00:00.000Z",
      }),
    ).rejects.toThrow();

    const deindexed = await repo.appendModerationAct({
      id: asUuid("ac000000-0000-4000-8000-000000000004"),
      subjectKind: "listing",
      subjectRef: "acme-thing",
      act: "deindex",
      actorId: "automatic",
      reason: "new maker, first listing, below the automatic bar",
      occurredAt: "2026-08-25T10:00:00.000Z",
    });
    expect(deindexed.actorId).toBe("automatic");
  });

  it("every act carries a reason, because every act is appealable", async () => {
    await expect(
      repo.appendModerationAct({
        id: asUuid("ac000000-0000-4000-8000-000000000005"),
        subjectKind: "listing",
        subjectRef: "acme-thing",
        act: "delist",
        actorId: "usr_op",
        reason: null as unknown as string,
        occurredAt: "2026-08-25T10:00:00.000Z",
      }),
    ).rejects.toThrow();
  });

  it("counts acts by type since a moment — the transparency report's own read", async () => {
    // Each test gets a fresh schema, so this one writes what it counts.
    const acts: Array<[string, string, string]> = [
      ["remove", "usr_op", "2026-08-25T10:00:00.000Z"],
      ["remove", "usr_op", "2026-08-26T10:00:00.000Z"],
      ["restore", "usr_op", "2026-08-27T10:00:00.000Z"],
      // Before the window: the report is per-period, so this one must not count.
      ["delist", "usr_op", "2025-12-01T10:00:00.000Z"],
    ];
    let n = 10;
    for (const [act, actorId, occurredAt] of acts) {
      await repo.appendModerationAct({
        id: asUuid(`ac000000-0000-4000-8000-0000000000${n++}`),
        subjectKind: "listing",
        subjectRef: "acme-thing",
        act,
        actorId,
        reason: "recorded for the transparency report",
        occurredAt,
      });
    }

    const counts = await repo.countModerationActsSince("2026-01-01T00:00:00.000Z");
    const byAct = Object.fromEntries(counts.map((c) => [c.act, c.count]));
    // TS5 GENERATES the public report from this, so what we publish and what
    // we did cannot drift.
    expect(byAct).toEqual({ remove: 2, restore: 1 });
    expect(byAct.delist).toBeUndefined();
  });

  it("a report survives the listing it reported — no FK out of the record", async () => {
    await seedPublished();
    await repo.createReport({
      id: asUuid("d1000000-0000-4000-8000-000000000007"),
      subjectKind: "listing",
      subjectRef: "acme-thing",
      reporterSubjectId: OTHER,
      reason: "malware-or-security",
    });
    expect(await repo.deleteProfile(ORG, PROFILE)).toBe(true);
    const survived = await repo.listReportsForSubject("listing", "acme-thing");
    expect(survived.length).toBeGreaterThan(0);
  });
});


// ─── openproduct-commons SN0 — the signal plane (dormant; the SHAPE is what
//     is proven here, because nothing routes to these tables until SN1) ───

describe("the signal plane (SN0)", () => {
  it("refuses a tier nobody defined, and a verb nobody drew", async () => {
    await seedPublished();
    // The CHECKs matter more than usual here: `source` decides how a number
    // is caveated on the page, and `kind` renders as text on a crawled public
    // page. An ingester inventing either is the failure mode.
    await expect(
      db.exec(
        `INSERT INTO openproduct.signal_sources (profile_id, source)
         VALUES ('${PROFILE}', 'trust_me_bro')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `INSERT INTO openproduct.activity_events (id, profile_id, kind, summary, source, occurred_at)
         VALUES ('99999999-9999-4999-8999-999999999999', '${PROFILE}', 'shipped', 'x', 'linked_repo', now())`,
      ),
    ).rejects.toThrow();
  });

  it("keeps every observation — a correction is a NEW row, not an edit", async () => {
    await seedPublished();
    for (const [n, value, at] of [
      [1, 30, "2026-08-24T10:00:00Z"],
      [2, 38, "2026-08-25T10:00:00Z"],
    ] as const) {
      await db.exec(
        `INSERT INTO openproduct.metrics (id, profile_id, metric, window_key, value, source, observed_at)
         VALUES ('a000000${n}-0000-4000-8000-00000000000${n}', '${PROFILE}', 'merges', '7d', ${value}, 'linked_repo', '${at}')`,
      );
    }
    const all = await db.query(
      `SELECT value FROM openproduct.metrics
        WHERE profile_id = $1 AND metric = 'merges' AND window_key = '7d'
        ORDER BY observed_at DESC`,
      [PROFILE],
    );
    // Both survive. That is what lets EN3's integrity sweep restate a total
    // without erasing the total it restated, and what makes "what did this
    // say on the 24th" answerable.
    expect((all.rows as Array<{ value: string | number }>).map((r) => Number(r.value))).toEqual([
      38, 30,
    ]);
  });

  it("carries the signal plane out with the schema — the teardown unit holds", async () => {
    await seedPublished();
    await db.exec(
      `INSERT INTO openproduct.signal_sources (profile_id, source, locator)
       VALUES ('${PROFILE}', 'linked_repo', 'example/acme-thing')`,
    );
    await db.exec(
      `INSERT INTO openproduct.activity_events (id, profile_id, kind, summary, source, occurred_at)
       VALUES ('99999999-9999-4999-8999-999999999998', '${PROFILE}', 'merged', 'Back off on lock contention', 'linked_repo', now())`,
    );
    // Deleting the listing takes its signals with it: the in-schema cascade,
    // not a cleanup job somebody has to remember to run.
    expect(await repo.deleteProfile(ORG, PROFILE)).toBe(true);
    const left = await db.query(
      `SELECT count(*)::int AS n FROM openproduct.activity_events WHERE profile_id = $1`,
      [PROFILE],
    );
    expect((left.rows[0] as { n: number }).n).toBe(0);
  });
});

// ─── The schema boundary, asserted against the schema itself ───
//
// OD2a's rule — no email, ever, anywhere in this schema — has been a claim
// about each new table in turn, checked by whoever wrote it. openproduct-commons
// adds twelve more tables across nine sub-epics, so the claim becomes a query:
// ask Postgres what columns exist and refuse the ones that must not.
//
// Written against `information_schema` rather than against a list of files,
// which means it covers every table added from here on WITHOUT anyone
// remembering to extend it. That is the whole point.

describe("the openproduct schema boundary (OD2a, extended for openproduct-commons)", () => {
  it("holds no email column, in any table, ever", async () => {
    const found = await db.query(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'openproduct'
          AND (column_name ILIKE '%email%' OR column_name ILIKE '%e_mail%')`,
    );
    // An address that is never stored cannot leak, and this schema feeds pages
    // on a public host.
    expect(found.rows).toEqual([]);
  });

  it("points no foreign key out of the schema — the teardown unit stays one unit", async () => {
    const escaping = await db.query(
      `SELECT tc.table_name, ccu.table_schema AS target_schema
         FROM information_schema.table_constraints tc
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'openproduct'
          AND ccu.table_schema <> 'openproduct'`,
    );
    expect(escaping.rows).toEqual([]);
  });
});

// teardown.md is normative, and row 10 is the reason the schema boundary was
// drawn where it was. Proving the down path here means the claim is a test
// rather than a promise — before a single row exists in production.
describe("openproduct teardown (teardown.md row 10)", () => {
  it("drops the whole schema in one statement, with data in it", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.setMaintainers(PROFILE, [{ subjectId: "usr_a" }]);
    // CT0's tables carry rows too — the drop is one statement with the whole
    // catalog substrate in it, not just OD's original three tables.
    await db.exec(
      `INSERT INTO openproduct.facets (id, label, kind, cardinality) VALUES ('category','Category','assigned','single')`,
    );
    await db.exec(
      `INSERT INTO openproduct.facet_values (facet_id, value, label) VALUES ('category','dev-tools','Dev tools')`,
    );
    await db.exec(
      `INSERT INTO openproduct.facet_counts (facet_id, value, count, computed_at) VALUES ('category','dev-tools',1, now())`,
    );

    await db.exec(`DROP SCHEMA openproduct CASCADE`);

    const left = await db.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'openproduct'`,
    );
    expect(left.rows).toEqual([]);
  });

  it("re-applies cleanly after the drop — the migration is idempotent forward", async () => {
    await seedDraft();
    await db.exec(`DROP SCHEMA openproduct CASCADE`);
    for (const m of MIGRATIONS) await db.exec(readFileSync(m, "utf-8"));
    for (const m of MIGRATIONS) await db.exec(readFileSync(m, "utf-8"));

    expect(await repo.listPublicCards()).toEqual([]);
    await seedDraft();
    expect(await repo.getProfileForOrg(ORG, PROFILE)).not.toBeNull();
  });
});

// ─── openproduct-home OH0 — the contributor model, against the real engine ───
