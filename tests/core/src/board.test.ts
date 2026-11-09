// The launch board (openproduct-commons LC3).
//
// The RANK is tested in packages/contracts, where `rankBoard` and
// `countForBoard` are pure. What is pinned here is the sweep and the reads:
//
//   - a settled day is never recomputed, so a late restatement cannot rewrite
//     a board somebody already read and linked to
//   - EXCEPT a day nothing ever ranked, which would otherwise strand a launch
//     that fired while the sweep was down
//   - the sweep hands the contract the raw endorsements and takes its answer,
//     rather than deciding what counts itself
//   - the public read applies the contract's order, not the database's
//   - a malformed day is a 404 and not a coerced board
//   - the sweep is internal and the reads are public

import { countForBoard, dayOf, rankBoard } from "@openproduct/contracts";
import type { OpenproductRepository, WriteBoardRanksInput } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { BoardHandlerDeps } from "@openproduct-worker/handlers/board";

const SWEEP = "https://openproduct.internal/internal/openproduct/launches/board-sweep";
const BOARD = "https://openproduct.internal/internal/public/openproduct/launches";
const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const TODAY = "2026-08-26";
const YESTERDAY = "2026-08-25";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(url: string, method = "POST"): Request {
  return new Request(url, { method, headers: { "x-request-id": "req_lc3" } });
}

interface DayLaunch {
  launchId: string;
  profileId: string;
  slug: string;
  tagline: string | null;
  versionLabel: string;
  launchedAt: string;
  endorsements: Array<{ subjectId: string; subjectFirstSeenAt: string }>;
}

function launch(over: Partial<DayLaunch> & { slug: string }): DayLaunch {
  return {
    launchId: `l-${over.slug}`,
    profileId: `p-${over.slug}`,
    tagline: null,
    versionLabel: "1.0",
    launchedAt: "2026-08-26T09:00:00.000Z",
    endorsements: [],
    ...over,
  };
}

/** N endorsers whose first act here was `agoMs` before the launch. */
function endorsers(n: number, agoMs: number, launchedAt = "2026-08-26T09:00:00.000Z") {
  return Array.from({ length: n }, (_, i) => ({
    subjectId: `usr_${agoMs}_${i}`,
    subjectFirstSeenAt: new Date(Date.parse(launchedAt) - agoMs).toISOString(),
  }));
}

interface Harness {
  deps: BoardHandlerDeps;
  writes: WriteBoardRanksInput[];
  /** Days the sweep asked to read ranks back for — the "never ranked" probe. */
  probed: string[];
  reads: string[];
}

