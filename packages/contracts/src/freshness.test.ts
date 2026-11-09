// The directory's strip (openproduct-commons LC2).
//
// THE ONE SENTENCE THIS MODULE EXISTS TO PREVENT is `Published today · 0 new
// listings` — the site announcing its own emptiness in the largest type on
// the page. Most of what is pinned here is the ladder that avoids it, and the
// decision at the bottom of that ladder, which is the actual design.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_FRESHNESS_THRESHOLD,
  FRESHNESS_WINDOWS,
  chooseFreshness,
  freshnessLabel,
  freshnessNote,
  parseFreshnessThreshold,
} from "./freshness.js";

const counts = (over: Partial<Record<"today" | "week" | "month" | "total", number>> = {}) => ({
  today: 0,
  week: 0,
  month: 0,
  total: 0,
  ...over,
});

describe("the ladder picks the NARROWEST window worth naming", () => {
  it("says `today` when a day cleared the bar", () => {
    // A narrow window is a stronger claim — "twelve today" says more than
    // "twelve this month" — so taking the widest available would understate a
    // busy day.
    expect(chooseFreshness(counts({ today: 12, week: 30, month: 60, total: 400 }))).toEqual({
      kind: "recent",
      window: "today",
      count: 12,
    });
  });

  it("widens to the week when the day was thin", () => {
    expect(chooseFreshness(counts({ today: 2, week: 9, month: 20, total: 90 }))).toMatchObject({
      window: "week",
      count: 9,
    });
  });

  it("widens to the month when the week was thin", () => {
    expect(chooseFreshness(counts({ today: 0, week: 3, month: 11, total: 40 }))).toMatchObject({
      window: "month",
      count: 11,
    });
  });

  it("LC2's own done-when: two in a week reads as `this month`", () => {
    // Two items, so no window clears the bar. The ladder caps at a month and
    // says a small true thing rather than reaching for a wider window that
    // would make "recently" meaningless.
    expect(chooseFreshness(counts({ today: 0, week: 2, month: 2, total: 2 }))).toEqual({
      kind: "recent",
      window: "month",
      count: 2,
    });
  });

  it("...and twenty in a day reads as `today`", () => {
    expect(chooseFreshness(counts({ today: 20, week: 20, month: 20, total: 20 }))).toMatchObject({
      window: "today",
      count: 20,
    });
  });
});

describe("what it bottoms out at, which is the actual design decision", () => {
  it("NEVER says `0 new` — it says what the catalog is instead", () => {
    // The obvious ladder keeps widening — quarter, year, all time — and that
    // is wrong: past a point "recently" stops meaning anything and the strip
    // becomes a euphemism. `1,284 products listed` is always true, never
    // embarrassing, and is what a visitor actually wants to know about a
    // place they have just arrived at.
    const fallback = chooseFreshness(counts({ total: 47 }));
    expect(fallback).toEqual({ kind: "size", total: 47 });
    expect(freshnessLabel(fallback)).toBe("47 products listed");
  });

  it("does not pretend a young catalog is a quiet one", () => {
    const note = freshnessNote(chooseFreshness(counts({ total: 4 })), 5);
    expect(note).toMatch(/young directory rather than a quiet one/);
    // ...and points at the thing that DOES work at any volume.
    expect(note).toMatch(/weekly digest/);
  });

  it("survives a catalog of nothing at all without inventing a window", () => {
    expect(chooseFreshness(counts())).toEqual({ kind: "size", total: 0 });
    expect(freshnessLabel({ kind: "size", total: 0 })).toBe("0 products listed");
  });

  it("counts one thing in the singular", () => {
    expect(freshnessLabel({ kind: "size", total: 1 })).toBe("1 product listed");
    expect(freshnessLabel({ kind: "recent", window: "today", count: 1 })).toBe(
      "Published today · 1 new listing",
    );
  });
});

describe("the window is named on screen (LC-3)", () => {
  it("every window has a heading that says which one it is", () => {
    // A strip that widened silently would say "12 new" on a day with one,
    // which is the same lie the empty version tells in the other direction.
    for (const window of FRESHNESS_WINDOWS) {
      const label = freshnessLabel({ kind: "recent", window, count: 7 });
      expect(`${window}: ${label}`).toBe(
        `${window}: Published ${window === "today" ? "today" : `this ${window}`} · 7 new listings`,
      );
    }
  });

  it("explains itself only where the explanation adds something", () => {
    // A busy day needs no note; a strip that widened is making a choice, and
    // a reader who can see the choice can trust the number.
    expect(freshnessNote({ kind: "recent", window: "today", count: 12 }, 5)).toBeNull();
    const widened = freshnessNote({ kind: "recent", window: "month", count: 3 }, 5);
    expect(widened).toMatch(/Fewer than 5/);
    expect(widened).toMatch(/The window is always named/);
  });

  it("states the threshold IN FORCE, not a compiled-in one", () => {
    expect(freshnessNote({ kind: "recent", window: "week", count: 4 }, 9)).toMatch(/Fewer than 9/);
  });
});

describe("the threshold is configuration, and a bad value never opens the door", () => {
  it("reads a valid override", () => {
    expect(parseFreshnessThreshold("8")).toBe(8);
    expect(parseFreshnessThreshold("1")).toBe(1);
  });

  it("falls back rather than becoming zero", () => {
    // A ZERO THRESHOLD MAKES EVERY WINDOW QUALIFY, and `today · 0 new` is the
    // one sentence this module exists to prevent — so the malformed cases
    // must never land there.
    for (const bad of [undefined, "", "0", "-3", "nonsense", "NaN", "0.5"]) {
      expect(`${bad}: ${parseFreshnessThreshold(bad)}`).toBe(`${bad}: ${DEFAULT_FRESHNESS_THRESHOLD}`);
    }
  });

  it("a threshold of 1 still cannot produce a zero-count strip", () => {
    // The lowest configurable threshold, against an empty day: the ladder
    // must still fall through rather than naming a window with nothing in it.
    expect(chooseFreshness(counts({ total: 9 }), 1)).toEqual({ kind: "size", total: 9 });
  });
});
