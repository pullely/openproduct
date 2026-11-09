// Alternatives (openproduct-worldclass PV2).
//
// "What else could I use instead of this" — answered with the REASON beside
// every row, because a list of four products with no stated relationship is
// a recommendation, and this product does not make those.
//
// ─── WHAT THIS REPLACES, AND WHY ──────────────────────────────────────────
//
// DS4 shipped `similarTo` — same category, ordered by observed activity, with
// its rule in an `sr-only` line under the panel. It was the simplest
// defensible thing and it was right at the time. This is strictly more
// informative: category is one of four signals here, every row states its own
// overlap where a reader can see it, and a listing with nothing in common is
// ABSENT rather than fourth.
//
// Two panels of small product tiles side by side would be the defect CV0 is
// fixing on the discussion modules, one plane over — so this replaces that
// panel rather than sitting beside it.
//
// ─── THE PLAN'S OWN EXAMPLE IS NOT EXPRESSIBLE, AND THAT IS A FINDING ─────
//
// PV2's done-when says alternatives render with their reason — *"shares 3
// topics, same licence"*. **A listing cannot share three topics with
// anything.** `topics.ts` is explicit: A TOPIC IS A CATEGORY VALUE, CT1
// assigns exactly one per listing, and its header says widening that is "a
// taxonomy decision, not a page". The three-topic example came from the audit
// describing the benchmark, not from this model.
//
// So the overlap this can actually state is: the topic (shared or not), the
// STACK (a real array, so "shares Rust and Postgres" is a true sentence), the
// licence, and where it runs.
//
// ─── TWO UNOBSERVED LICENCES ARE NOT A MATCH ─────────────────────────────
//
// The bug this module was written to not have. `licence` is `null` when
// nobody has read the repository — OPC-C's dash, not a value — so comparing
// two nulls and calling it "same licence" would manufacture a shared property
// out of two absences, and put that sentence on a public page. Every
// comparison below requires the value to EXIST on both sides before it can
// match.

import type { PublicProfileCard } from "./index.js";

/**
 * How many alternatives a listing shows. Four, as DS4 drew the panel it
 * replaces.
 *
 * A number rather than "as many as overlap" because the panel is a suggestion
 * and a long one stops being that — a sidebar of twenty is a second directory
 * competing with the page a reader chose to open.
 */
export const ALTERNATIVES_LIMIT = 4;

/** What two listings have in common. Every field is a FACT about both. */
export interface Overlap {
  /** Same category — which is what a topic is here (`topics.ts`). */
  readonly sameTopic: boolean;
  /** The canonical stack entries both carry, in the subject's own order. */
  readonly sharedStack: readonly string[];
  /** Both licences observed, and equal. Two absences never match. */
  readonly sameLicence: boolean;
  /** Both hosting answers given, and equal. */
  readonly sameHosting: boolean;
}

/** Nothing in common. Not rendered — see `alternativesFor`. */
export const NO_OVERLAP: Overlap = {
  sameTopic: false,
  sharedStack: [],
  sameLicence: false,
  sameHosting: false,
};

type Comparable = Pick<
  PublicProfileCard,
  "slug" | "category" | "stackCanonical" | "licence" | "hosting"
>;

/**
 * What these two share.
 *
 * `stackCanonical` rather than `stack`: the maintainer's own words are theirs
 * and are not a vocabulary, so "shares Hand-rolled CRDT" would be an overlap
 * of two people having typed the same phrase. CT1's canonical subset is the
 * one both sides were folded into.
 */
export function overlapOf(subject: Comparable, other: Comparable): Overlap {
  const theirs = new Set(other.stackCanonical);
  return {
    // Both must have ANSWERED. `null` is "they have not chosen" (CT1), and
    // two listings that have not chosen are not in the same place.
    sameTopic: subject.category !== null && subject.category === other.category,
    sharedStack: subject.stackCanonical.filter((entry) => theirs.has(entry)),
    sameLicence: subject.licence !== null && subject.licence === other.licence,
    sameHosting: subject.hosting !== null && subject.hosting === other.hosting,
  };
}

