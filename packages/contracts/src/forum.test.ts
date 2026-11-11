// The forum index (openproduct-worldclass-v2 FO1).
import { describe, expect, it } from "vitest";

import { THREAD_TAGS } from "./discussions.js";
import {
  FORUM_LATEST_FORMULA,
  FORUM_ORDERS,
  FORUM_REPLIED_FORMULA,
  FORUM_THREAD_KEYS,
  forumCategories,
  forumFormula,
  forumMeaning,
  forumPath,
  parseForumOrder,
  parseForumTag,
  THREAD_TILE_LABEL,
} from "./forum.js";
import { FORMULAS } from "./provenance.js";

describe("two orders, both published, and no third", () => {
  it("parses the two, defaults to the latest, and refuses hot", () => {
    expect([...FORUM_ORDERS]).toEqual(["latest", "replied"]);
    expect(parseForumOrder(null)).toBe("latest");
    expect(parseForumOrder("")).toBe("latest");
    expect(parseForumOrder("replied")).toBe("replied");
    expect(parseForumOrder("hot")).toBeNull();
    expect(parseForumOrder("trending")).toBeNull();
  });

  it("each order resolves to a registered sentence that says nothing about the reader enters it", () => {
    for (const id of [FORUM_LATEST_FORMULA, FORUM_REPLIED_FORMULA]) {
      const formula = (FORMULAS as Record<string, { sentence: string }>)[id];
      expect([id, formula !== undefined]).toEqual([id, true]);
      expect(formula!.sentence).toMatch(/Nothing about who is reading enters it/);
    }
    expect(forumFormula("latest")).toBe("threads.latest");
    expect(forumFormula("replied")).toBe("threads.most-replied");
    expect(FORMULAS["threads.most-replied"].sentence).toMatch(/This is not hot/);
  });
});

describe("the categories are the six tags the thread plane already has", () => {
  it("offers every chosen tag and refuses the launch tag and strangers", () => {
    expect(forumCategories().map((c) => c.value)).toEqual([...THREAD_TAGS]);
    expect(parseForumTag(null)).toBeNull();
    expect(parseForumTag("question")).toBe("question");
    expect(parseForumTag("launch")).toBeUndefined();
    expect(parseForumTag("hot")).toBeUndefined();
  });
});

describe("the address", () => {
  it("is a path — order and tag as segments, the latest bare", () => {
    expect(forumPath()).toBe("/threads");
    expect(forumPath("replied")).toBe("/threads/replied");
    expect(forumPath("latest", "design")).toBe("/threads/tag/design");
    expect(forumPath("replied", "design")).toBe("/threads/tag/design/replied");
  });

  it("says what the list is where it begins", () => {
    expect(forumMeaning("latest", null)).toBe("Every thread on a public listing, newest first.");
    expect(forumMeaning("replied", "question")).toMatch(/^Question threads on a public listing, by visible replies/);
  });

  it("the row carries the thread's public shape and the listing's slug, nothing more", () => {
    expect([...FORUM_THREAD_KEYS]).toEqual([
      "id", "tag", "title", "authorHandle", "authorName", "state", "createdAt", "lastPostAt", "postCount", "slug",
    ]);
  });
});

describe("THREAD_TILE_LABEL (openproduct-calm-pages CP3)", () => {
  it("names a thread tile's figures once, in words a reader scans", () => {
    expect(THREAD_TILE_LABEL).toEqual({ replies: "Replies", lastReply: "Last reply", started: "Started" });
  });
});
