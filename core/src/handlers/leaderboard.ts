// The leaderboard (openproduct-launch UV2).
//
// PUBLIC, ANONYMOUS, AND IT RESOLVES NO ACTOR (OPC-1, I6). The same document
// for every reader; the visitor's own vote state arrives after paint from the
// XP2 overlay, and nothing here knows who is asking.
//
// TWO READS, AND THE SECOND ONE IS BATCHED. The launches for the whole range
// come back in one call, and the makers for every row in a second — not one
// roster read per row, which would make the page's read count a function of
// how busy the month was.
//
// ─── IT ORDERS, AND THAT IS NOT A SECOND BOARD ────────────────────────────
//
// The feed handler says it does not rank, and must not. This one does, and
// the difference is the QUESTION rather than the discipline: a day's board
// cannot answer "which launch got the most upvotes this week", because a
// launch sits on exactly one day's board. What keeps the two consistent is
// that every number ordered here is the one the board already published for
// that launch's own day — nothing is counted again. The long note at the top
// of `contracts/leaderboard.ts` is the full argument.

import {
  LEADERBOARD_EMPTY_NOTE,
  LEADERBOARD_FORMULA,
  LEADERBOARD_MEANING,
  buildLeaderboard,
  leaderboardDays,
  leaderboardSubtitle,
  leaderboardToday,
  parseRange,
  type LeaderboardCandidate,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";
import type { Uuid } from "../ids.js";
import { thumbnailsForSlugs } from "./media.js";

export interface LeaderboardHandlerDeps {
  repo: Pick<OpenproductRepository, "listFeedLaunches" | "listRostersFor" | "listPublicMediaForSlugs">;
  now?: () => number;
}

export async function handleLeaderboard(
  _env: Env,
  request: Request,
  requestId: string,
  deps: LeaderboardHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  // AN UNRECOGNISED RANGE IS REFUSED, not coerced to the default. `?range=year`
  // answered with a week is one URL with two meanings, and the reader who
  // typed it walks away believing we publish a yearly ranking.
  const range = parseRange(new URL(request.url).searchParams.get("range"));
  if (range === null) {
    return errorResponse("invalid", "Unknown range", 400, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  const today = leaderboardToday(now);
  const days = leaderboardDays(range, today);

  const rows = await deps.repo.listFeedLaunches(days.map((day) => day.id));

  // ONLY THE ROWS THAT WILL BE LISTED get a roster read. A launch the sweep
  // has not counted is absent from the table (OPC-C), so fetching its makers
  // would be reading rows to throw them away.
  const ranked = rows.filter((row) => row.rank !== null);
  // openproduct-studio OSD3 — every row's logo, one batched read beside the
  // rosters; the order never reads it.
  const [rosters, thumbnailFor] = await Promise.all([
    deps.repo.listRostersFor(ranked.map((row) => row.profileId as Uuid)),
    thumbnailsForSlugs(deps.repo, ranked.map((row) => row.slug)),
  ]);

  const candidates: LeaderboardCandidate[] = ranked.map((row) => ({
    launchId: row.launchId,
    slug: row.slug,
    tagline: row.tagline,
    day: row.day,
    launchedAt: row.launchedAt,
    dayRank: row.rank,
    counted: row.counted,
    commentCount: row.commentCount,
    makers: (rosters.get(row.profileId) ?? []).map((member) => ({
      handle: member.handle,
      // CG1 — a person's OWN name where they have a public profile, and what
      // the maintainer wrote otherwise. Falling back to the slug or to an id
      // would put a string in the estate's voice that nobody chose.
      name: member.displayName ?? member.roleLabel ?? "",
    })),
    thumbnail: thumbnailFor(row.slug),
  }));

  const board = buildLeaderboard(range, today, candidates);

  return successResponse(
    {
      ...board,
      // OPC-4 — the order resolves to a formula a reader can look up, and this
      // one is the leaderboard's own rather than the board's, because it is a
      // different ordering over the same published numbers.
      formula: LEADERBOARD_FORMULA,
      meaning: LEADERBOARD_MEANING,
      subtitle: leaderboardSubtitle(board),
      // Carried always, not only when empty: the page decides whether to
      // render it, and a string that arrives conditionally is a string that is
      // missing the one time it is needed.
      emptyNote: LEADERBOARD_EMPTY_NOTE,
    },
    requestId,
    200,
  );
}
