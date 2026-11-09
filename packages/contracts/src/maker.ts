// The maker page's three tabs (openproduct-launch MP0).
//
// A maker page has, since CG1, been a page about a person's STANDING: the
// listings they run, the places they hold, the month the page began. MP0 adds
// what they DID — launched, upvoted, commented — and that is a different kind
// of claim, so the reasoning about each one belongs here rather than in a
// component.
//
// ─── WHY "UPVOTED" CAN BE A PUBLIC TAB AT ALL ─────────────────────────────
//
// Because the button already said so. EN0 split the save from the endorsement
// precisely so the private gesture would stay private, and the sentence beside
// every vote control on this estate reads: "An upvote is public and has your
// name on it. To keep something for yourself, save it instead — a save is
// private and is counted nowhere." This tab is that promise being kept, not a
// new disclosure: it publishes nothing the control did not tell somebody it
// would publish at the moment they pressed it.
//
// THE SAVE IS NOT A TAB, AND NEVER WILL BE. Every row in `saved_products` was
// created under the opposite promise, by people who cannot be asked, and no
// milestone gets to spend that. The absence of a fourth tab is the point.
//
// A WITHDRAWN UPVOTE IS ABSENT, not struck through and not "formerly upvoted".
// Withdrawal is the act of unsaying something in public, and a page that kept
// the record would make it unsayable.
//
// ─── WHY "COMMENTS" IS A LIST OF LISTINGS, NOT OF POSTS ───────────────────
//
// Every post is already public and already carries its author's handle (CB0),
// so nothing here is newly visible. What IS new is the AGGREGATION: a
// per-person index of everywhere somebody has spoken is a different artefact
// from the same words scattered across the products they were about, and it is
// the artefact people are quoted from.
//
// So the tab lists the LISTINGS a person has commented on, newest comment
// first, with the count — the same shape as the other two tabs, and enough to
// find the conversation. It does not reproduce the text of what they said on a
// page they did not write it on. A reader who wants the words follows the link
// to the discussion, where the post sits in the thread that gives it its
// meaning.
//
// ─── THE COUNTERS ARE THE TABS ────────────────────────────────────────────
//
// The design draws three numbers in the header — launched, followers, upvotes
// given — and two of them are the lengths of two of the tabs. That is
// deliberate here: a counter that does not agree with the list beneath it is
// the defect this milestone is most likely to ship, so they are the SAME
// number, computed once and rendered twice (OL-2a's rule, applied to a count).

import type { MediaThumbnail } from "./media.js";
import type { FormulaId } from "./provenance.js";

/** The three tabs, in the design's order. */
/** PE1 — `history` is the fourth: every act, dated, newest first. */
export const MAKER_TABS = ["launched", "upvoted", "comments", "history"] as const;
export type MakerTab = (typeof MAKER_TABS)[number];

/** The default. `launched` is what a maker page is FOR, and it is the tab a
 *  bare `/@handle` renders — so the canonical address has no segment on it. */
export const MAKER_TAB_DEFAULT: MakerTab = "launched";

export const MAKER_TAB_LABELS: Record<MakerTab, string> = {
  // OB6 — the default tab is the person's BUILDS: every listing they run,
  // one list. It merged *Launched* (a launch site's noun) with the
  // *Maintains* section under it. The id stays `launched` — it is the bare
  // `/@handle` address and other code keys on it.
  launched: "Builds",
  upvoted: "Upvoted",
  comments: "Comments",
  history: "History",
};

export const MAKER_TAB_FORMULAS: Record<MakerTab, FormulaId> = {
  launched: "maker.launched",
  upvoted: "maker.upvoted",
  comments: "maker.comments",
  history: "maker.history",
};

/**
 * What each tab says when it is empty.
 *
 * NOT "NOTHING" IN THREE DIFFERENT VOICES. Each names what is absent and what
 * would fill it, because "no launches" and "this page is broken" look
 * identical to a stranger otherwise (the OD5 finding, at the level of a tab).
 * None of them is a judgement: a maker who has not launched has not failed at
 * anything.
 */
export const MAKER_TAB_EMPTY: Record<MakerTab, string> = {
  launched: "Nothing launched yet.",
  upvoted: "No upvotes yet.",
  comments: "No comments yet.",
  history: "No history yet.",
};

/**
 * A tab a stranger typed, or null.
 *
 * `launched` PARSES BUT IS NOT AN ADDRESS. `/@ada/launched` and `/@ada` would
 * otherwise be two addresses for one document, which is the duplicate a
 * canonical tag has to clean up afterwards. The route hands back null for it
 * and the page 404s, exactly as UV2's leaderboard does with `week`.
 */
