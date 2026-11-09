// POST /load?size=suite|full&step=N[&count=K] — the corpus, a step at a time
// (openproduct-standalone OPN-2).
//
// The plan is `d1SliceCorpusPlan` from `@openproduct/db/d1/corpus` — the same
// statements `loadD1SliceCorpus` runs in the local scale suites, generated
// inside the database (four bound values each, no row crosses the wire), each
// bounded to 50,000 rows. One request runs `count` of them (default 1), so no
// invocation comes near the Worker's CPU or query limits, and every
// statement's own `meta.timings` is on record: the proof that each stays
// under D1's 30 s per query is in these responses.
//
// Step 0 refuses a database that already holds listings (POST /reset first),
// and records the size, so a later step, /bench and /export know which corpus
// is there.

import { d1SliceCorpusPlan } from "@openproduct/db/d1/corpus";

import { NOW, ProbeError, SIZES, intParam, readMeta, sizeParam, writeMeta, type ProbeContext } from "../probe.js";

export async function loadRoute(ctx: ProbeContext, url: URL): Promise<unknown> {
  const size = sizeParam(url);
  const plan = d1SliceCorpusPlan(SIZES[size], NOW);
  const step = intParam(url, "step", 0, 0, plan.length - 1);
  const count = intParam(url, "count", 1, 1, plan.length);

  if (step === 0) {
    const present = await ctx.sql.execute<{ n: number }>(`SELECT count(*) AS n FROM profiles`);
    if (Number(present.rows[0]?.n ?? 0) > 0) throw new ProbeError(409, "the database already holds a corpus: POST /reset first");
    await writeMeta(ctx.sql, "size", size);
    await writeMeta(ctx.sql, "loaded", "false");
  } else {
    const recorded = await readMeta(ctx.sql, "size");
    if (recorded !== size) throw new ProbeError(409, `step ${step} of size ${size}, but the load in progress is ${recorded ?? "none"}`);
  }

  const executed = [];
  const end = Math.min(plan.length, step + count);
  for (let index = step; index < end; index += 1) {
    const statement = plan[index]!;
    const mark = ctx.recorder.mark();
    await ctx.sql.execute(statement.text, [...statement.params]);
    const [round] = ctx.recorder.since(mark);
    executed.push({
      index,
      table: statement.table,
      rows: statement.rows,
      wallMs: Math.round(round?.wallMs ?? 0),
      sqlMs: round?.sqlMs ?? 0,
      durationMs: round?.durationMs ?? 0,
      rowsWritten: round?.rowsWritten ?? 0,
      databaseBytes: round?.sizeAfter ?? null,
    });
  }
  const done = end >= plan.length;
  if (done) await writeMeta(ctx.sql, "loaded", "true");
  return { size, total: plan.length, done, nextStep: done ? null : end, executed };
}
