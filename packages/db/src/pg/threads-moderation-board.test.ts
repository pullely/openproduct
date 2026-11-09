// The openproduct repository against a live engine — threads and posts, the discussion reads and writes, the demand count, notifications, flags, the board, the feed's window.
//
// CB0–CB2's threads, posts and demand, NF0's notifications and what cannot be stored, TS4's flags and what a machine may do, LC3's launch board and OL2's feed window.
//
// Cut from `repository-pg.test.ts` at openproduct-verification OV3, verbatim:
// the engine, the ids and the two seeds come from `./harness.js`, which
// restores the ladder's template per test instead of re-applying fifty
// migrations. Nothing a test asserts changed; what it costs did.

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { sql, repo, ORG, PROJECT, PROJECT_TWO, PROFILE, PROFILE_TWO, OPENING, ACTOR, ADMIN, NOW, EN3_REASONS, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

describe("openproduct — threads and posts, dormant (openproduct-commons CB0)", () => {
  const THREAD = asUuid("dddddddd-1111-4111-8111-dddddddddddd");
  const POST = asUuid("eeeeeeee-2222-4222-8222-eeeeeeeeeeee");

  /**
   * CB0 routes nothing, so there is no repository method to exercise. What is
   * pinned here is the SCHEMA — every constraint the contract's rules rely on
   * — because a CHECK that does not exist is a rule that lives only in
   * TypeScript, and CB1 will be writing to these tables from a surface
   * strangers can reach.
   */
  async function insertThread(over: Record<string, unknown> = {}) {
    const row = {
      id: THREAD,
      profile_id: PROFILE,
      tag: "question",
      title: "How do I run the tests?",
      author_subject_id: ACTOR,
      state: "open",
      answer_post_id: null,
      ...over,
    };
    return sql.execute(
      `INSERT INTO openproduct.threads
         (id, profile_id, tag, title, author_subject_id, state, answer_post_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.id, row.profile_id, row.tag, row.title, row.author_subject_id, row.state, row.answer_post_id],
    );
  }

  it("refuses a tag outside CB-3's closed six", async () => {
    await seedPublished();
    await expect(insertThread({ tag: "shitposting" })).rejects.toThrow();
    await expect(insertThread({ tag: "question" })).resolves.toBeDefined();
  });

  it("refuses an ANSWERED thread that names no answer, and the reverse", async () => {
    await seedPublished();
    // The two halves cannot disagree, so no read has to guess which is true.
    await expect(insertThread({ state: "answered" })).rejects.toThrow();
    await expect(insertThread({ state: "open", answer_post_id: POST })).rejects.toThrow();
  });

  it("refuses an unsigned thread — CB-2 has no anonymous path", async () => {
    await seedPublished();
    await expect(insertThread({ author_subject_id: null })).rejects.toThrow();
  });

  it("refuses an empty post and one past the body ceiling", async () => {
    await seedPublished();
    await insertThread();
    const post = (body: string, id = POST) =>
      sql.execute(
        `INSERT INTO openproduct.posts (id, thread_id, author_subject_id, body) VALUES ($1, $2, $3, $4)`,
        [id, THREAD, ACTOR, body],
      );
    await expect(post("")).rejects.toThrow();
    await expect(post("x".repeat(8001))).rejects.toThrow();
    await expect(post("A real answer.")).resolves.toBeDefined();
  });

  it("keeps TS3's axis on a post, in the same shape as a listing", async () => {
    await seedPublished();
    await insertThread();
    // A removed post renders as removed rather than vanishing: a reply that
    // disappears makes the replies around it unreadable.
    await expect(
      sql.execute(
        `INSERT INTO openproduct.posts (id, thread_id, author_subject_id, body, moderation_state, moderated_at)
         VALUES ($1, $2, $3, $4, 'removed', NULL)`,
        [POST, THREAD, ACTOR, "gone"],
      ),
    ).rejects.toThrow();
  });

  it("takes a thread's posts with it when the listing is purged", async () => {
    await seedPublished();
    await insertThread();
    await sql.execute(
      `INSERT INTO openproduct.posts (id, thread_id, author_subject_id, body) VALUES ($1, $2, $3, $4)`,
      [POST, THREAD, ACTOR, "hello"],
    );
    await sql.execute(`DELETE FROM openproduct.profiles WHERE id = $1`, [PROFILE]);
    const left = await sql.execute<{ n: string }>(`SELECT count(*) AS n FROM openproduct.posts`, []);
    expect(Number(left.rows[0]!.n)).toBe(0);
  });
});

describe("openproduct — the discussion reads and writes (openproduct-commons CB1)", () => {
  const THREAD = asUuid("dddddddd-3333-4333-8333-dddddddddddd");
  const POST_A = asUuid("eeeeeeee-4444-4444-8444-eeeeeeeeeeee");
  const POST_B = asUuid("ffffffff-5555-4555-8555-ffffffffffff");
  const LATER = "2026-08-17T13:00:00.000Z";

  async function seedThread(tag = "question") {
    await repo.createThread({
      id: THREAD,
      profileId: PROFILE,
      tag,
      title: "How do I run the tests?",
      authorSubjectId: ACTOR,
      at: NOW,
    });
    return repo.createPost({ id: POST_A, threadId: THREAD, authorSubjectId: ACTOR, body: "Try pnpm test.", at: NOW });
  }

  it("lists a listing's threads with a live post count", async () => {
    await seedPublished();
    await seedThread();
    const threads = await repo.listThreads(PROFILE);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.postCount).toBe(1);
    expect(threads[0]!.title).toBe("How do I run the tests?");
  });

  it("filters by CB-3's tag", async () => {
    await seedPublished();
    await seedThread("design");
    expect(await repo.listThreads(PROFILE, "design")).toHaveLength(1);
    expect(await repo.listThreads(PROFILE, "governance")).toEqual([]);
  });

  // TS3 meets CB1: the rows survive, and nothing amplifies them.
  it("shows no discussions on a DELISTED listing, without deleting them", async () => {
    await seedPublished();
    await seedThread();
    expect(await repo.listThreads(PROFILE)).toHaveLength(1);

    await repo.appendModerationAct({
      id: asUuid("11111111-9999-4999-8999-111111111111"),
      subjectKind: "listing",
      subjectRef: "acme-thing",
      act: "delist",
      actorId: ADMIN,
      reason: "off topic for this directory",
      reportId: null,
      occurredAt: NOW,
    });
    await repo.setListingModerationState({
      slug: "acme-thing",
      state: "delisted",
      at: NOW,
      actId: asUuid("11111111-9999-4999-8999-111111111111"),
      legalFrom: ["visible"],
    });

    expect(await repo.listThreads(PROFILE)).toEqual([]);
    expect(await repo.getThread(THREAD)).toBeNull();
    // The thread is still THERE — a direct count proves nothing was deleted.
    const rows = await sql.execute<{ n: string }>(`SELECT count(*) AS n FROM openproduct.threads`, []);
    expect(Number(rows.rows[0]!.n)).toBe(1);
  });

  // THE LOCK IS ENFORCED IN THE WRITE, not by a handler check that races.
  it("refuses a post to a locked thread, in SQL", async () => {
    await seedPublished();
    await seedThread();
    expect(await repo.setThreadState(THREAD, "locked", ["open", "answered"])).toBe(true);

    const refused = await repo.createPost({
      id: POST_B,
      threadId: THREAD,
      authorSubjectId: ACTOR,
      body: "one more",
      at: LATER,
    });
    expect(refused).toBeNull();
    expect((await repo.listPosts(THREAD))).toHaveLength(1);
  });

  it("moves last_post_at with the post, so the list orders without a subquery", async () => {
    await seedPublished();
    await seedThread();
    await repo.createPost({ id: POST_B, threadId: THREAD, authorSubjectId: ADMIN, body: "It worked.", at: LATER });
    const threads = await repo.listThreads(PROFILE);
    expect(threads[0]!.lastPostAt).toBe(LATER);
    expect(threads[0]!.postCount).toBe(2);
  });

  it("marks an answer, and refuses to name a post from another thread", async () => {
    await seedPublished();
    await seedThread();
    expect(await repo.markAnswer(THREAD, POST_B)).toBe(false);
    expect(await repo.markAnswer(THREAD, POST_A)).toBe(true);
    const thread = await repo.getThread(THREAD);
    expect(thread?.state).toBe("answered");
  });

  // TS-3 on a reply.
  it("keeps a removed post in place and drops its body IN SQL", async () => {
    await seedPublished();
    await seedThread();
    await repo.setPostModerationState(POST_A, "removed", NOW);

    const posts = await repo.listPosts(THREAD);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.state).toBe("removed");
    // Dropped by the query, not by a caller who remembered to check — so a
    // handler that forgot could not leak it.
    expect(posts[0]!.body).toBe("");
    // And the thread's count no longer includes it.
    expect((await repo.listThreads(PROFILE))[0]!.postCount).toBe(0);
  });

  it("un-answers a thread when it is removed", async () => {
    await seedPublished();
    await seedThread();
    await repo.markAnswer(THREAD, POST_A);
    expect(await repo.setThreadState(THREAD, "removed", ["open", "answered", "locked"])).toBe(true);
    // Leaving the answer set would keep a removed post named as the answer to
    // a question nobody can read.
    const rows = await sql.execute<{ answer_post_id: string | null }>(
      `SELECT answer_post_id FROM openproduct.threads WHERE id = $1`,
      [THREAD],
    );
    expect(rows.rows[0]!.answer_post_id).toBeNull();
  });
});

describe("openproduct — the demand count (openproduct-commons CB2)", () => {
  it("counts only PENDING offers, in JR's own vocabulary", async () => {
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
    // JR'''s OWN WORDS — approved/denied, not accepted/declined. The CHECK
    // refused the invented pair, which is exactly what it is for: this table
    // mirrors membership.join_requests so the projection cannot hold a state
    // the source of truth does not have (CB-5).
    const statuses = ["pending", "pending", "approved", "denied"] as const;
    for (const [i, status] of statuses.entries()) {
      const id = asUuid(`aaaaaaaa-0000-4000-8000-00000000000${i}`);
      await repo.recordApplication({
        id,
        subjectId: `usr_${i}`.padEnd(36, "0"),
        profileId: PROFILE,
        roleOpeningId: OPENING,
        jrRequestRef: `jr_${i}`,
      });
      if (status !== "pending") await repo.setApplicationStatusByRequestRef(`jr_${i}`, status);
    }

    const demand = await repo.countOpeningDemand(PROFILE);
    expect(demand).toHaveLength(1);
    // An approved or denied offer is not somebody waiting.
    expect(demand[0]!.pending).toBe(2);
    expect(demand[0]!.openedAt).toBeTruthy();
  });

  it("returns a row for an opening nobody has offered on", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({
      id: OPENING,
      profileId: PROFILE,
      title: "Nobody yet",
      description: null,
      commitment: null,
      status: "open",
      sortOrder: 0,
    });
    const demand = await repo.countOpeningDemand(PROFILE);
    // A LEFT JOIN, so the opening still appears with zero — the "nobody yet"
    // branch needs the opening's age, which a row is the only way to carry.
    expect(demand).toEqual([expect.objectContaining({ roleOpeningId: OPENING, pending: 0 })]);
  });
});

describe("openproduct — notifications, and what cannot be stored (openproduct-commons CB4)", () => {
  const NTHREAD = asUuid("dddddddd-7777-4777-8777-dddddddddddd");
  const NPOST = asUuid("eeeeeeee-8888-4888-8888-eeeeeeeeeeee");
  const OTHER_SUBJECT = "usr_ffffffffffffffffffffffffffffffff";

  async function seedConversation() {
    await seedPublished();
    await repo.createThread({
      id: NTHREAD,
      profileId: PROFILE,
      tag: "question",
      title: "A question",
      authorSubjectId: ACTOR,
      at: NOW,
    });
    await repo.createPost({
      id: NPOST,
      threadId: NTHREAD,
      authorSubjectId: OTHER_SUBJECT,
      body: "An answer.",
      at: NOW,
    });
  }

  it("derives participants from the thread and its posts — no subscription table", async () => {
    await seedConversation();
    const participants = await repo.listThreadParticipants(NTHREAD);
    expect(participants.sort()).toEqual([ACTOR, OTHER_SUBJECT].sort());
  });

  it("keeps somebody a participant after their post is removed", async () => {
    // Your reply being taken down does not take you out of a conversation you
    // were in, and being dropped from it silently is a second punishment
    // nobody decided on.
    await seedConversation();
    await repo.setPostModerationState(NPOST, "removed", NOW);
    expect((await repo.listThreadParticipants(NTHREAD)).sort()).toEqual(
      [ACTOR, OTHER_SUBJECT].sort(),
    );
  });

  it("treats an absent preference row as NOTIFY", async () => {
    // 1330's posture: a row per signed-in subject would make this a shadow
    // user directory. Only somebody who changed the default appears at all.
    expect(await repo.getNotificationPref(ACTOR)).toBe(false);
    const mutes = await repo.listMutes(NTHREAD, [ACTOR, OTHER_SUBJECT]);
    expect(mutes.global).toEqual([]);
  });

  it("records a mute at thread level and at global level", async () => {
    await seedConversation();
    await repo.setThreadMute(ACTOR, NTHREAD, true);
    await repo.setNotificationPref(OTHER_SUBJECT, true);

    const mutes = await repo.listMutes(NTHREAD, [ACTOR, OTHER_SUBJECT]);
    expect(mutes.thread).toEqual([ACTOR]);
    expect(mutes.global).toEqual([OTHER_SUBJECT]);

    expect(await repo.isThreadMuted(ACTOR, NTHREAD)).toBe(true);
    await repo.setThreadMute(ACTOR, NTHREAD, false);
    expect(await repo.isThreadMuted(ACTOR, NTHREAD)).toBe(false);
  });

  // THE PROPERTY THE SCHEMA ENFORCES, not the caller.
  it("queues once per event per person, and refuses the second attempt", async () => {
    await seedConversation();
    const first = await repo.queueNotification({
      id: asUuid("11111111-8888-4888-8888-111111111111"),
      subjectId: ACTOR,
      kind: "reply",
      threadId: NTHREAD,
      eventRef: `reply:${NPOST}`,
    });
    const second = await repo.queueNotification({
      id: asUuid("22222222-8888-4888-8888-222222222222"),
      subjectId: ACTOR,
      kind: "reply",
      threadId: NTHREAD,
      eventRef: `reply:${NPOST}`,
    });
    // A retry, a redelivered seam event and two racing workers all land here.
    expect(first).toBe(true);
    expect(second).toBe(false);

    const rows = await sql.execute<{ n: string }>(
      `SELECT count(*) AS n FROM openproduct.notification_outbox`,
      [],
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);
  });

  it("still queues the SAME event for a different person", async () => {
    await seedConversation();
    const ref = `reply:${NPOST}`;
    expect(
      await repo.queueNotification({
        id: asUuid("11111111-9999-4999-8999-111111111111"),
        subjectId: ACTOR,
        kind: "reply",
        threadId: NTHREAD,
        eventRef: ref,
      }),
    ).toBe(true);
    expect(
      await repo.queueNotification({
        id: asUuid("22222222-9999-4999-8999-222222222222"),
        subjectId: OTHER_SUBJECT,
        kind: "reply",
        threadId: NTHREAD,
        eventRef: ref,
      }),
    ).toBe(true);
  });

  // I3, as a schema fact.
  it("has NO COLUMN anywhere in the notification tables that could hold an address", async () => {
    const cols = await sql.execute<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'openproduct'
          AND table_name IN ('notification_outbox', 'notification_prefs', 'thread_mutes')`,
      [],
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names.length).toBeGreaterThan(0);
    // A schema that cannot hold an address cannot leak one, and cannot grow a
    // "just this once" export either.
    for (const forbidden of ["email", "address", "phone", "push_token", "recipient", "to_address"]) {
      expect(names).not.toContain(forbidden);
    }
  });
});

