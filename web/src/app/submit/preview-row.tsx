// IN0 — the feed's row, showing a listing that does not exist yet.
//
// THE SAME SHELL THE FEED RENDERS (`feed/row-shell.tsx`), with a quiet box
// where the feed puts its act. That substitution is the milestone's one real
// design decision and it is not cosmetic:
//
//   `VoteBox` calls `useOverlay([slug])`, whose effect is keyed on the slug.
//   A preview's slug is the name somebody is TYPING, so a live vote box would
//   send what they are typing to the server on every keystroke, before they
//   have submitted anything at all. Marking the region `inert` would stop the
//   presses and not the requests.
//
//   And the form's action would be `/me/endorse?slug=<a name>` — at best a
//   404, at worst an endorsement of whatever existing listing that name
//   collides with.
//
// A SEPARATE MODULE FROM `feed-row.tsx`, because the boxes are imported at
// that module's scope: a `/submit` reaching through it carried them into its
// bundle whether or not it mounted them (measured: 117KB of first-load JS
// that way, 114KB reaching the shell directly). The 3KB is the smaller half
// of the argument — the larger one is that this file has no way to render an
// act even by mistake.

import { DASH } from "../ui/bits";

import { RowShell } from "../feed/row-shell";

import type { FeedEntry } from "@openproduct/contracts";

/**
 * The row, with nothing in it that acts.
 *
 * `firstToday` is `false` and not a prop: `#1 today` is a position the board
 * gave a launch, and a preview has not been on a board.
 */
export function PreviewRow({ entry }: { entry: FeedEntry }) {
  return <RowShell entry={entry} firstToday={false} boxes={<QuietBox />} />;
}

/**
 * The vote box, in a preview: the same 52×52 geometry and the same hairline
 * as the live one, holding the glyph over a dash (IN0) — which is what the
 * design draws beside the row.
 *
 * THE ONE PLACE IN THIS PRODUCT WITH TWO SHAPES OF ONE THING, and the
 * geometry is repeated here rather than shared because sharing it would
 * mean the live box and this importing each other — which is the import
 * this file exists to avoid. `ui/vote-box.tsx` carries the live one; a
 * change to either is a change to be made while looking at the other, and
 * the `target-size` and `axe` lanes walk both.
 *
 * A DASH, and that is OPC-C rather than decoration: this listing has not
 * been voted on, and nothing has counted it — so the box has no zero to
 * show. A zero would be a claim that we looked.
 *
 * `aria-hidden`: a screen reader gains nothing from "dash".
 */
function QuietBox() {
  return (
    <span
      aria-hidden="true"
      className="grid h-[52px] w-[52px] shrink-0 content-center place-items-center gap-[2px] rounded-[10px] border border-border-strong bg-card text-[14px] font-semibold text-muted-foreground"
    >
      <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 4 13 11.5H3z" fill="currentColor" />
      </svg>
      {DASH}
    </span>
  );
}
