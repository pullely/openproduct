// The SqlExecutor seam, backed by Cloudflare D1 (openproduct-standalone OPN,
// D1 slice proof).
//
// ADAPTED FROM the cirrus baseline's `packages/db/src/d1/executor.ts` in
// pullely/ackstack (read at 20c7e1cd), which ports the same platform from
// Postgres to D1. The interface is openproduct's own (`../executor.ts`), which
// cirrus's matches line for line. Three differences from cirrus, each on
// purpose:
//
//   1. `batch(statements)` — D1's atomic multi-statement write, exposed. A
//      statement list decided up front runs in one implicit transaction: all
//      of it lands or none of it does, and it costs ONE query against the
//      Worker's per-invocation limit and one round trip. Every multi-statement
//      write in the D1 repository goes through it.
//   2. NO `transaction(fn)`. Cirrus keeps one that runs the callback's
//      statements with no rollback, so that call sites stay visible. Here it
//      is absent: a caller that needs atomicity must say so in a shape D1 can
//      honour (`batch`), and a caller that does not, does not need the word.
//   3. `$n` → `?n` rather than `?` per occurrence (see `sql.ts`).
//
// `rowCount` is `rows.length`, as on cirrus (and as on openproduct's own
// production executor, which reports `result.length` from postgres.js): a
// write whose count matters says `RETURNING`, and the count is the rows it
// returned. D1's `meta.changes` is NOT substituted — that would make
// `rowCount === 0` mean two different things depending on the engine
// (factory RUNBOOK trap 22).

import type { SqlExecutor, SqlExecutorResult, SqlRow } from "../executor.js";

import type { D1Binding, D1PreparedStatement, D1Result } from "./binding.js";
import { toBindValue, translatePlaceholders } from "./sql.js";

/** One statement of a batch: the same `(text, params)` an `execute` takes. */
export interface D1Statement {
  readonly text: string;
  readonly params?: readonly unknown[];
}

export interface D1SqlExecutor extends SqlExecutor {
  /**
   * Run every statement, in order, atomically: D1 wraps a batch in one
   * transaction, so a failure anywhere rolls back everything before it.
   * Results come back one per statement, in order.
   */
  batch(statements: readonly D1Statement[]): Promise<SqlExecutorResult[]>;
}

/**
 * Told of every round trip (an `execute` is one statement; a `batch` is
 * however many it carried). DURATION AND COUNT only, never the statement or
 * its parameters — the same rule as the Postgres executor's `QueryObserver`.
 */
export interface D1RoundObserver {
  /** `sqlMs`: D1's own server-side execution time for the round (meta.timings), summed over a batch. */
  onRound(kind: "execute" | "batch", statements: number, durationMs: number, sqlMs: number): void;
}

function sqlMsOf(meta: D1Result["meta"]): number {
  return meta?.timings?.sql_duration_ms ?? meta?.duration ?? 0;
}

export function createD1Executor(
  binding: D1Binding,
  observer?: D1RoundObserver,
): D1SqlExecutor & { dispose(): Promise<void> } {
  function prepare(text: string, params: readonly unknown[] | undefined): D1PreparedStatement {
    const { text: sql, values } = translatePlaceholders(text, params ?? []);
    const statement = binding.prepare(sql);
    return values.length > 0 ? statement.bind(...values.map(toBindValue)) : statement;
  }

  return {
    async execute<T extends SqlRow = SqlRow>(
      text: string,
      params?: unknown[],
    ): Promise<SqlExecutorResult<T>> {
      const bound = prepare(text, params);
      const startedAt = Date.now();
      let sqlMs = 0;
      try {
        const result = await bound.all<T>();
        sqlMs = sqlMsOf(result.meta);
        const rows = (result.results ?? []) as T[];
        return { rows, rowCount: rows.length };
      } finally {
        observer?.onRound("execute", 1, Date.now() - startedAt, sqlMs);
      }
    },

    async batch(statements: readonly D1Statement[]): Promise<SqlExecutorResult[]> {
      if (statements.length === 0) return [];
      const bound = statements.map((s) => prepare(s.text, s.params));
      const startedAt = Date.now();
      let sqlMs = 0;
      try {
        const results = await binding.batch(bound);
        sqlMs = results.reduce((sum, r) => sum + sqlMsOf(r.meta), 0);
        return results.map((result) => {
          const rows = (result.results ?? []) as SqlRow[];
          return { rows, rowCount: rows.length };
        });
      } finally {
        observer?.onRound("batch", statements.length, Date.now() - startedAt, sqlMs);
      }
    },

    async dispose(): Promise<void> {
      // Nothing to release: a D1 binding holds no connection.
    },
  };
}
