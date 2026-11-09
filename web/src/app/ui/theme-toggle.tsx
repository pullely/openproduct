"use client";

import * as React from "react";

import { THEME_CHOICES, THEME_STORAGE_KEY, applyTheme, type ThemeChoice } from "./theme";

/**
 * Which ramp, chosen by the reader (openproduct-worldclass FR1, completing FR0).
 *
 * FR0 shipped the second ramp and both selectors — `prefers-color-scheme` and
 * an explicit `[data-theme]` — and deliberately shipped no control, because a
 * control needs a home in the chrome and FR1 is the milestone that rebuilds
 * the chrome. This is that control, and it lives in the FOOTER rather than the
 * bar: the header has 343px at 375px and four things in it already, and a
 * preference that is not content belongs at the end of the page on a
 * text-first site rather than beside the search field.
 *
 * ─── THREE STATES, BECAUSE TWO IS A TRAP ──────────────────────────────────
 *
 * A two-way toggle has no way back to the operating system's answer. Somebody
 * who taps `Dark` on a phone that switches to dark at sunset has silently
 * opted out of that forever, and nothing on the page says so. `System` is the
 * default and is a real, reachable choice.
 *
 * ─── NOTHING HERE IS A SESSION READ (WC-4, I6) ────────────────────────────
 *
 * The preference lives in `localStorage`, not a cookie and not the account:
 * a cookie would vary the request and cost the edge cache; the account would
 * make a public page depend on who is asking. The server render is identical
 * for every visitor — no button is marked as current until the effect below
 * runs — which is the same shape `AccountChip` has held since XP0.
 *
 * The FIRST PAINT is handled by an inline script in `layout.tsx`, not here.
 * A React effect runs after paint, so a reader who chose dark on a light
 * device would watch the page flash white on every navigation.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [choice, setChoice] = React.useState<ThemeChoice | null>(null);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      setChoice(THEME_CHOICES.includes(stored as ThemeChoice) ? (stored as ThemeChoice) : "light");
    } catch {
      // A browser with storage denied still gets a working control; it just
      // cannot remember the answer, which is better than throwing on render.
      setChoice("light");
    }
  }, []);

  const pick = (next: ThemeChoice) => {
    setChoice(next);
    applyTheme(next);
    try {
      if (next === "light") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Nothing to do and nothing worth saying: the page is already in the
      // ramp they asked for; it will not be next time.
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="text-[13px] text-muted-foreground">Theme</span>
      <span
        role="group"
        aria-label="Theme"
        className="inline-flex items-center gap-0.5 rounded-[8px] bg-secondary p-0.5"
      >
        {THEME_CHOICES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => pick(option)}
            aria-pressed={choice === option}
            // `max-sm:min-h-[44px]` — FR2 is the milestone that takes every
            // target to 44px at mobile widths, and a control introduced by
            // FR1 has no business adding three more to its list.
            className={`rounded-[7px] px-2 py-1 text-[12.5px] font-medium capitalize transition-colors max-sm:min-h-[44px] max-sm:px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring ${
              choice === option ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option}
          </button>
        ))}
      </span>
    </span>
  );
}
