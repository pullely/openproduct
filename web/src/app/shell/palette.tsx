"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { SEARCH_PATH, searchPath } from "@openproduct/contracts";

import {
  canExpand,
  cardOpen,
  nextActive,
  toRows,
  visibleRows,
  type PaletteRow,
  type SearchHit,
  type SearchMaker,
} from "./palette-rows";
import { readRecent, withRecent, writeRecent } from "./recent-searches";
import { SearchGlyph } from "./palette-glyph";
import { SEARCH_PLACEHOLDER } from "./shell";

import { navigationStarted } from "../ui/navigation";

/**
 * The header search, which opens in place (openproduct-redesign OPR1;
 * design.md §2 rule 6, board `Feed`).
 *
 * ─── ONE SEARCH, AND THIS IS IT ───────────────────────────────────────────
 *
 * This file has been the site's search since DS3: first a full-screen
 * command palette, then a dropdown under the field, now the board's shape.
 * It is still one feature in one place. `⌘K`, `Ctrl-K` and `/` do not open
 * a second surface; they focus this field. The arrow keys walk the rows and
 * Enter opens one, as they did in the palette.
 *
 * ─── THE BOX BECOMES THE CARD ─────────────────────────────────────────────
 *
 * At rest it is a 40px pill, 268px wide — the board's 260px and the 8px its
 * own placeholder needs: "Search products and people" at 16px measured one
 * letter wider than the 260px box in a browser and was cut at the "e". When
 * the reader types, the box
 * widens to 380px (eased over 0.32s) and becomes the top of ONE white card
 * that holds the results beneath it: the card is drawn behind the field, 6px
 * proud of it on three sides, so the field is the card's first row and not a
 * control with a menu hanging off it. Nothing else in the bar moves. Reduced
 * motion drops the easing and the card's entrance; the states are the same.
 *
 * IT OPENS ON INPUT. Focus alone leaves a field. Clearing the text closes
 * the card; Escape and a click outside put it away and leave the text.
 *
 * ─── RESULTS COME FROM THE INDEX, NEVER FROM THE PAGE ─────────────────────
 *
 * DS3's rule, unchanged: the read is `/api/search`, the same one the results
 * page makes. Filtering what the current page happened to render would work
 * until there was a second page of results and would never work from a
 * product page. The card shows what that read returns — products and people
 * (`palette-rows.ts` says what it does not return) — and `See all results`
 * goes to `/search?q=…`, where topics and stacks are answered too.
 *
 * ─── THE SHORTCUT DOES NOT FIGHT THE BROWSER ──────────────────────────────
 *
 * `⌘K` / `Ctrl-K` always focuses the field; `/` does so only when the event
 * target is not already accepting text, so typing a slash in a form still
 * types a slash. On a phone this field is not displayed (the top bar's
 * search is a link to `/search`), so there the shortcut goes to that page.
 */

/** How long after the last keystroke we ask. Long enough that a typist does
 *  not issue one request per character; short enough to feel immediate. */
const DEBOUNCE_MS = 140;

/** Two characters before the first request — one letter matches most of the
 *  catalogue and answers nothing. The card is open from the first character
 *  (it opens on input); it has rows from the second. */
const MIN_QUERY = 2;

/**
 * THE CARD IS LOADED WHEN IT IS OPENED (OPP11).
 *
 * `ssr: false` is safe HERE and would not be on the component as a whole:
 * the card renders only while `open`, which no server render can be, so the
 * boundary removes nothing from the document. The field — the
 * `role="combobox"` input every visitor sees — is deliberately NOT behind
 * this boundary, for exactly that reason.
 *
 * NO LOADING STATE, on purpose: a placeholder card for one chunk fetch is a
 * flash of furniture where there was none.
 */
const PalettePanel = dynamic(() => import("./palette-panel"), { ssr: false });

/** The ids the field and the card share. */
const CARD_ID = "search-results";
const rowDomId = (index: number) => `search-row-${index}`;

/** The board's easing for the box and its card. */
const EASE = "ease-[cubic-bezier(0.2,0.8,0.2,1)]";