export function parseMakerTab(value: string | null | undefined): MakerTab | null {
  if (typeof value !== "string") return null;
  return (MAKER_TABS as readonly string[]).includes(value) ? (value as MakerTab) : null;
}

/**
 * Where a tab lives.
 *
 * A PATH SEGMENT, NOT A QUERY PARAMETER, and that is not a style preference.
 * A Next page that reads `searchParams` is dynamic: its `revalidate` is
 * accepted and silently ignored and every response goes out `no-store`. UV2
 * shipped `?range=month` and the budget lane caught it reading the response
 * header rather than the source — the same mistake here would make every maker
 * page uncacheable, which is the most-linked surface on the estate.
 */
export function makerPath(handle: string, tab: MakerTab = MAKER_TAB_DEFAULT): string {
  return tab === MAKER_TAB_DEFAULT ? `/@${handle}` : `/@${handle}/${tab}`;
}

/** The segments that get their own route. `launched` is absent: it is the bare
 *  address, and a second address for it would be a duplicate document. */
export function makerTabSegments(): readonly Exclude<MakerTab, "launched">[] {
  return MAKER_TABS.filter((t) => t !== MAKER_TAB_DEFAULT) as Exclude<MakerTab, "launched">[];
}

// ---------------------------------------------------------------------------
// The rows
// ---------------------------------------------------------------------------

/** One launch of a listing this person maintains. */
export interface MakerLaunch {
  readonly launchId: string;
  readonly slug: string;
  readonly tagline: string | null;
  readonly versionLabel: string | null;
  readonly day: string;
  /** The board's own rank for that day, or null while the day is still open.
   *  OL-2a: read from what the sweep stored, never recomputed here. */
  readonly rank: number | null;
  /** The discounted public count (EN2/EN3). */
  readonly counted: number;
  /** The listing's logo, for the row's tile; `null` keeps the monogram
   *  (openproduct-studio OSD3). */
  readonly thumbnail: MediaThumbnail | null;
}

/** One listing this person upvoted. */
export interface MakerUpvote {
  readonly slug: string;
  readonly tagline: string | null;
  /** When THEY upvoted it — the fact this list is ordered by. */
  readonly at: string;
  /**
   * Whether it counts toward the listing's public total yet.
   *
   * TS1's trust floor records an upvote from a new account and does not count
   * it. The act is theirs either way, so it is listed — and the row says
   * which, because a reader assuming it was counted would be reading a number
   * this page never claimed.
   */
  readonly counting: boolean;
  /** The listing's logo, for the row's tile; `null` keeps the monogram
   *  (openproduct-studio OSD3). */
  readonly thumbnail: MediaThumbnail | null;
}

/** One listing this person has commented on. */
export interface MakerComment {
  readonly slug: string;
  readonly tagline: string | null;
  /** How many of their comments are on it. Their own, never the thread's. */
  readonly comments: number;
  /** Their most recent comment on it, which is what the list is ordered by. */
  readonly lastAt: string;
  /** The thread to open. Null when their comments are spread over more than
   *  one, in which case the listing's own discussion is the honest landing. */
  readonly threadId: string | null;
  /** The listing's logo, for the row's tile; `null` keeps the monogram
   *  (openproduct-studio OSD3). */
  readonly thumbnail: MediaThumbnail | null;
}

/**
 * The counts in the header, and each is the length of a tab.
 *
 * NO `followers` HERE, deliberately. FL0 already publishes it on the
 * contributor projection, and a second copy in a second shape is a second
 * number that can be wrong — the design draws it beside these three, and the
 * page reads it from the one place it lives.
 */
export interface MakerCounts {
  readonly launched: number;
  readonly upvotesGiven: number;
  readonly comments: number;
}

/** The design's three, in its order, as `{value} {label}` pairs. */
export const MAKER_COUNTER_LABELS = {
  // OB6 — counts the Builds list it sits above: listings they run, published.
  launched: "builds",
  followers: "followers",
  upvotesGiven: "upvotes given",
} as const;

export const MAKER_COUNTER_FORMULAS: Record<keyof typeof MAKER_COUNTER_LABELS, FormulaId> = {
  launched: "contributor.maintains",
  followers: "contributor.followers",
  upvotesGiven: "maker.upvoted",
};

/**
 * How many rows a tab shows.
 *
 * Bounded because this is a public page whose row count grows with a person's
 * whole history, and an unbounded read is a page that gets slower every year
 * for the people who used the product most.
 */
export const MAKER_TAB_LIMIT = 50;

