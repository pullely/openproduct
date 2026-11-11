"use client";

// The search field's dropdown (openproduct-performance OPP11).
//
// ─── WHY THIS IS A SEPARATE FILE ──────────────────────────────────────────
//
// It is the same panel `palette.tsx` used to render inline, moved behind a
// `next/dynamic` boundary and nothing else. The field itself CANNOT move: it
// is the header's visible `role="combobox"` input, rendered on every page for
// every visitor, and deleting it from the server render would reintroduce
// exactly the layout shift OPP9 removed. The dropdown can, because it renders
// only while `open` — which is never true on the server and false on the vast
// majority of page views.
//
// ─── PURE PRESENTATION, ON PURPOSE ────────────────────────────────────────
//
// Every piece of state and every effect stayed in `palette.tsx`: the query,
// the debounced read, the recents, the keyboard selection. This component
// owns nothing and decides nothing, so the split moved BYTES and not
// BEHAVIOUR — the keyboard model in particular stays in one place, which is
// the thing a split of a combobox most easily breaks.
//
// The alternative was to move the search machinery down here and report rows
// back up, which would have put the `⌘K` field\'s Arrow/Enter handling on one
// side of a lazy boundary and the rows it navigates on the other. That is a
// race with a keyboard in it, bought for a few hundred bytes.

import * as React from "react";

import { searchPath, type SearchTopicHit } from "@openproduct/contracts";

import { PALETTE_SECTIONS, type PaletteRow } from "./palette-rows";
import { SearchGlyph } from "./palette-glyph";

import { AppLink } from "../ui/link";

export default function PalettePanel({
  hasQuery,
  trimmed,
  rows,
  failed,
  active,
  recent,
  suggestions,
  onActive,
  onSelect,
  onForget,
}: {
  hasQuery: boolean;
  trimmed: string;
  rows: PaletteRow[] | null;
  failed: boolean;
  active: number;
  recent: readonly string[];
  suggestions: readonly SearchTopicHit[];
  onActive: (index: number) => void;
  onSelect: (entry: string) => void;
  onForget: (entry: string) => void;
}) {
  const list = rows ?? [];
  return (

        <div
          id="search-results"
          role="listbox"
          aria-label="Search results"
          // FR1 — ANCHORED TO THE VIEWPORT ON A PHONE, not to the field. The
          // dropdown is `min(560px, 100vw - 32px)` wide and the field now
          // starts about 48px in from the left edge at 375px, so an
          // `absolute left-0` panel ran 16px past the right edge and gave the
          // whole document a horizontal scroll. `fixed` with a gutter on both
          // sides is the same panel, measured from the thing it actually has
          // to fit inside.
          className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-[70vh] w-[min(560px,calc(100vw-32px))] animate-menu-in overflow-y-auto rounded-[12px] border border-border bg-card py-1.5 shadow-menu max-sm:fixed max-sm:inset-x-4 max-sm:top-[62px] max-sm:max-h-[60vh] max-sm:w-auto"
        >
          {!hasQuery ? (
            <BeforeTyping
              recent={recent}
              suggestions={suggestions}
              onSelect={onSelect}
              onForget={onForget}
            />
          ) : rows === null ? (
            <p className="m-0 px-4 py-6 text-[14.5px] text-muted-foreground">Searching…</p>
          ) : failed ? (
            <p className="m-0 px-4 py-6 text-[14.5px] text-muted-foreground">
              Search is not answering right now. Nothing is wrong with your query — try again in a
              moment, or browse{" "}
              <AppLink href="/" className="underline underline-offset-4">
                the builds
              </AppLink>
              .
            </p>
          ) : list.length === 0 ? (
            <p className="m-0 px-4 py-6 text-[14.5px] text-muted-foreground">
              Nothing matched “{trimmed}”.
            </p>
          ) : (
            list.map((row, i) => (
              <React.Fragment key={`${row.type}:${row.id}`}>
                {PALETTE_SECTIONS[row.type] && row.type !== list[i - 1]?.type ? (
                  <div className="px-4 pb-1 pt-2.5 font-mono text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
                    {PALETTE_SECTIONS[row.type]}
                  </div>
                ) : null}
                <AppLink
                  href={row.href}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => onActive(i)}
                  onClick={() => onSelect(trimmed)}
                  className={`flex items-center gap-3 px-4 py-2 no-underline ${
                    i === active ? "bg-accent" : ""
                  }`}
                >
                  <RowGlyph row={row} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium text-foreground">
                      {row.title}
                    </span>
                    {row.detail ? (
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {row.detail}
                      </span>
                    ) : null}
                  </span>
                </AppLink>
              </React.Fragment>
            ))
          )}
        </div>
  );
}

