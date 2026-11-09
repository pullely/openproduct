// The feed's sidebar (openproduct-launch FL1).
//
// Four panels beside the launch board. Each one is an ORDERING, and OPC-4 does
// not carve out sidebars: every one of them resolves to a published sentence
// at `/docs/formulas`, and none of them takes a behavioural signal.
//
// ─── THE HEADINGS ARE THE DESIGN'S WORDS; THE ORDERS ARE NOT ITS CLAIMS ───
//
// The four cards are labelled exactly as the prototype labels them —
// "Trending topics", "Featured collection", "Looking for contributors",
// "Makers to follow" — because the site is drawn to that design and a
// heading is part of the drawing. What each label SITS OVER is decided
// below, and it is not what the words might suggest. Two of them needed the
// argument written down, and it is kept here in full, because the label is
// the design's and the order has to remain one this product can publish:
//
// THE FIRST HEADING NAMED A SIGNAL THIS PRODUCT DOES NOT OBSERVE. The design
// calls the topics panel by a word that means, everywhere it is used, what
// readers are doing — and `/docs/formulas` says in its own first paragraph
// that no such signal exists anywhere here. A panel named for readers but
// ordered by something else is a heading that lies about its own contents, so
// the panel is named for ACTIVITY, which is DS2's vocabulary for the same
// shape of measure and is what the number under it actually counts.
//
// (The formula's own sentence says this without naming the forbidden words:
// `catalog.test.ts` has a deliberately DUMB guard that fails on any ordering
// sentence containing one, and a denial trips it exactly as an admission
// would. Making the guard clever enough to allow "no clicks" would also let
// through "clicks are weighted lightly", so the sentence is written in the
// house idiom instead — "nothing about who is reading enters this order",
// which is what `similar.` and `search.` already say.)
//
// "MAKERS TO FOLLOW" → "Open to a project". This is the one the milestone had
// to think hardest about, because the design's version is a RECOMMENDATION
// ABOUT PEOPLE: it says these are the makers worth following. Nothing on this
// estate can support that claim. Ordering people by endorsements received
// would rank human beings by a number their products earned; ordering by
// launches would say prolific means good; ordering by follower count would be
// a popularity ratchet that makes the already-followed more followed, which is
// exactly the dynamic a directory of small open products should not build.
//
// So the panel shows people who have SAID they are open to a project — CG1's
// own opt-in, set by them, meaning what it says. That is not a recommendation
// and does not pretend to be one: it is a list of people who put their hand
// up, in the order they put it up. It is also more useful, because a reader
// of this page is usually looking for somebody to build with rather than
// somebody to admire.
//
// ─── EVERY PANEL DEGRADES TO ABSENCE, NEVER TO A ZERO ─────────────────────
//
// A sidebar card reading "0 collections" or standing empty under its heading
// is a page telling a reader something is broken. A panel with nothing to say
// is not rendered at all — the milestone's own done-when, and OPC-C applied to
// furniture rather than to a figure.

import type { FormulaId } from "./provenance.js";

/** How many rows each panel shows. Small, because a sidebar that scrolls is a
 *  second page competing with the one beside it. */
export const SIDEBAR_TOPIC_LIMIT = 5;
export const SIDEBAR_OPENING_LIMIT = 3;
export const SIDEBAR_PERSON_LIMIT = 3;
/** HB3 — three threads, as the plan says. */
export const SIDEBAR_REPLY_LIMIT = 3;

/** The window "active" means. The board's archive, matching TP0's topic page,
 *  so a topic's row in this panel and its own page count the same launches. */
export const SIDEBAR_TOPIC_WINDOW_DAYS = 30;

export const SIDEBAR_TOPICS_FORMULA: FormulaId = "topic.recent-launches";
export const SIDEBAR_COLLECTION_FORMULA: FormulaId = "collection.newest";
export const SIDEBAR_OPENINGS_FORMULA: FormulaId = "openings.newest";
export const SIDEBAR_PEOPLE_FORMULA: FormulaId = "people.open-to-project";
/** HB3 — the fifth panel's order: by the moment of the latest reply. */
export const SIDEBAR_REPLIES_FORMULA: FormulaId = "threads.recently-replied";

