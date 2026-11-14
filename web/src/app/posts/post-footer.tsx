import type { PublicProductPost } from "@openproduct/contracts";

import { productPostPagePath } from "@openproduct/contracts";

import { FOCUS } from "../ui/design";
import { AppLink } from "../ui/link";

import { ReactionPicker, ReactionSummary } from "./reaction-control";
import { commentCountLine, safeCounts } from "./reactions";

// The full card's footer (openproduct-redesign OPR-3; boards `Feed`, `Post`).
//
// A FILE OF ITS OWN, beside `post-card.tsx`: it is the one part of a card
// that imports the reaction controls (client components), and a page
// downloads the code of every client component its files import. The feed
// and the builder's preview draw full cards and hand this to the card as its
// `footer`; a page of compact cards never imports it.

/**
 * The full card's footer: the reaction summary and the comment count (which
 * links to the post's page), then the two actions — React and Comment.
 *
 * COUNTS ARE SHOWN ONLY ABOVE ZERO. With no reactions and no comments the
 * summary row is empty and takes no room.
 */
export function PostFooter({ post, returnTo }: { post: PublicProductPost; returnTo: string }) {
  const page = productPostPagePath(post.product.slug, post.id);
  const comments = commentCountLine(post.commentCount);
  return (
    <>
      <div
        data-post-summary
        className="flex items-center justify-between gap-2.5 px-5 pt-3.5 text-[13px] text-muted-foreground empty:hidden max-sm:px-[14px] max-sm:pt-2"
      >
        <ReactionSummary postId={post.id} reactions={safeCounts(post.reactions)} />
        {comments ? (
          <AppLink
            href={`${page}#comments`}
            data-post-comments
            className={`ml-auto py-1.5 text-muted-foreground underline decoration-border-strong underline-offset-[3px] ${FOCUS}`}
          >
            {comments}
          </AppLink>
        ) : null}
      </div>
      <div className="mx-2.5 mt-2.5 grid grid-cols-2 gap-0.5 border-t border-line pb-1.5 pt-1 max-sm:mx-2 max-sm:mt-1.5">
        <ReactionPicker postId={post.id} returnTo={returnTo} />
        <AppLink
          href={`${page}#comment`}
          className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-full text-[13px] font-medium text-copy no-underline hover:bg-foreground/[0.04] max-sm:min-h-[44px] ${FOCUS}`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 5h16v11H8l-4 4z" />
          </svg>
          Comment
        </AppLink>
      </div>
    </>
  );
}
