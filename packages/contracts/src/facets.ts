// The facet taxonomy (openproduct-commons CT0, realising CT-1).
//
// The reference design's rail asks seven questions of every product and puts
// a count beside each answer. A count is only worth printing if the thing it
// counts is the same thing every time — which is the entire argument for a
// vocabulary, and the entire argument against the free-form `stack` JSONB
// that ships today, where `TypeScript`, `typescript` and `TS` are three
// facets and one language.
//
// THE VOCABULARY LIVES HERE, IN THE CONTRACT, and CT1 syncs it into
// `openproduct.facet_values` for the count join. One source of truth, typed,
// diffable in review, and readable by the docs page (OPC-9) — rather than a
// SQL seed block that drifts from whatever the API claims.
//
// CLOSED, WITH ONE OPEN TAIL. Five groups are closed enumerations: a listing
// picks from a list, and the list is short enough to argue about in a review.
// `stack` is open, because our list of languages will always be behind
// somebody's — but every entry is canonicalised at write time, and an entry
// that does not resolve is KEPT as the maintainer's authored text and never
// becomes a facet. Nobody is blocked by our vocabulary; nothing unrecognised
// pollutes a count.

/** How a facet's values get onto a listing. */
export type FacetKind = "assigned" | "derived";
export type FacetCardinality = "single" | "multi";

export interface FacetValue {
  readonly value: string;
  readonly label: string;
  /** Lower-cased spellings that resolve to this value. */
  readonly aliases?: readonly string[];
}

export interface FacetGroup {
  readonly id: string;
  readonly label: string;
  readonly kind: FacetKind;
  readonly cardinality: FacetCardinality;
  /** Rendered on the docs page, so a reader can find out what a facet counts. */
  readonly description: string;
  readonly values: readonly FacetValue[];
}

// ---------------------------------------------------------------------------
// Assigned — a maintainer picks these, and a column holds them
// ---------------------------------------------------------------------------

const CATEGORY: FacetGroup = {
  id: "category",
  label: "Category",
  kind: "assigned",
  cardinality: "single",
  description:
    "What kind of product this is. One per listing, picked by its maintainers. Deliberately coarse: a taxonomy fine enough to be precise is one nobody navigates.",
  values: [
    { value: "dev-tools", label: "Dev tools", aliases: ["devtools", "developer-tools"] },
    { value: "infrastructure", label: "Infrastructure", aliases: ["infra", "devops"] },
    { value: "data", label: "Data", aliases: ["analytics", "database"] },
    { value: "security", label: "Security", aliases: ["infosec", "privacy"] },
    { value: "civic", label: "Civic", aliases: ["govtech", "public-sector"] },
    { value: "education", label: "Education", aliases: ["edtech", "learning"] },
    { value: "health", label: "Health", aliases: ["healthtech", "medical"] },
    { value: "communication", label: "Communication", aliases: ["messaging", "email"] },
    { value: "media", label: "Media", aliases: ["audio", "video", "publishing"] },
    { value: "productivity", label: "Productivity", aliases: ["notes", "tasks"] },
    { value: "commerce", label: "Commerce", aliases: ["payments", "fintech", "finance"] },
    { value: "science", label: "Science", aliases: ["research", "scientific"] },
    { value: "hardware", label: "Hardware", aliases: ["iot", "embedded"] },
    { value: "other", label: "Other" },
  ],
};

const LICENCE: FacetGroup = {
  id: "licence",
  label: "Licence",
  kind: "assigned",
  cardinality: "single",
  description:
    "The licence observed on the linked repository at publish — not a maintainer's claim. `No licence detected` is a real answer and is shown as one: what a product is licensed under is information a reader wants, and this directory does not adjudicate which licences are acceptable (see 'What qualifies' on this page).",
  values: [
    { value: "mit", label: "MIT" },
    { value: "apache-2-0", label: "Apache-2.0", aliases: ["apache-2.0", "apache2", "apache"] },
    { value: "agpl-3-0", label: "AGPL-3.0", aliases: ["agpl-3.0", "agpl", "agplv3"] },
    { value: "gpl-3-0", label: "GPL-3.0", aliases: ["gpl-3.0", "gpl", "gplv3"] },
    { value: "lgpl-3-0", label: "LGPL-3.0", aliases: ["lgpl-3.0", "lgpl"] },
    { value: "bsd-3-clause", label: "BSD-3-Clause", aliases: ["bsd-3", "bsd"] },
    { value: "mpl-2-0", label: "MPL-2.0", aliases: ["mpl-2.0", "mpl", "mozilla"] },
    { value: "unlicense", label: "The Unlicense", aliases: ["unlicence", "public-domain"] },
    { value: "source-available", label: "Source-available", aliases: ["bsl", "elastic", "sspl"] },
    { value: "none-detected", label: "No licence detected", aliases: ["none", "unlicensed"] },
    { value: "other", label: "Other" },
  ],
};

