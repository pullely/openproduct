// Stack pages (openproduct-worldclass VC1) — the audit's other missing filter.
//
// What is pinned here is the arithmetic and the vocabulary discipline. What is
// pinned in `tests/web` is the shape of the pages: that every filter state is
// a path, that none of them reads `searchParams` or a session, and that the
// rail cannot offer a value whose page would be empty.

import { describe, expect, it } from "vitest";

import { FACETS } from "./facets.js";
import type { PublicProfileCard } from "./index.js";
import {
  STACKS_PATH,
  STACK_FACET,
  STACK_RAIL_LIMIT,
  cardsWithStack,
  railStacks,
  stackLabel,
  stackMeaning,
  stackPath,
  stackTally,
} from "./stacks.js";

const card = (slug: string, canonical: string[], written: string[] = canonical): PublicProfileCard => ({
  slug,
  tagline: null,
  stack: written,
  stackCanonical: canonical,
  category: null,
  hosting: null,
  pricing: null,
  licence: null,
  roleOpeningCount: 0,
  openingCommitments: [],
  hasLiveUrl: false,
  indexable: true,
  publishedAt: "2026-08-01T00:00:00Z",
  metrics: [],
  thumbnail: null,
});

describe("a stack value is an address", () => {
  it("builds one path per value, under one prefix", () => {
    expect(stackPath("rust")).toBe("/stack/rust");
    expect(STACKS_PATH).toBe("/stack");
  });

  it("encodes, so a value can never open a second path segment", () => {
    // Nothing in the vocabulary needs it today. The encoding is what keeps
    // that from being load-bearing.
    expect(stackPath("c++")).toBe("/stack/c%2B%2B");
    expect(stackPath("a/b")).toBe("/stack/a%2Fb");
  });

  it("names the facet once, and it is the facet the vocabulary has", () => {
    expect(STACK_FACET).toBe("stack");
    expect(FACETS.some((group) => group.id === STACK_FACET)).toBe(true);
  });

  it("labels only values the vocabulary knows", () => {
    expect(stackLabel("typescript")).toBe("TypeScript");
    expect(stackLabel("csharp")).toBe("C#");
    // A hand-typed URL gets a 404 rather than a page titled after the path.
    expect(stackLabel("cobol-the-sequel")).toBeNull();
    expect(stackLabel("")).toBeNull();
  });
});

describe("the tally counts listings, not mentions", () => {
  it("counts one listing once, however many times it says the same thing", () => {
    // `stackCanonical` can repeat when two of a maintainer's spellings fold to
    // one value. The listing is what is being counted.
    const tally = stackTally([card("a", ["rust", "rust"]), card("b", ["rust"])]);
    expect(tally).toEqual([{ value: "rust", label: "Rust", products: 2 }]);
  });

  it("counts a listing under every value it holds", () => {
    const tally = stackTally([card("a", ["rust", "typescript"])]);
    expect(tally.map((t) => t.value).sort()).toEqual(["rust", "typescript"]);
    expect(tally.every((t) => t.products === 1)).toBe(true);
  });

  it("offers only values something is actually built with", () => {
    // `/topics`' own rule, and DS1's before it: a rail entry that leads to an
    // empty page is a broken link with a number beside it. The vocabulary has
    // fifty-odd values; a two-card catalogue offers two.
    const tally = stackTally([card("a", ["rust"]), card("b", ["go"])]);
    expect(tally).toHaveLength(2);
    const vocabulary = FACETS.find((g) => g.id === STACK_FACET)!.values.length;
    expect(vocabulary).toBeGreaterThan(20);
  });

  it("reads the canonical field and never the maintainer's own words", () => {
    // The card's own comment: `stackCanonical` is "the ONLY one facets and
    // counts read". `TypeScript`, `typescript` and `TS` are one language and
    // three strings, and a count over the strings is a count of nothing.
    const tally = stackTally([card("a", [], ["TypeScript", "TS", "typescript"])]);
    expect(tally).toEqual([]);
  });

  it("drops a canonical value the vocabulary does not have", () => {
    // It should be unreachable — CT1 canonicalises at write time — and if one
    // ever arrives, dropping it beats a rail entry titled with a raw slug.
    const tally = stackTally([card("a", ["rust", "not-a-language"])]);
    expect(tally.map((t) => t.value)).toEqual(["rust"]);
  });

  it("orders by count, then by label, so two reads cannot disagree", () => {
    const tally = stackTally([
      card("a", ["go", "rust", "typescript"]),
      card("b", ["rust", "typescript"]),
      card("c", ["typescript"]),
    ]);
    expect(tally.map((t) => `${t.value}:${t.products}`)).toEqual([
      "typescript:3",
      "rust:2",
      "go:1",
    ]);
  });

  it("breaks a tie alphabetically by LABEL, not by value", () => {
    // `csharp` sorts before `go` by value and `C#` before `Go` by label — the
    // one that matters is what a reader sees in the rail.
    const tally = stackTally([card("a", ["go", "csharp"])]);
    expect(tally.map((t) => t.label)).toEqual(["C#", "Go"]);
  });

  it("has nothing to say about an empty catalogue", () => {
    // Not "0 products in every language": no values at all, which is what an
    // absent rail is made of (OPC-C).
    expect(stackTally([])).toEqual([]);
    expect(stackTally([card("a", [])])).toEqual([]);
  });
});