describe("openproduct — flags, and what a machine may do (openproduct-commons TS4)", () => {
  const F1 = asUuid("aaaaaaaa-4444-4444-8444-aaaaaaaaaaa1");
  const F2 = asUuid("aaaaaaaa-4444-4444-8444-aaaaaaaaaaa2");
  const F3 = asUuid("aaaaaaaa-4444-4444-8444-aaaaaaaaaaa3");
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const LATER = "2026-08-17T13:00:00.000Z";

  const raise = (id: string, kind: string, ref: string, consequence: string, at = NOW, once = false) =>
    repo.raiseFlag({
      id: id as never,
      kind,
      subjectKind: "listing",
      subjectRef: ref,
      evidence: "4 filler words in 80, and no identifier anywhere in the text.",
      consequence,
      at,
      once,
    });

  it("collapses a re-raise into the flag already open", async () => {
    expect(await raise(F1, "filler", "acme-thing", "deindex")).toMatchObject({ state: "open" });
    // The sweep re-raises every finding on every run. Without this, one empty
    // pitch would file a fresh queue row every six hours forever, and a queue
    // that grows by itself is a queue nobody reads.
    expect(await raise(F2, "filler", "acme-thing", "deindex", LATER)).toBeNull();
    expect(await repo.listOpenFlags()).toHaveLength(1);
  });

  it("lets a later recurrence raise a fresh flag once the first is resolved", async () => {
    await raise(F1, "filler", "acme-thing", "deindex");
    await repo.resolveFlag(F1, "dismissed", ADMIN, NOW);
    // A listing flagged, dismissed, rewritten and flagged again is a NEW
    // observation. Suppressing it would make dismissal permanent immunity,
    // which is not what a triager meant by "the check was wrong".
    expect(await raise(F2, "filler", "acme-thing", "deindex", LATER)).toMatchObject({
      state: "open",
    });
  });

  it("raises a frozen-history kind ONCE, dismissals included", async () => {
    // A cohort's accounts have already gone quiet; a launch has already
    // happened. The pattern can never change, so re-raising after a dismissal
    // would put the same question in front of a person who has answered it,
    // every six hours, forever.
    await raise(F1, "cohort", "acme-thing", "discount", NOW, true);
    await repo.resolveFlag(F1, "dismissed", ADMIN, LATER);
    expect(await raise(F2, "cohort", "acme-thing", "discount", LATER, true)).toBeNull();
    expect(await repo.listOpenFlags()).toEqual([]);
    // The discount it was raised alongside is untouched — the flag is the
    // notification, not the defence. Suppressing a repeat costs a telling,
    // not a consequence.
  });

  it("keeps different kinds about the same thing apart", async () => {
    await raise(F1, "filler", "acme-thing", "deindex");
    await raise(F2, "cohort", "acme-thing", "discount");
    // Two checks noticed two different things. Collapsing them would lose one.
    expect((await repo.listOpenFlags()).map((f) => f.kind).sort()).toEqual(["cohort", "filler"]);
  });

  it("works the queue oldest first", async () => {
    await raise(F1, "cohort", "acme-thing", "discount", LATER);
    await raise(F2, "filler", "other-thing", "deindex", NOW);
    // A queue worked newest-first never reaches its tail, and the flags it
    // never reaches are about the listings nobody else is watching.
    expect((await repo.listOpenFlags()).map((f) => f.subjectRef)).toEqual([
      "other-thing",
      "acme-thing",
    ]);
  });

  it("resolves from open only, and names who did it", async () => {
    await raise(F1, "filler", "acme-thing", "deindex");
    const dismissed = await repo.resolveFlag(F1, "dismissed", ADMIN, LATER);
    expect(dismissed).toMatchObject({ state: "dismissed", resolvedBy: ADMIN });
    // Terminal. Re-resolving would rewrite who closed it and when, and the
    // dismissal count is a number the estate publishes about itself.
    expect(await repo.resolveFlag(F1, "actioned", ACTOR, LATER)).toBeNull();
    expect(await repo.listOpenFlags()).toEqual([]);
  });

  it("counts dismissals, because that is the false-positive rate", async () => {
    await raise(F1, "filler", "acme-thing", "deindex");
    await raise(F2, "filler", "other-thing", "deindex");
    await raise(F3, "cohort", "acme-thing", "discount");
    await repo.resolveFlag(F1, "dismissed", ADMIN, LATER);
    await repo.resolveFlag(F2, "actioned", ADMIN, LATER);

    const disclosure = await repo.flagDisclosure("2026-08-01T00:00:00.000Z");
    expect(disclosure).toEqual([
      { kind: "cohort", state: "open", count: 1 },
      { kind: "filler", state: "actioned", count: 1 },
      { kind: "filler", state: "dismissed", count: 1 },
    ]);
    // By kind and outcome, never by subject: it is a report on the checks,
    // not on the people they looked at.
    expect(JSON.stringify(disclosure)).not.toContain("usr_");
  });

  // THE MILESTONE'S CENTRAL GUARANTEE, at the database.
  it("REFUSES a flag whose consequence would remove something", async () => {
    await expect(raise(F1, "filler", "acme-thing", "remove")).rejects.toThrow();
    // And every value the type does allow is accepted, so the CHECK is not
    // simply refusing everything.
    await expect(raise(F1, "filler", "acme-thing", "deindex")).resolves.toBeTruthy();
    await expect(raise(F2, "cohort", "other-thing", "discount")).resolves.toBeTruthy();
    await expect(raise(F3, "brigade", "third-thing", "queue-only")).resolves.toBeTruthy();
  });

  it("REFUSES an automated removal in the ledger, and permits an automated de-index", async () => {
    // 1330's CHECK, exercised from the path TS4 actually uses. This is the
    // rule the milestone was most likely to erode, so it is asserted from the
    // milestone that would have eroded it.
    await expect(
      repo.appendModerationAct({
        id: F1,
        subjectKind: "listing",
        subjectRef: "acme-thing",
        act: "remove",
        actorId: "automatic",
        reason: "a machine decided",
        reportId: null,
        occurredAt: NOW,
      }),
    ).rejects.toThrow();

    await expect(
      repo.appendModerationAct({
        id: F2,
        subjectKind: "listing",
        subjectRef: "acme-thing",
        act: "deindex",
        actorId: "automatic",
        reason: "the pitch says nothing; the listing remains published",
        reportId: null,
        occurredAt: NOW,
      }),
    ).resolves.toBeTruthy();
  });

  it("refuses a flag with no evidence, because a flag nobody can check is noise", async () => {
    await expect(
      repo.raiseFlag({
        id: F1,
        kind: "filler",
        subjectKind: "listing",
        subjectRef: "acme-thing",
        evidence: "   ",
        consequence: "deindex",
        at: NOW,
      }),
    ).rejects.toThrow();
  });

  it("reads only listings that are still indexable", async () => {
    await seedPublished();
    await repo.updateProfile(ORG, PROFILE, {
      pitchBody: "A ".repeat(60),
      pitchDigest: "sha256:long",
      updatedBy: ACTOR,
    });
    expect((await repo.listPitchesForDefence(100)).map((p) => p.slug)).toEqual(["acme-thing"]);

    // De-indexing is this detector's ONLY consequence, so once it has been
    // applied there is nothing left that could happen to the listing. Reading
    // it again every six hours would spend the sweep's budget re-deciding a
    // decided thing.
    expect(await repo.setListingIndexable(PROFILE, false)).toBe(true);
    expect(await repo.listPitchesForDefence(100)).toEqual([]);
    // Idempotent: a second call changes nothing and says so.
    expect(await repo.setListingIndexable(PROFILE, false)).toBe(false);
  });

  it("carries each subject's first act here, never their age anywhere else", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await repo.endorse(PROFILE, ADA, "confirmed", "2026-08-10T00:00:00.000Z");
    await repo.endorse(PROFILE_TWO, ADA, "confirmed", NOW);

    const rows = await repo.listActsForCohorts("2026-08-01T00:00:00.000Z", 100);
    expect(rows).toHaveLength(2);
    // OPC-6: we do not know how old an Orunbase account is and do not ask.
    // What we know is when somebody started acting here — and it is measured
    // over the whole table, not the window, so a year-old account is not new
    // because today's window starts today.
    for (const row of rows) {
      expect(row.subjectFirstSeenAt).toBe("2026-08-10T00:00:00.000Z");
    }
  });

  it("SEES PENDING endorsements, which is the whole point of the cohort read", async () => {
    // THE TRAP THIS EXISTS TO CATCH. Filtering to `confirmed` — matching
    // countEndorsements, which is the obvious thing to copy — would blind the
    // detector to its own target: a set of accounts made that morning has not
    // cleared TS1's eligibility ladder, so a purchased brigade's endorsements
    // are PENDING. Discounting one is a no-op on the total; the PATTERN is
    // the evidence, and the flag a person reads is the point.
    await seedPublished();
    await repo.endorse(PROFILE, BOB, "pending", NOW);
    expect((await repo.listActsForCohorts("2026-08-01T00:00:00.000Z", 100)).map((r) => r.subjectId))
      .toEqual([BOB]);
    // And it still skips a withdrawn one, which already counts for nothing
    // and whose pattern is spent.
    await repo.withdrawEndorsement(PROFILE, BOB, LATER);
    expect(await repo.listActsForCohorts("2026-08-01T00:00:00.000Z", 100)).toEqual([]);
  });

  it("the board's partition counts only what the board ranks", async () => {
    // The mirror of the case above, and the opposite answer, because the
    // question is different: this partitions what the BOARD RANKS, and the
    // board ranks the counted total (EN2) — confirmed endorsements. A share
    // computed over a different set than the thing it describes is a number
    // that means nothing.
    await seedPublished();
    await repo.scheduleLaunch({
      id: F1,
      profileId: PROFILE,
      versionLabel: "1.0",
      scheduledFor: "2026-08-17T11:00:00.000Z",
      scheduledBy: ACTOR,
    });
    await repo.fireDueLaunches(NOW);
    await repo.endorse(PROFILE, ADA, "confirmed", NOW);
    await repo.endorse(PROFILE, BOB, "pending", NOW);

    const launches = await repo.listLaunchEndorsements("2026-08-01T00:00:00.000Z");
    expect(launches[0]!.endorsements.map((e) => e.subjectId)).toEqual([ADA]);
  });

  it("returns a live launch even when nobody endorsed it", async () => {
    await seedPublished();
    await repo.scheduleLaunch({
      id: F1,
      profileId: PROFILE,
      versionLabel: "1.0",
      scheduledFor: "2026-08-17T11:00:00.000Z",
      scheduledBy: ACTOR,
    });
    await repo.fireDueLaunches(NOW);

    const launches = await repo.listLaunchEndorsements("2026-08-01T00:00:00.000Z");
    // A LEFT JOIN, so a launch nobody endorsed still comes back. It is a real
    // and common state, and a launch that vanished from the sweep because it
    // had no endorsements would be indistinguishable from one never read.
    expect(launches).toHaveLength(1);
    expect(launches[0]).toMatchObject({ slug: "acme-thing", endorsements: [] });

    await repo.endorse(PROFILE, ADA, "confirmed", NOW);
    const withOne = await repo.listLaunchEndorsements("2026-08-01T00:00:00.000Z");
    expect(withOne[0]!.endorsements).toEqual([{ subjectId: ADA, subjectFirstSeenAt: NOW }]);
  });

  // ─── the two sweeps, which must not fight ──────────────────────────────

  it("a cohort discount SURVIVES EN3's next sweep", async () => {
    // THE BUG THIS EXISTS TO CATCH, and it is not hypothetical: a cohort is
    // discounted on endorsements at least three days old, which is INSIDE
    // EN3's seven-day window. Before the reason bound, EN3's next run would
    // reverse every cohort discount as one it had not named, TS4 would
    // re-apply it six hours later, and TS5's published counts would flip
    // between the two forever.
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW);
    expect(await repo.discountCohort({
      profileId: PROFILE,
      subjectIds: [ADA],
      reason: "cohort",
      decidedBy: "automatic",
      at: NOW,
    })).toBe(1);
    expect((await repo.countEndorsements(PROFILE, NOW)).total).toBe(0);

    // EN3 sweeps its own window and names nobody.
    const swept = await repo.restateIntegrity({
      findings: [],
      windowStart: "2026-08-01T00:00:00.000Z",
      reasons: EN3_REASONS,
      decidedBy: "automatic",
      at: LATER,
    });
    expect(swept).toMatchObject({ applied: 0, reversed: 0 });
    expect((await repo.countEndorsements(PROFILE, NOW)).total).toBe(0);
  });

  it("a cohort discount NEVER overwrites a stronger opinion already recorded", async () => {
    await seedPublished();
    await repo.endorse(PROFILE, ADA, "confirmed", NOW);
    await repo.restateIntegrity({
      findings: [{ profileId: PROFILE, subjectId: ADA, reason: "ring" }],
      windowStart: "2026-08-01T00:00:00.000Z",
      reasons: EN3_REASONS,
      decidedBy: "automatic",
      at: NOW,
    });

    // Nothing applied, and the reason is untouched. Rewriting it to `cohort`
    // would have EN3 rewrite it back an hour later — two sweeps describing
    // one endorsement two ways on alternating runs, in a number we publish.
    expect(await repo.discountCohort({
      profileId: PROFILE,
      subjectIds: [ADA],
      reason: "cohort",
      decidedBy: "automatic",
      at: LATER,
    })).toBe(0);
    const rows = await sql.execute<{ reason: string }>(
      `SELECT reason FROM openproduct.endorsement_integrity WHERE profile_id = $1 AND subject_id = $2`,
      [PROFILE, ADA],
    );
    expect(rows.rows[0]!.reason).toBe("ring");
  });

  it("EN3 still reverses its OWN discounts", async () => {
    // The bound must not have switched reversal off altogether — that would
    // leave a broken-up ring discounted forever, which is the failure EN3's
    // reversal half exists to prevent.
    await seedPublished();
    await repo.endorse(PROFILE, BOB, "confirmed", NOW);
    const window = { windowStart: "2026-08-01T00:00:00.000Z", reasons: EN3_REASONS, decidedBy: "automatic" };
    await repo.restateIntegrity({
      ...window,
      findings: [{ profileId: PROFILE, subjectId: BOB, reason: "ring" }],
      at: NOW,
    });
    expect((await repo.countEndorsements(PROFILE, NOW)).total).toBe(0);
    expect(await repo.restateIntegrity({ ...window, findings: [], at: LATER })).toMatchObject({
      reversed: 1,
    });
    expect((await repo.countEndorsements(PROFILE, NOW)).total).toBe(1);
  });
});