export function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [dismissed, setDismissed] = React.useState(false);
  const [rows, setRows] = React.useState<PaletteRow[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set());
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const trimmed = query.trim();
  const open = cardOpen(query, dismissed);
  const list = React.useMemo(
    () => visibleRows(rows ?? [], expanded, trimmed),
    [rows, expanded, trimmed],
  );

  // This browser's own history (`recent-searches.ts`): written here when a
  // search is made, kept in `localStorage`, sent nowhere.
  const remember = React.useCallback((entry: string) => {
    writeRecent(withRecent(readRecent(), entry));
  }, []);

  // ── the shortcut ────────────────────────────────────────────────────
  React.useEffect(() => {
    const focusField = () => {
      const input = inputRef.current;
      // `offsetParent` is null for an element inside `display: none` — the
      // phone, where the search is a page rather than this field.
      if (!input || input.offsetParent === null) {
        navigationStarted(SEARCH_PATH, window.location.pathname + window.location.search);
        router.push(SEARCH_PATH);
        return;
      }
      input.focus();
      setDismissed(false);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never steal a keystroke from something already accepting text. A
      // shortcut that eats a character out of a form field is worse than no
      // shortcut, because the reader cannot tell what happened.
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        focusField();
        return;
      }
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        focusField();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  // ── put away on an outside click ────────────────────────────────────
  // A card that can only be dismissed by choosing something is a trap, and
  // one that stays open over the page is a bug people report as "the search
  // is stuck".
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setDismissed(true);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  // ── the read ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (trimmed.length < MIN_QUERY) {
      setRows(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
            headers: { accept: "application/json" },
          });
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as {
            data?: { results?: SearchHit[]; makers?: SearchMaker[] };
          };
          if (cancelled) return;
          setFailed(false);
          setRows(toRows(body.data?.results ?? [], body.data?.makers ?? []));
          setActive(-1);
          // A new answer is a new list: nobody in it has been opened.
          setExpanded(new Set());
        } catch {
          if (cancelled) return;
          setFailed(true);
          setRows([]);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const go = React.useCallback(
    (href: string) => {
      remember(trimmed);
      setDismissed(true);
      inputRef.current?.blur();
      // OPP13 — `router.push` bypasses `AppLink`, so the bar is told here.
      navigationStarted(href, window.location.pathname + window.location.search);
      router.push(href);
    },
    [remember, router, trimmed],
  );

  // A CLICK ON A ROW NEEDS NO `router.push`: the row IS a link, so the
  // browser (and the client router behind it) does the navigating. This only
  // records the search and puts the card away.
  const select = React.useCallback(() => {
    remember(trimmed);
    setDismissed(true);
  }, [remember, trimmed]);

  const toggle = React.useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      // Only when there is a card to close: Escape in an idle field is the
      // browser's (it clears a search input).
      if (!open) return;
      event.preventDefault();
      setDismissed(true);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const row = open && active >= 0 ? list[active] : undefined;
      // NO SELECTION MEANS THE WHOLE QUERY. Enter on a search field is a
      // promise the reader has made about the words they typed, not about a
      // row they never moved to — so it goes to the results page.
      if (row) go(row.href);
      else if (trimmed.length > 0) go(searchPath(trimmed));
      return;
    }
    if (trimmed.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setDismissed(false);
      setActive((i) => nextActive(list.length, i, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    // A person's row opens with → and closes with ←, the keys a disclosure in
    // a list takes; the chevron beside it is the same act for a pointer.
    const row = open && active >= 0 ? list[active] : undefined;
    if (row && canExpand(row)) {
      const isOpen = expanded.has(row.id);
      if ((event.key === "ArrowRight" && !isOpen) || (event.key === "ArrowLeft" && isOpen)) {
        event.preventDefault();
        toggle(row.id);
      }
    }
  };

  return (
    // `relative` anchors the card to the box. THE BASIS IS THE WIDTH: 268px at
    // rest and 380px with a card, and the only thing that changes between the
    // two is `flex-basis`, so the easing is one property. `shrink` lets it
    // give way on a narrow bar instead of pushing the bell out of the row.
    //
    // NOT DISPLAYED ON A PHONE (`max-sm:hidden`): the top bar's search there
    // is a link to `/search` (`top-panel.tsx`), because a field that opens a
    // card under itself has nowhere to open it at 390px.
    <div
      ref={rootRef}
      data-search-open={open ? "" : undefined}
      className={`relative flex min-w-0 shrink grow-0 transition-[flex-basis] duration-300 ${EASE} motion-reduce:transition-none max-sm:hidden ${
        open ? "basis-[380px]" : "basis-[268px]"
      }`}
    >
      <label
        // Above the card (`z-[21]` over its `z-20`): the field is the card's
        // first row. At rest it is the board's translucent white pill with a
        // hairline ring; over the card it sits in the well colour and the
        // ring goes, because the card is its edge now.
        className={`relative z-[21] flex h-[40px] min-w-0 flex-1 items-center gap-2 rounded-full px-[14px] transition-colors motion-reduce:transition-none ${
          open
            ? "bg-well"
            : "bg-card/75 ring-1 ring-inset ring-foreground/[0.07] focus-within:ring-2 focus-within:ring-ring"
        }`}
      >
        <SearchGlyph />
        <span className="sr-only">Search</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDismissed(false);
            setActive(-1);
          }}
          // Returning to a field that still holds a query brings its card
          // back; an empty field stays a field.
          onFocus={() => setDismissed(false)}
          onKeyDown={onKeyDown}
          placeholder={SEARCH_PLACEHOLDER}
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={CARD_ID}
          aria-activedescendant={open && active >= 0 ? rowDomId(active) : undefined}
          autoComplete="off"
          // 16px, the size below which iOS zooms the page on focus. `h-full`
          // and not the intrinsic height: a bare input in an `items-center`
          // row is as tall as its text, so the top and bottom of the pill
          // would look clickable and not be.
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {open ? (
        <PalettePanel
          id={CARD_ID}
          rowDomId={rowDomId}
          list={list}
          answered={rows !== null}
          failed={failed}
          active={active}
          expanded={expanded}
          onActive={setActive}
          onSelect={select}
          onToggle={toggle}
        />
      ) : null}
    </div>
  );
}
