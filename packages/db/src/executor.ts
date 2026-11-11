// VENDORED from the platform's `packages/db/src/hyperdrive/executor.ts`
// (openproduct-independence OX6a) — the generic Hyperdrive→postgres.js
// executor, byte-identical below this header. Vendored, like the migration
// runner (src/runner/), so that no `@saas/*` import crosses the product
// boundary: after the repo cut this file simply ships with the product.
// The platform copy stays canonical for the platform; fixes worth having
// land in both (they have not diverged since the OD0 extraction).

import postgres from "postgres";

export interface SqlRow {
  [column: string]: unknown;
}

export interface SqlExecutorResult<T extends SqlRow = SqlRow> {
  rows: T[];
  rowCount: number;
}

export interface SqlExecutor {
  execute<T extends SqlRow = SqlRow>(
    text: string,
    params?: unknown[],
  ): Promise<SqlExecutorResult<T>>;
}

export interface TransactionalSqlExecutor extends SqlExecutor {
  transaction<T>(fn: (executor: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlExecutorFactory {
  create(binding: { connectionString: string }): SqlExecutor & { dispose(): Promise<void> };
}

/**
 * Connection-level failures: the socket was gone BEFORE the statement was
 * written, so the query provably never ran and re-running it on a fresh
 * connection cannot double-apply a write.
 *
 * postgres.js raises these as `err.code`. Hyperdrive's local proxy ends
 * pooled sockets on its own schedule (idle reap, origin reconnect, pool
 * rotation), and a Worker that opened its client earlier in the same request
 * discovers it only at the next statement — mid-request, with the first
 * queries already succeeded. That asymmetry is what makes it so cruel to
 * diagnose: one handler's opening reads work and its later reads do not.
 */
const RETRYABLE_CONNECTION_CODES: ReadonlySet<string> = new Set([
  "CONNECTION_ENDED",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "ECONNRESET",
  "EPIPE",
]);

function isRetryableConnectionError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && RETRYABLE_CONNECTION_CODES.has(code);
}

// NOTE: Per-request client. A module-scoped reuse pool was attempted (task 0134)
// but the Cloudflare Workers runtime rejects reusing a postgres client/socket
// opened in one request from another ("Cannot perform I/O on behalf of a
// different request"), which broke membership/billing on stage and the
// self-heal retry did not reliably recover. Reverted to per-request creation.
// Any future reuse attempt MUST be canary-verified on stage before rollout.
/**
 * A JavaScript array, as Postgres reads one.
 *
 * The client below runs with `fetch_types: false` (Hyperdrive's proxy and
 * a revoked `pg_catalog` both recommend it), and without the type fetch
 * postgres.js cannot tell the server what an array IS: a JS array bound to
 * `= ANY($1)` — cast or not — arrives as the bare text of its first element
 * and the server answers `22P02 malformed array literal`. It surfaced as a
 * 500 on the public directory the moment it had one card, because the one
 * statement that binds a slug list (`latestMetricsForSlugs`) is skipped for
 * an empty one. The platform's membership repository met the same wall and
 * chose scalar IN-lists; here every array parameter is serialized ONCE, to
 * the literal form (`{"a","b"}`) the server parses against the call site's
 * cast (`ANY($n::text[])`, `ANY($n::uuid[])`). Elements are quoted and
 * backslash-escaped, nulls stay NULL, nested arrays nest. pglite (the test
 * harness) binds arrays natively and never sees this path — which is why a
 * static guard (array-params.test.ts) keeps every site cast.
 */
export function toPgArrayLiteral(values: readonly unknown[]): string {
  const parts = values.map((value) => {
    if (value === null || value === undefined) return "NULL";
    if (Array.isArray(value)) return toPgArrayLiteral(value);
    const text = value instanceof Date ? value.toISOString() : String(value);
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  });
  return `{${parts.join(",")}}`;
}

/** The parameters as the driver must see them: arrays as literals, the rest untouched. */
export function bindParams(params: readonly unknown[] | undefined): unknown[] {
  return (params ?? []).map((value) => (Array.isArray(value) ? toPgArrayLiteral(value) : value));
}

/**
 * Told the elapsed time of every statement this executor runs
 * (openproduct-performance OPP6).
 *
 * HERE RATHER THAN AT THE CALL SITES, because there are hundreds of those and
 * one of these. What it buys is the phase that actually answers "why was that
 * request slow": a handler doing four reads in parallel and a handler doing
 * four in sequence look identical from outside, and differ by three round
 * trips.
 *
 * It observes DURATION AND COUNT, never the statement or its parameters — the
 * parameters are the only tenant data on this path, and a timing hook is not
 * a reason to start carrying them.
 */
export interface QueryObserver {
  onQuery(durationMs: number): void;
}

export function createSqlExecutor(
  binding: { connectionString: string },
  clientFactory?: (connectionString: string) => postgres.Sql,
  observer?: QueryObserver,
): TransactionalSqlExecutor & { dispose(): Promise<void> } {
  const factory =
    clientFactory ??
    ((cs: string) =>
      postgres(cs, {
        max: 5,
        fetch_types: false,
        prepare: true,
      }));

  let sql = factory(binding.connectionString);
  // One reconnect per executor: a dead socket is worth exactly one fresh
  // client, never an unbounded loop against an origin that is actually down.
  let reconnected = false;

  return {
    async execute<T extends SqlRow = SqlRow>(
      text: string,
      params?: unknown[],
    ): Promise<SqlExecutorResult<T>> {
      const run = async (client: postgres.Sql) => {
        const startedAt = Date.now();
        try {
          const result = await client.unsafe(text, bindParams(params) as never[]);
          return {
            rows: result as unknown as T[],
            rowCount: result.length,
          };
        } finally {
          // A statement that THREW still cost its wait, and a request that was
          // slow because the database was refusing is exactly the one whose
          // timing must not silently read zero.
          observer?.onQuery(Date.now() - startedAt);
        }
      };
      try {
        return await run(sql);
      } catch (err) {
        if (reconnected || !isRetryableConnectionError(err)) throw err;
        // The socket died before this statement went out. Retire it and run
        // the statement once on a new client — otherwise every remaining
        // query of the request fails, and callers that read "no rows" out of
        // a failed read report the world as empty rather than unreachable.
        reconnected = true;
        // Visible on purpose. A retry that heals silently turns a measurable
        // infrastructure symptom into folklore — and the frequency of these
        // is exactly the evidence needed to tune pooling at the source. The
        // statement's first clause identifies the call site; parameters (the
        // only tenant data here) are never logged.
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "db.connection_reconnect",
            code: (err as { code?: string }).code ?? "unknown",
            statement: text.trim().split(/\s+/).slice(0, 4).join(" "),
          }),
        );
        const dead = sql;
        sql = factory(binding.connectionString);
        void dead.end({ timeout: 1 }).catch(() => {});
        return await run(sql);
      }
    },

