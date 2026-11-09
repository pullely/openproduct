// Pricing, as an address (openproduct-worldclass-v2 PP3).
//
// One enumerated, authored field — free · open-core · paid · self-host — and
// a filter that is a path. What is pinned: the vocabulary is closed and
// canonicalised like the other assigned facets; the page's gate is the
// vocabulary; the count and the list are one filter (WC-7); and every
// sentence that renders the value says whose word it is.
import { describe, expect, it } from "vitest";

import { canonicalise, facet, labelOf } from "./facets.js";
import type { PublicProfileCard } from "./index.js";
import {
  PRICING_FACET,
  PRICING_MEANING,
  PRICING_PATH,
  PRICING_PROVENANCE_NOTE,
  cardsWithPricing,
  pricingLabel,
  pricingMeaning,
  pricingPath,
  pricingTally,
} from "./pricing.js";
import { COMPLETENESS_FIELDS } from "./completeness.js";
import { DIFFABLE_FIELDS, FIELD_CLASS } from "./snapshots.js";
import { PUBLIC_PROFILE_CARD_KEYS, PUBLIC_PROFILE_KEYS } from "./index.js";
import { CATALOG_CARD_KEYS } from "./catalog-api.js";

function card(slug: string, pricing: string | null): PublicProfileCard {
  return {
    slug,
    tagline: null,
    stack: [],
    stackCanonical: [],
    category: null,
    hosting: null,
    pricing,
    licence: null,
    roleOpeningCount: 0,
    openingCommitments: [],
    hasLiveUrl: false,
    indexable: true,
    publishedAt: "2026-09-01T00:00:00Z",
    metrics: [],
    thumbnail: null,
  };
}

describe("the vocabulary", () => {
  it("is four answers, assigned and single-valued, in the design's order", () => {
    const group = facet(PRICING_FACET);
    expect(group?.kind).toBe("assigned");
    expect(group?.cardinality).toBe("single");
    expect(group?.values.map((v) => v.value)).toEqual(["free", "open-core", "paid", "self-host"]);
  });

  it("canonicalises a maintainer's spelling and refuses what it does not know", () => {
    expect(canonicalise(PRICING_FACET, "Freemium")).toBe("open-core");
    expect(canonicalise(PRICING_FACET, "commercial")).toBe("paid");
    expect(canonicalise(PRICING_FACET, "$9/month")).toBeNull();
  });

  it("describes the listed product and never a price this directory charges", () => {
    expect(facet(PRICING_FACET)?.description).toMatch(/Nothing here is a price this directory charges/);
    expect(PRICING_MEANING).toMatch(/charges or checks/);
    expect(PRICING_PROVENANCE_NOTE).toMatch(/Stated by the maintainers/);
    expect(pricingMeaning("Free")).toMatch(/whose maintainers describe it as free/);
  });
});

describe("the address", () => {
  it("is a path under /pricing, encoded", () => {
    expect(PRICING_PATH).toBe("/pricing");
    expect(pricingPath("open-core")).toBe("/pricing/open-core");
  });

  it("the label is the gate: a value outside the vocabulary has none", () => {
    expect(pricingLabel("self-host")).toBe("Free to self-host");
    expect(pricingLabel("self-host")).toBe(labelOf(PRICING_FACET, "self-host"));
    expect(pricingLabel("cheap")).toBeNull();
  });
});

describe("the count is the list (WC-7)", () => {
  const cards = [card("a", "free"), card("b", "free"), card("c", "paid"), card("d", null)];

  it("filters by exact value, and an unanswered listing is on no page", () => {
    expect(cardsWithPricing(cards, "free").map((c) => c.slug)).toEqual(["a", "b"]);
    expect(cardsWithPricing(cards, "open-core")).toEqual([]);
  });

  it("tallies every value in the vocabulary's order, zeros included, and each count is its list's length", () => {
    const tally = pricingTally(cards);
    expect(tally.map((t) => [t.value, t.products])).toEqual([
      ["free", 2],
      ["open-core", 0],
      ["paid", 1],
      ["self-host", 0],
    ]);
    for (const entry of tally) {
      expect(entry.products).toBe(cardsWithPricing(cards, entry.value).length);
    }
  });
});

describe("one field, on every surface", () => {
  it("is in the card, the profile and the catalog key sets, and is authored and diffable", () => {
    expect(PUBLIC_PROFILE_CARD_KEYS).toContain("pricing");
    expect(PUBLIC_PROFILE_KEYS).toContain("pricing");
    expect(CATALOG_CARD_KEYS).toContain("pricing");
    expect(DIFFABLE_FIELDS).toContain("pricing");
    expect(FIELD_CLASS.pricing).toBe("authored");
    expect(COMPLETENESS_FIELDS).toContain("pricing");
  });
});
