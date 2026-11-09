// The launch feed (openproduct-launch OL2).
//
// PUBLIC, ANONYMOUS, AND IT RESOLVES NO ACTOR (OPC-1, I6). The front page is
// the same document for every reader; the visitor's own vote state arrives
// after paint from the XP2 overlay, and nothing here knows who is asking.
//
// ONE READ, ONE ROUND TRIP. `/` has a read budget of one, so the whole
// seven-day window comes back from a single `listFeedLaunches` call. The
// grouping is then a pure function in the contract.
//
// ─── WHAT THIS HANDLER DOES NOT DO ────────────────────────────────────────
//
// It does not rank. OL-2a settled that: LC3's board already computes and
// stores this ordering and publishes its formula at `launch.board-rank`, so a
// second daily order here would give the estate two different answers to
// "what was #1 that day". `listFeedLaunches` reads the sweep's OUTPUT and
// turns it into a position; `buildFeed` groups the result. Neither counts an
// endorsement.

import {
  FEED_EMPTY_NOTE,
  FEED_FORMULA,
  FEED_MEANING,
  FEED_WINDOW_DAYS,
  buildFeed,
  feedToday,
  feedWindowDays,
  thumbnailOf,
  type FeedEntry,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { mediaFactOf } from "./media.js";
import { errorResponse, successResponse } from "../http.js";

export interface FeedHandlerDeps {
  // MD3 — one media read for the whole week, keyed by slug, for the rows' tiles.
  repo: Pick<OpenproductRepository, "listFeedLaunches" | "listPublicMediaForSlugs">;
  now?: () => number;
}

/**
 * The front page's whole document.
 *
 * `today` is computed from the clock ONCE and carried in the answer, so a
 * cached document says which UTC day it is talking about rather than leaving
 * a reader to infer it from a heading. That is also what makes the cache
 * honest: two readers holding the same document are holding the same claim.
 */
export async function handleFeed(
  _env: Env,
  request: Request,
  requestId: string,
  deps: FeedHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  const today = feedToday(now);
  // THE WINDOW IS DECIDED HERE, not in SQL. A `now() - interval '7 days'`
  // would make the front page a function of when the query ran rather than of
  // the day it names, and two readers a second apart could then hold
  // different documents at one URL (OPC-1).
  const days = feedWindowDays(today);

  const rows = await deps.repo.listFeedLaunches(days.map((day) => day.id));
  // MD3 — THE TILE'S PICTURE, one read for every row on the page. A second
  // round trip rather than a join in `listFeedLaunches`: the feed read is the
  // board's and stays about the board; a thumbnail is a picture of a product
  // and nothing here orders by it (OPC-4, MD-3). Absent rows mean `null`,
  // and the row keeps its monogram.
  const mediaBySlug = await deps.repo.listPublicMediaForSlugs([...new Set(rows.map((row) => row.slug))]);
  const thumbnailFor = (slug: string) =>
    thumbnailOf((mediaBySlug.get(slug.toLowerCase()) ?? mediaBySlug.get(slug) ?? []).map(mediaFactOf));
  const entries: FeedEntry[] = rows.map((row) => ({
    launchId: row.launchId,
    slug: row.slug,
    tagline: row.tagline,
    versionLabel: row.versionLabel,
    launchedAt: row.launchedAt,
    day: row.day,
    rank: row.rank,
    counted: row.counted,
    ineligible: row.ineligible,
    licence: row.licence,
    // CT1's category is the row's first topic. ONE VALUE, NOT A LIST, until
    // TP0 makes topics addresses — a row that rendered three topics today
    // would be inventing two of them.
    topics: row.category ? [row.category] : [],
    stack: row.stack,
    roleOpeningCount: row.roleOpeningCount,
    commentCount: row.commentCount,
    thumbnail: thumbnailFor(row.slug),
  }));

  return successResponse(
    {
      ...buildFeed(today, entries),
      windowDays: FEED_WINDOW_DAYS,
      // OPC-4 — the order resolves to a formula a reader can look up, and it
      // is the BOARD's, not one this surface minted.
      formula: FEED_FORMULA,
      meaning: FEED_MEANING,
      // Carried always, not only when the feed is empty: the page decides
      // whether to render it, and a string that arrives conditionally is a
      // string that is missing the one time it is needed.
      emptyNote: FEED_EMPTY_NOTE,
    },
    requestId,
    200,
  );
}
