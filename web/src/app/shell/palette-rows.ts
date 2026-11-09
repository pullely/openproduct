// The search field's pure half (openproduct-commons DS3).
//
// Separated from `palette.tsx` for the reason the overlay store is: the web
// test lane is module-level and cannot compile JSX, so logic that deserves
// direct assertions has to live outside a component. That constraint keeps
// pushing the right way — the rule for what a search result BECOMES is a rule
// about the product, not about a React tree.

import {
  MAKER_MATCH_LABELS,
  SEE_ALL_RESULTS,
  labelOf,
  makerPath,
  matchTopics,
  searchPath,
  stackPath,
  type SearchMakerHit,
} from "@openproduct/contracts";

/** One hit as the DS0 index returns it. */
export interface SearchHit {
  readonly kind: string;
  readonly entityId: string;
  readonly title: string;
  readonly summary: string | null;
  readonly matched: string;
}

/** Which class a row belongs to. The field groups by this, under the same
 *  headings the results page uses, so a reader who follows `See all results`
 *  lands on a page laid out the way the dropdown was. */
export type PaletteRowType = "product" | "person" | "topic" | "stack" | "all";

export interface PaletteRow {
  readonly type: PaletteRowType;
  readonly id: string;
  readonly title: string;
  readonly detail: string | null;
  readonly href: string;
  /** Two initials for the row's disc, when the row draws one. */
  readonly initials?: string;
}

/** The heading each class sits under. `all` has none — it is the door out of
 *  the list rather than a member of it. */
export const PALETTE_SECTIONS: Record<PaletteRowType, string | null> = {
  stack: "Stacks",
  topic: "Topics",
  product: "Products",
  person: "Makers",
  all: null,
};

/** At most two letters, never empty — the same rule the feed's tile follows. */
export function initialsOf(value: string): string {
  const words = value.split(/[\s\-_.]+/).filter((word) => word.length > 0);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * Turn index hits into rows, and derive the STACK class from the query.
 *
 * A stack is not a destination, it is a question: the honest answer to
 * "TypeScript" is not a page about TypeScript but every product built with
 * it. So a stack row links to the search page with that word, which is a
 * real, shareable, reload-safe URL rather than a special mode.
 *
 * Stacks are derived from the query against the vocabulary rather than
 * returned by the index, because the index answers about PRODUCTS. Asking it
 * to also emit facet rows would make one endpoint answer two questions and
 * put the vocabulary in two places.
 *
 * PEOPLE ARE ANSWERED NOW, and they arrive the same way the results page gets
 * them: `/v1/search` resolves public profiles live, so somebody who turned
 * their profile off stops being findable on the next keystroke rather than on
 * the next cache expiry. The field used to carry a standing "not yet" for this
 * class; a promise the product has since kept does not need one.
 */
export function toRows(
  results: readonly SearchHit[],
  query: string,
  makers: readonly SearchMakerHit[] = [],
): PaletteRow[] {
  const rows: PaletteRow[] = [];
  const folded = query.trim().toLowerCase().replace(/[^a-z0-9+#.]+/g, "-");
  const label = labelOf("stack", folded);
  if (label) {
    rows.push({
      type: "stack",
      id: folded,
      // VC1 — IT HAS A PAGE NOW, AND UNTIL VC1 IT DID NOT. This row used to
      // send a reader to `/search?q=TypeScript`, on reasoning worth keeping
      // because it was right at the time: "the honest answer to TypeScript is
      // not a page about TypeScript but every launch built with it, and the
      // directory that used to answer that with a facet is gone". VC1 gives
      // that answer an address, so the question resolves to the page that
      // holds it rather than to a search for its own name.
      //
      // And the detail line follows: `/stack/{value}` is the DIRECTORY
      // filtered, not the board, so "launch" was the wrong noun as well as
      // the wrong destination.
      title: label,
      detail: "every product built with it",
      href: stackPath(folded),
    });
  }
  // SR0 — topics, from the same vocabulary the results page uses. Both a
  // topic and a stack are destinations now; they answer different questions
  // (what LAUNCHED recently against everything there IS), which the pages say
  // for themselves.
  for (const topic of matchTopics(query, 2)) {
    rows.push({
      type: "topic",
      id: topic.value,
      title: topic.label,
      detail: "a topic",
      href: topic.href,
    });
  }
  for (const result of results) {
    if (result.kind !== "product") continue;
    rows.push({
      type: "product",
      id: result.entityId,
      title: result.title,
      detail: result.summary,
      href: `/${result.entityId}`,
      initials: initialsOf(result.title),
    });
  }
  for (const maker of makers) {
    // THEIR NAME IF THEY WROTE ONE, their handle otherwise — never a
    // generated stand-in. `matched` says why they are in the list, so nobody
    // is left wondering how a search for a word found a person.
    const name = maker.displayName ?? `@${maker.handle}`;
    rows.push({
      type: "person",
      id: maker.handle,
      title: name,
      detail: `@${maker.handle} · matched their ${MAKER_MATCH_LABELS[maker.matched]}`,
      href: makerPath(maker.handle),
      initials: initialsOf(name),
    });
  }
  // SR0 — the door out of the field, and it is LAST because it is the
  // fallback rather than the answer. A dropdown is a jump; this is where you
  // go when the jump is not enough, and it leads somewhere you can read,
  // share and reload.
  //
  // ALWAYS PRESENT WHEN THERE IS A QUERY, including when there are no rows
  // above it: "nothing here, and here is where to look properly" is more
  // useful than an empty box, and the results page can say why in a way a
  // dropdown has no room for.
  if (query.trim().length > 0) {
    rows.push({
      type: "all",
      id: "__all__",
      title: SEE_ALL_RESULTS,
      detail: null,
      href: searchPath(query),
    });
  }
  return rows;
}
