// Rank marks (openproduct-worldclass-v2 PP4).
//
// A mark renders only from a board row. What is pinned: no placement, no
// mark; `#1 today` by the feed's own rule; the dated podium mark after the
// day and never below the podium; `Top of the week` from the leaderboard's
// standing; the card gets the one form that does not rot; every mark links
// the board it came from and names its formula.
import { describe, expect, it } from "vitest";

import { dayOf } from "./board.js";
import type { PublicLaunchPlacement } from "./index.js";
import { RANK_MARK_PODIUM, cardMark, rankMarks, shortDayLabel } from "./marks.js";

const NOW = Date.parse("2026-09-10T12:00:00Z");
const TODAY = dayOf(NOW);

function placement(over: Partial<PublicLaunchPlacement> = {}): PublicLaunchPlacement {
  return {
    day: "2026-09-10",
    rank: 1,
    of: 4,
    counted: 12,
    ineligible: 1,
    versionLabel: null,
    week: null,
    ...over,
  };
}

describe("no board, no mark", () => {
  it("emits nothing for an absent placement", () => {
    expect(rankMarks(undefined, TODAY)).toEqual([]);
    expect(rankMarks(null, TODAY)).toEqual([]);
    expect(cardMark(undefined)).toBeNull();
  });
});

describe("#1 today", () => {
  it("renders for rank 1 on today's board, links the day, and names the board's formula", () => {
    const [mark, ...rest] = rankMarks(placement(), TODAY);
    expect(rest).toEqual([]);
    expect(mark).toMatchObject({ kind: "today", label: "#1 today", href: "/launches/2026-09-10", formula: "launch.board-rank" });
    expect(mark!.title).toMatch(/12 upvotes counted on 2026-09-10, and 1 from accounts younger/);
  });

  it("is not a mark for second place today — the ordinal is on the facts card", () => {
    expect(rankMarks(placement({ rank: 2 }), TODAY)).toEqual([]);
  });
});

describe("the dated podium mark", () => {
  it("replaces `today` once the day has passed, for the podium only", () => {
    const yesterday = placement({ day: "2026-09-09", rank: 1 });
    expect(rankMarks(yesterday, TODAY).map((m) => m.label)).toEqual(["#1 on 9 Sept"]);
    expect(rankMarks(placement({ day: "2026-09-09", rank: 3 }), TODAY).map((m) => m.label)).toEqual(["#3 on 9 Sept"]);
    expect(rankMarks(placement({ day: "2026-09-09", rank: RANK_MARK_PODIUM + 1 }), TODAY)).toEqual([]);
  });

  it("carries the day it was earned on, in the pill and in the link", () => {
    const [mark] = rankMarks(placement({ day: "2026-08-17", rank: 2, of: 9 }), TODAY);
    expect(mark).toMatchObject({ kind: "day", href: "/launches/2026-08-17", formula: "launch.board-rank" });
    expect(mark!.title).toMatch(/^Second of 9 that day/);
    expect(shortDayLabel("2026-08-17")).toBe("17 Aug");
    expect(shortDayLabel("not-a-day")).toBe("not-a-day");
  });
});

describe("Top of the week", () => {
  const week = { rank: 1, of: 6, from: "2026-09-04", to: "2026-09-10" };

  it("comes from the weekly standing, beside the day's mark, and links the leaderboard", () => {
    const marks = rankMarks(placement({ week }), TODAY);
    expect(marks.map((m) => m.kind)).toEqual(["today", "week"]);
    expect(marks[1]).toMatchObject({ label: "Top of the week", href: "/leaderboard", formula: "launch.leaderboard" });
    expect(marks[1]!.title).toMatch(/First of 6 on the leaderboard for 2026-09-04 to 2026-09-10/);
  });

  it("is only first place — second on the week is no mark", () => {
    expect(rankMarks(placement({ week: { ...week, rank: 2 } }), TODAY).map((m) => m.kind)).toEqual(["today"]);
  });

  it("can stand alone when the day's rank was off the podium", () => {
    expect(rankMarks(placement({ day: "2026-09-08", rank: 5, week }), TODAY).map((m) => m.kind)).toEqual(["week"]);
  });
});

describe("what the card carries", () => {
  it("is the dated podium form, whatever day it is, and nothing that rots", () => {
    expect(cardMark(placement())).toBe("#1 on 10 Sept");
    expect(cardMark(placement({ day: "2026-08-17", rank: 3 }))).toBe("#3 on 17 Aug");
    expect(cardMark(placement({ rank: 4, week: { rank: 1, of: 3, from: "a", to: "b" } }))).toBeNull();
  });
});
