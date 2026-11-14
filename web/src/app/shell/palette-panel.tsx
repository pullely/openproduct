"use client";

// The header search's results card (openproduct-redesign OPR1; a separate
// file since openproduct-performance OPP11).
//
// ─── WHY THIS IS A SEPARATE FILE ──────────────────────────────────────────
//
// It is the half of the search that renders only while the card is open,
// behind a `next/dynamic` boundary. The field itself CANNOT move: it is the
// header's visible `role="combobox"` input, rendered on every page for every
// visitor, and deleting it from the server render would reintroduce exactly
// the layout shift OPP9 removed. The card can, because it is never open on
// the server and is closed on the vast majority of page views.
//
// ─── PURE PRESENTATION, ON PURPOSE ────────────────────────────────────────
//
// Every piece of state and every effect is in `palette.tsx`: the query, the
// debounced read, which person rows are open, the keyboard highlight. This
// component owns nothing and decides nothing, so the keyboard model stays on
// one side of the lazy boundary with the field it belongs to — a split that
// put Arrow/Enter on one side and the rows on the other would be a race with
// a keyboard in it.
//
// ─── ONE CARD, AND THE FIELD IS ITS FIRST ROW ─────────────────────────────
//
// The board's construction: the card is positioned behind the field and 6px
// proud of it on the top and sides, with 54px of top padding where the field
// sits. It is flat white with a one-pixel inset ring (an edge, not a drop
// shadow: design.md §2 rule 11) and 22px corners, which is the field's pill
// radius plus the 6px it stands proud by.

import { NO_MATCHES, canExpand, type PaletteRow } from "./palette-rows";

import { ChevronIcon } from "../ui/icons";
import { AppLink } from "../ui/link";

export default function PalettePanel({
  id,
  rowDomId,
  list,
  answered,
  failed,
  active,
  expanded,
  onActive,
  onSelect,
  onToggle,
}: {
  id: string;
  rowDomId: (index: number) => string;
  /** The rows in drawing order, the door out last (`visibleRows`). */
  list: readonly PaletteRow[];
  /** The read for this query has answered (or failed). Before it does —
   *  and for a single character, which asks nothing — the card makes no
   *  claim about what matched. */
  answered: boolean;
  failed: boolean;
  active: number;
  expanded: ReadonlySet<string>;
  onActive: (index: number) => void;
  onSelect: () => void;
  onToggle: (id: string) => void;
}) {
  const results = list.filter((row) => row.type !== "all");
  const doorIndex = list.findIndex((row) => row.type === "all");
  const door = doorIndex >= 0 ? list[doorIndex] : undefined;
  return (
    <div
      id={id}
      role="dialog"
      aria-label="Search results"
      className="absolute -inset-x-[6px] -top-[6px] z-20 box-border flex max-h-[560px] animate-menu-in flex-col gap-[2px] overflow-y-auto rounded-[22px] bg-card px-[6px] pb-[6px] pt-[54px] ring-1 ring-inset ring-foreground/10 motion-reduce:animate-none"
    >
      {results.map((row) => {
        const index = list.indexOf(row);
        const child = row.under !== undefined;
        const opened = expanded.has(row.id);
        return (
          <div
            key={`${row.type}:${row.id}`}
            // A person's product sits indented under them, on a 2px rule.
            className={`flex items-center gap-[2px] ${
              child ? "ml-6 border-l-2 border-secondary pl-2" : ""
            }`}
          >
            <AppLink
              id={rowDomId(index)}
              href={row.href}
              data-active={index === active ? "" : undefined}
              onMouseEnter={() => onActive(index)}
              onClick={onSelect}
              className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-[10px] rounded-[12px] px-[10px] text-foreground no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                index === active ? "bg-well" : ""
              }`}
            >
              <RowMark row={row} small={child} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{row.title}</span>
              {row.kind ? (
                <span className="shrink-0 text-[13px] text-muted-foreground">{row.kind}</span>
              ) : null}
            </AppLink>
            {canExpand(row) ? (
              // The row and its chevron are SIBLINGS: a button inside an
              // anchor is invalid HTML that browsers repair by splitting the
              // anchor. 40px round, the board's size.
              <button
                type="button"
                onClick={() => onToggle(row.id)}
                aria-expanded={opened}
                aria-label={`${opened ? "Hide" : "Show"} products of ${row.title}`}
                className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full border-0 bg-transparent text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <ChevronIcon up={opened} className="h-[14px] w-[14px]" />
              </button>
            ) : null}
          </div>
        );
      })}

      {failed ? (
        // The read failed. Not "No matches": that is a claim about the
        // catalogue, and a read that did not answer has not made it.
        <div role="status" className="px-[10px] py-3 text-[13px] text-muted-foreground">
          Search is not answering right now
        </div>
      ) : answered && results.length === 0 ? (
        // The empty state: the read answered, and nothing matched.
        <div role="status" className="px-[10px] py-3 text-[13px] text-muted-foreground">
          {NO_MATCHES}
        </div>
      ) : null}

      {door ? (
        <AppLink
          id={rowDomId(doorIndex)}
          href={door.href}
          data-active={doorIndex === active ? "" : undefined}
          onMouseEnter={() => onActive(doorIndex)}
          onClick={onSelect}
          className={`mt-[2px] flex min-h-[40px] items-center justify-center rounded-b-[16px] border-t border-line text-[13px] font-semibold text-amber-ink no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
            doorIndex === active ? "bg-well" : ""
          }`}
        >
          {door.title}
        </AppLink>
      ) : null}
    </div>
  );
}

/**
 * A row's mark: a product wears its two letters on a rounded tile, a person
 * on a disc. 30px, or 26px for a product indented under a person.
 *
 * LETTERS, NOT A LOGO. The board's tile is a product's logo; the search read
 * returns no image for a hit, so the tile carries the same two letters the
 * feed's tile falls back to.
 */
function RowMark({ row, small }: { row: PaletteRow; small: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-sunken text-label font-semibold text-copy ${
        row.type === "person" ? "rounded-full" : "rounded-[9px]"
      } ${small ? "h-[26px] w-[26px]" : "h-[30px] w-[30px]"}`}
    >
      {row.initials}
    </span>
  );
}
