// The catalogue phase (openproduct-scale OS5).
//
// POST /internal/openproduct/catalogue/rebuild — write `catalog_cards`: every
// listed product with its latest observations and its media, in the published
// order, and stamp the moment and the census on `catalog_state`. The front
// page and `GET /v1/products` read that table with one indexed query; the
// search rebuild, later in the same tick, builds the index from it.
//
// INTERNAL for the search rebuild's reason: it is called by the scheduled
// sweep, not by a person, it resolves no actor because there is none, and a
// public read that wrote five thousand rows would be a cheap way to spend the
// database.
//
// NO FLOOR OF ITS OWN. The phase runs on every materialisation tick and
// rewrites only the rows whose content changed (the repository's upsert says
// so), so a quiet tick costs one statement that writes nothing. The floor is
// the cron; the health row says when it last stamped.

import { ENDORSEMENT_REPUBLISH_MS } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";
import { endorsementsSinceOf, mergesSinceOf } from "./cards-page.js";
import { failureClass } from "./search.js";

export interface CatalogueHandlerDeps {
  repo: Pick<OpenproductRepository, "rebuildCatalogue" | "refreshEndorsementCounts">;
  now?: () => number;
}

export async function handleRebuildCatalogue(
  env: Env,
  requestId: string,
  deps: CatalogueHandlerDeps,
): Promise<Response> {
  void env;
  const now = deps.now?.() ?? Date.now();
  // OB3 — RE-COUNT BEFORE ORDERING. `sort.most-active` multiplies by the
  // week's counted upvotes, and that number moves with nobody voting (a vote
  // ages out of the week). The act recounts the one build it touched; this
  // recounts every listed build, writing only what moved or is about to go
  // stale. BEST EFFORT: a failed re-count leaves the previous counts, which
  // the ordering still reads inside their freshness, and must not cost the
  // catalogue its rebuild.
  let upvotesRecounted: number | null = null;
  try {
    upvotesRecounted = await deps.repo.refreshEndorsementCounts({
      now: new Date(now).toISOString(),
      republishBefore: new Date(now - ENDORSEMENT_REPUBLISH_MS).toISOString(),
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "endorsement_recount_failed",
        reason:
          error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "non_error_thrown",
        requestId,
      }),
    );
  }
  try {
    // THE FRESHNESS RULE IS THE CONTRACT'S, computed here exactly as the live
    // read computes it, so "not observed" in the catalogue is "not observed"
    // on the card — the page is one source or the other and cannot disagree
    // with itself about which listings have a number.
    const report = await deps.repo.rebuildCatalogue({
      now: new Date(now).toISOString(),
      mergesSince: mergesSinceOf(now),
      endorsementsSince: endorsementsSinceOf(now),
    });
    return successResponse({ rebuilt: true, ...report, upvotesRecounted }, requestId, 200);
  } catch (error) {
    // A failed rebuild leaves the PREVIOUS catalogue in place with its own
    // moment, which the page renders; the next tick tries again. The cause
    // is logged in the closed vocabulary (OO2) and the refusal names its
    // class, never the message (LI1a) — this route has no visitor and no
    // address in it.
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "catalogue_rebuild_failed",
        reason:
          error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "non_error_thrown",
        requestId,
      }),
    );
    return errorResponse(
      "internal_error",
      `Catalogue rebuild failed (${failureClass(error)})`,
      503,
      requestId,
    );
  }
}
