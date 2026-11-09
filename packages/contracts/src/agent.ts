// The agent surface's tool set (openproduct-worldclass AG1).
//
// ─── ONE DOCUMENT, THREE CONSUMERS (WC-9) ─────────────────────────────────
//
// *"The badge, the public API and the MCP server are one distribution surface
// reading one document. Any field the badge renders or the MCP server returns
// that `GET /v1/products` cannot is a bug, and CI asserts it."*
//
// The strongest available form of that is not a test — it is a shape. These
// tools return the catalog card **verbatim**, `Fact` wrappers and all, so
// "every field is returnable by the API" is true by construction rather than
// by agreement. Nothing here reshapes, renames, flattens or summarises a
// card, and a test asserts that the key set a tool emits is exactly the key
// set the API pins.
//
// It also means an agent gets the provenance. A catalog that hands a machine
// numbers without saying whether a person wrote them, something measured them
// or we computed them is a catalog of assertions (OPC-2) — and a machine has
// less recourse than a reader, not more.
//
// ─── AND THE SERVER IS A CLIENT, NOT A SECOND QUERY LAYER ─────────────────
//
// design.md, AG: *"The MCP server is a client of `/v1/products` and
// `/v1/facets`, not a second query layer."* `/v1/products` accepts no query
// parameters and returns the whole catalog — so the filtering is HERE, over
// the document the API already served, as a pure function. There is no second
// SQL query, no second ordering, and nothing an agent can ask for that a
// reader of the same document could not compute.
//
// ─── THE QUERY THIS AUDIENCE ACTUALLY HAS ─────────────────────────────────
//
// The epic names it: *"what launched in observability this week, with a
// permissive licence and open issues."* Four filters — a category, a window, a
// licence class and whether anything is open — and the tool's arguments are
// those four and nothing invented beside them.

import { CATALOG_CARD_KEYS, type CatalogCard } from "./catalog-api.js";
import { facet } from "./facets.js";

export const AGENT_SERVER_NAME = "openproduct";

/**
 * WHAT "PERMISSIVE" MEANS, PUBLISHED.
 *
 * An agent asking for "a permissive licence" is asking a question this
 * product must answer the same way every time, and the audit's own query uses
 * the word — so it is a named set rather than a substring match on the SPDX
 * id, which would put `AGPL-3.0` and `Apache-2.0` on the same side of a `-3`.
 *
 * OPC-I is why this is a FILTER and not a verdict: this directory shows the
 * licence it observed and does not adjudicate which licences are acceptable.
 * A listing outside this set is not excluded from anything except a query
 * that asked for the set.
 */
export const PERMISSIVE_LICENCES: readonly string[] = [
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Unlicense",
  "Zlib",
  "MPL-2.0",
];

/** What a caller may narrow the catalog by. Every one is a facet the product
 *  already publishes, or a window over `publishedAt`. */
export interface AgentQuery {
  /** A `category` facet value — the same vocabulary `/topics` is built from. */
  readonly category?: string;
  /** A `stack` facet value, canonicalised. */
  readonly stack?: string;
  /** A `hosting` facet value. */
  readonly hosting?: string;
  /** PP3 — a `pricing` facet value, as the maintainers described it. */
  readonly pricing?: string;
  /** Only listings whose observed licence is in {@link PERMISSIVE_LICENCES}. */
  readonly permissiveLicence?: boolean;
  /** Only listings with at least one open role. */
  readonly openRoles?: boolean;
  /** Only listings published within this many days of `now`. */
  readonly publishedWithinDays?: number;
  /** At most this many cards. */
  readonly limit?: number;
}

/** The ceiling on one answer, and the default. A tool that can return four
 *  hundred cards returns four hundred cards into somebody's context window. */
export const AGENT_RESULT_LIMIT = 50;
export const AGENT_RESULT_DEFAULT = 20;

function facetHas(group: string, value: string): boolean {
  return facet(group)?.values.some((v) => v.value === value) ?? false;
}

/**
 * Is this a query the published vocabulary can answer?
 *
 * A value the vocabulary does not have is REFUSED rather than silently
 * matching nothing: an agent that asks for `category: "observabillity"` and
 * gets an empty list learns that nothing is listed, which is false and which
 * it cannot tell apart from the truth. The refusal names the group so the
 * next call can ask `list_facets`.
 */
export function agentQueryRefusal(query: AgentQuery): string | null {
  for (const [group, value] of [
    ["category", query.category],
    ["stack", query.stack],
    ["hosting", query.hosting],
    ["pricing", query.pricing],
  ] as const) {
    if (value !== undefined && !facetHas(group, value)) {
      return `Unknown ${group} value "${value}". Call list_facets for the published vocabulary.`;
    }
  }
  if (query.publishedWithinDays !== undefined && query.publishedWithinDays <= 0) {
    return "publishedWithinDays must be a positive number of days.";
  }
  return null;
}

