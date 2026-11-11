import type { FeedEntry } from "@openproduct/contracts";

import { CommentBox } from "../ui/comment-box";
import { VoteBox } from "../ui/vote-box";

import { RowShell } from "./row-shell";

/**
 * The feed row (openproduct-launch OL2), in the ROW LAYOUT.
 *
 * THE UNIT THAT REPEATS. The feed, a topic page, a collection, a search and a
 * maker's tabs are all this row, so getting it right is most of the epic's
 * visual work. The shape is the reference list's — a tile, three lines of
 * text, and two boxes at the right edge:
 *
 *   [tile] [1. name            ] [💬] [▲]
 *          [tagline            ] [50] [344]
 *          [🏷 topic · topic    ]
 *
 *   row      flex, centred, gap 14px, padding 14px 12px, radius 14px,
 *            4px above, hover --hover
 *   rank     INLINE, immediately before the name — `1.` `2.` `3.` at the
 *            name's own size and weight, in --muted
 *   tile     52×52, radius 14px, Geist Mono 16px/500
 *   name     16px/600, letter-spacing -0.005em, hover --accent-ink
 *   badge    20px tall, radius 6px, --accent-soft on --accent-ink, 11.5px
 *   licence  Geist Mono 11.5px uppercase, letter-spacing 0.04em, --faint
 *   wanted   20px tall, radius 999px, --success-soft on --success, 11.5px
 *   tagline  15px / 1.45, --copy, margin-top 2px
 *   tags     a 13px outline tag glyph in --faint, then the topics in 13px
 *            --muted, `·` separated, with the stack in mono 12px after them
 *   boxes    two 58×58 boxes, 8px apart, vertically centred: the discussion
 *            then the vote
 *
 * THE RANK IS NOT A COLUMN ANY MORE. It used to sit in a 30px gutter in
 * Newsreader, which read as a chart position beside the row rather than as
 * part of it. Inline it reads as the sentence the reference list writes:
 * `1. kettleworks`. A launch the sweep has not ranked renders NO number —
 * not a zero, not a dash (OPC-C) — and because there is no column to hold
 * open, the row simply starts at the name.
 *
 * THE COMMENT COUNT IS A BOX NOW, not a link on the meta line: `ui/comment-box.tsx`.
 *
 * THE ROW IS NOT ONE LINK. The design draws the name, the tile and the
 * tagline as links into the product and each topic as a link of its own, and
 * an anchor inside an anchor is invalid HTML that browsers repair by
 * splitting the outer one — so the row is a flex container and every link in
 * it is a sibling. The vote box is a sibling too, for the same reason: a
 * `<form>` inside an `<a>` is the defect UV0 hit.
 *
 * A SERVER COMPONENT, and it stays one. Nothing here is personal: the count
 * is the day's, identical for every reader, and the visitor's own vote state
 * arrives after paint from the XP2 overlay (UV0). A row that knew who was
 * asking would make the front page two documents (I6).
 */
export function FeedRow({
  entry,
  firstToday,
  returnTo = "/",
}: {
  entry: FeedEntry;
  /** Whether this row wears `#1 today`. Decided by the page from the
   *  contract's `isFirstToday`, never re-derived here — a badge computed in
   *  two places is a badge that eventually appears twice. */
  firstToday: boolean;
  /** Where a vote from this row returns to — the page the row is on. */
  returnTo?: string;
}) {
  return (
    <RowShell
      entry={entry}
      firstToday={firstToday}
      boxes={
        // THE TWO BOXES. The thread and the vote, 8px apart and centred on the
        // row — the same 58×58 geometry, because they are the same kind of
        // object: a public number a reader can act on.
        //
        // UV0 — `returnTo` is the PAGE, not the listing: a visitor who upvoted
        // from a row should land back where they were reading, not on a page
        // they did not ask for.
        <>
          <CommentBox slug={entry.slug} count={entry.commentCount} />
          <VoteBox
            slug={entry.slug}
            count={entry.rank === null ? null : entry.counted}
            returnTo={returnTo}
          />
        </>
      }
    />
  );
}

// `TagGlyph` still lives beside the row it opens, and is exported from here
// for the surfaces that draw a launch's tag line.
export { TagGlyph } from "./row-shell";