    /**
     * Deliberately NOT retried, unlike `execute`.
     *
     * A single statement raising a connection error provably never reached
     * the server, so re-running it is free of consequence. A transaction is
     * not: `CONNECTION_CLOSED` can arrive AFTER a COMMIT was written but
     * before its acknowledgement, and re-running the body would then apply
     * everything twice. That is the classic in-doubt transaction, and no
     * amount of client-side cleverness resolves it — the only safe answers
     * are to fail and let the caller decide, or to make the work idempotent
     * and retry at the caller's level where the intent is known.
     *
     * So this fails honestly. Do not "fix" the asymmetry by wrapping this in
     * the same retry.
     */
    async transaction<T>(fn: (executor: SqlExecutor) => Promise<T>): Promise<T> {
      return sql.begin(async (txSql) => {
        const txExecutor: SqlExecutor = {
          async execute<R extends SqlRow = SqlRow>(
            text: string,
            params?: unknown[],
          ): Promise<SqlExecutorResult<R>> {
            const result = await txSql.unsafe(text, bindParams(params) as never[]);
            return {
              rows: result as unknown as R[],
              rowCount: result.length,
            };
          },
        };
        return fn(txExecutor);
      }) as Promise<T>;
    },

    async dispose(): Promise<void> {
      try {
        await sql.end({ timeout: 3 });
      } catch {
        // Disposal failure must not leak errors.
      }
    },
  };
}
