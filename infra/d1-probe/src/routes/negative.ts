// POST /negative[?probe=a,b] — the limits local workerd lets through
// (openproduct-standalone OPN-2; PROOF.md "the remote test", step 5).
//
// Each probe is a statement remote D1 must REFUSE. Local D1 (miniflare,
// workerd 1.20261104.1) accepts the first three — which is why
// `packages/db/src/d1/remote-limits.ts` guards them statically — and this
// route is how the guard is shown to match the service:
//
//   args34     — a 34-argument json_object        (D1: ≤ 32 arguments per SQL function)
//   row2mb     — a 2.1 MB string STORED in a row  (D1: ≤ 2 MB per string, BLOB or row)
//   result50mb — a 56 MB result, 56 rows of 1 MB  (D1: ≤ 50 MB per query result, enforced since 2026-11-04)
//   like51     — a 60-byte bound LIKE pattern     (D1: ≤ 50 bytes per LIKE/GLOB pattern)
//
// and one observation, which passes or fails nothing:
//
//   bound2mb   — a 2.1 MB string bound in a SELECT, never stored. The first
//                remote run (2026-11-11) ACCEPTED this. The 2 MB limit is on
//                what is stored, not on what is bound, so this probe records
//                the service's answer and row2mb is the test of the limit.
//
// An answer of "D1 DB is overloaded" is NOT a refusal. It is the service
// rate-limiting the database over a 10-second window, and it says nothing
// about the limit being probed. Such answers come back as outcome
// "overloaded", and the smoke waits the window out and asks again. On the
// first remote run args34 was "refused" that way, which proved nothing.
//
// The result probe is built in the database (a 56-row recursive CTE of
// `hex(zeroblob(500000))`, each row 1,000,000 characters — under the 2 MB row
// limit, over the result limit by 6 MB, and it stops at 56). If a service
// ever accepted it, only its size comes back, never its content. Each probe
// is one statement, so the smoke asks for them one request at a time: a
// Worker that ran out of memory on an accepted result loses one probe, not
// the report.

import { errorText } from "../instrument.js";
import { ProbeError, type ProbeContext } from "../probe.js";

/** D1 rate-limiting the database (a 10-second window), not refusing a statement. */
export function isOverload(text: string): boolean {
  return /D1 DB is overloaded|Too many resources consumed/i.test(text);
}

interface NegativeProbe {
  readonly limit: string;
  /** "refused" (default): the service must refuse it. "observed": record the answer, judge nothing. */
  readonly expected?: "refused" | "observed";
  /** Run first, and it must succeed (e.g. a scratch table for a stored-size probe). */
  readonly setup?: string;
  /** Run afterwards, whatever happened, so the probe database is left as it was found. */
  readonly cleanup?: string;
  readonly sql: string;
  readonly params: () => unknown[];
  /** What came back, summarised — never echoed. */
  readonly accepted: (rows: Record<string, unknown>[]) => Record<string, unknown>;
}

const pairs = Array.from({ length: 17 }, (_, i) => `'k${i + 1}', ${i + 1}`).join(", ");
export const RESULT_ROWS = 56;
export const RESULT_ROW_CHARS = 1_000_000;

export const NEGATIVE_PROBES: Record<string, NegativeProbe> = {
  args34: {
    limit: "at most 32 arguments per SQL function",
    sql: `SELECT json_object(${pairs}) AS v`,
    params: () => [],
    accepted: (rows) => ({ rows: rows.length, keys: Object.keys(JSON.parse(String(rows[0]?.v ?? "{}")) as object).length }),
  },
  row2mb: {
    limit: "at most 2,000,000 bytes per string, BLOB or row",
    setup: `CREATE TABLE IF NOT EXISTS negative_scratch (v TEXT NOT NULL)`,
    sql: `INSERT INTO negative_scratch (v) VALUES ($1) RETURNING length(v) AS n`,
    params: () => ["x".repeat(2_100_000)],
    cleanup: `DELETE FROM negative_scratch`,
    accepted: (rows) => ({ storedLength: Number(rows[0]?.n ?? 0) }),
  },
  bound2mb: {
    limit: "a 2.1 MB value bound in a SELECT, never stored (observation)",
    expected: "observed",
    sql: `SELECT length($1) AS n`,
    params: () => ["x".repeat(2_100_000)],
    accepted: (rows) => ({ boundLength: Number(rows[0]?.n ?? 0) }),
  },
  result50mb: {
    limit: "at most 50 MB per query result",
    sql: `WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < ${RESULT_ROWS})
          SELECT n, hex(zeroblob(${RESULT_ROW_CHARS / 2})) AS chunk FROM r`,
    params: () => [],
    accepted: (rows) => ({ rows: rows.length, bytes: rows.reduce((sum, row) => sum + String(row.chunk ?? "").length, 0) }),
  },
  like51: {
    limit: "at most 50 bytes per LIKE or GLOB pattern",
    sql: `SELECT 'x' LIKE $1 AS m`,
    params: () => [`%${"a".repeat(58)}%`],
    accepted: (rows) => ({ matched: rows[0]?.m ?? null }),
  },
};

export async function negativeRoute(ctx: ProbeContext, url: URL): Promise<unknown> {
  const requested = (url.searchParams.get("probe") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const name of requested) {
    if (!Object.hasOwn(NEGATIVE_PROBES, name)) {
      throw new ProbeError(400, `unknown probe ${JSON.stringify(name)}; probes: ${Object.keys(NEGATIVE_PROBES).join(", ")}`);
    }
  }
  const names = requested.length > 0 ? requested : Object.keys(NEGATIVE_PROBES);
  const probes = [];
  for (const name of names) {
    const probe = NEGATIVE_PROBES[name]!;
    const expected = probe.expected ?? "refused";
    if (probe.setup) await ctx.sql.execute(probe.setup, []);
    const mark = ctx.recorder.mark();
    try {
      // Straight through the binding: these are statements the repository must never issue.
      const res = await ctx.sql.execute(probe.sql, probe.params());
      const round = ctx.recorder.since(mark).at(-1);
      probes.push({ probe: name, limit: probe.limit, expected, outcome: "accepted", detail: probe.accepted(res.rows), wallMs: Math.round(round?.wallMs ?? 0) });
    } catch (error) {
      const round = ctx.recorder.since(mark).at(-1);
      const text = errorText(error);
      probes.push({ probe: name, limit: probe.limit, expected, outcome: isOverload(text) ? "overloaded" : "refused", error: text, wallMs: Math.round(round?.wallMs ?? 0) });
    } finally {
      if (probe.cleanup) await ctx.sql.execute(probe.cleanup, []).catch(() => undefined);
    }
  }
  return { probes };
}
