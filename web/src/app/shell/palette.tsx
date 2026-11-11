"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { searchPath, suggestedTopics } from "@openproduct/contracts";

import { toRows, type PaletteRow, type SearchHit } from "./palette-rows";
import { readRecent, withRecent, withoutRecent, writeRecent } from "./recent-searches";
import { SearchGlyph } from "./palette-glyph";
import { SEARCH_PLACEHOLDER } from "./shell";

import { navigationStarted } from "../ui/navigation";


/**
 * The search field (openproduct-commons DS3, re-cut to a dropdown).
 *
 * IT WAS A MODAL AND IT IS NOW A DROPDOWN, and that is the whole of this
 * change. A full-screen overlay is the wrong shape for a search field that
 * lives in the bar: it threw a scrim over the chrome it belongs to, locked
 * the body's scroll — which moves the page under a sticky bar the moment the
 * scrollbar goes — and made a two-character lookup feel like a mode you enter
 * and leave. The field now answers UNDER ITSELF, anchored to the input, the
 * way every bar-shaped search on the web does. Nothing else on the page moves
 * while it is open, which is the property the bar was missing.
 *
 * RESULTS COME FROM THE INDEX, NEVER FROM THE PAGE. That is DS3's whole
 * done-when, and the tempting shortcut is exactly what it forbids: filtering
 * what the current page already rendered would work beautifully today and
 * silently stop working the moment there is a second page of results — and it
 * would never work at all from a product page, which has one listing in it. A
 * search whose answers depend on where you opened it is not a search.
 *
 * FOUR RESULT CLASSES, and all four are answered:
 *
 *   launches  the listing itself
 *   makers    public profiles, resolved live by `/v1/search` so somebody who
 *             turned their profile off stops being findable immediately
 *   topics    matched against the contract's own vocabulary, no read at all
 *   stacks    a stack is not a destination, it is a QUESTION, and the honest
 *             answer to "TypeScript" is "every launch built with it"
 *
 * BEFORE ANYBODY TYPES it offers this browser's own recent searches and a few
 * topics. The recents are `localStorage` and go nowhere (`recent-searches.ts`
 * says why at length); the topics are the vocabulary's own order, not a
 * popularity ranking nobody outside this program could check.
 *
 * KEYBOARD-COMPLETE, and the shortcut does not fight the browser's. `⌘K` /
 * `Ctrl-K` is claimed only when the event target is not already an input, so
 * typing `k` in a form still types a `k`. `/` focuses it too, under the same
 * rule.
 */

/** How long after the last keystroke we ask. Long enough that a typist does
 *  not issue one request per character; short enough to feel immediate. */
const DEBOUNCE_MS = 140;

/** Two characters before the first request — one letter matches most of the
 *  catalogue and answers nothing. */
const MIN_QUERY = 2;

/**
 * THE DROPDOWN IS LOADED WHEN IT IS OPENED (OPP11).
 *
 * `ssr: false` is safe HERE and would not have been on the component as a
 * whole: the panel renders only while `open`, which no server render can be,
 * so the boundary removes nothing from the document. The field above it —
 * the `role="combobox"` input every visitor sees — is deliberately NOT behind
 * this boundary, for exactly that reason.
 *
 * NO LOADING STATE, on purpose. `loading` would paint a placeholder panel
 * under the field for one chunk fetch, which is a flash of furniture where
 * there was none; without it the dropdown simply appears when it is ready,
 * the same way it already waits `DEBOUNCE_MS` before it has anything to say.
 */
