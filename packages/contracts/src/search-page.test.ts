// The search results page's rules (openproduct-launch SR0).

import { describe, expect, it } from "vitest";

import { FACETS } from "./facets.js";
import {
  MAKER_MATCH_LABELS,
  SEARCH_EMPTY,
  SEARCH_HEADINGS,
  SEARCH_LAUNCH_LIMIT,
  SEARCH_MAKER_LIMIT,
  SEARCH_NOTHING,
  SEARCH_PATH,
  SEARCH_SCOPE_NOTE,
  SEARCH_SUGGESTION_LIMIT,
  SEARCH_TOPIC_LIMIT,
  suggestedTopics,
  SEE_ALL_RESULTS,
  makerMatchField,
  matchTopics,
  searchFoundNothing,
  searchPath,
  searchTitle,
} from "./search-page.js";

describe("the address, and the link into it", () => {
  it("is the design's", () => {
    expect(SEARCH_PATH).toBe("/search");
  });

  it("carries the query, escaped", () => {
    expect(searchPath("ada")).toBe("/search?q=ada");
    expect(searchPath("a & b")).toBe("/search?q=a%20%26%20b");
    // A bare address is a real page — the form on it is the point.
    expect(searchPath("")).toBe("/search");
    expect(searchPath("   ")).toBe("/search");
  });

  it("titles itself with the query, so a shared link says what it is", () => {
    expect(searchTitle("ada")).toBe("ada — search");
    expect(searchTitle("  ada  ")).toBe("ada — search");
    expect(searchTitle("")).toBe("Search");
  });
});

describe("topics come from the vocabulary, and ask nothing", () => {
  const categories = FACETS.find((f) => f.id === "category")!.values;

  it("matches a topic by its label", () => {
    const first = categories[0]!;
    const hits = matchTopics(first.label);
    expect(hits.map((h) => h.value)).toContain(first.value);
  });

  it("matches on a SUBSTRING, not a prefix", () => {
    // Somebody searching "tools" should find "Developer tools". A prefix match
    // would be the kind of search that only works if you already know the
    // answer.
    const withSpace = categories.find((v) => v.label.includes(" "));
    if (withSpace) {
      const tail = withSpace.label.split(" ").at(-1)!;
      expect(matchTopics(tail).map((h) => h.value)).toContain(withSpace.value);
    }
  });

  it("is case-insensitive and trims", () => {
    const first = categories[0]!;
    expect(matchTopics(`  ${first.label.toUpperCase()}  `).map((h) => h.value)).toContain(
      first.value,
    );
  });

  it("matches nothing for an empty query, rather than everything", () => {
    expect(matchTopics("")).toEqual([]);
    expect(matchTopics("   ")).toEqual([]);
  });

  it("is bounded", () => {
    // "e" appears in most labels; the answer must still be a short list.
    expect(matchTopics("e").length).toBeLessThanOrEqual(SEARCH_TOPIC_LIMIT);
    expect(matchTopics("e", 2).length).toBeLessThanOrEqual(2);
  });

  it("carries the topic's one address — its own page", () => {
    const first = categories[0]!;
    const hit = matchTopics(first.label)[0]!;
    expect(hit.href).toBe(`/topics/${first.value}`);
  });
});

describe("which field matched a person, decided in one place", () => {
  const row = { handle: "ada", displayName: "Ada Fenwick", bio: "Builds queues." };

  it("prefers the handle, then the name, then the bio", () => {
    // Somebody typing "ada" almost always means the person called that.
    expect(makerMatchField(row, "ada")).toBe("handle");
    expect(makerMatchField(row, "fenwick")).toBe("name");
    expect(makerMatchField(row, "queues")).toBe("bio");
  });

  it("says nothing when nothing matched", () => {
    expect(makerMatchField(row, "nobody")).toBeNull();
    expect(makerMatchField(row, "")).toBeNull();
    expect(makerMatchField(row, "   ")).toBeNull();
  });

  it("copes with a person who has neither a name nor a bio", () => {
    expect(makerMatchField({ handle: "ada", displayName: null, bio: null }, "ada")).toBe("handle");
    expect(makerMatchField({ handle: "ada", displayName: null, bio: null }, "fenwick")).toBeNull();
  });

  it("is case-insensitive, because nobody types a handle the way it is stored", () => {
    expect(makerMatchField(row, "ADA")).toBe("handle");
    expect(makerMatchField(row, "FeNwIcK")).toBe("name");
  });

  it("has a word for every branch it can return", () => {
    // A row that said "matched their undefined" is the failure this pins.
    for (const matched of ["handle", "name", "bio"] as const) {
      expect(typeof MAKER_MATCH_LABELS[matched]).toBe("string");
      expect(MAKER_MATCH_LABELS[matched].length).toBeGreaterThan(0);
    }
  });
});

