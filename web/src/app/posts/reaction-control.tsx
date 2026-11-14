"use client";

// The reaction control (openproduct-redesign OPR-3; boards `Feed`, `PhoneFeed`).
//
// TWO ISLANDS, ONE STATE. The summary (the marks and the number) sits in the
// card's summary row; the picker (the `React` button and its four choices)
// in the action row. They are separate components because the card between
// them is a server component — and they never disagree, because neither
// holds the state: MY reaction is in the overlay store and the counts I
// moved are in the live-count store, both module singletons.
//
// THE SERVER RENDER IS THE ANONYMOUS ONE (I6): the public counts, nobody's
// reaction, a form that posts. After hydration the overlay may say which
// reaction is mine. Signed out, pressing one posts the form: the route
// bounces through sign-in, sets the reaction on the way back
// (`me/pending.ts`) and returns to this control by its fragment.
//
// NO JAVASCRIPT, IT STILL WORKS: the picker is a `<details>`, each choice a
// submit button with its own `formAction`.

import * as React from "react";

import {
  PRODUCT_POST_REACTIONS,
  PRODUCT_POST_REACTION_LABELS,
  type ProductPostReaction,
  type ProductPostReactionCounts,
} from "@openproduct/contracts";

import { FOCUS } from "../ui/design";
import {
  bumpLiveCount,
  emptyLiveCounts,
  liveCountDelta,
  liveCounts,
  loadLiveCounts,
  subscribeLiveCounts,
} from "../ui/live-counts";
import { deferReaction, overlayState, setReaction } from "../ui/overlay";
import { useReaction } from "../ui/use-overlay";
import { hintedSignedIn } from "../ui/use-toggle";

import { reactAnchor, reactPath } from "./react-act";
import { countsWith, reactionCountKey, reactionSummaryText, safeCounts, topReactions } from "./reactions";

/** The four marks, from the board: a bulb, a heart, a star, a question. */
const REACTION_ICON: Record<ProductPostReaction, string> = {
  useful: "M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z",
  would_use: "M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z",
  impressive: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z",
  curious: "M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17h.01",
};

/** Each reaction's fill: the amber, the teal, the slate, the green. */
const REACTION_FILL: Record<ProductPostReaction, string> = {
  useful: "bg-brand-amber",
  would_use: "bg-seat",
  impressive: "bg-version",
  curious: "bg-success",
};

