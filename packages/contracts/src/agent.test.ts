// The agent surface's tool set (openproduct-worldclass AG1).
//
// Two things are pinned here and they are the milestone's two halves:
//
//   WC-9 — a tool's answer carries EXACTLY the API's fields, because the card
//          is passed through untouched. Asserted against a real answer rather
//          than against a list, so a tool that started reshaping cards fails
//          here even if somebody updated the list to match.
//
//   THE QUERY THIS AUDIENCE ACTUALLY HAS — "what launched in observability
//          this week, with a permissive licence and open issues" — answered
//          end to end over a fixture, because a filter that handles each
//          clause alone and not together is a filter nobody can use.

import { describe, expect, it } from "vitest";

import {
  AGENT_CARD_KEYS,
  AGENT_RESULT_DEFAULT,
  AGENT_RESULT_LIMIT,
  AGENT_TOOLS,
  PERMISSIVE_LICENCES,
  agentQueryRefusal,
  filterCatalog,
} from "./agent.js";
import { CATALOG_CARD_KEYS, type CatalogCard } from "./catalog-api.js";
import { FACETS } from "./facets.js";
import { authored, observed } from "./provenance.js";

const NOW = new Date("2026-09-07T12:00:00.000Z");
const AT = "2026-09-01T00:00:00.000Z";

function card(over: {
  slug: string;
  category?: string | null;
  stack?: string[];
  hosting?: string | null;
  pricing?: string | null;
  licence?: string | null;
  openRoles?: number;
  publishedAt?: string | null;
}): CatalogCard {
  return {
    slug: over.slug,
    tagline: authored("A product", "maintainer"),
    stack: authored(over.stack ?? [], "maintainer"),
    stackCanonical: authored(over.stack ?? [], "maintainer"),
    category: authored(over.category ?? null, "maintainer"),
    hosting: authored(over.hosting ?? null, "maintainer"),
    pricing: authored(over.pricing ?? null, "maintainer"),
    // PV0 corrected the source: the gateway reads the PUBLIC API from a URL a
    // maintainer typed, with no App. That is `declared_repo`.
    licence: observed(over.licence ?? null, "declared_repo", AT),
    language: observed(null, "declared_repo", AT),
    lastCommitAt: observed(null, "declared_repo", AT),
    openIssues: observed(null, "declared_repo", AT),
    openRoles: authored(over.openRoles ?? 0, "maintainer"),
    openingCommitments: authored([], "maintainer"),
    hasLiveUrl: authored(false, "maintainer"),
    indexable: observed(true, "linked_repo", AT),
    // MD0 — present and empty. Every listing's array is `[]` until MD1 gives
    // a maker somewhere to put a picture; the key is on the card anyway,
    // because a machine consumer that has to wait for our renderer is not a
    // first-class consumer.
    media: [],
    publishedAt: over.publishedAt === undefined ? AT : over.publishedAt,
    metrics: {},
  } as CatalogCard;
}

describe("WC-9 — one document, three consumers", () => {
  it("returns the card the API returns, field for field", () => {
    // THE STRONGEST FORM OF THIS IS A SHAPE, NOT A TEST: the tool passes the
    // card through. What the test does is refuse the day somebody reshapes
    // one — measured on a REAL answer, so updating a list cannot make it pass.
    const [only] = filterCatalog([card({ slug: "a" })], {}, NOW);
    expect(Object.keys(only!).sort()).toEqual([...CATALOG_CARD_KEYS].sort());
  });

  it("hands the machine the provenance too", () => {
    // A catalog that gives a machine numbers without saying whether a person
    // wrote them, something measured them or we computed them is a catalog of
    // assertions (OPC-2) — and a machine has less recourse than a reader.
    const [only] = filterCatalog([card({ slug: "a", licence: "MIT" })], {}, NOW);
    expect(only!.licence).toEqual({
      value: "MIT",
      // PV0 — `declared_repo`, not `linked_repo`. The gateway reads
      // api.github.com over the PUBLIC API from a URL a maintainer typed,
      // with no App and no custody of anything; `linked_repo` promises a read
      // through the platform's GitHub App, which this is not. The catalog had
      // been claiming the stronger source since it was written.
      provenance: { class: "observed", source: "declared_repo", observedAt: AT },
    });
  });

  it("declares the same key set the API pins", () => {
    expect(AGENT_CARD_KEYS).toBe(CATALOG_CARD_KEYS);
  });
});

