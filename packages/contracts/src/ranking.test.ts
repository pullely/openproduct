// The published orders (openproduct-commons DS4).
//
// WHAT THESE TESTS ARE ACTUALLY DEFENDING is a promise made at
// `/docs/formulas`: that a reader holding the same catalog document can
// reproduce the order they are looking at. Every assertion here corresponds
// to a clause in a published sentence, and a change that makes one of them
// fail is a change that makes a published sentence false — which is a
// different and worse kind of bug than a wrong sort.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FORMULAS } from "./provenance.js";
import {
  MOST_ACTIVE_FOLD,
  byMostActive,
  byNewest,
  mergesOf,
  mostActiveKeyOf,
  mostActiveScoreOf,
  recentEndorsementsOf,
} from "./ranking.js";
import type { PublicProfileCard, PublicMetric } from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function metric(key: string, value: number): PublicMetric {
  return { key, value, observedAt: "2026-08-25T00:00:00.000Z", state: "fresh" };
}

function card(
  slug: string,
  over: Partial<PublicProfileCard> & { merges?: number | null; upvotes?: number } = {},
): PublicProfileCard {
  const { merges, upvotes, ...rest } = over;
  return {
    slug,
    tagline: null,
    stack: [],
    stackCanonical: [],
    category: "devtools",
    hosting: null,
    pricing: null,
    licence: null,
    roleOpeningCount: 0,
    openingCommitments: ["none-open"],
    hasLiveUrl: false,
    indexable: true,
    publishedAt: "2026-01-01T00:00:00.000Z",
    // ABSENT, not zero, when `merges` is not given — which is the fixture
    // shape most of this file depends on.
    metrics: [
      ...(merges === undefined || merges === null ? [] : [metric("merges.7d", merges)]),
      ...(upvotes === undefined ? [] : [metric("endorsements.7d", upvotes)]),
    ],
    thumbnail: null,
    ...rest,
  };
}

describe("mergesOf — absence is not zero (OPC-C)", () => {
  it("reads the observed value when there is one", () => {
    expect(mergesOf(card("a", { merges: 7 }))).toBe(7);
  });

  it("answers NULL, not 0, when nobody has looked", () => {
    // The distinction the whole order rests on. A project nobody has measured
    // has not told us it is inactive, and a `0` here would silently give a
    // live project a dead one's position on the strength of our own failure
    // to observe it.
    expect(mergesOf(card("a"))).toBeNull();
  });

  it("distinguishes an OBSERVED zero from an unobserved one", () => {
    // A repository someone looked at and found quiet is a real fact, and it
    // outranks a repository nobody looked at.
    const observedQuiet = card("quiet", { merges: 0 });
    const unmeasured = card("unknown");
    expect(mergesOf(observedQuiet)).toBe(0);
    expect(mergesOf(unmeasured)).toBeNull();
    expect(byMostActive(observedQuiet, unmeasured)).toBeLessThan(0);
  });
});

describe("sort.most-active — every clause of the published sentence", () => {
  const sentence = FORMULAS["sort.most-active"].sentence;

  it("orders by observed merges, highest first", () => {
    expect(sentence).toMatch(/highest first/);
    const rows = [card("low", { merges: 1 }), card("high", { merges: 9 })].sort(byMostActive);
    expect(rows.map((c) => c.slug)).toEqual(["high", "low"]);
  });

  it("puts the UNMEASURED last, never interleaved as zero", () => {
    expect(sentence).toMatch(/not observed are ordered last, never as zero/);
    const rows = [
      card("unmeasured"),
      card("quiet", { merges: 0 }),
      card("busy", { merges: 4 }),
    ].sort(byMostActive);
    expect(rows.map((c) => c.slug)).toEqual(["busy", "quiet", "unmeasured"]);
  });

  it("breaks ties by sort.newest, and orders the unmeasured that way too", () => {
    expect(sentence).toMatch(/when they were published, most recent first/);
    const rows = [
      card("old-tie", { merges: 3, publishedAt: "2026-01-01T00:00:00.000Z" }),
      card("new-tie", { merges: 3, publishedAt: "2026-06-01T00:00:00.000Z" }),
      card("old-none", { publishedAt: "2026-02-01T00:00:00.000Z" }),
      card("new-none", { publishedAt: "2026-07-01T00:00:00.000Z" }),
    ].sort(byMostActive);
    // NOT alphabetical. On a young catalog almost nothing is observed, so an
    // alphabetical fallback would make the default order an accident of
    // naming — `zzz-queue` last forever for a reason nobody published.
    expect(rows.map((c) => c.slug)).toEqual(["new-tie", "old-tie", "new-none", "old-none"]);
  });

  it("is a total order — sorting is stable whatever order it starts in", () => {
    const rows = [
      card("a", { merges: 5, publishedAt: "2026-03-01T00:00:00.000Z" }),
      card("b", { publishedAt: "2026-04-01T00:00:00.000Z" }),
      card("c", { merges: 5, publishedAt: "2026-05-01T00:00:00.000Z" }),
      card("d", { merges: 1, publishedAt: "2026-06-01T00:00:00.000Z" }),
    ];
    const forward = [...rows].sort(byMostActive).map((c) => c.slug);
    const backward = [...rows].reverse().sort(byMostActive).map((c) => c.slug);
    expect(forward).toEqual(backward);
  });
});