function ReactionGlyph({ reaction, size }: { reaction: ProductPostReaction; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={size < 14 ? 2.6 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={REACTION_ICON[reaction]} />
    </svg>
  );
}

/** The public counts with what this visitor moved in this browser. */
function useLiveReactionCounts(postId: string, reactions: ProductPostReactionCounts): ProductPostReactionCounts {
  const live = React.useSyncExternalStore(subscribeLiveCounts, liveCounts, emptyLiveCounts);
  React.useEffect(() => {
    loadLiveCounts();
  }, []);
  const deltas: Partial<Record<ProductPostReaction, number>> = {};
  for (const reaction of PRODUCT_POST_REACTIONS) {
    deltas[reaction] = liveCountDelta(live, reactionCountKey(postId, reaction));
  }
  return countsWith(safeCounts(reactions), deltas);
}

/**
 * The marks and the number: up to three reaction marks (only reactions held
 * by somebody), then `5`, or `You and 4 others` once the overlay says one is
 * mine. NOTHING AT ZERO — no marks, no `0`.
 */
export function ReactionSummary({
  postId,
  reactions,
}: {
  postId: string;
  /** The post's public counts, from the page's own document. */
  reactions: ProductPostReactionCounts;
}) {
  const mine = useReaction(postId);
  const counts = useLiveReactionCounts(postId, reactions);
  const text = reactionSummaryText(counts, mine);
  if (text.length === 0) return null;
  const top = topReactions(counts);
  const said = top.map((reaction) => `${PRODUCT_POST_REACTION_LABELS[reaction]} ${counts[reaction]}`).join(", ");
  return (
    <span data-reaction-summary className="flex items-center gap-1.5" title={said.length > 0 ? said : undefined}>
      <span aria-hidden="true" className="flex">
        {top.map((reaction, index) => (
          <span
            key={reaction}
            className={`grid h-5 w-5 place-items-center rounded-full border-2 border-card text-card max-sm:h-[18px] max-sm:w-[18px] ${
              REACTION_FILL[reaction]
            } ${index > 0 ? "-ml-1.5" : ""}`}
          >
            <ReactionGlyph reaction={reaction} size={11} />
          </span>
        ))}
      </span>
      <span>
        <span className="sr-only">Reactions: </span>
        {text}
      </span>
    </span>
  );
}

/**
 * The `React` button and its four choices.
 *
 * Pressing a choice sets it; pressing the one that is already mine clears
 * it. The move is optimistic: the overlay and the count change at once, the
 * route answers, and anything but success puts both back — quietly on a
 * `409`, which is the caller's own post and not an error to show anybody.
 */
export function ReactionPicker({
  postId,
  returnTo,
}: {
  postId: string;
  /** The page this control is on; sign-in returns here, at this control. */
  returnTo: string;
}) {
  const mine = useReaction(postId);
  const [pending, setPending] = React.useState(false);
  const details = React.useRef<HTMLDetailsElement>(null);
  const target = `${returnTo}#${reactAnchor(postId)}`;

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const picked = submitter?.value as ProductPostReaction | undefined;
    if (!picked || !(PRODUCT_POST_REACTIONS as readonly string[]).includes(picked)) return;
    const status = overlayState().status;
    // Signed out, or unknown and not even hinted: let the form post.
    if (status === "absent" || (status === "pending" && !hintedSignedIn()) || pending) return;
    const form = event.currentTarget;
    event.preventDefault();

    const next = mine === picked ? null : picked;
    const action = reactPath(postId, next, target);
    const revert = status === "ready" ? setReaction(postId, next) : () => {};
    const moves: Array<[ProductPostReaction, number]> = [];
    if (mine !== null) moves.push([mine, -1]);
    if (next !== null) moves.push([next, 1]);
    for (const [reaction, step] of moves) bumpLiveCount(reactionCountKey(postId, reaction), step);
    const undo = () => {
      revert();
      for (const [reaction, step] of moves) bumpLiveCount(reactionCountKey(postId, reaction), -step);
    };
    if (details.current) details.current.open = false;
    setPending(true);

    void (async () => {
      try {
        const res = await fetch(action, {
          method: "POST",
          headers: { accept: "application/json" },
          credentials: "same-origin",
          cache: "no-store",
        });
        if (res.status === 401) {
          // The hint was stale. Put it back and let the form post: the route
          // carries the reaction through sign-in.
          undo();
          form.action = action;
          form.submit();
          return;
        }
        if (!res.ok) {
          undo();
          return;
        }
        if (status !== "ready") deferReaction(postId, next);
      } catch {
        undo();
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <form id={reactAnchor(postId)} method="post" action={reactPath(postId, null, target)} onSubmit={onSubmit} className="relative flex">
      <details ref={details} className="group/react relative flex-1">
        <summary
          data-react-button
          className={`flex min-h-[40px] cursor-pointer list-none items-center justify-center gap-1.5 rounded-full text-[13px] hover:bg-foreground/[0.04] max-sm:min-h-[44px] [&::-webkit-details-marker]:hidden ${FOCUS} ${
            mine ? "font-semibold text-amber-ink" : "font-medium text-copy"
          }`}
        >
          <ReactionGlyph reaction={mine ?? "useful"} size={17} />
          {mine ? PRODUCT_POST_REACTION_LABELS[mine] : "React"}
        </summary>
        <div
          role="group"
          aria-label="Choose a reaction"
          className="absolute bottom-[calc(100%+6px)] left-1 z-[2] flex gap-1 rounded-full bg-card p-1.5 ring-1 ring-inset ring-foreground/10"
        >
          {PRODUCT_POST_REACTIONS.map((reaction) => (
            <button
              key={reaction}
              type="submit"
              name="pick"
              value={reaction}
              disabled={pending}
              formAction={reactPath(postId, mine === reaction ? null : reaction, target)}
              aria-label={PRODUCT_POST_REACTION_LABELS[reaction]}
              aria-pressed={mine === reaction}
              title={PRODUCT_POST_REACTION_LABELS[reaction]}
              className={`grid h-[40px] w-[40px] shrink-0 cursor-pointer place-items-center rounded-full border-0 text-card max-sm:h-[44px] max-sm:w-[44px] ${
                REACTION_FILL[reaction]
              } ${mine === reaction ? "ring-[3px] ring-amber-soft" : ""} ${FOCUS}`}
            >
              <ReactionGlyph reaction={reaction} size={18} />
            </button>
          ))}
        </div>
      </details>
    </form>
  );
}