describe("the query this audience actually has", () => {
  // "What launched in observability this week, with a permissive licence and
  // open issues." Every clause at once, over a corpus where each clause alone
  // would return something different.
  const CATEGORY = FACETS.find((g) => g.id === "category")!.values[0]!.value;
  const corpus = [
    // The answer.
    card({ slug: "hit", category: CATEGORY, licence: "Apache-2.0", openRoles: 2, publishedAt: "2026-09-05T00:00:00Z" }),
    // Right in every way but the category.
    card({ slug: "other-topic", category: null, licence: "MIT", openRoles: 1, publishedAt: "2026-09-05T00:00:00Z" }),
    // Right, but copyleft.
    card({ slug: "agpl", category: CATEGORY, licence: "AGPL-3.0", openRoles: 3, publishedAt: "2026-09-06T00:00:00Z" }),
    // Right, but nothing open.
    card({ slug: "closed", category: CATEGORY, licence: "MIT", openRoles: 0, publishedAt: "2026-09-06T00:00:00Z" }),
    // Right, but four months old.
    card({ slug: "old", category: CATEGORY, licence: "MIT", openRoles: 4, publishedAt: "2026-05-01T00:00:00Z" }),
    // Right, but nobody has read its licence.
    card({ slug: "unlicensed", category: CATEGORY, licence: null, openRoles: 1, publishedAt: "2026-09-06T00:00:00Z" }),
    // Right, but undated.
    card({ slug: "undated", category: CATEGORY, licence: "MIT", openRoles: 1, publishedAt: null }),
  ];

  it("answers it with exactly the listing that satisfies every clause", () => {
    const answer = filterCatalog(
      corpus,
      { category: CATEGORY, permissiveLicence: true, openRoles: true, publishedWithinDays: 7 },
      NOW,
    );
    expect(answer.map((c) => c.slug)).toEqual(["hit"]);
  });

  it("each clause alone would have let a different one through", () => {
    // The guard against a filter that passes because one clause happens to
    // exclude everything: every rejected listing is rejected by exactly one.
    const base = { category: CATEGORY, permissiveLicence: true, openRoles: true, publishedWithinDays: 7 } as const;
    const without = (drop: keyof typeof base) => {
      const q: Record<string, unknown> = { ...base };
      delete q[drop];
      return filterCatalog(corpus, q, NOW).map((c) => c.slug);
    };
    expect(without("permissiveLicence")).toEqual(["hit", "agpl", "unlicensed"]);
    expect(without("openRoles")).toEqual(["hit", "closed"]);
    // `undated` joins `old` here: the window is the only clause either fails,
    // and an undated listing is excluded BY the window rather than by having
    // an old date. Dropping it lets both back in, which is the point.
    expect(without("publishedWithinDays")).toEqual(["hit", "old", "undated"]);
    expect(without("category")).toEqual(["hit", "other-topic"]);
  });

  it("treats an unobserved licence as unanswered, not as permissive", () => {
    // A listing nobody has read the licence of does not belong in an answer
    // about licences — in either direction.
    expect(filterCatalog(corpus, { permissiveLicence: true }, NOW).map((c) => c.slug)).not.toContain(
      "unlicensed",
    );
  });

  it("treats an undated listing as undated, not as recent", () => {
    expect(filterCatalog(corpus, { publishedWithinDays: 3650 }, NOW).map((c) => c.slug)).not.toContain(
      "undated",
    );
  });

  it("reads the clock it is given, never its own", () => {
    // A window is a question about a moment. A function that decides its own
    // cannot be tested against a fixture and cannot be reasoned about at a
    // boundary.
    const later = new Date("2027-01-01T00:00:00.000Z");
    expect(filterCatalog(corpus, { publishedWithinDays: 7 }, later)).toEqual([]);
  });
});

