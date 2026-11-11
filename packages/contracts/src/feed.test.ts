import { describe, expect, it } from "vitest";

import {
  FEED_CATALOGUE_FORMULA,
  FEED_CATALOGUE_HEADING,
  FEED_EMPTY_NOTE,
  FEED_ENTRY_KEYS,
  FEED_FORMULA,
  FEED_GROUP_IDS,
  FEED_MEANING,
  FEED_WINDOW_DAYS,
  buildFeed,
  catalogueBeyondFeed,
  feedCatalogueMeta,
  catalogueBelowFloor,
  FEED_FLOOR_HREF,
  FEED_HOW_HREF,
  FEED_WEEK_EMPTY_NOTE,
  feedGroupFor,
  feedHeading,
  feedIsEmpty,
  feedToday,
  feedWindowDays,
  isFirstToday,
  type FeedEntry,
} from "./feed.js";
import { BOARD_FORMULA, dayOf, parseDayId, rankBoard } from "./board.js";
import { FORMULAS } from "./provenance.js";
import { byMostActive } from "./ranking.js";

const TODAY = dayOf(Date.UTC(2026, 7, 26, 11, 0, 0)); // 2026-08-26

function entry(over: Partial<FeedEntry> & Pick<FeedEntry, "slug" | "day">): FeedEntry {
  return {
    launchId: `lch_${over.slug}`,
    tagline: null,
    versionLabel: "v1",
    launchedAt: `${over.day}T09:00:00.000Z`,
    rank: null,
    counted: 0,
    ineligible: 0,
    licence: null,
    topics: [],
    stack: [],
    roleOpeningCount: 0,
    commentCount: 0,
    thumbnail: null,
    ...over,
  };
}

describe("the day a launch lands in", () => {
  it("names today, yesterday and the rest of the week, and nothing outside it", () => {
    expect(feedGroupFor(dayOf(Date.UTC(2026, 7, 26)), TODAY)).toBe("today");
    expect(feedGroupFor(dayOf(Date.UTC(2026, 7, 25)), TODAY)).toBe("yesterday");
    expect(feedGroupFor(dayOf(Date.UTC(2026, 7, 24)), TODAY)).toBe("earlier");
    // The seventh day back is the last one in the window.
    expect(feedGroupFor(dayOf(Date.UTC(2026, 7, 20)), TODAY)).toBe("earlier");
    expect(feedGroupFor(dayOf(Date.UTC(2026, 7, 19)), TODAY)).toBeNull();
  });

  it("refuses a day that has not happened", () => {
    // `launched_at` is the moment the maker chose (LC0) and nothing stops
    // them choosing one an hour ahead. A future launch is not "today"; it is
    // not on the feed at all yet.
    expect(feedGroupFor(dayOf(Date.UTC(2026, 7, 27)), TODAY)).toBeNull();
  });

  it("covers exactly the window it advertises, newest first", () => {
    const days = feedWindowDays(TODAY);
    expect(days).toHaveLength(FEED_WINDOW_DAYS);
    expect(days[0]!.id).toBe("2026-08-26");
    expect(days.at(-1)!.id).toBe("2026-08-20");
    // Every id the feed asks the database for must be an id the board's own
    // parser accepts — the two surfaces address a day the same way or the
    // archive link under a feed row goes nowhere.
    for (const day of days) expect(parseDayId(day.id).ok).toBe(true);
  });

  it("reads the day off a clock in UTC, whatever the machine thinks", () => {
    // 23:30 in New Zealand on the 27th is still the 26th in UTC. The whole
    // reason OL-2 pinned the boundary: two readers must not disagree about
    // which day a launch is in.
    expect(feedToday(Date.UTC(2026, 7, 26, 23, 30)).id).toBe("2026-08-26");
    expect(feedToday(Date.UTC(2026, 7, 27, 0, 30)).id).toBe("2026-08-27");
  });
});

