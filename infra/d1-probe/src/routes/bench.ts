// POST /bench?runs=50[&op=a,b] — the slice's methods, timed from inside
// Cloudflare (openproduct-standalone OPN-2; PROOF.md "the remote test", step 4).
//
// Each op runs `runs` times. A run is timed inside the Worker (wall-clock
// across the D1 round trips) and carries D1's own meta for exactly the rounds
// the method made: `timings.sql_duration_ms`, `duration`, rows, and where it
// ran. Anything an op needs that is not the method itself (emptying the
// catalogue before a cold rebuild, clearing the index before a cold replace,
// finding the deepest cursor) happens outside the timed window.
//
// Every run's RESULT is checked too — a fast wrong answer is not a pass.
//
// The response carries the raw samples as well as p50/p95, so a caller can
// split runs over several requests (the smoke does: each request stays well
// inside the Worker's per-invocation query limit and a few tens of seconds)
// and summarise the union with the same nearest-rank rule.
//
// `sessions` repeats the reads through the Sessions API straight after a
// write (a quiet rebuild plus a marker), under three constraints —
// first-unconstrained, first-primary, and the writer's bookmark — and counts
// how often the first read of a session saw a stale marker. Reads through the
// plain binding (every other op) always reach the primary: that is the
// without-replication baseline from the same database.

import { DEFAULT_MAX_PARAM_BYTES, chunkJsonArrays, type D1SliceRepository } from "@openproduct/db/d1";
import { corpusDocs, d1SliceCorpusPlan } from "@openproduct/db/d1/corpus";

import { foldRounds, errorText } from "../instrument.js";
import {
  INPUT,
  NOW,
  ProbeError,
  SIZES,
  intParam,
  loadedSize,
  readMeta,
  writeMeta,
  type Instrumented,
  type ProbeContext,
  type ProbeSize,
} from "../probe.js";
import { summarize } from "../stats.js";

type PageInput = Parameters<D1SliceRepository["listCataloguePage"]>[0];
type Cursor = PageInput["cursor"];
type SearchDoc = Parameters<D1SliceRepository["replaceSearchIndex"]>[1][number];

export interface Sample {
  readonly wallMs: number;
  readonly sqlMs: number;
  readonly maxStatementSqlMs: number;
  readonly durationMs: number;
  readonly rounds: number;
  readonly statements: number;
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly servedByPrimary: boolean | null;
  readonly servedByRegion: string | null;
}

const r2 = (value: number) => Math.round(value * 100) / 100;

/** Time one call on `on`, with the meta of exactly the rounds it made. */
async function measure<T>(on: Instrumented, fn: () => Promise<T>): Promise<{ result: T; sample: Sample }> {
  const mark = on.recorder.mark();
  const startedAt = performance.now();
  const result = await fn();
  const wallMs = performance.now() - startedAt;
  const meta = foldRounds(on.recorder.since(mark));
  return {
    result,
    sample: {
      wallMs: r2(wallMs),
      sqlMs: r2(meta.sqlMs),
      maxStatementSqlMs: r2(meta.maxStatementSqlMs),
      durationMs: r2(meta.durationMs),
      rounds: meta.rounds,
      statements: meta.statements,
      rowsRead: meta.rowsRead,
      rowsWritten: meta.rowsWritten,
      servedByPrimary: meta.servedByPrimary,
      servedByRegion: meta.servedByRegion,
    },
  };
}

export function summaryOf(samples: readonly Sample[]) {
  return {
    wallMs: summarize(samples.map((s) => s.wallMs)),
    sqlMs: summarize(samples.map((s) => s.sqlMs)),
    durationMs: summarize(samples.map((s) => s.durationMs)),
    maxStatementSqlMs: samples.reduce((m, s) => Math.max(m, s.maxStatementSqlMs), 0),
    servedByPrimary: {
      primary: samples.filter((s) => s.servedByPrimary === true).length,
      replica: samples.filter((s) => s.servedByPrimary === false).length,
      unreported: samples.filter((s) => s.servedByPrimary === null).length,
    },
    regions: [...new Set(samples.map((s) => s.servedByRegion).filter((r): r is string => r !== null))].sort(),
  };
}

