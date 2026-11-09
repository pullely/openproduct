// The search index and its ordering (openproduct-commons DS0).
//
// TWO THINGS LIVE HERE AND THEY ARE HERE FOR DIFFERENT REASONS.
//
// THE BUILDER is here because of DS-1: the index is built from the catalog
// document and never from the profiles table. `buildProductIndex` takes
// `CatalogCard[]` — the PUBLIC projection — so a private field is not
// something a future edit has to remember to leave out. It is not in scope to
// be put in. That is a much stronger guarantee than a `SELECT` with a
// `WHERE visibility = 'public'`, which is correct only for as long as everyone
// who edits it remembers why it is there.
//
// THE RANKER is here because of OPC-4: no ordering ships without a sentence a
// person can read. That rules out `ts_rank`, which is a weighted black box —
// term frequency, document length normalisation and position weights combined
// by constants nobody in this program chose. So the DATABASE FINDS (an overlap
// test with no opinion about order) and THE CONTRACT RANKS, by a function
// whose every branch corresponds to a clause of `search.relevance` and which
// `/docs` publishes verbatim.
//
// THE TOKENISER IS SHARED between the two, deliberately and non-negotiably. A
// tokeniser used on only one side is how a search box stops matching documents
// it built itself: `Next.js` indexed as `next.js` and queried as `next`, `js`
// finds nothing, and nobody notices because the failure is silent.

import type { CatalogCard } from "./catalog-api.js";
import type { MediaThumbnail } from "./media.js";

/** What one row of the index holds. Every field is a copy of a public one. */
export interface IndexDocument {
  /** `product` today; CG1 adds `person`, LC3 may add `collection`. */
  readonly kind: string;
  /** The slug, or (from CG1) the handle. Stable, and the result's link. */
  readonly entityId: string;
  readonly title: string;
  readonly summary: string | null;
  readonly terms: readonly string[];
  /** Facet values, so a stack hit can become a facet selection with no second read. */
  readonly facets: Readonly<Record<string, readonly string[]>>;
}

/** What a search answers with. Ids and text the public read already returns. */
export interface SearchResult {
  readonly kind: string;
  readonly entityId: string;
  readonly title: string;
  readonly summary: string | null;
  /**
   * WHICH CLAUSE OF `search.relevance` PUT THIS HERE. Not decoration: an
   * ordering nobody can interrogate is the thing OPC-4 forbids, and a rank
   * that cannot say why it ranked is not interrogable in practice even when
   * its formula is published. A caller may render it; a reviewer can read it.
   */
  readonly matched: MatchClause;
  /**
   * A product hit's logo, for the row's tile; `null` for a listing without
   * one and for every non-product hit (openproduct-studio OSD3). Read after
   * the rank, in one batch — NEVER AN ORDERING INPUT.
   */
  readonly thumbnail: MediaThumbnail | null;
}

export const SEARCH_RESULT_KEYS = ["entityId", "kind", "matched", "summary", "thumbnail", "title"] as const;

/**
 * The clauses of `search.relevance`, strongest first. The numeric values ARE
 * the ordering — there is no separate scoring table to fall out of step with
 * this list.
 */
export const MATCH_CLAUSES = [
  "exact-name",
  "name-prefix",
  "name-contains",
  "facet-value",
  "summary-contains",
] as const;
export type MatchClause = (typeof MATCH_CLAUSES)[number];

const CLAUSE_RANK: Record<MatchClause, number> = {
  "exact-name": 0,
  "name-prefix": 1,
  "name-contains": 2,
  "facet-value": 3,
  "summary-contains": 4,
};

/**
 * Split text into matchable terms.
 *
 * Deliberately dumb, and deliberately the same on both sides. It lowercases,
 * splits on anything that is not a letter or a digit, and drops what is left
 * over one character. `Next.js` becomes `next`, `js`; `AGPL-3.0` becomes
 * `agpl`, `3`, `0`.
 *
 * NO STEMMING, NO STOPWORD LIST. Stemming without a published rule would put
 * an unexplainable step between what somebody typed and what they got, which
 * is the same objection OPC-4 makes to `ts_rank` — just smaller. A stopword
 * list would silently discard real product names (`the-registry`, `it`).
 */