describe("what the page says when it has nothing", () => {
  it("gives each section its OWN sentence", () => {
    // OPC-C applied to a search page: three headings all reading "no results"
    // tells a reader nothing about which of the three to try differently.
    const notes = [SEARCH_EMPTY.launches, SEARCH_EMPTY.makers, SEARCH_EMPTY.topics];
    expect(new Set(notes).size).toBe(3);
    for (const note of notes) expect(note.length).toBeGreaterThan(20);
  });

  it("says why people might be absent, rather than that there are none", () => {
    // "No public profiles matched" and "there are no people here" are very
    // different claims, and only the first is true.
    expect(SEARCH_EMPTY.makers).toContain("public");
    expect(SEARCH_EMPTY.makers).not.toMatch(/^No people/);
  });

  it("collapses three empties into one honest sentence", () => {
    const nothing = { query: "x", launches: [], makers: [], topics: [] };
    expect(searchFoundNothing(nothing)).toBe(true);
    expect(searchFoundNothing({ ...nothing, topics: [{ value: "a", label: "A", href: "/topics/a" }] })).toBe(false);
    expect(SEARCH_NOTHING).toMatch(/^Nothing matched/);
  });
});

describe("the order is published, because it is an editorial position", () => {
  it("names all three mechanisms where a reader can see them", () => {
    // OPC-4. "Relevance" sounds like a technical detail, which is exactly why
    // it needs saying out loud on the page that applies it: it decides whose
    // work is seen.
    expect(SEARCH_SCOPE_NOTE).toContain("search.relevance");
    expect(SEARCH_SCOPE_NOTE).toContain("public profiles");
    expect(SEARCH_SCOPE_NOTE).toContain("topic list");
  });

  it("says people are matched on what their profile already shows", () => {
    for (const word of ["handle", "name", "bio"]) {
      expect([word, SEARCH_SCOPE_NOTE.includes(word)]).toEqual([word, true]);
    }
  });
});

describe("the shape of the page", () => {
  it("gives launches the most room, because it is what people come for", () => {
    expect(SEARCH_LAUNCH_LIMIT).toBeGreaterThan(SEARCH_MAKER_LIMIT);
    expect(SEARCH_LAUNCH_LIMIT).toBeGreaterThan(SEARCH_TOPIC_LIMIT);
  });

  it("bounds all three, so page length does not depend on how common a word is", () => {
    for (const limit of [SEARCH_LAUNCH_LIMIT, SEARCH_MAKER_LIMIT, SEARCH_TOPIC_LIMIT]) {
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThanOrEqual(50);
    }
  });

  it("names its three sections as the design does", () => {
    // The first section holds the index's products: builds (CL5).
    expect(SEARCH_HEADINGS.launches).toBe("Builds");
    expect(SEARCH_HEADINGS.makers).toBe("Makers");
    expect(SEARCH_HEADINGS.topics).toBe("Topics");
  });

  it("offers the vocabulary's own first few before anybody has typed", () => {
    // The field opens before there is a query, and it has to offer something
    // that is not a claim: the facet's declared order, which is editorial and
    // the same for every visitor, rather than a popularity ranking with an
    // input nobody outside this program can see (OPC-4).
    const offered = suggestedTopics();
    expect(offered.length).toBe(SEARCH_SUGGESTION_LIMIT);
    expect(offered.every((t) => t.href === `/topics/${t.value}`)).toBe(true);
    expect(offered.every((t) => t.label.length > 0)).toBe(true);
    // Every one is a real topic — the same vocabulary `matchTopics` answers
    // from, so a suggestion can never lead to a page that does not exist.
    for (const topic of offered) {
      expect(matchTopics(topic.label, 20).some((hit) => hit.value === topic.value)).toBe(true);
    }
    expect(suggestedTopics(2).length).toBe(2);
  });

  it("gives the palette a door out", () => {
    expect(SEE_ALL_RESULTS).toBe("See all results");
  });
});
