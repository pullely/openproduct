// CV1 — one level of replies (openproduct-worldclass).
//
// The done-when is "a reply renders under its parent and notifies the parent's
// author through CB4's seam". The notification half was already true —
// participation IS the subscription, and a parent's author is a participant —
// so what is pinned here is the shape, and every way a tree could go wrong.

import { describe, expect, it } from "vitest";

import {
  POST_ORDER_NOTE,
  REPLY_DEPTH,
  REPLY_NOTE,
  nestPosts,
  postCount,
  type PublicPost,
} from "./discussions.js";

const post = (id: string, parentPostId: string | null = null): PublicPost => ({
  id,
  parentPostId,
  authorHandle: null,
  authorName: null,
  body: [],
  state: "visible",
  createdAt: "2026-05-20T09:00:00.000Z",
  editedAt: null,
  isAnswer: false,
  tag: null,
  authorIsMaintainer: false,
  votes: 0,
});

describe("one level, and the reason it is one", () => {
  it("says how deep, once", () => {
    expect(REPLY_DEPTH).toBe(1);
    expect(REPLY_NOTE).toContain("one level");
  });

  it("nests a reply under the post it answers", () => {
    const nested = nestPosts([post("a"), post("b", "a"), post("c")]);
    expect(nested.map((n) => n.post.id)).toEqual(["a", "c"]);
    expect(nested[0]!.replies.map((r) => r.id)).toEqual(["b"]);
    expect(nested[1]!.replies).toEqual([]);
  });

  it("keeps both levels in the order they were written", () => {
    // Nothing here sorts. Upvotes order nothing (POST_ORDER_NOTE) and neither
    // does anything else — the API's order is the order it happened in.
    const nested = nestPosts([
      post("a"),
      post("a2", "a"),
      post("b"),
      post("a1", "a"),
      post("b1", "b"),
    ]);
    expect(nested.map((n) => n.post.id)).toEqual(["a", "b"]);
    expect(nested[0]!.replies.map((r) => r.id)).toEqual(["a2", "a1"]);
  });

  it("flattens a reply to a reply onto its grandparent", () => {
    // The write path refuses to create one — the insert's own SQL requires a
    // top-level parent — so a row like this is corruption or a migration
    // artefact. The honest rendering is still to show it.
    const nested = nestPosts([post("a"), post("b", "a"), post("c", "b")]);
    expect(nested).toHaveLength(1);
    expect(nested[0]!.replies.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("shows an orphan rather than dropping it", () => {
    // A parent can be missing because the list was truncated. Silently
    // dropping the reply would delete somebody's words from a page over a
    // paging artefact.
    const nested = nestPosts([post("b", "missing"), post("a")]);
    expect(nested.map((n) => n.post.id)).toEqual(["a", "b"]);
    expect(nested.find((n) => n.post.id === "b")!.replies).toEqual([]);
  });

  it("renders every post exactly once, however tangled the input", () => {
    // THE INVARIANT THAT MATTERS MOST: nesting is a rearrangement, never a
    // filter. Whatever comes in comes out.
    const input = [post("a"), post("b", "a"), post("c", "b"), post("d", "gone"), post("e")];
    const nested = nestPosts(input);
    const seen = nested.flatMap((n) => [n.post.id, ...n.replies.map((r) => r.id)]);
    expect(seen.slice().sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(seen).toHaveLength(input.length);
  });

  it("has nothing to say about an empty thread", () => {
    expect(nestPosts([])).toEqual([]);
  });

  it("counts what it renders, replies included (WC-7)", () => {
    const input = [post("a"), post("b", "a"), post("c")];
    const nested = nestPosts(input);
    const rendered = nested.reduce((n, x) => n + 1 + x.replies.length, 0);
    expect(postCount(input)).toBe(rendered);
    expect(postCount(input)).toBe(3);
  });
});

describe("the policy the page has to say out loud", () => {
  it("states that upvotes order nothing", () => {
    // A number beside a post that a reader assumes is sorting the page is
    // worse than no number.
    expect(POST_ORDER_NOTE).toContain("order they were written");
    expect(POST_ORDER_NOTE).toContain("never change that order");
  });
});
