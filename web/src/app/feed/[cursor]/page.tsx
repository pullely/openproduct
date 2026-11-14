import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { breadcrumbJsonLd } from "@openproduct/contracts";

import { fetchFeedPage } from "../../posts/posts-api";
import { publicApexOrigin } from "../../public-api";
import { BTN_SOFT, FOCUS } from "../../ui/design";
import { JsonLd } from "../../ui/json-ld";
import { AppLink } from "../../ui/link";

import { FEED_CARD_ATTRIBUTE, FEED_TITLE, feedPagePath, feedPosts } from "../feed-copy";
import { FeedCards } from "../feed-cards";
import { FeedPosts } from "../feed-posts";

/**
 * A page of the feed after the first (openproduct-redesign OPR-3).
 *
 * THE DOCUMENT BEHIND *Show more*. On `/` the button appends the next page
 * in place; this is the same page of the feed as an address — what the
 * button links to, what a crawler follows, and what a reader without
 * JavaScript opens. The position is a PATH segment, so the page is static
 * and revalidated like every other public page, and reads no query string
 * (design §4). It is canonical to itself and stays out of the sitemap: a
 * cursor is a position in a list that moves, not a place.
 *
 * A CURSOR THE FEED DID NOT ISSUE IS A 404, through the site's not-found.
 */
export const revalidate = 60;

/** Declares the segment so `revalidate` holds (see `[slug]/page.tsx`): no
 *  cursor is prebuilt, each is rendered on first request and cached. */
export async function generateStaticParams() {
  return [];
}

const TITLE = `${FEED_TITLE}, continued`;

export async function generateMetadata({ params }: { params: Promise<{ cursor: string }> }): Promise<Metadata> {
  const { cursor } = await params;
  return {
    title: TITLE,
    description: "Posts from products built in the open, one page at a time.",
    alternates: { canonical: feedPagePath(cursor) },
  };
}

export default async function FeedContinuedPage({ params }: { params: Promise<{ cursor: string }> }) {
  const { cursor } = await params;
  const page = await fetchFeedPage(cursor);
  if (page === null) notFound();
  const posts = feedPosts(page.posts);
  const here = feedPagePath(cursor);

  return (
    <main className="mx-auto box-border flex w-full max-w-[900px] flex-col gap-3.5 px-5 pb-10 pt-4 max-sm:gap-3 max-sm:px-3 max-sm:pb-6 max-sm:pt-3" {...{ [`${FEED_CARD_ATTRIBUTE}-page`]: "continued" }}>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: FEED_TITLE, path: "/" },
            { name: TITLE, path: here },
          ],
          publicApexOrigin(),
        )}
      />
      <h1 className="sr-only">{TITLE}</h1>
      <nav aria-label="Feed pages" className="flex min-h-[44px] items-center">
        <AppLink href="/" className={`${BTN_SOFT} ${FOCUS}`}>
          First page
        </AppLink>
      </nav>
      {posts.length > 0 ? (
        <FeedPosts held={posts.map((post) => post.id)} next={page.next} returnTo={here}>
          <FeedCards posts={posts} returnTo={here} />
        </FeedPosts>
      ) : (
        <p className="m-0 rounded-[16px] bg-card px-7 py-9 text-center text-[15px] text-muted-foreground">Nothing on this page.</p>
      )}
    </main>
  );
}
