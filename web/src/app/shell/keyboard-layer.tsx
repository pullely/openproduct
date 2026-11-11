"use client";

import * as React from "react";

import {
  BINDINGS,
  KEYS_SHEET_NOTE,
  KEYS_SHEET_TITLE,
  ROW_ATTRIBUTE,
  isPlain,
  isTyping,
  nextRow,
  walksSections,
} from "../ui/keys";
import { SECTION_ATTRIBUTE } from "../[slug]/sections";

/**
 * The keyboard layer (openproduct-worldclass FR4).
 *
 * The audit's P2·18: *"No keyboard layer — no ⌘K, no `j`/`k`, no `u`."* Half
 * of that was already wrong when it was written, and the epic's own triage
 * repeated it — see FR4 in `IMPLEMENTATION-STATUS.md`. `⌘K` and `/` have been
 * bound in `palette.tsx` since 5 September. What was missing is traversal, the
 * act, and the list.
 *
 * ─── FOCUS IS THE CURSOR ──────────────────────────────────────────────────
 *
 * `j` and `k` move FOCUS to the next and previous launch, rather than moving a
 * highlight of this layer's own. A separate highlight would be a second idea
 * of "where you are": invisible to a screen reader, out of step with `Tab`,
 * and needing its own scrolling. Moving focus gets announcement, scrolling and
 * the browser's own focus ring for free — and `u` can then simply ask which
 * row the focus is in, instead of the two of them keeping a shared variable
 * honest.
 *
 * ─── AND IT BINDS NOTHING THE PALETTE ALREADY BINDS ───────────────────────
 *
 * `⌘K` and `/` stay in `palette.tsx`, next to the field they focus. The sheet
 * below lists them because a reader does not care which component owns a key,
 * but two handlers for one keystroke is a race with no winner.
 *
 * ─── NOTHING HERE READS A SESSION (I6) ────────────────────────────────────
 *
 * It renders nothing on the server but the sheet's closed state, which is the
 * same markup for every visitor. `u` presses the vote button that is already
 * on the page; whether that button signs somebody in first is the button's
 * business and unchanged.
 */
