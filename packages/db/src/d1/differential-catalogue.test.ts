// rebuildCatalogue and listCataloguePage, Postgres vs local D1 (OPN D1 slice).
//
// PORTED CASES are the existing Postgres tests that cover the two methods,
// with their own assertions kept — run here against BOTH engines through the
// differential (`./differential.ts`), so each assertion holds on D1 and D1's
// every answer equals Postgres's. Sources:
//
//   src/pg/media-snapshots-catalogue.test.ts  "OS5 — the catalogue is materialised" (4 cases)
//                                             "OB3 — Most active is work times interest" (1 + 1 analogue)
//                                             "OSD3 — a logo reaches the home list" (1 analogue)
//   src/pg/home-overlay-search.test.ts        "DS1 — the card carries what the derived facets need" (3 analogues)
//
// EDGE CASES the brief named follow, each also differential.

import { describe, expect, it } from "vitest";

import { asUuid } from "../ids.js";
import {
  ACTOR,
  ORG,
  OPENING,
  PROFILE,
  PROFILE_TWO,
  PROJECT_TWO,
  repo,
  seedDraft,
  seedPublished,
  sql,
  usePgEngine,
} from "../pg/harness.js";

import { useDifferential } from "./differential.js";

usePgEngine();
const diff = useDifferential();

const T1 = "2026-08-17T12:10:00.000Z";
const T2 = "2026-08-17T12:20:00.000Z";
const T3 = "2026-08-17T12:30:00.000Z";
const T4 = "2026-08-17T12:40:00.000Z";
const MERGES_SINCE = "2026-08-15T12:10:00.000Z";
const at = (now: string, since = MERGES_SINCE) => ({ now, mergesSince: since, endorsementsSince: since });

describe("ported: OS5 — the catalogue is materialised", () => {
  const METRIC_A = asUuid("a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1");
  const METRIC_B = asUuid("b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2");
  const METRIC_C = asUuid("c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3");
  const METRIC_D = asUuid("d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4");
  const MEDIA = asUuid("e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5");

  async function seedWithSignals() {
    await seedPublished();
    await repo.writeMetric({ id: METRIC_A, profileId: PROFILE, metric: "merges", window: "7d", value: 9, source: "linked_repo", observedAt: "2026-08-16T11:00:00.000Z" });
    await repo.writeMetric({ id: METRIC_B, profileId: PROFILE, metric: "merges", window: "7d", value: 12, source: "linked_repo", observedAt: "2026-08-17T11:00:00.123456Z" });
    await repo.writeMetric({ id: METRIC_C, profileId: PROFILE, metric: "stars", window: "total", value: 300, source: "linked_repo", observedAt: "2026-08-17T11:00:00.000Z" });
    await repo.insertMedia({ id: MEDIA, profileId: PROFILE, kind: "hero", storageRef: `${"d".repeat(64)}.png`, alt: "The hero", width: 1200, height: 630, position: 0 });
  }

  it("never computed: the page says so and carries nothing, whatever is listed", async () => {
    await seedPublished();
    await diff.sync();
    const page = await diff.page({ cursor: null, limit: 100 });
    expect(page).toEqual({
      computedAt: null,
      cards: [],
      metrics: new Map(),
      media: new Map(),
      next: null,
      windows: { today: 0, week: 0, month: 0, total: 0 },
    });
  });

  it("after a rebuild the page IS the live join — cards, latest observations, media and census — with the moment", async () => {
    await seedWithSignals();
    const report = await diff.rebuild(at(T1));
    expect(report).toEqual({ computedAt: T1, cards: 1, written: 1, removed: 0 });

    const live = await repo.listPublicCardsPage({ cursor: null, limit: 100, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE });
    const built = await diff.page({ cursor: null, limit: 100 });
    expect(built.computedAt).toBe(T1);
    expect(built.cards).toEqual(live.cards);
    expect(built.next).toEqual(live.next);
    expect(built.metrics).toEqual(await repo.latestMetricsForSlugs(["acme-thing"]));
    expect(built.media).toEqual(await repo.listPublicMediaForSlugs(["acme-thing"]));
    expect(built.windows).toEqual(await repo.countPublishedWindows(T1));
    const merges = built.metrics.get("acme-thing")!.filter((m) => m.metric === "merges");
    expect(merges).toHaveLength(1);
    expect(merges[0]!.value).toBe(12);
    expect(merges[0]!.observedAt).toBe("2026-08-17T11:00:00.123Z");
  });

  it("a quiet tick writes nothing; a changed listing is rewritten; a delisted one is removed", async () => {
    await seedWithSignals();
    await diff.rebuild(at(T1));
    expect(await diff.rebuild(at(T2))).toEqual({ computedAt: T2, cards: 1, written: 0, removed: 0 });
    expect((await diff.page({ cursor: null, limit: 10 })).computedAt).toBe(T2);
    // The row kept the moment it was last written — on both.
    const d1Row = await diff.local.sql.execute<{ computed_at: string }>(`SELECT computed_at FROM catalog_cards`);
    expect(d1Row.rows[0]!.computed_at).toBe(T1);

    await repo.writeMetric({ id: METRIC_D, profileId: PROFILE, metric: "merges", window: "7d", value: 13, source: "linked_repo", observedAt: T2 });
    expect(await diff.rebuild(at(T3))).toEqual({ computedAt: T3, cards: 1, written: 1, removed: 0 });
    expect((await diff.page({ cursor: null, limit: 10 })).metrics.get("acme-thing")!.find((m) => m.metric === "merges")!.value).toBe(13);

    await repo.unpublishProfile(ORG, PROFILE, ACTOR);
    expect(await diff.rebuild(at(T4))).toEqual({ computedAt: T4, cards: 0, written: 0, removed: 1 });
    const gone = await diff.page({ cursor: null, limit: 10 });
    expect(gone.cards).toEqual([]);
    expect(gone.computedAt).toBe(T4);
    expect(gone.windows.total).toBe(0);
  });

  it("pages by the cursor the live read issues, and the pages concatenate to the live walk", async () => {
    await seedWithSignals();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await diff.rebuild(at(T1));
    const first = await diff.page({ cursor: null, limit: 1 });
    expect(first.cards.map((c) => c.slug)).toEqual(["acme-thing"]);
    expect(first.next).toEqual({ activity: 13012, publishedAt: first.cards[0]!.publishedAt, slug: "acme-thing" });
    const second = await diff.page({ cursor: first.next, limit: 1 });
    expect(second.cards.map((c) => c.slug)).toEqual(["beta-thing"]);
    expect(second.next).toBeNull();
    const live = await repo.listPublicCardsPage({ cursor: null, limit: 10, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE });
    expect([...first.cards, ...second.cards]).toEqual(live.cards);
    expect(first.windows.total).toBe(2);
  });
});

