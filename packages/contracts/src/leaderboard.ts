// The leaderboard (openproduct-launch UV2).
//
// ─── WHY THIS IS NOT A SECOND BOARD (OL-2a) ───────────────────────────────
//
// OL-2a settled that a rank is computed once, stored, and read everywhere
// after. It is worth being precise about what that forbids, because this file
// does produce an order and a careless reading would call it a violation.
//
// What OL-2a forbids is TWO ANSWERS TO ONE QUESTION. LC3's board answers
// "which launch was first on 26 August", and if the feed re-derived that
// independently the estate would eventually give two answers to it.
//
// The leaderboard asks a DIFFERENT question: "which launch got the most
// upvotes this week". A day's board cannot answer it — a launch is on exactly
// one day's board, so no day's order says anything about a week.
//
// The safety comes from the INPUT rather than from refusing to order at all:
// every number here is the one the board already published for that launch's
// own day, after the same integrity discount, and the tiebreaks are
// `rankBoard`'s in the same sequence. So a launch's number is identical on
// both surfaces, and the only thing this file decides is how those published
// numbers sit next to each other.
//
// ─── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────
//
// A launch the sweep has not ranked has NO published number, so it is absent
// from the leaderboard rather than listed at zero (OPC-C). Today's launches
// therefore appear once the sweep has run, and the page says so — a table
// showing a fresh launch at zero upvotes would be a claim that nobody wanted
// it, when what happened is that nobody has counted yet.
//
// There is no all-time range. A leaderboard that never resets is an ordering
// of how long a listing has existed, which the directory's `sort.most-saved`
// already publishes and does not pretend is a competition.

import { type BoardDay, dayOf, formatDayId, previousDay } from "./board.js";
import type { MediaThumbnail } from "./media.js";
import type { FormulaId } from "./provenance.js";

/** The two ranges the design draws, and there is no third. */
export type LeaderboardRange = "week" | "month" | "year";

/**
 * HB2 — the year joins the week and the month. The DAY is not a range here:
 * one day's board is the archive at `/launches/<day>`, already ordered by
 * the same numbers, and a second address for it would be one document with
 * two spellings — the thing `leaderboardPath` refuses for the week.
 */
export const LEADERBOARD_RANGES = ["week", "month", "year"] as const;

/** What the switch calls each range. */
export const LEADERBOARD_RANGE_LABEL: Readonly<Record<LeaderboardRange, string>> = {
  week: "This week",
  month: "This month",
  year: "This year",
};

/** HB2 — the switch's first link: today's board, at the archive's address. */
export const LEADERBOARD_DAY_LABEL = "Today";

/** No *Featured*. Said once so a test can hold the switch to it. */
export const LEADERBOARD_NO_FEATURED = true;

/**
 * The range a request names.
 *
 * An absent value is the week — the design's own default, and the range a
 * reader arriving from the nav should get. An UNRECOGNISED one is `null`,
 * which the caller turns into a refusal rather than quietly serving the week:
 * an address that answers with a document it did not name has two meanings,
 * and `year` silently showing a week is exactly how somebody comes to believe
 * we publish a yearly ranking.
 *
 * The API takes its range from `?range=`; the WEBSITE takes it from the path
 * (see `leaderboardPath`). Both resolve it here, so there is one list of what
 * a range can be.
 */
export function parseRange(raw: string | null | undefined): LeaderboardRange | null {
  if (raw === null || raw === undefined || raw === "") return "week";
  return (LEADERBOARD_RANGES as readonly string[]).includes(raw)
    ? (raw as LeaderboardRange)
    : null;
}

/**
 * `/leaderboard` and `/leaderboard/month`.
 *
 * THE RANGE IS A PATH SEGMENT, NOT A QUERY PARAMETER, and that is not
 * cosmetic. A page that reads `searchParams` is dynamic in Next, so
 * `revalidate` is accepted and ignored and the document goes out `no-store` —
 * which the budget lane caught on the first run of this milestone: both ranges
 * were served `private, no-cache, no-store, must-revalidate` to everybody.
 * These are public, anonymous, actor-free documents (OPC-1), and a leaderboard
 * that cannot be cached is a leaderboard whose every reader pays for a
 * database round trip.
 *
 * The week keeps the BARE address, so the default range has one URL and
 * `/leaderboard/week` is a 404 rather than a second spelling of it.
 */
export function leaderboardPath(range: LeaderboardRange): string {
  return range === "week" ? "/leaderboard" : `/leaderboard/${range}`;
}

/** The ranges that live at a segment of their own — every range but the week,
 *  which is the bare address. What `generateStaticParams` prerenders. */