/**
 * The catalog, narrowed.
 *
 * PURE, and it takes `now` rather than reading the clock: a window is a
 * question about a moment, and a function that decides its own moment cannot
 * be tested against a fixture and cannot be reasoned about at a boundary.
 *
 * ORDER IS THE DOCUMENT'S OWN. This does not sort. `/v1/products` publishes an
 * order and an agent asking a narrower question is not asking for a different
 * one — re-ranking here would be the second query layer WC-9 refuses, and it
 * would be one nobody could check against `/docs/formulas`.
 */
export function filterCatalog(
  cards: readonly CatalogCard[],
  query: AgentQuery,
  now: Date,
): readonly CatalogCard[] {
  const limit = Math.min(Math.max(query.limit ?? AGENT_RESULT_DEFAULT, 1), AGENT_RESULT_LIMIT);
  const since =
    query.publishedWithinDays === undefined
      ? null
      : now.getTime() - query.publishedWithinDays * 86_400_000;

  return cards
    .filter((card) => {
      if (query.category !== undefined && card.category.value !== query.category) return false;
      if (query.stack !== undefined && !card.stackCanonical.value.includes(query.stack)) return false;
      if (query.hosting !== undefined && card.hosting.value !== query.hosting) return false;
      if (query.pricing !== undefined && card.pricing.value !== query.pricing) return false;
      // A LISTING WITH NO OBSERVED LICENCE IS NOT PERMISSIVE, and it is not
      // non-permissive either: it is unanswered, and a query that asked for a
      // licence class excludes it. Treating `null` as a match would put a
      // listing nobody has read the licence of into an answer about licences.
      if (query.permissiveLicence === true) {
        const licence = card.licence.value;
        if (licence === null || !PERMISSIVE_LICENCES.includes(licence)) return false;
      }
      if (query.openRoles === true && card.openRoles.value < 1) return false;
      if (since !== null) {
        // Likewise: a listing with no publish date is not "recent". It is
        // undated, and a window is a claim about dates.
        if (card.publishedAt === null) return false;
        if (Date.parse(card.publishedAt) < since) return false;
      }
      return true;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

export interface AgentTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** JSON Schema, as the protocol wants it. */
  readonly inputSchema: Record<string, unknown>;
}

const QUERY_PROPERTIES: Record<string, unknown> = {
  category: {
    type: "string",
    description: "A category value from list_facets. A listing has exactly one.",
  },
  stack: {
    type: "string",
    description:
      "A stack value from list_facets, canonicalised. Matches a listing that carries it among several.",
  },
  hosting: { type: "string", description: "A hosting value from list_facets." },
  pricing: {
    type: "string",
    description:
      "A pricing value from list_facets — what the maintainers say using it costs, not a price this directory checks.",
  },
  permissiveLicence: {
    type: "boolean",
    description: `Only listings whose OBSERVED licence is one of: ${PERMISSIVE_LICENCES.join(", ")}. A listing whose licence was never observed is excluded — it is unanswered, not non-permissive.`,
  },
  openRoles: { type: "boolean", description: "Only listings with at least one open role." },
  publishedWithinDays: {
    type: "number",
    description: "Only listings published within this many days. A listing with no publish date is excluded.",
  },
  limit: {
    type: "number",
    description: `At most this many listings (default ${AGENT_RESULT_DEFAULT}, ceiling ${AGENT_RESULT_LIMIT}).`,
  },
};

export const AGENT_TOOLS: readonly AgentTool[] = [
  {
    name: "list_products",
    title: "List products",
    description:
      "Every published listing in the openproduct catalog, narrowed by the published facet vocabulary. Each field carries its provenance: whether a maintainer authored it, something observed it, or it was computed. Returns the catalog's own order — this tool does not rank.",
    inputSchema: { type: "object", properties: QUERY_PROPERTIES, additionalProperties: false },
  },
  {
    name: "get_product",
    title: "Get one product",
    description:
      "One listing by its slug, with its components, open roles and observed metrics. Unknown, unpublished and unreachable all answer the same way, deliberately.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "The listing's slug." } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "list_facets",
    title: "List facets",
    description:
      "The published vocabulary the catalog is filterable by: every group, every value, and what each group counts. Call this before narrowing a query — an unknown value is refused rather than silently matching nothing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/**
 * The fields a `list_products` answer may carry — which is exactly the API's,
 * because the card is passed through untouched.
 *
 * Exported so CI can assert WC-9 against a REAL answer rather than against
 * this list: the test shapes a card, runs it through the tool, and compares
 * the keys it comes back with to `CATALOG_CARD_KEYS`.
 */
export const AGENT_CARD_KEYS = CATALOG_CARD_KEYS;
