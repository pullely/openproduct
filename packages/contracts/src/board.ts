// The launch board (openproduct-commons LC3).
//
// LC0 separated publishing from launching. LC1 gave the week an address. This
// is the day, ranked — and the ranking is the whole of the milestone, because
// a board is the first surface on this estate where POSITION IS SCARCE.
//
// Everything else here is a list somebody can scroll: the directory's three
// orders rearrange the same set, the digest names a week's work, a profile
// names what somebody did. A board says FIRST, and first is worth something,
// and the moment a thing is worth something somebody will try to take it.
// So this file is written against that, and three decisions follow.
//
// ─── 1. THE DAY IS THE UNIT, AND A SETTLED DAY CANNOT CHANGE ──────────────
//
// A launch belongs to the UTC day it went live, and competes only with the
// launches of that day. Not a rolling 24 hours from each launch: a rolling
// window means two launches four hours apart are ranked over different sets
// of hours, so neither can be compared to the other and "first today" means
// nothing. It also means the board never settles — every launch's score keeps
// moving on its own schedule, and the archive would have to say "as of when
// you asked", which is not an archive.
//
// A closed day is FINAL. That is what makes `/launches/2026-08-26` a
// permanent address rather than a query, and it is the same property LC1's
// digest weeks have and for the same reason.
//
// ─── 2. THE BOARD COUNTS ONLY WHAT TS4 SAYS IT MAY ────────────────────────
//
// `boardEligible` (TS4) is not decoration here — it IS the anti-brigading
// answer the epic asked for, and it works by changing what the number is made
// of rather than by detecting anybody. The board counts endorsements from
// accounts that existed before the launch. A brand-new account's endorsement
// still counts on the listing's own public total (EN2); it does not move a
// POSITION, because a position is the scarce thing.
//
// You cannot buy history, so there is nothing to detect and nobody to accuse.
// The published sentence says this out loud, because a ranking that quietly
// discounted some people's endorsements would be exactly the unexplainable
// order OPC-4 exists to forbid.
//
// ─── 3. NOTHING IS COMPUTED AT REQUEST TIME ───────────────────────────────
//
// The rank is written into SN0's metrics store by the sweep and read back as
// a number. A board that ran its aggregate per request would be the cheapest
// denial of service on the estate — one anonymous, cacheable, crawlable URL
// whose every miss walks the endorsement table.
//
// WHAT IS DELIBERATELY ABSENT: any notion of who is looking. Same as the
// directory's orders (DS4's header makes the argument), and more important
// here, because a personalised board is not a board — it is a feed, and a
// feed cannot be argued with.

import { boardEligible, type BoardEndorsement } from "./defence.js";
import type { MediaThumbnail } from "./media.js";
import type { FormulaId } from "./provenance.js";

// ---------------------------------------------------------------------------
// The day
// ---------------------------------------------------------------------------

/**
 * A board day, as an id that is also its address: `2026-08-26`.
 *
 * UTC, like LC1's weeks and for the argument LC1 already made: a board whose
 * day boundary moved with the reader would show two people different boards
 * at the same URL, which breaks the cacheable-document rule (OPC-1) and makes
 * "first today" unanswerable. The cost is that a maker in Auckland launches
 * into a day that started at 12pm their time, and the honest mitigation is
 * that they choose the moment (LC0) knowing the rule, which `/docs` states.
 */
export interface BoardDay {
  readonly id: string;
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDayId(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dayOf(at: number | Date): BoardDay {
  const date = at instanceof Date ? at : new Date(at);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return { id: formatDayId(year, month, day), year, month, day };
}

/** The half-open window a day covers: `[start, end)`. */
export function dayWindow(day: BoardDay): { start: string; end: string } {
  const start = Date.UTC(day.year, day.month - 1, day.day);
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS).toISOString() };
}

export type DayParse = { ok: true; day: BoardDay } | { ok: false; reason: "malformed" | "impossible" };

/**
 * Parse a day from a URL segment.
 *
 * STRICT, AND IT REFUSES THE SHAPES THAT ARE NEARLY RIGHT. `2026-8-26` and
 * `2026-08-26T00:00:00Z` are both refused rather than coerced, because a
 * board day is an ADDRESS: two spellings that resolve to one board are two
 * URLs for one document, which is the thing the canonical tag exists to
 * prevent and a duplicate a crawler will happily index.
 */