const HOSTING: FacetGroup = {
  id: "hosting",
  label: "Hosting",
  kind: "assigned",
  cardinality: "single",
  description:
    "Where the product runs for the person using it. The question a reader is actually asking is 'can I run this myself, and do I have to?'",
  values: [
    {
      value: "self-hosted",
      label: "Self-hosted",
      aliases: ["selfhosted", "on-prem", "on-premise"],
    },
    {
      value: "managed-service",
      label: "Managed service",
      aliases: ["saas", "hosted", "cloud"],
    },
    {
      value: "local-first",
      label: "Local-first",
      aliases: ["localfirst", "offline", "on-device"],
    },
  ],
};

const STACK: FacetGroup = {
  id: "stack",
  label: "Stack",
  kind: "assigned",
  cardinality: "multi",
  description:
    "What it is built with, canonicalised so a count means one thing. A maintainer may write anything; entries this vocabulary does not recognise stay on the page in their own words and are not counted.",
  values: [
    { value: "typescript", label: "TypeScript", aliases: ["ts"] },
    { value: "javascript", label: "JavaScript", aliases: ["js", "ecmascript"] },
    { value: "python", label: "Python", aliases: ["py", "python3"] },
    { value: "go", label: "Go", aliases: ["golang"] },
    { value: "rust", label: "Rust", aliases: ["rs"] },
    { value: "swift", label: "Swift" },
    { value: "kotlin", label: "Kotlin", aliases: ["kt"] },
    { value: "java", label: "Java" },
    { value: "csharp", label: "C#", aliases: ["c-sharp", "cs", "dotnet", ".net"] },
    { value: "ruby", label: "Ruby", aliases: ["rb"] },
    { value: "php", label: "PHP" },
    { value: "elixir", label: "Elixir", aliases: ["ex"] },
    { value: "erlang", label: "Erlang" },
    { value: "scala", label: "Scala" },
    { value: "haskell", label: "Haskell", aliases: ["hs"] },
    { value: "clojure", label: "Clojure" },
    { value: "c", label: "C" },
    { value: "cpp", label: "C++", aliases: ["c-plus-plus", "cplusplus"] },
    { value: "zig", label: "Zig" },
    { value: "lua", label: "Lua" },
    { value: "dart", label: "Dart" },
    { value: "sql", label: "SQL" },
    { value: "postgres", label: "Postgres", aliases: ["postgresql", "pg"] },
    { value: "sqlite", label: "SQLite" },
    { value: "mysql", label: "MySQL", aliases: ["mariadb"] },
    { value: "duckdb", label: "DuckDB" },
    { value: "redis", label: "Redis" },
    { value: "mongodb", label: "MongoDB", aliases: ["mongo"] },
    { value: "clickhouse", label: "ClickHouse" },
    { value: "react", label: "React" },
    { value: "nextjs", label: "Next.js", aliases: ["next", "next-js"] },
    { value: "vue", label: "Vue", aliases: ["vuejs", "vue-js"] },
    { value: "svelte", label: "Svelte", aliases: ["sveltekit"] },
    { value: "astro", label: "Astro" },
    { value: "angular", label: "Angular" },
    { value: "solid", label: "SolidJS", aliases: ["solidjs"] },
    { value: "htmx", label: "htmx" },
    { value: "tailwind", label: "Tailwind CSS", aliases: ["tailwindcss"] },
    { value: "node", label: "Node.js", aliases: ["nodejs", "node-js"] },
    { value: "deno", label: "Deno" },
    { value: "bun", label: "Bun" },
    { value: "django", label: "Django" },
    { value: "rails", label: "Rails", aliases: ["ruby-on-rails"] },
    { value: "laravel", label: "Laravel" },
    { value: "phoenix", label: "Phoenix" },
    { value: "fastapi", label: "FastAPI" },
    { value: "terraform", label: "Terraform", aliases: ["tf", "opentofu"] },
    { value: "docker", label: "Docker" },
    { value: "kubernetes", label: "Kubernetes", aliases: ["k8s"] },
    { value: "workers", label: "Cloudflare Workers", aliases: ["cloudflare-workers", "workerd"] },
    { value: "wasm", label: "WebAssembly", aliases: ["webassembly"] },
    { value: "graphql", label: "GraphQL" },
    { value: "mdx", label: "MDX" },
    { value: "latex", label: "LaTeX", aliases: ["tex"] },
    { value: "vitest", label: "Vitest" },
    { value: "jest", label: "Jest" },
    { value: "playwright", label: "Playwright" },
  ],
};

// ---------------------------------------------------------------------------
// Derived — nothing is stored; these are computed into facet_counts
// ---------------------------------------------------------------------------

