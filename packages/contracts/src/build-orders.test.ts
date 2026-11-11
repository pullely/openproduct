// The front page's four orders (openproduct-open-builds OB4).

import { describe, expect, it } from "vitest";

import {
  BUILD_ORDERS,
  BUILD_ORDER_FORMULA,
  BUILD_ORDER_LABEL,
  BUILD_ORDER_SEGMENTS,
  buildOrderPath,
  buildsBelowFloor,
  buildsMeta,
  isBuildOrder,
  mostActiveRankOf,
  orderBuilds,
} from "./build-orders.js";
import { FORMULAS } from "./provenance.js";
import type { PublicMetric, PublicProfileCard } from "./index.js";

const metric = (key: string, value: number): PublicMetric => ({
  key,
  value,
  observedAt: "2026-10-14T00:00:00.000Z",
  state: "fresh",
});

/** A card that clears the floor unless told otherwise. */
function card(
  slug: string,
  over: { merges?: number; upvotes?: number; total?: number; roles?: number; publishedAt?: string; floor?: boolean } = {},
): PublicProfileCard {
  return {
    slug,
    tagline: over.floor === false ? null : "A thing, built in the open",
    stack: ["typescript"],
    stackCanonical: ["typescript"],
    category: "devtools",
    hosting: null,
    pricing: null,
    licence: "MIT",
    roleOpeningCount: over.roles ?? 0,
    openingCommitments: ["none-open"],
    hasLiveUrl: true,
    indexable: true,
    publishedAt: over.publishedAt ?? "2026-10-01T00:00:00.000Z",
    metrics: [
      ...(over.merges === undefined ? [] : [metric("merges.7d", over.merges)]),
      ...(over.upvotes === undefined ? [] : [metric("endorsements.7d", over.upvotes)]),
      ...(over.total === undefined ? [] : [metric("endorsements.total", over.total)]),
    ],
    thumbnail: null,
  } as PublicProfileCard;
}

describe("the four orders", () => {
  it("are Most active, Newest, Upvoted and Roles, Most active first", () => {
    expect([...BUILD_ORDERS]).toEqual(["most-active", "newest", "upvoted", "roles"]);
    expect(BUILD_ORDERS.map((o) => BUILD_ORDER_LABEL[o])).toEqual(["Most active", "Newest", "Upvoted", "Roles"]);
  });

  it("each names a published sentence", () => {
    for (const order of BUILD_ORDERS) {
      expect(FORMULAS[BUILD_ORDER_FORMULA[order]]).toBeDefined();
    }
    expect(FORMULAS["sort.roles"].sentence).toMatch(/How many roles a build has open does not move it/);
  });

  it("each lives at its own path, never a query string", () => {
    expect(buildOrderPath("most-active")).toBe("/");
    for (const order of BUILD_ORDER_SEGMENTS) {
      expect(buildOrderPath(order)).toBe(`/builds/${order}`);
      expect(buildOrderPath(order)).not.toContain("?");
    }
    expect(isBuildOrder("roles")).toBe(true);
    expect(isBuildOrder("trending")).toBe(false);
  });
});

describe("orderBuilds", () => {
  const rows = [
    card("busy", { merges: 9, upvotes: 0, total: 1, publishedAt: "2026-09-01T00:00:00.000Z" }),
    card("loved", { merges: 2, upvotes: 6, total: 40, roles: 2, publishedAt: "2026-09-10T00:00:00.000Z" }),
    card("fresh", { publishedAt: "2026-10-10T00:00:00.000Z" }),
    card("hiring", { merges: 1, upvotes: 0, total: 3, roles: 5, publishedAt: "2026-08-01T00:00:00.000Z" }),
    card("unfinished", { merges: 50, floor: false }),
  ];

  it("Most active is the product, and the unobserved go last", () => {
    // loved: 3 × 7 = 21; busy: 10 × 1 = 10; hiring: 2 × 1 = 2; fresh: unobserved.
    expect(orderBuilds(rows, "most-active").map((c) => c.slug)).toEqual(["loved", "busy", "hiring", "fresh"]);
  });

  it("Newest is first published, most recent first", () => {
    expect(orderBuilds(rows, "newest").map((c) => c.slug)).toEqual(["fresh", "loved", "busy", "hiring"]);
  });

  it("Upvoted is the all-time counted total", () => {
    expect(orderBuilds(rows, "upvoted").map((c) => c.slug)).toEqual(["loved", "hiring", "busy", "fresh"]);
  });

  it("Roles narrows to builds asking for people, in the Most active order — the count of roles moves nothing", () => {
    expect(orderBuilds(rows, "roles").map((c) => c.slug)).toEqual(["loved", "hiring"]);
  });

  it("the floor is a filter in every order: below it is absent, never pushed down", () => {
    for (const order of BUILD_ORDERS) {
      expect(orderBuilds(rows, order).map((c) => c.slug)).not.toContain("unfinished");
    }
    expect(buildsBelowFloor(rows)).toBe(1);
  });
});

describe("the count line", () => {
  it("says how many, in what order, and what the floor holds back", () => {
    expect(buildsMeta("most-active", 1)).toBe("1 build · most active first");
    expect(buildsMeta("newest", 4, 1)).toBe("4 builds · newest first · 1 more below the floor");
    expect(buildsMeta("most-active", 100, 3, 1204)).toBe("first 100 of 1,204 builds · most active first · 3 more below the floor");
    // `total` counts the withheld too, so it is not "first N of M" when the
    // only difference is the floor.
    expect(buildsMeta("roles", 4, 1, 5)).toBe("4 builds · with an open role, most active first · 1 more below the floor");
  });
});

describe("mostActiveRankOf — the build page's rank, read from the front page's order", () => {
  const rows = [
    card("busy", { merges: 9, upvotes: 0 }),
    card("loved", { merges: 2, upvotes: 6 }),
    card("fresh"),
    card("unfinished", { merges: 50, floor: false }),
  ];

  it("is the position on the front page's list", () => {
    expect(mostActiveRankOf(rows, "loved")).toBe(1);
    expect(mostActiveRankOf(rows, "busy")).toBe(2);
  });

  it("is null — a dash — for an unobserved build, one below the floor, and one not in the read", () => {
    expect(mostActiveRankOf(rows, "fresh")).toBeNull();
    expect(mostActiveRankOf(rows, "unfinished")).toBeNull();
    expect(mostActiveRankOf(rows, "elsewhere")).toBeNull();
  });
});