describe("ported: OB3 — Most active is work times interest", () => {
  const SINCE = "2026-08-15T12:10:00.000Z";
  const DAY_BEFORE = "2026-08-16T12:00:00.000Z";
  const M_ACME = asUuid("a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7");
  const M_BETA = asUuid("b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8");

  async function seedTwo() {
    await seedPublished();
    await seedPublished(PROFILE_TWO, PROJECT_TWO, "beta-thing");
    await repo.writeMetric({ id: M_ACME, profileId: PROFILE, metric: "merges", window: "7d", value: 12, source: "declared_repo", observedAt: T1 });
    await repo.writeMetric({ id: M_BETA, profileId: PROFILE_TWO, metric: "merges", window: "7d", value: 2, source: "declared_repo", observedAt: T1 });
    for (let i = 0; i < 5; i += 1) await repo.endorse(PROFILE_TWO, `voter-${i}`, "confirmed", DAY_BEFORE);
    // The upvote counts are metrics the tick writes (a Postgres write, not in
    // the slice); the mirror carries them to D1 like any other metric.
    await repo.refreshEndorsementCounts({ now: T1, republishBefore: SINCE });
  }

  it("orders the catalogue and the live join by (merges + 1) × (upvotes + 1), and they agree", async () => {
    await seedTwo();
    await diff.rebuild(at(T1, SINCE));
    const built = await diff.page({ cursor: null, limit: 10 });
    const live = await repo.listPublicCardsPage({ cursor: null, limit: 10, mergesSince: SINCE, endorsementsSince: SINCE });
    expect(built.cards.map((c) => c.slug)).toEqual(["beta-thing", "acme-thing"]);
    expect(live.cards.map((c) => c.slug)).toEqual(["beta-thing", "acme-thing"]);
    const firstBuilt = await diff.page({ cursor: null, limit: 1 });
    const firstLive = await repo.listPublicCardsPage({ cursor: null, limit: 1, mergesSince: SINCE, endorsementsSince: SINCE });
    expect(firstBuilt.next).toEqual({ activity: 18_002, publishedAt: firstBuilt.cards[0]!.publishedAt, slug: "beta-thing" });
    expect(firstLive.next).toEqual(firstBuilt.next);
    const second = await diff.page({ cursor: firstBuilt.next, limit: 1 });
    expect(second.cards.map((c) => c.slug)).toEqual(["acme-thing"]);
  });

  it("analogue of 'reads no upvote count older than its floor': the catalogue ranks on changes alone past the floor", async () => {
    await seedTwo();
    await diff.rebuild({ now: T1, mergesSince: SINCE, endorsementsSince: "2026-08-18T00:00:00.000Z" });
    expect((await diff.page({ cursor: null, limit: 10 })).cards.map((c) => c.slug)).toEqual(["acme-thing", "beta-thing"]);
  });
});

