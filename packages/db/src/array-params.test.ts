// Every array parameter the repository binds is CAST in the SQL.
//
// The production executor runs postgres.js with `fetch_types: false`
// (executor.ts), and without the type fetch the driver cannot tell Postgres
// what a JavaScript array is: bound to `= ANY($1)` it arrives as the bare
// text of its first element and the server answers `22P02 malformed array
// literal` — cast or not. The executor now serializes every array parameter
// to a Postgres array literal (`toPgArrayLiteral`), and the CAST at the call
// site is what names the element type the server parses that literal
// against. The statement that carried the defect (`latestMetricsForSlugs`)
// only runs once the directory has a card, and the pglite harness binds
// arrays natively and never goes through the driver — so the guard is
// static, over the source: `ANY($n::type[])`, always.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("array parameters are cast in the SQL (the driver cannot type them)", () => {
  /**
   * `ANY` AND `ALL`, because the driver does not care which one you wrote
   * (openproduct-worldclass RS5a).
   *
   * The guard shipped matching `ANY($n)` only. `ALL($n)` takes an array
   * operand by exactly the same rules and fails in exactly the same way, and
   * the repository already contains one — `replaceSearchIndex`'s wholesale
   * delete, `entity_id <> ALL($2::text[])`. That one IS cast, so this is a
   * hole in the guard rather than a live defect; it is closed because the
   * statement it would have missed is the one behind the audit's
   * lowest-scoring dimension, and because the reason the original defect
   * survived to production applies here word for word: the statement only
   * runs once the directory has a card, and the pglite harness binds arrays
   * natively and never goes through the driver.
   */
  const OPERATORS = ["ANY", "ALL"] as const;

  it.each(OPERATORS)("binds no bare %s($n) anywhere in the repository", (operator) => {
    const source = readFileSync(resolve(__dirname, "repository.ts"), "utf-8");
    const bare = [...source.matchAll(new RegExp(`${operator}\\(\\$(\\d+)\\)`, "g"))].map((m) => {
      const line = source.slice(0, m.index).split("\n").length;
      return `repository.ts:${line} ${m[0]}`;
    });
    expect(bare).toEqual([]);
  });
});

/**
 * JSON parameters are cast THROUGH TEXT (openproduct-worldclass-v2 LI1).
 *
 * The array guard above exists because the driver cannot type a parameter it
 * is not told about. This one exists because of the opposite: with
 * `prepare: true` postgres.js DESCRIBES a statement before binding, learns a
 * `$n::jsonb` placeholder is jsonb, and serialises the parameter with its
 * jsonb serialiser — `JSON.stringify`. Every repository site binds JSON as a
 * string it already stringified, so the driver stringified it again and
 * Postgres stored a JSON string scalar. Silent on an INSERT; loud on
 * `jsonb_to_recordset`, which is the search index rebuild that failed on
 * every production tick from RS0 until LI1's driver harness reproduced it.
 *
 * `$n::text::jsonb` makes the described type text, which the driver hands
 * through untouched, and Postgres parses once. pglite never went through the
 * driver, so — as above — the guard is static, over the source.
 */
describe("JSON parameters are cast through text (the driver would stringify them twice)", () => {
  it("binds no bare $n::jsonb or $n::json anywhere in the repository", () => {
    const source = readFileSync(resolve(__dirname, "repository.ts"), "utf-8");
    const bare = [...source.matchAll(/\$(\d+)::jsonb?\b/g)].map((m) => {
      const line = source.slice(0, m.index).split("\n").length;
      return `repository.ts:${line} ${m[0]}`;
    });
    expect(bare).toEqual([]);
  });

  it("every JSON parameter site goes through text first", () => {
    const source = readFileSync(resolve(__dirname, "repository.ts"), "utf-8");
    const sites = [...source.matchAll(/\$\d+::text::jsonb/g)];
    expect(sites.length).toBeGreaterThanOrEqual(10);
  });
});
