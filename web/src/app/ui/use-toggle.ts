"use client";

// One hook for the four toggles — upvote, save, follow, comment upvote
// (openproduct-performance OPP2; the hint at OPP14).
//
// THE ENHANCEMENT RUNS ONLY WHEN THE VISITOR CAN ACT, and that one condition
// carries the design: signed in, the control moves the number and the
// membership before the server answers and reverts if it refuses; signed out
// (`absent`), the hook declines and the plain form posts, bouncing through
// sign-in and back to this exact control; with no JavaScript, `onSubmit`
// never runs and the form posts — byte-identical to before this existed.
//
// ─── THE GAP OPP14 CLOSES ─────────────────────────────────────────────────
//
// Between a document landing and `/me/overlay` answering — a few hundred
// milliseconds on every full load, longer on a slow link — the overlay is
// `pending`, and this hook used to decline THEN too. A signed-in visitor who
// clicked Upvote in that window got a full form post and a reload: the one
// slow click on the page, and the one nobody could reproduce on demand.
//
// The document already knows better. `layout.tsx` stamps a class on `<html>`
// before first paint when the session-hint cookie says "signed in" — the same
// hint the account chip paints its signed-in branch from. So while the
// overlay is pending, a hinted visitor acts at once: the count moves, the
// write goes, and the membership is DEFERRED into the overlay for when it
// arrives (`deferMembership`), because the overlay's answer may have left
// the server before the write landed. A `401` — the hint was stale — undoes
// the count and lets the form post, which is exactly what it would have done.
//
// `setMembership` still refuses to move anything while the overlay is pending
// or absent; that guard is the belt, and this hook's condition the braces.

import * as React from "react";

import { SIGNED_IN_CLASS } from "../auth/auth";
import {
  bumpLiveCount,
  emptyLiveCounts,
  liveCountDelta,
  liveCountKey,
  liveCounts,
  loadLiveCounts,
  subscribeLiveCounts,
} from "./live-counts";
import { deferMembership, setMembership, type OverlayList } from "./overlay";
import { useOverlay } from "./use-overlay";

export interface ToggleResult {
  delta: number;
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

/** The pre-paint hint: `<html class="op-signed-in">`, from the cookie. */
export function hintedSignedIn(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains(SIGNED_IN_CLASS)
  );
}

export function useToggle(list: OverlayList, key: string, on: boolean): ToggleResult {
  const state = useOverlay();
  // THE DELTA IS REMEMBERED, NOT HELD IN STATE (`live-counts.ts`): a number
  // this visitor just moved keeps its new value across a navigation and a
  // reload until every cache has turned over, instead of snapping back to
  // the cached document's figure the moment they leave the page.
  const countKey = liveCountKey(list, key);
  const counts = React.useSyncExternalStore(subscribeLiveCounts, liveCounts, emptyLiveCounts);
  React.useEffect(() => {
    loadLiveCounts();
  }, []);
  const delta = liveCountDelta(counts, countKey);
  const [pending, setPending] = React.useState(false);
  const statusRef = React.useRef(state.status);
  statusRef.current = state.status;

  const onSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      const status = statusRef.current;
      // Signed out, or unknown and not even hinted: let the form post.
      if (status === "absent" || (status === "pending" && !hintedSignedIn()) || pending) return;
      const form = event.currentTarget;
      const action = form.action;
      event.preventDefault();

      // With the overlay in hand the membership moves now; without it, the
      // move is queued for the overlay's arrival and only the count moves.
      const revertMembership = status === "ready" ? setMembership(list, key, on) : () => {};
      const step = on ? 1 : -1;
      bumpLiveCount(countKey, step);
      setPending(true);

      const undo = () => {
        revertMembership();
        bumpLiveCount(countKey, -step);
      };

      void (async () => {
        try {
          const res = await fetch(action, {
            method: "POST",
            headers: { accept: "application/json" },
            credentials: "same-origin",
            cache: "no-store",
          });
          if (res.status === 401) {
            undo();
            form.submit();
            return;
          }
          if (!res.ok) {
            undo();
            return;
          }
          if (status !== "ready") deferMembership(list, key, on);
        } catch {
          undo();
        } finally {
          setPending(false);
        }
      })();
    },
    [list, key, countKey, on, pending],
  );

  return { delta, pending, onSubmit };
}
