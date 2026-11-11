// AG3 — open to one more project (openproduct-worldclass).
//
// TWO THIRDS OF THE MILESTONE WERE ALREADY SHIPPING: a maker can mark
// themselves open (CG1's control, CG2's projection, the directory's filter),
// and their confirmed contribution history renders under OPC-5's two-sided
// rule (CG3). What was missing was the MATCH — and what is pinned here is the
// shape that word was given, which is two sides and no edge between them.
//
// The label and its note are here rather than in the web layer because two
// surfaces draw this pill, each was spelling it out itself, and neither said
// whose claim it was.

import { describe, expect, it } from "vitest";

import {
  ASKING_HEADING,
  ASKING_NOTE,
  OPEN_TO_PROJECT_LABEL,
  OPEN_TO_PROJECT_NOTE,
  ASKING_PREVIEW_LIMIT,
  askingAllLabel,
  askingPreview,
  listingsAsking,
} from "./profiles.js";


describe("AG3 — open to one more project, and the side it is not matched to", () => {
  it("names the pill once, so two surfaces cannot disagree about it", () => {
    // It was a string literal in the directory's list AND another in the
    // maker header — the same tick spelled out twice, independently, with
    // nothing keeping the two in step and neither naming its source.
    expect(OPEN_TO_PROJECT_LABEL).toBe("open to one more project");
    expect(OPEN_TO_PROJECT_NOTE).toContain("their claim");
    expect(OPEN_TO_PROJECT_NOTE).toContain("untick");
  });

  it("keeps only the listings that are actually asking", () => {
    const cards = [
      { slug: "a", tagline: "one", roleOpeningCount: 2 },
      { slug: "b", tagline: null, roleOpeningCount: 0 },
      { slug: "c", tagline: "three", roleOpeningCount: 1 },
    ];
    expect(listingsAsking(cards).map((l) => l.slug)).toEqual(["a", "c"]);
  });

  it("carries the maintainers' own count, unchanged", () => {
    const [only] = listingsAsking([{ slug: "a", tagline: null, roleOpeningCount: 4 }]);
    expect(only).toEqual({ slug: "a", tagline: null, roleOpeningCount: 4 });
  });

  it("does not rank listings by how many people they want", () => {
    // A listing asking for four is not more deserving than one asking for
    // one, and an order implying otherwise would be inventing a merit this
    // page has no formula for. The document's own order stands.
    const cards = [
      { slug: "one", tagline: null, roleOpeningCount: 1 },
      { slug: "four", tagline: null, roleOpeningCount: 4 },
    ];
    expect(listingsAsking(cards).map((l) => l.slug)).toEqual(["one", "four"]);
  });

  it("has nothing to say when nobody is asking", () => {
    expect(listingsAsking([{ slug: "a", tagline: null, roleOpeningCount: 0 }])).toEqual([]);
    expect(listingsAsking([])).toEqual([]);
  });

  it("gives the section a heading that does not promise a pairing", () => {
    // "Listings asking for people" is a second list. "Matches for you",
    // "Suggested for Ada", "People who might fit" are all the same page
    // asserting an edge nobody made.
    expect(ASKING_HEADING).toBe("Listings asking for people");
    expect(ASKING_HEADING.toLowerCase()).not.toMatch(/match|suggest|recommend|for you|fit/);
  });

  it("says out loud that the two lists are not pairs", () => {
    // THE SENTENCE THAT KEEPS THIS FROM BEING A MATCHMAKER. Two lists on one
    // page invite a reader to pair them up, which is fine; a page doing it for
    // them is not, because every edge this product renders between a person
    // and a listing is one both sides made (OPC-5).
    expect(ASKING_NOTE).toContain("not pairs");
    expect(ASKING_NOTE).toContain("both of them confirmed");
  });
});

describe("the People page previews the asking listings (openproduct-calm CL4)", () => {
  const asking = Array.from({ length: 8 }, (_, i) => ({ slug: `b${i}`, tagline: null, roleOpeningCount: 1 }));

  it("shows the first few, in the document's own order", () => {
    expect(ASKING_PREVIEW_LIMIT).toBe(5);
    expect(askingPreview(asking).map((l) => l.slug)).toEqual(["b0", "b1", "b2", "b3", "b4"]);
    expect(askingPreview(asking.slice(0, 2))).toHaveLength(2);
  });

  it("links the whole list to the Roles order, by its count", () => {
    expect(askingAllLabel(30)).toBe("See all 30 in Roles");
    expect(askingAllLabel(1)).toBe("See it in Roles");
  });
});
