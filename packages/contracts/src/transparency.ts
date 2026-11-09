// What we did, counted (openproduct-commons TS5).
//
// The other half of TS-4. `appeals.ts` gives every act an answer; this gives
// every act a number, and the two only work together — an appeal path nobody
// counts is a mailbox, and a published number with no appeal path behind it
// is a statistic about people who had no say.
//
// ─── WHY THIS PAGE IS GENERATED AND NOT WRITTEN ───────────────────────────
//
// Every transparency report anybody has ever mistrusted was written by hand
// from a query somebody ran once. The failure is not dishonesty, it is drift:
// the number is true on the day it is pasted and nobody re-runs the query,
// and by the time a reader is looking at it the only honest thing about it is
// the date. 1330 wrote `moderation_acts` append-only with this milestone
// named in its own header — "the substrate of TS5's public transparency
// report, which is GENERATED from these rows rather than written by hand, so
// the number we publish and the acts we took cannot drift". This module is
// that generation, and there is no path by which a figure on the page comes
// from anywhere else.
//
// ─── THE ONE PLACE ON THIS ESTATE WHERE ZERO MEANS ZERO ───────────────────
//
// OPC-C is a rule about absence: a listing with no stars is not a listing
// with zero stars, and every surface here renders the difference, because a
// missing observation and a real nothing look identical if you let them.
//
// This page INVERTS that, and it is worth being precise about why, because
// "we made an exception to our own rule" is exactly the sentence that
// normally precedes a bad number. The ledger is not an observation of the
// world; it is the record of our own acts, written by our own handlers,
// before those acts take effect. Every path on the estate appends first and
// acts second — TS3's removals, TS4's de-indexing, TS5's own decisions — so
// "no rows" is not "we did not look", it is "we did not act". A zero here is
// a fact about us, and it is the only kind of zero this estate is entitled to
// publish plainly.
//
// The corollary, and it is not a comfortable one: this page can only be as
// honest as the ledger-first ordering, and every future milestone that acts
// on content inherits the obligation. A handler that changed something
// without appending would not make this page wrong-looking. It would make it
// wrong.
//
// ─── NOTHING HERE NAMES ANYBODY ───────────────────────────────────────────
//
// Not a slug, not a handle, not a subject id, not a count small enough to
// identify one. EN-4 already forbids per-listing discount figures — "an
// accusation about a specific product's supporters, made in public, by
// arithmetic" — and the same reasoning covers every figure on this page. The
// tombstone at the listing's own address is where a specific act is visible,
// to the people looking at that listing, saying only what it did and when.
// Here it is a count and nothing else.

import type { IntegrityReason } from "./integrity.js";
import type { FlagKind } from "./defence.js";
import type { AppealState } from "./appeals.js";
import type { ModerationAct, ReportState } from "./trust.js";

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

/**
 * How far back the report looks.
 *
 * NINETY DAYS, ROLLING, and not "all time". Two reasons, and the second is
 * the one that decided it. A cumulative total is a number that only ever goes
 * up, so it stops carrying information about how the estate is behaving NOW —
 * the figure that matters to somebody deciding whether to list here is what
 * happened last quarter, not what happened in the first month when everything
 * was new. And a cumulative total means a bad quarter is permanently diluted
 * by every good one before it, which is a very comfortable property for us
 * and a useless one for a reader.
 *
 * Rolling rather than calendar-quartered so the page is never a stale
 * document waiting for the next publication date.
 */
export const TRANSPARENCY_WINDOW_DAYS = 90;