const PalettePanel = dynamic(() => import("./palette-panel"), { ssr: false });

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [rows, setRows] = React.useState<PaletteRow[] | null>(null);
  const [active, setActive] = React.useState(-1);
  const [failed, setFailed] = React.useState(false);
  const [recent, setRecent] = React.useState<readonly string[]>([]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= MIN_QUERY;
  const suggestions = React.useMemo(() => suggestedTopics(), []);

  // ── this browser's own history, read after mount ────────────────────
  // Never during render: `localStorage` does not exist on the server, and a
  // value that differs between the two renders is a hydration mismatch.
  React.useEffect(() => {
    setRecent(readRecent());
  }, []);

  const remember = React.useCallback((entry: string) => {
    setRecent((current) => {
      const next = withRecent(current, entry);
      writeRecent(next);
      return next;
    });
  }, []);

  const forget = React.useCallback((entry: string) => {
    setRecent((current) => {
      const next = withoutRecent(current, entry);
      writeRecent(next);
      return next;
    });
  }, []);

  // ── the shortcut ────────────────────────────────────────────────────
  React.useEffect(() => {
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
        inputRef.current?.focus();
        setOpen(true);
        return;
      }
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── close on an outside click ───────────────────────────────────────
  // A dropdown that can only be dismissed by choosing something is a trap,
  // and one that stays open behind the page it covers is a bug people report
  // as "the search is stuck".
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  // ── the read ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!open) return;
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
            data?: {
              results?: SearchHit[];
              makers?: Array<{
                handle: string;
                displayName: string | null;
                matched: "handle" | "name" | "bio";
              }>;
            };
          };
          if (cancelled) return;
          setFailed(false);
          setRows(toRows(body.data?.results ?? [], trimmed, body.data?.makers ?? []));
          setActive(-1);
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
  }, [open, trimmed]);

  const go = React.useCallback(
    (href: string, entry: string) => {
      remember(entry);
      setOpen(false);
      inputRef.current?.blur();
      // OPP13 — `router.push` bypasses `AppLink`, so the bar is told here.
      navigationStarted(href, window.location.pathname + window.location.search);
      router.push(href);
    },
    [remember, router],
  );

  // A CLICK ON A ROW NEEDS NO `router.push`: the row IS a link, so the
  // browser (and the client router behind it) does the navigating. This only
  // records the search and gets the dropdown out of the way.
  const select = React.useCallback(
    (entry: string) => {
      remember(entry);
      setOpen(false);
    },
    [remember],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    const list = rows ?? [];
    if (event.key === "Enter") {
      event.preventDefault();
      const row = active >= 0 ? list[active] : undefined;
      // NO SELECTION MEANS THE WHOLE QUERY. Enter on a search field is a
      // promise the reader has made about the words they typed, not about a
      // row they never moved to — so it goes to the results page, which can
      // say what matched and why.
      if (row) go(row.href, trimmed);
      else if (trimmed.length > 0) go(searchPath(trimmed), trimmed);
      return;
    }
    if (list.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % list.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? list.length - 1 : i - 1));
    }
  };

  return (
    // `relative` is what anchors the panel to the field, and the field keeps
    // its place in the bar's flex row whether the panel is open or shut — so
    // opening the search moves nothing.
    <div
      ref={rootRef}
      // A FIELD WHERE THERE IS ROOM, A BUTTON WHERE THERE IS NOT — which is
      // the same call LinkedIn makes, and it is forced by arithmetic rather
      // than taste. Inside the 1180px column the wordmark, five section
      // pills, the bell, `Open a build` and the account control leave
      // about 300px at 1280 and about 110px at 1024. 110px is not a search
      // field: measured at `flex-[1_1_280px]` the box collapsed to 72px, an
      // input too narrow to read the word you just typed. So above `lg` the
      // field takes the slack (240px at worst, 420 at best), and below it the
      // trigger is a 38px magnifier that opens the same dropdown under the
      // same anchor. Nothing is lost — the panel, the recents and every
      // result class are identical either way.
      // THE BASIS IS THE WIDTH, and 300px is chosen rather than eyeballed:
      // the nav carries `margin-left: auto` (the prototype's own
      // construction), an auto margin takes the row's slack, and the field
      // therefore renders AT its basis rather than growing into what is left.
      // "Search products, makers, topics" measures about 276px with its glyph
      // and padding, so a smaller basis truncates the placeholder mid-word on
      // a 1440px screen with room to spare. Measured at 1440/1280/1024: 300,
      // 300, 230 — the last one shrinking alongside the nav, which scrolls.
      //
      // AND THE FIELD COMES BACK BELOW `sm` (openproduct-worldclass FR1). It
      // collapsed to a 38px glyph below `lg` because the section pills were
      // competing for the same row; on a phone those pills have left the
      // header for the bottom bar, and the row has 343px with four things in
      // it. Giving the reclaimed width to the field is the whole point of the
      // reclaim — a search field you can read your own query in beats a
      // button you have to guess at, and search was the dimension the audit
      // scored 1/10. The glyph stays for `sm`…`lg`, where the pills are back.
      className="relative shrink-0 max-sm:min-w-0 max-sm:flex-1 sm:ml-auto sm:block lg:w-[300px] lg:min-w-0 lg:shrink"
    >
      <button
        type="button"
        aria-label={SEARCH_PLACEHOLDER}
        aria-expanded={open}
        aria-controls="search-results"
        onClick={() => setOpen((v) => !v)}
        className={`grid h-[44px] w-[44px] place-items-center rounded-full border text-muted-foreground transition-colors max-sm:hidden lg:hidden ${
          open ? "border-endorse bg-card" : "border-transparent bg-card hover:border-border"
        }`}
      >
        <SearchGlyph />
      </button>

      <div
        // The design's own focus treatment (`design-reference.md` §1): the
        // accent on the border and a 3px wash of `--accent-soft` around it.
        className={`box-border hidden h-[44px] items-center gap-[10px] rounded-full border bg-card pl-4 pr-3 transition-shadow max-sm:h-[40px] max-sm:flex lg:flex ${
          open ? "border-endorse ring-[3px] ring-endorse-soft" : "border-transparent hover:border-border"
        }`}
      >
        <SearchGlyph />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={SEARCH_PLACEHOLDER}
          aria-label={SEARCH_PLACEHOLDER}
          aria-expanded={open}
          aria-controls="search-results"
          aria-autocomplete="list"
          role="combobox"
          autoComplete="off"
          // `h-full` AND NOT the intrinsic height, which is the a11y sweep's
          // 24px floor and a real target: a bare input in an `items-center`
          // row is as tall as its text — measured 176×22 — so the top and
          // bottom 8px of a 38px field looked clickable and were not. Filling
          // the box makes the whole field the target it appears to be.
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14.5px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query.length > 0 ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setRows(null);
              setFailed(false);
              inputRef.current?.focus();
            }}
            // 24px, THE SWEEP'S FLOOR, even though the sweep never sees it:
            // it renders only once there is a query, and a control that hides
            // from the measurement is still a control somebody has to hit.
            className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 1 9 9M9 1 1 9" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          </button>
        ) : (
          // ⌘K OPENS IT FROM ANYWHERE (the handler above), so the field says so
          // (CL1) instead of the return key it used to show.
          <span aria-hidden="true" className="font-mono text-[12px] text-faint max-sm:hidden">
            ⌘K
          </span>
        )}
      </div>

      {open ? (
        <PalettePanel
          hasQuery={hasQuery}
          trimmed={trimmed}
          rows={rows}
          failed={failed}
          active={active}
          recent={recent}
          suggestions={suggestions}
          onActive={setActive}
          onSelect={select}
          onForget={forget}
        />
      ) : null}
    </div>
  );
}