/**
 * PE1 — contribution history (openproduct-worldclass-v2).
 *
 * A DATED LIST OF THE PERSON'S OWN ACTS, and nothing else: what they
 * launched, commented on, upvoted, and the roles they confirmed — each a
 * row that is THEIR record, in the order it happened, newest first. Nothing
 * here is scored, ranked or totalled: the three counters live in the header
 * and mean what their formulas say; this list is the ledger those counters
 * are drawn from, readable one act at a time.
 *
 * PAGED BY CURSOR, NOT BY NUMBER. The cursor is the moment of the last row
 * shown, and the next page is everything before it — so a page's address
 * (`/@ada/history/<moment>`) names a stable slice of the past rather than
 * "page 3", which changes meaning every time the person acts again. It is a
 * path segment, not a query string (OPC-1): every page is one cacheable
 * document.
 */
export const MAKER_HISTORY_KINDS = ["launched", "commented", "endorsed", "confirmed"] as const;
export type MakerHistoryKind = (typeof MAKER_HISTORY_KINDS)[number];

export interface MakerHistoryEntry {
  readonly kind: MakerHistoryKind;
  /** ISO 8601 — the moment of the act. The order is this. */
  readonly at: string;
  readonly slug: string;
  readonly tagline: string | null;
  /** The version launched, the thread commented in, the role confirmed — or nothing. */
  readonly detail: string | null;
  /** A thread id for a comment, so the row can land on the words. */
  readonly ref: string | null;
  /** The listing's logo, for the row's tile; `null` keeps the monogram
   *  (openproduct-studio OSD3). */
  readonly thumbnail: MediaThumbnail | null;
}

export const MAKER_HISTORY_KEYS = ["kind", "at", "slug", "tagline", "detail", "ref", "thumbnail"] as const;

/** How a row reads, before the listing's name. Verbs, not scores. */
export const MAKER_HISTORY_VERB: Record<MakerHistoryKind, string> = {
  launched: "Launched",
  commented: "Commented on",
  endorsed: "Upvoted",
  confirmed: "Confirmed a role on",
};

/** Rows per page. Smaller than the tabs' limit: a page of acts is read, not scanned. */
export const MAKER_HISTORY_LIMIT = 30;

export const MAKER_HISTORY_EARLIER_LABEL = "Earlier";

/** `/@ada/history`, or the page before a moment. */
export function makerHistoryPath(handle: string, before: string | null = null): string {
  const base = makerPath(handle, "history");
  return before ? `${base}/${encodeURIComponent(before)}` : base;
}

/** A cursor is a moment. Anything else is a 404, never a guess. */
export function parseHistoryCursor(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  })();
  if (!decoded || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(decoded)) return null;
  return Number.isFinite(Date.parse(decoded)) ? decoded : null;
}

/** Whether a counter and its list can disagree — they can, above the limit,
 *  and the page says so rather than letting a reader count the rows and
 *  conclude the number is wrong. */
export function makerListTruncated(count: number, shown: number): boolean {
  return count > shown;
}

export function makerTruncationNote(count: number, shown: number): string | null {
  if (!makerListTruncated(count, shown)) return null;
  return `Showing the most recent ${shown} of ${count}.`;
}

/**
 * Why `launched` and the listings below it are different numbers
 * (openproduct-worldclass VC2).
 *
 * ─── THE FINDING ──────────────────────────────────────────────────────────
 *
 * The 7 Sep audit, on a real profile: **`0 launched` above `MAINTAINS · 2
 * listings they run, published`**. Both numbers are correct and each already
 * carries its own published sentence behind a `?`. Neither says the other
 * exists, so a reader who does not already know that publishing and launching
 * are separate acts (LC0) reads a page disagreeing with itself — and a
 * directory whose whole pitch is that its numbers are trustworthy cannot
 * afford to be read that way for the length of a scroll.
 *
 * **WC-7 asks for exactly this and no more:** where two counts legitimately
 * differ, the difference is *published at an address* and *linked from the
 * number*, never left for the reader to infer. The addresses existed; the
 * sentence connecting them did not.
 *
 * ─── ONLY WHEN THEY DIFFER ────────────────────────────────────────────────
 *
 * `null` when the two agree. A note explaining a discrepancy that is not on
 * the page is noise at best, and at worst it teaches a reader to expect one —
 * which is the opposite of what it is for.
 *
 * Deliberately says nothing about WHICH is larger. Either direction is
 * ordinary: a maintainer can publish without ever launching, and a person can
 * have launched something they have since handed over.
 */
export function launchedVsMaintainsNote(launched: number, maintains: number): string | null {
  if (launched === maintains) return null;
  return "Publishing a listing and launching it are separate acts, so these two numbers are counting different things and often differ.";
}
