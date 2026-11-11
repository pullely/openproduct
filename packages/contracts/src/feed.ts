// The launch feed (openproduct-launch OL2).
//
// WHAT THIS IS, AND WHAT IT IS NOT.
//
// It is the front page: a handful of recent days, each one's launches in the
// order the board already put them in, newest day first. It is NOT a new
// ranking. OL-2a settled that — LC3's board computes and stores exactly this
// ordering and publishes its formula at `/docs/formulas` under
// `launch.board-rank`, and a second daily order beside it would give the
// estate two different answers to "what was #1 that day".
//
// So everything here is about GROUPING and PRESENTATION. There is no rank
// function in this file, deliberately: `rankBoard` is the rank function, it
// lives in `board.ts`, and the day this file grows one is the day the front
// page and the archive can disagree.
//
// ─── WHY THE GROUPS ARE THREE AND NOT N ───────────────────────────────────
//
// The design draws Today / Yesterday / Earlier this week. Two of those are
// exact days and the third is a bucket, and that asymmetry is the point: a
// reader returning daily wants yesterday separated out (did I miss anything?)
// and does not want six more headings after it. `Earlier` keeps its launches
// in day order so nothing is lost — it just stops naming each day, because
// `/launches/{day}` is where a specific past day lives.

import type { MediaThumbnail } from "./media.js";
import { type BoardDay, dayOf, formatDayId, previousDay } from "./board.js";
import { frontPageEligible } from "./completeness.js";
import type { PublicProfileCard } from "./index.js";
import { LAUNCH_HOW_HREF } from "./launch-act.js";
import type { FormulaId } from "./provenance.js";
import { byMostActive } from "./ranking.js";

/**
 * How far back the feed reaches.
 *
 * Seven days, which is "this week" as the design labels it, and the same
 * window LC1's digest covers — so a reader who scrolls to the bottom of the
 * feed and a reader who opens the digest are looking at the same span of
 * time. A number that two surfaces share is one fewer thing to reconcile.
 *
 * It is a WINDOW, not a page size. Every day inside it renders in full: a
 * feed that dropped a launch because the week was busy would be a feed a
 * maker could vanish from by launching on a popular day.
 */
export const FEED_WINDOW_DAYS = 7;

/** The three headings the design draws, in the order it draws them. */
export type FeedGroupId = "today" | "yesterday" | "earlier";

export const FEED_GROUP_IDS = ["today", "yesterday", "earlier"] as const;

/**
 * Which group a day belongs to, relative to the day the reader is in.
 *
 * Returns null for a day outside the window — including a FUTURE one, which
 * is not a paranoid case: `launched_at` is the moment the maker chose (LC0)
 * and nothing stops them choosing one an hour ahead. A future launch is not
 * "today"; it is not on the feed yet.
 */
export function feedGroupFor(day: BoardDay, today: BoardDay): FeedGroupId | null {
  if (day.id === today.id) return "today";
  if (day.id === previousDay(today).id) return "yesterday";
  return withinWindow(day, today) ? "earlier" : null;
}

/** Is this day inside the feed's window, and not ahead of it? */
function withinWindow(day: BoardDay, today: BoardDay): boolean {
  const oldest = feedWindowDays(today).at(-1)!;
  return day.id <= today.id && day.id >= oldest.id;
}

/**
 * The day ids the feed covers, newest first.
 *
 * The read asks for exactly these, so the window is decided HERE rather than
 * in SQL. A `WHERE launched_at > now() - interval '7 days'` would make the
 * window a property of the database's clock and of when the query ran, and
 * two readers a second apart could then see different feeds — which is the
 * cacheable-document rule (OPC-1) broken by a detail nobody would look at.
 */
export function feedWindowDays(today: BoardDay): BoardDay[] {
  const days: BoardDay[] = [today];
  for (let i = 1; i < FEED_WINDOW_DAYS; i += 1) {
    days.push(previousDay(days[days.length - 1]!));
  }
  return days;
}