export function tokenise(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/** The query's terms. The same function, so the two sides cannot disagree. */
export function queryTerms(query: string): string[] {
  return tokenise(query).slice(0, MAX_QUERY_TERMS);
}

/**
 * A query naming a hundred words is not a search, it is a way to make the
 * index scan every posting list it has. Extra words are dropped rather than
 * refused: the first few carry the intent.
 */
export const MAX_QUERY_TERMS = 12;

/** How many rows the candidate narrowing may return before ranking. */
export const MAX_CANDIDATES = 200;

/** How many results a query answers with. */
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 50;

/**
 * Build the product half of the index FROM THE CATALOG DOCUMENT (DS-1).
 *
 * The parameter type is the public projection. That is the guarantee: there is
 * no private field in scope here to leak, whatever anyone adds later.
 *
 * A listing with no terms at all is DROPPED rather than indexed empty — an
 * entity that can never match is a row that costs storage and returns nothing,
 * and the migration's CHECK refuses it anyway.
 */
export function buildProductIndex(cards: readonly CatalogCard[]): IndexDocument[] {
  const documents: IndexDocument[] = [];
  for (const card of cards) {
    const stack = [...card.stackCanonical.value];
    const category = card.category?.value ?? null;
    const hosting = card.hosting?.value ?? null;
    const pricing = card.pricing?.value ?? null;
    const licence = card.licence?.value ?? null;
    const tagline = card.tagline?.value ?? null;

    const facets: Record<string, string[]> = {};
    if (stack.length > 0) facets.stack = stack;
    if (category) facets.category = [category];
    if (hosting) facets.hosting = [hosting];
    if (pricing) facets.pricing = [pricing];
    if (licence) facets.licence = [licence.toLowerCase().replace(/\./g, "-")];

    const terms = new Set<string>();
    for (const source of [
      card.slug,
      tagline ?? "",
      ...stack,
      category ?? "",
      hosting ?? "",
      pricing ?? "",
    ]) {
      for (const term of tokenise(source)) terms.add(term);
    }
    if (terms.size === 0) continue;

    documents.push({
      kind: "product",
      entityId: card.slug,
      title: card.slug,
      summary: tagline,
      terms: [...terms].sort(),
      facets,
    });
  }
  return documents;
}

/** A candidate row, as the index stores it, plus the tiebreak the sort needs. */
export interface Candidate extends IndexDocument {
  /** Merged changes in the trailing week, or null when not observed. */
  readonly activity: number | null;
}

/**
 * `search.relevance`, in code.
 *
 * EVERY BRANCH IS A CLAUSE OF THE PUBLISHED SENTENCE, in the same order:
 *
 *   the exact name first, then a name that starts with the words, then a name
 *   that contains them, then a stack or category value, then the tagline.
 *   Ties broken by merged changes in the trailing seven days, then
 *   alphabetically.
 *
 * NOTHING ABOUT WHO IS SEARCHING ENTERS THIS FUNCTION — it takes no subject,
 * no session, no history — and there is no popularity term. Both are
 * structural: a personalised order would end the shared cacheable document
 * (OPC-1), and a popularity term is the thing that cannot be defended to a
 * maintainer whose listing sank.
 */
export function rankSearch(
  candidates: readonly Candidate[],
  terms: readonly string[],
  limit: number = DEFAULT_SEARCH_LIMIT,
): SearchResult[] {
  if (terms.length === 0) return [];
  const joined = terms.join("");

  const scored: Array<{ result: SearchResult; rank: number; activity: number | null }> = [];
  for (const candidate of candidates) {
    const clause = clauseFor(candidate, terms, joined);
    if (!clause) continue;
    scored.push({
      result: {
        kind: candidate.kind,
        entityId: candidate.entityId,
        title: candidate.title,
        summary: candidate.summary,
        matched: clause,
        // Filled by the handler after the rank, in one batched read
        // (openproduct-studio OSD3) — the rank is pure and never sees it.
        thumbnail: null,
      },
      rank: CLAUSE_RANK[clause],
      activity: candidate.activity,
    });
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    // An unobserved listing sorts after an observed one at the same clause,
    // never as a zero — the same rule SN2 applies to the directory's order.
    // Never observed is not the same claim as observed to be quiet.
    const av = a.activity;
    const bv = b.activity;
    if (av !== bv) {
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    }
    return a.result.entityId.localeCompare(b.result.entityId);
  });

  return scored.slice(0, Math.max(0, limit)).map((s) => s.result);
}

