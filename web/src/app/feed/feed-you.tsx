"use client";

// What the feed draws for the person reading it (openproduct-redesign OPR-3;
// board `Feed`): the left column's profile card and "Your products", and the
// right column's "Following".
//
// NOTHING HERE IS IN THE DOCUMENT. `/` is one cached page, the same bytes for
// every visitor (I6); both components render NOTHING on the server and
// nothing in the browser until `/feed/mine` — a signed-in, `no-store` read —
// has answered. A signed-out visitor never asks: the read is made only when
// the pre-paint hint says there is a session, and only at a width where the
// columns are drawn (the phone board has neither).
//
// ONE READ, TWO READERS. The left column and the Following list sit on
// opposite sides of the page, so the answer is kept in a module store and
// asked for once.

import * as React from "react";
import { useSyncExternalStore } from "react";

import { FOCUS, SIDE_CARD, SIDE_TITLE } from "../ui/design";
import { PersonIcon } from "../ui/icons";
import { AppLink } from "../ui/link";
import { ProductTile } from "../ui/product-tile";
import { MilestoneSegments, StageMark } from "../ui/stage-mark";
import { useOverlay } from "../ui/use-overlay";
import { hintedSignedIn } from "../ui/use-toggle";
import { subscribeVisitor, unknownVisitor, visitorSnapshot } from "../ui/visitor";

import { FEED_MINE_PATH, followingCount, openSeatsLine, parseFeedMine, type FeedMine } from "./feed-copy";

/** The narrowest window that draws a side column (`feed-view.tsx`). */
const COLUMNS_QUERY = "(min-width: 900px)";

/** How many followed products and people the Following card lists. */
const FOLLOWING_SHOWN = 8;

let mine: FeedMine | null = null;
let asked = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function ask(): void {
  if (asked) return;
  asked = true;
  fetch(FEED_MINE_PATH, { headers: { accept: "application/json" }, credentials: "same-origin", cache: "no-store" })
    // 204 is "signed out, or it could not be read": one answer, and the page
    // is already the right page for it.
    .then((response) => (response.status === 200 ? response.json() : null))
    .then((body: unknown) => {
      mine = parseFeedMine(body);
      for (const listener of listeners) listener();
    })
    .catch(() => {});
}

const current = (): FeedMine | null => mine;
const nothing = (): FeedMine | null => null;

function useFeedMine(): FeedMine | null {
  const state = useSyncExternalStore(subscribe, current, nothing);
  // THE HINT, OR THE AUTHORITY. The cookie the boot script read is a guess
  // made before paint; `/auth/session` is the answer, and the shell publishes
  // it (`ui/visitor.ts`). Asking on either means a session whose hint cookie
  // is missing or stale still gets its columns, one round trip later, rather
  // than never until a reload.
  const signedIn = useSyncExternalStore(subscribeVisitor, visitorSnapshot, unknownVisitor).signedIn;
  React.useEffect(() => {
    if ((hintedSignedIn() || signedIn) && window.matchMedia(COLUMNS_QUERY).matches) ask();
  }, [signedIn]);
  return state;
}

/**
 * The left column, signed in: the profile card (band, avatar, name, both to
 * `/me`, and how many things you follow), then "Your products" — each
 * product you are on the crew of, with its stage, its progress and *Manage*,
 * which opens the product's page (where its crew edits it; design §2.5).
 */
