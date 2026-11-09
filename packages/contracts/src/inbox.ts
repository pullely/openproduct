// The inbox (openproduct-launch NF0).
//
// A LIST A PERSON READS, and every sentence in it is composed HERE from a row
// that holds no prose. Stored prose is prose that cannot be corrected — a
// wording somebody regrets becomes a backfill — and a table full of English is
// a translation problem the day anybody wants a second language.
//
// ─── FOUR KINDS SHIP. THE DESIGN LISTS FIVE ──────────────────────────────
//
// `follow.maker` — telling somebody who followed them — is not here, and its
// absence is a decision rather than a gap.
//
// FL0 published a promise to people, on the page where they decide whether to
// make their profile public: *"How many people follow you — a count only,
// never who they are, not even to you."* A notification naming the follower
// breaks that outright. One that hides the name breaks it more quietly: a
// message at 14:03 saying "somebody followed you" is a TIMING signal, and
// timing plus any other trace — a page they had just opened, a comment they
// had just left — narrows a private act to a person.
//
// If a follow notification is ever wanted, the shape that keeps the promise is
// a COUNT crossing a threshold ("ten people now follow you"): a number they can
// already see, said at a moment no single person's act determines. That is a
// new published rule, and it belongs to the milestone that wants it.
//
// ─── THIS CHANNEL MAY NAME PEOPLE; CB4'S MAIL MAY NOT ────────────────────
//
// CB4 was deliberate: "a name in a subject line is a name in somebody's inbox,
// searchable and forwardable, and the page will say who it was under the rules
// the page enforces". That argument is about MAIL. This list renders on a page
// that already shows the same handle beside the same comment under the same
// rules, so naming the actor here publishes nothing the reader could not see
// by following the link. Two channels, two policies, and the reason each has
// its own is written down in both places.

/** The four, in no particular order — the inbox is ordered by time. */
export const INBOX_KINDS = [
  "rank.first",
  "post.reply",
  "launch.topic",
  "post.upvoted",
  // PP1 — a listing you follow launched.
  "launch.listing",
] as const;
export type InboxKind = (typeof INBOX_KINDS)[number];

/** What a row points AT. Resolved when the page renders, so a row about
 *  something since removed stops resolving rather than carrying a stale copy
 *  of it (TS3). */
export const INBOX_TARGETS = ["listing", "post", "topic"] as const;
export type InboxTarget = (typeof INBOX_TARGETS)[number];

/** One row, as a page receives it. No prose: the sentence is composed. */
export interface InboxItem {
  readonly id: string;
  readonly kind: InboxKind;
  /** A HANDLE, or null for something the system observed. Never a subject
   *  id — that is an internal identifier, and one bad projection away from a
   *  browser. */
  readonly actor: string | null;
  readonly targetKind: InboxTarget;
  /** A slug, a post id, or a topic value. */
  readonly targetRef: string;
  /** The one number some kinds need — a rank, an upvote count. */
  readonly figure: number | null;
  readonly createdAt: string;
  /** Against the reader's own cursor. Computed, never stored per row. */
  readonly unread: boolean;
}

export const INBOX_ITEM_KEYS = [
  "actor",
  "createdAt",
  "figure",
  "id",
  "kind",
  "targetKind",
  "targetRef",
  "unread",
] as const;

/**
 * THE PHRASEBOOK.
 *
 * One function per kind rather than a template string with holes, because two
 * of these need a number rendered in a way a template cannot decide (an
 * ordinal, a plural) and a phrasebook that could only interpolate would have
 * pushed that decision into whichever surface rendered it.
 *
 * NO KIND NAMES A PERSON IT DOES NOT HAVE TO. `post.upvoted` says how many,
 * not who: an upvote's count is public and its voters are not listed anywhere,
 * so naming them here would be the only place on the estate that did.
 */
export function inboxSentence(item: Pick<InboxItem, "kind" | "actor" | "targetRef" | "figure">): string {
  switch (item.kind) {
    case "rank.first":
      return item.figure === null
        ? `${item.targetRef} reached #1 on its launch day.`
        : `${item.targetRef} reached #1 on its launch day, with ${item.figure} ${
            item.figure === 1 ? "upvote" : "upvotes"
          }.`;
    case "post.reply":
      // The actor IS named — the reply is on a public page with their handle
      // beside it, so this publishes nothing a reader could not see by
      // following the link. Null when the handle stopped resolving, which is a
      // state CG1 makes ordinary (a released handle, a profile turned off).
      return item.actor === null
        ? `Somebody replied where you commented on ${item.targetRef}.`
        : `@${item.actor} replied where you commented on ${item.targetRef}.`;
    case "launch.topic":
      return `Something launched in ${item.targetRef}, a topic you follow.`;
    case "launch.listing":
      return `${item.targetRef} launched — a listing you follow.`;
    case "post.upvoted":
      // HOW MANY, NEVER WHO. An upvote's count is public and its voters are
      // listed nowhere; naming them here would be the one place that did.
      return item.figure === null || item.figure <= 1
        ? `A comment you wrote on ${item.targetRef} was upvoted.`
        : `A comment you wrote on ${item.targetRef} has ${item.figure} upvotes.`;
  }
}

/** Where a row's link goes. Every one of them is a page that decides for
 *  itself what the reader may see (XP-5: never a link that goes nowhere). */
export function inboxHref(item: Pick<InboxItem, "kind" | "targetKind" | "targetRef">): string {
  if (item.targetKind === "topic") return `/topics/${item.targetRef}`;
  if (item.targetKind === "post") return `/${item.targetRef}#discussion`;
  return `/${item.targetRef}`;
}

/**
 * The event key — what makes "once per event per person" a schema property.
 *
 * BUILT FROM THE EVENT, NEVER FROM THE CLOCK. A key with a timestamp in it is
 * a key that changes on a retry, which is the same as having no key at all.
 */
export function inboxEventKey(kind: InboxKind, ref: string): string {
  return `${kind}:${ref}`;
}

/** How many rows the inbox shows. Bounded, because this is a page whose row
 *  count grows with a person's whole history here. */
export const INBOX_LIMIT = 50;

/** What the page says when there is nothing. Not an apology and not a
 *  suggestion to do something — an empty inbox is the ordinary state. */
export const INBOX_EMPTY =
  "Nothing yet. This is where replies, launches in topics you follow, and upvotes on your comments appear.";

/** The label on the one read action this product has. */
export const INBOX_MARK_READ = "Mark all as read";

/**
 * The badge's number, capped for rendering.
 *
 * A badge reading `1,284` is a badge nobody can read at a glance, and the
 * difference between it and `50+` changes nothing anybody does.
 */
export const INBOX_BADGE_CAP = 50;

export function inboxBadge(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > INBOX_BADGE_CAP ? `${INBOX_BADGE_CAP}+` : String(unread);
}
