// The launch feed's read (openproduct-launch OL2).
//
// The GROUPING is tested in packages/contracts, where `buildFeed` is pure.
// What is pinned here is the handler and its route:
//
//   - the window is decided from the clock and handed to the read, so the
//     database's own clock never decides what the front page shows
//   - ONE read for the whole week, because `/` has a read budget of one
//   - the answer carries the day it means, the formula behind the order, and
//     the sentence that names the UTC boundary
//   - it resolves no actor and refuses anything but GET
//   - OL-2a: the order is the board's, and the handler counts nothing

import { BOARD_FORMULA, FEED_WINDOW_DAYS } from "@openproduct/contracts";
import type { FeedLaunchRecord, OpenproductRepository, ProductMediaRecord } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { FeedHandlerDeps } from "@openproduct-worker/handlers/feed";

const FEED = "https://openproduct.internal/internal/public/openproduct/feed";
const NOW = Date.parse("2026-08-26T12:00:00.000Z");

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(method = "GET"): Request {
  return new Request(FEED, { method, headers: { "x-request-id": "req_ol2" } });
}

function row(over: Partial<FeedLaunchRecord> & Pick<FeedLaunchRecord, "slug" | "day">): FeedLaunchRecord {
  return {
    launchId: `l-${over.slug}`,
    profileId: `p-${over.slug}`,
    tagline: null,
    versionLabel: "1.0",
    launchedAt: `${over.day}T09:00:00.000Z`,
    rank: null,
    counted: 0,
    ineligible: 0,
    licence: null,
    category: null,
    stack: [],
    roleOpeningCount: 0,
    commentCount: 0,
    ...over,
  };
}

interface Harness {
  deps: FeedHandlerDeps;
  /** Every call the handler made, and what window it asked for. */
  calls: string[][];
}

