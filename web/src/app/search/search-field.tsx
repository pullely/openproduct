"use client";

import * as React from "react";

import { FOCUS } from "../ui/design";
import { CloseIcon, SearchIcon } from "../ui/icons";

/**
 * The page's own search field (openproduct-redesign OPR1, board
 * `PhoneSearch`).
 *
 * ─── A PHONE'S FIELD ──────────────────────────────────────────────────────
 *
 * On a phone the header's search is a link to this page, not an input, so
 * the typing happens here: the field is the first thing on the page, and
 * arriving with nothing asked yet puts the caret in it. From `sm` up the
 * header carries the real field on every page and this one is not displayed
 * (board `Search` draws none in the page).
 *
 * ─── A REAL FORM WITH A REAL GET ──────────────────────────────────────────
 *
 * `action="/search" method="get"`, so the page works with no JavaScript at
 * all and a result is a URL somebody can share and reload. The state here is
 * only what the clear button needs: the text, so the button shows when there
 * is some and empties the field (and returns the caret to it) when pressed.
 *
 * ─── FOCUS ON ARRIVAL, WHEN THERE IS NOTHING TO READ YET ──────────────────
 *
 * `focusOnArrival` is the bare `/search`. A page of results does not take
 * the focus: on a phone that raises the keyboard over the results somebody
 * came to read. Focusing an input that is not displayed is a no-op, so the
 * wide layout is untouched.
 *
 * 44px tall with a 16px face (a smaller one makes a phone zoom on focus);
 * the clear button is a 44px target holding a 26px disc.
 */
export function SearchField({
  query,
  label,
  focusOnArrival,
  maxLength,
}: {
  query: string;
  /** The field's accessible name — the contract's own sentence. */
  label: string;
  focusOnArrival: boolean;
  maxLength: number;
}) {
  const [value, setValue] = React.useState(query);
  const input = React.useRef<HTMLInputElement | null>(null);

  // The address is the truth: a new query in the URL (a result link, Back)
  // replaces what the field shows.
  React.useEffect(() => {
    setValue(query);
  }, [query]);

  React.useEffect(() => {
    if (focusOnArrival) input.current?.focus();
  }, [focusOnArrival]);

  return (
    <form
      action="/search"
      method="get"
      role="search"
      className="hidden min-h-[44px] items-center rounded-full bg-card pl-[14px] ring-1 ring-inset ring-foreground/[0.07] focus-within:ring-2 focus-within:ring-ring max-sm:flex"
    >
      <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2">
        <SearchIcon className="h-[15px] w-[15px] shrink-0 text-amber-ink" />
        <span className="sr-only">{label}</span>
        <input
          ref={input}
          name="q"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search"
          maxLength={maxLength}
          className="w-full min-w-0 flex-1 border-0 bg-transparent text-nozoom text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      {value.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            input.current?.focus();
          }}
          aria-label="Clear search"
          className={`grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full border-0 bg-transparent p-0 text-muted-foreground ${FOCUS}`}
        >
          <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-foreground/[0.06]">
            <CloseIcon className="h-[11px] w-[11px]" />
          </span>
        </button>
      ) : null}
    </form>
  );
}