/** One row of the topics panel. */
export interface SidebarTopic {
  readonly value: string;
  readonly label: string;
  /** Launches in the window. The number the order is made of, shown beside
   *  the name so the ordering is checkable at a glance. */
  readonly launches: number;
  readonly followers: number;
}

/** The one collection the panel shows. */
export interface SidebarCollection {
  readonly slug: string;
  readonly title: string;
  /** The curator's handle — LC4 requires a collection to carry it, because
   *  editorial judgement is allowed here only while it is attributable. */
  readonly curator: string;
  readonly items: number;
  /** Up to three member slugs, for the design's tile row. */
  readonly preview: readonly string[];
}

/** One open role. */
export interface SidebarOpening {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  /** CB2's commitment line, or null. Absent rather than "unspecified": a
   *  maintainer who did not say is not a maintainer who said "any". */
  readonly commitment: string | null;
}

/** One person who has said they are open to a project. */
export interface SidebarPerson {
  readonly handle: string;
  readonly name: string;
  /** Their bio's first line, trimmed to fit. Their words, never generated. */
  readonly headline: string | null;
}

/**
 * HB3 — one row of "Recently replied".
 *
 * A thread somebody just spoke in, on a listing anybody can see. The count
 * is the thread's visible posts — the SAME count the feed row shows beside
 * the same listing, by the same predicate, so the two numbers are one.
 */
export interface SidebarReply {
  readonly slug: string;
  readonly title: string;
  /** ISO 8601 — when the latest visible post landed. The order is this. */
  readonly repliedAt: string;
  readonly posts: number;
}

export interface Sidebar {
  /** Each panel is ABSENT when it has nothing, never present and empty. */
  readonly topics: readonly SidebarTopic[];
  readonly collection: SidebarCollection | null;
  readonly openings: readonly SidebarOpening[];
  readonly people: readonly SidebarPerson[];
  /** HB3 — the fifth panel. */
  readonly replies: readonly SidebarReply[];
}

export const SIDEBAR_KEYS = ["topics", "collection", "openings", "people", "replies"] as const;

/**
 * Order the topics panel.
 *
 * PURE, and by launches in the window then by label — never by followers. A
 * follower count ordering topics would make the already-followed more
 * followed, which is a ratchet rather than a measurement, and it would also
 * make this panel's order depend on a private act.
 */
export function orderSidebarTopics(
  topics: readonly SidebarTopic[],
  limit: number = SIDEBAR_TOPIC_LIMIT,
): SidebarTopic[] {
  return [...topics]
    .filter((topic) => topic.launches > 0)
    .sort((a, b) => b.launches - a.launches || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** The first line of a bio, bounded. Their words — this trims, and never
 *  summarises or generates. */
export function headlineOf(bio: string | null, max = 60): string | null {
  if (!bio) return null;
  const first = bio.split("\n")[0]!.trim();
  if (first.length === 0) return null;
  return first.length <= max ? first : `${first.slice(0, max - 1).trimEnd()}…`;
}

/** Whether the sidebar has anything at all to say. A frame with four absent
 *  panels is a column of nothing taking a third of the page. */
export function sidebarHasContent(sidebar: Sidebar): boolean {
  return (
    sidebar.topics.length > 0 ||
    sidebar.collection !== null ||
    sidebar.openings.length > 0 ||
    sidebar.people.length > 0 ||
    sidebar.replies.length > 0
  );
}

// ---------------------------------------------------------------------------
// The headings
// ---------------------------------------------------------------------------

export const SIDEBAR_TOPICS_HEADING = "Active topics";
export const SIDEBAR_COLLECTION_HEADING = "The newest collection";
// OB4 (D4) — the reader's word for it now, everywhere: an open role.
export const SIDEBAR_OPENINGS_HEADING = "Open roles";
export const SIDEBAR_PEOPLE_HEADING = "Open to one more project";
/** HB3. */
export const SIDEBAR_REPLIES_HEADING = "Recently replied";
/** HB3 — the digest capture in the rail: what it is, in one line. */
export const SIDEBAR_DIGEST_HEADING = "The weekly digest";
/** The line under the digest panel's heading: what it is, and what it does not ask for. */
export const SIDEBAR_DIGEST_NOTE = "A page every week, with an RSS and a JSON feed. No account, no address.";
