// The placeholder translation and the one timestamp format (OPN D1 slice) —
// pure, no engine.

import { describe, expect, it } from "vitest";

import { sliceSchemaStatements } from "./schema.js";
import { chunkJsonArrays } from "./slice-repository.js";
import { toBindValue, toInstant, translatePlaceholders } from "./sql.js";

describe("translatePlaceholders — $n to ?n, literal-aware", () => {
  it("numbers stay numbers, and a repeated $n binds its value ONCE", () => {
    const t = translatePlaceholders("SELECT $2, $1 WHERE x = $2 OR $2 IS NULL", ["a", "b"]);
    expect(t.text).toBe("SELECT ?2, ?1 WHERE x = ?2 OR ?2 IS NULL");
    expect(t.values).toEqual(["a", "b"]);
  });

  it("leaves $n inside string literals, quoted identifiers and comments alone", () => {
    const t = translatePlaceholders(
      `SELECT '$1', "$2", json_extract(v, '$.a') -- $3\n/* $4 */ FROM t WHERE a = $1`,
      ["x"],
    );
    expect(t.text).toBe(`SELECT '$1', "$2", json_extract(v, '$.a') -- $3\n/* $4 */ FROM t WHERE a = ?1`);
    expect(t.values).toEqual(["x"]);
  });

  it("handles '' escapes inside a literal", () => {
    const t = translatePlaceholders("SELECT 'it''s $1' , $1", ["v"]);
    expect(t.text).toBe("SELECT 'it''s $1' , ?1");
  });

  it("refuses a reference past the parameters, and parameters the text never references", () => {
    expect(() => translatePlaceholders("SELECT $2", ["a"])).toThrow(/references \$2/);
    expect(() => translatePlaceholders("SELECT $1", ["a", "b"])).toThrow(/references only 1/);
  });

  it("refuses $101 — D1's ceiling is 100 bound parameters per statement", () => {
    const params = Array.from({ length: 101 }, (_, i) => i);
    expect(() => translatePlaceholders(`SELECT ${params.map((_, i) => `$${i + 1}`).join(",")}`, params)).toThrow(
      /100 bound parameters/,
    );
  });
});

describe("toBindValue and toInstant", () => {
  it("binds booleans as 0/1, Dates as the one format, objects as JSON", () => {
    expect(toBindValue(true)).toBe(1);
    expect(toBindValue(false)).toBe(0);
    expect(toBindValue(undefined)).toBeNull();
    expect(toBindValue(new Date("2026-08-17T12:00:00Z"))).toBe("2026-08-17T12:00:00.000Z");
    expect(toBindValue({ a: [1] })).toBe('{"a":[1]}');
  });

  it("normalises every instant to YYYY-MM-DDTHH:MM:SS.sssZ — the format whose text order is time order", () => {
    expect(toInstant("2026-08-17T12:00:00Z")).toBe("2026-08-17T12:00:00.000Z");
    expect(toInstant("2026-08-17T14:00:00+02:00")).toBe("2026-08-17T12:00:00.000Z");
    // Microseconds are truncated, as V8 and pglite both truncate them.
    expect(toInstant("2026-08-17T11:00:00.123999Z")).toBe("2026-08-17T11:00:00.123Z");
    expect(toInstant(0)).toBe("1970-01-01T00:00:00.000Z");
    // Why the normalisation is not optional: un-normalised text sorts wrongly.
    expect("2026-08-17T12:00:00Z" > "2026-08-17T12:00:00.500Z").toBe(true);
    expect(toInstant("2026-08-17T12:00:00Z") < toInstant("2026-08-17T12:00:00.500Z")).toBe(true);
  });

  it("refuses what is not an instant, and years that would not be four digits", () => {
    expect(() => toInstant("not a date")).toThrow(/not an instant/);
    expect(() => toInstant(Date.UTC(10000, 0, 1))).toThrow(/four-digit/);
  });
});

describe("chunkJsonArrays — one bound value per chunk, each under the ceiling", () => {
  it("packs items into JSON arrays no larger than the ceiling, in order, losing nothing", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ id: i, text: "é".repeat(i % 50) }));
    const chunks = chunkJsonArrays(items, 2_000, "item");
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) expect(Buffer.byteLength(chunk, "utf8")).toBeLessThanOrEqual(2_000);
    expect(chunks.flatMap((c) => JSON.parse(c) as unknown[])).toEqual(items);
  });

  it("counts UTF-8 bytes, not UTF-16 code units — emoji are four bytes", () => {
    const items = Array.from({ length: 40 }, () => ({ t: "🚀".repeat(10) }));
    for (const chunk of chunkJsonArrays(items, 300, "item")) {
      expect(Buffer.byteLength(chunk, "utf8")).toBeLessThanOrEqual(300);
    }
  });

  it("refuses an item that cannot fit a chunk on its own", () => {
    expect(() => chunkJsonArrays([{ t: "x".repeat(100) }], 50, "search document")).toThrow(/search document/);
  });
});

describe("the migration splits into statements wrangler and the tests agree on", () => {
  it("keeps a trigger body whole and a ';' inside a literal inside its statement", () => {
    const statements = sliceSchemaStatements();
    const triggers = statements.filter((s) => /^CREATE TRIGGER/i.test(s));
    expect(triggers).toHaveLength(2);
    for (const t of triggers) expect(t).toMatch(/BEGIN[\s\S]*RAISE\(ABORT[\s\S]*END$/);
    const profiles = statements.find((s) => s.startsWith("CREATE TABLE IF NOT EXISTS profiles"));
    expect(profiles).toContain("'*[|;&`<>]*'");
  });
});
