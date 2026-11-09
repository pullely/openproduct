// The week, published (openproduct-commons LC1).
//
// A PAGE AND A FEED BEFORE AN EMAIL, which is LC-5 and is not a sequencing
// convenience. `/digest/2026-w34` needs no address, works at any volume, is
// linkable and crawlable and archivable, and is the same document for
// everybody — where an email needs a list, a sender reputation, an
// unsubscribe, and a copy of somebody's address living somewhere. Email is
// DELIVERY. This is the thing being delivered, and it has to be good on its
// own before anybody is asked for an address.
//
// ─── THE ZERO-LAUNCH WEEK IS THE DESIGN CONSTRAINT ────────────────────────
//
// A digest that looks right with twenty launches and broken with none is a
// digest that cannot ship until the catalog is already busy — which is
// exactly backwards, because the digest is one of the few things that makes a
// quiet catalog compound (LC's own note on cold start). So the shape here is
// built from the empty week outward: every section states what it holds
// including when that is nothing, and a week with no launches is a sentence
// rather than a gap.
//
// AND IT NEVER PADS. The tempting fix for an empty week is to widen the
// window until something appears — "the last few weeks' launches" under a
// heading naming one week. That is a lie about a date, on an archive whose
// only value is that its dates are exact. An empty week says it was empty.
//
// ─── EVERY NUMBER CARRIES ITS PROVENANCE ──────────────────────────────────
//
// I7 and I9 apply here exactly as on the product page: an ordering owes a
// published sentence, and an observed number owes the moment it was observed.
// The digest's one ordering is `digest.most-endorsed`, and it is NOT
// `endorsements.7d` — that metric is a TRAILING seven days from the last
// sweep, which for an archived week would answer about the wrong days
// entirely. A digest for week 34 read in week 40 must say what happened in
// week 34.

import type { FormulaId } from "./provenance.js";
import type { DigestChange } from "./snapshots.js";
import type { WeekId } from "./weeks.js";

/** One launch, as the digest and its feeds carry it. */
export interface DigestLaunch {
  readonly slug: string;
  readonly tagline: string | null;
  readonly versionLabel: string;
  readonly launchedAt: string;
}

/** One listing in the week's most-endorsed. */
export interface DigestEndorsed {
  readonly slug: string;
  readonly tagline: string | null;
  /** Endorsements received DURING the week — not a running total. */
  readonly endorsements: number;
}

/**
 * A week's authored note.
 *
 * ALWAYS SIGNED, and the byline is required rather than optional. LC-4's rule
 * is that editorial judgement is allowed only where it is attributable, and a
 * digest note is editorial by definition — it is somebody saying what they
 * thought mattered. An unsigned one is the thumb on the scale that this
 * product's default ordering refuses to be, wearing a friendlier voice.
 */
export interface DigestNote {
  readonly body: string;
  /** The curator's handle. A link to a CG profile, never a bare name. */
  readonly byHandle: string;
  readonly writtenAt: string;
}

export interface Digest {
  readonly week: WeekId;
  readonly launches: readonly DigestLaunch[];
  /**
   * PV4 — THE LEAD, and the reason it sits above `endorsed` in this shape.
   *
   * The digest led with a count: the week's most-endorsed, which is a ranking
   * of how much attention things got. That is the thing every other directory
   * leads with and the thing this epic has spent its length arguing is not
   * the interesting question. What CHANGED is.
   *
   * At most `DIGEST_CHANGE_LIMIT`, ordered by `digestLead` — observed changes
   * first, then alphabetically. Never by popularity, activity or recency.
   */
  readonly changed: readonly DigestChange[];
  readonly endorsed: readonly DigestEndorsed[];
  readonly note: DigestNote | null;
  /**
   * When the numbers on this page were computed.
   *
   * I9 — one stamp for the document rather than one per row, because every
   * figure here comes from the same read of the same instant. A page carrying
   * numbers and no time is a page whose numbers cannot be checked against
   * anything.
   */
  readonly observedAt: string;
}

export const DIGEST_KEYS = ["changed", "endorsed", "launches", "note", "observedAt", "week"] as const;

/** How many of each the digest carries. */
export const DIGEST_LAUNCH_LIMIT = 25;
export const DIGEST_ENDORSED_LIMIT = 5;

/**
 * The digest's one ordering, and the formula id it publishes under.
 *
 * Named here rather than inlined so the page, the feed and the test all point
 * at the same `/docs/formulas` anchor — the drift this epic has paid for
 * before is two surfaces citing two anchors for one rule.
 */
export const DIGEST_ORDER_FORMULA: FormulaId = "digest.most-endorsed";

/** What the digest says about itself, at the top. */
export const DIGEST_MEANING =
  "What happened on openproduct in one week: everything launched, and the listings people endorsed most while it was happening. One page per week, and every week stays where it is.";

/** The empty-week sentence. Said plainly, never padded around. */
export const NO_LAUNCHES_NOTE = "Nothing launched this week.";

/**
 * ...and why (openproduct-worldclass VC0).
 *
 * This one earns its disclosure more than any other: it is the sentence that
 * explains why the page does not quietly widen its window until something
 * appears, which is the single most common dishonesty in a weekly roundup.
 * Worth keeping, and not worth putting in front of somebody who only wanted
 * to know whether anything launched.
 */
export const NO_LAUNCHES_WHY =
  "That is a fact about the week rather than a gap on the page — we would rather say so than widen the window until something appeared.";

/** The empty most-endorsed sentence. */
export const NO_ENDORSEMENTS_NOTE =
  "Nobody endorsed anything this week.";

/**
 * The collection slot, which LC4 fills.
 *
 * SAID RATHER THAN OMITTED, the same discipline every pending control on this
 * surface follows: a reader who can see that collections are coming knows the
 * page is unfinished, and one who sees only two sections has no way to tell
 * whether the third was never built or was empty this week.
 */
export const COLLECTION_PENDING_NOTE =
  "A curated collection will appear here — a signed, ordered set with its curator's name on it.";

/** The feed's own description, used by both RSS and JSON. */
export const FEED_DESCRIPTION =
  "Products launched in the open, one week at a time. No account, no address, no tracking.";

/**
 * A digest is only published once its week is OVER.
 *
 * The archive's value is that it says what happened, and a page for a week
 * still in progress says what has happened SO FAR — a different claim, under
 * the same heading, changing every hour. Two readers quoting "week 34's
 * digest" would be quoting different documents.
 */
export function isPublishable(week: WeekId, weekEndMs: number, now: number): boolean {
  void week;
  return weekEndMs <= now;
}

/** How long a digest may be cached. */
export function digestMaxAge(isCurrentOrFuture: boolean): number {
  // A SETTLED WEEK IS IMMUTABLE, so it caches for a day: nothing in it can
  // change except a restatement, and the digest is not the surface a
  // restatement is urgent on. The most recent week is still being written
  // until it ends, so it takes the estate's ordinary sixty seconds.
  return isCurrentOrFuture ? 60 : 86_400;
}