export function parseDayId(raw: string): DayParse {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return { ok: false, reason: "malformed" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2020 || year > 2999) return { ok: false, reason: "impossible" };
  if (month < 1 || month > 12) return { ok: false, reason: "impossible" };
  if (day < 1 || day > 31) return { ok: false, reason: "impossible" };
  // Round-trip through UTC so 31 February is refused rather than rolled into
  // March — a date that silently moves is an address that lies.
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    return { ok: false, reason: "impossible" };
  }
  return { ok: true, day: { id: formatDayId(year, month, day), year, month, day } };
}

export function previousDay(day: BoardDay): BoardDay {
  return dayOf(Date.UTC(day.year, day.month - 1, day.day) - DAY_MS);
}

/** The next day, or null when it has not happened yet. A board cannot link
 *  forward into a day nobody has launched in. */
export function nextDay(day: BoardDay, now: number): BoardDay | null {
  const next = Date.UTC(day.year, day.month - 1, day.day) + DAY_MS;
  return next > now ? null : dayOf(next);
}

/** "26 August 2026" — the heading, and the only place a board renders a date
 *  in prose. */
export function dayLabel(day: BoardDay): string {
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * HB2 — the day-of-month strip on a daily board.
 *
 * Every day of the month the board's day falls in, oldest first, truncated
 * at today so the strip never links forward into a day nobody has launched
 * in yet — the rule `nextDay` already keeps for the day page's own arrows.
 * A day with no launches still has a board (an empty one, with its
 * sentence), so every link resolves.
 */
export function monthStrip(day: BoardDay, now: number): BoardDay[] {
  const today = dayOf(now);
  const days: BoardDay[] = [];
  const last = new Date(Date.UTC(day.year, day.month, 0)).getUTCDate();
  for (let d = 1; d <= last; d += 1) {
    const id = formatDayId(day.year, day.month, d);
    if (id > today.id) break;
    days.push({ id, year: day.year, month: day.month, day: d });
  }
  return days;
}

/** Is this day still open — i.e. can its ranking still move? */
export function dayIsOpen(day: BoardDay, now: number): boolean {
  return now < Date.parse(dayWindow(day).end);
}

// ---------------------------------------------------------------------------
// The rank
// ---------------------------------------------------------------------------

/**
 * The metric the sweep writes and the board reads.
 *
 * `launch` + the DAY as its window, which bends SN0's convention that a
 * metric's window is a duration (`7d`, `30d`, `all`, `total`). It bends on
 * purpose: a board is per-day and a settled day never changes, so the natural
 * key for this number is WHICH BOARD rather than how far back it looked.
 * Keying it by duration would give one row per listing that the next day
 * overwrites, and the archive would be gone.
 *
 * EN2's rule that a metric key IS a formula id does not hold here for the
 * same reason, so this number never reaches the wire as a bare metric: the
 * board projects it as a `derived` Fact carrying `launch.board-rank`, which
 * is the id that resolves to the published sentence. Storage and provenance
 * are two different questions and this is the one place they differ.
 */
export const BOARD_METRIC = "launch";
/**
 * The second number, stored beside the first.
 *
 * TWO ROWS RATHER THAN ONE, because the metrics store holds one integer per
 * (listing, metric, window) and both figures are load-bearing: the first
 * decides the position, the second is what makes the position accountable to
 * a maker comparing it against the total on their own page. Deriving the
 * ineligible count at read time would mean re-reading the day's endorsements,
 * which is the request-time aggregate this whole design exists to avoid.
 */
export const BOARD_INELIGIBLE_METRIC = "launch_ineligible";
export const BOARD_FORMULA: FormulaId = "launch.board-rank";

/** The source recorded on the metric row. `operator` is SN0's "we computed
 *  it", said honestly — this is not an observation of anybody's repository. */
export const BOARD_METRIC_SOURCE = "operator";

/** One launch, as the board ranks it. */
export interface BoardEntry {
  readonly launchId: string;
  /**
   * The listing's slug, which on this estate IS its name.
   *
   * There is no display-name column and there should not be: a listing is
   * addressed by its slug everywhere (the directory card, the digest, the
   * profile), and a board that rendered some other string would be the one
   * surface calling a product something the rest of the site does not.
   */
  readonly slug: string;
  readonly tagline: string | null;
  readonly versionLabel: string;
  /** ISO 8601 — the moment they chose (LC0), never the sweep's clock. */
  readonly launchedAt: string;
  /** Board-eligible endorsements received during the day. */
  readonly counted: number;
  /**
   * Endorsements received during the day from accounts younger than the
   * launch. PUBLISHED, not hidden.
   *
   * A board that silently dropped these would be an unexplainable order, and
   * a maker whose launch was shared somewhere popular would see a position
   * that did not match the total on their own page with no way to account for
   * the gap. Saying "of N endorsements, M were from accounts that existed
   * before the launch" is the whole of OPC-4 applied to a rank.
   */
  readonly ineligible: number;
  /**
   * The listing's logo, for the row's tile; `null` keeps the monogram
   * (openproduct-studio OSD3). NEVER AN ORDERING INPUT (MD-3).
   */
  readonly thumbnail: MediaThumbnail | null;
}

export const BOARD_ENTRY_KEYS = [
  "launchId",
  "slug",
  "tagline",
  "versionLabel",
  "launchedAt",
  "counted",
  "ineligible",
  // openproduct-studio OSD3 — the row's logo.
  "thumbnail",
] as const;

/**
 * Rank a day's launches.
 *
 * PURE, taking entries and returning them ordered — no clock, no database,
 * no subject. The same property EN3's assessor and DS4's comparators have,
 * and for the same reason: an order a test cannot reproduce exactly is an
 * order nobody can check.
 *
 * TIE-BROKEN BY THE EARLIER LAUNCH (LC-2), then by slug. The second tiebreak
 * is not decoration — without it, two launches at the same instant with the
 * same count would order by whatever the database happened to return, and a
 * board that shuffles between two reads of one settled day is not an archive.
 */
//
// GENERIC OVER WHAT IT DOES NOT READ (openproduct-studio OSD3): the order is
// counted, launch time, slug — never the row's picture — so a caller that has
// no `thumbnail` to hand (the NF0 notifier) ranks without inventing one, and
// the type says the logo cannot be an ordering input.
export function rankBoard<T extends Omit<BoardEntry, "thumbnail">>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      b.counted - a.counted ||
      Date.parse(a.launchedAt) - Date.parse(b.launchedAt) ||
      a.slug.localeCompare(b.slug),
  );
}