describe("the feed's shape", () => {
  it("groups in the design's order and drops a heading with nothing under it", () => {
    const feed = buildFeed(TODAY, [
      entry({ slug: "a", day: "2026-08-26", rank: 1 }),
      entry({ slug: "b", day: "2026-08-22", rank: 1 }),
    ]);
    // No `yesterday` heading, because nothing launched yesterday. A heading
    // over an empty list is a page telling you it is broken.
    expect(feed.groups.map((g) => g.id)).toEqual(["today", "earlier"]);
    expect(feed.today).toBe("2026-08-26");
  });

  it("keeps `earlier` as days stacked, not as one pooled ranking", () => {
    // Pooling would put a quiet Saturday's winner above a busy Monday's
    // runner-up and imply a comparison the board never made.
    const feed = buildFeed(TODAY, [
      entry({ slug: "mon-2nd", day: "2026-08-24", rank: 2, counted: 90 }),
      entry({ slug: "sat-1st", day: "2026-08-22", rank: 1, counted: 4 }),
      entry({ slug: "mon-1st", day: "2026-08-24", rank: 1, counted: 120 }),
    ]);
    const earlier = feed.groups.find((g) => g.id === "earlier")!;
    expect(earlier.entries.map((e) => e.slug)).toEqual(["mon-1st", "mon-2nd", "sat-1st"]);
  });

  it("sorts an unranked launch last within its day, never as rank zero", () => {
    // A day that has just begun has launches the sweep has not spoken about.
    // Missing is not zero (OPC-C).
    const feed = buildFeed(TODAY, [
      entry({ slug: "unranked", day: "2026-08-26", rank: null, counted: 0 }),
      entry({ slug: "ranked", day: "2026-08-26", rank: 1, counted: 3 }),
    ]);
    expect(feed.groups[0]!.entries.map((e) => e.slug)).toEqual(["ranked", "unranked"]);
  });

  it("breaks a tie by slug, so two reads of one feed never differ", () => {
    const feed = buildFeed(TODAY, [
      entry({ slug: "zeta", day: "2026-08-26", rank: null }),
      entry({ slug: "alpha", day: "2026-08-26", rank: null }),
    ]);
    expect(feed.groups[0]!.entries.map((e) => e.slug)).toEqual(["alpha", "zeta"]);
  });

  it("keeps Today as a block when the week was quiet, and says so (HB1)", () => {
    // Today is always a block: an empty one says "Nothing launched today"
    // rather than leaving the page without a day. The other two still drop.
    const feed = buildFeed(TODAY, []);
    expect(feed.groups.map((g) => [g.id, g.entries.length])).toEqual([["today", 0]]);
    expect(feed.groups[0]!.day).toBe(TODAY.id);
    expect(feedIsEmpty(feed)).toBe(true);
    // PL0 — the page draws the week as one block, so the sentence over an
    // empty one names the week. The DOCUMENT still keeps Today (above).
    expect(FEED_WEEK_EMPTY_NOTE).toBe("Nothing launched this week.");
    expect(FEED_HOW_HREF).toBe("/docs#launching");
  });

  it("drops a launch from outside the window rather than bucketing it", () => {
    const feed = buildFeed(TODAY, [entry({ slug: "old", day: "2026-08-01", rank: 1 })]);
    expect(feed.groups.map((g) => [g.id, g.entries.length])).toEqual([["today", 0]]);
    expect(feedIsEmpty(feed)).toBe(true);
  });

  it("HB1 — Yesterday is the archive's own order: the same rows, the same object", () => {
    // The feed's yesterday block and `/launches/<yesterday>` read the same
    // board rows and sort by the rank the board wrote. Given one set of
    // rows, both produce one order — which is what "provably the same
    // object" means for a document that is cached at two addresses.
    const rows = [
      { launchId: "l1", slug: "quiet", tagline: null, versionLabel: "1.0", launchedAt: "2026-08-25T09:00:00Z", counted: 2, ineligible: 0 },
      { launchId: "l2", slug: "busy", tagline: null, versionLabel: "1.0", launchedAt: "2026-08-25T10:00:00Z", counted: 9, ineligible: 1 },
      { launchId: "l3", slug: "mid", tagline: null, versionLabel: "1.0", launchedAt: "2026-08-25T08:00:00Z", counted: 5, ineligible: 0 },
    ];
    const board = rankBoard(rows);
    const feed = buildFeed(
      TODAY,
      board.map((row, index) =>
        entry({ launchId: row.launchId, slug: row.slug, day: "2026-08-25", rank: index + 1, counted: row.counted }),
      ),
    );
    const yesterday = feed.groups.find((g) => g.id === "yesterday")!;
    expect(yesterday.day).toBe("2026-08-25");
    expect(yesterday.entries.map((e) => e.slug)).toEqual(board.map((row) => row.slug));
    expect(feedIsEmpty(feed)).toBe(false);
  });
});

