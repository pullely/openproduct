// Alternatives (openproduct-worldclass PV2).
//
// Three things are pinned here, and they are the milestone's three claims:
//
//   THE REASON IS PER ROW and it is true — the sentence beside a listing
//   names what that listing actually shares, not what the panel is about.
//
//   TWO ABSENCES ARE NOT A MATCH. `null` licence is "nobody read it" (OPC-C),
//   and comparing two of them would manufacture a shared property out of two
//   dashes and print it on a public page.
//
//   NOTHING BEHAVIOURAL, NOTHING TEMPORAL. The order is a function of the two
//   listings and nothing else, so the panel is the same for every reader and
//   the same tomorrow — which is the property DS4's activity tiebreak did not
//   have.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ALTERNATIVES_LIMIT,
  alternativesFor,
  hasOverlap,
  overlapOf,
  overlapScore,
  overlapSentence,
} from "./alternatives.js";
import type { PublicProfileCard } from "./index.js";

function card(over: Partial<PublicProfileCard> & { slug: string }): PublicProfileCard {
  return {
    tagline: "A thing",
    stack: [],
    stackCanonical: [],
    category: null,
    hosting: null,
    licence: null,
    roleOpeningCount: 0,
    openingCommitments: [],
    hasLiveUrl: false,
    indexable: true,
    publishedAt: "2026-09-01T00:00:00.000Z",
    metrics: [],
    ...over,
  } as PublicProfileCard;
}

const SUBJECT = card({
  slug: "kettle",
  category: "dev-tools",
  stackCanonical: ["rust", "postgres"],
  licence: "MIT",
  hosting: "self-hosted",
});

describe("what two listings share", () => {
  it("names the topic, the stack, the licence and where it runs", () => {
    const overlap = overlapOf(
      SUBJECT,
      card({
        slug: "other",
        category: "dev-tools",
        stackCanonical: ["rust", "redis"],
        licence: "MIT",
        hosting: "self-hosted",
      }),
    );
    expect(overlap).toEqual({
      sameTopic: true,
      sharedStack: ["rust"],
      sameLicence: true,
      sameHosting: true,
    });
  });

  it("reads the CANONICAL stack, never the maintainer's own words", () => {
    // `stack` is what somebody typed and is not a vocabulary — two people
    // typing "Hand-rolled CRDT" is a coincidence, not an overlap. CT1's
    // canonical subset is the one both sides were folded into.
    const overlap = overlapOf(
      { ...SUBJECT, stack: ["Hand-rolled CRDT"] } as PublicProfileCard,
      card({ slug: "other", stack: ["Hand-rolled CRDT"], stackCanonical: [] }),
    );
    expect(overlap.sharedStack).toEqual([]);
  });
});

describe("two absences are not a match", () => {
  it("does not call two unread licences the same licence", () => {
    // THE BUG THIS MODULE WAS WRITTEN NOT TO HAVE. `null` is OPC-C's dash —
    // nobody read the repository — and calling two dashes a shared property
    // would print a sentence about a fact neither listing has.
    const overlap = overlapOf(card({ slug: "a", licence: null }), card({ slug: "b", licence: null }));
    expect(overlap.sameLicence).toBe(false);
  });

  it("does not call two unchosen topics the same topic", () => {
    // CT1: `null` category is "they have not answered", never a bucket.
    const overlap = overlapOf(card({ slug: "a", category: null }), card({ slug: "b", category: null }));
    expect(overlap.sameTopic).toBe(false);
  });

  it("does not call two unanswered hostings the same", () => {
    expect(overlapOf(card({ slug: "a" }), card({ slug: "b" })).sameHosting).toBe(false);
  });

  it("so two blank listings overlap in nothing at all", () => {
    const overlap = overlapOf(card({ slug: "a" }), card({ slug: "b" }));
    expect(hasOverlap(overlap)).toBe(false);
    expect(overlapScore(overlap)).toBe(0);
  });
});