describe("analogue: OSD3 — a logo reaches the catalogue", () => {
  it("a logo added after a rebuild is written by the next one, once, first in document order", async () => {
    await seedPublished();
    await diff.rebuild(at(T1));
    await repo.insertMedia({ id: asUuid("f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6"), profileId: PROFILE, kind: "logo", storageRef: `${"f".repeat(64)}.png`, alt: "The mark", width: 256, height: 256, position: 0 });
    expect((await diff.page({ cursor: null, limit: 10 })).media.get("acme-thing")).toBeUndefined();
    expect((await diff.rebuild(at(T2))).written).toBe(1);
    const page = await diff.page({ cursor: null, limit: 10 });
    expect(page.media.get("acme-thing")!.map((m) => m.kind)).toEqual(["logo"]);
    expect(page.media).toEqual(await repo.listPublicMediaForSlugs(["acme-thing"]));
    expect((await diff.rebuild(at(T3))).written).toBe(0);
  });
});

describe("analogue: DS1 — the card carries what the derived facets need, through the catalogue", () => {
  it("carries the AUTHORED commitment lines of the OPEN roles only, in sort order", async () => {
    await seedPublished();
    await repo.upsertRoleOpening({ id: OPENING, profileId: PROFILE, title: "Design lead", commitment: "One evening a week", sortOrder: 2 });
    await repo.upsertRoleOpening({ id: asUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), profileId: PROFILE, title: "Closed one", commitment: "A few hours a week", status: "closed", sortOrder: 1 });
    await repo.upsertRoleOpening({ id: asUuid("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), profileId: PROFILE, title: "Ops", commitment: "Weekends", sortOrder: 1 });
    await repo.upsertRoleOpening({ id: asUuid("cccccccc-cccc-4ccc-8ccc-cccccccccccc"), profileId: PROFILE, title: "Unstated", sortOrder: 0 });
    await diff.rebuild(at(T1));
    const [card] = (await diff.page({ cursor: null, limit: 10 })).cards;
    expect(card!.openCommitments).toEqual(["Weekends", "One evening a week"]);
    expect(card!.roleOpeningCount).toBe(3);
    expect(card).toEqual((await repo.listPublicCards())[0]);
  });

  it("carries a BOOLEAN for the live URL and for indexable — true/false, never 1/0", async () => {
    await seedPublished();
    await diff.rebuild(at(T1));
    expect((await diff.page({ cursor: null, limit: 10 })).cards[0]!.hasLiveUrl).toBe(false);
    await repo.updateProfile(ORG, PROFILE, { liveUrl: "https://acme.example", updatedBy: ACTOR });
    expect((await diff.rebuild(at(T2))).written).toBe(1);
    const [card] = (await diff.page({ cursor: null, limit: 10 })).cards;
    expect(card!.hasLiveUrl).toBe(true);
    expect(card!.indexable).toBe(true);
    expect(Object.values(card!)).not.toContain("https://acme.example");
    expect(card).toEqual((await repo.listPublicCards())[0]);
  });
});

// ─── edge cases ────────────────────────────────────────────────────────────

/** A listed profile straight into Postgres, for shapes the write path would refuse or take long to reach. */
async function insertListed(n: number, slug: string, publishedAt: string | null, over: Record<string, unknown> = {}) {
  const id = asUuid(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
  const row: Record<string, unknown> = {
    id,
    org_id: ORG,
    project_id: asUuid(`10000000-0000-4000-8000-${String(n).padStart(12, "0")}`),
    slug,
    visibility: "public",
    created_by: ACTOR,
    reviewed_at: "2026-08-01T00:00:00.000Z",
    published_at: publishedAt,
    tagline: `Listing ${slug}`,
    stack: JSON.stringify(["typescript"]),
    ...over,
  };
  const cols = Object.keys(row);
  await sql.execute(
    `INSERT INTO openproduct.profiles (${cols.join(", ")}) VALUES (${cols.map((c, i) => (c === "stack" ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(", ")})`,
    cols.map((c) => row[c]),
  );
  return id;
}

async function merges(profileId: string, value: number, observedAt = T1, n = Math.random()) {
  await repo.writeMetric({ id: asUuid(`20000000-0000-4000-8000-${String(Math.floor(n * 1e12)).padStart(12, "0")}`), profileId: profileId as never, metric: "merges", window: "7d", value, source: "linked_repo", observedAt });
}

describe("edge cases, differential", () => {
  it("an empty catalogue that HAS been computed: a moment, no cards, a zero census", async () => {
    expect(await diff.rebuild(at(T1))).toEqual({ computedAt: T1, cards: 0, written: 0, removed: 0 });
    expect(await diff.page({ cursor: null, limit: 50 })).toEqual({
      computedAt: T1, cards: [], metrics: new Map(), media: new Map(), next: null,
      windows: { today: 0, week: 0, month: 0, total: 0 },
    });
  });

  it("a cursor past the end answers an empty page that still carries the moment and the census", async () => {
    await seedPublished();
    await diff.rebuild(at(T1));
    const page = await diff.page({ cursor: { activity: null, publishedAt: "1970-01-02T00:00:00.000Z", slug: "zzzzzz" }, limit: 50 });
    expect(page.cards).toEqual([]);
    expect(page.next).toBeNull();
    expect(page.computedAt).toBe(T1);
    expect(page.windows.total).toBe(1);
  });

  it("walks across the null-activity boundary: observed rows first, then unobserved, by published then slug", async () => {
    const a = await insertListed(1, "alpha", "2026-08-10T00:00:00.000Z");
    const b = await insertListed(2, "bravo", "2026-08-11T00:00:00.000Z");
    await insertListed(3, "charlie", "2026-08-12T00:00:00.000Z");
    await insertListed(4, "delta", "2026-08-12T00:00:00.000Z");
    await insertListed(5, "echo", null);
    await merges(a, 3, T1, 0.1);
    await merges(b, 3, T1, 0.2);
    await diff.rebuild(at(T1));
    const pages = await diff.walk(1);
    expect(pages.flatMap((p) => p.cards.map((c) => c.slug))).toEqual(["bravo", "alpha", "charlie", "delta", "echo"]);
    expect(pages.map((p) => (p.next === null ? "end" : p.next.activity))).toEqual([4003, 4003, null, null, "end"]);
    // A cursor whose publication is null is the epoch on both engines.
    const afterNull = await diff.page({ cursor: { activity: null, publishedAt: null, slug: "a" }, limit: 10 });
    expect(afterNull.cards.map((c) => c.slug)).toEqual(["echo"]);
  });

  it("every way a listing stops being listed removes its card: unpublished, delisted, removed, deleted", async () => {
    const ids = [
      await insertListed(1, "one", T1),
      await insertListed(2, "two", T1),
      await insertListed(3, "three", T1),
      await insertListed(4, "four", T1),
      await insertListed(5, "five", T1),
    ];
    expect((await diff.rebuild(at(T2))).cards).toBe(5);
    await sql.execute(`UPDATE openproduct.profiles SET visibility = 'private' WHERE id = $1`, [ids[0]]);
    await sql.execute(`UPDATE openproduct.profiles SET moderation_state = 'delisted', moderated_at = $2 WHERE id = $1`, [ids[1], T2]);
    await sql.execute(`UPDATE openproduct.profiles SET moderation_state = 'removed', moderated_at = $2 WHERE id = $1`, [ids[2], T2]);
    await sql.execute(`DELETE FROM openproduct.profiles WHERE id = $1`, [ids[3]]);
    // The deleted one's card went with it by cascade (both engines), so three are REMOVED by the phase.
    expect(await diff.rebuild(at(T3))).toEqual({ computedAt: T3, cards: 1, written: 0, removed: 3 });
    expect((await diff.page({ cursor: null, limit: 10 })).cards.map((c) => c.slug)).toEqual(["five"]);
  });

  it("orders slugs by bytes on both engines — accents, CJK, emoji and case (COLLATE \"C\" = BINARY)", async () => {
    const slugs = ["zeta", "Zulu", "émile", "émile", "café", "cafe", "東京", "rocket-🚀", "rocket-～", "a-b", "a_b", "a.b"];
    for (const [i, slug] of slugs.entries()) await insertListed(i + 1, slug, "2026-08-10T00:00:00.000Z", { tagline: `${slug} — ✨ unicode tagline` });
    await diff.rebuild(at(T1));
    const walked = (await diff.walk(2)).flatMap((p) => p.cards.map((c) => c.slug));
    const byBytes = [...slugs].sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)));
    expect(walked).toEqual(byBytes);
    // NOT the JS default sort (UTF-16 code units): an astral emoji sorts BEFORE
    // U+FF5E in UTF-16 and AFTER it in UTF-8. Both SQL engines use bytes.
    expect(walked).not.toEqual([...slugs].sort());
  });

  it("keeps media in DOCUMENT order inside the aggregate whatever the insertion order", async () => {
    await seedPublished();
    const put = (id: string, kind: string, position: number, observedAt: string | null) =>
      sql.execute(
        `INSERT INTO openproduct.product_media (id, profile_id, kind, storage_ref, alt_text, width, height, position, observed_at)
         VALUES ($1, $2, $3, $6, 'alt', 100, 100, $4, $5)`,
        [id, PROFILE, kind, position, observedAt, `ref-${id}`],
      );
    await put(asUuid("aaaaaaaa-0000-4000-8000-000000000009"), "screenshot", 0, "2026-08-16T00:00:00.000Z");
    await put(asUuid("aaaaaaaa-0000-4000-8000-000000000003"), "gallery", 2, null);
    await put(asUuid("aaaaaaaa-0000-4000-8000-000000000001"), "gallery", 0, null);
    await put(asUuid("aaaaaaaa-0000-4000-8000-000000000002"), "gallery", 1, null);
    await put(asUuid("aaaaaaaa-0000-4000-8000-000000000005"), "hero", 0, null);
    await put(asUuid("aaaaaaaa-0000-4000-8000-000000000004"), "logo", 0, null);
    await diff.rebuild(at(T1));
    const media = (await diff.page({ cursor: null, limit: 10 })).media.get("acme-thing")!;
    expect(media.map((m) => `${m.kind}:${m.position}`)).toEqual(["logo:0", "hero:0", "gallery:0", "gallery:1", "gallery:2", "screenshot:0"]);
    expect(media).toEqual((await repo.listPublicMediaForSlugs(["acme-thing"])).get("acme-thing"));
  });

  it("counts the census windows to the same millisecond at every boundary", async () => {
    const now = "2026-08-31T12:00:00.000Z";
    const ms = (iso: string, delta: number) => new Date(Date.parse(iso) + delta).toISOString();
    const day = 24 * 3600 * 1000;
    const edges = [
      ms(now, -1), ms(now, -day), ms(now, -day - 1), ms(now, -7 * day), ms(now, -7 * day - 1),
      ms(now, -30 * day), ms(now, -30 * day - 1), ms(now, -400 * day),
    ];
    for (const [i, edge] of edges.entries()) await insertListed(i + 1, `edge-${i}`, edge);
    await insertListed(99, "never-published", null);
    const report = await diff.rebuild({ now, mergesSince: MERGES_SINCE, endorsementsSince: MERGES_SINCE });
    expect(report.cards).toBe(9);
    expect((await diff.page({ cursor: null, limit: 1 })).windows).toEqual({ today: 2, week: 4, month: 6, total: 8 });
  });

  it("rewrites a row when ONLY its media changed, and when only an observation's value changed", async () => {
    await seedPublished();
    await merges(PROFILE, 5, T1, 0.3);
    await diff.rebuild(at(T1));
    await sql.execute(`UPDATE openproduct.metrics SET value = 6 WHERE profile_id = $1`, [PROFILE]);
    expect((await diff.rebuild(at(T2))).written).toBe(1);
    await repo.insertMedia({ id: asUuid("abababab-abab-4bab-8bab-abababababab"), profileId: PROFILE, kind: "hero", storageRef: "h.png", alt: "Hero", width: 10, height: 10, position: 0 });
    expect((await diff.rebuild(at(T3))).written).toBe(1);
    expect((await diff.rebuild(at(T4))).written).toBe(0);
  });

  it("clamps the page size on both engines: 0 → 1, 100000 → 200", async () => {
    for (let i = 1; i <= 205; i += 1) await insertListed(i, `bulk-${String(i).padStart(3, "0")}`, ms0(i));
    await diff.rebuild(at(T1));
    expect((await diff.page({ cursor: null, limit: 0 })).cards).toHaveLength(1);
    const capped = await diff.page({ cursor: null, limit: 100_000 });
    expect(capped.cards).toHaveLength(200);
    expect(capped.next).not.toBeNull();
  }, 60_000);

  it("a draft is never catalogued", async () => {
    await seedDraft();
    expect(await diff.rebuild(at(T1))).toEqual({ computedAt: T1, cards: 0, written: 0, removed: 0 });
  });
});

function ms0(i: number): string {
  return new Date(Date.parse("2026-08-01T00:00:00.000Z") + i * 60_000).toISOString();
}