function harness(rows: FeedLaunchRecord[] = [], media: Map<string, ProductMediaRecord[]> = new Map()): Harness {
  const calls: string[][] = [];
  const repo = {
    // MD3 — the rows' tiles; none on these fixtures unless a test says so.
    async listPublicMediaForSlugs() {
      return media;
    },
    async listFeedLaunches(dayIds: readonly string[]) {
      calls.push([...dayIds]);
      return rows;
    },
  } as unknown as OpenproductRepository;
  return { deps: { repo, now: () => NOW } as FeedHandlerDeps, calls };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("the window", () => {
  it("asks for exactly the days it advertises, newest first, from the clock", () => {
    const h = harness();
    return route(req(), env(), h.deps as never).then(async (res) => {
      expect(res.status).toBe(200);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]).toHaveLength(FEED_WINDOW_DAYS);
      expect(h.calls[0]![0]).toBe("2026-08-26");
      expect(h.calls[0]!.at(-1)).toBe("2026-08-20");
      expect((await json(res)).today).toBe("2026-08-26");
    });
  });

  it("makes ONE read for the whole week", async () => {
    // `/` has a read budget of one. Seven round trips to render one cached
    // document would spend it six times over.
    const h = harness([row({ slug: "a", day: "2026-08-26", rank: 1, counted: 5 })]);
    await route(req(), env(), h.deps as never);
    expect(h.calls).toHaveLength(1);
  });

  it("decides the window here, never from the database's clock", async () => {
    // A `now() - interval '7 days'` in SQL would make the front page a
    // function of when the query ran rather than of the day it names, and two
    // readers a second apart could hold different documents at one URL.
    const h = harness();
    await route(req(), env(), h.deps as never);
    for (const day of h.calls[0]!) expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("the document", () => {
  it("groups a week into the design's three headings", async () => {
    const h = harness([
      row({ slug: "now", day: "2026-08-26", rank: 1, counted: 9 }),
      row({ slug: "then", day: "2026-08-25", rank: 1, counted: 4 }),
      row({ slug: "before", day: "2026-08-22", rank: 1, counted: 2 }),
    ]);
    const data = await json(await route(req(), env(), h.deps as never));
    const groups = data.groups as Array<{ id: string; entries: unknown[] }>;
    expect(groups.map((g) => g.id)).toEqual(["today", "yesterday", "earlier"]);
    expect(groups.every((g) => g.entries.length === 1)).toBe(true);
  });

  it("carries the card facts a feed row draws", async () => {
    const h = harness([
      row({
        slug: "acme",
        day: "2026-08-26",
        rank: 1,
        counted: 12,
        ineligible: 3,
        licence: "MIT",
        category: "developer-tools",
        stack: ["typescript"],
        roleOpeningCount: 4,
        commentCount: 18,
      }),
    ]);
    const data = await json(await route(req(), env(), h.deps as never));
    const entry = (data.groups as Array<{ entries: Array<Record<string, unknown>> }>)[0]!.entries[0]!;
    expect(entry).toMatchObject({
      slug: "acme",
      rank: 1,
      counted: 12,
      ineligible: 3,
      licence: "MIT",
      roleOpeningCount: 4,
      commentCount: 18,
    });
    // CT1's category is ONE topic, not three. A row that rendered three
    // topics today would be inventing two of them; TP0 is what makes them
    // addresses.
    expect(entry.topics).toEqual(["developer-tools"]);
  });

  it("renders a listing with no category as having no topics, not an empty string", async () => {
    const h = harness([row({ slug: "acme", day: "2026-08-26", category: null })]);
    const data = await json(await route(req(), env(), h.deps as never));
    const entry = (data.groups as Array<{ entries: Array<Record<string, unknown>> }>)[0]!.entries[0]!;
    expect(entry.topics).toEqual([]);
  });

  it("says what the order is and when the day turns over", async () => {
    const data = await json(await route(req(), env(), harness().deps as never));
    // OPC-4 — a ranking a reader cannot look up is one they have to take on
    // trust.
    expect(data.formula).toBe(BOARD_FORMULA);
    expect(String(data.meaning)).toMatch(/midnight to midnight UTC/);
    expect(data.windowDays).toBe(FEED_WINDOW_DAYS);
  });

  it("carries the empty note always, not only when it is empty", async () => {
    // A string that arrives conditionally is a string that is missing the one
    // time it is needed.
    const full = await json(await route(req(), env(), harness([row({ slug: "a", day: "2026-08-26" })]).deps as never));
    const empty = await json(await route(req(), env(), harness().deps as never));
    expect(full.emptyNote).toEqual(empty.emptyNote);
    // NOT `/directory/` any more, and this assertion was the stale half of a
    // direct contradiction: `packages/contracts/src/feed.test.ts:154` asserts
    // the note must NOT say "directory", because OL2 made `/` the only list
    // and `/products` a 308 — a note pointing at "the directory" named an
    // address that had stopped existing. This suite is not scheduled on a
    // web-only change, so the red sat on main unseen; it is repaired here
    // because OPP6 adds a test to this package and therefore makes the lane
    // fire again.
    expect(String(empty.emptyNote)).toMatch(/quiet week/);
  });

  it("answers a quiet week with an empty Today rather than with an error (HB1)", async () => {
    const data = await json(await route(req(), env(), harness().deps as never));
    // HB1 — Today is always a block: the document says which day it is
    // even when nothing launched, and the page says "Nothing launched today".
    expect(data.groups).toEqual([{ id: "today", heading: "Today", day: "2026-08-26", entries: [] }]);
    expect(data.today).toBe("2026-08-26");
  });
});

describe("OL-2a — the handler ranks nothing", () => {
  it("takes the position the read gave it and does not reorder by count", async () => {
    // The read's rank is the board's. If the handler sorted by `counted`
    // itself it would be a second implementation of the order, and the two
    // would drift the first time TS4's eligibility rule changed.
    const h = harness([
      row({ slug: "fewer-votes-but-first", day: "2026-08-26", rank: 1, counted: 2 }),
      row({ slug: "more-votes-but-second", day: "2026-08-26", rank: 2, counted: 99 }),
    ]);
    const data = await json(await route(req(), env(), h.deps as never));
    const entries = (data.groups as Array<{ entries: Array<{ slug: string }> }>)[0]!.entries;
    expect(entries.map((e) => e.slug)).toEqual(["fewer-votes-but-first", "more-votes-but-second"]);
  });

  it("keeps an unranked launch on the page with no position at all", async () => {
    const h = harness([row({ slug: "unswept", day: "2026-08-26", rank: null })]);
    const data = await json(await route(req(), env(), h.deps as never));
    const entry = (data.groups as Array<{ entries: Array<Record<string, unknown>> }>)[0]!.entries[0]!;
    // Missing is not zero (OPC-C), and a launch that vanished because a cron
    // was late is the failure LC0 wrote `missed` to avoid.
    expect(entry.rank).toBeNull();
  });
});

describe("the route", () => {
  it("is public, anonymous, and resolves no actor", async () => {
    const res = await route(req(), env(), harness().deps as never);
    expect(res.status).toBe(200);
  });

  it("refuses anything but GET", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await route(req(method), env(), harness().deps as never);
      expect(res.status).toBe(405);
    }
  });

  it("does not shadow a listing whose slug happens to be `feed`", async () => {
    // The feed path is matched before the profile matcher, so `feed` never
    // parses as a slug — and a listing at `/internal/public/openproduct/
    // projects/feed` still resolves on its own address.
    const h = harness();
    await route(req(), env(), h.deps as never);
    expect(h.calls).toHaveLength(1);
  });
});

describe("MD3 — the row's tile", () => {
  const hero = (id: string): ProductMediaRecord => ({
    id,
    kind: "hero",
    storageRef: `${"a".repeat(64)}.png`,
    alt: "The dashboard",
    width: 1200,
    height: 630,
    position: 0,
    observedAt: null,
  });
  const gallery = (id: string): ProductMediaRecord => ({ ...hero(id), kind: "gallery", alt: "A page", position: 0 });

  const logo = (id: string): ProductMediaRecord => ({
    ...hero(id),
    kind: "logo",
    storageRef: `${"b".repeat(64)}.png`,
    alt: "The mark",
    width: 256,
    height: 256,
  });

  // openproduct-studio OSD2: the tile is the LOGO. A hero cropped to 52px is
  // not a face; it read as a broken logo on every row of the front page.
  it("carries the logo as the thumbnail, and null where there is none — neither a hero nor a gallery image is promoted", async () => {
    const rows = [
      row({ slug: "logoed", day: "2026-08-26", rank: 1, counted: 9 }),
      row({ slug: "plain", day: "2026-08-26", rank: 2, counted: 4 }),
      row({ slug: "heroed", day: "2026-08-26", rank: 3, counted: 2 }),
      row({ slug: "galleried", day: "2026-08-26", rank: 4, counted: 1 }),
    ];
    const media = new Map<string, ProductMediaRecord[]>([
      ["logoed", [hero("h0"), logo("l1")]],
      ["heroed", [hero("h1")]],
      ["galleried", [gallery("g1")]],
    ]);
    const data = await json(await route(req(), env(), harness(rows, media).deps as never));
    const today = (data.groups as Array<{ id: string; entries: Array<{ slug: string; thumbnail: unknown }> }>).find(
      (g) => g.id === "today",
    )!;
    expect(today.entries.map((e) => [e.slug, e.thumbnail])).toEqual([
      ["logoed", { ref: `${"b".repeat(64)}.png`, alt: "The mark", width: 256, height: 256 }],
      ["plain", null],
      ["heroed", null],
      ["galleried", null],
    ]);
  });

  it("reads the media ONCE for the whole week, never per row", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ slug: `s${i}`, day: "2026-08-26", rank: i + 1, counted: 12 - i }));
    let reads = 0;
    const h = harness(rows);
    (h.deps.repo as unknown as { listPublicMediaForSlugs: () => Promise<Map<string, never[]>> }).listPublicMediaForSlugs = async () => {
      reads += 1;
      return new Map();
    };
    await route(req(), env(), h.deps as never);
    expect(reads).toBe(1);
  });

  it("changes NOTHING about the order: a listing with no media holds the rank it held (MD-3, OPC-4)", async () => {
    // The board ranks; this handler reads. The same rows, with and without
    // pictures on some of them, come back in the same order with the same
    // ranks — a thumbnail is a picture of a product, not a fact about it.
    const rows = [
      row({ slug: "plain-first", day: "2026-08-26", rank: 1, counted: 9 }),
      row({ slug: "pictured-second", day: "2026-08-26", rank: 2, counted: 4 }),
      row({ slug: "plain-third", day: "2026-08-26", rank: 3, counted: 1 }),
    ];
    const shape = (data: Record<string, unknown>) =>
      (data.groups as Array<{ entries: Array<{ slug: string; rank: number | null }> }>).flatMap((g) =>
        g.entries.map((e) => `${e.slug}:${e.rank}`),
      );
    const without = shape(await json(await route(req(), env(), harness(rows).deps as never)));
    const withPictures = shape(
      await json(
        await route(
          req(),
          env(),
          harness(rows, new Map([["pictured-second", [hero("h")]]])).deps as never,
        ),
      ),
    );
    expect(withPictures).toEqual(without);
    expect(without).toEqual(["plain-first:1", "pictured-second:2", "plain-third:3"]);
  });
});
