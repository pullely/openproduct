// The subject registry has teeth (openproduct-consumers CS2, CS-4).
//
// The schema is applied to pglite, migration by migration in manifest order,
// and then `information_schema` is asked for every text column that could
// hold a subject id. Each must be classified or excused, by name; a column
// the registry does not know fails the test with its name. The registry, in
// turn, may not outlive the schema: every table, column, nullability and kind
// it declares is checked against what the engine actually has.

import { beforeAll, describe, expect, it } from "vitest";

import { migratedDb } from "./scale/harness.js";
import {
  NOT_SUBJECT_COLUMNS,
  OPENPRODUCT_SUBJECT_REGISTRY,
  SUBJECT_COLUMN_NAME_PATTERN,
  SUBJECT_TOMBSTONE,
  exportColumns,
  exportTables,
  isSubjectTombstone,
  redactedColumnsOf,
  subjectColumnsOf,
  subjectEntryKey,
  tombstonePredicateSql,
  tombstoneSql,
  unclassifiedSubjectColumns,
} from "./subject-registry.js";

interface LiveColumn {
  table: string;
  column: string;
  nullable: boolean;
}

let census: LiveColumn[];
let liveColumns: Map<string, Set<string>>;
let liveChecks: Map<string, string[]>;

beforeAll(async () => {
  const { sql } = await migratedDb();
  const cols = await sql.execute<{ table_name: string; column_name: string; is_nullable: string; data_type: string }>(
    `SELECT table_name, column_name, is_nullable, data_type
       FROM information_schema.columns
      WHERE table_schema = 'openproduct'
      ORDER BY table_name, column_name`,
  );
  liveColumns = new Map();
  for (const r of cols.rows) {
    liveColumns.set(r.table_name, (liveColumns.get(r.table_name) ?? new Set()).add(r.column_name));
  }
  census = cols.rows
    .filter((r) => r.data_type === "text" && SUBJECT_COLUMN_NAME_PATTERN.test(r.column_name))
    .map((r) => ({ table: r.table_name, column: r.column_name, nullable: r.is_nullable === "YES" }));
  const checks = await sql.execute<{ t: string; def: string }>(
    `SELECT c.relname AS t, pg_get_constraintdef(k.oid) AS def
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE k.contype = 'c' AND n.nspname = 'openproduct'`,
  );
  liveChecks = new Map();
  for (const r of checks.rows) liveChecks.set(r.t, [...(liveChecks.get(r.t) ?? []), r.def]);
}, 120_000);

describe("coverage — every column that can hold a subject id is classified", () => {
  it("leaves no subject column unclassified", () => {
    // A column carrying a subject with no class is a person's data with no
    // deletion behaviour decided — the leak this registry exists to make
    // impossible. The failure names the columns, not a count.
    expect(census.length).toBeGreaterThan(40);
    expect(unclassifiedSubjectColumns(census)).toEqual([]);
  });

  it("reddens when a subject column ships unclassified — proved with one that does not exist", () => {
    const widened = [...census, { table: "nudges", column: "subject_id", nullable: false }];
    expect(unclassifiedSubjectColumns(widened)).toEqual(["nudges.subject_id"]);
  });

  it("classifies nothing twice, and excuses nothing it also classifies", () => {
    const keys = OPENPRODUCT_SUBJECT_REGISTRY.map(subjectEntryKey);
    expect(new Set(keys).size).toBe(keys.length);
    const excused = new Set(NOT_SUBJECT_COLUMNS.map(subjectEntryKey));
    expect(keys.filter((k) => excused.has(k))).toEqual([]);
  });
});

describe("rot — the registry cannot outlive the schema", () => {
  it("names only tables and columns that exist", () => {
    const missing = [...OPENPRODUCT_SUBJECT_REGISTRY, ...NOT_SUBJECT_COLUMNS]
      .filter((e) => !liveColumns.get(e.table)?.has(e.column))
      .map(subjectEntryKey);
    expect(missing).toEqual([]);
  });

  it("declares the nullability the schema actually has — it decides NULL versus tombstone", () => {
    const live = new Map(census.map((c) => [`${c.table}.${c.column}`, c.nullable]));
    const wrong = OPENPRODUCT_SUBJECT_REGISTRY.filter((e) => live.get(subjectEntryKey(e)) !== e.nullable).map(
      (e) => `${subjectEntryKey(e)}: declared ${e.nullable ? "nullable" : "NOT NULL"}`,
    );
    expect(wrong).toEqual([]);
  });

  it("a polymorphic column's kind column exists and the schema's CHECK allows the kind", () => {
    for (const e of OPENPRODUCT_SUBJECT_REGISTRY) {
      if (!e.when) continue;
      expect(liveColumns.get(e.table)?.has(e.when.column)).toBe(true);
      const checks = liveChecks.get(e.table) ?? [];
      expect(checks.some((def) => def.includes(e.when!.column) && def.includes(`'${e.when!.equals}'`))).toBe(true);
    }
  });

  it("no CHECK constrains a subject column's format, so the tombstone is storable everywhere", () => {
    for (const e of OPENPRODUCT_SUBJECT_REGISTRY) {
      const constrained = (liveChecks.get(e.table) ?? []).filter((def) => def.includes(`(${e.column} `) || def.includes(`(${e.column})`));
      // `actor_id` carries TS-5's rule ('automatic' only for de-indexing) and
      // `decided_by` EN3's; both allow any other text, which the tombstone is.
      for (const def of constrained) expect(def).not.toMatch(/~/);
    }
  });
});

