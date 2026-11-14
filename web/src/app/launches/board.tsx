import {
  BOARD_EMPTY_NOTE,
  dayLabel,
  type BoardDay,
  type BoardEntry,
} from "@openproduct/contracts";

import { agoOf } from "../ui/metric";

import { PAGE_TITLE, PANEL, TILE_LINK } from "../ui/design";
import { EmptyState } from "../ui/empty-state";
import { AppLink } from "../ui/link";
import { ProductTile } from "../ui/product-tile";

/**
 * One day's board (openproduct-commons LC3).
 *
 * Shared by `/launches` and `/launches/[day]` because they ARE the same page:
 * today is a day like any other, and giving it a bespoke layout would mean
 * the archive rendered a different product from the one people looked at on
 * the day. `/launches` is a view of today's board, not a separate thing.
 *
 * A SERVER COMPONENT WITH NO CLIENT JS AND NO SESSION READ. The order is the
 * same for every reader — that is the whole reason it can be published (OPC-1,
 * I6) — so there is nothing here to personalise and nothing to hydrate.
 *
 * THE POSITION NUMBER IS RENDERED, and it is the only place on the estate
 * that renders one. Everywhere else an order is implicit in the list; a board
 * is a claim about being first, and hiding the number while making the claim
 * would be coy about the one thing the page is for.
 *
 * THE ROW IS A FLAT TILE (OPR1): the product tile, the position and the name
 * as one card-title (18px/600) phrase, the tagline in 15px `--copy`, and the
 * count on a 13px meta line — on the shared `TILE_LINK`, no border. No vote box:
 * the board is a published record of a day, not a place to act on it, and a
 * control that looked like one would be a claim this static page cannot keep.
 */
export function Board({
  day,
  entries,
  observedAt,
  now,
}: {
  day: BoardDay;
  entries: readonly BoardEntry[];
  open: boolean;
  observedAt: string | null;
  /** Passed in rather than read here, so the component stays pure and the
   *  page owns the one clock read (the same split every other surface uses). */
  now: number;
}) {
  return (
    <>
      <h1 className={`mt-4 ${PAGE_TITLE}`}>{dayLabel(day)}</h1>

      {entries.length === 0 ? (
        /* CF5 — the fact in one sentence, the ACT named and linked, the
           reasoning behind VC0's disclosure. W·05 found this state describing
           the sweep when what a reader was looking at was the absence of a
           maintainer's act. */
        <EmptyState
          className={`mt-6 max-w-[70ch] ${PANEL}`}
          says={BOARD_EMPTY_NOTE}
        />
      ) : (
        // One column of tiles (openproduct-calm CL5), as every list is.
        <ol className="m-0 mt-8 grid list-none gap-[14px] p-0">
          {entries.map((entry, index) => (
            <BoardRow key={entry.launchId} entry={entry} position={index + 1} />
          ))}
        </ol>
      )}

      {/* The day's state and its order's address, under the list as the
          design draws them. OPC-4 / I7 — the order resolves to a published
          sentence, and the sentence has an address a reader can follow.
          I9 — a computed number carries the moment it was true: a board that
          could be an hour stale must say so rather than look live. */}
      <p className="m-0 mt-4 text-[13px] text-muted-foreground">
        {observedAt ? <>Ranked {agoOf(observedAt, now)}</> : null}
      </p>
    </>
  );
}

function BoardRow({ entry, position }: { entry: BoardEntry; position: number }) {
  const href = `/${entry.slug}`;
  return (
    // FR2 — THE ROW IS THE TARGET: the name's link is stretched over the
    // `<li>` with an `::after`, so the whole row is what a finger presses.
    <li
      data-keyrow
      className={`relative flex list-none items-center gap-[22px] px-6 py-5 max-sm:gap-4 max-sm:px-4 max-sm:py-4 ${TILE_LINK}`}
    >
      <AppLink
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="shrink-0 rounded-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ProductTile slug={entry.slug} thumbnail={entry.thumbnail} size={72} phoneSize={52} />
      </AppLink>

      <div className="min-w-0 flex-1">
        <h2 className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/* The position and the name are ONE phrase, so they are set with
              the phrase's own 5px. The number stays OUTSIDE the anchor: the
              link's accessible name is the product, and "1. kettleworks"
              would make the day's ordering part of the name of the thing. */}
          <span className="flex min-w-0 items-baseline gap-[5px]">
            <span
              className="shrink-0 text-card-title font-semibold leading-tight tabular-nums text-muted-foreground"
              aria-hidden="true"
            >
              {position}.
            </span>
            {/* THE SLUG IS THE NAME on this estate — the directory card, the
                digest and the profile all address a listing by it, and there is
                no display-name column. A board that rendered some other string
                would be the one surface calling a product something the rest of
                the site does not. */}
            <AppLink
              href={href}
              className="text-card-title font-semibold leading-tight text-foreground after:absolute after:inset-0 after:content-[''] hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {entry.slug}
            </AppLink>
          </span>
          <span className="font-mono text-[13px] text-muted-foreground">{entry.versionLabel}</span>
        </h2>

        {entry.tagline ? (
          <p className="m-0 mt-[2px] max-w-[70ch] text-[15px] leading-[1.45] text-copy">
            {entry.tagline}
          </p>
        ) : null}

        <p className="m-0 mt-[7px] text-[13px] text-muted-foreground">
          {entry.counted} {entry.counted === 1 ? "upvote" : "upvotes"} counted
          {/* PUBLISHED, NOT HIDDEN. A maker whose launch was shared somewhere
              popular sees a position that does not match the total on their
              own page; without this line the gap is unaccountable, and an
              unaccountable ranking is the thing OPC-4 forbids. */}
          {entry.ineligible > 0 ? (
            <>
              {" · "}
              {entry.ineligible} from {entry.ineligible === 1 ? "an account" : "accounts"} newer than
              the launch, which {entry.ineligible === 1 ? "does" : "do"} not move a position
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}
