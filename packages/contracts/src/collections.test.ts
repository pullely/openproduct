import { describe, expect, it } from "vitest";

import {
  COLLECTIONS_EMPTY_NOTE,
  COLLECTIONS_EMPTY_WHY,
  COLLECTIONS_MEANING,
  COLLECTION_CARD_KEYS,
  COLLECTION_EMPTY_NOTE,
  COLLECTION_EMPTY_WHY,
  COLLECTION_PROVENANCE_NOTE,
  COLLECTION_REFUSALS,
  COLLECTION_STATES,
  CURATOR_NOTE,
  MAX_COLLECTION_ITEMS,
  MAX_LIVE_COLLECTIONS_PER_CURATOR,
  PUBLIC_COLLECTION_KEYS,
  collectionSlugIsWellFormed,
  collectionSummary,
  reorder,
  titleIsAcceptable,
  visibleCount,
  type PublicCollection,
} from "./collections.js";

describe("the count is what the page SHOWS", () => {
  const withItems = (n: number): PublicCollection => ({
    slug: "picks",
    title: "Picks",
    blurb: null,
    curatorHandle: "ada",
    publishedAt: "2026-08-26T09:00:00.000Z",
    items: Array.from({ length: n }, (_, i) => ({
      card: { slug: `p${i}` } as never,
      note: null,
    })),
  });

  it("counts the visible items, never a stored total", () => {
    // A collection of eight whose three listings went private renders five
    // cards. "8 products" over five cards is a page lying about a number it
    // could have counted correctly.
    expect(visibleCount(withItems(5))).toBe(5);
    expect(visibleCount(withItems(0))).toBe(0);
  });

  it("says something true when nothing in it is public", () => {
    expect(collectionSummary(0)).toBe("Nothing in it is public right now");
    expect(collectionSummary(1)).toBe("1 product");
    expect(collectionSummary(7)).toBe("7 products");
  });

  it("takes only the items when counting, so a stored total cannot reach it", () => {
    // The signature is the guarantee: `visibleCount` cannot be handed a
    // stored count because it does not accept one.
    const collection = withItems(3);
    expect(visibleCount({ items: collection.items })).toBe(3);
  });
});

describe("a collection is signed, and the signature has to resolve", () => {
  it("carries a handle, never a subject id or a platform name", () => {
    // I3 and OPC-6: the handle IS the address (`/@handle`), and a platform
    // display name would carry platform authority onto a public page.
    expect(PUBLIC_COLLECTION_KEYS).toContain("curatorHandle");
    expect(PUBLIC_COLLECTION_KEYS).not.toContain("curatorSubjectId");
    expect(COLLECTION_CARD_KEYS).toContain("curatorHandle");
    expect(COLLECTION_CARD_KEYS).not.toContain("curatorSubjectId");
  });

  it("the refusal aimed at a non-curator says how to clear the bar", () => {
    // It is a refusal aimed at somebody who has done nothing wrong, so it
    // states what the bar IS rather than "you are not allowed".
    const says = COLLECTION_REFUSALS["not-a-curator"].says;
    expect(says).toMatch(/publish a listing/i);
    expect(says).toMatch(/public profile/i);
    expect(says).not.toMatch(/not allowed|forbidden|denied/i);
  });

  it("every refusal is a sentence a person could act on", () => {
    for (const [reason, copy] of Object.entries(COLLECTION_REFUSALS)) {
      expect(copy.says.length, reason).toBeGreaterThan(20);
      expect(copy.says, reason).not.toMatch(/error|invalid|failed/i);
    }
  });

  it("tells a curator the obligation BEFORE they publish", () => {
    // The coupling is the design: a curator who goes private takes their
    // collections with them. Learning that afterwards would be a surprise
    // nobody agreed to.
    expect(CURATOR_NOTE).toMatch(/links to your profile/i);
    expect(CURATOR_NOTE).toMatch(/come down with it/i);
  });
});

