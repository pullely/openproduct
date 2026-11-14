"use client";

import * as React from "react";

import type { OverlayCrew, ProductPostReaction } from "@openproduct/contracts";

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
  /** OPR-3 — product post ids (`ppo_…`); answered in `reactions`. */
  productPosts: readonly string[] = [],
  /** OPR-3 — seat ids (`opr_…`); answered in `requestedOpenings`. */
  openings: readonly string[] = [],
): OverlayState {
  const state = React.useSyncExternalStore(subscribeOverlay, overlayState, serverSnapshot);

  // The join, not the array, is the dependency: a component that rebuilds its
  // id array every render (every list does) would otherwise re-request on
  // every render forever.
  const key = ids.join(",");
  const followKeys = follows.join(",");
  const postIds = posts.join(",");
  const productPostIds = productPosts.join(",");
  const openingIds = openings.join(",");
  React.useEffect(() => {
    request(
      key.length > 0 ? key.split(",") : [],
      followKeys.length > 0 ? followKeys.split(",") : [],
      postIds.length > 0 ? postIds.split(",") : [],
      productPostIds.length > 0 ? productPostIds.split(",") : [],
      openingIds.length > 0 ? openingIds.split(",") : [],
    );
  }, [key, followKeys, postIds, productPostIds, openingIds]);

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

// ─── OPR-3 — reactions, crew, requested seats ──────────────────────────────
//
// Three more questions, each over its own field, and each a pure reader of a
// state plus a hook that asks for exactly what it reads. The readers answer
// "nothing" for a `pending` or `absent` overlay, so the server render and the
// signed-out page are the same anonymous one (I6).

const NONE: readonly string[] = Object.freeze([]);

/** My reaction on this product post, or null — also null while unknown. */
export function reactionOn(state: OverlayState, postId: string): ProductPostReaction | null {
  return state.status === "ready" ? (state.overlay.reactions[postId] ?? null) : null;
}

/** The crew entry for this slug when the visitor is on its crew, else null. */
export function crewOf(state: OverlayState, slug: string): OverlayCrew | null {
  if (state.status !== "ready") return null;
  return state.overlay.crew.find((entry) => entry.slug === slug) ?? null;
}

/** Whether the visitor has a pending request for this seat (`opr_…`). */
export function isOpeningRequested(state: OverlayState, openingId: string): boolean {
  return state.status === "ready" && state.overlay.requestedOpenings.includes(openingId);
}

/**
 * My reaction on one product post. Asks the overlay about this post id
 * (`productPosts=`), coalesced with every other card on the page.
 */
export function useReaction(postId: string): ProductPostReaction | null {
  const ids = React.useMemo(() => [postId], [postId]);
  return reactionOn(useOverlay(NONE, NONE, NONE, ids), postId);
}

/**
 * Whether the visitor is on this product's crew, with the workspace and
 * listing ids the crew routes are addressed by. Asks the overlay about the
 * slug (`ids=`); null until it answers, and null for everybody else.
 */
export function useCrewOf(slug: string): OverlayCrew | null {
  const ids = React.useMemo(() => [slug], [slug]);
  return crewOf(useOverlay(ids), slug);
}

/** Whether the visitor asked for this seat. Asks about it (`openings=`). */
export function useOpeningRequested(openingId: string): boolean {
  const ids = React.useMemo(() => [openingId], [openingId]);
  return isOpeningRequested(useOverlay(NONE, NONE, NONE, NONE, ids), openingId);
}
