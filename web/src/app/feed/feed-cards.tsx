import type { PublicProductPost } from "@openproduct/contracts";

import { ProductPostCard } from "../posts/post-card";
import { PostFooter } from "../posts/post-footer";

import { FEED_CARD_ATTRIBUTE } from "./feed-copy";

/**
 * A page of the feed, as list items: each post as its kind's own card
 * (openproduct-redesign OPR-3; boards `Feed`, `PhoneFeed`).
 *
 * NO CLIENT DIRECTIVE, ON PURPOSE. The page's own posts are drawn by this on
 * the SERVER and handed to the list (`feed-posts.tsx`) as children, so the
 * code that draws a card is not in the bundle a visitor downloads to read
 * the feed — nor in the one every other page prefetches for the header's
 * "Feed" link. A page that *Show more* appends is drawn by this same
 * component in the browser, from a chunk fetched when the link is pressed.
 * One component either way: a post looks the same wherever it was drawn.
 *
 * Straight under the page's `h1`, so each headline is an `h2`.
 */
export function FeedCards({ posts, returnTo }: { posts: readonly PublicProductPost[]; returnTo: string }) {
  return (
    <>
      {posts.map((post) => (
        <li key={post.id} {...{ [FEED_CARD_ATTRIBUTE]: post.kind }}>
          <ProductPostCard
            post={post}
            variant="feed"
            returnTo={returnTo}
            headingLevel={2}
            footer={<PostFooter post={post} returnTo={returnTo} />}
          />
        </li>
      ))}
    </>
  );
}