export function KeyboardLayer() {
  const [sheet, setSheet] = React.useState(false);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (sheet) closeRef.current?.focus();
  }, [sheet]);

  React.useEffect(() => {
    const rows = () => [...document.querySelectorAll<HTMLElement>(`[${ROW_ATTRIBUTE}]`)];

    /** The row the focus is in, or the only row on a page that has one. */
    const currentRow = (all: HTMLElement[]) => {
      const active = document.activeElement;
      const index = all.findIndex((row) => active instanceof Node && row.contains(active));
      if (index >= 0) return index;
      // A listing page is one row and the reader is plainly on it, so `u`
      // works there without having tabbed to anything first. On a feed it
      // stays -1, which `nextRow` reads as "start at the top".
      return all.length === 1 ? 0 : -1;
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sheet) {
        setSheet(false);
        return;
      }
      if (isTyping(event.target as HTMLElement | null) || !isPlain(event)) return;

      if (event.key === "?") {
        event.preventDefault();
        setSheet((open) => !open);
        return;
      }
      if (event.key === "j" || event.key === "k") {
        const all = rows();
        const step = event.key === "j" ? 1 : -1;
        // PP2 — ON A LISTING, THE SAME KEYS WALK ITS OUTLINE. The page is
        // one row, so `j` there had nothing to move to; it now moves focus
        // to the next section's heading, which carries `tabIndex={-1}` so
        // it can take focus without joining the Tab order. Focus is still
        // the cursor: the heading is announced, scrolled to, and `u` still
        // finds the hero because `currentRow` reads a one-row page as row 0.
        const sections = [...document.querySelectorAll<HTMLElement>(`[${SECTION_ATTRIBUTE}]`)];
        if (walksSections(all.length, sections.length)) {
          const active = document.activeElement;
          const current = sections.findIndex(
            (section) => active instanceof Node && section.contains(active),
          );
          const to = nextRow(sections.length, current, step);
          if (to === null) return;
          const heading = sections[to]!.querySelector<HTMLElement>("h2, h3");
          if (!heading) return;
          event.preventDefault();
          heading.focus();
          heading.scrollIntoView({ block: "start" });
          return;
        }
        const at = nextRow(all.length, currentRow(all), step);
        if (at === null) return;
        // The row's first REACHABLE link is its name — the stretched title
        // FR2 put over the whole row — so focusing it puts the reader on the
        // row and on its destination at once.
        //
        // `:not([aria-hidden="true"])` is load-bearing and was found by
        // driving this in a browser: the first `a[href]` in a feed row is the
        // logo tile's, which is deliberately `aria-hidden` and `tabIndex={-1}`
        // because it duplicates the title. Focusing it moves the ring to a
        // link a screen reader is told does not exist, which is a worse place
        // to be than where the reader started.
        const target = all[at]!.querySelector<HTMLElement>('a[href]:not([aria-hidden="true"])');
        if (!target) return;
        event.preventDefault();
        target.focus();
        target.scrollIntoView({ block: "nearest" });
        return;
      }
      if (event.key === "u") {
        const all = rows();
        const at = currentRow(all);
        if (at < 0) return;
        // THE BUTTON THAT IS ALREADY THERE. `u` does not post anything itself:
        // it presses the control a reader would have pressed, so the sign-in
        // bounce, the optimistic state and the return path are the ones that
        // already work rather than a second implementation of them.
        // FO3 — on a thread page the rows are posts, and the control that is
        // already there is the comment's upvote (DQ1). Same rule: press what
        // the page already draws.
        const vote = all[at]!.querySelector<HTMLButtonElement>(
          'form[id^="vote-"] button[type="submit"], form[id^="comment-"] button[type="submit"]',
        );
        if (!vote) return;
        event.preventDefault();
        vote.click();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  if (!sheet) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={KEYS_SHEET_TITLE}
      onClick={(event) => {
        if (event.target === event.currentTarget) setSheet(false);
      }}
      // `aria-modal="true"` is a PROMISE about focus, and a promise this had
      // to keep rather than merely make: without it Tab walks straight out of
      // the sheet into the page behind, which for a screen-reader user is a
      // dialog that says it is modal and is not. The sheet holds exactly one
      // control, so the cycle is short — and short is the case a hand-rolled
      // trap usually gets wrong, by letting the single element's Tab escape.
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
          ),
        ];
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const at = document.activeElement;
        if (event.shiftKey ? at === first : at === last) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }}
      className="fixed inset-0 z-50 grid place-items-center bg-scrim/45 p-6"
    >
      <div className="w-full max-w-[420px] rounded-[14px] border border-border bg-card p-5 shadow-menu">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="m-0 font-serif text-[20px] font-normal text-foreground">
            {KEYS_SHEET_TITLE}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setSheet(false)}
            className="rounded-[8px] px-2 py-1 text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Close
          </button>
        </div>
        <p className="m-0 mt-2 text-[13.5px] leading-[1.5] text-muted-foreground">
          {KEYS_SHEET_NOTE}
        </p>
        {/* BUILT FROM THE TABLE THE HANDLER ACTS ON, so a shortcut that works
            and is not listed, or is listed and does nothing, is not a state
            this can reach. */}
        <dl className="m-0 mt-4 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2.5">
          {BINDINGS.map((binding) => (
            <React.Fragment key={binding.shows}>
              <dt className="m-0 justify-self-start rounded-[6px] border border-border bg-secondary px-[7px] py-[3px] font-mono text-[12.5px] text-foreground">
                {binding.shows}
              </dt>
              <dd className="m-0 text-[14px] leading-[1.45] text-copy">{binding.does}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
