// Topic pages (openproduct-launch TP0).
//
// ─── WHAT A TOPIC IS, AND WHY IT IS NOT A FREE STRING ─────────────────────
//
// The prototype gives each product a list of topics — "Developer tools",
// "Monitoring", "Local-first" — typed per product. This estate has no such
// column, and inventing one would be inventing a second taxonomy beside CT1's,
// which is the thing CT1 exists to prevent: a vocabulary nobody canonicalises
// produces `dev-tools`, `devtools` and `Developer Tools` as three topics with
// a third of the listings each.
//
// So A TOPIC IS A CATEGORY VALUE. CT1 already assigns exactly one per listing,
// from a published vocabulary, with aliases folded — and the feed row already
// renders it, as one value, with a comment saying it would be inventing the
// rest. This is the milestone that makes it an ADDRESS rather than a word.
//
// One consequence worth naming: a product is in exactly one topic. The
// prototype's products are in two or three. That is the honest version of the
// prototype's picture given a single-cardinality facet, and widening the facet
// is a taxonomy decision, not a page.
//
// ─── HOW A TOPIC PAGE DIFFERS FROM `/products?category=…` ─────────────────
//
// They would otherwise be the same page twice, and one of them would be
// deleted within a month.
//
//   `/products?category=dev-tools`   THE DIRECTORY, filtered. Every live
//                                    listing in the topic, in one of three
//                                    published sort orders, read once.
//
//   `/topics/dev-tools`              THE BOARD, filtered. What LAUNCHED in
//                                    this topic recently, in the order the
//                                    board put it in, read daily.
//
// That is OL2's own premise applied to one topic: a directory is read once, a
// launch board is read daily. Each page links to the other, because a reader
// who wants the complete list and a reader who wants this month's news are
// asking different questions and both are worth answering.
//
// ─── WHAT IS DELIBERATELY ABSENT ──────────────────────────────────────────
//
// The FOLLOWER COUNT. The prototype's card reads "12 launches · 340
// followers"; nothing on this estate observes a follow yet, and a card reading
// "0 followers" would be a claim that nobody follows this topic rather than
// an admission that nobody has been able to. FL0 builds follows and the count
// appears then — honestly at zero, because a measured zero is a fact. Until
// then the field does not exist (OPC-C).

import { BOARD_ARCHIVE_DAYS, type BoardDay, previousDay } from "./board.js";
import { facet } from "./facets.js";
import type { FeedEntry } from "./feed.js";

/** The facet a topic IS. One constant rather than the string in six files, so
 *  a topic and the directory filter behind it cannot come apart. */
export const TOPIC_FACET = "category";

export const TOPICS_PATH = "/topics";

/** `/topics/dev-tools` — the canonical value, never a label. A label has
 *  spaces and a capital letter; an address should survive being retyped. */
export function topicPath(value: string): string {
  return `${TOPICS_PATH}/${encodeURIComponent(value)}`;
}


/**
 * How far back a topic page looks.
 *
 * The BOARD'S ARCHIVE WINDOW, not the feed's week. A topic is a slice of the
 * estate, and most topics do not have something launching every week — a page
 * that showed seven days would be empty for most topics most of the time, and
 * an empty page is indistinguishable from a broken one. Thirty days is the
 * span the board already keeps addressable, so nothing here is claiming to
 * reach further back than the boards it reads.
 */
export const TOPIC_WINDOW_DAYS = BOARD_ARCHIVE_DAYS;

/** The day ids a topic page covers, newest first. Decided from the clock and
 *  handed to the read, for the reason OL2 wrote out: a window that came from
 *  the database's clock makes the page a function of when the query ran. */
export function topicWindowDays(today: BoardDay): BoardDay[] {
  const days: BoardDay[] = [today];
  for (let i = 1; i < TOPIC_WINDOW_DAYS; i += 1) {
    days.push(previousDay(days[days.length - 1]!));
  }
  return days;
}

// ---------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------

/** One topic, as the index's card draws it. */
export interface TopicCard {
  /** The canonical facet value — the address. */
  readonly value: string;
  /** The vocabulary's own label, which is what a reader sees. */
  readonly label: string;
  /** CT0's published sentence for the facet, unedited. A topic page that
   *  wrote its own description would be a second definition of a facet whose
   *  first definition is already on `/docs`. */
  readonly description: string;
  /**
   * Live listings carrying this topic.
   *
   * PRODUCTS, NOT LAUNCHES, and the word is load-bearing. LC0 made a launch a
   * separate act from a publish precisely so the two could be counted apart; a
   * card reading "12 launches" over a topic where four listings never launched
   * would be counting one thing and naming another.
   */
  readonly products: number;
}

