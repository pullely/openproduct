// Collections (openproduct-commons LC4).
//
// THE DELIBERATE EXCEPTION, AND WHAT BUYS IT.
//
// Everything else this estate orders is a published rule with no thumb on it:
// DS2's three sorts, DS4's similar panel, LC1's digest, LC3's board. OPC-4
// forbids an order a reader cannot reproduce from a sentence, and that
// forbidding is most of what makes the directory worth trusting.
//
// A collection breaks that rule on purpose. "These eight, in this order,
// because I think so" cannot be reproduced from a sentence — it is taste, and
// taste is the one thing a directory of open products genuinely needs and
// cannot compute. LC-4 says what makes it publishable anyway: ATTRIBUTION.
//
// The distinction the whole milestone turns on is not editorial-vs-neutral.
// It is WHOSE. A person publishing "my eight favourite things" is making a
// claim they own and can be argued with about. A platform publishing "Staff
// picks" is making the same claim while hiding who made it, and that is the
// thumb on the scale the default sort exists to refuse. So the name is
// required, and the name has to actually resolve to somebody.
//
// ─── WHAT "SIGNED" HAD TO MEAN ────────────────────────────────────────────
//
// Not a subject id in a column — that is signed the way an unsigned editorial
// is signed by whichever CMS account pasted it. It means the curator is a
// person a reader can go and look at: CG4's biconditional, where a handle
// links if and only if `/@handle` resolves.
//
// The consequence is a real bar and it is the intended one: somebody who has
// published nothing here cannot publish a collection here. The people who get
// to say what is good on this estate are the people who have built something
// on it. And a curator who takes their profile private takes their
// collections with them — the judgement was only ever publishable while it
// was attributable, so when attribution ends, publication ends. That coupling
// is the design, not a limitation of it.
//
// ─── ORDER IS THE CURATION ────────────────────────────────────────────────
//
// This is the one surface on the estate with NO SORT CONTROL, and that is a
// decision rather than an omission. Offering "sort by most active" over
// somebody's curation destroys the thing it is: a collection the reader can
// re-rank is just the directory with fewer rows, and the eight-in-this-order
// claim the curator made is gone. Nothing here re-ranks anything.

import type { PublicProfileCard } from "./index.js";

// ---------------------------------------------------------------------------
// The object
// ---------------------------------------------------------------------------

export const COLLECTION_STATES = ["draft", "published", "retired"] as const;
export type CollectionState = (typeof COLLECTION_STATES)[number];

/** What a public surface renders. `curator` is never null here — a collection
 *  whose curator stopped resolving is not returned at all. */
export interface PublicCollection {
  readonly slug: string;
  readonly title: string;
  readonly blurb: string | null;
  /** The handle, which is also the address: `/@handle`. Never a platform
   *  display name and never a subject id (I3, OPC-6). */
  readonly curatorHandle: string;
  readonly publishedAt: string;
  /**
   * The items that are PUBLIC RIGHT NOW, in the curator's order.
   *
   * An item whose listing was delisted, removed or unpublished is absent from
   * this array and its row survives in the database — so if the listing comes
   * back, so does the item. The whole collection never 404s because one of
   * eight went away.
   */
  readonly items: readonly CollectionItem[];
}

export interface CollectionItem {
  readonly card: PublicProfileCard;
  /** Why THIS one, in the curator's words. The thing a collection has that a
   *  filtered list does not. */
  readonly note: string | null;
}

export const PUBLIC_COLLECTION_KEYS = [
  "slug",
  "title",
  "blurb",
  "curatorHandle",
  "publishedAt",
  "items",
] as const;

/** One row in the index. `count` is what the collection SHOWS, never what it
 *  holds — see `visibleCount`. */
export interface CollectionCard {
  readonly slug: string;
  readonly title: string;
  readonly blurb: string | null;
  readonly curatorHandle: string;
  readonly publishedAt: string;
  readonly count: number;
}

export const COLLECTION_CARD_KEYS = [
  "slug",
  "title",
  "blurb",
  "curatorHandle",
  "publishedAt",
  "count",
] as const;

/**
 * A curator's own row, in the studio.
 *
 * BOTH COUNTS, and the pair is the point: `held` is what they chose, `visible`
 * is what a reader sees today. Showing only the second would make a listing
 * that went private look like something they had deleted.
 */
