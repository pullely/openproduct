// A person's marks: derived, each with its input and its formula (PE2).
import { describe, expect, it } from "vitest";

import { MAKER_MARK_FORMULAS, MAKER_MARK_INPUT_KEYS, makerCardMark, makerMarks } from "./maker-marks.js";
import { FORMULAS } from "./provenance.js";

describe("makerMarks", () => {
  it("renders nothing without inputs", () => {
    expect(makerMarks({ firstLaunchDay: null, cleanVoteListings: 0, maintains: 0 })).toEqual([]);
    expect(makerCardMark({ firstLaunchDay: null, cleanVoteListings: 0, maintains: 0 })).toBeNull();
  });

  it("derives each mark from its input, and says the input in words", () => {
    const marks = makerMarks({ firstLaunchDay: "2026-08-17", cleanVoteListings: 2, maintains: 3 });
    expect(marks.map((m) => m.kind)).toEqual(["first-launch", "clean-vote", "maintains"]);
    expect(marks[0]!.label).toBe("First launch");
    expect(marks[0]!.input).toMatch(/first went live on/);
    expect(marks[1]!.input).toMatch(/^2 listings/);
    expect(marks[2]!.label).toBe("Maintains 3");
    expect(marks[2]!.input).toMatch(/3 public listings/);
  });

  it("refuses a malformed day rather than printing it", () => {
    expect(makerMarks({ firstLaunchDay: "yesterday", cleanVoteListings: 0, maintains: 0 })).toEqual([]);
  });

  it("links every mark to a published formula", () => {
    for (const formula of Object.values(MAKER_MARK_FORMULAS)) expect(FORMULAS[formula]).toBeDefined();
    expect(FORMULAS["maker.first-launch"]!.sentence).toMatch(/not how it went/);
  });

  it("puts the durable mark on the card", () => {
    expect(makerCardMark({ firstLaunchDay: "2026-08-17", cleanVoteListings: 1, maintains: 1 })).toBe("First launch");
    expect(makerCardMark({ firstLaunchDay: null, cleanVoteListings: 1, maintains: 1 })).toBe("Clean vote");
  });

  it("pins the input keys (I2)", () => {
    expect([...MAKER_MARK_INPUT_KEYS]).toEqual(["firstLaunchDay", "cleanVoteListings", "maintains"]);
  });
});