describe("`#1 today`", () => {
  it("is rank one, and only inside today", () => {
    expect(isFirstToday(entry({ slug: "a", day: "2026-08-26", rank: 1 }), TODAY)).toBe(true);
    expect(isFirstToday(entry({ slug: "a", day: "2026-08-26", rank: 2 }), TODAY)).toBe(false);
    // Yesterday's winner does not keep a badge. The archive is where a past
    // day's order lives, and a badge that outlived its day is a claim a
    // reader cannot check against anything.
    expect(isFirstToday(entry({ slug: "a", day: "2026-08-25", rank: 1 }), TODAY)).toBe(false);
  });
});

describe("what the page says", () => {
  it("names the day boundary, because a ranking that resets unannounced looks broken", () => {
    expect(FEED_MEANING).toMatch(/midnight to midnight UTC/);
  });

  it("tells a reader with an empty week what launching is, and does not blame them", () => {
    // There is no directory to point at any more — `/` IS the list — so the
    // note explains the quiet rather than sending the reader elsewhere.
    expect(FEED_EMPTY_NOTE).toMatch(/quiet week/);
    expect(FEED_EMPTY_NOTE).not.toMatch(/directory/);
  });

  it("headings name their day, so a cached page says which day it means", () => {
    // The design draws the word and the date in two faces, so the date
    // travels as the group's `day` and the heading is the word alone.
    expect(feedHeading("today", TODAY)).toBe("Today");
    expect(feedHeading("yesterday", TODAY)).toBe("Yesterday");
    // The bucket names no day because it holds several.
    expect(feedHeading("earlier", TODAY)).toBe("Earlier this week");
  });
});

describe("OL-2a — one order, one formula", () => {
  it("resolves to the BOARD's formula and does not mint a second one", () => {
    // The whole amendment, as an assertion. A `launch.feed-rank` would be a
    // second published claim about the same fact, and the front page and the
    // archive could then disagree about who was first.
    expect(FEED_FORMULA).toBe(BOARD_FORMULA);
    expect(FORMULAS[FEED_FORMULA]).toBeDefined();
  });

  it("exports no ranking function of its own", async () => {
    const module: Record<string, unknown> = await import("./feed.js");
    const rankers = Object.keys(module).filter((k) => /^rank/i.test(k));
    expect(rankers).toEqual([]);
  });

  it("carries the board's accountability pair on every row", () => {
    // `counted` decided the position and `ineligible` is what lets a maker
    // reconcile it against the total on their own page.
    expect(FEED_ENTRY_KEYS).toContain("counted");
    expect(FEED_ENTRY_KEYS).toContain("ineligible");
    expect(FEED_ENTRY_KEYS).toContain("rank");
  });

  it("names its groups once, and the ids and the order agree", () => {
    expect([...FEED_GROUP_IDS]).toEqual(["today", "yesterday", "earlier"]);
  });
});

