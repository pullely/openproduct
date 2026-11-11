"use client";

import * as React from "react";

import {
  OVERLAY_PENDING,
  overlayState,
  request,
  subscribeOverlay,
  type OverlayState,
} from "./overlay";

/**
 * Subscribe to the overlay, contributing the ids this component cares about
 * (openproduct-commons XP2).
 *
 * `useSyncExternalStore` rather than `useState` + an effect, for the reason
 * that hook exists: the store is written from outside React, and this is the
 * one path where a torn read would be visible — two save buttons on the same
 * page disagreeing about whether the product is saved.
 *
 * THE SERVER SNAPSHOT IS ALWAYS `pending`, and that is invariant I6 in one
 * line: the server render of every component that uses this hook is the
 * anonymous render, byte-identical for every visitor, and personalisation
 * happens strictly after hydration in the visitor's own browser.
 */
export function useOverlay(
  ids: readonly string[] = [],
  follows: readonly string[] = [],
  posts: readonly string[] = [],
): OverlayState {
  const state = React.useSyncExternalStore(subscribeOverlay, overlayState, serverSnapshot);

  // The join, not the array, is the dependency: a component that rebuilds its
  // id array every render (every list does) would otherwise re-request on
  // every render forever.
  const key = ids.join(",");
  const followKeys = follows.join(",");
  const postIds = posts.join(",");
  React.useEffect(() => {
    request(
      key.length > 0 ? key.split(",") : [],
      followKeys.length > 0 ? followKeys.split(",") : [],
      postIds.length > 0 ? postIds.split(",") : [],
    );
  }, [key, followKeys, postIds]);

  return state;
}

/**
 * The server snapshot, and the same frozen instance every time — React
 * compares snapshots by identity, and a fresh literal per call reads as a
 * store that never settles.
 */
function serverSnapshot(): OverlayState {
  return OVERLAY_PENDING;
}

/** Whether the overlay says this visitor SAVED this slug — the private act. */
export function isSaved(state: OverlayState, slug: string): boolean {
  return state.status === "ready" && state.overlay.saved.includes(slug);
}

/**
 * Whether the overlay says this visitor ENDORSED this slug — the public act.
 *
 * A separate function from `isSaved` over a separate field, deliberately. The
 * two are one keystroke apart and mean opposite things about privacy, so
 * there is no helper here that answers "did they interact with this".
 */
export function isEndorsed(state: OverlayState, slug: string): boolean {
  return state.status === "ready" && state.overlay.endorsed.includes(slug);
}

/**
 * Whether the overlay says this visitor UPVOTED this comment (DQ1).
 *
 * A fourth function over a fourth field. Four acts, four tables, four privacy
 * rules — and still no helper anywhere that answers the flattening question
 * "did they interact with this".
 */
export function hasVotedOnPost(state: OverlayState, postId: string): boolean {
  return state.status === "ready" && state.overlay.postVotes.includes(postId);
}

/**
 * Whether the overlay says this visitor FOLLOWS this target (FL0).
 *
 * A third function over a third field, for the reason `isEndorsed` is separate
 * from `isSaved`: three acts, three tables, three privacy rules, and no helper
 * anywhere that answers the flattening question "did they interact with this".
 */
export function isFollowing(state: OverlayState, key: string): boolean {
  return state.status === "ready" && state.overlay.follows.includes(key);
}

/**
 * NF0 — how many unread rows the badge should show, or 0 while the overlay is
 * pending or absent.
 *
 * NOT ONE OF THE FOUR ABOVE, and it reads differently for a reason: those
 * answer "did this visitor act on THIS THING", which is why each is bounded by
 * what the page rendered and why none of them is allowed to generalise. This
 * one is a fact about the READER and about nothing on the page, so it is a
 * number rather than a membership test and there is nothing here it could be
 * turned into a listing of.
 *
 * A signed-out visitor has no badge at all, which is the same answer as
 * "nothing unread" and is correct for both.
 */
export function unreadCount(state: OverlayState): number {
  return state.status === "ready" ? state.overlay.unread : 0;
}