/** The day the feed calls "today", from a clock. UTC, per OL-2. */
export function feedToday(now: number | Date): BoardDay {
  return dayOf(now);
}

// ---------------------------------------------------------------------------
// The entry
// ---------------------------------------------------------------------------

/**
 * One launch, as a feed row renders it.
 *
 * A SUPERSET OF THE BOARD'S ENTRY, and the extra fields are the card facts
 * the design's row shows beside the name: the licence, the topics, the stack,
 * how many people the listing is looking for. The board's own page shows a
 * denser list and does not need them; the feed row is the design's primary
 * unit and does.
 */
export interface FeedEntry {
  readonly launchId: string;
  /** The listing's slug, which on this estate IS its name — there is no
   *  display-name column, and a feed that rendered some other string would be
   *  the one surface calling a product something the rest of the site does
   *  not. */
  readonly slug: string;
  readonly tagline: string | null;
  readonly versionLabel: string;
  /** ISO 8601 — the moment they chose (LC0), never a sweep's clock. */
  readonly launchedAt: string;
  /** The day id this launch belongs to, so a row can address its own board. */
  readonly day: string;
  /**
   * The position the BOARD gave it on its day, 1-based.
   *
   * Read, never computed. `null` when the sweep has not ranked the day yet —
   * which is a real state on a day that has just begun, and renders as an
   * absent rank rather than as a zero or a guess (OPC-C).
   */
  readonly rank: number | null;
  /** Board-eligible endorsements received during the day: the number that
   *  decided `rank`, and the number the row displays. One number, so the
   *  order and the figure beside it can never disagree. */
  readonly counted: number;
  /**
   * Endorsements during the day from accounts younger than the launch.
   * PUBLISHED, for LC3's reason: a maker whose launch was shared somewhere
   * popular can otherwise see a position that does not match the total on
   * their own page with no way to account for the gap.
   */
  readonly ineligible: number;
  /** Observed at publish, not a maintainer's claim (OPC-7). */
  readonly licence: string | null;
  /** CT1's category, promoted to the row's first topic. TP0 makes these
   *  addresses; until then they are words. */
  readonly topics: readonly string[];
  /** The listing's canonical stack, for the row's last meta item. */
  readonly stack: readonly string[];
  /** CB2's demand line. Zero means the listing is not asking for anybody,
   *  which is a fact rather than an absence, so the row simply omits the
   *  badge — it does not render "0 people wanted". */
  readonly roleOpeningCount: number;
  /** How many posts the launch's discussion holds. */
  readonly commentCount: number;
  /**
   * MD3 — the hero, for the row's tile; `null` keeps the monogram. NEVER AN
   * ORDERING INPUT: the board ranks, this handler reads, and a thumbnail is
   * a picture of a product, not a fact about it (OPC-4, MD-3).
   */
  readonly thumbnail: MediaThumbnail | null;
}

export const FEED_ENTRY_KEYS = [
  "launchId",
  "slug",
  "tagline",
  "versionLabel",
  "launchedAt",
  "day",
  "rank",
  "counted",
  "ineligible",
  "licence",
  "topics",
  "stack",
  "roleOpeningCount",
  "commentCount",
  // MD3 — the row's picture. This literal edit is the reviewable act.
  "thumbnail",
] as const;

/** One heading and the launches under it. */
export interface FeedGroup {
  readonly id: FeedGroupId;
  /** What the heading says. `Earlier this week` names no day because it
   *  holds several; the other two name theirs, so a reader can tell which
   *  UTC day "today" currently is without doing the arithmetic. */
  readonly heading: string;
  /** The exact day, for the two groups that are one — null for `earlier`. */
  readonly day: string | null;
  readonly entries: readonly FeedEntry[];
}

export interface Feed {
  /** The day the feed treated as today, so a cached document says which one
   *  it is rather than leaving a reader to infer it. */
  readonly today: string;
  readonly groups: readonly FeedGroup[];
}

