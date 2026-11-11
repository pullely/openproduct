import { describe, expect, it } from "vitest";

import { dayOf, monthStrip } from "./board.js";
import { FORMULAS } from "./provenance.js";
import {
  LEADERBOARD_ENTRY_KEYS,
  LEADERBOARD_FORMULA,
  LEADERBOARD_MAKER_LIMIT,
  LEADERBOARD_RANGES,
  LEADERBOARD_WEEK_DAYS,
  buildLeaderboard,
  leaderboardDays,
  leaderboardPath,
  leaderboardSegments,
  leaderboardSubtitle,
  parseRange,
  type LeaderboardCandidate,
} from "./leaderboard.js";

const TODAY = dayOf(Date.UTC(2026, 8, 5)); // 2026-09-05, a Saturday.

function candidate(over: Partial<LeaderboardCandidate> = {}): LeaderboardCandidate {
  return {
    launchId: over.slug ?? "l1",
    slug: "alpha",
    tagline: "A thing",
    day: TODAY.id,
    launchedAt: "2026-09-05T09:00:00.000Z",
    dayRank: 1,
    counted: 10,
    commentCount: 0,
    makers: [],
    ...over,
  };
}

describe("the range in the URL", () => {
  it("an absent range is the week — the design's default and the nav's destination", () => {
    expect(parseRange(null)).toBe("week");
    expect(parseRange(undefined)).toBe("week");
    expect(parseRange("")).toBe("week");
  });

  it("every range parses — the week, the month and (HB2) the year", () => {
    expect([...LEADERBOARD_RANGES]).toEqual(["week", "month", "year"]);
    for (const range of LEADERBOARD_RANGES) expect(parseRange(range)).toBe(range);
  });

  it("an unknown range is REFUSED rather than coerced to the week", () => {
    // A URL that answers with a document it did not name has two meanings, and
    // `?range=decade` quietly serving a week is how somebody comes to believe
    // we publish a ranking we do not.
    expect(parseRange("decade")).toBeNull();
    expect(parseRange("day")).toBeNull();
    expect(parseRange("all")).toBeNull();
    expect(parseRange("WEEK")).toBeNull();
  });

  it("the range is a PATH SEGMENT, and the week is the bare address", () => {
    // A query parameter makes the page dynamic in Next, so `revalidate` is
    // accepted and ignored and the document goes out `no-store` — which the
    // budget lane caught on this milestone's first run. These are cacheable
    // documents (OPC-1), so the range lives in the path.
    expect(leaderboardPath("week")).toBe("/leaderboard");
    expect(leaderboardPath("month")).toBe("/leaderboard/month");
    expect(leaderboardPath("year")).toBe("/leaderboard/year");
  });

  it("the week is not a segment, so one document does not get two URLs", () => {
    expect(leaderboardSegments()).toEqual(["month", "year"]);
  });
});