/**
 * Count a launch's board-eligible endorsements from the day's raw acts.
 *
 * The one place the board and TS4 meet, and it is a call rather than a
 * reimplementation: `boardEligible` owns what "existed before the launch"
 * means, and a second copy of that rule here is how the published sentence
 * and the actual order come to disagree.
 */
export function countForBoard(
  launchedAt: number,
  endorsements: readonly BoardEndorsement[],
): { counted: number; ineligible: number } {
  const eligibility = boardEligible(launchedAt, endorsements);
  return { counted: eligibility.eligible, ineligible: eligibility.ineligible };
}

// ---------------------------------------------------------------------------
// What the page says
// ---------------------------------------------------------------------------

/**
 * The board's own sentence, above the list.
 *
 * It says what the order IS and what it is not, because the reader's first
 * question at a ranked list is "who decided this". The directory's three
 * orders each answer that at `/docs/formulas`; a board has to answer it in
 * place, since a position is a claim being made about somebody right there.
 */
export const BOARD_MEANING =
  "Launches from this day, ordered by the endorsements they received during it. Only endorsements from accounts that already existed when the launch went live move a position here — you cannot buy history, so there is nothing for us to detect and nobody to accuse. Every endorsement still counts on the listing's own page.";

/**
 * What an empty board says.
 *
 * LC2 made this argument for the directory strip and it is sharper here: a
 * board is a competition, and a competition with nobody in it reads as a
 * broken page rather than a quiet day. So it says which day it is looking at
 * and where the rest of the product is.
 */
export const BOARD_EMPTY_NOTE = "Nothing launched on this day.";

/** The reasoning, kept verbatim behind VC0's disclosure (CF5 split it; the
 *  page now says the act in one sentence and links it). */
export const BOARD_EMPTY_WHY =
  "Launching is a separate act from publishing here — a maker chooses the morning — so a quiet day means nobody chose it, not that nothing was built.";

/** The note under an OPEN day, since its order can still move. */
export const BOARD_OPEN_NOTE =
  "This day is still running. The order can still change until it closes at midnight UTC.";

/** And under a settled one, since that is the more useful promise. */
export const BOARD_SETTLED_NOTE =
  "This day has closed. Its order is final and this address will always show it.";

/** How many days back the archive lists at once. Bounded because the index is
 *  a page and not a scroll; each day remains addressable forever regardless. */
export const BOARD_ARCHIVE_DAYS = 30;
