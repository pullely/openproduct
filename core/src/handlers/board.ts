// The launch board (openproduct-commons LC3).
//
// TWO HALVES, and they are on different planes on purpose.
//
//   the SWEEP     internal, scheduled, writes ranks into the metrics store.
//                 Beside EN3's and TS4's, for the reason all three give: a
//                 read that writes is a write amplifier somebody finds by
//                 holding down refresh, and this one walks a day of
//                 endorsements.
//
//   the READS     public, anonymous, cacheable. They read a number that is
//                 already computed and order it with a pure function. There
//                 is no aggregate on the request path at all, which is the
//                 whole reason the sweep exists.
//
// ─── WHY AN OPEN DAY IS RECOMPUTED AND A CLOSED ONE IS NOT ────────────────
//
// A closed day is FINAL (the contract's first decision), so recomputing it
// would spend the sweep's budget re-deriving a number that cannot have
// changed — and worse, would let a late integrity restatement silently
// rewrite a board somebody already read and linked to.
//
// There is exactly one exception and it is deliberate: a day that has never
// been ranked at all. A launch that fired while the sweep was down would
// otherwise be stranded off the board forever, which is the same failure LC0
// wrote `missed` to avoid — a launch that happened and that nothing on the
// estate admits happened.

import {
  BOARD_ARCHIVE_DAYS,
  BOARD_INELIGIBLE_METRIC,
  BOARD_METRIC,
  countForBoard,
  dayIsOpen,
  dayOf,
  dayWindow,
  parseDayId,
  rankBoard,
  type BoardEntry,
} from "@openproduct/contracts";
import type { LaunchEndorsementRecord, OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";
import { generateId, type Uuid } from "../ids.js";
import { fanOut, type InboxWriter } from "./inbox.js";
import { thumbnailsForSlugs } from "./media.js";

export interface BoardHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listLaunchesOnDay"
    | "listBoardDays"
    | "writeBoardRanks"
    | "readBoardRanks"
    // NF0 — the day's winner, and who to tell.
    | "listMaintainerSubjects"
    | "writeNotification"
    // openproduct-studio OSD3 — the rows' logos, one read per board.
    | "listPublicMediaForSlugs"
  >;
  now?: () => number;
  generateId?: () => Uuid;
}

/**
 * How many days back the sweep will consider ranking in one run.
 *
 * Small, because the only day that normally needs work is today. The rest of
 * the window exists to catch up after an outage, and the "never ranked"
 * condition below is what stops it re-deriving settled days it already has.
 */
export const BOARD_SWEEP_DAYS = 7;

/**
 * Recompute the boards that can still move, plus any that were missed.
 *
 * RETURNS WHAT IT DID PER DAY, not a total. An operator reading "ranked 3"
 * cannot tell a healthy run from one that silently skipped today; "ranked
 * 2026-08-26 (4 launches)" is the thing they actually need.
 */
export async function handleBoardSweep(
  _env: Env,
  request: Request,
  requestId: string,
  deps: BoardHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  const newId = deps.generateId ?? generateId;
  const observedAt = new Date(now).toISOString();

  const days = await deps.repo.listBoardDays(BOARD_SWEEP_DAYS);
  const ranked: Array<{ day: string; launches: number; reason: "open" | "never-ranked" }> = [];

  for (const candidate of days) {
    const parsed = parseDayId(candidate.day);
    // A day id the database produced that this cannot parse is a bug worth
    // seeing rather than skipping silently, but it must not take the sweep
    // down: the other days still deserve their boards.
    if (!parsed.ok) continue;

    const open = dayIsOpen(parsed.day, now);
    // The one exception to "a settled day is never recomputed": a day nothing
    // has ever ranked. A launch that fired while the sweep was down would
    // otherwise be stranded off the board forever.
    const neverRanked = !open && (await deps.repo.readBoardRanks(candidate.day)).length === 0;
    if (!open && !neverRanked) continue;

    const window = dayWindow(parsed.day);
    const launches = await deps.repo.listLaunchesOnDay(window.start, window.end);
    if (launches.length === 0) continue;

    await deps.repo.writeBoardRanks({
      day: candidate.day,
      observedAt,
      ranks: launches.map((launch) => {
        // THE CONTRACT DECIDES WHAT COUNTS, not this handler and not SQL.
        // `countForBoard` calls TS4's `boardEligible`, which is the one place
        // "existed before the launch" is defined — a second copy anywhere is
        // how the published sentence and the actual order come to disagree.
        const { counted, ineligible } = countForBoard(
          Date.parse(launch.launchedAt),
          launch.endorsements.map((e) => ({
            subjectId: e.subjectId,
            subjectFirstSeenAt: Date.parse(e.subjectFirstSeenAt),
          })),
        );
        return {
          launchId: launch.launchId,
          profileId: launch.profileId,
          countedId: newId(),
          ineligibleId: newId(),
          counted,
          ineligible,
        };
      }),
    });

    ranked.push({
      day: candidate.day,
      launches: launches.length,
      reason: open ? "open" : "never-ranked",
    });

    // NF0 — the day's winner, told once, and only when the day is SETTLED.
    // An open day's #1 changes as votes arrive, so notifying on every sweep
    // would tell three different people they had won and be wrong about two
    // of them. The event key is the DAY, so a re-run of a settled day writes
    // nothing.
    if (!open) await notifyRankFirst(deps, candidate.day, launches);
  }

  return successResponse(
    { swept: { considered: days.length, ranked, metric: BOARD_METRIC } },
    requestId,
    200,
  );
}

