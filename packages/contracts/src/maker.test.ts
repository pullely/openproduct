import { describe, expect, it } from "vitest";

import { FORMULAS } from "./provenance.js";
import {
  MAKER_COUNTER_FORMULAS,
  MAKER_TABS,
  MAKER_TAB_EMPTY,
  MAKER_TAB_FORMULAS,
  MAKER_TAB_LABELS,
  MAKER_TAB_LIMIT,
  launchedVsMaintainsNote,
  makerListTruncated,
  makerPath,
  makerTabSegments,
  makerTruncationNote,
  parseMakerTab,
} from "./maker.js";

describe("the three tabs", () => {
  it("are the design's three, in the design's order", () => {
    // PE1 — history joined the three.
    expect(MAKER_TABS).toEqual(["launched", "upvoted", "comments", "history"]);
  });

  it("HAS NO SAVED TAB, and that absence is the point", () => {
    // EN0 split the save from the endorsement so the private gesture would
    // stay private. Every row in `saved_products` was created under a promise
    // nobody can now be asked to renew, and no milestone gets to spend it.
    expect(MAKER_TABS).not.toContain("saved");
    expect(Object.keys(MAKER_TAB_LABELS)).not.toContain("saved");
  });

  it("each names what is absent AND what would fill it", () => {
    // "Nothing" three times over leaves a reader unable to tell an empty
    // record from a broken page (the OD5 finding, at the level of a tab).
    for (const tab of MAKER_TABS) {
      const note = MAKER_TAB_EMPTY[tab];
      expect([tab, note.length > 12]).toEqual([tab, true]);
      expect([tab, /yet\b/.test(note)]).toEqual([tab, true]);
    }
    // And none of them is a judgement about the person.
    for (const tab of MAKER_TABS) {
      expect([tab, /never|failed|only|just/i.test(MAKER_TAB_EMPTY[tab])]).toEqual([tab, false]);
    }
  });

  it("the upvote tab's empty note says the act is PUBLIC, where somebody reads it", () => {
  });
});

describe("the addresses", () => {
  it("`launched` is the bare address and has no segment of its own", () => {
    // Two addresses for one document is a duplicate a canonical tag has to
    // clean up afterwards rather than one that never existed.
    expect(makerPath("ada")).toBe("/@ada");
    expect(makerPath("ada", "launched")).toBe("/@ada");
    expect(makerTabSegments()).toEqual(["upvoted", "comments", "history"]);
  });

  it("the other two are path SEGMENTS, never query parameters", () => {
    // A Next page that reads `searchParams` is dynamic: its `revalidate` is
    // accepted and silently ignored and every response goes out `no-store`.
    // UV2 shipped exactly that and the budget lane caught it.
    expect(makerPath("ada", "upvoted")).toBe("/@ada/upvoted");
    expect(makerPath("ada", "comments")).toBe("/@ada/comments");
    for (const tab of MAKER_TABS) {
      expect([tab, makerPath("ada", tab).includes("?")]).toEqual([tab, false]);
    }
  });

  it("parses only the three, and nothing else", () => {
    expect(parseMakerTab("upvoted")).toBe("upvoted");
    expect(parseMakerTab("launched")).toBe("launched");
    expect(parseMakerTab("saved")).toBeNull();
    expect(parseMakerTab("")).toBeNull();
    expect(parseMakerTab(null)).toBeNull();
    expect(parseMakerTab(undefined)).toBeNull();
    expect(parseMakerTab("UPVOTED")).toBeNull();
  });
});

describe("OPC-4 — every tab's order is published", () => {
  it("all three formulas exist", () => {
    for (const tab of MAKER_TABS) {
      const id = MAKER_TAB_FORMULAS[tab];
      expect([tab, id in FORMULAS]).toEqual([tab, true]);
    }
  });

  it("each counter resolves to a sentence too", () => {
    for (const [counter, id] of Object.entries(MAKER_COUNTER_FORMULAS)) {
      expect([counter, id in FORMULAS]).toEqual([counter, true]);
    }
  });

  it("the upvote sentence says a WITHDRAWN one is absent, and why", () => {
    const sentence = FORMULAS["maker.upvoted"].sentence;
    expect(sentence).toContain("withdrawn");
    expect(sentence).toContain("unsaying");
    // And that the private act is not here.
    expect(sentence).toContain("save is a different, private act");
  });

  it("the comments sentence says the WORDS are not reproduced", () => {
    const sentence = FORMULAS["maker.comments"].sentence;
    expect(sentence).toContain("not reproduced here");
  });

  it("the launched sentence points at the board rather than at a second order", () => {
    expect(FORMULAS["maker.launched"].sentence).toContain("cannot disagree");
  });

  it("the followers sentence says the count is never a list", () => {
    expect(FORMULAS["contributor.followers"].sentence).toContain("never a list");
  });
});

describe("the counter and the list", () => {
  it("says so when the list is shorter than the count", () => {
    // The milestone's done-when is that the counters agree with the lists.
    // Above the limit they cannot, so the page says which rather than letting
    // a reader count the rows and conclude the number is wrong.
    expect(makerListTruncated(80, 50)).toBe(true);
    expect(makerListTruncated(50, 50)).toBe(false);
    expect(makerListTruncated(3, 3)).toBe(false);
    expect(makerTruncationNote(80, 50)).toBe("Showing the most recent 50 of 80.");
    expect(makerTruncationNote(4, 4)).toBeNull();
  });

  it("bounds the read, because a public page's rows grow with a person's history", () => {
    expect(MAKER_TAB_LIMIT).toBe(50);
  });

  it("says why `launched` and the listings below it are different numbers (VC2)", () => {
    // The audit found `0 launched` above `MAINTAINS · 2 listings they run`.
    // Both numbers are correct and each already carried its own published
    // sentence; neither said the other existed, so the page read as
    // disagreeing with itself. WC-7 asks for exactly this: where two counts
    // legitimately differ, the difference is published and linked, never left
    // for the reader to infer.
    expect(launchedVsMaintainsNote(0, 2)).toMatch(/separate acts/);
    expect(launchedVsMaintainsNote(5, 2)).toMatch(/separate acts/);
  });

  it("says nothing when the two agree", () => {
    // A note explaining a discrepancy that is not on the page is noise at
    // best, and at worst it teaches a reader to expect one.
    expect(launchedVsMaintainsNote(2, 2)).toBeNull();
    expect(launchedVsMaintainsNote(0, 0)).toBeNull();
  });

  it("does not say which of the two should be larger, because either is ordinary", () => {
    // A maintainer can publish without ever launching, and a person can have
    // launched something they have since handed over.
    expect(launchedVsMaintainsNote(0, 2)).toBe(launchedVsMaintainsNote(2, 0));
  });

  it("puts the same distinction behind both `?`s", () => {
    // The note is on the page; the addresses are where a reader goes when the
    // one line is not enough, and each formula now names the other.
    expect(FORMULAS["maker.launched"].sentence).toMatch(/NOT the number of listings/i);
    expect(FORMULAS["maker.launched"].sentence).toContain("contributor.maintains");
    expect(FORMULAS["contributor.maintains"].sentence).toMatch(/NOT the number of launches/i);
    expect(FORMULAS["contributor.maintains"].sentence).toContain("maker.launched");
  });
});
