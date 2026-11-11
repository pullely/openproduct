import type { ReactNode } from "react";

import { TOPIC_FACET, labelOf, topicPath, type FeedEntry } from "@openproduct/contracts";

import { ProductTile } from "../ui/product-tile";

import { AppLink } from "../ui/link";

/**
 * The feed row's SHELL — everything in the row except the two boxes at its
 * right edge, which arrive as a slot (`feed/feed-row.tsx` documents the row's
 * geometry and every decision in it; this file only holds the shape).
 *
 * WHY THE SPLIT EXISTS. IN0's preview on `/submit` renders this row and must
 * NOT render its two acts: `VoteBox` would post `/me/endorse` for a listing
 * that does not exist, and its `useOverlay` would send the name somebody is
 * typing to the server on every keystroke. A `preview` flag inside `FeedRow`
 * was the first attempt; it worked, and it left the boxes in `/submit`'s
 * bundle anyway, because they are imported at that module's scope whether or
 * not the branch mounts them.
 *
 * A SLOT RATHER THAN A FLAG, so the shell has no idea which caller it is
 * serving and cannot grow a second personality. The feed passes its two live
 * boxes; the preview passes two quiet ones.
 *
 * THE ROW LIVES INSIDE A CARD NOW. The design draws every list as a 12px
 * card and every row as `16px 20px` under a `--line` rule, with the row's
 * hover in `--accent`; the rounded, free-standing row of the first epic is
 * gone with the free-standing list it sat in.
 */
export function RowShell({
  entry,
  firstToday,
  boxes,
}: {
  entry: FeedEntry;
  firstToday: boolean;
  /** The row's right edge. Two 52×52 boxes, whatever they are. */
  boxes: ReactNode;
}) {
  const href = `/${entry.slug}`;
  return (
    // FR2 — THE ROW IS THE TARGET, not the twenty pixels of its title. The
    // title link is stretched over this `<li>` with an `::after`, so the
    // whole row is what a finger presses; `relative` is what that stretch is
    // measured against. A TILE since openproduct-calm CL5 (CL-R3): the
    // launch row takes the build tile's shape, so every list on the estate
    // is one column of the same rounded card.
    <li
      data-keyrow
      className="relative flex list-none items-center gap-[22px] rounded-[20px] border border-border bg-card px-8 py-6 transition-colors hover:border-border-strong max-sm:gap-4 max-sm:px-5 max-sm:py-5"
    >
      <AppLink
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="shrink-0 rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {/* MD3 — the hero as a thumbnail where there is one; the monogram where
            there is not, unchanged and unpenalised (MD-3). */}
        <ProductTile slug={entry.slug} thumbnail={entry.thumbnail} size={72} phoneSize={52} />
      </AppLink>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* The position and the name are ONE phrase, so they are set with
              the phrase's own 5px rather than the badge row's 8px. The rank
              stays OUTSIDE the anchor: the link's accessible name is the
              product, and "1. kettleworks" would make today's ordering part
              of the name of the thing. */}
          <span className="flex min-w-0 items-baseline gap-[5px]">
            <Rank rank={entry.rank} />
            <AppLink
              href={href}
              className="text-[20px] font-semibold leading-tight tracking-[-0.015em] text-foreground after:absolute after:inset-0 after:content-[''] hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:text-[18px]"
            >
              {entry.slug}
            </AppLink>
          </span>
          {firstToday ? (
            <span className="inline-flex h-[20px] items-center rounded-[6px] bg-endorse-soft px-[7px] text-[11.5px] font-medium text-endorse-ink">
              #1 today
            </span>
          ) : null}
          {/* Observed at publish, never a maintainer's claim (OPC-7). A
              listing with no detected licence renders nothing rather than
              "unknown", which would be a finding we did not make. */}
          {entry.licence ? (
            <span className="text-[12.5px] tracking-[0.04em] text-muted-foreground">{entry.licence}</span>
          ) : null}
          {/* CB2's demand line. Zero is not rendered: a listing asking for
              nobody is a fact, and "0 contributors wanted" would be that fact
              stated as a disappointment. */}
          {entry.roleOpeningCount > 0 ? (
            <span className="inline-flex h-[20px] items-center rounded-full bg-success-soft px-2 text-[11.5px] font-medium text-success">
              {entry.roleOpeningCount}{" "}
              {entry.roleOpeningCount === 1 ? "contributor" : "contributors"} wanted
            </span>
          ) : null}
        </div>

        {/* NOT A LINK ANY MORE (FR2). It went to the same place the title
            does, so the row carried two links with two different accessible
            names to one destination — and once the title covers the row, this
            one is underneath the stretch and unreachable anyway. */}
        {entry.tagline ? (
          <p className="m-0 mt-[2px] text-[15px] leading-[1.45] text-copy">{entry.tagline}</p>
        ) : null}

        <Meta entry={entry} />
      </div>

      {/* THE TWO BOXES. The thread and the vote, 8px apart and centred on the
          row — the same 52×52 geometry, because they are the same kind of
          object: a public number a reader can act on.

          `relative z-10` — above the title's stretch, or the two boxes stop
          being their own controls and every press on them opens the listing. */}
      <div className="relative z-10 flex shrink-0 items-center gap-2">
        {boxes}
      </div>
    </li>
  );
}