export function FeedYou() {
  const data = useFeedMine();
  const visitor = useSyncExternalStore(subscribeVisitor, visitorSnapshot, unknownVisitor);
  const overlay = useOverlay();
  if (!data) return null;
  const handle = overlay.status === "ready" ? overlay.overlay.handle : null;
  const name = visitor.displayName ?? (handle ? `@${handle}` : "Your profile");

  return (
    <div className="flex flex-col gap-3" data-feed-you>
      <section aria-label="Your profile" className="overflow-hidden rounded-[16px] bg-card">
        <div aria-hidden="true" className="h-[56px] bg-[linear-gradient(120deg,oklch(var(--amber-soft)),oklch(var(--sunken)))]" />
        <div className="-mt-8 flex flex-col items-center gap-1 px-4 pb-4 text-center">
          <AppLink
            href="/me"
            tabIndex={-1}
            aria-hidden="true"
            className="grid h-16 w-16 place-items-center rounded-full bg-sunken text-muted-foreground ring-4 ring-card"
          >
            <PersonIcon className="h-[30px] w-[30px]" />
          </AppLink>
          <AppLink href="/me" className={`mt-1.5 text-[16px] font-semibold text-foreground no-underline hover:underline ${FOCUS}`}>
            {name}
          </AppLink>
          {handle && visitor.displayName ? <span className="text-[13px] text-muted-foreground">@{handle}</span> : null}
          <AppLink
            href="/me"
            className={`mt-2.5 flex w-full flex-col border-t border-line pt-2.5 text-foreground no-underline ${FOCUS}`}
          >
            <span className="text-card-title font-semibold" data-feed-following-count>
              {followingCount(data)}
            </span>
            <span className="text-[13px] text-muted-foreground">Following</span>
          </AppLink>
        </div>
      </section>

      {data.products.length > 0 ? (
        <section aria-labelledby="feed-your-products" className="flex flex-col gap-1 rounded-[16px] bg-card px-3 py-3.5">
          <div className="flex items-baseline justify-between px-1.5 pb-1.5">
            <h2 id="feed-your-products" className="m-0 font-mono text-mono-label font-normal uppercase text-muted-foreground">
              Your products
            </h2>
            <span className="font-mono text-mono-label text-muted-foreground">{data.products.length}</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {data.products.map((product) => (
              <li key={product.slug} className="flex flex-col gap-1.5" data-feed-my-product>
                <AppLink
                  href={`/${product.slug}`}
                  className={`flex flex-col gap-2 rounded-[12px] bg-well p-2.5 text-foreground no-underline hover:bg-sunken ${FOCUS}`}
                >
                  <span className="flex items-center gap-2.5">
                    <ProductTile slug={product.slug} thumbnail={product.logo} size={32} />
                    <span className="flex min-w-0 flex-1 flex-col leading-[1.25]">
                      <span className="truncate text-[15px] font-semibold">{product.slug}</span>
                      <StageMark stage={product.stage} counts={product.milestoneCounts} short />
                    </span>
                  </span>
                  {product.stage === "shipping" ? <MilestoneSegments counts={product.milestoneCounts} /> : null}
                  {product.openSeats > 0 ? (
                    <span className="text-[13px] text-seat-ink">{openSeatsLine(product.openSeats)}</span>
                  ) : null}
                </AppLink>
                <AppLink
                  href={`/${product.slug}`}
                  aria-label={`Manage ${product.slug}`}
                  className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-full bg-foreground/[0.06] text-[13px] font-semibold text-foreground no-underline hover:bg-foreground/[0.1] ${FOCUS}`}
                >
                  Manage
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <path d="M7 17L17 7M9 7h8v8" />
                  </svg>
                </AppLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The right column's "Following", signed in: the products and the people you
 * follow, each a link to its page. Nothing when you follow nothing.
 */
export function FeedFollowing() {
  const data = useFeedMine();
  if (!data) return null;
  const total = followingCount(data);
  if (total === 0) return null;
  const products = data.following.products.slice(0, FOLLOWING_SHOWN);
  const people = data.following.people.slice(0, Math.max(0, FOLLOWING_SHOWN - products.length));

  return (
    <section aria-labelledby="feed-following" className={SIDE_CARD} data-feed-following>
      <h2 id="feed-following" className={SIDE_TITLE}>
        Following
      </h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {products.map((product) => (
          <li key={`product:${product.slug}`}>
            <AppLink
              href={`/${product.slug}`}
              className={`flex min-h-[40px] items-center gap-2.5 text-[15px] font-semibold text-foreground no-underline hover:underline ${FOCUS}`}
            >
              <ProductTile slug={product.slug} thumbnail={product.logo} size={32} />
              <span className="truncate">{product.name}</span>
            </AppLink>
          </li>
        ))}
        {people.map((person) => (
          <li key={`person:${person.handle}`}>
            <AppLink
              href={`/@${person.handle}`}
              className={`flex min-h-[40px] items-center gap-2.5 text-[15px] font-semibold text-foreground no-underline hover:underline ${FOCUS}`}
            >
              <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken text-muted-foreground">
                <PersonIcon className="h-4 w-4" />
              </span>
              <span className="truncate">{person.displayName ?? `@${person.handle}`}</span>
            </AppLink>
          </li>
        ))}
      </ul>
      {total > products.length + people.length ? (
        <AppLink href="/me" className={`text-[13px] font-medium no-underline hover:underline ${FOCUS}`}>
          All {total}
        </AppLink>
      ) : null}
    </section>
  );
}
