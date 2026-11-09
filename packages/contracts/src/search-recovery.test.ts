// The way out of an empty result (openproduct-commons DS4).
//
// A SUGGESTION IS A CLAIM ABOUT THE CATALOG, and that is why this is tested
// as carefully as the ranking is. "Did you mean rust?" tells a reader we have
// something called `rust`, and they will believe it — so the function must
// never name a word that is not in the vocabulary it was handed, and must
// stay silent rather than guess when it is not confident.
//
// The expensive failure is not the missing suggestion. It is the WRONG one:
// no suggestion costs a reader one more attempt, a wrong suggestion costs
// them their trust in every answer the directory gives them afterwards.

import { describe, expect, it } from "vitest";

import { nearestTerm } from "./search.js";

const VOCABULARY = ["rust", "typescript", "sqlite", "svelte", "devtools", "self-hosted", "go"];

describe("nearestTerm — one edit, and only when it means something", () => {
  it("offers the catalog's own word for a one-edit typo", () => {
    expect(nearestTerm("rustt", VOCABULARY)).toBe("rust");
    expect(nearestTerm("sqlit", VOCABULARY)).toBe("sqlite");
    expect(nearestTerm("svelt", VOCABULARY)).toBe("svelte");
  });

  it("says nothing when the word is two or more edits away", () => {
    // `react` is `rust` with three edits, and offering it would tell a reader
    // this catalog contains React when it does not. A wrong suggestion is
    // more expensive than no suggestion.
    expect(nearestTerm("react", VOCABULARY)).toBeNull();
    expect(nearestTerm("python", VOCABULARY)).toBeNull();
    expect(nearestTerm("kubernetes", VOCABULARY)).toBeNull();
  });

  it("says nothing for a word the catalog already has", () => {
    // If `rust` is in the vocabulary and the search STILL found nothing, the
    // reader's problem is a filter, not a spelling — and telling them to
    // search for what they just searched for is worse than saying nothing.
    expect(nearestTerm("rust", VOCABULARY)).toBeNull();
    expect(nearestTerm("RUST", VOCABULARY)).toBeNull();
  });

  it("refuses to guess at short words, where one edit is most of the word", () => {
    // `go` and `no` are not typos of each other; they are different words.
    // Below four characters the edit distance stops carrying any signal about
    // what somebody meant.
    expect(nearestTerm("gp", VOCABULARY)).toBeNull();
    expect(nearestTerm("ust", VOCABULARY)).toBeNull();
  });

  it("only answers a SINGLE-WORD query", () => {
    // A multi-word query that found nothing is far more likely to be an
    // over-narrow search than a misspelling, and correcting one word of it
    // would be answering a question nobody asked.
    expect(nearestTerm("rustt sqlit", VOCABULARY)).toBeNull();
    expect(nearestTerm("", VOCABULARY)).toBeNull();
    expect(nearestTerm("   ", VOCABULARY)).toBeNull();
  });

  it("can only ever name a word from the vocabulary it was handed", () => {
    // The property the whole feature rests on: it does not invent, it picks.
    for (const query of ["rustt", "sqlit", "devtool", "selfhosted", "zzzz", "svelte", "gp"]) {
      const answer = nearestTerm(query, VOCABULARY);
      if (answer !== null) expect(VOCABULARY).toContain(answer);
    }
  });

  it("says nothing when the vocabulary is empty", () => {
    expect(nearestTerm("rustt", [])).toBeNull();
  });

  it("is deterministic when two candidates are equally close", () => {
    // Ties break by the candidate's own sort order rather than by frequency
    // or catalog position, so the answer is a function of the vocabulary and
    // the reader's word and nothing else (OPC-4) — including nothing about
    // which listings happen to be popular.
    const ambiguous = ["fast", "last", "mast"];
    expect(nearestTerm("bast", ambiguous)).toBe("fast");
    expect(nearestTerm("bast", [...ambiguous].reverse())).toBe("fast");
  });

  it("normalises the reader's word the same way the index does", () => {
    // `queryTerms` is the shared tokeniser, so `Rust!` and `rust` are one
    // word here exactly as they are in the index. Two normalisations would
    // mean a suggestion offered for a query that would then not match.
    expect(nearestTerm("Rustt", VOCABULARY)).toBe("rust");
    expect(nearestTerm("SQLIT", VOCABULARY)).toBe("sqlite");
  });

  it("matches a vocabulary value case-insensitively", () => {
    expect(nearestTerm("rustt", ["Rust"])).toBe("rust");
    // ...and does not then suggest a word that only differed in case.
    expect(nearestTerm("rust", ["Rust"])).toBeNull();
  });
});