/**
 * The position, or its absence — `1.`, `2.`, `3.`, immediately before the name.
 *
 * A launch the sweep has not reached renders NOTHING here — not a zero, not a
 * dash, and no longer a held-open column either. The rank does not exist yet,
 * which is a different claim from "this launch placed nowhere" (OPC-C), and
 * the row reads perfectly well starting at the name.
 *
 * THE NAME'S OWN SIZE AND WEIGHT, in --muted: the number is part of the line
 * rather than a chart figure set beside it.
 */
function Rank({ rank }: { rank: number | null }) {
  if (rank === null) return null;
  return (
    <span className="shrink-0 text-[16px] font-semibold leading-tight tabular-nums text-muted-foreground">
      {rank}.
    </span>
  );
}

/**
 * The row's third line: the topics, then the stack, `·` separated, every
 * topic a link where the design draws one, the stack in mono 12px.
 *
 * THE COMMENT COUNT IS NOT HERE — it is the row's first box
 * (`ui/comment-box.tsx`), which is where the reference list puts it.
 *
 * THE LINE IS ABSENT WHEN IT HAS NOTHING: a lone separator with no topics
 * before it is furniture claiming there is something to read.
 */
function Meta({ entry }: { entry: FeedEntry }) {
  const stackLine = entry.stack.slice(0, 2).join(" · ");
  if (entry.topics.length === 0 && !stackLine) return null;
  return (
    // `relative z-10` for the same reason as the boxes: the topics are their
    // own destinations and must not be swallowed by the row's stretch.
    <div className="relative z-10 mt-[7px] flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
      {entry.topics.map((value, index) => (
        <span key={value} className="contents">
          {index > 0 ? <span className="text-faint">·</span> : null}
          <AppLink href={topicPath(value)} className="tap text-muted-foreground hover:text-foreground">
            {labelOf(TOPIC_FACET, value) ?? value}
          </AppLink>
        </span>
      ))}
      {stackLine ? (
        <>
          {entry.topics.length > 0 ? <span className="text-faint">·</span> : null}
          <span className="font-mono text-[12px] text-muted-foreground">{stackLine}</span>
        </>
      ) : null}
    </div>
  );
}

/**
 * The tag glyph — kept for the surfaces that still open a topic line with it
 * (a maker's rows, a search hit); the feed's own row no longer draws it, as
 * the design does not.
 */
export function TagGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 text-faint">
      <path
        d="M6.2 1.6H2.2a.6.6 0 0 0-.6.6v4l6 6a.6.6 0 0 0 .85 0l3.75-3.75a.6.6 0 0 0 0-.85l-6-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="4.1" cy="4.1" r="0.85" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