export function transparencySince(now: number): string {
  return new Date(now - TRANSPARENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface ActCount {
  readonly act: ModerationAct;
  readonly count: number;
}

export interface ReportCount {
  readonly state: ReportState;
  readonly count: number;
}

export interface AppealCount {
  readonly state: AppealState;
  readonly count: number;
}

export interface DiscountCount {
  readonly reason: IntegrityReason;
  readonly discounted: number;
}

export interface FlagCount {
  readonly kind: FlagKind;
  readonly state: string;
  readonly count: number;
}

/**
 * Everything the page renders, and nothing it does not.
 *
 * The key set is pinned by a test (I2). Adding a field here is adding a fact
 * about people to a public page, and it should cost a conversation.
 */
export interface TransparencyReport {
  /** The window, so a reader can date every number on the page. */
  readonly since: string;
  readonly until: string;
  readonly acts: readonly ActCount[];
  readonly reports: readonly ReportCount[];
  readonly appeals: readonly AppealCount[];
  /** How many upheld appeals actually reversed something. */
  readonly appealsReversed: number;
  readonly discounts: readonly DiscountCount[];
  readonly flags: readonly FlagCount[];
}

export const TRANSPARENCY_REPORT_KEYS = [
  "since",
  "until",
  "acts",
  "reports",
  "appeals",
  "appealsReversed",
  "discounts",
  "flags",
] as const;

// ---------------------------------------------------------------------------
// Arithmetic a page must not do by hand
// ---------------------------------------------------------------------------

/**
 * A share, or null when there is no denominator.
 *
 * THE NULL IS THE WHOLE FUNCTION. "0% of appeals were upheld" over zero
 * appeals is not a small number, it is a lie with a percent sign — it reads
 * as "we granted none of them" when the truth is "nobody has asked". Every
 * rate on this page goes through here, and the page renders the null as a
 * sentence rather than as a figure.
 */
export function share(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return part / whole;
}

export function formatShare(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function total(counts: readonly { readonly count: number }[]): number {
  return counts.reduce((sum, row) => sum + row.count, 0);
}

export function countBy<T extends { count: number }>(
  counts: readonly T[],
  match: (row: T) => boolean,
): number {
  return counts.filter(match).reduce((sum, row) => sum + row.count, 0);
}

/** The discount rows count under a different key, because EN-4's disclosure
 *  was written before this page existed and its shape is pinned by its own
 *  test. Renaming it there to make one call site here tidier would edit a
 *  published contract for a cosmetic reason. */
export function discountTotal(counts: readonly DiscountCount[]): number {
  return counts.reduce((sum, row) => sum + row.discounted, 0);
}

/** How many acts in the window took something away, as against restoring it.
 *  The denominator for "how often were we wrong", and the reason the act
 *  vocabulary was paired in the first place. */
export const ACTS_AGAINST: readonly ModerationAct[] = [
  "remove",
  "delist",
  "deindex",
  "lock",
  "trust_demote",
];

export const ACTS_REVERSING: readonly ModerationAct[] = [
  "restore",
  "relist",
  "reindex",
  "unlock",
  "trust_promote",
];

export function actsAgainst(acts: readonly ActCount[]): number {
  return acts.filter((row) => ACTS_AGAINST.includes(row.act)).reduce((s, r) => s + r.count, 0);
}

export function actsReversing(acts: readonly ActCount[]): number {
  return acts.filter((row) => ACTS_REVERSING.includes(row.act)).reduce((s, r) => s + r.count, 0);
}

// ---------------------------------------------------------------------------
// What each number is called, in English
// ---------------------------------------------------------------------------

/**
 * The act vocabulary in the words a reader uses.
 *
 * A TOTAL RECORD RATHER THAN A LOOKUP WITH A FALLBACK: an act with no label
 * fails the typecheck here instead of appearing on a public page as
 * `trust_demote`, which is the kind of leak that makes a transparency report
 * read as a database dump somebody forgot to finish.
 */
export const ACT_LABELS: Record<ModerationAct, string> = {
  remove: "Listings removed",
  restore: "Listings restored",
  lock: "Discussions locked",
  unlock: "Discussions unlocked",
  delist: "Listings delisted",
  relist: "Listings relisted",
  deindex: "Listings taken out of search",
  reindex: "Listings put back into search",
  trust_promote: "Accounts given more latitude",
  trust_demote: "Accounts restricted",
  report_declined: "Reports read, no action taken",
  appeal_upheld: "Appeals upheld",
  appeal_refused: "Appeals refused",
};

export const REPORT_STATE_LABELS: Record<ReportState, string> = {
  open: "Waiting to be read",
  triaged: "Being looked at",
  actioned: "Answered by an act",
  declined: "Read, no action taken",
};

/**
 * Short names for EN3's discount reasons.
 *
 * The contract already carries prose for each — a full sentence explaining
 * what the shape was — and the page renders that beside the count. This is
 * the four-word version for the row it sits on, because a table whose left
 * column is three lines of prose is a table nobody reads across.
 */
export const DISCOUNT_REASON_LABELS: Record<IntegrityReason, string> = {
  ring: "Reciprocal groups",
  burst: "Bursts",
  "burst-new-account": "Bursts from new accounts",
  cohort: "Accounts created together",
};

export const APPEAL_STATE_LABELS: Record<AppealState, string> = {
  open: "Waiting to be read",
  upheld: "Upheld",
  refused: "Refused",
};

// ---------------------------------------------------------------------------
// The prose the page is mostly made of
// ---------------------------------------------------------------------------

export const TRANSPARENCY_TITLE = "What we removed, and how often we were wrong";

export const TRANSPARENCY_LEDE =
  "Every act of moderation on openproduct is written to an append-only record before it takes effect. This page is generated from that record — not written by hand from it — so what is published and what was done cannot drift apart.";

export const TRANSPARENCY_WINDOW_NOTE =
  "The last 90 days, rolling. Not a running total since launch: a cumulative figure only ever goes up, which makes a bad quarter permanently diluted by every good one before it. That is a comfortable property for us and a useless one for you.";

export const TRANSPARENCY_ZERO_NOTE =
  "A zero here means we did not act, not that we did not look. Everywhere else on this site a missing number is shown as missing rather than as nought, because an unobserved thing and an empty thing are different. This page is the exception, and it earns it: these are records of our own acts, written by our own code before the act takes effect.";

export const TRANSPARENCY_NAMES_NOBODY_NOTE =
  "Nothing on this page names anybody — not a listing, not a person, not a number small enough to work one out. A specific act is visible at the address it happened to, which is where the people affected by it are looking.";

export const TRANSPARENCY_REVERSAL_NOTE =
  "The number worth reading is the second one. Any estate can publish how much it removed; the figure that says whether its judgement is any good is how much it put back.";

/**
 * What a dash means, said once.
 *
 * `formatShare` renders a rate with no denominator as an em dash rather than
 * as 0%, and a dash with no explanation is its own small mystery. This is the
 * sentence that goes beside one.
 */
export const TRANSPARENCY_NO_DENOMINATOR_NOTE =
  "A dash means there is nothing to take a share of — not that the share was nought.";

export const TRANSPARENCY_APPEAL_INVITATION =
  "If one of these acts was about your listing, you can appeal it, and the outcome is counted here whichever way it goes.";

/** Where the numbers come from, said on the page so it is checkable rather
 *  than trusted. Each entry names a real table. */
export const TRANSPARENCY_SOURCES = [
  {
    figures: "Acts",
    from:
      "The append-only moderation record. Every handler that changes anything writes here first and acts second, so an act that was carried out but not recorded is not a gap in this page — it is a bug in the code that would show up as an unexplained state.",
  },
  {
    figures: "Reports",
    from:
      "The report queue. Counted by where each one got to, including the ones a person read and decided needed nothing — an estate that publishes only its removals is publishing a boast.",
  },
  {
    figures: "Appeals",
    from:
      "The appeals table, by where each one got to, with refusals counted beside upholds for the same reason. The reversal figure is counted separately and on the date it was decided rather than the date it was filed, so a reversal appears in the window it actually happened in.",
  },
  {
    figures: "Endorsements not counted",
    from:
      "The endorsement integrity record, by reason only. Never by listing and never by person: a per-listing figure is an accusation about a specific product's supporters, made in public, by arithmetic.",
  },
  {
    figures: "Automatic checks",
    from:
      "The flag queue, by kind and outcome. The dismissal share is the production false-positive rate of the checks published at /docs/checks.",
  },
] as const;

/** What this page will not do, published beside what it does. */
export const TRANSPARENCY_REFUSALS = [
  {
    refused: "Naming a listing we acted on",
    because:
      "A list of removed products is a permanent public accusation, readable by people who will never see the case for it, about makers who mostly are not here to answer. The act is already visible at the listing's own address, dated, to the people actually looking at it.",
  },
  {
    refused: "Breaking the numbers down far enough to identify anybody",
    because:
      "Three removals in a category with four listings is a name. Every figure here is estate-wide for that reason, and staying coarse is the cost of being able to publish anything at all.",
  },
  {
    refused: "Publishing the reasons we gave",
    because:
      "A reason is written to be read by the person it is about and by whoever reviews the decision later. Published in bulk it becomes a corpus of judgements about individuals, none of whom agreed to be a case study.",
  },
] as const;