/**
 * NF0 — tell a listing's maintainers it reached #1 on its launch day.
 *
 * ONLY ON A SETTLED DAY. An open day's #1 changes as votes arrive, so
 * notifying on every sweep would tell three different people they had won and
 * be wrong about two of them. The day is the event key, so re-running a
 * settled day writes nothing.
 *
 * SWALLOWS EVERYTHING. The board is ranked whether or not we managed to say so,
 * and a notifier that could fail a sweep would be a notifier that makes the
 * board less reliable than not having one.
 */
async function notifyRankFirst(
  deps: BoardHandlerDeps,
  day: string,
  launches: readonly LaunchEndorsementRecord[],
): Promise<void> {
  try {
    // THE SAME COMPARISON THE BOARD PUBLISHES, from the contract's own
    // `rankBoard`. A second ordering here is how the number in somebody's
    // inbox and the number on the page come to disagree.
    const entries = launches.map((launch) => {
      const { counted, ineligible } = countForBoard(
        Date.parse(launch.launchedAt),
        launch.endorsements.map((e) => ({
          subjectId: e.subjectId,
          subjectFirstSeenAt: Date.parse(e.subjectFirstSeenAt),
        })),
      );
      return {
        launchId: launch.launchId,
        slug: launch.slug,
        // Neither is read by `rankBoard` — the comparison is counted, then
        // launch time, then slug — and neither is in the sweep's own read.
        // Present because the entry shape is the board's and this borrows it
        // rather than defining a second one that could order differently.
        tagline: null,
        versionLabel: "",
        launchedAt: launch.launchedAt,
        counted,
        ineligible,
      };
    });
    const winner = rankBoard(entries)[0];
    if (!winner || winner.counted <= 0) return;

    // Back to the launch, for the profile the maintainers hang off. `rankBoard`
    // takes the board's own entry shape and gives it back; the profile id is
    // not part of what a reader sees, so it is not in that shape.
    const won = launches.find((launch) => launch.launchId === winner.launchId);
    if (!won) return;
    const maintainers = await deps.repo.listMaintainerSubjects(won.profileId);
    await fanOut(deps as unknown as InboxWriter, {
      kind: "rank.first",
      subjectIds: maintainers,
      // NOBODY DID THIS. A rank is something the sweep observed, so the row
      // carries no actor and the sentence names none.
      actorHandle: null,
      targetKind: "listing",
      targetRef: winner.slug,
      eventRef: day,
      figure: winner.counted,
    });
  } catch {
    // Deliberately swallowed — see the note above.
  }
}

/**
 * One day's board, ordered.
 *
 * PUBLIC, ANONYMOUS, AND IT RESOLVES NO ACTOR (OPC-1, I6). The order is the
 * same for every reader, which is the only reason it can be published at all
 * — a personalised board is not a board, it is a feed, and a feed cannot be
 * argued with.
 *
 * The ORDER IS APPLIED HERE rather than in SQL, by the contract's pure
 * `rankBoard`. The database returns a day's rows; one function decides what
 * order they go in, and a test can reproduce it exactly.
 */
export async function handleBoardDay(
  _env: Env,
  request: Request,
  dayId: string,
  requestId: string,
  deps: BoardHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const parsed = parseDayId(dayId);
  if (!parsed.ok) {
    // A malformed day is a 404 and not a 400: `/launches/nonsense` is an
    // address that does not exist, and telling a crawler otherwise invites it
    // to keep asking.
    return errorResponse("not_found", "No board at that address", 404, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  const rows = await deps.repo.readBoardRanks(parsed.day.id);
  // openproduct-studio OSD3 — every row's logo in one read; `rankBoard`
  // never reads it (counted, then launch time, then slug).
  const thumbnailFor = await thumbnailsForSlugs(deps.repo, rows.map((row) => row.slug));
  const entries: BoardEntry[] = rows.map((row) => ({
    launchId: row.launchId,
    slug: row.slug,
    tagline: row.tagline,
    versionLabel: row.versionLabel,
    launchedAt: row.launchedAt,
    counted: row.counted,
    ineligible: row.ineligible,
    thumbnail: thumbnailFor(row.slug),
  }));

  return successResponse(
    {
      day: parsed.day.id,
      // I9 — a computed number carries the moment it was true. For a board
      // that is when it was ranked, and the page renders it, because a board
      // that could be an hour stale must say so rather than look live.
      observedAt: rows[0]?.observedAt ?? null,
      open: dayIsOpen(parsed.day, now),
      board: rankBoard(entries),
    },
    requestId,
    200,
  );
}

/** The archive index: which days hold a board. */
export async function handleBoardDays(
  _env: Env,
  request: Request,
  requestId: string,
  deps: BoardHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  const days = await deps.repo.listBoardDays(BOARD_ARCHIVE_DAYS);
  return successResponse({ days }, requestId, 200);
}

/** Today's day id, so the page and the sweep cannot disagree about which day
 *  "today" is. Exported because the web layer asks the same question. */
export function todayId(now: number): string {
  return dayOf(now).id;
}

/** Re-exported so a caller wiring the sweep does not import two modules to
 *  know which metric it writes. */
export const BOARD_METRICS = [BOARD_METRIC, BOARD_INELIGIBLE_METRIC] as const;
