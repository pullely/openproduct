import { describe, expect, it } from "vitest";

import {
  BOARD_EMPTY_NOTE,
  BOARD_EMPTY_WHY,
  BOARD_ENTRY_KEYS,
  BOARD_FORMULA,
  BOARD_MEANING,
  BOARD_OPEN_NOTE,
  BOARD_SETTLED_NOTE,
  countForBoard,
  dayIsOpen,
  dayLabel,
  dayOf,
  dayWindow,
  formatDayId,
  nextDay,
  parseDayId,
  previousDay,
  rankBoard,
  type BoardEntry,
} from "./board.js";
import { BOARD_ELIGIBILITY_AGE_MS } from "./defence.js";
import { FORMULAS } from "./provenance.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function entry(over: Partial<BoardEntry> & { slug: string }): BoardEntry {
  return {
    launchId: `l-${over.slug}`,
    tagline: null,
    versionLabel: "1.0",
    launchedAt: "2026-08-26T09:00:00.000Z",
    counted: 0,
    ineligible: 0,
    thumbnail: null,
    ...over,
  };
}

describe("the day is an address, and a settled one is final", () => {
  it("derives a day id from a moment, in UTC", () => {
    expect(dayOf(Date.parse("2026-08-26T23:59:59.999Z")).id).toBe("2026-08-26");
    // The boundary is midnight UTC and not the reader's midnight: a board whose
    // day moved with the reader would show two people different boards at one
    // URL (OPC-1), and "first today" would be unanswerable.
    expect(dayOf(Date.parse("2026-08-27T00:00:00.000Z")).id).toBe("2026-08-27");
  });

  it("covers a half-open window, so no endorsement lands on two boards", () => {
    const { start, end } = dayWindow(dayOf(Date.parse("2026-08-26T12:00:00Z")));
    expect(start).toBe("2026-08-26T00:00:00.000Z");
    expect(end).toBe("2026-08-27T00:00:00.000Z");
  });

  it("refuses the spellings that are NEARLY right rather than coercing them", () => {
    // A board day is an address. Two spellings resolving to one board are two
    // URLs for one document — a duplicate a crawler indexes happily.
    expect(parseDayId("2026-8-26").ok).toBe(false);
    expect(parseDayId("2026-08-26T00:00:00Z").ok).toBe(false);
    expect(parseDayId("2026-08-26 ").ok).toBe(false);
    expect(parseDayId("").ok).toBe(false);
  });

  it("refuses a date that does not exist, rather than rolling it forward", () => {
    // 31 February silently becoming 3 March is an address that lies.
    expect(parseDayId("2026-02-31")).toEqual({ ok: false, reason: "impossible" });
    expect(parseDayId("2026-13-01")).toEqual({ ok: false, reason: "impossible" });
    expect(parseDayId("2026-00-10")).toEqual({ ok: false, reason: "impossible" });
    // And a leap day that DOES exist is accepted.
    expect(parseDayId("2028-02-29").ok).toBe(true);
  });

  it("round-trips every id it parses", () => {
    for (const id of ["2026-08-26", "2026-01-01", "2026-12-31", "2028-02-29"]) {
      const parsed = parseDayId(id);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(formatDayId(parsed.day.year, parsed.day.month, parsed.day.day)).toBe(id);
    }
  });

  it("walks backwards across a month and a year boundary", () => {
    expect(previousDay(dayOf(Date.parse("2026-09-01T12:00:00Z"))).id).toBe("2026-08-31");
    expect(previousDay(dayOf(Date.parse("2026-01-01T12:00:00Z"))).id).toBe("2025-12-31");
  });

  it("never links forward into a day that has not happened", () => {
    const now = Date.parse("2026-08-26T12:00:00Z");
    const today = dayOf(now);
    // A board cannot link into a day nobody has launched in.
    expect(nextDay(today, now)).toBeNull();
    expect(nextDay(previousDay(today), now)?.id).toBe("2026-08-26");
  });

  it("knows whether its order can still move", () => {
    const day = dayOf(Date.parse("2026-08-26T00:00:00Z"));
    expect(dayIsOpen(day, Date.parse("2026-08-26T23:59:59Z"))).toBe(true);
    expect(dayIsOpen(day, Date.parse("2026-08-27T00:00:00Z"))).toBe(false);
  });

  it("labels a day in UTC, not the server's zone", () => {
    expect(dayLabel(dayOf(Date.parse("2026-08-26T00:00:00Z")))).toBe("26 August 2026");
  });
});

