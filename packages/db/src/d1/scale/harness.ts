// Shared by the D1 scale suites (OPN D1 slice): timing, the report line, and
// reading a SQLite query plan.

import type { D1SqlExecutor, D1Statement } from "../executor.js";

/** Opt-in, like OS0's baseline: `D1_SCALE=1` (suite size) or `D1_SCALE=full` (365 days of ingestion). */
export const D1_SCALE = process.env.D1_SCALE ?? "";

export interface Timing {
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly runs: number;
}

/** Run `fn` `runs` times (after `warmup` unmeasured runs), in ms. */
export async function time(fn: () => Promise<unknown>, runs = 7, warmup = 1): Promise<Timing> {
  for (let i = 0; i < warmup; i += 1) await fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const t = performance.now();
    await fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  const round = (v: number) => Math.round(v * 10) / 10;
  return { median: round(samples[Math.floor(samples.length / 2)]!), min: round(samples[0]!), max: round(samples[samples.length - 1]!), runs };
}

/** One measured operation, printed as a machine-readable line PROOF.md is built from. */
export function report(entry: Record<string, unknown>): void {
  process.stdout.write(`D1SCALE ${JSON.stringify(entry)}\n`);
}

/** EXPLAIN QUERY PLAN for one recorded statement, with its own parameters bound. */
export async function planOf(sql: D1SqlExecutor, statement: D1Statement): Promise<string[]> {
  const res = await sql.execute<{ detail: string }>(`EXPLAIN QUERY PLAN ${statement.text}`, [...(statement.params ?? [])]);
  return res.rows.map((r) => r.detail);
}

/**
 * The tables a plan reads WHOLE — `SCAN t` with no index — as opposed to
 * `SCAN t USING [COVERING] INDEX i` (an ordered index walk, Postgres's Index
 * Scan without a bound) or `SEARCH t USING …` (a seek). SQLite's `SCAN t` is
 * Postgres's `Seq Scan`.
 */
export function fullScans(plan: readonly string[], statement: string): string[] {
  // SQLite's plan names a table by its ALIAS (`SCAN p`), so the statement's
  // own FROM/JOIN clauses say which table `p` is. (The first draft of this
  // check compared aliases to table names and passed with an empty allowlist
  // while `SCAN p` read every profile — caught by reading the plans.)
  const aliases = new Map<string, Set<string>>();
  const add = (name: string, table: string) => aliases.set(name, (aliases.get(name) ?? new Set()).add(table));
  const clause = /\b(?:FROM|JOIN|UPDATE|INTO)\s+([A-Za-z_]\w*)(?:\s+(?:AS\s+)?([A-Za-z_]\w*))?/gi;
  const keywords = new Set(["where", "join", "left", "inner", "on", "set", "select", "group", "order", "limit", "values", "using", "cross"]);
  for (const m of statement.matchAll(clause)) {
    const table = m[1]!;
    add(table, table);
    if (m[2] && !keywords.has(m[2].toLowerCase())) add(m[2], table);
  }
  // A name the plan MATERIALIZEs or runs as a CO-ROUTINE is a subquery or CTE.
  const subqueries = new Set(plan.flatMap((line) => /^(?:MATERIALIZE|CO-ROUTINE) (\S+)/.exec(line.trim())?.[1] ?? []));
  const out: string[] = [];
  for (const line of plan) {
    const m = /^SCAN (\w+)(?: AS \w+)?(.*)$/.exec(line.trim());
    if (m && !subqueries.has(m[1]!) && !/USING (COVERING )?INDEX|USING INTEGER PRIMARY KEY|USING PRIMARY KEY|VIRTUAL TABLE/.test(m[2] ?? "")) {
      out.push(...(aliases.get(m[1]!) ?? [m[1]!]));
    }
  }
  return out;
}

/** The watched tables — the slice's tables that grow with the corpus. */
export const WATCHED: readonly string[] = [
  "profiles", "catalog_cards", "metrics", "search_index", "search_index_terms", "role_openings", "product_media",
];

/** The corpus's search documents — now beside the corpus itself (Workers-safe, used by the probe Worker). */
export { corpusDocs } from "./corpus.js";
