// The baseline (openproduct-scale OS0).
//
// Every public read, timed and explained against the scale corpus — five
// thousand listings, a year of ingestion at the cap, a year of snapshots —
// and written down before anything is optimised, the way OPP recorded its
// first production measurement and WC recorded the audit.
//
// OPT-IN: `OS0_BASELINE=1` (`pnpm --filter @openproduct/db baseline`). The
// corpus takes about a minute to build and the point of the run is the
// numbers it prints, which belong in the epic's status document, not in a
// suite that runs on every push. OS4 is the assertion that runs every time;
// this is the measurement.

import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SCALE_CORPUS, loadCorpus, type CorpusReport } from "./corpus.js";
import { contextFor, migratedDb } from "./harness.js";
import { PUBLIC_READS, explain, planShape, recordingExecutor, seqScans, type PlanNode } from "./probes.js";
import { createOpenproductRepository } from "../repository.js";

const ENABLED = process.env.OS0_BASELINE === "1";
const RUNS = 3;

interface BaselineRow {
  readonly read: string;
  readonly route: string;
  readonly statements: number;
  readonly medianMs: number;
  readonly rows: number;
  readonly plan: string;
  readonly seqScans: string;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

function loadTable(report: CorpusReport): string {
  const lines = ["| table | rows | ms |", "|---|---:|---:|"];
  for (const s of report.steps) lines.push(`| ${s.table} | ${s.rows.toLocaleString("en-US")} | ${s.ms} |`);
  lines.push(`| **total** | | **${report.totalMs}** |`);
  return lines.join("\n");
}

function readsTable(rows: readonly BaselineRow[]): string {
  const lines = ["| read | route | statements | median ms | rows | plan |", "|---|---|---:|---:|---:|---|"];
  for (const r of rows) {
    lines.push(`| \`${r.read}\` | ${r.route} | ${r.statements} | ${r.medianMs} | ${r.rows} | ${r.plan}${r.seqScans ? ` — **seq: ${r.seqScans}**` : ""} |`);
  }
  return lines.join("\n");
}

describe.skipIf(!ENABLED)("OS0 — the baseline", () => {
  it("builds the corpus in under two minutes and names the three slowest public reads", async () => {
    const scale = await migratedDb();
    const report = await loadCorpus(scale.sql, SCALE_CORPUS);
    expect(report.totalMs).toBeLessThan(120_000);

    const ctx = await contextFor(scale.repo);
    const recorder = recordingExecutor(scale.sql);
    const repo = createOpenproductRepository(recorder.sql);
    const rows: BaselineRow[] = [];
    for (const probe of PUBLIC_READS) {
      const times: number[] = [];
      let rowsOut = 0;
      for (let i = 0; i < RUNS; i += 1) {
        recorder.statements.length = 0;
        const t = Date.now();
        const out = await probe.run(repo, ctx);
        times.push(Date.now() - t);
        rowsOut = Array.isArray(out) ? out.length : out instanceof Map ? out.size : out === null ? 0 : 1;
      }
      const plans: PlanNode[] = [];
      for (const statement of recorder.statements) plans.push(await explain(scale.sql, statement, true));
      rows.push({
        read: probe.name,
        route: probe.route,
        statements: recorder.statements.length,
        medianMs: median(times),
        rows: rowsOut,
        plan: plans.map(planShape).join(" · ").slice(0, 160),
        seqScans: [...new Set(plans.flatMap(seqScans))].join(", "),
      });
    }
    rows.sort((a, b) => b.medianMs - a.medianMs);

    const slowest = rows.slice(0, 3).map((r) => `${r.read} (${r.medianMs} ms)`);
    const doc = [
      `# OS0 baseline — ${new Date().toISOString().slice(0, 10)}`,
      "",
      `Corpus: ${SCALE_CORPUS.listings.toLocaleString("en-US")} listings · ${SCALE_CORPUS.days} days of ingestion at ${SCALE_CORPUS.observationsPerDay} observations a day · ${SCALE_CORPUS.snapshotDays} days of snapshots · ${SCALE_CORPUS.endorsements.toLocaleString("en-US")} endorsements (1 in ${SCALE_CORPUS.discountedEvery} discounted).`,
      "",
      "## The load",
      "",
      loadTable(report),
      "",
      "## The reads, slowest first",
      "",
      readsTable(rows),
      "",
      `Three slowest: ${slowest.join(" · ")}.`,
      "",
    ].join("\n");
    process.stdout.write(`${doc}\n`);
    if (process.env.OS0_BASELINE_OUT) writeFileSync(process.env.OS0_BASELINE_OUT, doc);

    expect(rows.length).toBe(PUBLIC_READS.length);
    expect(slowest).toHaveLength(3);
  }, 900_000);
});
