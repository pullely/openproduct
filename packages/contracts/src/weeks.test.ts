// The week, as an address (openproduct-commons LC1).
//
// THIS FILE IS ALMOST ENTIRELY ABOUT BOUNDARIES, because a week is the most
// quietly ambiguous unit of time in common use and every bug it has is a
// silent one: nothing throws, a date simply lands in the wrong document, and
// the only way anybody finds out is by reading an archive page and noticing
// it names days it does not contain.
//
// The cases below are the ones a naive implementation gets wrong — years that
// start mid-week, the 53-week years, and the fact that an ISO week's YEAR is
// not always its dates' year.

import { describe, expect, it } from "vitest";

import {
  formatWeekId,
  nextWeek,
  parseWeekId,
  previousWeek,
  weekDates,
  weekOf,
  weekWindow,
  weeksInYear,
} from "./weeks.js";

const at = (iso: string) => Date.parse(`${iso}T12:00:00.000Z`);

describe("ISO weeks, including the ones that look like bugs", () => {
  it("puts late December into the FOLLOWING year's week 1", () => {
    // 30 December 2025 is in 2026-w01. This is the standard behaving
    // correctly and it is the single most reported "bug" in any week-numbered
    // system, which is why the page prints the dates beside the number.
    expect(weekOf(at("2025-12-30")).id).toBe("2026-w01");
    expect(weekOf(at("2024-12-30")).id).toBe("2025-w01");
  });

  it("puts early January into the PREVIOUS year's last week", () => {
    expect(weekOf(at("2027-01-01")).id).toBe("2026-w53");
    expect(weekOf(at("2021-01-01")).id).toBe("2020-w53");
  });

  it("agrees with the calendar on ordinary weeks", () => {
    expect(weekOf(at("2026-08-20")).id).toBe("2026-w34");
    expect(weekOf(at("2026-01-01")).id).toBe("2026-w01");
  });

  it("knows which years have 53 weeks", () => {
    // A year has 53 ISO weeks when it starts on a Thursday, or is a leap year
    // starting on a Wednesday. Computed rather than tabled, and these are the
    // years it must get right.
    expect(weeksInYear(2020)).toBe(53);
    expect(weeksInYear(2026)).toBe(53);
    expect(weeksInYear(2025)).toBe(52);
    expect(weeksInYear(2027)).toBe(52);
  });
});

describe("a week's window is exactly seven days, and half-open", () => {
  it("starts on Monday and ends on the next Monday", () => {
    const { start, end } = weekWindow(weekOf(at("2026-08-20")));
    expect(start).toBe("2026-08-17T00:00:00.000Z");
    expect(end).toBe("2026-08-24T00:00:00.000Z");
    expect(new Date(Date.parse(start)).getUTCDay()).toBe(1);
  });

  it("never overlaps the next week, so no launch lands in two digests", () => {
    // A CLOSED range double-counts the instant two weeks meet, and the one
    // launch scheduled for exactly midnight Monday would appear in both — two
    // archive documents disagreeing about the same fact.
    const a = weekWindow(weekOf(at("2026-08-20")));
    const b = weekWindow(weekOf(at("2026-08-27")));
    expect(a.end).toBe(b.start);
  });

  it("round-trips: every instant in a window belongs to that week", () => {
    // The property that matters, checked across a year rather than argued.
    for (let day = 0; day < 400; day += 1) {
      const instant = Date.UTC(2025, 11, 1) + day * 86_400_000 + 3_600_000;
      const week = weekOf(instant);
      const { start, end } = weekWindow(week);
      expect(`${week.id}: ${Date.parse(start) <= instant && instant < Date.parse(end)}`).toBe(
        `${week.id}: true`,
      );
    }
  });

  it("crosses year boundaries in both directions", () => {
    expect(previousWeek({ year: 2026, week: 1, id: "2026-w01" }).id).toBe("2025-w52");
    expect(previousWeek({ year: 2021, week: 1, id: "2021-w01" }).id).toBe("2020-w53");
  });
});

describe("one spelling per week", () => {
  it("formats with a lowercase w and two digits, always", () => {
    expect(formatWeekId(2026, 4)).toBe("2026-w04");
    expect(formatWeekId(2026, 34)).toBe("2026-w34");
  });

  it("accepts what a person types, and says whether it was canonical", () => {
    // An archive with three addresses for one document splits its own links
    // and teaches a crawler that the canonical one is arbitrary. So the loose
    // spellings parse, and the caller is told to redirect.
    expect(parseWeekId("2026-w04")).toMatchObject({ ok: true, canonical: true });
    for (const loose of ["2026-w4", "2026-W04", "2026-W4", " 2026-w04 "]) {
      const parsed = parseWeekId(loose);
      expect([loose, parsed.ok, parsed.ok && parsed.canonical]).toEqual([loose, true, false]);
      expect(parsed.ok && parsed.week.id).toBe("2026-w04");
    }
  });

  it("refuses a week that does not exist, rather than inventing a window", () => {
    // `2026-w54` is not a typo of anything, and computing a window for it
    // would produce a digest of days in the following year under a heading
    // naming this one. 2025 has 52 weeks, so `2025-w53` is equally not a week.
    expect(parseWeekId("2026-w54").ok).toBe(false);
    expect(parseWeekId("2025-w53").ok).toBe(false);
    // ...and 2026 does have 53, so this one is real.
    expect(parseWeekId("2026-w53").ok).toBe(true);
  });

  it("refuses everything that is not a week id", () => {
    for (const bad of ["", "2026", "2026-w", "2026-w00", "w34", "2026/34", "26-w4",
                       "2026-w04x", "abcd-w04", "1999-w01", "3000-w01"]) {
      expect([bad, parseWeekId(bad).ok]).toEqual([bad, false]);
    }
  });
});

describe("the archive only ever looks backwards", () => {
  it("has no next week while that week is still to come", () => {
    // A digest for a week that has not started is a page about the future, and
    // the archive's whole value is that it only says what happened.
    const now = at("2026-08-20");
    expect(nextWeek(weekOf(now), now)).toBeNull();
    expect(nextWeek(weekOf(at("2026-08-10")), now)?.id).toBe("2026-w34");
  });
});

describe("the dates are said out loud", () => {
  it("names the days a week covers, within one month and across two", () => {
    expect(weekDates(weekOf(at("2026-08-20")))).toBe("17–23 August 2026");
    // The boundary case a reader is most likely to think is a bug.
    expect(weekDates({ year: 2026, week: 1, id: "2026-w01" })).toBe(
      "29 December – 4 January 2026",
    );
  });
});