describe("openproduct — the launch board (openproduct-commons LC3)", () => {
  const B1 = asUuid("bbbbbbbb-3333-4333-8333-bbbbbbbbbbb1");
  const B2 = asUuid("bbbbbbbb-3333-4333-8333-bbbbbbbbbbb2");
  const M1 = asUuid("cccccccc-3333-4333-8333-ccccccccccc1");
  const M2 = asUuid("cccccccc-3333-4333-8333-ccccccccccc2");
  const M3 = asUuid("cccccccc-3333-4333-8333-ccccccccccc3");
  const M4 = asUuid("cccccccc-3333-4333-8333-ccccccccccc4");
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const DAY = "2026-08-17";
  const START = "2026-08-17T00:00:00.000Z";
  const END = "2026-08-18T00:00:00.000Z";

  /** A published listing with a launch that has already gone live on DAY. */
  async function seedLaunched(
    id = PROFILE,
    projectId = PROJECT,
    slug = "acme-thing",
    launchId = B1,
    at = "2026-08-17T09:00:00.000Z",
  ) {
    await seedPublished(id, projectId, slug);
    await repo.scheduleLaunch({
      id: launchId,
      profileId: id,
      versionLabel: "1.0",
      scheduledFor: at,
      scheduledBy: ACTOR,
    });
    await repo.fireDueLaunches(NOW);
  }

  it("returns a day's launches with the RAW endorsements behind them", async () => {
    await seedLaunched();
    await repo.endorse(PROFILE, ADA, "confirmed", "2026-08-17T10:00:00.000Z");

    const rows = await repo.listLaunchesOnDay(START, END);
    expect(rows).toHaveLength(1);
    // RAW, not pre-counted: `boardEligible` (TS4) owns what "existed before
    // the launch" means, and a second copy of that rule in SQL is how the
    // published sentence and the actual order come to disagree.
    expect(rows[0]).toMatchObject({ slug: "acme-thing", versionLabel: "1.0" });
    expect(rows[0]!.endorsements).toEqual([
      { subjectId: ADA, subjectFirstSeenAt: "2026-08-17T10:00:00.000Z" },
    ]);
  });

  it("counts only the endorsements that landed DURING the day", async () => {
    await seedLaunched();
    await repo.endorse(PROFILE, ADA, "confirmed", "2026-08-17T10:00:00.000Z");
    await repo.endorse(PROFILE, BOB, "confirmed", "2026-08-18T10:00:00.000Z");

    // LC1 made this argument for the digest week and it is the same one: a
    // board for a past day read today must answer about the hours it names.
    const rows = await repo.listLaunchesOnDay(START, END);
    expect(rows[0]!.endorsements.map((e) => e.subjectId)).toEqual([ADA]);
  });

  it("applies EN3's discount, so the board and the listing agree", async () => {
    await seedLaunched();
    await repo.endorse(PROFILE, ADA, "confirmed", "2026-08-17T10:00:00.000Z");
    await repo.endorse(PROFILE, BOB, "confirmed", "2026-08-17T11:00:00.000Z");
    await repo.restateIntegrity({
      findings: [{ profileId: PROFILE, subjectId: BOB, reason: "ring" }],
      windowStart: "2026-08-01T00:00:00.000Z",
      reasons: EN3_REASONS,
      decidedBy: "automatic",
      at: NOW,
    });

    // The discount is not the BOARD's rule — it is EN3's, already true of
    // every other surface. A board that counted discounted endorsements would
    // disagree with the listing's own page about one number.
    const rows = await repo.listLaunchesOnDay(START, END);
    expect(rows[0]!.endorsements.map((e) => e.subjectId)).toEqual([ADA]);
  });

  it("returns a launch nobody endorsed, with nothing", async () => {
    await seedLaunched();
    const rows = await repo.listLaunchesOnDay(START, END);
    // A launch that vanished because it had no endorsements would be
    // indistinguishable from one that never happened. Nothing is a real
    // position and a common one.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.endorsements).toEqual([]);
  });

  it("does not return a launch on a listing that was delisted", async () => {
    await seedLaunched();
    await repo.appendModerationAct({
      id: M1,
      subjectKind: "listing",
      subjectRef: "acme-thing",
      act: "delist",
      actorId: ADMIN,
      reason: "a reason, because an act without one cannot be appealed",
      reportId: null,
      occurredAt: NOW,
    });
    await repo.setListingModerationState({
      slug: "acme-thing",
      state: "delisted",
      at: NOW,
      actId: M1,
      legalFrom: ["visible"],
    });
    // Delisting means "not amplified here", and a board is amplification.
    expect(await repo.listLaunchesOnDay(START, END)).toEqual([]);
    expect(await repo.listBoardDays(30)).toEqual([]);
  });

  it("indexes the days that hold a live launch, most recent first", async () => {
    await seedLaunched();
    await seedLaunched(PROFILE_TWO, PROJECT_TWO, "other-thing", B2, "2026-08-16T09:00:00.000Z");
    expect(await repo.listBoardDays(30)).toEqual([
      { day: "2026-08-17", launches: 1 },
      { day: "2026-08-16", launches: 1 },
    ]);
  });

  it("writes both figures and stamps board_rank_at", async () => {
    await seedLaunched();
    const written = await repo.writeBoardRanks({
      day: DAY,
      observedAt: NOW,
      ranks: [
        { launchId: B1, profileId: PROFILE, countedId: M1, ineligibleId: M2, counted: 7, ineligible: 3 },
      ],
    });
    expect(written).toBe(1);

    const back = await repo.readBoardRanks(DAY);
    expect(back).toHaveLength(1);
    // BOTH figures: the first decides the position, the second is what makes
    // that position accountable to a maker comparing it against the total on
    // their own page.
    expect(back[0]).toMatchObject({ counted: 7, ineligible: 3, slug: "acme-thing" });
    expect(back[0]!.observedAt).toBe(NOW);

    // LC0 carried this column for LC3 and nothing wrote it until now.
    expect((await repo.getLaunch(B1))!.boardRankAt).toBe(NOW);
  });

  it("a recompute supersedes its predecessor rather than doubling the day", async () => {
    await seedLaunched();
    const write = (ids: [string, string], counted: number, at: string) =>
      repo.writeBoardRanks({
        day: DAY,
        observedAt: at,
        ranks: [
          {
            launchId: B1,
            profileId: PROFILE,
            countedId: ids[0] as never,
            ineligibleId: ids[1] as never,
            counted,
            ineligible: 0,
          },
        ],
      });
    await write([M1, M2], 4, "2026-08-17T10:00:00.000Z");
    await write([M3, M4], 9, "2026-08-17T11:00:00.000Z");

    const back = await repo.readBoardRanks(DAY);
    // An OPEN day is ranked repeatedly. One row per launch comes back, and it
    // is the latest — a board that returned both would render the same launch
    // twice in two positions.
    expect(back).toHaveLength(1);
    expect(back[0]!.counted).toBe(9);
  });

  it("reads back nothing for a day nothing ranked", async () => {
    await seedLaunched();
    // The sweep's "never ranked" probe depends on this being empty rather
    // than throwing, and a board nobody ranked has no "as of" to render.
    expect(await repo.readBoardRanks(DAY)).toEqual([]);
  });

  it("keeps two days' boards apart", async () => {
    await seedLaunched();
    await seedLaunched(PROFILE_TWO, PROJECT_TWO, "other-thing", B2, "2026-08-16T09:00:00.000Z");
    await repo.writeBoardRanks({
      day: DAY,
      observedAt: NOW,
      ranks: [
        { launchId: B1, profileId: PROFILE, countedId: M1, ineligibleId: M2, counted: 5, ineligible: 0 },
      ],
    });
    await repo.writeBoardRanks({
      day: "2026-08-16",
      observedAt: NOW,
      ranks: [
        { launchId: B2, profileId: PROFILE_TWO, countedId: M3, ineligibleId: M4, counted: 2, ineligible: 0 },
      ],
    });

    // The window key is the DAY, which is the whole reason the archive
    // survives: keyed by a duration, tomorrow would overwrite today.
    expect((await repo.readBoardRanks(DAY)).map((r) => r.slug)).toEqual(["acme-thing"]);
    expect((await repo.readBoardRanks("2026-08-16")).map((r) => r.slug)).toEqual(["other-thing"]);
  });
});

