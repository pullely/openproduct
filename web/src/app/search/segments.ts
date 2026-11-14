// The search page's pure half (openproduct-redesign OPR1, boards `Search` and
// `PhoneSearch`).
//
// A SEPARATE MODULE FOR THE REASON `shell/palette-rows.ts` IS ONE: the web
// test lane is module-level and cannot compile JSX, so the rules that deserve
// a direct assertion live outside a component. What a segment is called, what
// it counts, which sections a choice shows, which words of a summary are
// marked and whether a person row can open are rules about the product, not
// about a React tree.

import type { SearchMakerHit } from "@openproduct/contracts";

/**
 * The classes of thing `/v1/search` answers with today, in the page's order.
 *
 * THE FOURTH SEGMENT IS TOPICS, NOT POSTS. The board's fourth segment holds
 * template posts; a post is not stored until OPR2 (`product_posts`) and the
 * search read returns none. What it does return beside products and people
 * is the topic list, so the segment is named for what it holds.
 */
export type SearchSection = "products" | "people" | "topics";
export type SearchSegment = "all" | SearchSection;

export const SEARCH_SECTIONS: readonly SearchSection[] = ["products", "people", "topics"];

export const SEGMENT_LABELS: Record<SearchSegment, string> = {
  all: "All",
  products: "Products",
  people: "People",
  topics: "Topics",
};

export type SearchCounts = Readonly<Record<SearchSection, number>>;

/** Everything the page found, across the three classes. */
export function resultTotal(counts: SearchCounts): number {
  return counts.products + counts.people + counts.topics;
}

/** The mono label over the title: `3 RESULTS`, `1 RESULT`. The label's class
 *  uppercases it; the string is written in sentence case. */
export function totalLabel(total: number): string {
  return `${total} ${total === 1 ? "result" : "results"}`;
}

export interface SegmentItem {
  readonly key: SearchSegment;
  readonly label: string;
  readonly count: number;
}

/**
 * The segmented control: All, then one segment per class — ALWAYS all four,
 * a class with nothing in it at zero. A control whose segments come and go
 * with the query moves under the pointer; a zero is the answer to "were
 * there any people", and it has been counted.
 */
export function searchSegments(counts: SearchCounts): SegmentItem[] {
  return [
    { key: "all", label: SEGMENT_LABELS.all, count: resultTotal(counts) },
    ...SEARCH_SECTIONS.map((key) => ({ key, label: SEGMENT_LABELS[key], count: counts[key] })),
  ];
}

/**
 * The sections a choice shows, in order. A section with nothing in it is
 * never drawn — under All it is simply absent, and under its own segment the
 * page says `No matches` once instead (an empty list here means exactly
 * that).
 */
export function visibleSections(segment: SearchSegment, counts: SearchCounts): SearchSection[] {
  return SEARCH_SECTIONS.filter(
    (section) => (segment === "all" || segment === section) && counts[section] > 0,
  );
}

/** A section's own head, shown under All only: `Products · 3`. */
export function sectionHead(section: SearchSection, count: number): string {
  return `${SEGMENT_LABELS[section]} · ${count}`;
}

/** What the page says when a query, or the chosen segment, found nothing. */
export const NO_MATCHES = "No matches.";

/** What it says when the read did not answer. Not `No matches`: that is a
 *  claim about the catalogue, and a read that failed has not made it (OD5). */
export const SEARCH_UNAVAILABLE = "Search is unavailable right now. Try again in a moment.";

// ─── THE HIGHLIGHT ─────────────────────────────────────────────────────────

export interface TextPart {
  readonly text: string;
  /** This run is a word that matched, and is drawn on the amber tint. */
  readonly hit: boolean;
}

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The stems a query is matched on, the board's rule: words of three letters
 * or more, and a word longer than six loses its last three so `policies`
 * still marks `policy`. Lower-cased; the match is case-insensitive.
 */
export function queryStems(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .map((word) => (word.length > 6 ? word.slice(0, word.length - 3) : word));
}

/**
 * A summary split into runs, the matched WORDS marked.
 *
 * WHOLE WORDS, as the board draws them: a stem found inside a word marks the
 * word, not four letters in the middle of it. A query with no usable stem
 * (one or two letters) marks nothing — the text comes back as one run.
 *
 * It marks what the summary SHOWS. The index may have matched on the name or
 * the stack instead (`matched`), in which case no word here is marked, and
 * that is correct: the highlight is a reading aid, not the reason.
 */
export function highlightParts(text: string, query: string): TextPart[] {
  const stems = queryStems(query).map(escapeForRegExp);
  if (text.length === 0) return [];
  if (stems.length === 0) return [{ text, hit: false }];
  const alternation = stems.join("|");
  const split = new RegExp(`(\\S*(?:${alternation})\\S*)`, "ig");
  const test = new RegExp(alternation, "i");
  return text
    .split(split)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, hit: test.test(part) }));
}

// ─── A PERSON ──────────────────────────────────────────────────────────────

/** One of a person's products, as a row under them. */
export interface SearchPersonProduct {
  readonly slug: string;
  readonly title: string;
}

/**
 * A person as `/v1/search` returns one, plus the list the row can open.
 *
 * `products` IS NOT IN TODAY'S RESPONSE (the same finding as the header
 * card's, `shell/palette-rows.ts`): the read sends a handle, a name and
 * which field matched. The row takes the list when a response carries it;
 * without one there is nothing to open and the chevron is not drawn. The
 * page never makes up products for somebody.
 */
export interface SearchPerson extends SearchMakerHit {
  readonly products?: readonly SearchPersonProduct[];
}

/** The products a person row can show: the list when the read sent one. */
export function personProducts(person: SearchPerson): readonly SearchPersonProduct[] {
  return Array.isArray(person.products) ? person.products : [];
}

/** THE CHEVRON RULE: a person row opens only when it has products to show. */
export function canExpandPerson(person: SearchPerson): boolean {
  return personProducts(person).length > 0;
}

/** Their name if they wrote one, their handle otherwise — never a stand-in. */
export function personName(person: SearchPerson): string {
  return person.displayName ?? `@${person.handle}`;
}

/**
 * The one line under a person's name.
 *
 * `2 products` when the read sent their products (the board's line).
 * Otherwise the handle and WHY they are in the list — a list of people with
 * no reason beside them leaves a reader wondering what was matched, and
 * "their bio" is a very different answer from "their handle".
 */
export function personLine(person: SearchPerson, matchLabel: string): string {
  const count = personProducts(person).length;
  if (count > 0) return `${count} ${count === 1 ? "product" : "products"}`;
  return `@${person.handle} · matched their ${matchLabel}`;
}
