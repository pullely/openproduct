// The slice on a corpus built INSIDE D1 (OPN D1 slice proof). Opt-in:
// D1_SCALE=1 (suite size: 5,000 listings, 120 days of ingestion) or
// D1_SCALE=full (365 days — OS0's scale corpus).
//
// Three things, each a port of a Postgres scale test:
//
//   * `../../scale/pagination.test.ts` (OS1) — the catalogue walked by cursor
//     equals the CONTRACT's comparator (`byMostActive`) over the raw keys, not
//     the SQL agreeing with itself; a cursor past the end; the page bound;
//     listing 201 in two requests.
//   * `../../scale/index-coverage.test.ts` (OS4) — every statement the slice
//     issues, explained (EXPLAIN QUERY PLAN, with its own parameters): no
//     watched table read whole unless the scan is ENUMERATED with a reason,
//     and no enumerated scan the plans no longer show.
//   * the timings, on a corpus no Postgres ever touched.

import { byMostActive, type PublicProfileCard } from "@openproduct/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CataloguePageInput } from "../../types.js";
import { resetSliceSchema, startLocalD1, type LocalD1 } from "../harness.js";
import { recordingD1Executor } from "../remote-limits.js";
import { createD1SliceRepository, type D1SliceRepository } from "../slice-repository.js";

import { CORPUS_NOW, SCALE_CORPUS, SUITE_CORPUS, corpusSlug, loadD1SliceCorpus } from "./corpus.js";
import { D1_SCALE, WATCHED, corpusDocs, fullScans, planOf, report, time } from "./harness.js";

const SHAPE = D1_SCALE === "full" ? SCALE_CORPUS : SUITE_CORPUS;
const shift = (iso: string, days: number) => new Date(Date.parse(iso) - days * 24 * 60 * 60 * 1000).toISOString();
const NOW = CORPUS_NOW;
const SINCE = shift(NOW, 2);
const INPUT = { now: NOW, mergesSince: SINCE, endorsementsSince: SINCE };

interface AllowedScan {
  readonly read: string;
  readonly table: string;
  readonly reason: string;
}

/** The whole-table reads the slice is ALLOWED, each with the reason it is not a missing index. */
export const D1_ALLOWED_FULL_SCANS: readonly AllowedScan[] = [
  {
    read: "rebuildCatalogue",
    table: "profiles",
    reason:
      "The catalogue phase writes one row per LISTED profile, so it reads every listed profile by construction — the same pass the Postgres INSERT … SELECT makes. Every per-row lookup under it is a seek (metrics by (profile_id, metric, window_key, observed_at), openings and media by profile_id). The DELETE walks catalog_cards by its order index and the census reads the partial listed index (both USING INDEX, so not counted here).",
  },
];

