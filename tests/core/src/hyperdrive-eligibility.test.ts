// Every public read stays cacheable at Hyperdrive (openproduct-performance OPP10).
//
// ─── WHAT HYPERDRIVE WILL NOT CACHE ───────────────────────────────────────
//
// Hyperdrive puts a read-through cache in front of Postgres — `caching.disabled
// = false` in `infra/hyperdrive/terraform/main.tf`, at its default 60s max-age
// and 15s stale-while-revalidate, which is the same freshness OD-H,
// `PUBLIC_CACHE_SECONDS` and every public page's `revalidate` already use.
//
// It caches "eligible read-only query responses" and names its exclusions:
// mutating statements, and any query using a VOLATILE or STABLE function —
// `NOW()`, `CURRENT_TIMESTAMP`, `CURRENT_DATE`, `CURRENT_TIME`, `LOCALTIME`,
// `LOCALTIMESTAMP`, `TIMEOFDAY()`, `RANDOM()`, `LASTVAL()`, `TXID_CURRENT()`.
//
// So a single `now()` inside a SELECT silently makes that read uncacheable.
// Nothing fails, nothing looks different, and the read simply pays the full
// round trip to Postgres forever.
//
// ─── AND THE CODEBASE ALREADY REFUSES IT, FOR A BETTER REASON ─────────────
//
// The audit that produced this file found **zero** of them across 139 SELECT
// and WITH statements. That is not luck: `contracts/src/feed.ts` and
// `contracts/src/leaderboard.ts` both argue the point explicitly, and neither
// mentions caching at the database at all —
//
//   "A `WHERE launched_at > now() - interval '7 days'` would make the window a
//    property of the database's clock and of when the query ran, and two
//    readers a second apart could then see different feeds — which is the
//    cacheable-document rule (OPC-1) broken by a detail nobody would look at."
//
// The window is computed in JavaScript and passed as a bound parameter. OPC-1
// asked for that so one URL yields one document; Hyperdrive eligibility comes
// free with it. TWO CACHES, ONE RULE — which is exactly why it is worth pinning:
// somebody optimising a query by moving the clock into SQL would break the
// document plane and the database plane at once, and neither would say so.
//
// ─── WHAT THIS ASSERTS ────────────────────────────────────────────────────
//
// It scans the SQL rather than the query plan, which is stated so it is not
// mistaken for more than it is: this proves no read NAMES a volatile function,
// not that Postgres reported one cached. The behavioural half is the
// `cf-cache-status` and Server-Timing evidence in the epic.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The functions Hyperdrive names, plus the id generators — `nextval`,
 * `gen_random_uuid` and `uuid_generate_v4` are volatile too, and a read that
 * called one would be both uncacheable and a bug.
 */
const VOLATILE =
  /\b(now|current_timestamp|current_date|current_time|localtime|localtimestamp|timeofday|random|lastval|txid_current|clock_timestamp|statement_timestamp|uuid_generate_v4|gen_random_uuid|nextval)\s*\(/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") && !full.includes(".test.") ? [full] : [];
  });
}

/** Every SQL statement in the read path, as written. */
function statements(): { file: string; line: number; sql: string }[] {
  const found: { file: string; line: number; sql: string }[] = [];
  const roots = [
    resolve(ROOT, "packages/db/src"),
    resolve(ROOT, "core/src"),
  ];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, "utf-8");
      for (const match of source.matchAll(/`([^`]*)`/g)) {
        found.push({
          file: file.slice(ROOT.length + 1),
          line: source.slice(0, match.index).split("\n").length,
          sql: match[1]!,
        });
      }
    }
  }
  return found;
}

const isRead = (sql: string) => /^\s*(SELECT|WITH)\s/i.test(sql);

describe("OPP10 — the public reads are eligible for Hyperdrive's cache", () => {
  const all = statements();
  const reads = all.filter((s) => isRead(s.sql));

  it("finds the reads at all, so this guard cannot go quietly vacuous", () => {
    // A scanner that matches nothing passes forever. The count is loose on
    // purpose — it is a floor, not a budget — but a refactor that moved the SQL
    // somewhere this cannot see would drop it through the floor and say so.
    expect(reads.length).toBeGreaterThan(100);
  });

  it("no read names a volatile or stable function", () => {
    const offenders = reads
      .filter((r) => VOLATILE.test(r.sql))
      .map((r) => `${r.file}:${r.line} — ${r.sql.trim().split("\n")[0]!.slice(0, 60)}`);
    // Listed rather than counted: a failure here should say WHICH read, because
    // the fix is always the same shape (compute the value and bind it) and the
    // reader needs to know where to apply it.
    expect(offenders).toEqual([]);
  });

  it("the regex it trusts actually matches the thing it is looking for", () => {
    // The whole guard is one regex, and a guard whose matcher is broken is
    // worse than none: it reports a clean estate forever.
    expect(VOLATILE.test("SELECT * FROM t WHERE at > now() - interval '7 days'")).toBe(true);
    expect(VOLATILE.test("SELECT * FROM t ORDER BY RANDOM()")).toBe(true);
    expect(VOLATILE.test("SELECT * FROM t WHERE d = CURRENT_DATE()")).toBe(true);
    // And does not fire on the column names that carry those words, which is
    // what a lazier pattern would do to `updated_at` or `known_at`.
    expect(VOLATILE.test("SELECT id, updated_at, snapshot_at FROM t")).toBe(false);
  });

  it("mutating statements are out of scope, and there are plenty of them", () => {
    // Hyperdrive never caches a write, so `now()` in an UPDATE is free — and
    // the estate uses it constantly. Asserted so a future reader does not
    // "tidy up" those into the rule above and start binding timestamps that
    // the database should be stamping.
    const writes = all.filter((s) => /^\s*(INSERT|UPDATE|DELETE)\s/i.test(s.sql));
    expect(writes.length).toBeGreaterThan(50);
    expect(writes.some((w) => /\bnow\s*\(\)/i.test(w.sql))).toBe(true);
  });
});
