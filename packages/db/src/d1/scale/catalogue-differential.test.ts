// OS5 at size, Postgres vs local D1 (OPN D1 slice proof). Opt-in: D1_SCALE=1.
//
// PORT of `../../scale/catalogue.test.ts`: the SAME corpus — OS0's suite
// corpus, built on pglite by the original `loadCorpus`, plus the upvote
// counts the OB3 tick writes for it — mirrored into local D1. Then the
// catalogue is computed from scratch on both, walked page by page on both,
// and the two walks must be identical (slugs, records, observations, media,
// cursors, census) and the two materialised tables row for row. The timings
// the original test prints are taken on both engines, beside the search
// index's, for PROOF.md.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CORPUS_NOW, SUITE_CORPUS, loadCorpus } from "../../scale/corpus.js";
import { contextFor, migratedDb, type ScaleDb } from "../../scale/harness.js";
import { explain, planShape, recordingExecutor, seqScans, type ProbeContext } from "../../scale/probes.js";
import { createOpenproductRepository } from "../../repository.js";
import type { CataloguePage, CataloguePageInput } from "../../types.js";
import { catalogueTables } from "../differential.js";
import { mirrorPgIntoD1, resetSliceSchema, startLocalD1, type LocalD1 } from "../harness.js";
import { createD1SliceRepository, type D1SliceRepository } from "../slice-repository.js";

import { D1_SCALE, corpusDocs, report, time } from "./harness.js";

