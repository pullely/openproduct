// Search (openproduct-commons DS0).
//
// TWO HALVES, AND THEY SIT ON OPPOSITE SIDES OF THE ACTOR BOUNDARY.
//
// The QUERY is on the public branch: no actor is resolved, nothing personal
// enters the order, and the response is the same for everyone — so it caches
// at the edge like every other public read (OPC-1). A personalised search
// order would be a second, uncacheable rendering of the catalog, and the
// overlay (XP2) is the only concession to per-visitor state this program
// makes.
//
// The REBUILD is internal and is not a public route at all. It is called by
// the scheduled sweep and by the write paths that change the document; a
// public read never triggers a write, because a read that writes is a read
// somebody can turn into a write amplifier by refreshing.
//
// THE BUILD READS THE CATALOG DOCUMENT, NOT THE PROFILES TABLE (DS-1). It
// calls `handleCatalogList`'s own projection helper — the same function that
// answers `GET /v1/products` — so the index's contents are, by construction,
// a subset of what a machine could already have fetched. There is no query in
// this file that touches `openproduct.profiles`.

import {
  MAX_CANDIDATES,
  MAX_SEARCH_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  SEARCH_MAKER_LIMIT,
  SEARCH_TOPIC_LIMIT,
  buildProductIndex,
  makerMatchField,
  matchTopics,
  queryTerms,
  rankSearch,
  type Candidate,
  type SearchMakerHit,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";

import { catalogCards } from "./catalog.js";
import { thumbnailsForSlugs } from "./media.js";

export interface SearchHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listPublicCards"
    | "listPublicCardsPage"
    // OS5 — the rebuild reads the materialised catalogue first, the live join
    // (and its census) only while nothing has computed one.
    | "listCataloguePage"
    | "countPublishedWindows"
    | "latestMetricsForSlugs"
    // MD0 — `catalogCards` is the ONE function that produces the document,
    // and the index is built from it (DS-1). So the index's dependency list
    // widens with the document's rather than diverging from it, which is the
    // whole point of building the index from the API's own function.
    | "listPublicMediaForSlugs"
    | "replaceSearchIndex"
    | "searchCandidates"
    | "getSearchIndexState"
    | "markSearchIndexDirty"
    // OPN-11 — a clean decline is recorded, so `/health` can see it ran.
    | "markSearchIndexChecked"
    // SR0 — makers, read LIVE rather than from the index.
    | "searchPublicContributors"
  >;
  now?: () => number;
}

/**
 * How long after a build the next one may run.
 *
 * Matched to the public document's own cache TTL: the index cannot usefully be
 * fresher than the page that links to its results, and a floor shorter than
 * the TTL would spend rebuilds nobody can observe.
 */
export const REBUILD_FLOOR_MS = 60_000;

/**
 * GET /internal/public/openproduct/search?q=…&limit=…
 *
 * No actor. No session. No personalisation. The candidate narrowing is a set
 * test in SQL and the ORDER is `search.relevance`, a formula published at
 * `/docs` — which is OPC-4 applied to search, where it is easiest to skip
 * because "relevance" sounds like a technical detail rather than an editorial
 * position. It is an editorial position: it decides whose work is seen.
 */