describe.skipIf(!D1_SCALE)(`the slice on a D1-built corpus (${SHAPE.listings} listings, ${SHAPE.days} days)`, () => {
  let local: LocalD1;
  let d1: D1SliceRepository;
  const d1Time = async (fn: () => Promise<unknown>, runs = 7, warmup = 1) => {
    local.resetCounts();
    const timing = await time(fn, runs, warmup);
    return { ...timing, sqlMs: Math.round((local.counts.sqlMs / (runs + warmup)) * 100) / 100 };
  };

  beforeAll(async () => {
    local = await startLocalD1();
    await resetSliceSchema(local.sql);
    const corpus = await loadD1SliceCorpus(local.sql, SHAPE, NOW);
    report({ op: "corpus.d1", shape: { listings: SHAPE.listings, days: SHAPE.days }, ms: corpus.totalMs, steps: corpus.steps });
    const sized = await local.binding.prepare("SELECT 1").all();
    report({ op: "size.d1.corpus", bytes: (sized.meta as { size_after?: number } | undefined)?.size_after ?? null });
    d1 = createD1SliceRepository(local.sql);
  }, 900_000);

  afterAll(async () => {
    await local?.dispose();
  });

  it("builds the catalogue cold, then a quiet tick writes nothing", async () => {
    local.resetCounts();
    const t = performance.now();
    expect(await d1.rebuildCatalogue(INPUT)).toEqual({ computedAt: NOW, cards: SHAPE.listings, written: SHAPE.listings, removed: 0 });
    report({ op: "d1corpus.rebuildCatalogue.cold", rows: SHAPE.listings, d1Ms: Math.round(performance.now() - t), d1SqlMs: Math.round(local.counts.sqlMs) });
    const quiet = await d1Time(() => d1.rebuildCatalogue(INPUT), 3, 0);
    expect(await d1.rebuildCatalogue(INPUT)).toEqual({ computedAt: NOW, cards: SHAPE.listings, written: 0, removed: 0 });
    report({ op: "d1corpus.rebuildCatalogue.quiet", rows: 0, d1: quiet });
    const sized = await local.binding.prepare("SELECT 1").all();
    report({ op: "size.d1.withCatalogue", bytes: (sized.meta as { size_after?: number } | undefined)?.size_after ?? null });
  }, 600_000);

  it("ported OS1: walks every page and the concatenation equals byMostActive over the whole set", async () => {
    const raw = await local.sql.execute<{ slug: string; published_at: string | null; merges: number | null; upvotes: number | null }>(
      `SELECT p.slug, p.published_at,
              (SELECT m.value FROM metrics m
                WHERE m.profile_id = p.id AND m.metric = 'merges' AND m.window_key = '7d' AND m.observed_at >= $1
                ORDER BY m.observed_at DESC LIMIT 1) AS merges,
              (SELECT m.value FROM metrics m
                WHERE m.profile_id = p.id AND m.metric = 'endorsements' AND m.window_key = '7d' AND m.observed_at >= $2
                ORDER BY m.observed_at DESC LIMIT 1) AS upvotes
         FROM profiles p
        WHERE p.visibility = 'public' AND p.moderation_state = 'visible'`,
      [SINCE, SINCE],
    );
    const reference = raw.rows
      .map(
        (r) =>
          ({
            slug: r.slug,
            publishedAt: r.published_at,
            metrics: [
              ...(r.merges === null ? [] : [{ key: "merges.7d", value: Number(r.merges), observedAt: NOW, state: "fresh" }]),
              ...(r.upvotes === null ? [] : [{ key: "endorsements.7d", value: Number(r.upvotes), observedAt: NOW, state: "fresh" }]),
            ],
          }) as unknown as PublicProfileCard,
      )
      .sort(byMostActive)
      .map((c) => c.slug);
    expect(reference).toHaveLength(SHAPE.listings);
    expect(raw.rows.some((r) => r.merges !== null)).toBe(true);
    expect(raw.rows.some((r) => r.merges === null)).toBe(true);
    expect(raw.rows.some((r) => (r.upvotes ?? 0) > 0)).toBe(true);

    const walked: string[] = [];
    let cursor: CataloguePageInput["cursor"] = null;
    let pages = 0;
    do {
      const page = await d1.listCataloguePage({ cursor, limit: 200 });
      walked.push(...page.cards.map((c) => c.slug));
      cursor = page.next;
      pages += 1;
      if (pages > 100) throw new Error("the walk did not end");
    } while (cursor !== null);
    expect(pages).toBe(Math.ceil(SHAPE.listings / 200));
    expect(walked).toEqual(reference);
  }, 600_000);

  it("ported OS1: a cursor past the end answers an empty last page, and the page size is bounded", async () => {
    const page = await d1.listCataloguePage({ cursor: { activity: null, publishedAt: "1970-01-02T00:00:00.000Z", slug: "zzzzzz" }, limit: 50 });
    expect(page.cards).toEqual([]);
    expect(page.next).toBeNull();
    expect(page.computedAt).toBe(NOW);
    const capped = await d1.listCataloguePage({ cursor: null, limit: 100_000 });
    expect(capped.cards).toHaveLength(200);
    expect(capped.next).not.toBeNull();
  });

  it("ported OS1: listing 201 is reachable in two requests", async () => {
    const first = await d1.listCataloguePage({ cursor: null, limit: 200 });
    const second = await d1.listCataloguePage({ cursor: first.next, limit: 200 });
    expect(second.cards.length).toBeGreaterThan(0);
    expect(new Set([...first.cards, ...second.cards].map((c) => c.slug)).size).toBe(first.cards.length + second.cards.length);
  });

  it("times the reads and the index rebuild on the D1-built corpus", async () => {
    const cursors: CataloguePageInput["cursor"][] = [];
    let cursor: CataloguePageInput["cursor"] = null;
    do {
      cursors.push(cursor);
      cursor = (await d1.listCataloguePage({ cursor, limit: 100 })).next;
    } while (cursor !== null);
    report({ op: "d1corpus.listCataloguePage.first", rows: 100, d1: await d1Time(() => d1.listCataloguePage({ cursor: null, limit: 100 })) });
    report({ op: "d1corpus.listCataloguePage.deep", page: cursors.length, d1: await d1Time(() => d1.listCataloguePage({ cursor: cursors[cursors.length - 1]!, limit: 100 })) });
    for (const [label, terms] of [["common", ["product"]], ["rare", ["00060"]], ["multi", ["00060", "rust", "nope"]]] as const) {
      report({ op: `d1corpus.searchCandidates.${label}`, terms, d1: await d1Time(() => d1.searchCandidates(terms, 50)) });
    }
    const docs = corpusDocs(SHAPE.listings);
    await d1.replaceSearchIndex("listing", [], NOW);
    local.resetCounts();
    const t = performance.now();
    await d1.replaceSearchIndex("listing", docs, NOW);
    report({ op: "d1corpus.replaceSearchIndex.cold", rows: docs.length, d1Ms: Math.round(performance.now() - t), d1SqlMs: Math.round(local.counts.sqlMs), d1Statements: local.counts.statements });
    report({ op: "d1corpus.replaceSearchIndex.unchanged", rows: docs.length, d1: await d1Time(() => d1.replaceSearchIndex("listing", docs, NOW), 3, 0) });
  }, 600_000);

  it("ported OS4: no watched table is read whole unless the scan is enumerated with a reason", async () => {
    const recorder = recordingD1Executor(local.sql);
    const repo = createD1SliceRepository(recorder.sql);
    const probes: Array<[string, () => Promise<unknown>]> = [
      ["rebuildCatalogue", () => repo.rebuildCatalogue(INPUT)],
      ["listCataloguePage(100)", () => repo.listCataloguePage({ cursor: null, limit: 100 })],
      ["listCataloguePage(cursor)", () => repo.listCataloguePage({ cursor: { activity: 1001, publishedAt: shift(NOW, 30), slug: corpusSlug(60) }, limit: 100 })],
      ["listCataloguePage(null cursor)", () => repo.listCataloguePage({ cursor: { activity: null, publishedAt: shift(NOW, 30), slug: corpusSlug(60) }, limit: 100 })],
      ["replaceSearchIndex(100)", () => repo.replaceSearchIndex("probe", corpusDocs(100, "probe"), NOW)],
      ["replaceSearchIndex([])", () => repo.replaceSearchIndex("probe", [], NOW)],
      ["searchCandidates(name)", () => repo.searchCandidates(["00060"], 50)],
      ["searchCandidates(common)", () => repo.searchCandidates(["product"], 50)],
      ["searchCandidates(multi)", () => repo.searchCandidates(["00060", "rust", "nope"], 50)],
      ["getSearchIndexState", () => repo.getSearchIndexState()],
      ["markSearchIndexDirty", () => repo.markSearchIndexDirty(NOW)],
    ];
    const found: Array<{ read: string; table: string; plan: string[] }> = [];
    for (const [name, run] of probes) {
      recorder.statements.length = 0;
      await run();
      for (const statement of [...recorder.statements]) {
        const plan = await planOf(local.sql, statement);
        report({ op: "plan", read: name, statement: statement.text.replace(/\s+/g, " ").trim().slice(0, 90), plan });
        for (const table of fullScans(plan, statement.text)) {
          if (WATCHED.includes(table) && !found.some((f) => f.read === name && f.table === table)) found.push({ read: name, table, plan });
        }
      }
    }
    const unexpected = found.filter((f) => !D1_ALLOWED_FULL_SCANS.some((a) => a.read === f.read && a.table === f.table));
    expect(unexpected.map((f) => `${f.read} · ${f.table}`)).toEqual([]);
    const stale = D1_ALLOWED_FULL_SCANS.filter((a) => !found.some((f) => f.read === a.read && f.table === a.table));
    expect(stale).toEqual([]);
  }, 600_000);
});
