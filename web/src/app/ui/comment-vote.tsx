"use client";

import {
  COMMENT_VOTED_LABEL,
  COMMENT_VOTE_LABEL,
  COMMENT_VOTE_NOTE,
} from "@openproduct/contracts";

import { hasVotedOnPost, useOverlay } from "./use-overlay";
import { useToggle } from "./use-toggle";

/**
 * The upvote on a comment (openproduct-launch DQ1).
 *
 * THE DESIGN'S `▲` AND ITS COUNT, and the same shape UV0's vote box takes on a
 * launch — one gesture, drawn the same way wherever it appears, so a reader
 * does not have to learn two controls for one act.
 *
 * THE SERVER RENDER IS THE ANONYMOUS ONE (I6). A plain form saying `Upvote`
 * with the public count beside it, byte-identical in every visitor's HTML.
 * After hydration the overlay may say this visitor already upvoted it, and
 * only then does the label change. Signed out, the form still posts: the
 * handler bounces through sign-in and returns by fragment, so the intent
 * survives the round trip (XP2).
 *
 * NOT THE ACCENT (XP-1), and this one is worth stating because it is the
 * closest call on the estate. The reserved colour means ENDORSEMENT — a
 * listing's upvote, the thing that moves the board and the directory — and a
 * comment's upvote moves nothing at all. Spending the accent here would make
 * two different-weight acts look identical, which is exactly what the
 * one-colour-one-meaning rule exists to stop.
 *
 * THE AUTHOR'S OWN COMMENT STILL DRAWS IT, and the refusal comes from the act
 * rather than from the markup. The page is cached and anonymous: it cannot
 * know who is reading, so it cannot hide the control from an author without
 * becoming two documents. The schema's trigger and the handler's 409 are where
 * a self-vote is actually stopped.
 */
export function CommentVote({
  postId,
  votes,
  returnTo,
}: {
  postId: string;
  /** The public count, from the page's own cached document. Rendered at zero:
   *  something observes a vote, so a zero has been counted and found empty
   *  rather than being a claim nobody could make (OPC-C). */
  votes: number;
  /** Where sign-in returns to, and where the post redirects back to. */
  returnTo: string;
}) {
  const state = useOverlay([], [], [postId]);
  const voted = hasVotedOnPost(state, postId);
  const { delta, pending, onSubmit } = useToggle("postVotes", postId, !voted);
  const target = `${returnTo}#comment-${postId}`;

  return (
    <form
      onSubmit={onSubmit}
      id={`comment-${postId}`}
      method="post"
      className="inline-flex"
      action={`/me/comment-vote?post=${encodeURIComponent(postId)}&on=${
        voted ? "0" : "1"
      }&return_to=${encodeURIComponent(target)}`}
    >
      <button
        type="submit"
        disabled={pending}
        aria-pressed={voted}
        aria-label={`${voted ? COMMENT_VOTED_LABEL : COMMENT_VOTE_LABEL} this comment`}
        title={COMMENT_VOTE_NOTE}
        className={`inline-flex h-[28px] items-center gap-1.5 rounded-full border px-[10px] text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          voted
            ? "border-border bg-muted text-foreground"
            : "border-border bg-card text-muted-foreground hover:border-faint hover:text-foreground"
        }`}
      >
        <span aria-hidden="true" className="text-[10px]">
          ▲
        </span>
        <span className="font-mono tabular-nums">{votes + delta}</span>
      </button>
    </form>
  );
}
