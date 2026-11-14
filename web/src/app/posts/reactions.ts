// A post's reactions, counted for drawing (openproduct-redesign OPR-3).
//
// PURE. Two facts meet in the reaction control and they come from two places:
// the COUNTS are public and in the page's cached document (the same for every
// visitor); MY reaction is personal and arrives after load (the overlay).
// These helpers put the two together, and the anonymous answer — no reaction
// of mine — is exactly what the server renders.

import {
  PRODUCT_POST_REACTIONS,
  PRODUCT_POST_REACTION_LABELS,
  emptyReactionCounts,
  type ProductPostReaction,
  type ProductPostReactionCounts,
} from "@openproduct/contracts";

/** Counts as sent, made safe: a whole number at or above zero per reaction. */
export function safeCounts(raw: Partial<Record<string, unknown>> | null | undefined): ProductPostReactionCounts {
  const out = emptyReactionCounts();
  if (!raw) return out;
  for (const reaction of PRODUCT_POST_REACTIONS) {
    const value = raw[reaction];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out[reaction] = Math.floor(value);
  }
  return out;
}

/** The counts with this visitor's own moves applied (`deltas`: what they did
 *  in this browser since the cached document was made). Never below zero. */
export function countsWith(
  counts: ProductPostReactionCounts,
  deltas: Partial<Record<ProductPostReaction, number>>,
): ProductPostReactionCounts {
  const out = emptyReactionCounts();
  for (const reaction of PRODUCT_POST_REACTIONS) {
    out[reaction] = Math.max(0, counts[reaction] + (deltas[reaction] ?? 0));
  }
  return out;
}

export function reactionTotal(counts: ProductPostReactionCounts): number {
  return PRODUCT_POST_REACTIONS.reduce((sum, reaction) => sum + counts[reaction], 0);
}

/**
 * The reactions the summary draws a mark for: only those ABOVE ZERO, the
 * most-held first (ties in the vocabulary's order), at most three.
 */
export function topReactions(counts: ProductPostReactionCounts, limit = 3): ProductPostReaction[] {
  return PRODUCT_POST_REACTIONS.filter((reaction) => counts[reaction] > 0)
    .map((reaction, index) => ({ reaction, index }))
    .sort((a, b) => counts[b.reaction] - counts[a.reaction] || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.reaction);
}

/** Each reaction with its count, only those above zero — for a breakdown. */
export function shownCounts(counts: ProductPostReactionCounts): Array<{ reaction: ProductPostReaction; label: string; count: number }> {
  return PRODUCT_POST_REACTIONS.filter((reaction) => counts[reaction] > 0).map((reaction) => ({
    reaction,
    label: PRODUCT_POST_REACTION_LABELS[reaction],
    count: counts[reaction],
  }));
}

/**
 * The words beside the marks (board `Feed`):
 *
 *   nobody             ""   — nothing is drawn; a zero is never shown
 *   others only        "5"
 *   me and others      "You and 4 others" / "You and 1 other"
 *   only me            "You"
 *
 * `mine` is null on the server and for a signed-out visitor, so the cached
 * page says the number and nothing about anybody.
 */
export function reactionSummaryText(counts: ProductPostReactionCounts, mine: ProductPostReaction | null): string {
  const total = reactionTotal(counts);
  if (mine === null) return total > 0 ? String(total) : "";
  // My own reaction is one of the total once the count has caught up with
  // it; until then (a cached count from before I reacted) nobody is
  // subtracted who was never added.
  const others = Math.max(0, total - (counts[mine] > 0 ? 1 : 0));
  if (others === 0) return "You";
  return `You and ${others} ${others === 1 ? "other" : "others"}`;
}

/** `5 reactions` / `1 reaction`, or null at zero — the compact card's line. */
export function reactionCountLine(counts: ProductPostReactionCounts): string | null {
  const total = reactionTotal(counts);
  if (total <= 0) return null;
  return `${total} ${total === 1 ? "reaction" : "reactions"}`;
}

/** `5 comments` / `1 comment`, or null at zero. */
export function commentCountLine(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const whole = Math.floor(count);
  return `${whole} ${whole === 1 ? "comment" : "comments"}`;
}

/** The live-count key one reaction of one post is remembered under
 *  (`ui/live-counts.ts`). */
export function reactionCountKey(postId: string, reaction: ProductPostReaction): string {
  return `reaction:${postId}:${reaction}`;
}
