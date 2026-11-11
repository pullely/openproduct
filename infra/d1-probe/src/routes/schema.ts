// POST /schema — apply the slice migration, unchanged (openproduct-standalone OPN-2).
//
// The file is `packages/db/src/d1/migrations/0001_slice.sql`, bundled as a
// Text module and split with the same splitter the local suites use, then
// sent as ONE batch (atomic). It is idempotent by construction — every
// CREATE is IF NOT EXISTS and the singleton seeds are ON CONFLICT DO
// NOTHING — so a second call changes nothing, which the response shows.

import { splitSqlStatements } from "@openproduct/db/d1";
import sliceSql from "@openproduct/db/d1/slice.sql";

import { foldRounds } from "../instrument.js";
import { PROBE_META_TABLE, type ProbeContext } from "../probe.js";

/** The probe's own table: corpus size, load state, the Sessions marker. */
export const PROBE_SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS ${PROBE_META_TABLE} (key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID`,
];

export async function schemaRoute(ctx: ProbeContext): Promise<unknown> {
  const statements = [...splitSqlStatements(sliceSql), ...PROBE_SCHEMA];
  const mark = ctx.recorder.mark();
  await ctx.sql.batch(statements.map((text) => ({ text })));
  const applied = foldRounds(ctx.recorder.since(mark));
  const objects = await ctx.sql.execute<{ type: string; name: string }>(
    `SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') ORDER BY type, name`,
  );
  // SQLite's own objects (autoindexes, sqlite_stat1) and D1's (`_cf_KV`) are not the slice's.
  const ours = objects.rows.filter((o) => !o.name.startsWith("sqlite_") && !o.name.startsWith("_cf_"));
  const of = (type: string) => ours.filter((o) => o.type === type).map((o) => o.name);
  const singletons = await ctx.sql.execute<{ name: string; n: number }>(
    `SELECT 'search_index_state' AS name, count(*) AS n FROM search_index_state
     UNION ALL SELECT 'catalog_state', count(*) FROM catalog_state`,
  );
  return {
    statements: statements.length,
    tables: of("table"),
    indexes: of("index"),
    triggers: of("trigger"),
    singletonRows: Object.fromEntries(singletons.rows.map((r) => [r.name, Number(r.n)])),
    d1: applied,
  };
}
