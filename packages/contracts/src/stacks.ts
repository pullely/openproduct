// Stack pages (openproduct-worldclass VC1).
//
// The audit's P1·11: *"What is genuinely missing is topic and stack filters."*
// Half of that shipped with TP0 — a category is a `/topics/{value}` address,
// and the feed's rail already lists the ones with something in them, with
// counts. This is the other half, and the two are deliberately not the same
// shape.
//
// ─── A TOPIC IS A BOARD; A STACK IS A DIRECTORY ───────────────────────────
//
// `topics.ts` draws the distinction this file inherits: `/products?category=x`
// is *"THE DIRECTORY, filtered — every live listing in the topic, read once"*
// and `/topics/x` is *"THE BOARD, filtered — what LAUNCHED in this topic
// recently, read daily"*. A category earns a board because there are a dozen
// of them and a week of launches spreads across them.
//
// There are **fifty-seven** stack values. A board filtered to Erlang would be
// empty most weeks, and fifty-seven near-empty boards is a worse answer than
// none — so a stack address answers the DIRECTORY question, which is the one
// anybody actually asks about a language: *who is building with this*, not
// *what shipped in it on Tuesday*. The asymmetry is forced by the data rather
// than chosen for variety, and each page says which question it answers.
//
// ─── AND IT IS AN ADDRESS, NEVER A PREFERENCE (WC-4) ──────────────────────
//
// Every filter state is a path. Nothing here reads `searchParams` — a page
// that does is dynamic in Next, so its `revalidate` is accepted and ignored
// and the document goes out `no-store` (the defect the leaderboard's own
// header records catching). Nothing here reads a session either: the rail is
// links, the pages are cacheable documents, and two readers on the same
// address get the same bytes (I6, OPC-1).
//
// ONE FACET AT A TIME. No `/stack/rust+typescript`, and no query permutations:
// those are 2^n views of one list, they all say the same thing to a crawler,
// and this estate already decided they canonicalise to the bare list rather
// than becoming addresses of their own.

import { facet } from "./facets.js";
import type { PublicProfileCard } from "./index.js";

/** The facet a stack page IS. One constant rather than the string in six
 *  files, so a page and the count behind it cannot come apart. */
export const STACK_FACET = "stack";

export const STACKS_PATH = "/stack";

/** `/stack/{value}`. The value is a canonical facet value, never a
 *  maintainer's own spelling — see `stackTally` for why that matters. */
export function stackPath(value: string): string {
  return `${STACKS_PATH}/${encodeURIComponent(value)}`;
}

/** The published label for a canonical value, or `null` if the vocabulary
 *  does not have it — which is how a hand-typed URL becomes a 404 rather than
 *  a page titled after whatever was in the path. */
export function stackLabel(value: string): string | null {
  return facet(STACK_FACET)?.values.find((v) => v.value === value)?.label ?? null;
}

export interface StackTally {
  readonly value: string;
  readonly label: string;
  /** How many listings in the SAME document this tally was computed from. */
  readonly products: number;
}

/**
 * Every stack value the catalogue actually holds, with its count.
 *
 * ONLY PRESENT VALUES, which is `/topics`' own rule and DS1's before it: *"a
 * grid of topics that lead to empty pages is a grid of broken links"*. The
 * vocabulary has fifty-seven entries and the catalogue will hold a fraction of
 * them; offering the rest is offering fifty broken promises.
 *
 * AND ONLY `stackCanonical`. A card carries both what the maintainer wrote and
 * the canonicalised subset, and the card's own comment says the second is
 * *"the ONLY one facets and counts read"* — `TypeScript`, `typescript` and
 * `TS` are one language and three strings, and a count over the strings is a
 * count of nothing.
 *
 * COMPUTED FROM THE CARDS THE PAGE ALREADY HAS, never from a second read
 * (**WC-7**): the number beside a value and the list behind it come out of one
 * document, so they cannot disagree. That is also why this takes cards rather
 * than fetching — a tally is a pure function of a list.
 *
 * ORDERED BY COUNT, THEN BY LABEL. Ties break alphabetically rather than by
 * whatever order the catalogue happened to arrive in, because an order that
 * shuffles between reads is an order a reader cannot trust and a diff cannot
 * review.
 */
export function stackTally(cards: readonly PublicProfileCard[]): readonly StackTally[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    // A card may repeat a value — two spellings that canonicalise to one — and
    // it must still count once. The listing is what is being counted, not the
    // mention.
    for (const value of new Set(card.stackCanonical)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  const out: StackTally[] = [];
  for (const [value, products] of counts) {
    const label = stackLabel(value);
    // A value the vocabulary does not know cannot be labelled, cannot be
    // addressed, and is not counted. It should not be reachable — CT1
    // canonicalises at write time — and if one ever is, dropping it is better
    // than a rail entry titled with a raw slug.
    if (label !== null) out.push({ value, label, products });
  }
  return out.sort((a, b) => b.products - a.products || a.label.localeCompare(b.label));
}

/**
 * How many values the feed's rail offers.
 *
 * FIVE, matching `SIDEBAR_TOPIC_LIMIT` beside it — a rail is a way in, not a
 * table of contents, and `/stack` renders the whole vocabulary one click away.
 */
export const STACK_RAIL_LIMIT = 5;

/**
 * The rail's rows: the tally, capped.
 *
 * IT LIVES HERE AND NOT IN THE COMPONENT, which is `orderSidebarTopics`'s own
 * arrangement and OL-2a's rule: nothing in the web layer decides an order, and
 * a `.slice()` in a component is a decision about what a reader is shown made
 * somewhere no test of the ordering would ever look.
 */
export function railStacks(
  tally: readonly StackTally[],
  limit: number = STACK_RAIL_LIMIT,
): readonly StackTally[] {
  return tally.slice(0, limit);
}

/** The cards using one stack value, in the catalogue's own order. */
export function cardsWithStack(
  cards: readonly PublicProfileCard[],
  value: string,
): readonly PublicProfileCard[] {
  return cards.filter((card) => card.stackCanonical.includes(value));
}

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

export const STACKS_TITLE = "Built with";

export const STACKS_MEANING =
  "Every language and runtime a listed product is built with, with how many products carry it. A product's own maintainers write what they use; entries this vocabulary does not recognise stay on the page in their own words and are not counted.";

/** The rail's heading. Deliberately not "Stack": the rail is a list of
 *  answers to "built with what", and the heading is the question's words. */
export const STACK_RAIL_HEADING = "Built with";

export const STACK_EMPTY_NOTE =
  "Nothing in the directory is recorded as using this yet. A product's stack is what its maintainers wrote, canonicalised — so an absence here can mean nobody uses it, or that nobody has said so.";

/** What one stack page's list IS, said where the list begins (OPC-4). */
export function stackMeaning(label: string): string {
  return `Every listed product built with ${label}, newest first. This is the directory filtered, not the launch board — see a topic page for what launched recently.`;
}
