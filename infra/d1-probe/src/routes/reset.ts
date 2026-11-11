// POST /reset — empty the probe's tables (openproduct-standalone OPN-2).
//
// Children first, one statement each (each has its own 30 s; atomicity does
// not matter for emptying a throwaway database), then the two singletons back
// to the state the migration seeds — the search index DIRTY at the
// database's clock, the catalogue never computed — and the probe's own
// bookkeeping cleared. The schema stays.

import { SLICE_TABLES_CHILDREN_FIRST } from "@openproduct/db/d1";

import { PROBE_META_TABLE, type ProbeContext } from "../probe.js";

const SINGLETONS = new Set(["search_index_state", "catalog_state"]);
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export async function resetRoute(ctx: ProbeContext): Promise<unknown> {
  const deleted: Record<string, { rows: number; wallMs: number; sqlMs: number }> = {};
  const run = async (label: string, text: string) => {
    const mark = ctx.recorder.mark();
    await ctx.sql.execute(text);
    const [round] = ctx.recorder.since(mark);
    deleted[label] = { rows: round?.changes ?? 0, wallMs: Math.round(round?.wallMs ?? 0), sqlMs: round?.sqlMs ?? 0 };
  };
  for (const table of SLICE_TABLES_CHILDREN_FIRST) {
    if (!SINGLETONS.has(table)) await run(table, `DELETE FROM ${table}`);
  }
  await run(
    "search_index_state",
    `UPDATE search_index_state SET built_at = NULL, dirty_at = ${NOW_SQL}, last_error = NULL, last_error_at = NULL`,
  );
  await run(
    "catalog_state",
    `UPDATE catalog_state
        SET computed_at = NULL, card_count = 0, today_count = 0, week_count = 0, month_count = 0,
            total_count = 0, last_error = NULL, last_error_at = NULL`,
  );
  await run(PROBE_META_TABLE, `DELETE FROM ${PROBE_META_TABLE}`);
  const size = ctx.recorder.rounds.at(-1)?.sizeAfter ?? null;
  return { reset: deleted, databaseBytes: size };
}