/** Whether there is anything to say. Nothing shared is not an alternative. */
export function hasOverlap(overlap: Overlap): boolean {
  return (
    overlap.sameTopic ||
    overlap.sharedStack.length > 0 ||
    overlap.sameLicence ||
    overlap.sameHosting
  );
}

/**
 * How strongly two listings overlap — the ordering input, and nothing else.
 *
 * DELIBERATELY CRUDE AND DELIBERATELY PUBLISHED. Signals count once each and
 * the stack counts once per shared entry, so the number is something a reader
 * holding the same catalog can recompute on paper. A weighting anybody has to
 * take on trust is the thing OPC-4 exists to refuse, and a tuned one would be
 * a ranking wearing arithmetic.
 */
export function overlapScore(overlap: Overlap): number {
  return (
    (overlap.sameTopic ? 1 : 0) +
    overlap.sharedStack.length +
    (overlap.sameLicence ? 1 : 0) +
    (overlap.sameHosting ? 1 : 0)
  );
}

/**
 * The overlap, as the sentence rendered beside the row.
 *
 * VISIBLE, not `sr-only`. DS4 put its rule under the panel for a screen
 * reader because one rule covered every row; here the reason DIFFERS per row,
 * and a reason only some readers get is the unexplained list PV2's done-when
 * refuses.
 *
 * Named values rather than counts wherever there are names: "shares Rust and
 * Postgres" tells a reader whether the overlap is the one they care about,
 * and "shares 2 of its stack" does not. Past three the names stop fitting a
 * sidebar and it falls back to the count.
 */
export const STACK_NAMES_SHOWN = 3;

export function overlapSentence(overlap: Overlap): string {
  const parts: string[] = [];
  if (overlap.sameTopic) parts.push("same topic");
  if (overlap.sharedStack.length > 0) {
    const stack = overlap.sharedStack;
    parts.push(
      stack.length > STACK_NAMES_SHOWN
        ? `shares ${stack.length} of its stack`
        : `shares ${listOf(stack)}`,
    );
  }
  if (overlap.sameLicence) parts.push("same licence");
  if (overlap.sameHosting) parts.push("runs the same way");
  return parts.join(" · ");
}

/** "a", "a and b", "a, b and c" — the sentence, not a join. */
function listOf(values: readonly string[]): string {
  if (values.length === 1) return values[0]!;
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]!}`;
}

export interface Alternative {
  readonly card: PublicProfileCard;
  readonly overlap: Overlap;
  /** The rendered sentence, computed once so the page cannot render a
   *  different one from the one the order was taken over. */
  readonly reason: string;
}

/**
 * `alternatives.overlap` — other listings a reader might use instead.
 *
 * ORDERED BY WHAT THEY SHARE, and nothing else. No behavioural signal, no
 * popularity term, and no clock: two listings that overlap identically are
 * broken by slug so the panel is the same for every reader and the same
 * tomorrow. That last clause is the one worth defending — DS4 broke ties by
 * observed activity, which means a listing's neighbours reshuffled whenever
 * somebody else pushed a commit, and a panel that moves for reasons the page
 * does not mention is a panel a reader cannot check.
 *
 * A listing sharing NOTHING is absent. Filling four slots with unrelated
 * products would be inventing a relationship in order to fill a sidebar,
 * which is `similarTo`'s own rule about categories applied to the whole panel.
 */
export function alternativesFor(
  cards: readonly PublicProfileCard[],
  slug: string,
  limit: number = ALTERNATIVES_LIMIT,
): Alternative[] {
  const subject = cards.find((c) => c.slug === slug);
  if (!subject) return [];
  return cards
    .filter((c) => c.slug !== slug)
    .map((card) => ({ card, overlap: overlapOf(subject, card) }))
    .filter((entry) => hasOverlap(entry.overlap))
    .sort(
      (a, b) =>
        overlapScore(b.overlap) - overlapScore(a.overlap) ||
        b.overlap.sharedStack.length - a.overlap.sharedStack.length ||
        a.card.slug.localeCompare(b.card.slug),
    )
    .slice(0, limit)
    .map((entry) => ({ ...entry, reason: overlapSentence(entry.overlap) }));
}