describe("the rank", () => {
  it("orders by counted endorsements, highest first", () => {
    const ranked = rankBoard([
      entry({ slug: "b", counted: 3 }),
      entry({ slug: "a", counted: 9 }),
      entry({ slug: "c", counted: 5 }),
    ]);
    expect(ranked.map((e) => e.slug)).toEqual(["a", "c", "b"]);
  });

  it("breaks a tie by the EARLIER launch (LC-2)", () => {
    const ranked = rankBoard([
      entry({ slug: "late", counted: 4, launchedAt: "2026-08-26T15:00:00.000Z" }),
      entry({ slug: "early", counted: 4, launchedAt: "2026-08-26T06:00:00.000Z" }),
    ]);
    expect(ranked.map((e) => e.slug)).toEqual(["early", "late"]);
  });

  it("breaks a same-instant tie deterministically", () => {
    // Without this last tiebreak two launches at one instant with one count
    // would order by whatever the database returned, and a board that
    // shuffles between two reads of a SETTLED day is not an archive.
    const rows = [
      entry({ slug: "zeta", counted: 2, launchedAt: "2026-08-26T09:00:00.000Z" }),
      entry({ slug: "alpha", counted: 2, launchedAt: "2026-08-26T09:00:00.000Z" }),
    ];
    expect(rankBoard(rows).map((e) => e.slug)).toEqual(["alpha", "zeta"]);
    expect(rankBoard([...rows].reverse()).map((e) => e.slug)).toEqual(["alpha", "zeta"]);
  });

  it("does not mutate what it was given", () => {
    const rows = [entry({ slug: "b", counted: 1 }), entry({ slug: "a", counted: 2 })];
    rankBoard(rows);
    expect(rows.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("ranks an empty day without inventing one", () => {
    expect(rankBoard([])).toEqual([]);
  });
});

describe("the board counts only what TS4 says it may", () => {
  const launchedAt = Date.parse("2026-08-26T09:00:00.000Z");
  const older = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      subjectId: `old-${i}`,
      subjectFirstSeenAt: launchedAt - 90 * DAY_MS,
    }));
  const younger = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      subjectId: `new-${i}`,
      subjectFirstSeenAt: launchedAt - 60_000,
    }));

  it("counts accounts that existed before the launch and reports the rest", () => {
    const result = countForBoard(launchedAt, [...older(7), ...younger(12)]);
    expect(result).toEqual({ counted: 7, ineligible: 12 });
  });

  it("delegates to TS4 rather than reimplementing the rule", () => {
    // A second copy of "existed before the launch" here is how the published
    // sentence and the actual order come to disagree. This pins the boundary
    // to the constant TS4 owns.
    const exactly = [
      { subjectId: "edge", subjectFirstSeenAt: launchedAt - BOARD_ELIGIBILITY_AGE_MS },
      { subjectId: "just-after", subjectFirstSeenAt: launchedAt - BOARD_ELIGIBILITY_AGE_MS + 1 },
    ];
    expect(countForBoard(launchedAt, exactly)).toEqual({ counted: 1, ineligible: 1 });
  });

  it("a launch nobody endorsed ranks with nothing, not with an error", () => {
    expect(countForBoard(launchedAt, [])).toEqual({ counted: 0, ineligible: 0 });
  });

  it("a launch endorsed ONLY by accounts made for it takes no position", () => {
    // The attack, and the answer. Nothing is flagged, nothing is discounted,
    // and the endorsements still count on the listing's own page — they just
    // do not move a rank, because a rank is the scarce thing.
    const bought = countForBoard(launchedAt, younger(200));
    expect(bought.counted).toBe(0);
    const honest = countForBoard(launchedAt, older(3));
    expect(rankBoard([
      entry({ slug: "bought", counted: bought.counted, ineligible: bought.ineligible }),
      entry({ slug: "honest", counted: honest.counted }),
    ])[0]!.slug).toBe("honest");
  });
});

