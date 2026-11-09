// OS5 — the materialised catalogue may not invent a fact the live join would
// not (openproduct-scale OS5).
//
// On the OS0 corpus: compute the catalogue, walk it page by page, and walk the
// live join the same way. The two walks must be the SAME — the same slugs in
// the same order, the same card records, the same latest observations, the
// same media, the same census. Then the two numbers the milestone exists for,
// printed: what the front page's read costs against the table, and what the
// phase costs to write it.

import { beforeAll, describe, expect, it } from "vitest";

import { CORPUS_NOW, SUITE_CORPUS, loadCorpus } from "./corpus.js";
import { contextFor, migratedDb, type ScaleDb } from "./harness.js";
import type { ProbeContext } from "./probes.js";

describe("OS5 — the catalogue is the live join, materialised", () => {
  let scale: ScaleDb;
  let ctx: ProbeContext;
  let rebuildMs = 0;
  let quietMs = 0;

  beforeAll(async () => {
    scale = await migratedDb();
    await loadCorpus(scale.sql, SUITE_CORPUS);
    ctx = await contextFor(scale.repo);
    // `contextFor` computed it once; compute it again from scratch and time it,
    // then a quiet tick, which should write nothing.
    await scale.sql.execute("DELETE FROM openproduct.catalog_cards");
    let t = Date.now();
    const first = await scale.repo.rebuildCatalogue({ now: ctx.now, mergesSince: ctx.mergesSince, endorsementsSince: ctx.endorsementsSince });
    rebuildMs = Date.now() - t;
    expect(first.cards).toBe(SUITE_CORPUS.listings);
    expect(first.written).toBe(SUITE_CORPUS.listings);
    t = Date.now();
    const quiet = await scale.repo.rebuildCatalogue({ now: ctx.now, mergesSince: ctx.mergesSince, endorsementsSince: ctx.endorsementsSince });
    quietMs = Date.now() - t;
    expect(quiet).toEqual({ computedAt: ctx.now, cards: SUITE_CORPUS.listings, written: 0, removed: 0 });
    await scale.sql.execute("ANALYZE");
  }, 180_000);

  it("walks to the same pages as the live join — slugs, records, observations, media, census", async () => {
    const built: Awaited<ReturnType<typeof scale.repo.listCataloguePage>>[] = [];
    let cursor: Awaited<ReturnType<typeof scale.repo.listCataloguePage>>["next"] = null;
    do {
      const page = await scale.repo.listCataloguePage({ cursor, limit: 200 });
      built.push(page);
      cursor = page.next;
    } while (cursor !== null && built.length < 60);

    const live: Awaited<ReturnType<typeof scale.repo.listPublicCardsPage>>[] = [];
    cursor = null;
    do {
      const page = await scale.repo.listPublicCardsPage({ cursor, limit: 200, mergesSince: ctx.mergesSince, endorsementsSince: ctx.endorsementsSince });
      live.push(page);
      cursor = page.next;
    } while (cursor !== null && live.length < 60);

    expect(built.length).toBe(live.length);
    const builtSlugs = built.flatMap((p) => p.cards.map((c) => c.slug));
    const liveSlugs = live.flatMap((p) => p.cards.map((c) => c.slug));
    expect(builtSlugs).toEqual(liveSlugs);
    expect(builtSlugs).toHaveLength(SUITE_CORPUS.listings);
    expect(built.map((p) => p.next)).toEqual(live.map((p) => p.next));
    expect(built.flatMap((p) => p.cards)).toEqual(live.flatMap((p) => p.cards));

    // The observations and media the live path reads in two more statements
    // per page are the ones the catalogue carries — checked on every page.
    for (const page of built) {
      const slugs = page.cards.map((c) => c.slug);
      const [metrics, media] = await Promise.all([
        scale.repo.latestMetricsForSlugs(slugs),
        scale.repo.listPublicMediaForSlugs(slugs),
      ]);
      expect(page.metrics).toEqual(metrics);
      expect(page.media).toEqual(media);
      expect(page.computedAt).toBe(ctx.now);
      expect(page.windows).toEqual(await scale.repo.countPublishedWindows(ctx.now));
    }
  });

  it("is the front page's read, and it is one statement", async () => {
    const statements: string[] = [];
    const recorder = {
      async execute<T>(text: string, params?: unknown[]) {
        statements.push(text);
        return scale.sql.execute<never>(text, params) as Promise<{ rows: T[]; rowCount: number }>;
      },
    };
    const { createOpenproductRepository } = await import("../repository.js");
    const repo = createOpenproductRepository(recorder as never);
    const t = Date.now();
    const page = await repo.listCataloguePage({ cursor: null, limit: 100 });
    const ms = Date.now() - t;
    expect(statements).toHaveLength(1);
    expect(page.cards).toHaveLength(100);
    process.stdout.write(
      `OS5 corpus=${SUITE_CORPUS.listings} at ${CORPUS_NOW}: rebuild ${rebuildMs} ms (first, ${SUITE_CORPUS.listings} rows) · quiet tick ${quietMs} ms (0 rows) · listCataloguePage(100) ${ms} ms, 1 statement\n`,
    );
  });
});
