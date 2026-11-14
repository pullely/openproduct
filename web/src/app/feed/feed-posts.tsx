"use client";

import * as React from "react";

import type { PublicProductPost } from "@openproduct/contracts";

import { BTN_SOFT, FOCUS } from "../ui/design-core";
import { AppLink } from "../ui/link";

import { FEED_MORE_FAILED, FEED_MORE_LABEL, FEED_MORE_LOADING, feedMorePosts, feedPageDataPath, feedPagePath } from "./feed-copy";

/** The cards of an appended page: fetched when *Show more* is first pressed.
 *  The page's own cards are the server's (`children`). */
const MoreCards = React.lazy(() => import("./feed-cards").then((module) => ({ default: module.FeedCards })));

/**
 * The feed's list (openproduct-redesign OPR-3; boards `Feed`, `PhoneFeed`):
 * published posts, newest first, each as its kind's own card, and *Show
 * more*.
 *
 * A PROGRESSIVE LAYER OVER A SERVER RENDER, as the Products list is
 * (`product-list.tsx`). The page is one document holding the feed's first
 * page, the same bytes for every visitor (I6): its cards are drawn on the
 * server (`feed-cards.tsx`) and arrive here as `children`. In the browser
 * this adds one thing —
 *
 *   MORE   *Show more* is a LINK to `/feed/{cursor}`, the page a crawler
 *          follows and a reader without JavaScript opens. Pressed in a
 *          browser, the same page of the feed is read as JSON from
 *          `/feed/{cursor}/posts` and its cards are appended under the
 *          server's, drawn by the same `FeedCards` — fetched then, so the
 *          code that draws a card is not in what a reader downloads to read
 *          the first page. A failed read says so in one line and leaves the
 *          link a link.
 *
 * NOTHING PERSONAL. The reads are anonymous; each card's Follow and
 * reactions resolve their own state from the overlay, as the server-rendered
 * ones do. A DRAFT IS NEVER DRAWN: `feedPosts` keeps published posts only,
 * and the card draws nothing for anything else.
 */
export function FeedPosts({
  held,
  next = null,
  returnTo,
  children,
}: {
  /** The ids of the posts the server drew (`children`), so a page appended
   *  later never draws one of them twice. */
  held: readonly string[];
  /** The cursor of the page after this one, or null on the last page. */
  next?: string | null;
  /** The page the list is on: where sign-in returns a reader who pressed
   *  Follow or a reaction signed out. */
  returnTo: string;
  /** The page's own cards, as list items, drawn on the server. */
  children: React.ReactNode;
}) {
  const [more, setMore] = React.useState<PublicProductPost[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(next);
  const [state, setState] = React.useState<"idle" | "loading" | "failed">("idle");

  const appended = React.useMemo(() => feedMorePosts(held, more), [held, more]);

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
        {children}
        {appended.length > 0 ? (
          <React.Suspense fallback={null}>
            <MoreCards posts={appended} returnTo={returnTo} />
          </React.Suspense>
        ) : null}
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
