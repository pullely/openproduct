// The leaderboard's read (openproduct-launch UV2).
//
// The ORDER is tested in packages/contracts, where `buildLeaderboard` is pure.
// What is pinned here is the handler and its route:
//
//   - the range comes from the query string, and an unknown one is refused
//   - the window is decided from the clock and handed to the read, so the
//     database's own clock never decides what the table shows
//   - the roster read is BATCHED and asks only about rows that will be listed
//   - OL-2a: the handler counts nothing; it orders numbers the board published
//   - it resolves no actor and refuses anything but GET

import { LEADERBOARD_FORMULA, LEADERBOARD_WEEK_DAYS } from "@openproduct/contracts";
import type { FeedLaunchRecord, OpenproductRepository, RosterMemberRecord } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { LeaderboardHandlerDeps } from "@openproduct-worker/handlers/leaderboard";

const BASE = "https://openproduct.internal/internal/public/openproduct/leaderboard";
const NOW = Date.parse("2026-09-05T12:00:00.000Z");

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(search = "", method = "GET"): Request {
  return new Request(`${BASE}${search}`, { method, headers: { "x-request-id": "req_uv2" } });
}

function row(
  over: Partial<FeedLaunchRecord> & Pick<FeedLaunchRecord, "slug" | "day">,
): FeedLaunchRecord {
  return {
    launchId: `l-${over.slug}`,
    profileId: `p-${over.slug}`,
    tagline: null,
    versionLabel: "1.0",
    launchedAt: `${over.day}T09:00:00.000Z`,
    rank: 1,
    counted: 1,
    ineligible: 0,
    licence: null,
    category: null,
    stack: [],
    roleOpeningCount: 0,
    commentCount: 0,
    ...over,
  };
}