const OPENINGS: FacetGroup = {
  id: "openings",
  label: "Openings",
  kind: "derived",
  cardinality: "multi",
  description:
    "What kind of commitment this listing's open contributor roles ask for, taken from the openings themselves. A contributor choosing where to spend an evening is asking this question, not 'how many roles are open'.",
  values: [
    { value: "occasional", label: "Occasional" },
    { value: "one-evening-a-week", label: "One evening a week" },
    { value: "a-few-hours-a-week", label: "A few hours a week" },
    { value: "two-reviews-a-week", label: "A couple of reviews a week" },
    { value: "project-shaped", label: "Project-shaped" },
    { value: "on-demand", label: "On demand" },
    { value: "none-open", label: "Nothing open" },
  ],
};

const ACTIVITY: FacetGroup = {
  id: "activity",
  label: "Activity",
  kind: "derived",
  cardinality: "single",
  description:
    "How recently work landed, from the linked repository. `Not observed` is its own bucket and is not a synonym for quiet: a listing whose repository we cannot read has not told us it is inactive.",
  values: [
    { value: "this-week", label: "Active this week" },
    { value: "this-month", label: "Active this month" },
    { value: "quiet", label: "Quiet" },
    { value: "not-observed", label: "Not observed" },
  ],
};

const TEAM_SIZE: FacetGroup = {
  id: "team_size",
  label: "Team size",
  kind: "derived",
  cardinality: "single",
  description:
    "How many people are confirmed on this listing — maintainers and contributors who both were named and agreed to appear. Unconfirmed entries are not counted.",
  values: [
    { value: "solo", label: "Solo" },
    { value: "2-3", label: "2–3" },
    { value: "4-10", label: "4–10" },
    { value: "11-30", label: "11–30" },
    { value: "30-plus", label: "More than 30" },
  ],
};

/**
 * PP3 — pricing, as one enumerated field.
 *
 * WHAT IT DESCRIBES IS THE LISTED PRODUCT, in its maintainers' words: this
 * estate takes no money and verifies no price. Four values, because the
 * question a reader asks is "what will this cost me to use", and the honest
 * answers to that are these four and not a number — a number is a claim
 * about a page this product does not control and cannot keep current.
 *
 * `self-host` IS A PRICING ANSWER, NOT A HOSTING ONE, and the two facets
 * overlap on purpose: `hosting: self-hosted` says where it runs; `pricing:
 * self-host` says the product is free to run yourself and paid to have run
 * for you. A listing can be one without the other.
 */
const PRICING: FacetGroup = {
  id: "pricing",
  label: "Pricing",
  kind: "assigned",
  cardinality: "single",
  description:
    "What using the product costs, as its maintainers describe it. Nothing here is a price this directory charges or checks.",
  values: [
    { value: "free", label: "Free", aliases: ["gratis", "no-cost"] },
    {
      value: "open-core",
      label: "Open core",
      aliases: ["opencore", "freemium", "open_core"],
    },
    { value: "paid", label: "Paid", aliases: ["commercial", "subscription"] },
    {
      value: "self-host",
      label: "Free to self-host",
      aliases: ["selfhost", "self-hosted-free", "free-self-hosted"],
    },
  ],
};

/** The rail's order, exactly as the reference design draws it. PP3 adds
 *  pricing at the end, beside the other assigned facet. */
export const FACETS: readonly FacetGroup[] = [
  CATEGORY,
  STACK,
  LICENCE,
  OPENINGS,
  ACTIVITY,
  TEAM_SIZE,
  HOSTING,
  PRICING,
];

export type FacetId = (typeof FACETS)[number]["id"];

export function facet(id: string): FacetGroup | null {
  return FACETS.find((f) => f.id === id) ?? null;
}

/** The facets a maintainer assigns — the only ones with a column behind them. */
export function assignedFacets(): readonly FacetGroup[] {
  return FACETS.filter((f) => f.kind === "assigned");
}

// ---------------------------------------------------------------------------
// Canonicalisation (CT-1)
// ---------------------------------------------------------------------------

/**
 * Fold a typed spelling to its comparison form: lower-cased, with runs of
 * anything that is not a letter or a digit collapsed to a single dash.
 *
 * `Next.js`, `next js`, `NEXT-JS` and `next_js` all fold to `next-js`, which
 * is what makes one alias entry cover a family of spellings instead of an
 * enumeration of them.
 */