export async function handleSearch(
  _env: Env,
  url: URL,
  requestId: string,
  deps: SearchHandlerDeps,
): Promise<Response> {
  const terms = queryTerms(url.searchParams.get("q") ?? "");
  const limit = boundedLimit(url.searchParams.get("limit"));

  // An empty query is an empty result, not every product. "Show me
  // everything" is what the directory is for, and answering it here would
  // make the most expensive query in the system the one that is easiest to
  // send by accident.
  if (terms.length === 0) {
    // EXACTLY THE SAME KEYS as a real answer. A caller that had to check
    // whether `makers` exists before reading it would be a caller that
    // eventually forgets, and the symptom is a page that crashes on an empty
    // search box.
    return successResponse({ query: "", results: [], makers: [], topics: [] }, requestId, 200);
  }

  // SR0 — THREE SECTIONS, THREE MECHANISMS, and they run concurrently because
  // none depends on another.
  //
  //   launches  the DS0 index, ranked by the published `search.relevance`
  //   makers    a LIVE read, applying CG2's four eligibility conditions
  //   topics    a pure match against this package's own vocabulary
  //
  // The middle one is the decision. An index entry about a PERSON is a cached
  // answer to "is this profile public", and its staleness is unbounded — the
  // rebuild is sweep-driven, and a sweep that stops leaves the answer frozen.
  // A live read is stale by the same 60 seconds as `/@handle` itself, so
  // somebody who turns their profile off disappears from both in one breath.
  const raw = (url.searchParams.get("q") ?? "").trim();
  const [rows, people] = await Promise.all([
    deps.repo.searchCandidates(terms, MAX_CANDIDATES),
    // SWALLOWED INTO AN EMPTY LIST. A people read that failed must not fail
    // the whole search: products are what most queries are for, and a page
    // that 500s because one section could not be answered is worse than a
    // page with one section missing.
    deps.repo
      .searchPublicContributors(raw, SEARCH_MAKER_LIMIT)
      .catch(() => [] as Array<{ handle: string; displayName: string | null; bio: string | null }>),
  ]);

  const candidates: Candidate[] = rows.map((row) => ({
    kind: row.kind,
    entityId: row.entityId,
    title: row.title,
    summary: row.summary,
    terms: row.terms,
    facets: row.facets,
    // DS0 ranks on clause alone; SN2's activity is the TIEBREAK and arrives
    // with DS2, which brings the sort orders. Null here means "no tiebreak
    // available", which orders alphabetically — never as zero.
    activity: null,
  }));

  // WHICH FIELD MATCHED IS DECIDED BY THE CONTRACT, not here, so the page and
  // this handler cannot disagree about what to tell a reader. A row whose
  // match cannot be attributed is dropped rather than labelled vaguely: the
  // only way that happens is a query that matched through SQL folding this
  // function does not do, and "we found you but cannot say why" is not a
  // sentence worth shipping.
  const makers: SearchMakerHit[] = [];
  for (const row of people) {
    const matched = makerMatchField(row, raw);
    if (matched === null) continue;
    makers.push({ handle: row.handle, displayName: row.displayName, matched });
  }

  // openproduct-studio OSD3 — THE LOGO, AFTER THE RANK. The index carries no
  // media (a schema change for a picture), so the ranked product hits' logos
  // are one batched read over at most `limit` slugs. The rank has already
  // happened and never sees it; a failed read leaves every tile a monogram
  // rather than failing the search.
  const ranked = rankSearch(candidates, terms, limit);
  const productSlugs = ranked.filter((hit) => hit.kind === "product").map((hit) => hit.entityId);
  const thumbnailFor = await thumbnailsForSlugs(deps.repo, productSlugs).catch(() => () => null);
  const results = ranked.map((hit) =>
    hit.kind === "product" ? { ...hit, thumbnail: thumbnailFor(hit.entityId) } : hit,
  );

  return successResponse(
    {
      query: terms.join(" "),
      results,
      makers,
      // NO READ AT ALL. The vocabulary is a dozen entries in the contract, so
      // matching it is a pure function — and asking the index to emit facet
      // rows would make one endpoint answer two questions and put the
      // vocabulary in two places (DS3 made this call first, for stacks).
      topics: matchTopics(raw, SEARCH_TOPIC_LIMIT),
    },
    requestId,
    200,
  );
}

function boundedLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SEARCH_LIMIT;
  return Math.min(parsed, MAX_SEARCH_LIMIT);
}

/**
 * POST /internal/openproduct/search/rebuild — rebuild if due.
 *
 * "Due" means: never built, or dirty and past the floor. A build that is not
 * due is a 200 with `rebuilt: false`, not an error — the caller is a
 * scheduled sweep that runs on its own cadence and has no way to know, and
 * turning "nothing to do" into a failure would fill the log with the system
 * working correctly.
 *
 * NEVER BUILT beats the floor. An index that has never been built answers
 * every query with nothing, and nothing reads to a visitor as "this commons
 * is empty" rather than as "the index is warming up".
 */