// ─── what the ops share ───────────────────────────────────────────────────

interface BenchState {
  readonly size: ProbeSize;
  readonly listings: number;
  readonly docs: SearchDoc[];
}

const SEARCHES = {
  common: ["product"],
  rare: ["00060"],
  multi: ["00060", "rust", "nope"],
} as const;
const SEARCH_LIMIT = 50;
const PAGE_LIMIT = 100;

/** How many candidates a search MUST return: every matching document, up to the limit. */
function expectedCandidates(docs: readonly SearchDoc[], terms: readonly string[], limit: number): number {
  const wanted = new Set(terms);
  return Math.min(limit, docs.filter((d) => d.terms.some((t) => wanted.has(t))).length);
}

/** The cursor that opens the LAST page of `PAGE_LIMIT` (page 50 of 50 at 5,000 listings), found by offset, untimed. */
async function deepestCursor(on: Instrumented): Promise<{ cursor: Cursor; cards: number }> {
  const count = await on.sql.execute<{ n: number }>(`SELECT count(*) AS n FROM catalog_cards`);
  const cards = Number(count.rows[0]?.n ?? 0);
  if (cards <= PAGE_LIMIT) return { cursor: null, cards };
  const res = await on.sql.execute<{ ordering_merges: number | null; ordering_published_at: string; slug: string }>(
    `SELECT ordering_merges, ordering_published_at, slug FROM catalog_cards
      ORDER BY ordering_merges DESC NULLS LAST, ordering_published_at DESC, slug ASC
      LIMIT 1 OFFSET CAST($1 AS INTEGER)`,
    [cards - PAGE_LIMIT - 1],
  );
  const row = res.rows[0];
  if (!row) throw new Error("bench: the deep cursor's row is missing");
  return {
    cursor: {
      activity: row.ordering_merges === null ? null : Number(row.ordering_merges),
      publishedAt: row.ordering_published_at,
      slug: row.slug,
    },
    cards,
  };
}

/** The index exactly as the corpus load wrote it — used to put it back if a replace was refused after a clear. */
async function restoreSearchIndex(ctx: ProbeContext, size: ProbeSize): Promise<void> {
  await ctx.sql.execute(`DELETE FROM search_index_terms WHERE kind = 'listing'`);
  await ctx.sql.execute(`DELETE FROM search_index WHERE kind = 'listing'`);
  for (const statement of d1SliceCorpusPlan(SIZES[size], NOW)) {
    if (["search_index", "search_index_terms", "search_index_state"].includes(statement.table)) {
      await ctx.sql.execute(statement.text, [...statement.params]);
    }
  }
}

/** What one `replaceSearchIndex` of the corpus sends: chunks, bytes and statements in its one batch. */
function replacePayload(docs: readonly SearchDoc[]) {
  const chunks = chunkJsonArrays(
    docs.map((d) => ({ entity_id: d.entityId, title: d.title, summary: d.summary, terms: d.terms, facets: d.facets })),
    DEFAULT_MAX_PARAM_BYTES,
    "search document",
  ).map((chunk) => new TextEncoder().encode(chunk).byteLength);
  return { documents: docs.length, chunkBytes: chunks, totalBytes: chunks.reduce((a, b) => a + b, 0), statements: 2 + 2 * chunks.length + 1 };
}

// ─── the ops ──────────────────────────────────────────────────────────────

interface Op {
  /** Once per request, untimed. Returns facts the report carries. */
  setup?(ctx: ProbeContext, state: BenchState, scratch: Record<string, unknown>): Promise<Record<string, unknown> | void>;
  /** Before each run, untimed. */
  before?(ctx: ProbeContext, state: BenchState, scratch: Record<string, unknown>): Promise<void>;
  /** The timed call. */
  run(ctx: ProbeContext, state: BenchState, scratch: Record<string, unknown>): Promise<unknown>;
  /** null when the result is right; otherwise what is wrong with it. */
  check(result: unknown, state: BenchState, scratch: Record<string, unknown>): string | null;
  /** On a refused run, put the database back (untimed). */
  recover?(ctx: ProbeContext, state: BenchState): Promise<void>;
}