export function leaderboardSegments(): readonly Exclude<LeaderboardRange, "week">[] {
  return LEADERBOARD_RANGES.filter((r) => r !== "week") as Exclude<LeaderboardRange, "week">[];
}

export const LEADERBOARD_PATH = "/leaderboard";

/**
 * How far back `week` reaches.
 *
 * Seven days, which is the feed's window and LC1's digest window. Three
 * surfaces sharing one number is two fewer things to reconcile, and a reader
 * who scrolls the feed to its end and then opens the leaderboard is looking at
 * the same span of time.
 */
export const LEADERBOARD_WEEK_DAYS = 7;

/**
 * The days a range covers, newest first.
 *
 * DECIDED HERE, NOT IN SQL, for the reason OL2 already wrote out: a
 * `WHERE launched_at > now() - interval '7 days'` makes the window a property
 * of the database's clock and of the instant the query ran, so two readers a
 * second apart could hold different documents at one URL (OPC-1). The handler
 * computes the days once and asks for exactly those.
 *
 * `month` is the CALENDAR month `today` falls in, truncated at today — not
 * thirty days back. "This month" on the 3rd means three days, and a reader who
 * is told "September 2026" and shown a table half of which is August would be
 * right to call it wrong.
 */
export function leaderboardDays(range: LeaderboardRange, today: BoardDay): BoardDay[] {
  if (range === "week") {
    const days: BoardDay[] = [today];
    for (let i = 1; i < LEADERBOARD_WEEK_DAYS; i += 1) {
      days.push(previousDay(days[days.length - 1]!));
    }
    return days;
  }
  // HB2 — the CALENDAR year `today` falls in, truncated at today, for the
  // same reason the month is: "this year" on 3 January means three days.
  if (range === "year") {
    const days: BoardDay[] = [];
    let cursor: BoardDay = today;
    while (cursor.year === today.year) {
      days.push(cursor);
      cursor = previousDay(cursor);
    }
    return days;
  }
  const days: BoardDay[] = [];
  for (let d = today.day; d >= 1; d -= 1) {
    days.push({
      id: formatDayId(today.year, today.month, d),
      year: today.year,
      month: today.month,
      day: d,
    });
  }
  return days;
}

/** The day the leaderboard treats as today, from a clock. UTC, per OL-2. */
export function leaderboardToday(now: number | Date): BoardDay {
  return dayOf(now);
}

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

/** One maker, as the design's avatar stack draws them. */
export interface LeaderboardMaker {
  /** CG1's public handle, or null for a confirmed person with no public
   *  profile. A name without a handle renders as initials and links nowhere,
   *  because there is no page to link to — inventing one would be a claim
   *  about somebody who chose not to have a page. */
  readonly handle: string | null;
  /** What the roster shows: the person's own name where they have a public
   *  profile, otherwise what the maintainer wrote. */
  readonly name: string;
}

/**
 * How many makers a row draws before it stops.
 *
 * Four, because the design's column is 160px and the avatars overlap at -6px.
 * A row with more says `+n` rather than growing — a table whose columns move
 * with the data is a table that stops being scannable, which is the one thing
 * a leaderboard is for.
 */
export const LEADERBOARD_MAKER_LIMIT = 4;

/** One launch, as a leaderboard row renders it. */
export interface LeaderboardEntry {
  readonly launchId: string;
  readonly slug: string;
  readonly tagline: string | null;
  /** The day the launch landed on, so a row can address its own board. */
  readonly day: string;
  /** The position on THIS leaderboard, 1-based. Never null: a launch with no
   *  published number is absent from the list rather than present unranked. */
  readonly rank: number;
  /** The position the BOARD gave it on its own day. Carried so a reader can
   *  see that a launch which won a quiet Tuesday sits below one that came
   *  third on a busy Friday, which is the leaderboard's whole point and would
   *  otherwise look like an error. */
  readonly dayRank: number;
  /** The board's published, discounted count. The number that decided both
   *  positions, so the order and the figure beside it cannot disagree. */
  readonly counted: number;
  /** Posts in the launch's discussion, visible ones only. */
  readonly commentCount: number;
  readonly makers: readonly LeaderboardMaker[];
  /** Makers beyond `LEADERBOARD_MAKER_LIMIT`. Zero renders nothing. */
  readonly moreMakers: number;
  /**
   * The listing's logo, for the row's tile; `null` keeps the monogram
   * (openproduct-studio OSD3). NEVER AN ORDERING INPUT (MD-3).
   */
  readonly thumbnail: MediaThumbnail | null;
}

export const LEADERBOARD_ENTRY_KEYS = [
  "launchId",
  "slug",
  "tagline",
  "day",
  "rank",
  "dayRank",
  "counted",
  "commentCount",
  "makers",
  "moreMakers",
  // openproduct-studio OSD3 — the row's logo.
  "thumbnail",
] as const;

