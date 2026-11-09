import { describe, expect, it } from "vitest";

import { FORMULAS } from "./provenance.js";
import {
  SIDEBAR_COLLECTION_FORMULA,
  SIDEBAR_OPENINGS_FORMULA,
  SIDEBAR_KEYS,
  SIDEBAR_PEOPLE_FORMULA,
  SIDEBAR_REPLIES_FORMULA,
  SIDEBAR_TOPICS_FORMULA,
  SIDEBAR_TOPIC_LIMIT,
  SIDEBAR_TOPIC_WINDOW_DAYS,
  headlineOf,
  orderSidebarTopics,
  sidebarHasContent,
  type Sidebar,
  type SidebarTopic,
} from "./sidebar.js";
import { TOPIC_WINDOW_DAYS } from "./topics.js";

function topic(over: Partial<SidebarTopic> & Pick<SidebarTopic, "value">): SidebarTopic {
  return { label: over.value, launches: 1, followers: 0, ...over };
}

const EMPTY: Sidebar = { topics: [], collection: null, openings: [], people: [], replies: [] };

describe("the topics panel's order", () => {
  it("is by launches in the window, then alphabetically", () => {
    const ordered = orderSidebarTopics([
      topic({ value: "b", label: "Bravo", launches: 2 }),
      topic({ value: "c", label: "Charlie", launches: 9 }),
      topic({ value: "a", label: "Alpha", launches: 2 }),
    ]);
    expect(ordered.map((t) => t.label)).toEqual(["Charlie", "Alpha", "Bravo"]);
  });

  it("NEVER orders by followers, which would be a ratchet not a measurement", () => {
    // Ordering topics by how many already follow them would make the
    // already-followed more followed, and would make a public panel's order
    // depend on a private act.
    const ordered = orderSidebarTopics([
      topic({ value: "quiet", label: "Quiet", launches: 1, followers: 9000 }),
      topic({ value: "busy", label: "Busy", launches: 5, followers: 0 }),
    ]);
    expect(ordered.map((t) => t.label)).toEqual(["Busy", "Quiet"]);
  });

  it("drops a topic with nothing in the window rather than listing it at zero", () => {
    const ordered = orderSidebarTopics([
      topic({ value: "live", launches: 3 }),
      topic({ value: "dormant", launches: 0 }),
    ]);
    expect(ordered.map((t) => t.value)).toEqual(["live"]);
  });

  it("is bounded, because a sidebar that scrolls is a second page", () => {
    const many = Array.from({ length: 20 }, (_, i) => topic({ value: `t${i}`, launches: 20 - i }));
    expect(orderSidebarTopics(many)).toHaveLength(SIDEBAR_TOPIC_LIMIT);
  });

  it("counts the same window a topic's own page does", () => {
    // A topic's row here and its own page must not disagree about how many
    // launches it had.
    expect(SIDEBAR_TOPIC_WINDOW_DAYS).toBe(TOPIC_WINDOW_DAYS);
  });
});

describe("a person's headline", () => {
  it("is THEIR first line, trimmed — never summarised and never generated", () => {
    expect(headlineOf("Builds small tools.\nAlso gardens.")).toBe("Builds small tools.");
  });

  it("is absent when they wrote nothing, rather than invented", () => {
    expect(headlineOf(null)).toBeNull();
    expect(headlineOf("")).toBeNull();
    expect(headlineOf("   \n  ")).toBeNull();
  });

  it("elides rather than rewrites when it is too long", () => {
    const long = "x".repeat(200);
    const out = headlineOf(long, 20)!;
    expect(out).toHaveLength(20);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("every panel degrades to absence", () => {
  it("a sidebar with nothing in it says so, and the page gives the column back", () => {
    expect(sidebarHasContent(EMPTY)).toBe(false);
  });

  it("one panel with anything is enough to keep the column", () => {
    expect(sidebarHasContent({ ...EMPTY, topics: [topic({ value: "a" })] })).toBe(true);
    expect(
      sidebarHasContent({
        ...EMPTY,
        collection: { slug: "s", title: "T", curator: "ada", items: 1, preview: [] },
      }),
    ).toBe(true);
    expect(
      sidebarHasContent({
        ...EMPTY,
        openings: [{ id: "r", title: "Role", slug: "acme", commitment: null }],
      }),
    ).toBe(true);
    expect(
      sidebarHasContent({ ...EMPTY, people: [{ handle: "ada", name: "Ada", headline: null }] }),
    ).toBe(true);
    // HB3 — the fifth panel keeps the column too.
    expect(
      sidebarHasContent({
        ...EMPTY,
        replies: [{ slug: "acme", title: "Comments on acme", repliedAt: "2026-09-10T00:00:00Z", posts: 2 }],
      }),
    ).toBe(true);
    expect(SIDEBAR_KEYS).toEqual(["topics", "collection", "openings", "people", "replies"]);
  });
});

describe("OPC-4 — every panel resolves to published prose", () => {
  const ids = [
    SIDEBAR_TOPICS_FORMULA,
    SIDEBAR_COLLECTION_FORMULA,
    SIDEBAR_OPENINGS_FORMULA,
    SIDEBAR_PEOPLE_FORMULA,
    SIDEBAR_REPLIES_FORMULA,
  ];

  it("all five are registered with a real sentence", () => {
    for (const id of ids) {
      const formula = (FORMULAS as Record<string, { sentence: string }>)[id];
      expect([id, formula !== undefined]).toEqual([id, true]);
      expect([id, formula!.sentence.length > 40]).toEqual([id, true]);
    }
  });

  it("the people ordering says plainly that it ranks nobody by merit", () => {
    // The design asked for a recommendation about people. Nothing here can
    // support one, so the sentence says what this list IS rather than letting
    // a reader assume the panel is a leaderboard of makers.
    const sentence = (FORMULAS as Record<string, { sentence: string }>)[SIDEBAR_PEOPLE_FORMULA]!
      .sentence;
    expect(sentence).toContain("NOT a recommendation");
    expect(sentence).toContain("put their hand up");
  });

  it("the collection ordering refuses an unattributable second layer", () => {
    const sentence = (FORMULAS as Record<string, { sentence: string }>)[
      SIDEBAR_COLLECTION_FORMULA
    ]!.sentence;
    expect(sentence).toContain("named curator");
  });

  it("no panel's sentence takes a signal about the reader", () => {
    for (const id of ids) {
      const sentence = (FORMULAS as Record<string, { sentence: string }>)[id]!.sentence;
      expect([id, /who is reading|who is searching|themselves|named curator/.test(sentence)]).toEqual([
        id,
        true,
      ]);
    }
  });
});