function harness(options: {
  days?: Array<{ day: string; launches: number }>;
  onDay?: Record<string, DayLaunch[]>;
  existing?: Record<string, Array<Record<string, unknown>>>;
} = {}): Harness {
  const writes: WriteBoardRanksInput[] = [];
  const probed: string[] = [];
  const reads: string[] = [];
  let ids = 0;

  const repo = {
    // openproduct-studio OSD3 — the rows' logos; none unless a test says so.
    async listPublicMediaForSlugs() {
      return new Map();
    },
    async listBoardDays() {
      return options.days ?? [];
    },
    async listLaunchesOnDay(start: string) {
      const day = start.slice(0, 10);
      return options.onDay?.[day] ?? [];
    },
    async writeBoardRanks(input: WriteBoardRanksInput) {
      writes.push(input);
      return input.ranks.length;
    },
    async readBoardRanks(day: string) {
      probed.push(day);
      reads.push(day);
      return options.existing?.[day] ?? [];
    },
  } as unknown as OpenproductRepository;

  return {
    deps: {
      repo,
      now: () => NOW,
      generateId: () => `00000000-0000-4000-8000-${String(ids++).padStart(12, "0")}` as never,
    } as BoardHandlerDeps,
    writes,
    probed,
    reads,
  };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("the sweep ranks what can still move, and leaves settled days alone", () => {
  it("ranks today, because today is still open", async () => {
    const h = harness({
      days: [{ day: TODAY, launches: 2 }],
      onDay: { [TODAY]: [launch({ slug: "a" }), launch({ slug: "b" })] },
    });
    await route(req(SWEEP), env(), h.deps as never);

    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]!.day).toBe(TODAY);
    expect(h.writes[0]!.ranks).toHaveLength(2);
  });

  it("does NOT recompute a settled day that already has a board", async () => {
    // A closed day is final. Recomputing would spend the sweep's budget
    // re-deriving a number that cannot have changed — and worse, would let a
    // late integrity restatement silently rewrite a board somebody already
    // read and linked to.
    const h = harness({
      days: [{ day: YESTERDAY, launches: 3 }],
      onDay: { [YESTERDAY]: [launch({ slug: "old" })] },
      existing: { [YESTERDAY]: [{ launchId: "l-old" }] },
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.writes).toEqual([]);
  });

  it("DOES rank a settled day nothing ever ranked", async () => {
    // The one exception, and it is deliberate: a launch that fired while the
    // sweep was down would otherwise be stranded off the board forever —
    // the same failure LC0 wrote `missed` to avoid.
    const h = harness({
      days: [{ day: YESTERDAY, launches: 1 }],
      onDay: { [YESTERDAY]: [launch({ slug: "stranded", launchedAt: "2026-08-25T09:00:00.000Z" })] },
      existing: {},
    });
    await route(req(SWEEP), env(), h.deps as never);

    expect(h.writes).toHaveLength(1);
    const body = await json(await route(req(SWEEP), env(), harness({
      days: [{ day: YESTERDAY, launches: 1 }],
      onDay: { [YESTERDAY]: [launch({ slug: "stranded" })] },
    }).deps as never));
    expect((body.swept as { ranked: Array<{ reason: string }> }).ranked[0]!.reason).toBe(
      "never-ranked",
    );
  });

  it("does not probe a day it already knows is open", async () => {
    // The "never ranked" check costs a read per day. Today is open, so it can
    // never be skipped and the probe would be waste.
    const h = harness({
      days: [{ day: TODAY, launches: 1 }],
      onDay: { [TODAY]: [launch({ slug: "a" })] },
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.probed).not.toContain(TODAY);
  });

  it("writes nothing for a day whose launches all vanished", async () => {
    // A listing delisted after launching leaves a day the index still counts
    // and the read no longer returns. Writing an empty rank set would replace
    // a real board with nothing.
    const h = harness({ days: [{ day: TODAY, launches: 2 }], onDay: { [TODAY]: [] } });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.writes).toEqual([]);
  });

  it("survives a day id the database produced and the contract cannot parse", async () => {
    const h = harness({
      days: [{ day: "not-a-day", launches: 1 }, { day: TODAY, launches: 1 }],
      onDay: { [TODAY]: [launch({ slug: "a" })] },
    });
    const res = await route(req(SWEEP), env(), h.deps as never);
    expect(res.status).toBe(200);
    // The other days still deserve their boards.
    expect(h.writes.map((w) => w.day)).toEqual([TODAY]);
  });

  it("reports per day rather than a bare total", async () => {
    // An operator reading "ranked 3" cannot tell a healthy run from one that
    // silently skipped today.
    const h = harness({
      days: [{ day: TODAY, launches: 2 }],
      onDay: { [TODAY]: [launch({ slug: "a" }), launch({ slug: "b" })] },
    });
    const body = await json(await route(req(SWEEP), env(), h.deps as never));
    expect((body.swept as { ranked: unknown[] }).ranked).toEqual([
      { day: TODAY, launches: 2, reason: "open" },
    ]);
  });

  it("refuses anything but POST, and is not on the public plane", async () => {
    const h = harness();
    expect((await route(req(SWEEP, "GET"), env(), h.deps as never)).status).toBe(405);
    const publicAttempt = await route(
      new Request("https://openproduct.live/openproduct/launches/board-sweep", { method: "POST" }),
      env(),
    );
    expect(publicAttempt.status).toBe(404);
  });
});

