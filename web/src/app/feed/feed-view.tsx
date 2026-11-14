import type { ProductPostsPage, PublicProfileCard } from "@openproduct/contracts";

import { productSeatsPath } from "../posts/blocks";
import { signInHref } from "../shell/shell";
import { BTN_INK, BTN_SOFT, FOCUS, SIDE_CARD, SIDE_TITLE } from "../ui/design";
import { FollowButton } from "../ui/follow-button";
import { AppLink } from "../ui/link";
import { ProductTile } from "../ui/product-tile";

import {
  FEED_EMPTY_LINE,
  FEED_EMPTY_LINKS,
  FEED_EMPTY_TITLE,
  FEED_FOCUS_CSS,
  FEED_TITLE,
  feedPosts,
  openSeatsLine,
} from "./feed-copy";
import { FeedPosts } from "./feed-posts";
import { openSeatProducts, worthFollowing } from "./feed-suggest";
import { FeedFollowing, FeedYou } from "./feed-you";

/**
 * The feed (openproduct-redesign OPR-3; boards `Feed`, `PhoneFeed`): what
 * products have done, newest first, each post as its kind's own card.
 *
 * THREE COLUMNS ON A DESKTOP, ONE ON A PHONE (the phone board is the cards
 * and nothing else; its header and tab bar are the shell's):
 *
 *   left     for the person reading — the profile card and "Your products".
 *            NOT IN THE DOCUMENT: `FeedYou` renders nothing on the server and
 *            fills in after a signed-in read. What the server sends in its
 *            place is the same card for everybody, the door: the mark, the
 *            name and *Sign in*.
 *   centre   the posts, and *Show more* (`FeedPosts`).
 *   right    "Worth following" — PRODUCTS, never people (the owner's rule) —
 *            and "Open seats", both from the directory's first page; and
 *            between them "Following", which is personal and so arrives
 *            after load like the left column.
 *
 * ONE DOCUMENT FOR EVERYBODY (I6). Nothing here resolves an actor; every
 * personal thing is a client island whose server render is empty.
 *
 * THE MAIN COLUMN COMES FIRST IN THE DOCUMENT and the left column is placed
 * before it by the grid, so a keyboard and a screen reader reach the posts
 * before the page's furniture.
 *
 * NO MILESTONE BARS ON A FEATURE CARD HERE. A post does not carry its
 * product's milestone counts and neither does a directory card; the only
 * read that has them is each product's own document, one read per product
 * on the page. The card still names its milestone when the maker gave one;
 * the bars are on the post's own page, which reads the product anyway.
 */