describe("the number and the list come out of one document (WC-7)", () => {
  const catalogue = [
    card("a", ["rust", "typescript"]),
    card("b", ["typescript"]),
    card("c", ["go"]),
    card("d", []),
  ];

  it("every tally is exactly the length of the list behind it", () => {
    // THE PROPERTY THE RAIL RESTS ON. A count computed by one query beside a
    // list produced by another is the defect WC-7 names; here they are two
    // reads of the same array, and this asserts they agree for every value at
    // once rather than for the one somebody remembered to check.
    const mismatched = stackTally(catalogue)
      .filter((t) => cardsWithStack(catalogue, t.value).length !== t.products)
      .map((t) => t.value);
    expect(mismatched).toEqual([]);
  });

  it("filters on the canonical field, like the tally", () => {
    expect(cardsWithStack(catalogue, "typescript").map((c) => c.slug)).toEqual(["a", "b"]);
    expect(cardsWithStack([card("a", [], ["Rust"])], "rust")).toEqual([]);
  });

  it("answers a value nothing uses with an empty list, not an error", () => {
    expect(cardsWithStack(catalogue, "haskell")).toEqual([]);
  });
});

describe("each page says which question it answers (OPC-4)", () => {
  it("names the label, and says it is the directory rather than the board", () => {
    const sentence = stackMeaning("Rust");
    expect(sentence).toContain("Rust");
    expect(sentence).toContain("directory");
    // The distinction `topics.ts` draws, restated where a reader is standing:
    // a topic page is what LAUNCHED recently, this is everything there is.
    expect(sentence).toContain("launch board");
  });
});

describe("the rail's cap is decided here, not in a component (OL-2a)", () => {
  const many = Array.from({ length: 9 }, (_, at) =>
    card(`p${at}`, ["typescript", "rust", "go", "python", "java", "ruby", "php"].slice(0, at + 1)),
  );

  it("offers five, which is what the topics rail beside it offers", () => {
    expect(STACK_RAIL_LIMIT).toBe(5);
    expect(railStacks(stackTally(many))).toHaveLength(5);
  });

  it("takes the tally's own order, and never re-decides it", () => {
    const tally = stackTally(many);
    expect(railStacks(tally)).toEqual(tally.slice(0, STACK_RAIL_LIMIT));
  });

  it("offers everything when there is less than a railful", () => {
    const tally = stackTally([card("a", ["rust"]), card("b", ["go"])]);
    expect(railStacks(tally)).toHaveLength(2);
  });

  it("offers nothing rather than an empty rail", () => {
    // A panel with no rows does not render at all — the sidebar's own rule,
    // and OPC-C applied to furniture.
    expect(railStacks(stackTally([]))).toEqual([]);
  });
});