describe("everything else — the launches page shows every product", () => {
  // IN3 — COMPLETE BY DEFAULT, so these cases still test what they were
  // written to test. The floor gets its own block below rather than being
  // smuggled into every existing assertion.
  const card = (slug: string, merges: number | null, publishedAt: string) => ({
    slug,
    tagline: `${slug}, in one line`,
    stack: [],
    stackCanonical: [],
    category: "observability",
    hosting: null,
    pricing: null,
    licence: null,
    roleOpeningCount: 0,
    openingCommitments: [],
    hasLiveUrl: false,
    indexable: true,
    publishedAt,
    metrics: merges === null ? [] : [{ key: "merges.7d", value: merges, observedAt: publishedAt, state: "fresh" as const }],
    thumbnail: null,
  });

  it("lists every product the week's groups do not already show, once", () => {
    const feed = buildFeed(TODAY, [entry({ slug: "shown", day: TODAY.id, rank: 1 })]);
    const rest = catalogueBeyondFeed(
      [card("shown", 9, "2026-08-01T00:00:00Z"), card("quiet", 1, "2026-07-01T00:00:00Z")],
      feed,
    );
    expect(rest.map((c) => c.slug)).toEqual(["quiet"]);
  });

  it("takes the directory's published default order — most active, then newest", () => {
    const feed = buildFeed(TODAY, []);
    const rest = catalogueBeyondFeed(
      [
        card("old-quiet", null, "2026-01-01T00:00:00Z"),
        card("busy", 5, "2026-02-01T00:00:00Z"),
        card("new-quiet", null, "2026-03-01T00:00:00Z"),
        card("busier", 7, "2026-01-15T00:00:00Z"),
      ],
      feed,
    );
    expect(rest.map((c) => c.slug)).toEqual(["busier", "busy", "new-quiet", "old-quiet"]);
    expect(FEED_CATALOGUE_FORMULA).toBe("sort.most-active");
  });

  it("does not mutate the cards it was handed", () => {
    const cards = [card("b", 1, "2026-01-01T00:00:00Z"), card("a", 2, "2026-01-01T00:00:00Z")];
    catalogueBeyondFeed(cards, buildFeed(TODAY, []));
    expect(cards.map((c) => c.slug)).toEqual(["b", "a"]);
  });

  // ── IN3 — the floor, and the rank it does not move ──────────────────────

  it("leaves a listing below the floor OUT, rather than ordering it lower", () => {
    // WC-D's answer in one assertion. `sleepy` is the most active card here;
    // a WEIGHT would have pushed it down the list, and a floor removes it.
    // The difference matters to the maker: last place is a judgement about
    // their product, absence is a missing field they can fill in one edit.
    const feed = buildFeed(TODAY, []);
    const sleepy = { ...card("sleepy", 99, "2026-01-01T00:00:00Z"), category: null };
    const rest = catalogueBeyondFeed([sleepy, card("ok", 1, "2026-01-01T00:00:00Z")], feed);
    expect(rest.map((c) => c.slug)).toEqual(["ok"]);
    expect(rest.map((c) => c.slug)).not.toContain("sleepy");
  });

  it("needs BOTH a tagline and a topic, and neither alone", () => {
    const feed = buildFeed(TODAY, []);
    const base = card("x", 1, "2026-01-01T00:00:00Z");
    expect(catalogueBeyondFeed([{ ...base, tagline: null }], feed)).toEqual([]);
    expect(catalogueBeyondFeed([{ ...base, category: null }], feed)).toEqual([]);
    expect(catalogueBeyondFeed([base], feed).map((c) => c.slug)).toEqual(["x"]);
  });

  it("HOLDS THE RANK A LISTING ALREADY HELD — the boost IN3 refuses to be", () => {
    // IN3's done-when, asserted directly rather than reasoned about: the same
    // cards ordered by the comparator alone, and ordered through the floor,
    // come back in the same relative order. The floor can only remove.
    //
    // If somebody later scores completeness and folds it into `byMostActive`
    // — two lines, and it would read like a refinement — `full` would move
    // above `busier` here and this fails.
    const feed = buildFeed(TODAY, []);
    const cards = [
      card("old-quiet", null, "2026-01-01T00:00:00Z"),
      card("busy", 5, "2026-02-01T00:00:00Z"),
      { ...card("full", 5, "2026-01-20T00:00:00Z"), hosting: "self-hosted", stack: ["rust"] },
      card("busier", 7, "2026-01-15T00:00:00Z"),
    ];
    const throughTheFloor = catalogueBeyondFeed(cards, feed).map((c) => c.slug);
    const comparatorAlone = [...cards].sort(byMostActive).map((c) => c.slug);
    expect(throughTheFloor).toEqual(comparatorAlone);
    // And `full` — the most complete card here — is NOT first.
    expect(throughTheFloor[0]).toBe("busier");
  });

  it("does not filter the week's groups, only the catalogue", () => {
    // A listing that launched is on the board because the board's own
    // published rule put it there. Dropping a launch out of its day would
    // make the front page and `/launches/<day>` two claims about one day
    // (OL-2a) — and the board is not a list you enter by filling a form.
    const feed = buildFeed(TODAY, [entry({ slug: "bare", day: TODAY.id, rank: 1 })]);
    expect(feed.groups.flatMap((g) => g.entries.map((e) => e.slug))).toContain("bare");
  });

  it("names the group and counts it honestly", () => {
    // PL0 — the catalogue is the front page, and the heading is its name.
    // OB4 — and its name is Open builds.
    expect(FEED_CATALOGUE_HEADING).toBe("Open builds");
    expect(feedCatalogueMeta(1)).toBe("1 product · most active first");
    expect(feedCatalogueMeta(12)).toBe("12 products · most active first");
    // HB0 — a filtered count confesses the filter (WC2-6).
    expect(feedCatalogueMeta(1, 4)).toBe("1 product on the front page · 4 more below the floor");
    expect(feedCatalogueMeta(0, 1)).toBe("0 products on the front page · 1 more below the floor");
    expect(feedCatalogueMeta(3, 0)).toBe("3 products · most active first");
    expect(FEED_FLOOR_HREF).toBe("/docs#floor");
  });
});