/**
 * The topic index, from the directory's own cards.
 *
 * COUNTED FROM THE SAME ROWS THE DIRECTORY RAIL COUNTS, so the number on a
 * topic card and the number beside that facet value in the rail cannot
 * disagree. Both are "live listings carrying this value", and there is one
 * definition of that.
 *
 * A VALUE NOBODY HAS CHOSEN GETS NO CARD. The vocabulary has more values than
 * the catalogue has listings, and a grid of topics that lead to empty pages is
 * a grid of broken links — which is the same argument DS1 made for offering
 * only present facet values in the rail.
 *
 * Ordered by count, then by label. Not by "trending", which would be an
 * ordering with no published formula and no way to check it.
 */
export function buildTopicIndex(
  cards: readonly { readonly category: string | null }[],
): TopicCard[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!card.category) continue;
    counts.set(card.category, cardsInTopic(cards, card.category).length);
  }
  const group = facet(TOPIC_FACET);
  const out: TopicCard[] = [];
  for (const [value, products] of counts) {
    const known = group?.values.find((v) => v.value === value);
    // A value the vocabulary does not know cannot be rendered: it has no
    // label and no description, and printing the raw slug would put a string
    // in the estate's voice that nobody wrote. CT1 canonicalises on the way
    // in, so this is a guard rather than an expected branch.
    if (!known) continue;
    out.push({
      value,
      label: known.label,
      description: group!.description,
      products,
    });
  }
  return out.sort((a, b) => b.products - a.products || a.label.localeCompare(b.label));
}

/**
 * HB4 — the listings in a topic: ONE predicate, used by the index's count
 * and by the page's *In the directory* list, so the number on the card and
 * the length of the list are the same number (WC-7).
 */
export function cardsInTopic<T extends { readonly category: string | null }>(
  cards: readonly T[],
  value: string,
): T[] {
  return cards.filter((card) => card.category === value);
}

/** HB4 — the section under the month's launches: everything in the topic. */
export const TOPIC_DIRECTORY_HEADING = "In the directory";

/** `12 products · most active first` — the list's own length, never a
 *  number passed beside it. */
export function topicDirectoryMeta(count: number): string {
  return `${count} ${count === 1 ? "product" : "products"} · most active first`;
}

/** Is this a topic the estate can render a page for? The index decides, so
 *  "has a card" and "has a page" are one answer. */
export function topicIn(index: readonly TopicCard[], value: string): TopicCard | null {
  return index.find((t) => t.value === value) ?? null;
}

// ---------------------------------------------------------------------------
// One topic's page
// ---------------------------------------------------------------------------

export interface Topic extends TopicCard {
  /** The day the page treated as today, so a cached document says which UTC
   *  day it is talking about rather than leaving a reader to infer it. */
  readonly today: string;
  /** The oldest day in the window, for the sentence naming the span. */
  readonly from: string;
  /**
   * Launches in this topic inside the window, newest day first and, within a
   * day, in the order the board put them in.
   *
   * NOTHING HERE IS RANKED BY THIS PAGE (OL-2a). The entries carry the board's
   * own rank; this orders by day and then by that rank, which is what the feed
   * does within a group and for the same reason — pooling days would put a
   * quiet Tuesday's winner above a busy Thursday's runner-up and imply a
   * comparison the board never made. The leaderboard is the surface that
   * pools, and it publishes its own formula for doing so.
   */
  readonly entries: readonly FeedEntry[];
}

export const TOPIC_KEYS = [
  "value",
  "label",
  "description",
  "products",
  "today",
  "from",
  "entries",
] as const;

/**
 * Assemble one topic's page from entries that already carry their rank.
 *
 * PURE — entries in, a document out, no clock beyond the `today` it is handed
 * and no database.
 */