describe.skipIf(!D1_SCALE)("OS5 at size — the catalogue on D1 is the catalogue on Postgres", () => {
  let scale: ScaleDb;
  let ctx: ProbeContext;
  let local: LocalD1;
  let d1: D1SliceRepository;
  const input = () => ({ now: ctx.now, mergesSince: ctx.mergesSince, endorsementsSince: ctx.endorsementsSince });
  /** A D1 timing with D1's own server-side SQL time per call beside it (the rest is miniflare's loopback). */
  const d1Time = async (fn: () => Promise<unknown>, runs = 7, warmup = 1) => {
    local.resetCounts();
    const timing = await time(fn, runs, warmup);
    return { ...timing, sqlMs: Math.round((local.counts.sqlMs / (runs + warmup)) * 100) / 100 };
  };

  beforeAll(async () => {
    scale = await migratedDb();
    const corpus = await loadCorpus(scale.sql, SUITE_CORPUS);
    report({ op: "corpus.pg", ms: corpus.totalMs, steps: corpus.steps.length });
    // The upvote counts (OB3): what the tick would have written for this corpus.
    const upvotes = await scale.repo.refreshEndorsementCounts({ now: CORPUS_NOW, republishBefore: CORPUS_NOW });
    ctx = await contextFor(scale.repo);
    await scale.sql.execute("ANALYZE");

    local = await startLocalD1();
    await resetSliceSchema(local.sql);
    d1 = createD1SliceRepository(local.sql);
    const t = Date.now();
    const mirrored = await mirrorPgIntoD1(scale.sql, local.sql);
    await local.sql.execute("ANALYZE");
    report({ op: "mirror.pg→d1", ms: Date.now() - t, statements: mirrored.statements, rows: mirrored.rows, upvoteRows: upvotes });
  }, 600_000);

  afterAll(async () => {
    await local?.dispose();
    await scale?.db.close();
  });

  it("computes the same catalogue from scratch, and a quiet tick writes nothing on either", async () => {
    await scale.sql.execute("DELETE FROM openproduct.catalog_cards");
    let t = performance.now();
    const pgCold = await scale.repo.rebuildCatalogue(input());
    const pgColdMs = performance.now() - t;
    t = performance.now();
    local.resetCounts();
    const d1Cold = await d1.rebuildCatalogue(input());
    const d1ColdMs = performance.now() - t;
    const coldRounds = { ...local.counts };
    expect(d1Cold).toEqual(pgCold);
    expect(d1Cold).toEqual({ computedAt: ctx.now, cards: SUITE_CORPUS.listings, written: SUITE_CORPUS.listings, removed: 0 });

    const pgWarm = await time(() => scale.repo.rebuildCatalogue(input()), 3, 0);
    const d1Warm = await d1Time(() => d1.rebuildCatalogue(input()), 3, 0);
    expect(await d1.rebuildCatalogue(input())).toEqual({ computedAt: ctx.now, cards: SUITE_CORPUS.listings, written: 0, removed: 0 });

    const tables = await catalogueTables(scale.sql, local);
    expect(tables.d1.cards).toHaveLength(SUITE_CORPUS.listings);
    expect(tables.d1.cards).toEqual(tables.pg.cards);
    expect(tables.d1.state).toEqual(tables.pg.state);

    report({ op: "rebuildCatalogue.cold", rows: SUITE_CORPUS.listings, pgMs: Math.round(pgColdMs), d1Ms: Math.round(d1ColdMs), d1SqlMs: Math.round(coldRounds.sqlMs), d1Rounds: coldRounds.rounds, d1Statements: coldRounds.statements });
    report({ op: "rebuildCatalogue.quiet", rows: 0, pg: pgWarm, d1: d1Warm, d1Statements: 3 });
  }, 600_000);

  it("walks to the same pages on both engines — slugs, records, observations, media, cursors, census", async () => {
    const walk = async (read: (i: CataloguePageInput) => Promise<CataloguePage>) => {
      const pages: CataloguePage[] = [];
      let cursor: CataloguePageInput["cursor"] = null;
      do {
        const page = await read({ cursor, limit: 200 });
        pages.push(page);
        cursor = page.next;
      } while (cursor !== null && pages.length < 60);
      return pages;
    };
    const pgPages = await walk((i) => scale.repo.listCataloguePage(i));
    const d1Pages = await walk((i) => d1.listCataloguePage(i));
    expect(d1Pages.length).toBe(Math.ceil(SUITE_CORPUS.listings / 200));
    expect(d1Pages.flatMap((p) => p.cards.map((c) => c.slug))).toHaveLength(SUITE_CORPUS.listings);
    expect(d1Pages).toEqual(pgPages);
    // And the corpus has both kinds of row the ordering distinguishes.
    const activities = d1Pages.flatMap((p) => (p.next ? [p.next.activity] : []));
    expect(activities.some((a) => a === null)).toBe(true);
    expect(activities.some((a) => a !== null)).toBe(true);
  }, 600_000);

  it("times the front page and a deep page on both — one statement on D1", async () => {
    // The cursor of the second-to-last page of 100: the deepest keyset read.
    const cursors: CataloguePageInput["cursor"][] = [];
    let cursor: CataloguePageInput["cursor"] = null;
    do {
      cursors.push(cursor);
      cursor = (await d1.listCataloguePage({ cursor, limit: 100 })).next;
    } while (cursor !== null);
    const deep = cursors[cursors.length - 1]!;
    local.resetCounts();
    const page = await d1.listCataloguePage({ cursor: null, limit: 100 });
    expect({ rounds: local.counts.rounds, statements: local.counts.statements }).toEqual({ rounds: 1, statements: 1 });
    expect(page.cards).toHaveLength(100);
    const pgFirst = await time(() => scale.repo.listCataloguePage({ cursor: null, limit: 100 }));
    const d1First = await d1Time(() => d1.listCataloguePage({ cursor: null, limit: 100 }));
    const pgDeep = await time(() => scale.repo.listCataloguePage({ cursor: deep, limit: 100 }));
    const d1Deep = await d1Time(() => d1.listCataloguePage({ cursor: deep, limit: 100 }));
    // The floor: one trivial statement, each engine, through the same path.
    report({ op: "floor.SELECT1", pg: await time(() => scale.sql.execute("SELECT 1")), d1: await d1Time(() => local.sql.execute("SELECT 1")) });
    expect(await d1.listCataloguePage({ cursor: deep, limit: 100 })).toEqual(await scale.repo.listCataloguePage({ cursor: deep, limit: 100 }));
    report({ op: "listCataloguePage.first", rows: 100, pg: pgFirst, d1: d1First });
    report({ op: "listCataloguePage.deep", rows: (await d1.listCataloguePage({ cursor: deep, limit: 100 })).cards.length, page: cursors.length, pg: pgDeep, d1: d1Deep });
  }, 600_000);

  it("records Postgres's plans for the same six methods, for the comparison in PROOF.md", async () => {
    const recorder = recordingExecutor(scale.sql);
    const repo = createOpenproductRepository(recorder.sql);
    const probes: Array<[string, () => Promise<unknown>]> = [
      ["rebuildCatalogue", () => repo.rebuildCatalogue(input())],
      ["listCataloguePage(100)", () => repo.listCataloguePage({ cursor: null, limit: 100 })],
      ["listCataloguePage(cursor)", () => repo.listCataloguePage({ cursor: { activity: 1001, publishedAt: ctx.monthAgo, slug: ctx.slug }, limit: 100 })],
      ["searchCandidates(name)", () => repo.searchCandidates(["00060"], 50)],
      ["searchCandidates(common)", () => repo.searchCandidates(["product"], 50)],
      ["getSearchIndexState", () => repo.getSearchIndexState()],
    ];
    for (const [name, run] of probes) {
      recorder.statements.length = 0;
      await run();
      for (const statement of [...recorder.statements]) {
        const plan = await explain(scale.sql, statement);
        report({ op: "pgplan", read: name, statement: statement.text.replace(/\s+/g, " ").trim().slice(0, 90), shape: planShape(plan), seqScans: seqScans(plan) });
      }
    }
  }, 600_000);

  it("replaces and searches 5,000 documents on both, with the same answers", async () => {
    const docs = corpusDocs(SUITE_CORPUS.listings);
    // Cold: an empty kind on both (the corpus's own rows are kind 'listing').
    await scale.repo.replaceSearchIndex("listing", [], CORPUS_NOW);
    await d1.replaceSearchIndex("listing", [], CORPUS_NOW);
    let t = performance.now();
    expect(await scale.repo.replaceSearchIndex("listing", docs, CORPUS_NOW)).toBe(docs.length);
    const pgCold = performance.now() - t;
    local.resetCounts();
    t = performance.now();
    expect(await d1.replaceSearchIndex("listing", docs, CORPUS_NOW)).toBe(docs.length);
    const d1Cold = performance.now() - t;
    const coldRounds = { ...local.counts };
    const pgSame = await time(() => scale.repo.replaceSearchIndex("listing", docs, CORPUS_NOW), 3, 0);
    const d1Same = await d1Time(() => d1.replaceSearchIndex("listing", docs, CORPUS_NOW), 3, 0);
    report({ op: "replaceSearchIndex.cold", rows: docs.length, pgMs: Math.round(pgCold), d1Ms: Math.round(d1Cold), d1SqlMs: Math.round(coldRounds.sqlMs), d1Rounds: coldRounds.rounds, d1Statements: coldRounds.statements });
    report({ op: "replaceSearchIndex.unchanged", rows: docs.length, pg: pgSame, d1: d1Same, d1Statements: coldRounds.statements });

    const sorted = (rows: { entityId: string }[]) => rows.map((r) => r.entityId).sort();
    for (const [label, terms, limit] of [
      ["common", ["product"], 50],
      ["rare", ["00060"], 50],
      ["multi", ["00060", "rust", "nope"], 50],
      ["multi-untruncated", ["00060", "00061", "00062", "nope"], 50],
      ["absent", ["nothing-like-this"], 50],
    ] as const) {
      const a = await scale.repo.searchCandidates(terms, limit);
      const b = await d1.searchCandidates(terms, limit);
      if (a.length < limit) expect(sorted(b)).toEqual(sorted(a));
      else expect(b).toHaveLength(a.length);
      const pg = await time(() => scale.repo.searchCandidates(terms, limit));
      const d1t = await d1Time(() => d1.searchCandidates(terms, limit));
      report({ op: `searchCandidates.${label}`, terms, rows: b.length, pg, d1: d1t });
    }
  }, 600_000);
});