describe("the published account (OPC-4 / I7)", () => {
  it("the board's formula id resolves to a published sentence", () => {
    expect(FORMULAS[BOARD_FORMULA]).toBeDefined();
    expect(FORMULAS[BOARD_FORMULA]!.computedBy).toBe("LC3");
  });

  it("the sentence states the eligibility rule, since the order depends on it", () => {
    const sentence = FORMULAS[BOARD_FORMULA]!.sentence;
    // A ranking that quietly discounted some people's endorsements would be
    // exactly the unexplainable order OPC-4 forbids. A reader must be able to
    // reproduce this order from the sentence alone.
    expect(sentence).toMatch(/already existed/i);
    expect(sentence).toMatch(/still counts on the listing's own public total/i);
    expect(sentence).toMatch(/tie|ties/i);
    // And that a closed day cannot move, which is what makes the archive an
    // archive rather than a query.
    expect(sentence).toMatch(/final/i);
  });

  it("is stated as NOT the directory's order", () => {
    // The board and the directory rank the same objects by different rules,
    // and a reader who assumed one was the other would draw a wrong
    // conclusion about both.
    expect(FORMULAS[BOARD_FORMULA]!.sentence).toMatch(/not the directory's order/i);
    expect(BOARD_MEANING).toMatch(/accounts that already existed/i);
  });

  it("the page's own note says the thing a reader asks first", () => {
    // "Who decided this." The directory's orders answer that at
    // /docs/formulas; a board must answer in place, because a position is a
    // claim being made about somebody right there.
    expect(BOARD_MEANING).toMatch(/ordered by the endorsements/i);
    expect(BOARD_MEANING).toMatch(/nobody to accuse/i);
  });

  it("an empty day reads as a quiet day, not a broken page", () => {
    expect(BOARD_EMPTY_NOTE).toMatch(/nothing launched/i);
    expect(BOARD_EMPTY_NOTE).not.toMatch(/error|unavailable|failed/i);
    // CF5 moved the reasoning behind VC0's disclosure without losing it.
    expect(BOARD_EMPTY_WHY).toMatch(/separate act from publishing/i);
  });

  it("says whether the day can still move", () => {
    expect(BOARD_OPEN_NOTE).toMatch(/still change/i);
    expect(BOARD_SETTLED_NOTE).toMatch(/final/i);
    expect(BOARD_SETTLED_NOTE).toMatch(/always show it/i);
  });
});

describe("the wire shape (I2)", () => {
  it("an entry carries exactly the pinned keys", () => {
    expect(Object.keys(entry({ slug: "x" })).sort()).toEqual([...BOARD_ENTRY_KEYS].sort());
  });

  it("carries no subject id anywhere", () => {
    // A board names listings. Naming the people whose endorsements moved a
    // position would publish an endorsement graph nobody consented to.
    const serialised = JSON.stringify(entry({ slug: "x", counted: 4, ineligible: 2 }));
    expect(serialised).not.toContain("usr_");
    expect(serialised).not.toMatch(/subjectId/);
  });

  it("ranks the same with or without a logo — the picture is never an ordering input (OSD3)", () => {
    const logo = { ref: `sha256:${"a".repeat(64)}.png`, alt: "Mark", width: 256, height: 256 };
    const plain = [entry({ slug: "b", counted: 3 }), entry({ slug: "a", counted: 3 }), entry({ slug: "c", counted: 5 })];
    const pictured = plain.map((e) => (e.slug === "a" ? { ...e, thumbnail: logo } : e));
    expect(rankBoard(pictured).map((e) => e.slug)).toEqual(rankBoard(plain).map((e) => e.slug));
    expect(BOARD_ENTRY_KEYS).toContain("thumbnail");
  });

  it("publishes the ineligible count rather than hiding it", () => {
    // A maker whose launch was shared somewhere popular sees a position that
    // does not match the total on their own page. The gap must be accountable.
    expect(BOARD_ENTRY_KEYS).toContain("ineligible");
  });
});
