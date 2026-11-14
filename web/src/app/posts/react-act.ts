// The reaction act, read and addressed (openproduct-redesign OPR-3).
//
// PURE, and shared by the three places that must agree: the control that
// builds the address (`reaction-control.tsx`), the route that reads it
// (`me/react/route.ts`), and the record that carries the act through sign-in
// (`me/pending.ts`).
//
// ONE REACTION PER PERSON PER POST. Setting another replaces it; `none`
// clears it. So the address names the reaction wanted AFTER the press, and
// there is no `on` to flip.

import { PRODUCT_POST_ID_RE, isProductPostReaction, type ProductPostReaction } from "@openproduct/contracts";

/** The word that clears a reaction, in the address. Not a reaction. */
export const REACTION_NONE = "none";

/** `POST` here. `reaction` is one of the four, or null to clear. */
export function reactPath(postId: string, reaction: ProductPostReaction | null, returnTo: string): string {
  return `/me/react?post=${encodeURIComponent(postId)}&reaction=${reaction ?? REACTION_NONE}&return_to=${encodeURIComponent(returnTo)}`;
}

/** The fragment a reaction control is returned to after sign-in. */
export function reactAnchor(postId: string): string {
  return `react-${postId}`;
}

export interface ReactAct {
  postId: string;
  /** The reaction to hold after this act; null clears. */
  reaction: ProductPostReaction | null;
}

/**
 * The act an address asks for, or null when it asks for nothing this route
 * can do: a post id that is not one, or a reaction outside the vocabulary.
 * An absent `reaction` is a clear, the same as `none`.
 */
export function readReactAct(params: { get(name: string): string | null }): ReactAct | null {
  const postId = params.get("post") ?? "";
  if (!PRODUCT_POST_ID_RE.test(postId)) return null;
  const raw = params.get("reaction");
  if (raw === null || raw === "" || raw === REACTION_NONE) return { postId, reaction: null };
  return isProductPostReaction(raw) ? { postId, reaction: raw } : null;
}

/** What the enhanced caller is told, beyond `me/act.ts`'s three. */
export type ReactOutcome = "ok" | "signin" | "own-post" | "failed";

/**
 * A write's result as an outcome. `409` is the caller's own post: not a
 * failure of anything, and the control puts itself back without a word.
 * Any other refusal (a post that stopped being published) and an outage are
 * both `failed` — the control reverts.
 */
export function reactOutcome(
  result: { kind: "ok" } | { kind: "unauthorized" } | { kind: "refused"; status: number } | { kind: "unavailable" },
): ReactOutcome {
  if (result.kind === "ok") return "ok";
  if (result.kind === "unauthorized") return "signin";
  if (result.kind === "refused" && result.status === 409) return "own-post";
  return "failed";
}