const rebuildReport = (result: unknown) => result as { computedAt: string; cards: number; written: number; removed: number };

export const OPS: Record<string, Op> = {
  "rebuildCatalogue.cold": {
    async before(ctx) {
      // Cold = every card written: the catalogue emptied, the singleton back to never-computed.
      await ctx.sql.batch([
        { text: `DELETE FROM catalog_cards` },
        {
          text: `UPDATE catalog_state SET computed_at = NULL, card_count = 0, today_count = 0, week_count = 0,
                        month_count = 0, total_count = 0`,
        },
      ]);
    },
    run: (ctx) => ctx.repo.rebuildCatalogue(INPUT),
    check(result, state) {
      const r = rebuildReport(result);
      return r.computedAt === NOW && r.cards === state.listings && r.written === state.listings && r.removed === 0
        ? null
        : `expected ${state.listings} cards all written, got ${JSON.stringify(r)}`;
    },
  },

  "rebuildCatalogue.quiet": {
    async setup(ctx) {
      await ctx.repo.rebuildCatalogue(INPUT);
    },
    run: (ctx) => ctx.repo.rebuildCatalogue(INPUT),
    check(result, state) {
      const r = rebuildReport(result);
      return r.cards === state.listings && r.written === 0 && r.removed === 0
        ? null
        : `a quiet tick must write nothing, got ${JSON.stringify(r)}`;
    },
  },

  "listCataloguePage.first": {
    async setup(ctx) {
      await ctx.repo.rebuildCatalogue(INPUT);
    },
    run: (ctx) => ctx.repo.listCataloguePage({ cursor: null, limit: PAGE_LIMIT }),
    check(result, state) {
      const page = result as Awaited<ReturnType<D1SliceRepository["listCataloguePage"]>>;
      const want = Math.min(PAGE_LIMIT, state.listings);
      return page.computedAt === NOW && page.cards.length === want ? null : `expected ${want} cards at ${NOW}, got ${page.cards.length} at ${page.computedAt}`;
    },
  },

  "listCataloguePage.deep": {
    async setup(ctx, _state, scratch) {
      await ctx.repo.rebuildCatalogue(INPUT);
      const deep = await deepestCursor(ctx);
      scratch.cursor = deep.cursor;
      scratch.cards = deep.cards;
      return { page: Math.ceil(deep.cards / PAGE_LIMIT), of: Math.ceil(deep.cards / PAGE_LIMIT), cursor: deep.cursor };
    },
    run: (ctx, _state, scratch) => ctx.repo.listCataloguePage({ cursor: scratch.cursor as Cursor, limit: PAGE_LIMIT }),
    check(result, _state, scratch) {
      const page = result as Awaited<ReturnType<D1SliceRepository["listCataloguePage"]>>;
      const want = Math.min(PAGE_LIMIT, scratch.cards as number);
      return page.cards.length === want && page.next === null ? null : `the last page must hold ${want} cards and no next cursor, got ${page.cards.length}`;
    },
  },

  ...Object.fromEntries(
    Object.entries(SEARCHES).map(([label, terms]) => [
      `searchCandidates.${label}`,
      {
        run: (ctx: ProbeContext) => ctx.repo.searchCandidates([...terms], SEARCH_LIMIT),
        check(result: unknown, state: BenchState) {
          const want = expectedCandidates(state.docs, terms, SEARCH_LIMIT);
          const got = (result as unknown[]).length;
          return got === want ? null : `expected ${want} candidates for ${JSON.stringify(terms)}, got ${got}`;
        },
      } satisfies Op,
    ]),
  ),

  "replaceSearchIndex.cold": {
    async setup(_ctx, state) {
      return { payload: replacePayload(state.docs) };
    },
    async before(ctx) {
      await ctx.repo.replaceSearchIndex("listing", [], NOW);
    },
    run: (ctx, state) => ctx.repo.replaceSearchIndex("listing", state.docs, NOW),
    check: (result, state) => (result === state.docs.length ? null : `expected ${state.docs.length} documents, got ${String(result)}`),
    // The clear (untimed) landed and the replace did not: put the loaded index back.
    recover: (ctx, state) => restoreSearchIndex(ctx, state.size),
  },

  "replaceSearchIndex.unchanged": {
    async setup(ctx, state) {
      // The index already holds exactly these documents (one untimed replace makes sure).
      await ctx.repo.replaceSearchIndex("listing", state.docs, NOW);
      return { payload: replacePayload(state.docs) };
    },
    run: (ctx, state) => ctx.repo.replaceSearchIndex("listing", state.docs, NOW),
    check: (result, state) => (result === state.docs.length ? null : `expected ${state.docs.length} documents, got ${String(result)}`),
  },
};