describe("narrowing is over the published vocabulary, and nothing else", () => {
  it("refuses a value the vocabulary does not have, and says where to look", () => {
    // An agent that asks for a misspelt category and gets an empty list learns
    // that nothing is listed — which is false, and which it cannot tell apart
    // from the truth.
    const refusal = agentQueryRefusal({ category: "observabillity" });
    expect(refusal).toContain("observabillity");
    expect(refusal).toContain("list_facets");
  });

  it("refuses each group by its own name", () => {
    for (const [group, query] of [
      ["category", { category: "nope" }],
      ["stack", { stack: "nope" }],
      ["hosting", { hosting: "nope" }],
      ["pricing", { pricing: "nope" }],
    ] as const) {
      expect([group, agentQueryRefusal(query)?.includes(group)]).toEqual([group, true]);
    }
  });

  it("accepts every value the vocabulary does have", () => {
    const refused: string[] = [];
    for (const group of ["category", "stack", "hosting", "pricing"] as const) {
      for (const value of FACETS.find((g) => g.id === group)!.values) {
        if (agentQueryRefusal({ [group]: value.value }) !== null) refused.push(`${group}:${value.value}`);
      }
    }
    expect(refused).toEqual([]);
  });

  it("refuses a window that is not a window", () => {
    expect(agentQueryRefusal({ publishedWithinDays: 0 })).toContain("positive");
    expect(agentQueryRefusal({ publishedWithinDays: -1 })).toContain("positive");
  });

  it("passes an empty query", () => {
    expect(agentQueryRefusal({})).toBeNull();
  });
});

describe("an answer is bounded", () => {
  const many = Array.from({ length: 200 }, (_, at) => card({ slug: `p${at}` }));

  it("defaults to twenty and ceilings at fifty", () => {
    expect(filterCatalog(many, {}, NOW)).toHaveLength(AGENT_RESULT_DEFAULT);
    expect(filterCatalog(many, { limit: 500 }, NOW)).toHaveLength(AGENT_RESULT_LIMIT);
    expect(filterCatalog(many, { limit: 0 }, NOW)).toHaveLength(1);
  });

  it("keeps the document's own order and does not rank", () => {
    // Re-ranking here would be the second query layer WC-9 refuses, and one
    // nobody could check against `/docs/formulas`.
    expect(filterCatalog(many, { limit: 3 }, NOW).map((c) => c.slug)).toEqual(["p0", "p1", "p2"]);
  });
});

describe("permissive is a published set, not a guess", () => {
  it("names the licences rather than matching a substring", () => {
    // `AGPL-3.0` and `Apache-2.0` are on opposite sides of this question and
    // one character apart in several naive tests.
    expect(PERMISSIVE_LICENCES).toContain("Apache-2.0");
    expect(PERMISSIVE_LICENCES).not.toContain("AGPL-3.0");
    expect(PERMISSIVE_LICENCES).not.toContain("GPL-3.0");
  });

  it("puts the whole set in the tool's own description, so an agent can read it", () => {
    const tool = AGENT_TOOLS.find((t) => t.name === "list_products")!;
    const described = JSON.stringify(tool.inputSchema);
    for (const licence of PERMISSIVE_LICENCES) {
      expect([licence, described.includes(licence)]).toEqual([licence, true]);
    }
  });
});

describe("the tool set is small, named and closed", () => {
  it("is three tools, and they are these", () => {
    expect(AGENT_TOOLS.map((t) => t.name)).toEqual(["list_products", "get_product", "list_facets"]);
  });

  it("every tool has a schema an MCP client can read", () => {
    for (const tool of AGENT_TOOLS) {
      expect([tool.name, tool.inputSchema.type]).toEqual([tool.name, "object"]);
      expect([tool.name, tool.inputSchema.additionalProperties]).toEqual([tool.name, false]);
      expect(tool.description.length).toBeGreaterThan(60);
    }
  });

  it("every filter the schema offers is one the filter implements", () => {
    // A described argument nothing reads is a promise to an agent that the
    // product silently breaks.
    const offered = Object.keys(
      (AGENT_TOOLS[0]!.inputSchema.properties ?? {}) as Record<string, unknown>,
    ).sort();
    expect(offered).toEqual([
      "category",
      "hosting",
      "limit",
      "openRoles",
      "permissiveLicence",
      "pricing",
      "publishedWithinDays",
      "stack",
    ]);
  });
});
