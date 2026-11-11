// The digest by email (openproduct-commons LC5).
//
// I3, FOR THE SECOND TIME AND WITH A HARDER CASE. CB4 established that
// openproduct holds a subject id and the platform holds the address; that was
// easy to hold when the message was one line about one thread. This is a
// weekly send to a list, which is the exact shape that has historically made
// products decide they "need" the addresses after all — for the previews, for
// the bounce handling, for the export somebody asked for once. Nothing here
// has a field for one, and `DIGEST_DELIVERY_KEYS` is pinned by a test.
//
// ─── THE CONSENT MODEL, AND WHY IT INVERTS CB4's ──────────────────────────
//
// CB4's `notification_prefs` means ABSENCE = NOTIFY. That is right there and
// would be indefensible here.
//
//   a reply notification   is about SOMETHING YOU DID. You posted in the
//                          thread; the message tells you what happened next
//                          in a conversation you joined. Opting out is the
//                          exceptional act, so the exception gets the row.
//
//   the weekly digest      is a BROADCAST. Nobody asked for it by acting.
//                          Sending it to everybody who ever signed in and
//                          making them opt out is precisely how a directory
//                          becomes a mailing list people have to escape, and
//                          it is the single most common way a product with
//                          good intentions ends up in a spam folder.
//
// So this is OPT-IN, absence means silence, and the two opposite defaults are
// not an inconsistency waiting to be tidied: they encode two different
// consents, and one switch for both would have to get one of them wrong.
//
// ─── THE EMAIL IS THE PAGE ────────────────────────────────────────────────
//
// The send does not compose a second version of the week. It carries the
// SAME projection LC1 built for `/digest/<week>`, so a subscriber can hold
// the email against the page and find them identical — which is the only way
// "you got what everybody else can see" is checkable rather than promised.
//
// It also means the email inherits everything LC1 already decided: the empty
// week says so rather than widening its window, the order resolves to a
// published formula, and a settled week never changes.

import type { FormulaId } from "./provenance.js";
import { DIGEST_ORDER_FORMULA } from "./digest.js";

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

/**
 * Where somebody stands, as the studio and `/me` render it.
 *
 * THREE STATES AND NOT TWO. "Never asked" and "asked and left" are different
 * to the person looking at the control: the first is an invitation, the
 * second needs to say "you can come back" rather than pretending the earlier
 * decision never happened.
 */
export type DigestStanding = "never" | "subscribed" | "unsubscribed";

export interface DigestSubscription {
  readonly standing: DigestStanding;
  /** ISO 8601, or null when they have never subscribed. */
  readonly since: string | null;
}

export const DIGEST_SUBSCRIPTION_KEYS = ["standing", "since"] as const;

export function isSubscribed(subscription: DigestSubscription): boolean {
  return subscription.standing === "subscribed";
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * What crosses the seam.
 *
 * THREE FIELDS, AND NONE OF THEM IS AN ADDRESS. The platform resolves the
 * subject id to whatever it reaches people by; openproduct never learns the
 * answer and has nowhere to put it if it did.
 *
 * `link` rather than a rendered body, and that is the load-bearing choice.
 * Carrying HTML across the seam would mean openproduct decides what the email
 * looks like in the platform's own sending system — two products owning one
 * artefact — and would put a week's worth of other people's taglines into a
 * queue row. A link to the page the digest already is keeps the content in
 * one place, keeps the queue small, and means an email opened a month late
 * shows the week rather than a stale copy of it.
 */
export interface DigestDelivery {
  readonly subjectId: string;
  /** The week this is for: `2026-W34`. */
  readonly week: string;
  /** The page it points at, which IS the digest. */
  readonly link: string;
}

export const DIGEST_DELIVERY_KEYS = ["subjectId", "week", "link"] as const;

/** The outbox kind. A fourth KNOWN kind rather than the start of an open
 *  vocabulary — the CHECK is what stops a caller inventing one nobody wrote
 *  copy for. */
export const DIGEST_NOTIFICATION_KIND = "digest";

/**
 * The event ref, which is what makes "one digest per person per week" true.
 *
 * CB4's unique index on `(subject_id, event_ref)` does the work; this only
 * has to produce a stable string per week. A retried send, two workers
 * racing, and a re-run after a partial failure all collide on the same row
 * rather than sending somebody the same week twice.
 */
export function digestEventRef(week: string): string {
  return `digest:${week}`;
}

export function digestLink(week: string): string {
  return `/digest/${week}`;
}

/** The formula the email's order resolves to — LC1's, not a second one. */
export const DIGEST_MAIL_FORMULA: FormulaId = DIGEST_ORDER_FORMULA;

// ---------------------------------------------------------------------------
// What is said
// ---------------------------------------------------------------------------

export const DIGEST_SUBSCRIBE_LABEL = "Email me the weekly digest";
export const DIGEST_UNSUBSCRIBE_LABEL = "Stop emailing me the digest";
export const DIGEST_RESUBSCRIBE_LABEL = "Start emailing me the digest again";

export function digestControlLabel(standing: DigestStanding): string {
  if (standing === "subscribed") return DIGEST_UNSUBSCRIBE_LABEL;
  if (standing === "unsubscribed") return DIGEST_RESUBSCRIBE_LABEL;
  return DIGEST_SUBSCRIBE_LABEL;
}

/**
 * What somebody is told BEFORE they subscribe.
 *
 * It states the two things a person actually wants to know and almost never
 * gets told: what will arrive, and what we do not have. The second half is
 * the one worth the words — "we do not have your address" is a strange claim
 * for a product sending you email, and it is true here, and a reader who does
 * not believe it can check the schema.
 */
export const DIGEST_SUBSCRIBE_NOTE =
  "One email a week, on Monday, linking to the same digest page anyone can read without an account. openproduct does not store your address — it holds an anonymous id and asks the platform to send, so there is no list here to leak, sell, or hand over.";

/** The line beside the unsubscribe control. It promises the thing people have
 *  learned not to expect, and the send path is built to make it true. */
export const DIGEST_UNSUBSCRIBE_NOTE =
  "One click, and it takes effect immediately — including for a digest already queued but not yet sent.";

/** Said on the public digest page, where somebody without an account reads it.
 *  The feed comes first on purpose: it needs nothing from them at all. */
export const DIGEST_FEED_FIRST_NOTE =
  "The feed needs no account and no address at all, and is the same content. Email is there if you would rather not run a reader.";

/**
 * What the estate will not do with a subscription, said once so no surface
 * invents it later.
 */
export const DIGEST_REFUSALS = [
  {
    refused: "Tracking whether you opened it",
    because:
      "A tracking pixel is a request your mail client makes to us, which tells us when you read, where you were and what you read it on. The digest is a link to a public page; we do not need to know who followed it and have not built the means to.",
  },
  {
    refused: "Personalising what you get",
    because:
      "Everybody subscribed to a week gets the same link to the same page. A digest tailored to you is a digest nobody else can check against what it claims — and it would need us to keep a model of what you like.",
  },
  {
    refused: "Storing your address",
    because:
      "openproduct holds an opaque id. The platform resolves it at delivery and the answer never comes back. There is no column here that could hold an address, which is a stronger promise than a policy saying we would not look.",
  },
] as const;

/**
 * How many deliveries one send will queue.
 *
 * Bounded for the reason every sweep on this estate is bounded: a send that
 * times out half-way is a send nobody can tell from a send that ran, and the
 * next run picks up the remainder because the unique index makes re-queueing
 * the already-queued a no-op.
 */
export const MAX_DIGEST_QUEUE_PER_RUN = 5_000;
