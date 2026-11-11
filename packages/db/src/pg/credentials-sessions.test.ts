// The openproduct repository against a live engine — the credential store, the credential writes, searching for people, sessions.
//
// AC0's dormant store and I3's no-address invariant as an information_schema query, AC1's writes against a live engine, SR0's people search, AC2's sessions.
//
// Cut from `repository-pg.test.ts` at openproduct-verification OV3, verbatim:
// the engine, the ids and the two seeds come from `./harness.js`, which
// restores the ladder's template per test instead of re-applying fifty
// migrations. Nothing a test asserts changed; what it costs did.

import { describe, expect, it } from "vitest";

import { sql, repo, ORG, PROFILE, ACTOR, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

describe("openproduct — the credential store, dormant (openproduct-launch AC0)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const AT = "2026-09-05T12:00:00.000Z";
  const SOON = "2026-09-05T12:30:00.000Z";
  const VERIFIER = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGVkcGFzc3dvcmQ";

  async function issueVerify(hash: string, expires = SOON) {
    await sql.execute(
      `INSERT INTO openproduct.credential_tokens (token_hash, purpose, verifier, created_at, expires_at)
       VALUES ($1, 'verify', $2, $3, $4)`,
      [hash, VERIFIER, AT, expires],
    );
  }

  it("HOLDS NO ADDRESS, and the schema-wide guard is what says so", async () => {
    // AC0 is the first milestone that would have wanted an exception to I3 —
    // the plan asked for an `email` column on `credentials`. The guard in
    // "the openproduct schema boundary" above is an `information_schema` query
    // over EVERY table, so it already covers these two without being extended.
    // This assertion is the same question asked of these tables by name, so a
    // future author who reintroduces the column reads WHY here rather than
    // being puzzled by a schema-wide failure three files away.
    const found = await sql.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'openproduct'
          AND table_name IN ('credentials', 'credential_tokens')
          AND (column_name ILIKE '%email%' OR column_name ILIKE '%mail%'
               OR column_name ILIKE '%address%')`,
    );
    expect(found.rows).toEqual([]);
  });

  it("keys a credential on the subject id and nothing else", async () => {
    await sql.execute(
      `INSERT INTO openproduct.credentials (subject_id, verifier, verified_at)
       VALUES ($1, $2, $3)`,
      [ADA, VERIFIER, AT],
    );
    const row = await sql.execute<{ subject_id: string; verifier: string }>(
      `SELECT subject_id, verifier FROM openproduct.credentials WHERE subject_id = $1`,
      [ADA],
    );
    expect(row.rows[0]!.subject_id).toBe(ADA);
    // One row per person, so a second sign-up for the same subject collides
    // rather than leaving two passwords that both work.
    await expect(
      sql.execute(
        `INSERT INTO openproduct.credentials (subject_id, verifier, verified_at)
         VALUES ($1, $2, $3)`,
        [ADA, VERIFIER, AT],
      ),
    ).rejects.toThrow();
  });

  it("refuses a verifier too short to be one", async () => {
    // A password store is the last place to find out from behaviour that a
    // write path constructed its input wrongly.
    await expect(
      sql.execute(
        `INSERT INTO openproduct.credentials (subject_id, verifier, verified_at)
         VALUES ($1, 'short', $2)`,
        [ADA, AT],
      ),
    ).rejects.toThrow();
  });

  it("refuses a token purpose the contract does not name", async () => {
    await expect(
      sql.execute(
        `INSERT INTO openproduct.credential_tokens (token_hash, purpose, verifier, expires_at)
         VALUES ('h1', 'magic', $1, $2)`,
        [VERIFIER, SOON],
      ),
    ).rejects.toThrow();
  });

  it("holds the two shapes apart — a verify carries a verifier, a reset a subject", async () => {
    // The CHECK that earns the single table. Both shapes sit side by side
    // where a reviewer sees them at once.
    //
    // EVERY INSERT HERE NAMES ITS `created_at`, and that is not tidiness.
    // Omitting it takes the column's DEFAULT now(), which is the real clock —
    // so against a fixed `SOON` in the past these rows violate
    // `credential_tokens_window_check` instead of the shape check they are
    // about. The success case then fails outright, and the three refusals
    // still "pass" while testing the wrong constraint. See the test below
    // this one for what that cost.
    await issueVerify("h-verify");
    await sql.execute(
      `INSERT INTO openproduct.credential_tokens (token_hash, purpose, subject_id, created_at, expires_at)
       VALUES ('h-reset', 'reset', $1, $2, $3)`,
      [ADA, AT, SOON],
    );

    // A verify that names a subject is a verify for an account that does not
    // exist yet — nonsense, and refused.
    await expect(
      sql.execute(
        `INSERT INTO openproduct.credential_tokens (token_hash, purpose, subject_id, verifier, created_at, expires_at)
         VALUES ('h-bad1', 'verify', $1, $2, $3, $4)`,
        [ADA, VERIFIER, AT, SOON],
      ),
    ).rejects.toThrow(/shape_check/);

    // A reset carrying a verifier would mean the new password was chosen
    // before the person proved they could read the mail.
    await expect(
      sql.execute(
        `INSERT INTO openproduct.credential_tokens (token_hash, purpose, subject_id, verifier, created_at, expires_at)
         VALUES ('h-bad2', 'reset', $1, $2, $3, $4)`,
        [ADA, VERIFIER, AT, SOON],
      ),
    ).rejects.toThrow(/shape_check/);

    // And neither may be empty of both.
    await expect(
      sql.execute(
        `INSERT INTO openproduct.credential_tokens (token_hash, purpose, created_at, expires_at)
         VALUES ('h-bad3', 'reset', $1, $2)`,
        [AT, SOON],
      ),
    ).rejects.toThrow(/shape_check/);
  });

  it("the fixture's clock is fixed, so these tests do not expire", async () => {
    // WHY THIS TEST EXISTS. The three refusals above assert `.rejects` — and
    // a row that violates ANY constraint rejects. They were written against
    // `credential_tokens_shape_check` and, from 12:30 UTC on 2026-09-05,
    // began rejecting on `credential_tokens_window_check` instead, because
    // their `created_at` defaulted to a real clock that had passed the fixed
    // `SOON`. They kept passing. They stopped testing their subject.
    //
    // `.rejects.toThrow(/shape_check/)` above is the fix for that: naming the
    // constraint means a row refused for the wrong reason fails. This test is
    // the fix for the fix — it pins that the fixture's own moment is behind
    // its expiry, so a future dated constant cannot reintroduce the drift
    // silently.
    expect(Date.parse(AT)).toBeLessThan(Date.parse(SOON));

    // And the property that actually matters: a row written with the
    // fixture's clock is accepted no matter when the suite runs.
    await sql.execute(
      `INSERT INTO openproduct.credential_tokens (token_hash, purpose, verifier, created_at, expires_at)
       VALUES ('h-clock', 'verify', $1, $2, $3)`,
      [VERIFIER, AT, SOON],
    );
    const row = await sql.execute<{ token_hash: string }>(
      `SELECT token_hash FROM openproduct.credential_tokens WHERE token_hash = 'h-clock'`,
    );
    expect(row.rows).toHaveLength(1);
  });

  it("refuses a token that expires before it was issued", async () => {
    await expect(
      sql.execute(
        `INSERT INTO openproduct.credential_tokens (token_hash, purpose, verifier, created_at, expires_at)
         VALUES ('h-back', 'verify', $1, $2, $3)`,
        [VERIFIER, SOON, AT],
      ),
    ).rejects.toThrow();
  });

  it("CONSUMES A TOKEN EXACTLY ONCE, and the race is in the database", async () => {
    // Two clicks on the same link, or two workers on the same request. The
    // guard is `WHERE consumed_at IS NULL` on the update itself, so the second
    // one updates no rows rather than both succeeding.
    await issueVerify("h-once");
    const consume = () =>
      sql.execute<{ token_hash: string }>(
        `UPDATE openproduct.credential_tokens
            SET consumed_at = $2
          WHERE token_hash = $1 AND consumed_at IS NULL
        RETURNING token_hash`,
        ["h-once", AT],
      );
    expect((await consume()).rows).toHaveLength(1);
    expect((await consume()).rows).toHaveLength(0);
  });

  it("keys a token on its HASH, so the token itself is nowhere in the row", async () => {
    // A token readable from this table is the difference between losing a
    // database and losing every account. The primary key IS the hash, so a
    // lookup is a lookup by the only thing stored.
    await issueVerify("h-pk");
    const cols = await sql.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'openproduct' AND table_name = 'credential_tokens'`,
    );
    const names = cols.rows.map((r) => r.column_name).sort();
    expect(names).toEqual([
      "consumed_at",
      "created_at",
      "expires_at",
      "purpose",
      "subject_id",
      "token_hash",
      "verifier",
    ]);
    // Two tokens cannot share a hash — that would make one link open another
    // person's account.
    await expect(issueVerify("h-pk")).rejects.toThrow();
  });

  it("points no foreign key at anything, including the subject", async () => {
    // `credential_tokens.subject_id` is deliberately NOT a foreign key onto
    // `credentials`: a reset token is issued for a subject that HAS a
    // credential, but the subject id itself is the platform's and this schema
    // holds no table of people. The estate-wide "no FK escapes the schema"
    // guard covers the outward direction; this covers the inward one.
    const fks = await sql.execute<{ constraint_name: string }>(
      `SELECT tc.constraint_name FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'openproduct'
          AND tc.table_name IN ('credentials', 'credential_tokens')`,
    );
    expect(fks.rows).toEqual([]);
  });

  it("goes with the schema on teardown, like everything else here", async () => {
    // teardown.md row 10: the whole thing is one unit. A credential store that
    // survived a `DROP SCHEMA` would be the one table nobody remembered.
    await issueVerify("h-teardown");
    await sql.execute(
      `INSERT INTO openproduct.credentials (subject_id, verifier, verified_at)
       VALUES ($1, $2, $3)`,
      [ADA, VERIFIER, AT],
    );
    const owned = await sql.execute<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'openproduct'
          AND table_name IN ('credentials', 'credential_tokens')`,
    );
    expect(owned.rows).toHaveLength(2);
  });
});

describe("openproduct — the credential writes against a live engine (openproduct-launch AC1)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const AT = "2026-09-05T12:00:00.000Z";
  const LATER = "2026-09-05T12:20:00.000Z";
  const PAST = "2026-09-05T11:00:00.000Z";
  const SOON = "2026-09-05T12:30:00.000Z";
  const V1 = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$Zmlyc3RwYXNzd29yZGhhc2g";
  const V2 = "$argon2id$v=19$m=19456,t=2,p=1$b3RoZXJzYWx0$c2Vjb25kcGFzc3dvcmRoYXNo";

  /** An issued sign-up token. `at` is overridable because the schema refuses
   *  `expires_at <= created_at` — an already-expired token has to have been
   *  issued before it expired, which is the constraint being right rather than
   *  in the way. */
  function pending(
    tokenHash: string,
    over: Partial<{ verifier: string; expiresAt: string; at: string }> = {},
  ) {
    return repo.issueCredentialToken({
      tokenHash,
      purpose: "verify",
      subjectId: null,
      verifier: over.verifier ?? V1,
      at: over.at ?? AT,
      expiresAt: over.expiresAt ?? SOON,
    });
  }

  /** Issued an hour ago, expired an hour ago. */
  const EXPIRED = { at: "2026-09-05T10:00:00.000Z", expiresAt: PAST };

  it("remembers ONE password per challenge, and a retry does not stack a second", async () => {
    // A retried sign-up carries the same challenge id. The first password
    // typed is the one waiting; a retry is a retry rather than a change of
    // mind, and the caller is told nothing either way.
    expect(await pending("h-one")).toBe(true);
    expect(await pending("h-one", { verifier: V2 })).toBe(false);

    const row = await sql.execute<{ verifier: string }>(
      `SELECT verifier FROM openproduct.credential_tokens WHERE token_hash = 'h-one'`,
    );
    expect(row.rows[0]!.verifier).toBe(V1);
  });

  it("SPENDS A TOKEN EXACTLY ONCE — two clicks race in the database", async () => {
    await pending("h-race");
    const first = await repo.consumeCredentialToken("h-race", "verify", LATER);
    expect(first).toEqual({ purpose: "verify", subjectId: null, verifier: V1 });
    // The second gets null rather than the same verifier. A read-then-write
    // here would be the classic double-spend, on the one path where spending
    // twice means two people share an account.
    expect(await repo.consumeCredentialToken("h-race", "verify", LATER)).toBeNull();
  });

  it("refuses an EXPIRED token, and checks that in the same statement", async () => {
    // Expiry is checked in the UPDATE rather than by the caller: a caller that
    // read the row, decided it was live, and then updated it would have a
    // window between the two.
    await pending("h-old", EXPIRED);
    expect(await repo.consumeCredentialToken("h-old", "verify", AT)).toBeNull();
    // And it is still unconsumed rather than half-spent.
    const row = await sql.execute<{ consumed_at: string | null }>(
      `SELECT consumed_at FROM openproduct.credential_tokens WHERE token_hash = 'h-old'`,
    );
    expect(row.rows[0]!.consumed_at).toBeNull();
  });

  it("refuses a token of the WRONG PURPOSE, so a reset link cannot set a sign-up's password", async () => {
    await repo.issueCredentialToken({
      tokenHash: "h-reset",
      purpose: "reset",
      subjectId: ADA,
      verifier: null,
      at: AT,
      expiresAt: SOON,
    });
    expect(await repo.consumeCredentialToken("h-reset", "verify", LATER)).toBeNull();
    // Still spendable as what it is.
    expect(await repo.consumeCredentialToken("h-reset", "reset", LATER)).toEqual({
      purpose: "reset",
      subjectId: ADA,
      verifier: null,
    });
  });

  it("refuses a token that never existed, identically", async () => {
    // Same null as spent and expired. The handler must not tell them apart.
    expect(await repo.consumeCredentialToken("h-nope", "verify", AT)).toBeNull();
  });

  it("writes a password against the subject the platform minted", async () => {
    await repo.writeCredential({ subjectId: ADA, verifier: V1, at: AT });
    expect(await repo.getCredential(ADA)).toEqual({ verifier: V1, verifiedAt: AT });
    expect(await repo.getCredential(BOB)).toBeNull();
  });

  it("LETS A SECOND VERIFIED PASSWORD WIN, and keeps when the first one was set", async () => {
    // Somebody who forgot, signed up again and just proved they can read the
    // mail expects the password they typed to work. But WHEN they first had a
    // password here is a different fact from when they last set one, and
    // incident response asks the first.
    await repo.writeCredential({ subjectId: ADA, verifier: V1, at: AT });
    await repo.writeCredential({ subjectId: ADA, verifier: V2, at: LATER });

    expect((await repo.getCredential(ADA))!.verifier).toBe(V2);
    const row = await sql.execute<{ created_at: string | Date; updated_at: string | Date }>(
      `SELECT created_at, updated_at FROM openproduct.credentials WHERE subject_id = $1`,
      [ADA],
    );
    expect(new Date(row.rows[0]!.created_at).toISOString()).toBe(AT);
    expect(new Date(row.rows[0]!.updated_at).toISOString()).toBe(LATER);
  });

  it("keeps one row per subject however many times somebody signs up", async () => {
    for (const at of [AT, LATER, SOON]) {
      await repo.writeCredential({ subjectId: ADA, verifier: V1, at });
    }
    const n = await sql.execute<{ n: string | number }>(
      `SELECT count(*) AS n FROM openproduct.credentials`,
    );
    expect(Number(n.rows[0]!.n)).toBe(1);
  });

  it("sweeps away abandoned sign-ups, and leaves live and spent ones alone", async () => {
    // An unconsumed token past its window is a hashed password nobody is
    // coming back for.
    await pending("h-dead", EXPIRED);
    await pending("h-live", { expiresAt: SOON });
    // Spent WITHIN its window, because an expired token cannot be consumed —
    // the `expires_at > $now` guard in the same statement sees to that, and
    // the test above pins it. So this one is genuinely "used, then aged out",
    // which is the row the sweep must leave alone.
    await pending("h-spent", EXPIRED);
    await repo.consumeCredentialToken("h-spent", "verify", "2026-09-05T10:30:00.000Z");

    expect(await repo.expireCredentialTokens(AT)).toBe(1);
    const left = await sql.execute<{ token_hash: string }>(
      `SELECT token_hash FROM openproduct.credential_tokens ORDER BY token_hash`,
    );
    expect(left.rows.map((r) => r.token_hash)).toEqual(["h-live", "h-spent"]);
  });

  it("still holds no address after ANY of these writes", async () => {
    // The done-when's second half, asked of the engine rather than of a
    // handler: run every write this milestone has, then look at every value in
    // both tables.
    await pending("h-audit");
    await repo.consumeCredentialToken("h-audit", "verify", LATER);
    await repo.writeCredential({ subjectId: ADA, verifier: V1, at: LATER });

    const dump = await sql.execute<Record<string, unknown>>(
      `SELECT to_jsonb(t) AS row FROM openproduct.credentials t
       UNION ALL
       SELECT to_jsonb(t) AS row FROM openproduct.credential_tokens t`,
    );
    const text = JSON.stringify(dump.rows);
    expect(text).not.toContain("@");
    expect(text.toLowerCase()).not.toContain("example.com");
  });
});

describe("openproduct — searching for people, live (openproduct-launch SR0)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const NOW = "2026-08-17T12:00:00.000Z";

  /** Somebody the people directory lists: handle held, profile public and
   *  published, and maintaining something listed. All four of CG2's. */
  async function listedPerson(
    subjectId: string,
    handle: string,
    over: { displayName?: string | null; bio?: string | null } = {},
  ) {
    await repo.upsertContributor({
      subjectId,
      displayName: over.displayName === undefined ? "Ada Fenwick" : over.displayName,
      bio: over.bio === undefined ? "Builds queues." : over.bio,
    });
    await repo.claimHandle(handle, subjectId, NOW);
    await repo.setProfileVisibility(subjectId, true, NOW);
    await repo.addListingMaintainer(PROFILE, subjectId, "maintainer", ACTOR);
  }

  it("matches a handle, a display name and a bio", async () => {
    await seedPublished();
    await listedPerson(ADA, "ada");
    expect((await repo.searchPublicContributors("ada", 10)).map((r) => r.handle)).toEqual(["ada"]);
    expect((await repo.searchPublicContributors("fenwick", 10)).map((r) => r.handle)).toEqual(["ada"]);
    expect((await repo.searchPublicContributors("queues", 10)).map((r) => r.handle)).toEqual(["ada"]);
    expect(await repo.searchPublicContributors("nobody", 10)).toEqual([]);
  });

  it("AGREES WITH THE DIRECTORY about who is eligible, condition by condition", async () => {
    // The four conditions are CG2's, copied into a second statement. What is
    // asserted is that the two AGREE against the same fixtures — the same
    // discipline the sitemap and the page already hold each other to, and for
    // the same reason: two predicates meant to be one predicate drift the
    // moment either is edited.
    await seedPublished();
    await listedPerson(ADA, "ada");

    const eligible = async () =>
      (await repo.listPublicContributorCards(50)).map((c) => c.handle);
    const found = async () => (await repo.searchPublicContributors("ada", 50)).map((r) => r.handle);

    expect(await found()).toEqual(await eligible());

    // 1. the profile is turned off
    await repo.setProfileVisibility(ADA, false, NOW);
    expect(await found()).toEqual([]);
    expect(await eligible()).toEqual([]);
    await repo.setProfileVisibility(ADA, true, NOW);
    expect(await found()).toEqual(["ada"]);

    // 2. the listing they maintain is unpublished
    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await found()).toEqual([]);
    expect(await eligible()).toEqual([]);
  });

  it("does NOT find somebody whose handle was released", async () => {
    // A released row is a tombstone. Finding it would hand the old holder's
    // handle to whoever searched for it next.
    await seedPublished();
    await listedPerson(ADA, "ada");
    await repo.releaseHandle(ADA, NOW);
    expect(await repo.searchPublicContributors("ada", 10)).toEqual([]);
  });

  it("does NOT find somebody who never opted in", async () => {
    await seedPublished();
    await repo.upsertContributor({ subjectId: BOB, displayName: "Bob Stone", bio: "Writes." });
    await repo.claimHandle("bob", BOB, NOW);
    // No `setProfileVisibility` — they have a handle and never made the page
    // public.
    await repo.addListingMaintainer(PROFILE, BOB, "maintainer", ACTOR);
    expect(await repo.searchPublicContributors("bob", 10)).toEqual([]);
    expect(await repo.searchPublicContributors("stone", 10)).toEqual([]);
  });

  it("puts a HANDLE match above a name match, and a name above a bio", async () => {
    // Somebody typing "ada" almost always means the person called that, not
    // the people who mention her in a sentence about themselves.
    await seedPublished();
    await listedPerson(ADA, "ada", { displayName: "Ada Fenwick", bio: "Builds queues." });
    await listedPerson(BOB, "bob", { displayName: "Ada Nakamura", bio: "Writes." });
    await listedPerson("usr_0000000000000000000000000000cee0", "cee", {
      displayName: "Cee Bright",
      bio: "Worked with ada once.",
    });
    expect((await repo.searchPublicContributors("ada", 10)).map((r) => r.handle)).toEqual([
      "ada",
      "bob",
      "cee",
    ]);
  });

  it("bounds what it returns, whatever it is asked for", async () => {
    await seedPublished();
    for (const h of ["ada", "adb", "adc"]) {
      await listedPerson(`usr_00000000000000000000000000000${h}`, h);
    }
    expect(await repo.searchPublicContributors("ad", 2)).toHaveLength(2);
    expect(await repo.searchPublicContributors("ad", 0)).toHaveLength(1);
    expect(await repo.searchPublicContributors("ad", 10_000)).toHaveLength(3);
  });

  it("treats a wildcard as a literal, so a query cannot match everybody", async () => {
    // `%` and `_` are ILIKE metacharacters. Unescaped, a search for `%` would
    // return every public profile on the estate — which is the people
    // directory, reached by typing one character into a search box.
    await seedPublished();
    await listedPerson(ADA, "ada");
    expect(await repo.searchPublicContributors("%", 10)).toEqual([]);
    expect(await repo.searchPublicContributors("_", 10)).toEqual([]);
    expect(await repo.searchPublicContributors("a%a", 10)).toEqual([]);
  });

  it("is case-insensitive, because nobody types a handle the way it is stored", async () => {
    await seedPublished();
    await listedPerson(ADA, "ada", { displayName: "Ada Fenwick" });
    expect((await repo.searchPublicContributors("ADA", 10)).map((r) => r.handle)).toEqual(["ada"]);
    expect((await repo.searchPublicContributors("fEnWiCk", 10)).map((r) => r.handle)).toEqual(["ada"]);
  });
});

describe("openproduct — sessions against a live engine (openproduct-launch AC2b)", () => {
  const ADA = "usr_0000000000000000000000000000ada0";
  const BOB = "usr_0000000000000000000000000000bob0";
  const AT = "2026-09-05T12:00:00.000Z";
  const LATER = "2026-09-05T12:20:00.000Z";
  const PAST = "2026-09-05T11:00:00.000Z";
  const SOON = "2026-10-05T12:00:00.000Z";

  /** A minted session. `at` is overridable because the schema refuses
   *  `expires_at <= created_at` — an already-expired session must have been
   *  issued before it expired, which is the CHECK being right rather than in
   *  the way. (The same shape the credential-token tests needed.) */
  function mint(
    tokenHash: string,
    over: Partial<{ subjectId: string; at: string; expiresAt: string }> = {},
  ) {
    return repo.issueAuthSession({
      tokenHash,
      subjectId: over.subjectId ?? ADA,
      at: over.at ?? AT,
      expiresAt: over.expiresAt ?? SOON,
    });
  }

  /** Issued an hour ago, expired an hour ago. */
  const EXPIRED = { at: "2026-09-05T10:00:00.000Z", expiresAt: PAST };

  it("stores a session and reads it back by its hash", async () => {
    await mint("s-live");
    expect(await repo.resolveAuthSession("s-live")).toEqual({
      subjectId: ADA,
      expiresAt: SOON,
      revokedAt: null,
    });
  });

  it("returns the row as stored, expired and revoked alike", async () => {
    // The liveness rule lives in `sessionUsable`, in the contract, in ONE
    // place. A filter in the SQL would read as tidier and would put the rule
    // where the second caller has to remember to repeat it — and the second
    // caller who forgets is the one that accepts a revoked session.
    await mint("s-old", EXPIRED);
    const row = await repo.resolveAuthSession("s-old");
    expect(row).not.toBeNull();
    expect(row!.expiresAt).toBe(PAST);
  });

  it("REFUSES A SESSION THAT EXPIRES BEFORE IT BEGINS", async () => {
    // The window CHECK, doing the job the credential tokens' one does: a
    // caller that computed an expiry wrongly finds out at the write rather
    // than by minting a session nobody can use.
    await expect(mint("s-bad", { expiresAt: PAST })).rejects.toThrow();
  });

  it("revokes, and keeps the FIRST timestamp on a second revoke", async () => {
    await mint("s-out");
    await repo.revokeAuthSession("s-out", LATER);
    expect((await repo.resolveAuthSession("s-out"))!.revokedAt).toBe(LATER);
    // Signing out twice does not move when the session ended.
    await repo.revokeAuthSession("s-out", "2026-09-05T13:00:00.000Z");
    expect((await repo.resolveAuthSession("s-out"))!.revokedAt).toBe(LATER);
  });

  it("ends every session one person holds, and nobody else's", async () => {
    // What TS3's removal and a future "sign out everywhere" both need, as one
    // statement rather than a loop a caller writes.
    await mint("s-ada-1");
    await mint("s-ada-2");
    await mint("s-bob", { subjectId: BOB });
    expect(await repo.revokeAuthSessionsForSubject(ADA, LATER)).toBe(2);
    expect((await repo.resolveAuthSession("s-ada-1"))!.revokedAt).toBe(LATER);
    expect((await repo.resolveAuthSession("s-ada-2"))!.revokedAt).toBe(LATER);
    expect((await repo.resolveAuthSession("s-bob"))!.revokedAt).toBeNull();
  });

  it("counts only what was live, so a second sweep reports nothing", async () => {
    await mint("s-twice");
    expect(await repo.revokeAuthSessionsForSubject(ADA, LATER)).toBe(1);
    expect(await repo.revokeAuthSessionsForSubject(ADA, LATER)).toBe(0);
  });

  it("sweeps expired sessions and KEEPS revoked ones", async () => {
    // "This session ended at 14:02" and "this session never existed" are
    // different answers, and incident response asks for the first. A sweep
    // that deleted revoked rows would trade that answer for a few bytes.
    await mint("s-expired", EXPIRED);
    await mint("s-revoked");
    await repo.revokeAuthSession("s-revoked", LATER);

    expect(await repo.expireAuthSessions(AT)).toBe(1);
    expect(await repo.resolveAuthSession("s-expired")).toBeNull();
    expect(await repo.resolveAuthSession("s-revoked")).not.toBeNull();
  });

  it("holds no address, and the I3 query covers it without being extended", async () => {
    // The information_schema guard that AC0 relied on is the same one that
    // covers this table — written that way precisely so a new table needs no
    // one to remember it.
    const cols = await sql.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'openproduct' AND table_name = 'auth_sessions'`,
    );
    const names = cols.rows.map((r) => r.column_name).sort();
    expect(names).toEqual(["created_at", "expires_at", "revoked_at", "subject_id", "token_hash"]);
  });
});

// ---------------------------------------------------------------------------
// MD0 — the media model (openproduct-worldclass)
// ---------------------------------------------------------------------------
//
// 1820 is the first table on this estate whose CHECK constraints ARE a product
// invariant rather than data hygiene: WC-3 says an authored image and an
// observed one are different objects, and the provenance constraint is that
// sentence. A fake executor would return whatever it was told, so these run
// against the real engine with the real migration — the reason this file
// exists.