export const OP_NAMES = [...Object.keys(OPS), "sessions"];

export interface OpReport {
  readonly op: string;
  readonly requested: number;
  readonly completed: number;
  /** false when a run threw: D1 refused it (the error says why). */
  readonly accepted: boolean;
  readonly error: string | null;
  readonly checkFailures: string[];
  readonly info: Record<string, unknown>;
  readonly samples: Sample[];
  readonly summary: ReturnType<typeof summaryOf>;
}

async function runOp(ctx: ProbeContext, name: string, op: Op, state: BenchState, runs: number): Promise<OpReport> {
  const scratch: Record<string, unknown> = {};
  const samples: Sample[] = [];
  const checkFailures: string[] = [];
  let error: string | null = null;
  let info: Record<string, unknown> = {};
  try {
    info = (await op.setup?.(ctx, state, scratch)) ?? {};
  } catch (e) {
    error = `setup: ${errorText(e)}`;
  }
  for (let i = 0; i < runs && error === null; i += 1) {
    try {
      await op.before?.(ctx, state, scratch);
    } catch (e) {
      error = `before run ${i + 1}: ${errorText(e)}`;
      break;
    }
    try {
      const { result, sample } = await measure(ctx, () => op.run(ctx, state, scratch));
      samples.push(sample);
      const wrong = op.check(result, state, scratch);
      if (wrong !== null && checkFailures.length < 5) checkFailures.push(`run ${i + 1}: ${wrong}`);
    } catch (e) {
      error = `run ${i + 1}: ${errorText(e)}`;
      if (op.recover) {
        try {
          await op.recover(ctx, state);
          info = { ...info, recovered: true };
        } catch (re) {
          info = { ...info, recovered: false, recoverError: errorText(re) };
        }
      }
    }
  }
  return {
    op: name,
    requested: runs,
    completed: samples.length,
    accepted: error === null,
    error,
    checkFailures,
    info,
    samples,
    summary: summaryOf(samples),
  };
}

// ─── sessions ─────────────────────────────────────────────────────────────

const SESSION_CONSTRAINTS = ["first-unconstrained", "first-primary", "bookmark"] as const;

