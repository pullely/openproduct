"use client";

import * as React from "react";

import type { PublicProductPost } from "@openproduct/contracts";

import { ProductPostCard } from "../posts/post-card";
import { BTN_SOFT, FOCUS } from "../ui/design";
import { AppLink } from "../ui/link";

import {
  FEED_CARD_ATTRIBUTE,
  FEED_MORE_FAILED,
  FEED_MORE_LABEL,
  FEED_MORE_LOADING,
  feedPageDataPath,
  feedPagePath,
  feedPosts,
} from "./feed-copy";

/**
 * The feed's list (openproduct-redesign OPR-3; boards `Feed`, `PhoneFeed`):
 * published posts, newest first, each as its kind's own card, and *Show
 * more*.
 *
 * A PROGRESSIVE LAYER OVER A SERVER RENDER, as the Products list is
 * (`product-list.tsx`). The page is one document holding the feed's first
 * page, the same bytes for every visitor (I6): this component's server
 * render IS that list. In the browser it adds one thing —
 *
 *   MORE   *Show more* is a LINK to `/feed/{cursor}`, the page a crawler
 *          follows and a reader without JavaScript opens. Pressed in a
 *          browser, the same page of the feed is read as JSON from
 *          `/feed/{cursor}/posts` and its cards are appended under the
 *          server's, drawn by the same `ProductPostCard`. A failed read says
 *          so in one line and leaves the link a link.
 *
 * NOTHING PERSONAL. The reads are anonymous; each card's Follow and
 * reactions resolve their own state from the overlay, as the server-rendered
 * ones do. A DRAFT IS NEVER DRAWN: `feedPosts` keeps published posts only,
 * and the card draws nothing for anything else.
 */
export function FeedPosts({
  posts,
  next = null,
  returnTo,
}: {
  posts: readonly PublicProductPost[];
  /** The cursor of the page after this one, or null on the last page. */
  next?: string | null;
  /** The page the list is on: where sign-in returns a reader who pressed
   *  Follow or a reaction signed out. */
  returnTo: string;
}) {
  const [more, setMore] = React.useState<PublicProductPost[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(next);
  const [state, setState] = React.useState<"idle" | "loading" | "failed">("idle");

  const shown = React.useMemo(() => feedPosts(posts, more), [posts, more]);

  const readMore = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // A modified click opens the page itself; so does a click after a failed
    // read, which is the link doing what a link does.
    if (cursor === null || state === "failed" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (state === "loading") return;
    setState("loading");
    fetch(feedPageDataPath(cursor), { headers: { accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((page: { posts?: PublicProductPost[]; next?: unknown }) => {
        setMore((appended) => [...appended, ...(Array.isArray(page.posts) ? page.posts : [])]);
        setCursor(typeof page.next === "string" && page.next.length > 0 ? page.next : null);
        setState("idle");
      })
      .catch(() => setState("failed"));
  };

  return (
    <>
      <ol className="m-0 flex list-none flex-col gap-3.5 p-0 max-sm:gap-3" data-feed-posts>
        {shown.map((post) => (
          <li key={post.id} {...{ [FEED_CARD_ATTRIBUTE]: post.kind }}>
            <ProductPostCard post={post} variant="feed" returnTo={returnTo} />
          </li>
        ))}
      </ol>
      {cursor !== null ? (
        <nav aria-label="More posts" className="flex min-h-[44px] flex-wrap items-center justify-center gap-3 pt-1">
          {state !== "idle" ? (
            <span role="status" className="text-[13px] text-muted-foreground">
              {state === "loading" ? FEED_MORE_LOADING : FEED_MORE_FAILED}
            </span>
          ) : null}
          <AppLink
            href={feedPagePath(cursor)}
            onClick={readMore}
            data-feed-next
            aria-busy={state === "loading" ? true : undefined}
            className={`${BTN_SOFT} ${FOCUS}`}
          >
            {FEED_MORE_LABEL}
          </AppLink>
        </nav>
      ) : null}
    </>
  );
}