/**
 * What the field offers before anybody has typed: this browser's own recent
 * searches, then a few topics to start from.
 *
 * NOT A HISTORY OF ANYBODY ELSE. Both lists are as public as the page — the
 * recents never left this browser, and the topics are the vocabulary's
 * declared order — so nothing here is a claim about what other people are
 * searching for, which is a claim this product cannot make and would not want
 * to (OPC-4).
 */
function BeforeTyping({
  recent,
  suggestions,
  onSelect,
  onForget,
}: {
  recent: readonly string[];
  suggestions: readonly { value: string; label: string; href: string }[];
  onSelect: (entry: string) => void;
  onForget: (entry: string) => void;
}) {
  return (
    <>
      {recent.length > 0 ? (
        <>
          <div className="px-4 pb-1 pt-2 font-mono text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
            Recent
          </div>
          {recent.map((entry) => (
            // The row and its ✕ are SIBLINGS: a button inside an anchor is
            // invalid HTML that browsers repair by splitting the anchor, and
            // the repair puts the control somewhere nobody aimed at.
            <div key={entry} className="flex items-center gap-3 px-4 py-2 hover:bg-accent">
              <ClockGlyph />
              <AppLink
                href={searchPath(entry)}
                onClick={() => onSelect(entry)}
                className="min-w-0 flex-1 truncate text-[14.5px] text-foreground no-underline"
              >
                {entry}
              </AppLink>
              <button
                type="button"
                aria-label={`Remove ${entry} from recent searches`}
                onClick={() => onForget(entry)}
                className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M1 1 9 9M9 1 1 9" stroke="currentColor" strokeWidth="1.6" fill="none" />
                </svg>
              </button>
            </div>
          ))}
        </>
      ) : null}
      <div className="px-4 pb-1 pt-2.5 font-mono text-[11.5px] uppercase tracking-[0.1em] text-muted-foreground">
        Try searching for
      </div>
      {suggestions.map((topic) => (
        <AppLink
          key={topic.value}
          href={topic.href}
          onClick={() => onSelect(topic.label)}
          className="flex items-center gap-3 px-4 py-2 no-underline hover:bg-accent"
        >
          {/* The design's topic tile: a 28px square in `--secondary` carrying
              `#` in mono, and `Topic` under the label — the same row a topic
              hit wears once a query is typed. */}
          <span
            aria-hidden="true"
            className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] bg-secondary font-mono text-[10.5px] text-copy"
          >
            #
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-medium text-foreground">{topic.label}</span>
            <span className="block truncate text-[13px] text-muted-foreground">Topic</span>
          </span>
        </AppLink>
      ))}
    </>
  );
}

/** A row's mark: a launch wears its initials, a maker wears a disc, a topic
 *  and a stack wear a glyph. */
function RowGlyph({ row }: { row: PaletteRow }) {
  if (row.type === "person") {
    return (
      <span
        aria-hidden="true"
        className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[10.5px] text-copy"
      >
        {row.initials}
      </span>
    );
  }
  if (row.type === "product") {
    return (
      <span
        aria-hidden="true"
        className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] bg-secondary font-mono text-[10.5px] text-copy"
      >
        {row.initials}
      </span>
    );
  }
  if (row.type === "all") {
    return (
      <span
        aria-hidden="true"
        className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] text-muted-foreground"
      >
        <SearchGlyph />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] bg-secondary font-mono text-[10.5px] text-copy"
    >
      #
    </span>
  );
}

function ClockGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="shrink-0 text-muted-foreground"
    >
      <circle cx="7" cy="7" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4v3.3l2.2 1.3" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}