describe("the sentence beside a row", () => {
  it("names the stack entries while they fit, and counts them when they do not", () => {
    const three = overlapOf(
      { ...SUBJECT, stackCanonical: ["rust", "postgres", "redis"] } as PublicProfileCard,
      card({ slug: "o", stackCanonical: ["rust", "postgres", "redis"] }),
    );
    expect(overlapSentence(three)).toBe("shares rust, postgres and redis");

    const four = overlapOf(
      { ...SUBJECT, stackCanonical: ["rust", "postgres", "redis", "nats"] } as PublicProfileCard,
      card({ slug: "o", stackCanonical: ["rust", "postgres", "redis", "nats"] }),
    );
    expect(overlapSentence(four)).toBe("shares 4 of its stack");
  });

  it("reads as one sentence when several things are shared", () => {
    const overlap = overlapOf(
      SUBJECT,
      card({
        slug: "o",
        category: "dev-tools",
        stackCanonical: ["rust"],
        licence: "MIT",
        hosting: "self-hosted",
      }),
    );
    expect(overlapSentence(overlap)).toBe(
      "same topic · shares rust · same licence · runs the same way",
    );
  });

  it("says only what is true — a topic-only overlap mentions nothing else", () => {
    const overlap = overlapOf(SUBJECT, card({ slug: "o", category: "dev-tools" }));
    expect(overlapSentence(overlap)).toBe("same topic");
  });
});

describe("the panel", () => {
  const catalog = [
    SUBJECT,
    // Three signals: topic, one stack entry, licence.
    card({ slug: "close", category: "dev-tools", stackCanonical: ["rust"], licence: "MIT" }),
    // One signal.
    card({ slug: "far", licence: "MIT" }),
    // Nothing at all.
    card({ slug: "unrelated" }),
    // Two signals, and alphabetically before `close` — the tiebreak guard.
    card({ slug: "acme", category: "dev-tools", licence: "MIT" }),
  ];

  it("orders by what is shared, most first", () => {
    expect(alternativesFor(catalog, "kettle").map((a) => a.card.slug)).toEqual([
      "close",
      "acme",
      "far",
    ]);
  });

  it("leaves out a listing that shares nothing, rather than filling a slot", () => {
    // Filling four slots with unrelated products would invent a relationship
    // in order to fill a sidebar.
    expect(alternativesFor(catalog, "kettle").map((a) => a.card.slug)).not.toContain("unrelated");
  });

  it("carries a reason on every row, and the reason is that row's own", () => {
    // The done-when: never an unexplained list.
    const answer = alternativesFor(catalog, "kettle");
    expect(answer.length).toBeGreaterThan(0);
    for (const entry of answer) {
      expect([entry.card.slug, entry.reason.length > 0]).toEqual([entry.card.slug, true]);
    }
    expect(answer.find((a) => a.card.slug === "far")!.reason).toBe("same licence");
  });

  it("breaks a tie alphabetically, so the panel is the same tomorrow", () => {
    // DS4 broke ties by observed activity, which meant a listing's neighbours
    // reshuffled whenever somebody else pushed a commit — a panel that moves
    // for reasons the page does not mention.
    const tied = [
      SUBJECT,
      card({ slug: "zebra", category: "dev-tools" }),
      card({ slug: "alpha", category: "dev-tools" }),
    ];
    expect(alternativesFor(tied, "kettle").map((a) => a.card.slug)).toEqual(["alpha", "zebra"]);
  });

  it("holds at four", () => {
    const many = [SUBJECT, ...Array.from({ length: 20 }, (_, at) =>
      card({ slug: `p${String(at).padStart(2, "0")}`, category: "dev-tools" }))];
    expect(alternativesFor(many, "kettle")).toHaveLength(ALTERNATIVES_LIMIT);
  });

  it("answers nothing for a slug the catalog does not hold", () => {
    expect(alternativesFor(catalog, "nobody")).toEqual([]);
  });

  it("never returns the listing itself", () => {
    expect(alternativesFor(catalog, "kettle").map((a) => a.card.slug)).not.toContain("kettle");
  });
});

describe("nothing behavioural, and nothing temporal", () => {
  it("takes no reader, no session and no clock", () => {
    // The same guard DS4's ranking carries, on the function that replaced it —
    // and one clause stronger, because this one must not read a clock either.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "alternatives.ts"), "utf-8");
    const signature = /export function alternativesFor\(([\s\S]*?)\):/.exec(source)![1]!;
    expect(signature).not.toMatch(/subject|viewer|session|actor|history|now|date/i);
    // And the comparator, which is where a popularity term would be smuggled.
    expect(source).not.toMatch(/publishedAt|metrics|byMostActive/);
  });
});