/**
 * Assemble the feed from entries that already carry their day and rank.
 *
 * PURE — entries in, groups out, no clock beyond the `today` it is handed and
 * no database. The same property `rankBoard` and EN3's assessor have, and for
 * the same reason: an order a test cannot reproduce exactly is an order
 * nobody can check.
 *
 * WITHIN A GROUP the order is: the day, newest first, then the board's rank
 * inside that day. So `earlier` reads as several days stacked rather than as
 * one pooled list — pooling them would put a quiet Tuesday's winner above a
 * busy Thursday's runner-up and imply a comparison the board never made.
 *
 * An entry with no rank sorts last within its day. The sweep has not spoken
 * about it yet, and a missing rank is not rank 0.
 */
export function buildFeed(today: BoardDay, entries: readonly FeedEntry[]): Feed {
  const groups: FeedGroup[] = [];
  for (const id of FEED_GROUP_IDS) {
    const mine = entries
      .filter((entry) => feedGroupFor(dayFromId(entry.day), today) === id)
      .sort(
        (a, b) =>
          b.day.localeCompare(a.day) ||
          (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
          a.slug.localeCompare(b.slug),
      );
    // HB1 — TODAY IS ALWAYS A BLOCK, empty or not. A front page with no
    // "Today" on a quiet day reads as a page that forgot what day it is; an
    // empty Today says *Nothing launched today* in one sentence and points
    // at how launching works. The other two groups still drop when empty —
    // a heading over an empty *Yesterday* would be the same page telling
    // you it is broken.
    if (mine.length === 0 && id !== "today") continue;
    groups.push({ id, heading: feedHeading(id, today), day: dayForGroup(id, today), entries: mine });
  }
  return { today: today.id, groups };
}

/**
 * HB1 — is there nothing on the board at all?
 *
 * Not `groups.length === 0` any more: Today is always present. The question
 * a page asks is whether every block is empty, and this is the one place it
 * is answered.
 */
export function feedIsEmpty(feed: Pick<Feed, "groups">): boolean {
  return feed.groups.every((group) => group.entries.length === 0);
}

/**
 * What the front page's launches block says when the week had none. One
 * sentence, then the how.
 *
 * "THIS WEEK", NOT "TODAY". HB1 made Today a block of its own so an empty
 * one could say so; the front page no longer draws the three time blocks —
 * it is the product list, and the week's launches are one block under it
 * (openproduct-products PL0). `buildFeed` still keeps Today in the DOCUMENT,
 * because the archive, the day card and every core test read that shape;
 * only the sentence the page renders over an empty week changed.
 */
export const FEED_WEEK_EMPTY_NOTE = "Nothing launched this week.";

/** Where "how launching works" is written down — CF5's one address. */
export const FEED_HOW_HREF: string = LAUNCH_HOW_HREF;

export const FEED_HOW_LABEL = "How launching works";

/** `2026-08-26` back to a day. The ids in a feed come from the same code that
 *  formatted them, so this does no validation — `parseDayId` is the one that
 *  guards an address a stranger typed. */
function dayFromId(id: string): BoardDay {
  const [year, month, day] = id.split("-").map(Number) as [number, number, number];
  return { id: formatDayId(year, month, day), year, month, day };
}

function dayForGroup(id: FeedGroupId, today: BoardDay): string | null {
  if (id === "today") return today.id;
  if (id === "yesterday") return previousDay(today).id;
  return null;
}

/**
 * What a group's heading says — the design's three words.
 *
 * "Today" alone is a relative label on a document that is cached and may be
 * read minutes after midnight, so the two exact days still NAME THEMSELVES:
 * the date travels beside the heading as `day`, and the page draws it as the
 * heading's meta (`Today · 4 Sept 2026`) exactly where the prototype does.
 * The label and the date are two fields rather than one string so the page
 * can set them in two faces, as the design draws them.
 */
export function feedHeading(id: FeedGroupId, _today: BoardDay): string {
  if (id === "today") return "Today";
  if (id === "yesterday") return "Yesterday";
  return "Earlier this week";
}

/**
 * Is this entry the day's winner, and is that day today?
 *
 * `#1 today` renders in exactly one place: rank 1, inside the today group.
 * Yesterday's winner does not keep a badge — the archive at `/launches/{day}`
 * is where a past day's order lives, and a badge that outlived its day would
 * be a claim a reader cannot check against anything.
 */
export function isFirstToday(entry: FeedEntry, today: BoardDay): boolean {
  return entry.rank === 1 && entry.day === today.id;
}

// ---------------------------------------------------------------------------
// What the page says
// ---------------------------------------------------------------------------

/** The formula behind the order — the BOARD's, not a second one. Every
 *  surface that ranks a day resolves to this id, which is what stops the feed
 *  and the archive from being two different claims (OPC-4, OL-2a). */
export const FEED_FORMULA: FormulaId = "launch.board-rank";

/**
 * The sentence under the feed's title.
 *
 * It has one job the design's heading cannot do: say WHEN the day turns over.
 * A reader who sees `#1 today` at 23:50 and again at 00:10 has watched a
 * ranking reset, and a page that never named the boundary would look broken
 * rather than daily.
 */
export const FEED_MEANING =
  "Launches from the past week, newest day first, each day in the order its upvotes put it in. A day runs from midnight to midnight UTC, and only upvotes from accounts that already existed when a launch went live move a position — you cannot buy history, so there is nothing for us to detect and nobody to accuse. Every upvote still counts on the listing's own page.";

/**
 * What an empty feed says.
 *
 * LC2 made this argument for the directory strip and LC3 sharpened it for the
 * board: a ranked list with nobody in it reads as a broken page rather than
 * as a quiet week. So it says what launching IS here, and points at the
 * directory — which is full even when the week is not.
 */
export const FEED_EMPTY_NOTE =
  "Nothing has launched this week. Launching is a separate act from publishing here — a maker chooses the morning — so a quiet week means nobody chose one, not that nothing was built.";


// ---------------------------------------------------------------------------
// Everything else — the launches page shows EVERY product
// ---------------------------------------------------------------------------

/**
 * The catalogue's heading — and the front page's, because the catalogue IS
 * the front page (openproduct-products PL0).
 *
 * It was "All products" while the week's three time blocks sat above it and
 * this was the fourth group under them. The list is the page now: `/` is
 * titled by this word, `/products/{cursor}` continues under it, and the
 * week's launches are the block that follows the list rather than the one it
 * follows. There is no directory beside it, so this is where every published
 * product is.
 */
// OB4 — the list is *Open builds*, and its continuation pages say so.
export const FEED_CATALOGUE_HEADING = "Open builds";

/** The front page's title (openproduct-open-builds OB4, D1): the list of
 *  builds IS the page. The day board left it; each day keeps its archive at
 *  `/launches/{day}`. */
export const FEED_PAGE_HEADING = "Open builds";

/** The line under it: what every entry is. */
export const FEED_PAGE_SUBTITLE = "Every build is a public repo and a public workspace, moving in the open.";

/**
 * The launches block's heading, under the list.
 *
 * ONE BLOCK, NOT THREE. The document still arrives as Today / Yesterday /
 * Earlier this week (`buildFeed`, HB1) and the archive at `/launches/{day}`
 * still ranks each day on its own; the front page draws the week as one
 * run of days, newest first, each day named on its own rule and linked to
 * its board. What a reader loses is the daily scoreboard — "#1 today" — and
 * that is the point: a product list is not a board, and the board keeps its
 * own address.
 */
export const FEED_LAUNCHES_HEADING = "New this week";

/** The published order the fourth group takes — the directory's own default. */
export const FEED_CATALOGUE_FORMULA: FormulaId = "sort.most-active";

/**
 * OS5 — the catalogue's moment, beside its heading.
 *
 * The rows came from a table the sweep computed at `computedAt`, and a page
 * built from a moment says the moment (OPC-7): "as of 12:40 UTC". Null while
 * the page is served from the live join, in which case there is no moment
 * to say and the line is not rendered — the sweep's health row is where
 * "never computed" is reported, not the front page.
 */
export function catalogueMomentCopy(computedAt: string | null): string | null {
  if (computedAt === null) return null;
  const at = Date.parse(computedAt);
  if (Number.isNaN(at)) return null;
  const d = new Date(at);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `as of ${hh}:${mm} UTC`;
}

/** What the fourth group's meta says. */
/**
 * The catalogue heading's line (openproduct-worldclass-v2 HB0, WC2-6).
 *
 * `count` is what the front page shows; `belowFloor` is what the directory
 * holds that the floor (IN3, WC-D) keeps off it. A count that excludes
 * something says so at the point of use, with the excluded number — a first
 * reader cannot otherwise tell *there is one product* from *one product
 * qualifies*, and on the day the corpus is real that difference is the
 * maker's whole question. Zero below the floor renders the line it always
 * rendered.
 */
export function feedCatalogueMeta(count: number, belowFloor: number = 0, total: number | null = null): string {
  const noun = (n: number) => (n === 1 ? "product" : "products");
  // OS1 — the page is the first of several: say so with the real count, a
  // `count(*)` over every listed row, never the page's length.
  const beyond = total !== null && total > count + belowFloor;
  if (belowFloor <= 0) {
    return beyond
      ? `first ${count} of ${total.toLocaleString("en-US")} ${noun(total)} · most active first`
      : `${count} ${noun(count)} · most active first`;
  }
  return beyond
    ? `first ${count} of ${total.toLocaleString("en-US")} on the front page · ${belowFloor} more below the floor`
    : `${count} ${noun(count)} on the front page · ${belowFloor} more below the floor`;
}

/** Where the line's arrow goes: the paragraph on `/docs` that names the floor's fields. */
export const FEED_FLOOR_HREF = "/docs#floor";

/**
 * How many published listings the front page is NOT showing because they are
 * below the floor: in the directory, not already on a board, and not
 * eligible. The complement of `catalogueBeyondFeed` over the same two inputs,
 * so the two numbers on the heading are two reads of one array (WC-7).
 */
export function catalogueBelowFloor(cards: readonly PublicProfileCard[], feed: Feed): number {
  const shown = new Set(feed.groups.flatMap((group) => group.entries.map((e) => e.slug)));
  return cards.filter((card) => !shown.has(card.slug) && !frontPageEligible(card)).length;
}

/**
 * Every published product the week's groups do not already show, that clears
 * the front-page floor.
 *
 * PURE — cards and the feed in, cards out. A launch that placed this week
 * is already on the page under its day and is not repeated; everything else
 * is listed once, in the directory's published default order (most active
 * first, then newest).
 *
 * ─── IN3'S FLOOR IS A FILTER, AND NOTHING ELSE ─────────────────────────────
 *
 * `frontPageEligible` runs BEFORE the sort and answers a boolean, so it can
 * only remove — it cannot move anything. Two listings that both clear the
 * floor hold exactly the order `byMostActive` gave them before this line
 * existed, and a listing that does not clear it is ABSENT rather than pushed
 * down. That is WC-D's answer in one expression, and the property is asserted
 * in `feed.test.ts` rather than left to reading: the failure it guards
 * against is somebody later scoring completeness and folding it into the
 * comparator, which would be two lines and would look like a refinement.
 *
 * THE WEEK'S GROUPS ARE NOT FILTERED. A listing that launched is on the board
 * because the board's own published rule put it there, and quietly dropping a
 * launch out of its day would make the front page and the day's archive at
 * `/launches/<day>` two different claims about the same day (OL-2a). The
 * floor governs the catalogue, which is the list a maker's listing enters by
 * existing rather than by doing something.
 */
export function catalogueBeyondFeed(
  cards: readonly PublicProfileCard[],
  feed: Feed,
): PublicProfileCard[] {
  const shown = new Set(feed.groups.flatMap((group) => group.entries.map((e) => e.slug)));
  return cards
    .filter((card) => !shown.has(card.slug) && frontPageEligible(card))
    .sort(byMostActive);
}
