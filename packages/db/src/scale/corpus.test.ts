// The load fixture's shape (openproduct-scale OS0).
//
// Proved at the smoke size: every table the public reads touch has rows,
// every listing is listed, every probe answers — so the baseline and OS4
// measure a corpus that is the product's shape and not a slice of it.

import { describe, expect, it } from "vitest";

import { SMOKE_CORPUS, SCALE_CORPUS, SUITE_CORPUS, corpusSlug, loadCorpus } from "./corpus.js";
import { contextFor, migratedDb } from "./harness.js";
import { PUBLIC_READS } from "./probes.js";

describe("the corpus", () => {
  it("fills every table the public reads touch, with every listing listed", async () => {
    const { sql, repo } = await migratedDb();
    const report = await loadCorpus(sql, SMOKE_CORPUS);
    const rows = Object.fromEntries(report.steps.map((s) => [s.table, s.rows]));
    expect(rows.profiles).toBe(SMOKE_CORPUS.listings);
    expect(rows["metrics (ingestion)"]).toBe(SMOKE_CORPUS.days * SMOKE_CORPUS.observationsPerDay * 2);
    expect(rows.launches).toBe(SMOKE_CORPUS.days * SMOKE_CORPUS.launchesPerDay);
    expect(rows["metrics (board)"]).toBe(rows.launches);
    expect(rows.endorsements).toBe(SMOKE_CORPUS.endorsements);
    expect(rows.endorsement_integrity).toBe(Math.floor(SMOKE_CORPUS.endorsements / SMOKE_CORPUS.discountedEvery));
    expect(rows.profile_snapshots).toBe(SMOKE_CORPUS.listings * SMOKE_CORPUS.snapshotDays);
    expect(rows.search_index).toBe(SMOKE_CORPUS.listings);
    expect(rows.contributors).toBe(SMOKE_CORPUS.contributors);
    expect(rows.collections).toBe(SMOKE_CORPUS.collections);
    for (const table of ["threads", "posts", "follows", "role_openings", "product_media", "published_maintainers", "listing_maintainers", "product_people"]) {
      expect([table, (rows[table] ?? 0) > 0]).toEqual([table, true]);
    }

    const listed = await sql.execute<{ n: string | number }>(
      `SELECT count(*) AS n FROM openproduct.profiles WHERE visibility = 'public' AND moderation_state = 'visible'`,
    );
    expect(Number(listed.rows[0]!.n)).toBe(SMOKE_CORPUS.listings);
    expect((await repo.getPublicProfile(corpusSlug(1)))?.slug).toBe(corpusSlug(1));
  }, 60_000);

  it("answers every public read, and the list reads answer with rows", async () => {
    const { sql, repo } = await migratedDb();
    await loadCorpus(sql, SMOKE_CORPUS);
    const ctx = await contextFor(repo);
    expect(ctx.slugs).toHaveLength(100);
    const empty: string[] = [];
    for (const probe of PUBLIC_READS) {
      const out = await probe.run(repo, ctx);
      const size = Array.isArray(out) ? out.length : out instanceof Map ? out.size : out === null ? 0 : 1;
      if (size === 0) empty.push(probe.name);
    }
    expect(empty).toEqual([]);
  }, 60_000);

  it("is the same shape at every size — the suite and the scale corpus differ only in numbers", () => {
    expect(Object.keys(SUITE_CORPUS).sort()).toEqual(Object.keys(SCALE_CORPUS).sort());
    expect(SCALE_CORPUS.listings).toBe(5_000);
    expect(SCALE_CORPUS.days).toBe(365);
    expect(SCALE_CORPUS.snapshotDays).toBe(365);
    // A year at the cap: 25 sources a run, 24 runs a day.
    expect(SCALE_CORPUS.observationsPerDay).toBe(600);
    expect(SCALE_CORPUS.endorsements).toBe(50_000);
    expect(1 / SCALE_CORPUS.discountedEvery).toBe(0.05);
  });
});
