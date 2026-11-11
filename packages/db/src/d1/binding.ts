// Structural types for the Cloudflare D1 binding (openproduct-standalone OPN,
// D1 slice proof).
//
// ADAPTED FROM the cirrus baseline's D1 port, `packages/db/src/d1/binding.ts`
// in pullely/ackstack (read at 20c7e1cd). Declared here rather than imported
// from `@cloudflare/workers-types` for the same reason cirrus gives: the
// package stays runtime- and dependency-free, the Worker that owns the binding
// satisfies these shapes exactly, and a test can hand in miniflare's binding.
//
// One addition to cirrus: `batch()`. D1 has no interactive transaction; an
// atomic multi-statement write is a statement list decided up front and sent
// as one `batch()` (one implicit transaction, one round trip, one query
// against the per-invocation limit).

export interface D1Meta {
  changes?: number;
  last_row_id?: number;
  rows_read?: number;
  rows_written?: number;
  duration?: number;
  /** Server-side SQL execution time, as D1 reports it (local workerd fills it too). */
  timings?: { sql_duration_ms?: number };
}

export interface D1Result<T = Record<string, unknown>> {
  results?: T[];
  success?: boolean;
  meta?: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Binding {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