describe("order is the curation", () => {
  it("moves an item and renumbers densely", () => {
    expect(reorder(["a", "b", "c", "d"], "d", 1)).toEqual(["a", "d", "b", "c"]);
    expect(reorder(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
  });

  it("clamps a position past either end rather than dropping the item", () => {
    expect(reorder(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
    expect(reorder(["a", "b", "c"], "c", -5)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op for an item that is not in the set", () => {
    expect(reorder(["a", "b"], "z", 0)).toEqual(["a", "b"]);
  });

  it("does not mutate what it was given", () => {
    const rows = ["a", "b", "c"];
    reorder(rows, "c", 0);
    expect(rows).toEqual(["a", "b", "c"]);
  });

  it("moving to the position an item already holds changes nothing", () => {
    expect(reorder(["a", "b", "c"], "b", 1)).toEqual(["a", "b", "c"]);
  });

  it("renumbers DENSELY, so positions cannot collide after enough moves", () => {
    // Sparse positions (10, 20, 30) are the usual trick and they rot: two
    // items eventually collide and the order becomes whatever the database
    // returns — which on a surface whose whole point is the curator's order
    // is the surface failing at its one job.
    let order = ["a", "b", "c", "d", "e"];
    for (let i = 0; i < 20; i += 1) {
      order = reorder(order, order[i % order.length]!, (i * 3) % order.length);
    }
    expect([...order].sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(new Set(order).size).toBe(5);
  });
});

describe("bounds", () => {
  it("accepts the slug shapes a listing accepts, and refuses the rest", () => {
    for (const good of ["picks", "my-picks", "a", "a1", "eight-things-2026"]) {
      expect(collectionSlugIsWellFormed(good), good).toBe(true);
    }
    for (const bad of ["", "-picks", "picks-", "My-Picks", "my picks", "my_picks", "a".repeat(65)]) {
      expect(collectionSlugIsWellFormed(bad), bad).toBe(false);
    }
  });

  it("requires a title and bounds it", () => {
    expect(titleIsAcceptable("Eight things")).toBe(true);
    expect(titleIsAcceptable("   ")).toBe(false);
    expect(titleIsAcceptable("")).toBe(false);
    expect(titleIsAcceptable("x".repeat(200))).toBe(false);
  });

  it("bounds a collection so it cannot become a second directory", () => {
    expect(MAX_COLLECTION_ITEMS).toBeGreaterThan(5);
    expect(MAX_COLLECTION_ITEMS).toBeLessThanOrEqual(100);
    // And the refusal explains the reason rather than just the number.
    expect(COLLECTION_REFUSALS["too-many-items"].says).toMatch(/second directory/i);
  });

  it("bounds how much of the index one voice may be", () => {
    // A person with forty published collections has made the index theirs,
    // and an index one voice dominates is a staff-picks page wearing
    // somebody else's name.
    expect(MAX_LIVE_COLLECTIONS_PER_CURATOR).toBeGreaterThan(1);
    expect(MAX_LIVE_COLLECTIONS_PER_CURATOR).toBeLessThanOrEqual(25);
  });

  it("has a retired state, so a shared link does not become somebody else's page", () => {
    expect(COLLECTION_STATES).toEqual(["draft", "published", "retired"]);
  });
});

describe("what the surfaces say", () => {
  it("states the exception plainly on the index", () => {
    // A reader arriving from a directory that has spent five sub-epics
    // promising no thumb on the scale deserves to be told, in the first
    // line, that this page is different and why that is allowed.
    expect(COLLECTIONS_MEANING).toMatch(/somebody's opinion/i);
    expect(COLLECTIONS_MEANING).toMatch(/whose it is/i);
  });

  it("says the order is the curator's and the reader cannot change it", () => {
    expect(COLLECTION_PROVENANCE_NOTE).toMatch(/nothing here is ranked by us/i);
    expect(COLLECTION_PROVENANCE_NOTE).toMatch(/nothing you do changes the order/i);
  });

  it("explains an empty collection instead of looking broken", () => {
    // Same argument LC3's empty board makes: a page with nothing on it reads
    // as a failure unless it says why.
    //
    // VC0 MOVED THE EXPLANATION, IT DID NOT REMOVE IT. The fact is now one
    // sentence and the reasoning sits behind a "Why?" disclosure on the same
    // page — so this assertion follows it rather than relaxing. The property
    // it guards is unchanged: the page still says why.
    expect(COLLECTION_EMPTY_WHY).toMatch(/unpublished or delisted/i);
    expect(COLLECTION_EMPTY_WHY).toMatch(/reappear/i);
    expect(COLLECTIONS_EMPTY_WHY).toMatch(/people who have listed something/i);
  });

  it("names no individual in any published copy", () => {
    for (const copy of [
      COLLECTIONS_MEANING,
      COLLECTION_PROVENANCE_NOTE,
      COLLECTION_EMPTY_NOTE,
      COLLECTIONS_EMPTY_NOTE,
      CURATOR_NOTE,
    ]) {
      expect(copy).not.toMatch(/usr_|@[a-z]/i);
    }
  });
});