describe("the sweep asks the contract what counts", () => {
  it("hands over raw endorsements and stores exactly what TS4 decided", async () => {
    const rows = [
      launch({ slug: "mixed", endorsements: [...endorsers(6, 90 * DAY), ...endorsers(11, 60_000)] }),
    ];
    const h = harness({ days: [{ day: TODAY, launches: 1 }], onDay: { [TODAY]: rows } });
    await route(req(SWEEP), env(), h.deps as never);

    // The handler does not second-guess the rule: what `countForBoard`
    // decided is what is written. A handler that filtered would be a second
    // eligibility model nobody tested.
    const expected = countForBoard(
      Date.parse(rows[0]!.launchedAt),
      rows[0]!.endorsements.map((e) => ({
        subjectId: e.subjectId,
        subjectFirstSeenAt: Date.parse(e.subjectFirstSeenAt),
      })),
    );
    expect(h.writes[0]!.ranks[0]).toMatchObject({
      counted: expected.counted,
      ineligible: expected.ineligible,
    });
    expect(expected).toEqual({ counted: 6, ineligible: 11 });
  });

  it("gives every rank two distinct metric ids", async () => {
    // Two rows are written per launch and a primary key collision would drop
    // one silently. Deriving the second id from the first is the shape that
    // eventually collides; they come from the generator.
    const h = harness({
      days: [{ day: TODAY, launches: 2 }],
      onDay: { [TODAY]: [launch({ slug: "a" }), launch({ slug: "b" })] },
    });
    await route(req(SWEEP), env(), h.deps as never);
    const ids = h.writes[0]!.ranks.flatMap((r): string[] => [r.countedId, r.ineligibleId]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stamps the moment it ranked, not the moment of a launch (I9)", async () => {
    const h = harness({
      days: [{ day: TODAY, launches: 1 }],
      onDay: { [TODAY]: [launch({ slug: "a", launchedAt: "2026-08-26T03:00:00.000Z" })] },
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.writes[0]!.observedAt).toBe(new Date(NOW).toISOString());
  });

  it("carries the launch id, so board_rank_at can be stamped", async () => {
    const h = harness({
      days: [{ day: TODAY, launches: 1 }],
      onDay: { [TODAY]: [launch({ slug: "a" })] },
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.writes[0]!.ranks[0]!.launchId).toBe("l-a");
  });
});

describe("the public read", () => {
  const stored = (over: Record<string, unknown>) => ({
    launchId: "l-x",
    profileId: "p-x",
    slug: "x",
    tagline: null,
    versionLabel: "1.0",
    launchedAt: "2026-08-26T09:00:00.000Z",
    counted: 0,
    ineligible: 0,
    observedAt: "2026-08-26T11:00:00.000Z",
    ...over,
  });

  it("applies the CONTRACT's order, not the database's", async () => {
    const rows = [
      stored({ launchId: "l-b", slug: "b", counted: 2, launchedAt: "2026-08-26T06:00:00.000Z" }),
      stored({ launchId: "l-a", slug: "a", counted: 9 }),
      stored({ launchId: "l-c", slug: "c", counted: 2, launchedAt: "2026-08-26T04:00:00.000Z" }),
    ];
    const h = harness({ existing: { [TODAY]: rows } });
    const body = await json(await route(req(`${BOARD}/${TODAY}`, "GET"), env(), h.deps as never));

    const order = (body.board as Array<{ slug: string }>).map((e) => e.slug);
    // Same answer the pure ranker gives, including LC-2's earliest-launch
    // tiebreak between b and c.
    expect(order).toEqual(rankBoard(rows as never).map((e) => e.slug));
    expect(order).toEqual(["a", "c", "b"]);
  });

  it("says whether the day can still move, and when it was ranked", async () => {
    const h = harness({ existing: { [TODAY]: [stored({})] } });
    const body = await json(await route(req(`${BOARD}/${TODAY}`, "GET"), env(), h.deps as never));
    expect(body.open).toBe(true);
    expect(body.observedAt).toBe("2026-08-26T11:00:00.000Z");

    const past = harness({ existing: { [YESTERDAY]: [stored({})] } });
    const settled = await json(
      await route(req(`${BOARD}/${YESTERDAY}`, "GET"), env(), past.deps as never),
    );
    expect(settled.open).toBe(false);
  });

  it("renders an empty day as an empty board, not an error", async () => {
    const h = harness({ existing: {} });
    const res = await route(req(`${BOARD}/${TODAY}`, "GET"), env(), h.deps as never);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.board).toEqual([]);
    // A board nobody has ranked has no "as of", and the page must be able to
    // tell that from a stale one.
    expect(body.observedAt).toBeNull();
  });

  it("404s a malformed day rather than coercing it to a real board", async () => {
    // `/launches/2026-8-26` resolving to a board would make two URLs for one
    // document — a duplicate a crawler indexes happily.
    const h = harness();
    for (const bad of ["2026-8-26", "nonsense", "2026-02-31"]) {
      const res = await route(req(`${BOARD}/${bad}`, "GET"), env(), h.deps as never);
      expect({ bad, status: res.status }).toEqual({ bad, status: 404 });
    }
  });

  it("names no subject anywhere in the response", async () => {
    // A board names listings. Naming the people whose endorsements moved a
    // position would publish an endorsement graph nobody consented to.
    const h = harness({ existing: { [TODAY]: [stored({ counted: 4, ineligible: 2 })] } });
    const res = await route(req(`${BOARD}/${TODAY}`, "GET"), env(), h.deps as never);
    const text = JSON.stringify(await json(res));
    expect(text).not.toContain("usr_");
    expect(text).not.toContain("subjectId");
  });

  it("serves the archive index", async () => {
    const h = harness({ days: [{ day: TODAY, launches: 2 }, { day: YESTERDAY, launches: 1 }] });
    const body = await json(await route(req(BOARD, "GET"), env(), h.deps as never));
    expect(body.days).toEqual([
      { day: TODAY, launches: 2 },
      { day: YESTERDAY, launches: 1 },
    ]);
  });

  it("refuses a write to a read", async () => {
    const h = harness();
    expect((await route(req(`${BOARD}/${TODAY}`, "POST"), env(), h.deps as never)).status).toBe(405);
    expect((await route(req(BOARD, "POST"), env(), h.deps as never)).status).toBe(405);
  });

  it("resolves no actor — the board is one document for everybody", async () => {
    // OPC-1 / I6. A personalised board is not a board, it is a feed, and a
    // feed cannot be argued with.
    const h = harness({ existing: { [TODAY]: [stored({ counted: 3 })] } });
    const anon = await route(req(`${BOARD}/${TODAY}`, "GET"), env(), h.deps as never);
    const withSubject = await route(
      new Request(`${BOARD}/${TODAY}`, {
        method: "GET",
        headers: { "x-request-id": "req_lc3", "x-subject-id": "usr_someone" },
      }),
      env(),
      h.deps as never,
    );
    expect(JSON.stringify(await json(anon))).toBe(JSON.stringify(await json(withSubject)));
  });
});

describe("today is a day like any other", () => {
  it("uses the same UTC day the contract does", async () => {
    // The sweep and the page must not disagree about which day "today" is.
    expect(dayOf(NOW).id).toBe(TODAY);
  });
});

describe("NF0 — the day's winner is told once, and only when the day is settled", () => {
  interface Row {
    subjectId: string;
    kind: string;
    eventKey: string;
    actor: string | null;
    targetKind: string;
    targetRef: string;
    figure: number | null;
  }

  function inboxHarness(options: {
    days?: Array<{ day: string; launches: number }>;
    onDay?: Record<string, DayLaunch[]>;
    existing?: Record<string, Array<Record<string, unknown>>>;
    maintainers?: string[];
  }) {
    const rows: Row[] = [];
    const asked: string[] = [];
    let ids = 0;
    const repo = {
      async listBoardDays() {
        return options.days ?? [];
      },
      async listLaunchesOnDay(start: string) {
        return options.onDay?.[start.slice(0, 10)] ?? [];
      },
      async writeBoardRanks() {
        return 0;
      },
      async readBoardRanks(day: string) {
        return options.existing?.[day] ?? [];
      },
      async listMaintainerSubjects(profileId: string) {
        asked.push(profileId);
        return options.maintainers ?? ["usr_maintainer"];
      },
      async writeNotification(input: Row & { id: string }) {
        rows.push({
          subjectId: input.subjectId,
          kind: input.kind,
          eventKey: input.eventKey,
          actor: input.actor,
          targetKind: input.targetKind,
          targetRef: input.targetRef,
          figure: input.figure,
        });
        return true;
      },
    } as unknown as OpenproductRepository;
    return {
      deps: {
        repo,
        now: () => NOW,
        generateId: () => `00000000-0000-4000-8000-${String(ids++).padStart(12, "0")}` as never,
      } as BoardHandlerDeps,
      rows,
      asked,
    };
  }

  const WINNER = launch({
    slug: "winner",
    launchedAt: "2026-08-25T09:00:00.000Z",
    endorsements: endorsers(9, 90 * DAY, "2026-08-25T09:00:00.000Z"),
  });
  const RUNNER_UP = launch({
    slug: "runner-up",
    launchedAt: "2026-08-25T10:00:00.000Z",
    endorsements: endorsers(4, 90 * DAY, "2026-08-25T10:00:00.000Z"),
  });

  it("tells the winner's maintainers, and nobody else's", async () => {
    const h = inboxHarness({
      days: [{ day: YESTERDAY, launches: 2 }],
      onDay: { [YESTERDAY]: [RUNNER_UP, WINNER] },
      maintainers: ["usr_ada", "usr_grace"],
    });
    await route(req(SWEEP), env(), h.deps as never);

    expect(h.asked).toEqual(["p-winner"]);
    expect(h.rows.map((r) => r.subjectId).sort()).toEqual(["usr_ada", "usr_grace"]);
    expect(new Set(h.rows.map((r) => r.targetRef))).toEqual(new Set(["winner"]));
  });

  it("says nothing about an OPEN day, whose #1 can still change", async () => {
    // Today's board moves as votes arrive. Notifying on every sweep would
    // tell three different people they had won and be wrong about two.
    const h = inboxHarness({
      days: [{ day: TODAY, launches: 1 }],
      onDay: { [TODAY]: [launch({ slug: "a", endorsements: endorsers(5, 90 * DAY) })] },
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.rows).toEqual([]);
  });

  it("keys the row on the DAY, so re-ranking a stranded day says nothing twice", async () => {
    const h = inboxHarness({
      days: [{ day: YESTERDAY, launches: 1 }],
      onDay: { [YESTERDAY]: [WINNER] },
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]!.eventKey).toBe(`rank.first:${YESTERDAY}`);
    expect(h.rows[0]!.eventKey).not.toMatch(/T\d\d:\d\d/);
  });

  it("carries the counted number the board itself publishes", async () => {
    // The row's figure comes from `rankBoard` over `countForBoard`, which is
    // the same comparison the page renders. A second count here is how the
    // number in somebody's inbox and the number on the page come to disagree.
    const h = inboxHarness({
      days: [{ day: YESTERDAY, launches: 2 }],
      onDay: { [YESTERDAY]: [RUNNER_UP, WINNER] },
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.rows[0]!.figure).toBe(9);
  });

  it("names no actor — a rank is something the sweep observed", async () => {
    const h = inboxHarness({
      days: [{ day: YESTERDAY, launches: 1 }],
      onDay: { [YESTERDAY]: [WINNER] },
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.rows[0]!.actor).toBeNull();
    expect(h.rows[0]!.kind).toBe("rank.first");
    expect(h.rows[0]!.targetKind).toBe("listing");
  });

  it("says nothing when the day's #1 counted zero", async () => {
    // A day whose every launch was ineligible has no winner, and "you reached
    // #1 with 0 upvotes" is a sentence nobody should receive.
    const h = inboxHarness({
      days: [{ day: YESTERDAY, launches: 1 }],
      onDay: {
        [YESTERDAY]: [launch({ slug: "quiet", launchedAt: "2026-08-25T09:00:00.000Z" })],
      },
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.rows).toEqual([]);
  });

  it("does NOT fail the sweep when the inbox write throws", async () => {
    const h = inboxHarness({
      days: [{ day: YESTERDAY, launches: 1 }],
      onDay: { [YESTERDAY]: [WINNER] },
    });
    (h.deps.repo as unknown as { listMaintainerSubjects: () => Promise<never> })
      .listMaintainerSubjects = async () => {
      throw new Error("inbox is down");
    };
    const res = await route(req(SWEEP), env(), h.deps as never);
    expect(res.status).toBe(200);
  });
});
