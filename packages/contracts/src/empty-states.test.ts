// Empty states: one sentence, and the reasoning still on the page
// (openproduct-worldclass VC0).
//
// The audit's P1·10 is that every empty state here is an essay — and it is
// careful about what is wrong with that: *"The voice is distinctive and I
// would not flatten it, but an SRE scanning for 'what launched in
// observability this week' will not read it."* The register is right; the
// density is wrong, and the reasoning is in front of somebody who did not ask.
//
// So this suite asserts BOTH halves, and the second matters more than the
// first. Cutting words is easy and is how a density pass destroys the thing
// that made a product sound like a person. Every `_WHY` below is the sentence
// that used to be forced on the reader, kept verbatim behind a disclosure.

import { describe, expect, it } from "vitest";

import { BOARD_EMPTY_NOTE, BOARD_EMPTY_WHY } from "./board.js";
import { COLLECTIONS_EMPTY_NOTE, COLLECTIONS_EMPTY_WHY, COLLECTION_EMPTY_NOTE, COLLECTION_EMPTY_WHY } from "./collections.js";
import { NO_LAUNCHES_NOTE, NO_LAUNCHES_WHY } from "./digest.js";
import { LEADERBOARD_EMPTY_NOTE } from "./leaderboard.js";

const SPLIT: ReadonlyArray<readonly [string, string, string]> = [
  ["a collection whose items went private", COLLECTION_EMPTY_NOTE, COLLECTION_EMPTY_WHY],
  ["the collections index", COLLECTIONS_EMPTY_NOTE, COLLECTIONS_EMPTY_WHY],
  ["a week nothing launched in", NO_LAUNCHES_NOTE, NO_LAUNCHES_WHY],
  // CF5 — the board joined the rule when it learned to name the act.
  ["a day nothing launched on", BOARD_EMPTY_NOTE, BOARD_EMPTY_WHY],
];

/** Sentences, counting a trailing full stop as one rather than two. */
const sentences = (copy: string) => copy.split(/(?<=[.!?])\s+/).filter(Boolean).length;

describe("empty states say the fact first (VC0)", () => {
  it.each(SPLIT)("%s states its fact in one sentence", (_name, says) => {
    expect(sentences(says)).toBe(1);
    // A sentence long enough to need a comma and a dash is a paragraph that
    // has learned to hide.
    expect(says.length).toBeLessThanOrEqual(60);
  });

  it.each(SPLIT)("%s keeps its reasoning rather than losing it", (_name, says, why) => {
    // THE ASSERTION THIS SUITE EXISTS FOR. The failure mode of a density pass
    // is deletion: the page gets shorter, the product gets blander, and
    // nobody notices for a year.
    expect(why.length).toBeGreaterThan(40);
    expect(why).not.toBe(says);
  });

  it("keeps the sentence the digest most needed to keep", () => {
    // Of everything moved, this is the one worth naming: it explains why the
    // page does not quietly widen its window until something appears, which
    // is the commonest dishonesty in a weekly roundup. Shortening the fact
    // must not cost it.
    expect(NO_LAUNCHES_WHY).toContain("widen the window");
  });

  it("leaves the leaderboard's note alone, because it was never the problem", () => {
    // Two sentences, nineteen words, already followed on the page by a real
    // action. The rule is "one sentence and one action", not "one sentence at
    // any cost" — and a scope pass that splits this one has started cutting
    // for its own sake.
    expect(sentences(LEADERBOARD_EMPTY_NOTE)).toBe(2);
  });
});