/** The strongest clause this candidate satisfies, or null if it satisfies none. */
function clauseFor(
  candidate: Candidate,
  terms: readonly string[],
  joined: string,
): MatchClause | null {
  const title = candidate.title.toLowerCase();
  const titleTerms = tokenise(candidate.title);
  const titleJoined = titleTerms.join("");

  if (title === joined || titleJoined === joined) return "exact-name";
  if (titleJoined.startsWith(joined) || title.startsWith(terms[0]!)) return "name-prefix";
  if (terms.every((t) => titleJoined.includes(t))) return "name-contains";

  const facetValues = new Set<string>();
  for (const values of Object.values(candidate.facets)) {
    for (const value of values) for (const term of tokenise(value)) facetValues.add(term);
  }
  if (terms.every((t) => facetValues.has(t))) return "facet-value";

  const summaryTerms = new Set(tokenise(candidate.summary ?? ""));
  if (terms.every((t) => summaryTerms.has(t))) return "summary-contains";

  // The candidate came back from an OR over terms but satisfies no clause —
  // e.g. two words where each matches a different document. Dropped rather
  // than ranked last: a result that matched nothing the searcher typed
  // together is noise, and noise at the bottom of a short list is still noise.
  return null;
}

// ---------------------------------------------------------------------------
// The way out of an empty result (openproduct-commons DS4)
// ---------------------------------------------------------------------------

/**
 * The furthest a word may be from a catalog value and still be offered as
 * what the reader probably meant.
 *
 * ONE EDIT, and only for words long enough to make one edit meaningful. Two
 * would turn `rust` into `react` (three edits, but the same idea one step
 * further) and, worse, would start suggesting confidently to people who typed
 * something we genuinely do not have. A wrong suggestion is more expensive
 * than no suggestion: it tells a reader the catalog contains something it
 * does not, and they take our word for it.
 */
const NEAREST_MAX_DISTANCE = 1;

/** Below this, one edit is most of the word. `go` and `no` are not typos of
 *  each other, they are different words. */
const NEAREST_MIN_LENGTH = 4;

/**
 * What the reader probably meant, or null.
 *
 * Offered only when the search found NOTHING — a suggestion beside results is
 * second-guessing somebody who already got an answer. And it is a
 * SUGGESTION, rendered as a link they choose, never an automatic rewrite of
 * their query: silently searching for something other than what a person
 * typed is how a directory teaches them not to trust it.
 *
 * Ties are broken by the candidate's own sort order rather than by frequency,
 * so the answer is a function of the catalog's vocabulary and the reader's
 * word, and nothing else (OPC-4).
 */
export function nearestTerm(query: string, candidates: readonly string[]): string | null {
  const terms = queryTerms(query);
  if (terms.length !== 1) return null;
  const term = terms[0]!;
  if (term.length < NEAREST_MIN_LENGTH) return null;

  const pool = [...new Set(candidates.map((c) => c.toLowerCase()))].sort();
  let best: string | null = null;
  let bestDistance = NEAREST_MAX_DISTANCE + 1;
  for (const candidate of pool) {
    // An exact hit is not a suggestion — if the word is in the vocabulary and
    // the search still found nothing, the reader's problem is a filter, not a
    // spelling, and telling them to search for what they already searched for
    // is worse than saying nothing.
    if (candidate === term) return null;
    if (Math.abs(candidate.length - term.length) > NEAREST_MAX_DISTANCE) continue;
    const distance = editDistance(term, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= NEAREST_MAX_DISTANCE ? best : null;
}

/**
 * Levenshtein distance, bounded by `NEAREST_MAX_DISTANCE + 1`.
 *
 * Written out rather than pulled in: it is twenty lines, it runs over a
 * vocabulary of tens of values in the visitor's own browser, and a dependency
 * here would be a third-party package on the critical path of a page whose
 * entire design goal is that it is one cacheable document with no runtime
 * surprises.
 */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}