describe("sort.most-active is a product — work AND interest (openproduct-open-builds OB3)", () => {
  const sentence = FORMULAS["sort.most-active"].sentence;

  it("is (merges + 1) × (upvotes + 1), and the sentence says so", () => {
    expect(sentence).toMatch(/Merged changes times counted upvotes over the trailing seven days, each plus one/);
    expect(mostActiveScoreOf(card("a", { merges: 4, upvotes: 2 }))).toBe(15);
    expect(mostActiveScoreOf(card("a", { merges: 0, upvotes: 0 }))).toBe(1);
  });

  it("needs both: steady work people want beats either one alone", () => {
    const rows = [
      card("all-work", { merges: 30, upvotes: 0 }), // 31
      card("all-hype", { merges: 0, upvotes: 30 }), // 31
      card("both", { merges: 6, upvotes: 5 }), // 42
    ].sort(byMostActive);
    expect(rows[0]!.slug).toBe("both");
  });

  it("breaks an equal score by MORE merged changes, then newest", () => {
    expect(sentence).toMatch(/Ties go to more merged changes, then to the more recently published build/);
    const rows = [
      card("hype", { merges: 1, upvotes: 5, publishedAt: "2026-06-01T00:00:00.000Z" }), // 12
      card("work", { merges: 5, upvotes: 1, publishedAt: "2026-01-01T00:00:00.000Z" }), // 12
    ].sort(byMostActive);
    expect(rows.map((c) => c.slug)).toEqual(["work", "hype"]);
  });

  it("ranks a build whose upvotes are not counted yet on its changes alone — never pushes it down", () => {
    expect(sentence).toMatch(/upvotes have not been counted yet is ranked on its changes alone/);
    expect(recentEndorsementsOf(card("a", { merges: 3 }))).toBe(0);
    expect(mostActiveScoreOf(card("a", { merges: 3 }))).toBe(4);
  });

  it("gives an unobserved build NO score however many upvotes it has — last, never zero", () => {
    expect(mostActiveScoreOf(card("loud", { upvotes: 400 }))).toBeNull();
    const rows = [card("loud", { upvotes: 400 }), card("quiet", { merges: 0 })].sort(byMostActive);
    expect(rows.map((c) => c.slug)).toEqual(["quiet", "loud"]);
  });

  it("folds score and changes into one key that sorts exactly like the pair", () => {
    const a = card("a", { merges: 5, upvotes: 1 }); // 12, 5
    const b = card("b", { merges: 1, upvotes: 5 }); // 12, 1
    const c = card("c", { merges: 0, upvotes: 12 }); // 13, 0
    expect(mostActiveKeyOf(a)).toBe(12 * MOST_ACTIVE_FOLD + 5);
    expect(mostActiveKeyOf(c)! > mostActiveKeyOf(a)!).toBe(true);
    expect(mostActiveKeyOf(a)! > mostActiveKeyOf(b)!).toBe(true);
    // A malformed count can never reach into the next score.
    expect(mostActiveKeyOf(card("x", { merges: 5000 }))! % MOST_ACTIVE_FOLD).toBe(MOST_ACTIVE_FOLD - 1);
  });
});

describe("sort.newest", () => {
  it("is most recent first, and an unpublished listing sorts last", () => {
    const rows = [
      card("none", { publishedAt: null }),
      card("old", { publishedAt: "2026-01-01T00:00:00.000Z" }),
      card("new", { publishedAt: "2026-08-01T00:00:00.000Z" }),
    ].sort(byNewest);
    expect(rows.map((c) => c.slug)).toEqual(["new", "old", "none"]);
  });
});

describe("the comparators carry no behavioural signal", () => {
  it("takes no subject, session, actor or history", () => {
    // WAS PART OF `similar.same-category-then-active`'s suite, and outlived it.
    // PV2 replaced `similarTo` with `alternativesFor` (its own guard lives in
    // `alternatives.test.ts`), but these two comparators still order the
    // DIRECTORY — which is the bigger surface, and the one where a
    // "personalised boost" would most naturally be smuggled in.
    const source = readFileSync(resolve(HERE, "ranking.ts"), "utf-8");
    for (const fn of ["byMostActive", "byNewest"] as const) {
      const sig = new RegExp(`export function ${fn}\\(([^)]*)\\)`).exec(source)![1]!;
      expect(sig).not.toMatch(/subject|viewer|session|actor|history/i);
    }
  });
});