describe("the three classes", () => {
  it("a keyed column gets a derived tombstone, every other kept column the fixed one — never NULL", () => {
    // A NULL would say nobody acted; somebody did, and left. The schema's
    // coherence CHECKs (a decided appeal has a decider, a retired edge a
    // retirer, a claimed handle a subject) say the same thing.
    expect(tombstoneSql({ table: "t", column: "c", class: "record", nullable: true, export: "omit", reason: "" })).toBe(`'${SUBJECT_TOMBSTONE}'`);
    expect(tombstoneSql({ table: "t", column: "c", class: "record", nullable: false, export: "omit", reason: "" })).toBe(`'${SUBJECT_TOMBSTONE}'`);
    expect(tombstoneSql({ table: "t", column: "c", class: "record", nullable: false, keyed: true, export: "omit", reason: "" })).toBe(`'${SUBJECT_TOMBSTONE}_' || md5($1)`);
    expect(tombstoneSql({ table: "t", column: "c", class: "anonymise", nullable: true, tombstone: "derived", export: "rows", reason: "" })).toBe(`'${SUBJECT_TOMBSTONE}_' || md5($1)`);
    expect(tombstonePredicateSql({ table: "t", column: "c", class: "record", nullable: true, export: "omit", reason: "" })).toBe(`c = '${SUBJECT_TOMBSTONE}'`);
    expect(isSubjectTombstone(SUBJECT_TOMBSTONE)).toBe(true);
    expect(isSubjectTombstone(`${SUBJECT_TOMBSTONE}_deadbeef`)).toBe(true);
    expect(isSubjectTombstone("usr_0000000000000000000000000000ada0")).toBe(false);
    expect(isSubjectTombstone(null)).toBe(false);
  });

  it("every entry says why, and the records say so in CS-5's terms", () => {
    for (const e of OPENPRODUCT_SUBJECT_REGISTRY) expect(e.reason.length).toBeGreaterThan(20);
    // The record class is the transparency record and the listing's own
    // provenance: the moderation tables, the integrity decisions, the audit
    // trail, the launches, the listing's created/updated/reviewed columns and
    // the digest's editorial. Named here so adding one is a reviewed act.
    expect([...new Set(subjectColumnsOf("record").map((e) => e.table))].sort()).toEqual([
      "appeals",
      "audit_log",
      "digest_notes",
      "endorsement_integrity",
      "flags",
      "launches",
      "moderation_acts",
      "profiles",
      "reports",
    ]);
  });

  it("a column keyed to another is rewritten with its parent, and the parent is kept and keyed", () => {
    const byKey = new Map(OPENPRODUCT_SUBJECT_REGISTRY.map((e) => [subjectEntryKey(e), e]));
    const children = OPENPRODUCT_SUBJECT_REGISTRY.filter((e) => e.withParent);
    expect(children.map(subjectEntryKey)).toEqual(["endorsement_integrity.subject_id"]);
    for (const child of children) {
      const parent = byKey.get(`${child.withParent!.table}.${child.withParent!.column}`);
      expect(parent).toBeDefined();
      expect(parent!.class).not.toBe("theirs");
      expect(parent!.keyed).toBe(true);
      expect(child.keyed).toBe(true);
    }
  });

  it("the export walks the subject's own rows and their own words and acts, never a secret, a queue or a record (CS-4, CS-5)", () => {
    const tables = exportTables();
    // Theirs, except the three secret stores and the mail queue.
    for (const t of ["contributors", "saved_products", "follows", "notifications", "trust_levels", "collections"]) expect(tables).toContain(t);
    for (const t of ["auth_sessions", "credentials", "credential_tokens", "notification_outbox"]) expect(tables).not.toContain(t);
    // Their own words and acts, kept without them by the exit, exported before it.
    for (const t of ["posts", "threads", "endorsements", "handles"]) expect(tables).toContain(t);
    // Records and other people's context: not theirs to take.
    for (const t of ["moderation_acts", "reports", "appeals", "audit_log", "profiles", "launches", "digest_notes", "endorsement_integrity"]) expect(tables).not.toContain(t);
    expect(new Set(tables).size).toBe(tables.length);
    // Every entry says which, so a new column cannot reach the export by default.
    for (const e of OPENPRODUCT_SUBJECT_REGISTRY) expect(["rows", "omit"]).toContain(e.export);
    expect(exportColumns().every((e) => e.export === "rows")).toBe(true);
    // No record column is ever exported, whatever its table.
    expect(exportColumns().filter((e) => e.class === "record")).toEqual([]);
  });

  it("an exported row is stripped of every other subject's column on its table", () => {
    const byKey = new Map(OPENPRODUCT_SUBJECT_REGISTRY.map((e) => [subjectEntryKey(e), e]));
    expect(redactedColumnsOf(byKey.get("listing_maintainers.subject_id")!)).toEqual(["added_by"]);
    expect(redactedColumnsOf(byKey.get("product_people.subject_id")!)).toEqual(["invited_by", "retired_by"]);
    expect(redactedColumnsOf(byKey.get("trust_levels.subject_id")!)).toEqual(["set_by"]);
    expect(redactedColumnsOf(byKey.get("contributors.subject_id")!)).toEqual([]);
  });
});
