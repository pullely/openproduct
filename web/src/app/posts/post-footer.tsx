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
    // ONE ROW OF ICONS (LR3, openproduct-left-rail design §5.2): the reaction
    // picker and the comment link as icons with no fill until hovered, and
    // what readers have said at the row's end. Each icon has a name and a
    // tooltip; the comment count is a number beside its bubble.
    <div className="flex items-center gap-1 px-2.5 pb-2 pt-1.5 max-sm:px-2">
      <ReactionPicker postId={post.id} returnTo={returnTo} />
      <AppLink
        href={comments ? `${page}#comments` : `${page}#comment`}
        data-post-comments
        aria-label={comments ?? "Comment"}
        title={comments ?? "Comment"}
        className={`flex h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground max-sm:h-[44px] max-sm:min-w-[44px] ${FOCUS}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v11H8l-4 4z" />
        </svg>
        {post.commentCount > 0 ? <span aria-hidden="true">{post.commentCount}</span> : null}
      </AppLink>
      <div data-post-summary className="ml-auto flex items-center pr-1.5 text-[13px] text-muted-foreground empty:hidden">
        <ReactionSummary postId={post.id} reactions={safeCounts(post.reactions)} />
      </div>
    </div>
  );
}