export function foldSpelling(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve one typed entry to a canonical value, or null when this vocabulary
 * does not recognise it.
 *
 * Null is the IMPORTANT return. It means the maintainer's words stay on the
 * page exactly as written and simply never become a facet — which is the half
 * of CT-1 that keeps an open vocabulary from either blocking people or
 * poisoning the counts.
 */
export function canonicalise(facetId: string, input: string): string | null {
  const group = facet(facetId);
  if (!group) return null;
  const folded = foldSpelling(input);
  if (folded.length === 0) return null;
  for (const value of group.values) {
    if (foldSpelling(value.value) === folded) return value.value;
    if (foldSpelling(value.label) === folded) return value.value;
    for (const alias of value.aliases ?? []) {
      if (foldSpelling(alias) === folded) return value.value;
    }
  }
  return null;
}

/** What a resolved value is called on the page. */
export function labelOf(facetId: string, value: string): string | null {
  return facet(facetId)?.values.find((v) => v.value === value)?.label ?? null;
}

export interface CanonicalisedStack {
  /** Canonical values, de-duplicated, in the order first written. */
  readonly canonical: readonly string[];
  /** Entries this vocabulary did not recognise, verbatim as authored. */
  readonly unrecognised: readonly string[];
}

/**
 * Split an authored stack list into the half that can be counted and the half
 * that stays the maintainer's own words.
 *
 * Both halves survive: `canonical` goes to `profiles.stack_canonical` and
 * drives facets; the authored list stays in `profiles.stack` and is what the
 * page renders. A maintainer who writes something we have never heard of sees
 * it on their page, and nobody's count moves.
 */
export function canonicaliseStack(entries: readonly string[]): CanonicalisedStack {
  const canonical: string[] = [];
  const unrecognised: string[] = [];
  for (const entry of entries) {
    const resolved = canonicalise("stack", entry);
    if (resolved === null) {
      if (entry.trim().length > 0) unrecognised.push(entry);
      continue;
    }
    if (!canonical.includes(resolved)) canonical.push(resolved);
  }
  return { canonical, unrecognised };
}

// ---------------------------------------------------------------------------
// The derived facets (openproduct-commons DS1)
// ---------------------------------------------------------------------------
//
// `openings` and `activity` are DERIVED: nothing stores them, and they are
// computed from facts the public document already carries. That is why they
// live here rather than in a column — a derived facet with a column is a
// denormalised copy that drifts, and the thing it drifts from is the number
// on the page beside it.
//
// `team_size` is derived too and is deliberately NOT computed yet: it needs
// CG3's confirmed roster, and a team-size filter answered from the published
// maintainer list would count people who never agreed to appear (OPC-5).

/**
 * Fold an opening's authored commitment line to a facet value, or null.
 *
 * The line is free text a maintainer wrote — `a few hours a week · async`,
 * `One evening a week`, `~2 reviews/wk`. Null keeps their words on the page
 * and out of the counts, exactly as `canonicaliseStack` does: nobody is
 * blocked by our vocabulary, and nothing unrecognised pollutes a count.
 *
 * The match is on the FIRST segment before a separator, because the design's
 * own copy pairs a commitment with a mode (`· async`), and the mode is not a
 * commitment.
 */
export function canonicaliseCommitment(commitment: string | null): string | null {
  if (!commitment) return null;
  const head = commitment.split(/[·|,;]/)[0] ?? commitment;
  return canonicalise("openings", head);
}

/**
 * The `openings` facet values a listing holds.
 *
 * A listing with NO open roles holds `none-open`, which is a real answer
 * rather than an absence: "nothing open" is what a contributor filtering for
 * somewhere to help wants to exclude, and it can only be excluded if it is a
 * value. A listing whose roles are all unrecognised commitments holds
 * nothing, and is matched by no openings filter — the honest outcome, since
 * we genuinely do not know what it is asking for.
 */
export function openingsFacetValues(
  commitments: readonly (string | null)[],
): readonly string[] {
  if (commitments.length === 0) return ["none-open"];
  const out: string[] = [];
  for (const commitment of commitments) {
    const resolved = canonicaliseCommitment(commitment);
    if (resolved && !out.includes(resolved)) out.push(resolved);
  }
  return out;
}

/** The trailing windows the `activity` facet's buckets are measured over. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Which `activity` bucket a listing falls into, from its observed last-touch.
 *
 * `lastTouchedMs` IS ALLOWED TO BE NULL and that is the point of this
 * function: null returns `not-observed`, which is its own bucket and is not a
 * synonym for `quiet`. A listing whose repository we cannot read has not told
 * us it is inactive, and putting it in `quiet` would be this program making a
 * claim about somebody's project on the strength of not having looked.
 *
 * The caller passes the metric's own value rather than a boolean, so there is
 * no branch here that can be reached with a zero standing in for an absence.
 */
export function activityBucket(lastTouchedMs: number | null, now: number): string {
  if (lastTouchedMs === null) return "not-observed";
  const age = now - lastTouchedMs;
  if (age < WEEK_MS) return "this-week";
  if (age < MONTH_MS) return "this-month";
  return "quiet";
}