function member(over: Partial<RosterMemberRecord> = {}): RosterMemberRecord {
  return {
    subjectId: "sub_1",
    roleLabel: "maintainer",
    handle: "ada",
    displayName: "Ada Lovelace",
    since: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

interface Harness {
  deps: LeaderboardHandlerDeps;
  /** Every window the handler asked for. */
  windows: string[][];
  /** Every batch of profile ids it asked rosters for. */
  rosterCalls: string[][];
}

function harness(
  rows: FeedLaunchRecord[] = [],
  rosters: Map<string, RosterMemberRecord[]> = new Map(),
): Harness {
  const windows: string[][] = [];
  const rosterCalls: string[][] = [];
  const repo = {
    // openproduct-studio OSD3 — the rows' logos; none unless a test says so.
    async listPublicMediaForSlugs() {
      return new Map();
    },
    async listFeedLaunches(dayIds: readonly string[]) {
      windows.push([...dayIds]);
      return rows;
    },
    async listRostersFor(profileIds: readonly string[]) {
      rosterCalls.push([...profileIds]);
      return rosters;
    },
  } as unknown as OpenproductRepository;
  return { deps: { repo, now: () => NOW } as LeaderboardHandlerDeps, windows, rosterCalls };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("the range", () => {
  it("defaults to the week when the parameter is absent", async () => {
    const h = harness();
    const data = await json(await route(req(), env(), h.deps as never));
    expect(data.range).toBe("week");
    expect(h.windows[0]).toHaveLength(LEADERBOARD_WEEK_DAYS);
  });

  it("takes the month when asked, and the month is the CALENDAR month so far", async () => {
    const h = harness();
    const data = await json(await route(req("?range=month"), env(), h.deps as never));
    expect(data.range).toBe("month");
    expect(h.windows[0]).toEqual([
      "2026-09-05",
      "2026-09-04",
      "2026-09-03",
      "2026-09-02",
      "2026-09-01",
    ]);
  });

  it("REFUSES an unknown range rather than serving the week", async () => {
    // `?range=decade` answered with a week is one URL with two meanings, and
    // the reader who typed it walks away believing we publish a ranking we
    // do not. (HB2 made the year real; the refusal moved one step out.)
    const h = harness();
    const res = await route(req("?range=decade"), env(), h.deps as never);
    expect(res.status).toBe(400);
    expect(h.windows).toHaveLength(0);
  });
});

describe("the reads", () => {
  it("decides the window here, never from the database's clock", async () => {
    const h = harness();
    await route(req(), env(), h.deps as never);
    expect(h.windows).toHaveLength(1);
    for (const day of h.windows[0]!) expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(h.windows[0]![0]).toBe("2026-09-05");
    expect(h.windows[0]!.at(-1)).toBe("2026-08-30");
  });

  it("reads every roster in ONE call, not one per row", async () => {
    // A month of launches with a roster read each would make the page's read
    // count a function of how busy the month was.
    const h = harness([
      row({ slug: "a", day: "2026-09-05", counted: 3 }),
      row({ slug: "b", day: "2026-09-04", counted: 2 }),
      row({ slug: "c", day: "2026-09-03", counted: 1 }),
    ]);
    await route(req(), env(), h.deps as never);
    expect(h.rosterCalls).toHaveLength(1);
    expect(h.rosterCalls[0]).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("does not ask for the makers of a launch it will not list", async () => {
    // A launch the sweep has not counted is absent from the table, so fetching
    // its roster would be reading rows to throw them away.
    const h = harness([
      row({ slug: "counted", day: "2026-09-05", rank: 1, counted: 4 }),
      row({ slug: "uncounted", day: "2026-09-05", rank: null, counted: 0 }),
    ]);
    await route(req(), env(), h.deps as never);
    expect(h.rosterCalls[0]).toEqual(["p-counted"]);
  });
});

describe("the document", () => {
  it("orders by the board's published count, pooling days", async () => {
    const h = harness([
      row({ slug: "quiet-winner", day: "2026-09-01", rank: 1, counted: 4 }),
      row({ slug: "busy-third", day: "2026-09-04", rank: 3, counted: 40 }),
    ]);
    const data = await json(await route(req(), env(), h.deps as never));
    const entries = data.entries as Array<{ slug: string; rank: number; dayRank: number }>;
    expect(entries.map((e) => e.slug)).toEqual(["busy-third", "quiet-winner"]);
    expect(entries[0]!.rank).toBe(1);
    // The day's own position is carried, because it is the fact that explains
    // why the launch above won its leaderboard row without winning its day.
    expect(entries[0]!.dayRank).toBe(3);
  });

  it("omits a launch with no published number rather than listing it at zero", async () => {
    const h = harness([
      row({ slug: "counted", day: "2026-09-05", rank: 1, counted: 4 }),
      row({ slug: "uncounted", day: "2026-09-05", rank: null, counted: 0 }),
    ]);
    const data = await json(await route(req(), env(), h.deps as never));
    expect((data.entries as Array<{ slug: string }>).map((e) => e.slug)).toEqual(["counted"]);
  });

  it("carries its own formula, not the board's", async () => {
    // Same numbers, a different question, so it owes its own sentence (OPC-4).
    const h = harness();
    const data = await json(await route(req(), env(), h.deps as never));
    expect(data.formula).toBe(LEADERBOARD_FORMULA);
  });

  it("carries the subtitle, the meaning and the empty note always", async () => {
    // A string that arrives conditionally is a string that is missing the one
    // time it is needed.
    const h = harness([row({ slug: "a", day: "2026-09-05", counted: 1 })]);
    const data = await json(await route(req(), env(), h.deps as never));
    expect(typeof data.subtitle).toBe("string");
    expect(typeof data.meaning).toBe("string");
    expect(typeof data.emptyNote).toBe("string");
  });

  it("attaches each row's confirmed makers", async () => {
    const h = harness(
      [row({ slug: "a", day: "2026-09-05", counted: 1 })],
      new Map([["p-a", [member({ handle: "ada", displayName: "Ada Lovelace" })]]]),
    );
    const data = await json(await route(req(), env(), h.deps as never));
    const entries = data.entries as Array<{ makers: Array<{ handle: string; name: string }> }>;
    expect(entries[0]!.makers).toEqual([{ handle: "ada", name: "Ada Lovelace" }]);
  });

  it("a maker with no public profile has a name and no handle (XP-5)", async () => {
    // The roster carries the handle if and only if `/@handle` resolves, so the
    // page never mints an address for somebody who chose not to have one.
    const h = harness(
      [row({ slug: "a", day: "2026-09-05", counted: 1 })],
      new Map([["p-a", [member({ handle: null, displayName: null, roleLabel: "design lead" })]]]),
    );
    const data = await json(await route(req(), env(), h.deps as never));
    const entries = data.entries as Array<{ makers: Array<{ handle: string | null }> }>;
    expect(entries[0]!.makers[0]!.handle).toBeNull();
  });
});

describe("the route", () => {
  it("refuses anything but GET", async () => {
    const h = harness();
    const res = await route(req("", "POST"), env(), h.deps as never);
    expect(res.status).toBe(405);
  });

  it("resolves no actor — the answer is the same document for everybody (I6)", async () => {
    const h = harness([row({ slug: "a", day: "2026-09-05", counted: 1 })]);
    const anon = await json(await route(req(), env(), h.deps as never));
    const withCookie = await json(
      await route(
        new Request(BASE, { headers: { cookie: "op_session=whatever", "x-request-id": "r2" } }),
        env(),
        harness([row({ slug: "a", day: "2026-09-05", counted: 1 })]).deps as never,
      ),
    );
    expect(withCookie).toEqual(anon);
  });
});
