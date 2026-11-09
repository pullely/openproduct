// The differential harness (OPN D1 slice): one fixture, two engines, the
// same call, deep-equal answers.
//
// Postgres is the ORACLE. It is seeded through the real Postgres repository
// on pglite (`../pg/harness.ts`, the ladder's template, restored per test);
// the slice's source tables are then mirrored into local D1 (`./harness.ts`)
// and each slice method is called on BOTH with the same input. A test passes
// only if:
//
//   1. the two results are deep-equal (order, cursors, census, report
//      counts, timestamps as ISO strings — `toEqual`, Maps included);
//   2. the tables the method wrote are equal row for row (catalog_cards with
//      its JSON parsed, catalog_state, search_index), so a difference the
//      read happens not to surface still fails;
//   3. if Postgres threw, D1 threw too (and the reverse);
//   4. no statement D1 ran breaks a REMOTE D1 limit local workerd does not
//      enforce (`./remote-limits.ts`), checked after every test.

import { afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";

import type { SqlExecutor } from "../executor.js";
import * as pg from "../pg/harness.js";
import type {
  CataloguePage,
  CataloguePageInput,
  CatalogueRebuildInput,
  CatalogueRebuildReport,
  SearchIndexRow,
  SearchIndexState,
} from "../types.js";

import { mirrorPgIntoD1, resetSliceSchema, startLocalD1, type LocalD1 } from "./harness.js";
import { jsonInstant } from "./mappers.js";
import { recordingD1Executor, remoteLimitBreaches, type LimitBreach } from "./remote-limits.js";
import { createD1SliceRepository, type D1SliceOptions, type D1SliceRepository } from "./slice-repository.js";
import type { D1Statement } from "./executor.js";

export interface Differential {
  /** The D1 slice repository of the current test. */
  readonly d1: D1SliceRepository;
  readonly local: LocalD1;
  /** Every statement D1 ran in this test. */
  readonly statements: D1Statement[];
  /** Mirror Postgres's source tables into D1 now. */
  sync(): Promise<void>;
  /** rebuildCatalogue on both (after a sync); equal reports AND equal tables. */
  rebuild(input: CatalogueRebuildInput): Promise<CatalogueRebuildReport>;
  /** listCataloguePage on both; equal pages. */
  page(input: CataloguePageInput): Promise<CataloguePage>;
  /** Walk every page by cursor on both; equal pages throughout. */
  walk(limit: number, maxPages?: number): Promise<CataloguePage[]>;
  /** replaceSearchIndex on both; equal return or both refused; equal tables. */
  replace(kind: string, documents: readonly SearchIndexRow[], builtAt: string): Promise<number>;
  /** searchCandidates on both; equal as a SET when untruncated, valid and equal-sized when truncated. */
  candidates(terms: readonly string[], limit: number): Promise<SearchIndexRow[]>;
  state(): Promise<SearchIndexState>;
  dirty(at: string): Promise<void>;
  /** Both engines refuse (or neither does). Returns the two errors. */
  bothRefuse(pgCall: () => Promise<unknown>, d1Call: () => Promise<unknown>): Promise<[unknown, unknown]>;
}

/** Register a differential for the calling file. Call AFTER `pg.usePgEngine()`. */
export function useDifferential(options: D1SliceOptions = {}): Differential {
  let local: LocalD1;
  let d1: D1SliceRepository;
  let statements: D1Statement[] = [];

  beforeAll(async () => {
    local = await startLocalD1();
  }, 60_000);
  afterAll(async () => {
    await local?.dispose();
  });
  beforeEach(async () => {
    await resetSliceSchema(local.sql);
    const recorder = recordingD1Executor(local.sql);
    statements = recorder.statements;
    d1 = createD1SliceRepository(recorder.sql, options);
  });
  afterEach(() => {
    const breaches: LimitBreach[] = statements.flatMap((s) => remoteLimitBreaches(s));
    expect(breaches, "a statement breaks a remote D1 limit local workerd does not enforce").toEqual([]);
  });

  const sync = async () => {
    await mirrorPgIntoD1(pg.sql, local.sql);
  };

  const harness: Differential = {
    get d1() {
      return d1;
    },
    get local() {
      return local;
    },
    get statements() {
      return statements;
    },
    sync,

    async rebuild(input) {
      await sync();
      const [a, b] = await settleBoth(() => pg.repo.rebuildCatalogue(input), () => d1.rebuildCatalogue(input));
      expect(b).toEqual(a);
      await expectSameCatalogueTables(pg.sql, local);
      return a as CatalogueRebuildReport;
    },

    async page(input) {
      const a = await pg.repo.listCataloguePage(input);
      const b = await d1.listCataloguePage(input);
      expect(b).toEqual(a);
      return a;
    },

    async walk(limit, maxPages = 1_000) {
      const pages: CataloguePage[] = [];
      let cursor: CataloguePageInput["cursor"] = null;
      do {
        const page = await harness.page({ cursor, limit });
        pages.push(page);
        cursor = page.next;
        if (pages.length > maxPages) throw new Error("the walk did not end");
      } while (cursor !== null);
      return pages;
    },

    async replace(kind, documents, builtAt) {
      const [a, b] = await settleBoth(
        () => pg.repo.replaceSearchIndex(kind, documents, builtAt),
        () => d1.replaceSearchIndex(kind, documents, builtAt),
      );
      expect(b).toEqual(a);
      await expectSameSearchTables(pg.sql, local);
      return a as number;
    },

    async candidates(terms, limit) {
      const a = await pg.repo.searchCandidates(terms, limit);
      const b = await d1.searchCandidates(terms, limit);
      const key = (r: SearchIndexRow) => `${r.kind}\u0001${r.entityId}`;
      const sorted = (rows: SearchIndexRow[]) => [...rows].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
      if (a.length < Math.max(1, Math.trunc(limit))) {
        // Untruncated: the candidate SET is fully determined. No ORDER BY on
        // either engine, so the order is not part of the contract.
        expect(sorted(b)).toEqual(sorted(a));
      } else {
        // Truncated: any bounded subset is valid (the contract ranks it), so
        // the two may legitimately differ. Same size, and every row matches.
        expect(b).toHaveLength(a.length);
        for (const row of b) expect(row.terms.some((t) => terms.includes(t))).toBe(true);
      }
      return a;
    },

    async state() {
      const a = await pg.repo.getSearchIndexState();
      const b = await d1.getSearchIndexState();
      expect(b).toEqual(a);
      return a;
    },

    async dirty(at) {
      await pg.repo.markSearchIndexDirty(at);
      await d1.markSearchIndexDirty(at);
    },

    async bothRefuse(pgCall, d1Call) {
      const errors = await Promise.all([pgCall().then(() => null, (e: unknown) => e), d1Call().then(() => null, (e: unknown) => e)]);
      expect(errors[0], "Postgres refused").not.toBeNull();
      expect(errors[1], "D1 refused").not.toBeNull();
      return errors as [unknown, unknown];
    },
  };
  return harness;
}

/** Run both; if exactly one throws, fail with both outcomes; if both throw, rethrow Postgres's. */
async function settleBoth<T>(pgCall: () => Promise<T>, d1Call: () => Promise<T>): Promise<[T, T]> {
  const [a, b] = await Promise.allSettled([pgCall(), d1Call()]);
  if (a.status === "rejected" || b.status === "rejected") {
    if (a.status === "rejected" && b.status === "rejected") throw a.reason;
    throw new Error(
      `the engines disagree on refusing: postgres ${a.status === "rejected" ? `threw ${String(a.reason)}` : "succeeded"}, ` +
        `d1 ${b.status === "rejected" ? `threw ${String(b.reason)}` : "succeeded"}`,
    );
  }
  return [a.value, b.value];
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? null : String(v));
const parsed = (v: unknown): unknown => (typeof v === "string" ? JSON.parse(v) : v);

/** Timestamps inside the stored JSON, normalised the way the read normalises them. */
function normaliseCardJson(record: Record<string, unknown>, metrics: Record<string, unknown>[], media: Record<string, unknown>[]) {
  return {
    record: {
      ...record,
      published_at: jsonInstant(record.published_at),
      repo_pushed_at: jsonInstant(record.repo_pushed_at),
      repo_checked_at: jsonInstant(record.repo_checked_at),
    },
    metrics: metrics.map((m) => ({ ...m, observed_at: jsonInstant(m.observed_at) })),
    media: media.map((m) => ({ ...m, observed_at: jsonInstant(m.observed_at) })),
  };
}

export async function catalogueTables(pgSql: SqlExecutor, local: LocalD1) {
  const pgCards = await pgSql.execute(
    `SELECT profile_id::text AS profile_id, slug, ordering_merges, ordering_published_at, record, metrics, media, computed_at
       FROM openproduct.catalog_cards ORDER BY profile_id`,
  );
  const d1Cards = await local.sql.execute(
    `SELECT profile_id, slug, ordering_merges, ordering_published_at, record, metrics, media, computed_at
       FROM catalog_cards ORDER BY profile_id`,
  );
  const shape = (row: Record<string, unknown>) => ({
    profile_id: row.profile_id,
    slug: row.slug,
    ordering_merges: row.ordering_merges === null ? null : Number(row.ordering_merges),
    ordering_published_at: iso(row.ordering_published_at),
    computed_at: iso(row.computed_at),
    ...normaliseCardJson(
      parsed(row.record) as Record<string, unknown>,
      parsed(row.metrics) as Record<string, unknown>[],
      parsed(row.media) as Record<string, unknown>[],
    ),
  });
  const stateCols = `computed_at, card_count, today_count, week_count, month_count, total_count`;
  const pgState = (await pgSql.execute(`SELECT ${stateCols} FROM openproduct.catalog_state`)).rows;
  const d1State = (await local.sql.execute(`SELECT ${stateCols} FROM catalog_state`)).rows;
  const stateShape = (row: Record<string, unknown>) => ({
    computed_at: iso(row.computed_at),
    card_count: Number(row.card_count),
    today_count: Number(row.today_count),
    week_count: Number(row.week_count),
    month_count: Number(row.month_count),
    total_count: Number(row.total_count),
  });
  return {
    pg: { cards: pgCards.rows.map(shape), state: pgState.map(stateShape) },
    d1: { cards: d1Cards.rows.map(shape), state: d1State.map(stateShape) },
  };
}

async function expectSameCatalogueTables(pgSql: SqlExecutor, local: LocalD1): Promise<void> {
  const t = await catalogueTables(pgSql, local);
  expect(t.d1.cards).toEqual(t.pg.cards);
  expect(t.d1.state).toEqual(t.pg.state);
}

export async function expectSameSearchTables(pgSql: SqlExecutor, local: LocalD1): Promise<void> {
  const cols = `kind, entity_id, title, summary, terms, facets, built_at`;
  const pgRows = (await pgSql.execute(`SELECT ${cols} FROM openproduct.search_index ORDER BY kind, entity_id`)).rows;
  const d1Rows = (await local.sql.execute(`SELECT ${cols} FROM search_index ORDER BY kind, entity_id`)).rows;
  const shape = (row: Record<string, unknown>) => ({
    kind: row.kind,
    entity_id: row.entity_id,
    title: row.title,
    summary: row.summary,
    terms: parsed(row.terms),
    facets: parsed(row.facets),
    built_at: iso(row.built_at),
  });
  expect(d1Rows.map(shape)).toEqual(pgRows.map(shape));
  // The GIN replacement holds exactly the documents' distinct terms — no
  // orphan from a removed document, no term missing from a rewritten one.
  const expected = d1Rows
    .flatMap((r) => [...new Set(parsed(r.terms) as string[])].map((t) => `${String(r.kind)}|${String(r.entity_id)}|${t}`))
    .sort();
  const terms = (await local.sql.execute<{ k: string }>(
    `SELECT kind || '|' || entity_id || '|' || term AS k FROM search_index_terms ORDER BY k`,
  )).rows.map((r) => r.k);
  expect([...terms].sort()).toEqual(expected);
  const state = `built_at, dirty_at`;
  const pgState = (await pgSql.execute(`SELECT ${state} FROM openproduct.search_index_state`)).rows;
  const d1State = (await local.sql.execute(`SELECT ${state} FROM search_index_state`)).rows;
  expect(d1State.map((r) => ({ built_at: iso(r.built_at), dirty_at: r.dirty_at === null }))).toEqual(
    pgState.map((r) => ({ built_at: iso(r.built_at), dirty_at: r.dirty_at === null })),
  );
}