describe("openproduct — the launch feed's window (openproduct-launch OL2)", () => {
  const B1 = asUuid("bbbbbbbb-5555-4555-8555-bbbbbbbbbbb1");
  const B2 = asUuid("bbbbbbbb-5555-4555-8555-bbbbbbbbbbb2");
  const DAY = "2026-08-17";
  const DAY_BEFORE = "2026-08-16";
  const NOW = "2026-08-17T12:00:00.000Z";
  const M1 = asUuid("eeeeeeee-5555-4555-8555-eeeeeeee0001");
  const M2 = asUuid("eeeeeeee-5555-4555-8555-eeeeeeee0002");
  const M3 = asUuid("eeeeeeee-5555-4555-8555-eeeeeeee0003");
  const M4 = asUuid("eeeeeeee-5555-4555-8555-eeeeeeee0004");
  const M5 = asUuid("eeeeeeee-5555-4555-8555-eeeeeeee0005");
  const M6 = asUuid("eeeeeeee-5555-4555-8555-eeeeeeee0006");

  async function seedLaunched(
    profileId = PROFILE,
    projectId = PROJECT,
    slug = "acme-thing",
    launchId = B1,
    at = "2026-08-17T09:00:00.000Z",
  ) {
    await seedPublished(profileId, projectId, slug);
    await repo.scheduleLaunch({
      id: launchId,
      profileId,
      versionLabel: "1.0",
      scheduledFor: at,
      scheduledBy: ACTOR,
    });
    await repo.fireDueLaunches(NOW);
  }

  it("returns every day asked for in one call, and nothing else", async () => {
    await seedLaunched();
    await seedLaunched(PROFILE_TWO, PROJECT_TWO, "other-thing", B2, "2026-08-16T09:00:00.000Z");

    // ONE ROUND TRIP FOR THE WHOLE WINDOW. The front page has a read budget
    // of one; seven calls to render one cached document would spend it six
    // times over.
    const rows = await repo.listFeedLaunches([DAY, DAY_BEFORE]);
    expect(rows.map((r) => r.slug).sort()).toEqual(["acme-thing", "other-thing"]);
    expect(rows.find((r) => r.slug === "acme-thing")!.day).toBe(DAY);
    expect(rows.find((r) => r.slug === "other-thing")!.day).toBe(DAY_BEFORE);

    // A day outside the list is not returned, even though it exists.
    expect((await repo.listFeedLaunches([DAY])).map((r) => r.slug)).toEqual(["acme-thing"]);
  });

  it("reads the SWEEP'S OUTPUT and turns it into a position", async () => {
    await seedLaunched();
    await seedLaunched(PROFILE_TWO, PROJECT_TWO, "other-thing", B2, "2026-08-17T10:00:00.000Z");
    await repo.writeBoardRanks({
      day: DAY,
      observedAt: NOW,
      ranks: [
        { launchId: B1, profileId: PROFILE, countedId: M1, ineligibleId: M2, counted: 3, ineligible: 1 },
        { launchId: B2, profileId: PROFILE_TWO, countedId: M3, ineligibleId: M4, counted: 9, ineligible: 0 },
      ],
    });

    const rows = await repo.listFeedLaunches([DAY]);
    const byslug = new Map(rows.map((r) => [r.slug, r]));
    // The order is the BOARD's, from the metric the sweep already wrote —
    // never an aggregate over `endorsements` on the request path (OL-2a).
    expect(byslug.get("other-thing")).toMatchObject({ rank: 1, counted: 9, ineligible: 0 });
    expect(byslug.get("acme-thing")).toMatchObject({ rank: 2, counted: 3, ineligible: 1 });
  });

  it("gives an unranked launch a null position, never zero", async () => {
    await seedLaunched();
    // A day that has just begun has launches the sweep has not reached. A
    // launch that vanished from the feed because a cron was late would be the
    // failure LC0 wrote `missed` to avoid.
    const rows = await repo.listFeedLaunches([DAY]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rank).toBeNull();
    expect(rows[0]!.counted).toBe(0);
  });

  it("ranks within a day, so two days both start at one", async () => {
    await seedLaunched();
    await seedLaunched(PROFILE_TWO, PROJECT_TWO, "other-thing", B2, "2026-08-16T09:00:00.000Z");
    await repo.writeBoardRanks({
      day: DAY,
      observedAt: NOW,
      ranks: [
        { launchId: B1, profileId: PROFILE, countedId: M1, ineligibleId: M2, counted: 2, ineligible: 0 },
      ],
    });
    await repo.writeBoardRanks({
      day: DAY_BEFORE,
      observedAt: NOW,
      ranks: [
        { launchId: B2, profileId: PROFILE_TWO, countedId: M3, ineligibleId: M4, counted: 99, ineligible: 0 },
      ],
    });

    // A quiet day's winner is still its winner. Pooling the window would put
    // yesterday's 99 above today's 2 and imply a comparison the board never
    // made.
    const rows = await repo.listFeedLaunches([DAY, DAY_BEFORE]);
    expect(rows.every((r) => r.rank === 1)).toBe(true);
  });

  it("takes the latest recompute of an open day, not both", async () => {
    await seedLaunched();
    await repo.writeBoardRanks({
      day: DAY,
      observedAt: "2026-08-17T10:00:00.000Z",
      ranks: [
        { launchId: B1, profileId: PROFILE, countedId: M1, ineligibleId: M2, counted: 4, ineligible: 0 },
      ],
    });
    await repo.writeBoardRanks({
      day: DAY,
      observedAt: "2026-08-17T11:00:00.000Z",
      ranks: [
        { launchId: B1, profileId: PROFILE, countedId: M5, ineligibleId: M6, counted: 12, ineligible: 0 },
      ],
    });

    const rows = await repo.listFeedLaunches([DAY]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.counted).toBe(12);
  });

  it("carries the card facts the design's row draws", async () => {
    await seedLaunched();
    const rows = await repo.listFeedLaunches([DAY]);
    // The row shows a licence, topics and a stack beside the name, and every
    // one of them is a fact the card already carried — nothing here is a new
    // public projection.
    expect(rows[0]).toHaveProperty("licence");
    expect(rows[0]).toHaveProperty("category");
    expect(rows[0]!.stack).toEqual(expect.any(Array));
    expect(rows[0]!.roleOpeningCount).toBe(0);
    expect(rows[0]!.commentCount).toBe(0);
  });

  // HB3 — the row's count IS the thread's count: one predicate (visible
  // posts, a thread that is not removed) in two reads, asserted equal.
  it("HB3 — the feed row's comment count equals the thread's visible post count, and the panel's", async () => {
    await seedLaunched();
    const T = asUuid("cccccccc-3333-4333-8333-ccccccccc001");
    const P1 = asUuid("dddddddd-3333-4333-8333-ddddddddd001");
    const P2 = asUuid("dddddddd-3333-4333-8333-ddddddddd002");
    const P3 = asUuid("dddddddd-3333-4333-8333-ddddddddd003");
    await repo.createThread({
      id: T as never,
      profileId: PROFILE,
      tag: "question",
      title: "How do I run this locally?",
      authorSubjectId: ACTOR,
      at: "2026-08-17T10:00:00.000Z",
    });
    await repo.createPost({ id: P1 as never, threadId: T, authorSubjectId: ACTOR, body: "One.", at: "2026-08-17T10:00:00.000Z" });
    await repo.createPost({ id: P2 as never, threadId: T, authorSubjectId: ACTOR, body: "Two.", at: "2026-08-17T11:00:00.000Z" });
    await repo.createPost({ id: P3 as never, threadId: T, authorSubjectId: ACTOR, body: "Gone.", at: "2026-08-17T11:30:00.000Z" });
    await repo.setPostModerationState(P3, "removed", "2026-08-17T11:45:00.000Z");

    const [row] = await repo.listFeedLaunches([DAY]);
    const [thread] = await repo.listThreads(PROFILE, "question");
    const [replied] = await repo.listRecentlyRepliedThreads(3);
    expect(row!.commentCount).toBe(2);
    expect(thread!.postCount).toBe(row!.commentCount);
    expect(replied).toMatchObject({ slug: "acme-thing", title: "How do I run this locally?", postCount: 2 });
    expect(Date.parse(replied!.lastPostAt)).toBeGreaterThan(0);
  });

  it("FO1 — the forum index: two published orders, the six categories, never the launch thread or a draft's", async () => {
    await seedLaunched();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "draft-thing");
    const T1 = asUuid("cccccccc-3333-4333-8333-ccccccccc021");
    const T2 = asUuid("cccccccc-3333-4333-8333-ccccccccc022");
    const T3 = asUuid("cccccccc-3333-4333-8333-ccccccccc023");
    const mk = async (id: string, profileId: string, tag: string, title: string, at: string) => {
      await repo.createThread({ id: id as never, profileId, tag, title, authorSubjectId: ACTOR, at });
    };
    await mk(T1, PROFILE, "question", "First asked", "2026-08-17T08:00:00.000Z");
    await mk(T2, PROFILE, "design", "Then a design note", "2026-08-17T08:30:00.000Z");
    await mk(T3, PROFILE_TWO, "question", "On a draft", "2026-08-17T08:40:00.000Z");
    // The launch thread exists and is never a forum row.
    await repo.ensureLaunchThread({ id: asUuid("cccccccc-3333-4333-8333-ccccccccc024") as never, profileId: PROFILE, title: "Comments on acme-thing", authorSubjectId: ACTOR });
    // Two visible replies on the first, one on the second.
    await repo.createPost({ id: asUuid("dddddddd-3333-4333-8333-ddddddddd021") as never, threadId: T1, authorSubjectId: ACTOR, body: "a", at: "2026-08-17T09:00:00.000Z" });
    await repo.createPost({ id: asUuid("dddddddd-3333-4333-8333-ddddddddd022") as never, threadId: T1, authorSubjectId: ACTOR, body: "b", at: "2026-08-17T09:30:00.000Z" });
    await repo.createPost({ id: asUuid("dddddddd-3333-4333-8333-ddddddddd023") as never, threadId: T2, authorSubjectId: ACTOR, body: "c", at: "2026-08-17T10:00:00.000Z" });

    const latest = await repo.listForumThreads({ tag: null, order: "latest", limit: 10 });
    expect(latest.map((t) => t.title)).toEqual(["Then a design note", "First asked"]);
    expect(latest.every((t) => t.slug === "acme-thing")).toBe(true);
    const replied = await repo.listForumThreads({ tag: null, order: "replied", limit: 10 });
    expect(replied.map((t) => [t.title, t.postCount])).toEqual([["First asked", 2], ["Then a design note", 1]]);
    expect((await repo.listForumThreads({ tag: "question", order: "latest", limit: 10 })).map((t) => t.title)).toEqual(["First asked"]);
    expect(await repo.listForumThreads({ tag: "launch", order: "latest", limit: 10 })).toHaveLength(2);
    expect((await repo.listForumThreads({ tag: null, order: "latest", limit: 1 })).map((t) => t.title)).toEqual(["Then a design note"]);
  });

  it("HB3 — recently replied lists only listed listings with a post, newest reply first, bounded", async () => {
    await seedLaunched();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "draft-thing");
    const T1 = asUuid("cccccccc-3333-4333-8333-ccccccccc011");
    const T2 = asUuid("cccccccc-3333-4333-8333-ccccccccc012");
    const T3 = asUuid("cccccccc-3333-4333-8333-ccccccccc013");
    const mk = async (id: string, profileId: string, title: string, at: string) => {
      await repo.createThread({ id: id as never, profileId, tag: "question", title, authorSubjectId: ACTOR, at });
    };
    await mk(T1, PROFILE, "Older reply", "2026-08-17T08:00:00.000Z");
    await mk(T2, PROFILE, "Newer reply", "2026-08-17T08:30:00.000Z");
    await mk(T3, PROFILE_TWO, "On a draft", "2026-08-17T08:40:00.000Z");
    await repo.createPost({ id: asUuid("dddddddd-3333-4333-8333-ddddddddd011") as never, threadId: T1, authorSubjectId: ACTOR, body: "a", at: "2026-08-17T09:00:00.000Z" });
    await repo.createPost({ id: asUuid("dddddddd-3333-4333-8333-ddddddddd012") as never, threadId: T2, authorSubjectId: ACTOR, body: "b", at: "2026-08-17T10:00:00.000Z" });
    await repo.createPost({ id: asUuid("dddddddd-3333-4333-8333-ddddddddd013") as never, threadId: T3, authorSubjectId: ACTOR, body: "c", at: "2026-08-17T11:00:00.000Z" });
    const rows = await repo.listRecentlyRepliedThreads(3);
    // The draft's thread is invisible; the launch thread has no post; the
    // two question threads come newest reply first.
    expect(rows.map((r) => r.title)).toEqual(["Newer reply", "Older reply"]);
    expect((await repo.listRecentlyRepliedThreads(1)).map((r) => r.title)).toEqual(["Newer reply"]);
  });

  it("refuses a malformed day rather than passing it to the database", async () => {
    await seedLaunched();
    // A day is an ADDRESS. `2026-8-17` and `'; DROP` are both refused here
    // rather than coerced or forwarded.
    expect(await repo.listFeedLaunches(["2026-8-17"])).toEqual([]);
    expect(await repo.listFeedLaunches([])).toEqual([]);
    expect((await repo.listFeedLaunches([DAY, DAY, "nonsense"])).map((r) => r.slug)).toEqual([
      "acme-thing",
    ]);
  });

  it("does not return a launch on a listing that was delisted", async () => {
    await seedLaunched();
    await repo.appendModerationAct({
      id: M1,
      subjectKind: "listing",
      subjectRef: "acme-thing",
      act: "delist",
      actorId: ADMIN,
      reason: "a reason, because an act without one cannot be appealed",
      reportId: null,
      occurredAt: NOW,
    });
    await repo.setListingModerationState({
      slug: "acme-thing",
      state: "delisted",
      at: NOW,
      actId: M1,
      legalFrom: ["visible"],
    });
    // Delisting means "not amplified here", and the front page is the loudest
    // amplification this estate has.
    expect(await repo.listFeedLaunches([DAY])).toEqual([]);
  });
});