describe("the floor is visible (openproduct-worldclass-v2 HB0)", () => {
  const card = (slug: string, merges: number | null, publishedAt: string) => ({
    slug,
    tagline: `${slug}, in one line`,
    stack: [],
    stackCanonical: [],
    category: "observability",
    hosting: null,
    pricing: null,
    licence: null,
    roleOpeningCount: 0,
    openingCommitments: [],
    hasLiveUrl: false,
    indexable: true,
    publishedAt,
    metrics: merges === null ? [] : [{ key: "merges.7d", value: merges, observedAt: publishedAt, state: "fresh" as const }],
    thumbnail: null,
  });

  it("counts what the directory holds below the floor, and it is the complement of the catalogue", () => {
    const feed = buildFeed(TODAY, []);
    const ok = card("ok", 1, "2026-01-01T00:00:00Z");
    const noTopic = { ...card("no-topic", 5, "2026-01-01T00:00:00Z"), category: null };
    const noTagline = { ...card("no-tagline", 5, "2026-01-01T00:00:00Z"), tagline: null };
    const cards = [ok, noTopic, noTagline];
    expect(catalogueBelowFloor(cards, feed)).toBe(2);
    expect(catalogueBeyondFeed(cards, feed).length + catalogueBelowFloor(cards, feed)).toBe(cards.length);
  });

  it("does not count a listing the board already shows, whatever its fields", () => {
    const shown = { ...card("shown", 1, "2026-01-01T00:00:00Z"), category: null };
    const feed = buildFeed(TODAY, [entry({ slug: "shown", day: TODAY.id, rank: 1 })]);
    expect(catalogueBelowFloor([shown], feed)).toBe(0);
  });
});