export interface CuratorCollection {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly blurb: string | null;
  readonly state: CollectionState;
  readonly publishedAt: string | null;
  readonly held: number;
  readonly visible: number;
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

export const MAX_COLLECTION_TITLE = 120;
export const MAX_COLLECTION_BLURB = 600;
export const MAX_ITEM_NOTE = 400;

/**
 * How many listings one collection may hold.
 *
 * A bound rather than a rule about taste. Past a few dozen a collection stops
 * being a claim and becomes a second directory with worse ordering, which is
 * the failure mode of every "awesome-x" list that ever grew unmaintained.
 * Stated at the write boundary so a curator meets it while choosing rather
 * than after.
 */
export const MAX_COLLECTION_ITEMS = 50;

/** How many collections one person may have live at once. Not a
 *  productivity limit — a person with forty published collections has made
 *  the index theirs, and an index one voice dominates is a staff-picks page
 *  wearing somebody else's name. */
export const MAX_LIVE_COLLECTIONS_PER_CURATOR = 10;

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

/**
 * What the page says it has.
 *
 * COMPUTED FROM WHAT IS SHOWN, never from the stored item count. A collection
 * of eight whose three listings went private renders five cards, and a header
 * saying "8 products" over five cards is a page lying about a number it could
 * have counted correctly. The stored count is not even passed to the surface,
 * so there is nothing to get wrong.
 */
export function visibleCount(collection: Pick<PublicCollection, "items">): number {
  return collection.items.length;
}

/** The index's one line under a title. Never "8 products" — see above. */
export function collectionSummary(count: number): string {
  if (count === 0) return "Nothing in it is public right now";
  return `${count} ${count === 1 ? "product" : "products"}`;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type CollectionRefusalReason =
  | "not-a-curator"
  | "not-yours"
  | "unknown-collection"
  | "unknown-listing"
  | "slug-taken"
  | "slug-shape"
  | "too-many-items"
  | "too-many-collections"
  | "already-in"
  | "empty-collection"
  | "title-required";

export const COLLECTION_REFUSALS: Record<CollectionRefusalReason, { says: string }> = {
  // The one that needs the most care, because it is a refusal aimed at
  // somebody who has done nothing wrong. It says what the bar IS and how to
  // clear it, rather than "you are not allowed".
  "not-a-curator": {
    says:
      "Collections carry their curator's name, and that name has to lead somewhere. Publish a listing " +
      "and turn on your public profile, and you can publish collections.",
  },
  "not-yours": {
    says: "That collection is somebody else's.",
  },
  "unknown-collection": {
    says: "There is no collection at that address.",
  },
  "unknown-listing": {
    says: "That listing is not something you can add — it may be unpublished or may not exist.",
  },
  "slug-taken": {
    says: "Something already lives at that address. Collections and listings share one namespace.",
  },
  "slug-shape": {
    says: "An address may use lowercase letters, numbers and hyphens, and must start and end with one.",
  },
  "too-many-items": {
    says:
      `A collection holds up to ${MAX_COLLECTION_ITEMS} products. Past that it stops being a claim ` +
      "and becomes a second directory.",
  },
  "too-many-collections": {
    says:
      `You can have ${MAX_LIVE_COLLECTIONS_PER_CURATOR} collections published at once. Retire one to ` +
      "publish another.",
  },
  "already-in": {
    says: "It is already in this collection. Move it instead of adding it again.",
  },
  "empty-collection": {
    says: "A collection needs something in it before it can be published.",
  },
  "title-required": {
    says: "A collection needs a title — it is what a reader sees before anything else.",
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** The same shape a listing slug takes, and the same namespace. `collections`
 *  itself is reserved by CG0, so `/collections/<slug>` cannot shadow a
 *  listing at `/<slug>`. */
export const COLLECTION_SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

export function collectionSlugIsWellFormed(slug: string): boolean {
  return COLLECTION_SLUG_RE.test(slug);
}

export function titleIsAcceptable(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_COLLECTION_TITLE;
}

/**
 * The order a curator's items go in after a move.
 *
 * PURE, AND IT RENUMBERS DENSELY. Sparse positions (10, 20, 30) are the usual
 * trick and they rot: after enough moves two items collide and the order
 * becomes whatever the database returns. Renumbering from zero on every move
 * costs one write per item in a set bounded at fifty, and the order is always
 * exactly what the curator sees.
 */
export function reorder(slugs: readonly string[], slug: string, to: number): string[] {
  const without = slugs.filter((s) => s !== slug);
  if (!slugs.includes(slug)) return [...slugs];
  const index = Math.max(0, Math.min(Math.trunc(to), without.length));
  return [...without.slice(0, index), slug, ...without.slice(index)];
}

// ---------------------------------------------------------------------------
// What the surfaces say
// ---------------------------------------------------------------------------

/**
 * The sentence at the top of `/collections`.
 *
 * It states the exception PLAINLY rather than hiding it. A reader arriving
 * from a directory that has spent five sub-epics promising it does not put a
 * thumb on the scale deserves to be told, in the first line, that this page
 * is different and why that is allowed.
 */
export const COLLECTIONS_MEANING =
  "Everywhere else on openproduct, the order is a rule you can read and check. Here it is somebody's opinion — a set of products one person chose, in the order they chose, with their name on it. That is the trade: editorial judgement is welcome exactly where you can see whose it is.";

/** Under a collection's title, before its items. */
export const COLLECTION_PROVENANCE_NOTE =
  "Chosen and ordered by its curator. Nothing here is ranked by us, and nothing you do changes the order.";

/** When every item in a published collection has stopped being public. */
export const COLLECTION_EMPTY_NOTE = "Nothing in this collection is public right now.";

/**
 * ...and why, for the reader who wants it (openproduct-worldclass VC0).
 *
 * THE SENTENCE IS NOT DELETED, IT IS MOVED. The 7 Sep audit's P1·10 is that
 * every empty state here is an essay, and it is careful to add that the voice
 * is "distinctive and I would not flatten it" — the problem is density, not
 * register. So the fact goes first, at one sentence, and the reasoning goes
 * behind a disclosure the reader opens if they care.
 */
export const COLLECTION_EMPTY_WHY =
  "The products a curator chose can be unpublished or delisted after the fact; when they come back, they reappear here in the order they were in.";

/** The index, with nothing in it yet. */
export const COLLECTIONS_EMPTY_NOTE = "No collections have been published yet.";

export const COLLECTIONS_EMPTY_WHY =
  "They are made by people who have listed something here — build in the open, and you can publish one.";

/** What a curator is told before they publish. The obligation, said once. */
export const CURATOR_NOTE =
  "Your handle goes on this, and links to your profile. If you make your profile private, your collections come down with it.";