describe("the days a range covers", () => {
  it("the week is seven days ending today — the feed's window and the digest's", () => {
    const days = leaderboardDays("week", TODAY);
    expect(days).toHaveLength(LEADERBOARD_WEEK_DAYS);
    expect(days[0]!.id).toBe("2026-09-05");
    expect(days.at(-1)!.id).toBe("2026-08-30");
  });

  it("the month is the CALENDAR month so far, not thirty days back", () => {
    // "This month" on the 5th means five days. A reader told "September 2026"
    // and shown a table half of which is August would be right to call it
    // wrong.
    const days = leaderboardDays("month", TODAY);
    expect(days).toHaveLength(5);
    expect(days[0]!.id).toBe("2026-09-05");
    expect(days.at(-1)!.id).toBe("2026-09-01");
  });

  it("HB2 — the year is the CALENDAR year so far, newest first, and never crosses into last year", () => {
    const days = leaderboardDays("year", TODAY);
    expect(days[0]!.id).toBe("2026-09-05");
    expect(days.at(-1)!.id).toBe("2026-01-01");
    expect(days).toHaveLength(248);
    expect(days.every((d) => d.year === 2026)).toBe(true);
    expect(leaderboardDays("year", dayOf(Date.UTC(2026, 0, 3))).map((d) => d.id)).toEqual([
      "2026-01-03",
      "2026-01-02",
      "2026-01-01",
    ]);
  });

  it("HB2 — the day-of-month strip is every day of the month up to today, oldest first", () => {
    const strip = monthStrip(dayOf(Date.UTC(2026, 8, 3)), Date.UTC(2026, 8, 5, 12));
    expect(strip.map((d) => d.id)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    // A past month is whole; a future day is never linked.
    expect(monthStrip(dayOf(Date.UTC(2026, 1, 10)), Date.UTC(2026, 8, 5))).toHaveLength(28);
    expect(monthStrip(dayOf(Date.UTC(2026, 8, 5)), Date.UTC(2026, 8, 5)).at(-1)!.id).toBe("2026-09-05");
  });

  it("the month on the first day of a month is one day, not an empty range", () => {
    const days = leaderboardDays("month", dayOf(Date.UTC(2026, 8, 1)));
    expect(days.map((d) => d.id)).toEqual(["2026-09-01"]);
  });

  it("the week crosses a month boundary; the month never does", () => {
    const first = dayOf(Date.UTC(2026, 8, 2));
    expect(leaderboardDays("week", first).some((d) => d.id.startsWith("2026-08"))).toBe(true);
    expect(leaderboardDays("month", first).every((d) => d.id.startsWith("2026-09"))).toBe(true);
  });
});

describe("the order", () => {
  it("pools across days: a quiet day's winner sits below a busy day's runner-up", () => {
    // This is the leaderboard's whole point, and the thing a day's board cannot
    // answer. `dayRank` is carried so the page can show why.
    const board = buildLeaderboard("week", TODAY, [
      candidate({
        slug: "quiet-winner",
        day: "2026-09-01",
        launchedAt: "2026-09-01T09:00:00.000Z",
        dayRank: 1,
        counted: 4,
      }),
      candidate({
        slug: "busy-third",
        day: "2026-09-04",
        launchedAt: "2026-09-04T09:00:00.000Z",
        dayRank: 3,
        counted: 40,
      }),
    ]);
    expect(board.entries.map((e) => e.slug)).toEqual(["busy-third", "quiet-winner"]);
    expect(board.entries[0]!.rank).toBe(1);
    expect(board.entries[0]!.dayRank).toBe(3);
  });

  it("a launch the sweep has not counted is ABSENT, never listed at zero", () => {
    // OPC-C — a zero would claim nobody wanted it. What happened is that
    // nobody has counted yet.
    const board = buildLeaderboard("week", TODAY, [
      candidate({ slug: "counted", counted: 3 }),
      candidate({ slug: "uncounted", counted: null, dayRank: null }),
    ]);
    expect(board.entries.map((e) => e.slug)).toEqual(["counted"]);
  });

  it("ties break by the earlier launch, then by slug — rankBoard's own sequence", () => {
    const board = buildLeaderboard("week", TODAY, [
      candidate({ slug: "zulu", launchedAt: "2026-09-05T08:00:00.000Z", counted: 7 }),
      candidate({ slug: "alpha", launchedAt: "2026-09-05T09:00:00.000Z", counted: 7 }),
      candidate({ slug: "bravo", launchedAt: "2026-09-05T09:00:00.000Z", counted: 7 }),
    ]);
    expect(board.entries.map((e) => e.slug)).toEqual(["zulu", "alpha", "bravo"]);
  });

  it("is stable: the same candidates in any input order give the same table", () => {
    // A leaderboard that reordered between two requests is a leaderboard
    // nobody can screenshot.
    const cs = [
      candidate({ slug: "a", counted: 5, launchedAt: "2026-09-05T01:00:00.000Z" }),
      candidate({ slug: "b", counted: 5, launchedAt: "2026-09-05T02:00:00.000Z" }),
      candidate({ slug: "c", counted: 9, launchedAt: "2026-09-05T03:00:00.000Z" }),
    ];
    const forward = buildLeaderboard("week", TODAY, cs).entries.map((e) => e.slug);
    const backward = buildLeaderboard("week", TODAY, [...cs].reverse()).entries.map((e) => e.slug);
    expect(backward).toEqual(forward);
  });

  it("drops a launch outside the range rather than ranking it", () => {
    const board = buildLeaderboard("month", TODAY, [
      candidate({ slug: "in", day: "2026-09-02", counted: 1 }),
      candidate({ slug: "out", day: "2026-08-31", counted: 99 }),
    ]);
    expect(board.entries.map((e) => e.slug)).toEqual(["in"]);
  });

  it("numbers from one with no gaps", () => {
    const board = buildLeaderboard("week", TODAY, [
      candidate({ slug: "a", counted: 3 }),
      candidate({ slug: "b", counted: 2 }),
      candidate({ slug: "c", counted: 1 }),
    ]);
    expect(board.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });
});

describe("the makers", () => {
  it("caps the stack and counts the rest rather than growing the column", () => {
    const makers = Array.from({ length: 7 }, (_, i) => ({ handle: `h${i}`, name: `P${i}` }));
    const board = buildLeaderboard("week", TODAY, [candidate({ makers })]);
    expect(board.entries[0]!.makers).toHaveLength(LEADERBOARD_MAKER_LIMIT);
    expect(board.entries[0]!.moreMakers).toBe(7 - LEADERBOARD_MAKER_LIMIT);
  });

  it("a listing with nobody confirmed has no makers and no overflow count", () => {
    const board = buildLeaderboard("week", TODAY, [candidate({ makers: [] })]);
    expect(board.entries[0]!.makers).toEqual([]);
    expect(board.entries[0]!.moreMakers).toBe(0);
  });
});

describe("the document", () => {
  it("carries the day it treated as today, and the window's ends", () => {
    // A cached document says which UTC day it is talking about rather than
    // leaving a reader to infer it from a heading.
    const board = buildLeaderboard("week", TODAY, []);
    expect(board.today).toBe("2026-09-05");
    expect(board.to).toBe("2026-09-05");
    expect(board.from).toBe("2026-08-30");
  });

  it("serializes exactly its literal", () => {
    const board = buildLeaderboard("week", TODAY, [candidate()]);
    expect(Object.keys(board.entries[0]!).sort()).toEqual([...LEADERBOARD_ENTRY_KEYS].sort());
  });

  it("the subtitle names the window a reader is looking at", () => {
    expect(leaderboardSubtitle(buildLeaderboard("week", TODAY, []))).toBe(
      // `Sept`, not `Sep` — en-GB's own abbreviation, taken from the runtime
      // rather than hand-written, exactly as `dayLabel` takes "August".
      "Most upvoted launches, 30 Aug – 5 Sept",
    );
    expect(leaderboardSubtitle(buildLeaderboard("year", TODAY, []))).toBe("Most upvoted launches in 2026");
    expect(leaderboardSubtitle(buildLeaderboard("month", TODAY, []))).toBe(
      "Most upvoted launches in September 2026",
    );
  });
});

describe("OPC-4 — the order resolves to published prose", () => {
  it("the formula id is registered and has a sentence", () => {
    const formula = (FORMULAS as Record<string, { sentence: string; computedBy?: string }>)[
      LEADERBOARD_FORMULA
    ];
    expect(formula).toBeDefined();
    expect(formula!.sentence.length).toBeGreaterThan(24);
  });

  it("its sentence says the numbers are the board's, not counted again (OL-2a)", () => {
    // The one claim that makes this ordering legitimate beside the board's. If
    // it ever stops being true, this sentence has to change first.
    const sentence = (FORMULAS as Record<string, { sentence: string }>)[LEADERBOARD_FORMULA]!
      .sentence;
    expect(sentence).toContain("already published");
    expect(sentence).toContain("without counting");
  });

  it("its sentence states the honest absence", () => {
    const sentence = (FORMULAS as Record<string, { sentence: string }>)[LEADERBOARD_FORMULA]!
      .sentence;
    expect(sentence).toContain("absent rather than listed at zero");
  });
});