export async function handleRebuildSearchIndex(
  env: Env,
  requestId: string,
  deps: SearchHandlerDeps,
  options: { force?: boolean } = {},
): Promise<Response> {
  const now = deps.now?.() ?? Date.now();
  const state = await deps.repo.getSearchIndexState();

  if (!options.force && !isDue(state, now)) {
    const reason = reasonNotDue(state);
    if (reason === "clean") {
      // A CLEAN DECLINE IS A RUN, AND IT LEAVES A MARK (OPN-11). Without one,
      // the phase's only timestamp was `built_at`, which moves only when
      // something changed: on a quiet catalogue it froze, and `/health`
      // called a phase stale that answered on every tick. The standalone
      // deploy shipped with an empty catalogue and read degraded from its
      // first half hour.
      //
      // `within-floor` is not marked: that index is dirty, so it is not
      // current, and it was built under a minute ago, so `built_at` is
      // already fresh.
      try {
        await deps.repo.markSearchIndexChecked(new Date(now).toISOString());
      } catch (error) {
        // An unrecorded check is the phase failing to report, and it says so
        // in the same shape as a failed rebuild (LI1a): the class, never the
        // message. The index itself is untouched and keeps serving.
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "search_check_unrecorded",
            reason:
              error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "non_error_thrown",
            requestId,
          }),
        );
        return errorResponse(
          "internal_error",
          `Search index check failed (${failureClass(error)})`,
          503,
          requestId,
        );
      }
    }
    return successResponse({ rebuilt: false, reason, indexed: null }, requestId, 200);
  }

  let indexed: number;
  try {
    // THE CATALOG DOCUMENT, not a query of its own. `catalogCards` is what
    // `GET /v1/products` returns; anything this index can surface was already
    // fetchable by anyone.
    const cards = await catalogCards(deps.repo, now);
    indexed = await deps.repo.replaceSearchIndex("product", buildProductIndex(cards), new Date(now).toISOString());
  } catch (error) {
    // A failed rebuild leaves the PREVIOUS index in place and `dirty_at`
    // untouched, so the next sweep tries again. Serving a slightly stale
    // index is a much better failure than serving an empty one, and clearing
    // dirty on failure would mean the retry never comes.
    //
    // THE CAUSE IS LOGGED, AND THAT IS NEW (openproduct-worldclass RS5). This
    // catch used to answer a bare 503 whose message was the same sentence for
    // a dropped connection, a malformed row and a type error — and the
    // gateway's caller then swallowed even that. RS4 watched this exact path
    // fail on prod on the sweep's first firing with nothing recorded
    // anywhere, on the phase behind the audit's lowest-scoring dimension.
    //
    // The 503's shape is unchanged, because it is an internal answer the
    // sweep already handles correctly. What is added is a line naming what
    // threw. This route is reachable only by the gateway's service binding,
    // so the line has no visitor and no address in it.
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "search_rebuild_failed",
        reason:
          error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "non_error_thrown",
        requestId,
      }),
    );
    // LI1a (openproduct-worldclass-v2): THE REFUSAL NAMES ITS CLASS. LI0 made
    // the gateway record this message in a column a public health read
    // serves — and for two days the column said "Search index rebuild
    // failed", which is the log line's first half and none of its second. A
    // SQLSTATE (`22P02`, `42804`) or an error's name is diagnostic and carries
    // no value from any row; the message itself can, so it stays in the log.
    return errorResponse(
      "internal_error",
      `Search index rebuild failed (${failureClass(error)})`,
      503,
      requestId,
    );
  }

  void env;
  return successResponse({ rebuilt: true, reason: "due", indexed }, requestId, 200);
}

/** A SQLSTATE when the driver supplied one, else the error's name — never its message. */
export function failureClass(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  if (error instanceof Error && error.name) return error.name;
  return "unknown";
}

function isDue(state: { builtAt: string | null; dirtyAt: string | null }, now: number): boolean {
  if (state.builtAt === null) return true;
  if (state.dirtyAt === null) return false;
  const builtAt = Date.parse(state.builtAt);
  if (Number.isNaN(builtAt)) return true;
  return now - builtAt >= REBUILD_FLOOR_MS;
}

function reasonNotDue(state: { builtAt: string | null; dirtyAt: string | null }): string {
  return state.dirtyAt === null ? "clean" : "within-floor";
}