export function FeedView({
  page,
  directory,
  returnTo,
}: {
  /** The feed's first page. An empty one is the empty state. */
  page: ProductPostsPage;
  /** The directory's first page, or null when it could not be read: the
   *  right column's two public cards are then absent, and the feed is not. */
  directory: readonly PublicProfileCard[] | null;
  returnTo: string;
}) {
  const posts = feedPosts(page.posts);
  const onPage = posts.map((post) => post.product.slug);
  const suggestions = directory ? worthFollowing(directory, onPage) : [];
  const seats = directory ? openSeatProducts(directory) : [];

  return (
    <main className="mx-auto box-border grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)] items-start gap-4 px-5 pb-10 pt-4 max-sm:gap-3 max-sm:px-3 max-sm:pb-6 max-sm:pt-3 min-[900px]:grid-cols-[minmax(0,1fr)_280px] min-[1180px]:grid-cols-[250px_minmax(0,860px)_280px] min-[1180px]:justify-center">
      <style>{FEED_FOCUS_CSS}</style>

      <section aria-labelledby="feed-title" className="flex min-w-0 flex-col gap-3.5 max-sm:gap-3" data-feed>
        <h1 id="feed-title" className="sr-only">
          {FEED_TITLE}
        </h1>
        {posts.length > 0 ? (
          <FeedPosts posts={posts} next={page.next} returnTo={returnTo} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-[16px] bg-card px-7 py-9 text-center max-sm:px-5 max-sm:py-7" data-feed-empty>
            <h2 className="m-0 text-card-title font-semibold tracking-[-0.015em] text-foreground">{FEED_EMPTY_TITLE}</h2>
            <p className="m-0 max-w-[46ch] text-[15px] text-muted-foreground">{FEED_EMPTY_LINE}</p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
              {FEED_EMPTY_LINKS.map((link, index) => (
                <AppLink key={link.href} href={link.href} className={`${index === 0 ? BTN_INK : BTN_SOFT} ${FOCUS}`}>
                  {link.label}
                </AppLink>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* THE LEFT COLUMN. One grid cell holds both branches, so the column is
          as tall as the taller one and nothing below it moves when the
          personal one arrives. The public card wears the shell's own
          `data-auth-branch`: a browser that knows it has a session hides it
          before paint, and it keeps its box. */}
      <aside aria-label="You" className="hidden min-[1180px]:order-first min-[1180px]:grid" data-feed-left>
        <section
          aria-label="openproduct"
          data-auth-branch="anonymous"
          className="self-start overflow-hidden rounded-[16px] bg-card [grid-area:1/1]"
        >
          <div aria-hidden="true" className="h-[56px] bg-[linear-gradient(120deg,oklch(var(--amber-soft)),oklch(var(--sunken)))]" />
          <div className="-mt-8 flex flex-col items-center gap-1 px-4 pb-4 text-center">
            <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-card ring-4 ring-card">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3.5V21" className="stroke-foreground" />
                <circle cx="14" cy="9.5" r="6" className="stroke-brand-amber" />
              </svg>
            </span>
            <span className="mt-1.5 text-[16px] font-semibold text-foreground">openproduct</span>
            <span className="text-[13px] text-muted-foreground">Products built in the open</span>
            <a href={signInHref(returnTo)} className={`${BTN_INK} mt-2.5 w-full ${FOCUS}`}>
              Sign in
            </a>
          </div>
        </section>
        <div className="min-w-0 [grid-area:1/1]">
          <FeedYou />
        </div>
      </aside>

      <aside aria-label="Products" className="hidden min-w-0 flex-col gap-3 min-[900px]:flex" data-feed-right>
        {suggestions.length > 0 ? (
          <section aria-labelledby="feed-worth-following" className={`${SIDE_CARD} gap-3.5`} data-worth-following>
            <h2 id="feed-worth-following" className={SIDE_TITLE}>
              Worth following
            </h2>
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {suggestions.map((product) => (
                <li key={product.slug} className="flex items-center gap-2.5" data-worth-following-product>
                  <ProductTile slug={product.slug} thumbnail={product.thumbnail} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <AppLink
                      href={`/${product.slug}`}
                      className={`truncate text-[15px] font-semibold text-foreground no-underline hover:underline ${FOCUS}`}
                    >
                      {product.slug}
                    </AppLink>
                    <span className="truncate text-[13px] text-muted-foreground">{product.line}</span>
                  </span>
                  {/* FOLLOW FOLLOWS THE PRODUCT (design §2.3). */}
                  <FollowButton kind="listing" value={product.slug} followers={0} returnTo={returnTo} size="card" tone="ink" countHidden />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <FeedFollowing />

        {seats.length > 0 ? (
          <section aria-labelledby="feed-open-seats" className={`${SIDE_CARD} gap-2.5`} data-feed-seats>
            <h2 id="feed-open-seats" className={SIDE_TITLE}>
              Open seats
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {seats.map((product) => (
                <li key={product.slug}>
                  <AppLink href={productSeatsPath(product.slug)} className={`flex flex-col text-foreground no-underline ${FOCUS}`}>
                    <span className="text-[15px] font-medium">{product.slug}</span>
                    <span className="text-[13px] text-seat-ink">{openSeatsLine(product.seats)}</span>
                  </AppLink>
                </li>
              ))}
            </ul>
            <AppLink href="/help-wanted" className={`text-[13px] font-medium no-underline hover:underline ${FOCUS}`}>
              All open seats
            </AppLink>
          </section>
        ) : null}
      </aside>
    </main>
  );
}
