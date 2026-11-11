import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * I3, RE-ASSERTED AGAINST THE SCHEMA ITSELF (CB4's done-when).
 *
 * The contract test beside this one proves the SHAPES carry no address. This
 * one proves the migration cannot store one either — because a shape is a
 * promise and a column is a fact, and the fact is the thing that survives
 * somebody adding a convenient field in eighteen months.
 */
describe("I3 — the notification tables cannot hold an address", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../db/src/migrations/1470_openproduct_notifications/up.sql"),
    "utf-8",
  );

  it("declares no column that could be one", () => {
    // OVER THE COLUMN DECLARATIONS ONLY, not the whole file. The migration's
    // own header and its COMMENT ON strings explain the rule by naming what
    // they forbid, and a blunt search over the source calls that explanation
    // the offence — the LC1 finding, met again in a new disguise. What is
    // being asserted is what the table can HOLD, so it is read from the
    // CREATE TABLE blocks.
    // Comments stripped FIRST, then the blocks extracted: the inline notes
    // inside a CREATE TABLE explain the rule by naming what it forbids too.
    const code = sql.replace(/^\s*--.*$/gm, "");
    const tables = [...code.matchAll(/CREATE TABLE[^;]+;/g)].map((m) => m[0].toLowerCase());
    expect(tables).toHaveLength(3);
    for (const forbidden of ["email", "address", "phone", "push_token", "recipient"]) {
      for (const table of tables) expect(table).not.toContain(forbidden);
    }
  });

  it("keys the person by an opaque subject id and nothing else", () => {
    expect(sql).toContain("subject_id    TEXT        NOT NULL");
  });

  it("makes once-per-event a UNIQUE INDEX rather than a convention", () => {
    // Every caller remembering to check is the assumption this epic refuses
    // to make anywhere else either.
    expect(sql).toContain("CREATE UNIQUE INDEX");
    expect(sql).toContain("(subject_id, event_ref)");
  });
});