export interface Leaderboard {
  readonly range: LeaderboardRange;
  /** The day the leaderboard treated as today, carried so a cached document
   *  says which UTC day it is talking about rather than leaving a reader to
   *  infer it from a heading. */
  readonly today: string;
  /** The window's ends, inclusive, as day ids — what the subtitle names. */
  readonly from: string;
  readonly to: string;
  readonly entries: readonly LeaderboardEntry[];
}

/**
 * What a row needs before it has a position.
 *
 * `counted` is nullable here and not on `LeaderboardEntry`, and that gap is
 * the filter: a launch the sweep has not reached comes in with null and does
 * not come out at all.
 */
export interface LeaderboardCandidate {
  readonly launchId: string;
  readonly slug: string;
  readonly tagline: string | null;
  readonly day: string;
  readonly launchedAt: string;
  readonly dayRank: number | null;
  readonly counted: number | null;
  readonly commentCount: number;
  readonly makers: readonly LeaderboardMaker[];
  /** The row's logo, carried through untouched (openproduct-studio OSD3).
   *  Optional: a caller that only wants the ORDER (the listing page's week
   *  standing) has no picture to pass, and the order never reads it. */
  readonly thumbnail?: MediaThumbnail | null;
}

/**
 * Assemble the leaderboard from candidates that already carry their published
 * numbers.
 *
 * PURE — candidates in, rows out, no clock beyond the `today` it is handed and
 * no database. The property `rankBoard`, `buildFeed` and EN3's assessor all
 * have, for the same reason: an order a test cannot reproduce exactly is an
 * order nobody can check.
 *
 * THE TIEBREAKS ARE `rankBoard`'S, in its sequence — the earlier launch, then
 * the slug. Two launches on the same count would otherwise sit in whatever
 * order the read happened to return, and a leaderboard that reordered between
 * two requests is a leaderboard nobody can screenshot.
 */
export function buildLeaderboard(
  range: LeaderboardRange,
  today: BoardDay,
  candidates: readonly LeaderboardCandidate[],
): Leaderboard {
  const days = leaderboardDays(range, today);
  const inRange = new Set(days.map((day) => day.id));
  const entries = candidates
    .filter((c) => inRange.has(c.day) && c.counted !== null && c.dayRank !== null)
    .sort(
      (a, b) =>
        b.counted! - a.counted! ||
        Date.parse(a.launchedAt) - Date.parse(b.launchedAt) ||
        a.slug.localeCompare(b.slug),
    )
    .map((c, index) => ({
      launchId: c.launchId,
      slug: c.slug,
      tagline: c.tagline,
      day: c.day,
      rank: index + 1,
      dayRank: c.dayRank!,
      counted: c.counted!,
      commentCount: c.commentCount,
      makers: c.makers.slice(0, LEADERBOARD_MAKER_LIMIT),
      moreMakers: Math.max(0, c.makers.length - LEADERBOARD_MAKER_LIMIT),
      thumbnail: c.thumbnail ?? null,
    }));
  return {
    range,
    today: today.id,
    from: days[days.length - 1]!.id,
    to: days[0]!.id,
    entries,
  };
}

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

export const LEADERBOARD_FORMULA: FormulaId = "launch.leaderboard";

/** The subtitle under the heading, naming the exact window. The design writes
 *  a date range for the week and a month name for the month, and both are
 *  built from the same days the query asked for. */
export function leaderboardSubtitle(board: Leaderboard): string {
  if (board.range === "year") {
    return `Most upvoted launches in ${board.to.slice(0, 4)}`;
  }
  if (board.range === "month") {
    const [year, month] = board.to.split("-").map(Number) as [number, number];
    const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return `Most upvoted launches in ${label}`;
  }
  return `Most upvoted launches, ${shortDay(board.from)} – ${shortDay(board.to)}`;
}

/** `26 Aug` — compact, because the subtitle carries two of them. */
function shortDay(id: string): string {
  const [year, month, day] = id.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export const LEADERBOARD_MEANING =
  "Ordered by the upvotes each launch received on the day it launched, after the integrity discount. A launch the daily sweep has not counted yet is not listed.";

// NOT SPLIT BY VC0, deliberately. Two sentences and nineteen words, already
// followed on the page by a real action ("Products") — this is not the
// essay P1·10 found, and the second sentence is the one thing a reader staring
// at an empty board actually wants. Splitting it would also mean carrying a
// second string across the wire document for no gain. The rule is "one
// sentence and one action", not "one sentence at any cost".
export const LEADERBOARD_EMPTY_NOTE =
  "No launch in this range has been counted yet. The daily sweep publishes each day's numbers shortly after the day closes.";