async function runSessions(ctx: ProbeContext, state: BenchState, runs: number) {
  if (typeof ctx.env.DB.withSession !== "function") {
    return { op: "sessions", supported: false, requested: runs, completed: 0, accepted: true, error: null, checkFailures: [] };
  }
  const checkFailures: string[] = [];
  // THE WRITE the reads follow: a (quiet) rebuild and a fresh marker, on a
  // first-primary session — so its bookmark covers both.
  const writerSession = ctx.env.DB.withSession("first-primary");
  const writer = ctx.over(writerSession);
  const nonce = crypto.randomUUID();
  const { sample: writeSample } = await measure(writer, async () => {
    await writer.repo.rebuildCatalogue(INPUT);
    await writeMeta(writer.sql, "marker", nonce);
  });
  const bookmark = writerSession.getBookmark();
  const { cursor: deep } = await deepestCursor(ctx);

  const reads: Array<[string, (on: Instrumented) => Promise<unknown>, (result: unknown) => string | null]> = [
    ["listCataloguePage.first", (on) => on.repo.listCataloguePage({ cursor: null, limit: PAGE_LIMIT }), (r) => ((r as { cards: unknown[] }).cards.length === Math.min(PAGE_LIMIT, state.listings) ? null : "short first page")],
    ["listCataloguePage.deep", (on) => on.repo.listCataloguePage({ cursor: deep, limit: PAGE_LIMIT }), (r) => ((r as { next: unknown }).next === null ? null : "the deep page is not the last")],
    ...Object.entries(SEARCHES).map(
      ([label, terms]) =>
        [
          `searchCandidates.${label}`,
          (on: Instrumented) => on.repo.searchCandidates([...terms], SEARCH_LIMIT),
          (r: unknown) => ((r as unknown[]).length === expectedCandidates(state.docs, terms, SEARCH_LIMIT) ? null : `wrong candidate count for ${label}`),
        ] as [string, (on: Instrumented) => Promise<unknown>, (result: unknown) => string | null],
    ),
  ];

  const by: Record<string, { marker: Sample[]; stale: number; reads: Record<string, Sample[]> }> = {};
  for (const constraint of SESSION_CONSTRAINTS) by[constraint] = { marker: [], stale: 0, reads: {} };
  let completed = 0;
  let error: string | null = null;
  for (let i = 0; i < runs && error === null; i += 1) {
    for (const constraint of SESSION_CONSTRAINTS) {
      const slot = by[constraint]!;
      try {
        const session = ctx.env.DB.withSession(constraint === "bookmark" ? (bookmark ?? "first-primary") : constraint);
        const on = ctx.over(session);
        // The session's FIRST query is the one whose placement the constraint decides: the marker.
        const { result: seen, sample } = await measure(on, () => readMeta(on.sql, "marker"));
        slot.marker.push(sample);
        if (seen !== nonce) slot.stale += 1;
        for (const [name, read, check] of reads) {
          const { result, sample: s } = await measure(on, () => read(on));
          (slot.reads[name] ??= []).push(s);
          const wrong = check(result);
          if (wrong !== null && checkFailures.length < 5) checkFailures.push(`${constraint} run ${i + 1} ${name}: ${wrong}`);
        }
      } catch (e) {
        error = `${constraint} run ${i + 1}: ${errorText(e)}`;
        break;
      }
    }
    if (error === null) completed += 1;
  }

  // A stale marker under the bookmark is a consistency bug, not lag.
  if (by.bookmark!.stale > 0) checkFailures.push(`${by.bookmark!.stale} read(s) under the writer's bookmark saw a stale marker`);
  if (by["first-primary"]!.stale > 0) checkFailures.push(`${by["first-primary"]!.stale} first-primary read(s) saw a stale marker`);

  return {
    op: "sessions",
    supported: true,
    requested: runs,
    completed,
    accepted: error === null,
    error,
    checkFailures,
    write: writeSample,
    bookmarkObtained: bookmark !== null,
    constraints: Object.fromEntries(
      Object.entries(by).map(([constraint, slot]) => [
        constraint,
        {
          staleMarker: slot.stale,
          marker: { samples: slot.marker, summary: summaryOf(slot.marker) },
          reads: Object.fromEntries(Object.entries(slot.reads).map(([name, samples]) => [name, { samples, summary: summaryOf(samples) }])),
        },
      ]),
    ),
  };
}

// ─── the route ────────────────────────────────────────────────────────────

export async function benchRoute(ctx: ProbeContext, url: URL): Promise<unknown> {
  const size = await loadedSize(ctx.sql);
  const runs = intParam(url, "runs", 50, 1, 100);
  const requested = (url.searchParams.get("op") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const name of requested) {
    if (!OP_NAMES.includes(name)) throw new ProbeError(400, `unknown op ${JSON.stringify(name)}; ops: ${OP_NAMES.join(", ")}`);
  }
  const names = requested.length > 0 ? requested : OP_NAMES;
  const listings = SIZES[size].listings;
  const state: BenchState = { size, listings, docs: corpusDocs(listings) };
  const ops: Record<string, unknown> = {};
  for (const name of names) {
    // Without an explicit op list, the Sessions pass is capped at 10 runs (18 reads a run):
    // the whole default pass stays inside one invocation's query limit.
    ops[name] =
      name === "sessions"
        ? await runSessions(ctx, state, requested.length > 0 ? Math.min(runs, 50) : Math.min(runs, 10))
        : await runOp(ctx, name, OPS[name]!, state, runs);
  }
  return { size, runs, ops };
}
