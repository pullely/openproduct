// OS-1, asserted: the pages are the published ordering, cut (openproduct-scale OS1).
//
// Every page of the suite corpus is walked by cursor, and the concatenation
// is compared with the CONTRACT'S comparator over the whole set — not with
// the SQL's own ORDER BY, which would be the query agreeing with itself.
// The reference cards are built from a raw read of the same three keys the
// ordering uses, with the same freshness rule, and sorted by `byMostActive`.

import { byMostActive, type PublicProfileCard } from "@openproduct/contracts";
import { beforeAll, describe, expect, it } from "vitest";

import { SUITE_CORPUS, loadCorpus } from "./corpus.js";
import { contextFor, migratedDb, type ScaleDb } from "./harness.js";
import type { ProbeContext } from "./probes.js";

describe("OS1 — pagination is the published ordering, cut into pages", () => {
  let scale: ScaleDb;
  let ctx: ProbeContext;

  beforeAll(async () => {
    scale = await migratedDb();
    await loadCorpus(scale.sql, SUITE_CORPUS);
    ctx = await contextFor(scale.repo);
  }, 120_000);

  it("walks every page and the concatenation equals byMostActive over the whole set — never a second ordering", async () => {
    // The reference: every listed row's three keys, the contract's way.
    const raw = await scale.sql.execute<{
      slug: string;
      published_at: string | Date | null;
      merges: number | string | null;
      upvotes: number | string | null;
    }>(
      `SELECT p.slug, p.published_at,
              (SELECT m.value FROM openproduct.metrics m
                WHERE m.profile_id = p.id AND m.metric = 'merges' AND m.window_key = '7d'
                  AND m.observed_at >= $1::timestamptz
                ORDER BY m.observed_at DESC LIMIT 1) AS merges,
              (SELECT m.value FROM openproduct.metrics m
                WHERE m.profile_id = p.id AND m.metric = 'endorsements' AND m.window_key = '7d'
                  AND m.observed_at >= $2::timestamptz
                ORDER BY m.observed_at DESC LIMIT 1) AS upvotes
         FROM openproduct.profiles p
        WHERE p.visibility = 'public' AND p.moderation_state = 'visible'`,
      [ctx.mergesSince, ctx.endorsementsSince],
    );
    const reference = raw.rows
      .map(
        (r) =>
          ({
            slug: r.slug,
            publishedAt: r.published_at instanceof Date ? r.published_at.toISOString() : r.published_at,
            // OB3 — both terms of the score, the contract's way.
            metrics: [
              ...(r.merges === null ? [] : [{ key: "merges.7d", value: Number(r.merges), observedAt: ctx.now, state: "fresh" }]),
              ...(r.upvotes === null ? [] : [{ key: "endorsements.7d", value: Number(r.upvotes), observedAt: ctx.now, state: "fresh" }]),
            ],
          }) as unknown as PublicProfileCard,
      )
      .sort(byMostActive)
      .map((c) => c.slug);
    expect(reference).toHaveLength(SUITE_CORPUS.listings);
    // The corpus has both kinds: observed and unknown.
    expect(raw.rows.some((r) => r.merges !== null)).toBe(true);
    expect(raw.rows.some((r) => r.merges === null)).toBe(true);

    const walked: string[] = [];
    let cursor: Awaited<ReturnType<typeof scale.repo.listPublicCardsPage>>["next"] = null;
    let pages = 0;
    do {
      const page = await scale.repo.listPublicCardsPage({ cursor, limit: 200, mergesSince: ctx.mergesSince, endorsementsSince: ctx.endorsementsSince });
      walked.push(...page.cards.map((c) => c.slug));
      cursor = page.next;
      pages += 1;
      if (pages > 100) throw new Error("the walk did not end");
    } while (cursor !== null);

    expect(pages).toBe(Math.ceil(SUITE_CORPUS.listings / 200));
    expect(walked).toEqual(reference);
  }, 120_000);

  it("a cursor past the end answers an empty last page, and the page size is bounded", async () => {
    const page = await scale.repo.listPublicCardsPage({
      cursor: { activity: null, publishedAt: "1970-01-02T00:00:00.000Z", slug: "zzzzzz" },
      limit: 50,
      mergesSince: ctx.mergesSince,
      endorsementsSince: ctx.endorsementsSince,
    });
    expect(page).toEqual({ cards: [], next: null });
    const capped = await scale.repo.listPublicCardsPage({ cursor: null, limit: 100_000, mergesSince: ctx.mergesSince, endorsementsSince: ctx.endorsementsSince });
    expect(capped.cards).toHaveLength(200);
    expect(capped.next).not.toBeNull();
  });

  it("listing 201 is reachable in two requests", async () => {
    const first = await scale.repo.listPublicCardsPage({ cursor: null, limit: 200, mergesSince: ctx.mergesSince, endorsementsSince: ctx.endorsementsSince });
    const second = await scale.repo.listPublicCardsPage({ cursor: first.next, limit: 200, mergesSince: ctx.mergesSince, endorsementsSince: ctx.endorsementsSince });
    expect(second.cards.length).toBeGreaterThan(0);
    expect(new Set([...first.cards, ...second.cards].map((c) => c.slug)).size).toBe(first.cards.length + second.cards.length);
  });
});
