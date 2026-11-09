// Every D1 round the probe makes, with the meta D1 returns for it
// (openproduct-standalone OPN-2, the remote D1 probe).
//
// The slice repository talks to `@openproduct/db/d1`'s structural binding.
// This wraps the Worker's real binding (a `D1Database`, or a
// `D1DatabaseSession` from `withSession()`) in that same shape and records,
// per round: the wall-clock time measured inside the Worker, and D1's own
// `meta` — `timings.sql_duration_ms` (SQL time on the database instance),
// `duration`, rows read/written, `size_after`, and where the query ran
// (`served_by_region`, `served_by_colo`, `served_by_primary`).
//
// WALL-CLOCK INSIDE A WORKER: `performance.now()` only advances across I/O
// (Spectre mitigation), so a measured round is the D1 round trip — exactly
// the thing the probe exists to measure — and not the CPU spent between.

import type { D1Binding, D1PreparedStatement, D1Result } from "@openproduct/db/d1";

/** The D1 surface the probe wraps: the binding itself, or a session of it. */
export type RawD1 = Pick<D1Database, "prepare" | "batch"> | D1DatabaseSession;

export interface RoundMeta {
  readonly kind: "execute" | "batch";
  readonly statements: number;
  readonly wallMs: number;
  /** Σ `meta.timings.sql_duration_ms` over the round's statements. */
  readonly sqlMs: number;
  /** The slowest single statement's `sql_duration_ms`. */
  readonly maxStatementSqlMs: number;
  /** Σ `meta.duration`. */
  readonly durationMs: number;
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly changes: number;
  readonly sizeAfter: number | null;
  readonly servedByRegion: string | null;
  readonly servedByColo: string | null;
  readonly servedByPrimary: boolean | null;
  readonly totalAttempts: number | null;
  readonly error: string | null;
}

export interface Recorder {
  readonly rounds: RoundMeta[];
  /** A position in `rounds`; `since(mark)` is what happened after it. */
  mark(): number;
  since(mark: number): RoundMeta[];
}

export function createRecorder(): Recorder {
  const rounds: RoundMeta[] = [];
  return {
    rounds,
    mark: () => rounds.length,
    since: (mark) => rounds.slice(mark),
  };
}

type LooseMeta = Partial<D1Meta> & Record<string, unknown>;

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** An error's message, bounded — D1's text is the evidence, never the statement or its values. */
export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

function roundOf(kind: RoundMeta["kind"], metas: readonly (LooseMeta | undefined)[], wallMs: number, error: string | null, statements: number): RoundMeta {
  let sqlMs = 0;
  let maxStatementSqlMs = 0;
  let durationMs = 0;
  let rowsRead = 0;
  let rowsWritten = 0;
  let changes = 0;
  let sizeAfter: number | null = null;
  let servedByRegion: string | null = null;
  let servedByColo: string | null = null;
  let servedByPrimary: boolean | null = null;
  let totalAttempts: number | null = null;
  for (const meta of metas) {
    if (!meta) continue;
    const statementSql = num(meta.timings?.sql_duration_ms);
    sqlMs += statementSql;
    maxStatementSqlMs = Math.max(maxStatementSqlMs, statementSql);
    durationMs += num(meta.duration);
    rowsRead += num(meta.rows_read);
    rowsWritten += num(meta.rows_written);
    changes += num(meta.changes);
    if (typeof meta.size_after === "number") sizeAfter = meta.size_after;
    if (typeof meta.served_by_region === "string") servedByRegion = meta.served_by_region;
    if (typeof meta.served_by_colo === "string") servedByColo = meta.served_by_colo;
    if (typeof meta.served_by_primary === "boolean") {
      servedByPrimary = servedByPrimary === null ? meta.served_by_primary : servedByPrimary && meta.served_by_primary;
    }
    if (typeof meta.total_attempts === "number") totalAttempts = Math.max(totalAttempts ?? 0, meta.total_attempts);
  }
  return {
    kind,
    statements,
    wallMs,
    sqlMs,
    maxStatementSqlMs,
    durationMs,
    rowsRead,
    rowsWritten,
    changes,
    sizeAfter,
    servedByRegion,
    servedByColo,
    servedByPrimary,
    totalAttempts,
    error,
  };
}

class InstrumentedStatement implements D1PreparedStatement {
  constructor(
    readonly inner: D1PreparedStatement,
    private readonly recorder: Recorder,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new InstrumentedStatement(this.inner.bind(...values), this.recorder);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const startedAt = performance.now();
    try {
      const result = await this.inner.all<T>();
      this.recorder.rounds.push(roundOf("execute", [result.meta as LooseMeta | undefined], performance.now() - startedAt, null, 1));
      return result;
    } catch (error) {
      this.recorder.rounds.push(roundOf("execute", [], performance.now() - startedAt, errorText(error), 1));
      throw error;
    }
  }
}

/** `raw` as the slice repository's binding, every round recorded into `recorder`. */
export function instrumentD1(raw: RawD1, recorder: Recorder): D1Binding {
  const db = raw as unknown as D1Binding;
  return {
    prepare(query: string): D1PreparedStatement {
      return new InstrumentedStatement(db.prepare(query), recorder);
    },
    async batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const inner = statements.map((s) => (s instanceof InstrumentedStatement ? s.inner : s));
      const startedAt = performance.now();
      try {
        const results = await db.batch<T>(inner);
        recorder.rounds.push(
          roundOf("batch", results.map((r) => r.meta as LooseMeta | undefined), performance.now() - startedAt, null, statements.length),
        );
        return results;
      } catch (error) {
        recorder.rounds.push(roundOf("batch", [], performance.now() - startedAt, errorText(error), statements.length));
        throw error;
      }
    },
  };
}

/** Several rounds as one measured operation. */
export interface OperationMeta {
  readonly rounds: number;
  readonly statements: number;
  readonly sqlMs: number;
  readonly maxStatementSqlMs: number;
  readonly durationMs: number;
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly sizeAfter: number | null;
  /** true only if every round says it ran on the primary; null when D1 did not say (local). */
  readonly servedByPrimary: boolean | null;
  readonly servedByRegion: string | null;
  readonly servedByColo: string | null;
}

export function foldRounds(rounds: readonly RoundMeta[]): OperationMeta {
  let servedByPrimary: boolean | null = null;
  let servedByRegion: string | null = null;
  let servedByColo: string | null = null;
  let sizeAfter: number | null = null;
  for (const round of rounds) {
    if (round.servedByPrimary !== null) servedByPrimary = servedByPrimary === null ? round.servedByPrimary : servedByPrimary && round.servedByPrimary;
    servedByRegion = round.servedByRegion ?? servedByRegion;
    servedByColo = round.servedByColo ?? servedByColo;
    sizeAfter = round.sizeAfter ?? sizeAfter;
  }
  const sum = (pick: (r: RoundMeta) => number) => rounds.reduce((acc, r) => acc + pick(r), 0);
  return {
    rounds: rounds.length,
    statements: sum((r) => r.statements),
    sqlMs: sum((r) => r.sqlMs),
    maxStatementSqlMs: rounds.reduce((acc, r) => Math.max(acc, r.maxStatementSqlMs), 0),
    durationMs: sum((r) => r.durationMs),
    rowsRead: sum((r) => r.rowsRead),
    rowsWritten: sum((r) => r.rowsWritten),
    sizeAfter,
    servedByPrimary,
    servedByRegion,
    servedByColo,
  };
}