export function buildTopic(
  card: TopicCard,
  today: BoardDay,
  entries: readonly FeedEntry[],
): Topic {
  const days = topicWindowDays(today);
  const inWindow = new Set(days.map((d) => d.id));
  return {
    ...card,
    today: today.id,
    from: days[days.length - 1]!.id,
    entries: entries
      .filter((e) => inWindow.has(e.day) && e.topics.includes(card.value))
      .sort(
        (a, b) =>
          b.day.localeCompare(a.day) ||
          // An entry the sweep has not ranked sorts last within its day. A
          // missing rank is not rank 0 — `buildFeed`'s rule, kept.
          (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
          a.slug.localeCompare(b.slug),
      ),
  };
}

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

export const TOPICS_MEANING =
  "Every category a listed product has chosen, with how many products carry it. A category is picked by a product's own maintainers from a published vocabulary.";

// ---------------------------------------------------------------------------
// AG2 — the comparison grid
// ---------------------------------------------------------------------------
//
// *"A topic page becomes a living leaderboard plus a stack-and-licence grid —
// the page that ranks in search and the one an engineer bookmarks."*
//
// THE LIST AND THE GRID ANSWER DIFFERENT QUESTIONS, which is why the page
// holds both rather than replacing one with the other. The list is ordered:
// what launched here recently, in the board's own order, and its subject is
// TIME. The grid is not ordered at all — it is the same launches with their
// facts laid side by side, and its subject is COMPARISON. An engineer deciding
// between four things in a category is not asking which shipped on Tuesday.
//
// EVERY COLUMN IS `observed` OR `authored`, AND SAYS WHICH. That is AG2's
// done-when, and it is a real constraint rather than a label: it rules out
// every derived number this estate computes — the rank, the counted
// endorsements, the discount — from a table whose whole purpose is comparison.
// A grid that put a ranking beside a licence would be inviting a reader to
// compare the two, and one of them is our arithmetic rather than a fact about
// the product.
//
// The product's NAME is not a column. It is the row's identity, rendered as
// the row header, for the same reason `CatalogCard` leaves `slug` unwrapped:
// wrapping an identifier in provenance would say something false — that
// somebody observed or computed which listing this is.

export type GridProvenance = "observed" | "authored";

export interface TopicGridColumn {
  readonly id: "licence" | "stack" | "openings";
  readonly label: string;
  readonly provenance: GridProvenance;
  /** What that class means for THIS field, in one line. A reader who has to
   *  go and look up what "observed" covers has been told a category, not a
   *  fact (OPC-2). */
  readonly note: string;
}

export const TOPIC_GRID_COLUMNS: readonly TopicGridColumn[] = [
  {
    id: "licence",
    label: "Licence",
    provenance: "observed",
    note: "Read from the linked repository when the listing was published, not typed by its maintainers.",
  },
  {
    id: "stack",
    label: "Built with",
    provenance: "authored",
    note: "What the maintainers wrote, canonicalised against the published vocabulary. Anything it did not recognise stays on the listing in their own words.",
  },
  {
    id: "openings",
    label: "People wanted",
    provenance: "authored",
    note: "Roles the maintainers opened. Nothing observes whether one is still needed, which is why this is their claim and not ours.",
  },
];

export const TOPIC_GRID_HEADING = "Compare";

export const TOPIC_GRID_MEANING =
  "The same launches, side by side. Every column here is either observed or authored — nothing computed, because a ranking beside a licence invites a comparison between our arithmetic and a fact about the product.";

/** Where a provenance class is explained. One address, like a formula's. */
export const PROVENANCE_HREF = "/docs#provenance";

/**
 * One row's cells, in column order.
 *
 * ABSENCE IS A DASH, NEVER A ZERO OR A GUESS. A listing whose licence was
 * never observed shows `—` and not "unknown", "none" or "proprietary" —
 * OPC-C's rule, and the one this grid is most likely to be asked to break,
 * because an empty cell in a comparison table looks like a gap to fill.
 *
 * PURE, and it takes the entry the list beside it renders — so the grid and
 * the list are two views of one array and cannot disagree (WC-7).
 */
export function topicGridRow(entry: {
  readonly licence: string | null;
  readonly stack: readonly string[];
  readonly roleOpeningCount: number;
}): readonly string[] {
  return [
    entry.licence ?? "—",
    entry.stack.length > 0 ? entry.stack.join(", ") : "—",
    // A ZERO HERE IS A REAL ANSWER and renders as one: "nobody is wanted" is
    // something the maintainers said by opening no roles, unlike a licence
    // nobody read. The dash and the zero mean different things and the grid
    // keeps them apart.
    String(entry.roleOpeningCount),
  ];
}

export const TOPIC_EMPTY_NOTE =
  "Nothing in this topic has launched in the last thirty days. Everything in it is still in the directory.";

/** The sentence under a topic's heading. Names the span, because a page
 *  showing three launches should say whether that is three this month or three
 *  ever. */
export function topicMeaning(topic: Topic): string {
  const n = topic.products;
  return `${n} ${n === 1 ? "product" : "products"} in this topic. Below: what launched in the last ${TOPIC_WINDOW_DAYS} days, in the order each day's board put it in.`;
}
