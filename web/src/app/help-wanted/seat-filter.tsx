import { EYEBROW, FOCUS } from "../ui/design";
import { AppLink } from "../ui/link";

import { SEAT_STAGE_FILTERS, SEAT_STAGE_FILTER_LABEL, seatsPath, type SeatStageFilter } from "./seats";

/**
 * Help wanted's filter (openproduct-redesign OPR-3; boards `Seats`,
 * `PhoneSeats`): All, On shipping products, On ideas, each with how many
 * seats are open there.
 *
 * LINKS, NOT A WIDGET: each filter is an address (`seatsPath`), so it works
 * with no JavaScript and the page it goes to is one static document. A card
 * of rows in the left column from `md` up; a row of 44px pills that scrolls
 * sideways on a phone, the current one in ink.
 */
const GLYPH: Record<SeatStageFilter, string> = {
  all: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c1-4 4-6 7-6s6 2 7 6M19 8v6M16 11h6",
  shipping: "M5 12l5 5 9-10",
  idea: "M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z",
};

/** A colour here is a KIND (design §3): teal is seats, amber is what ships,
 *  lavender is ideas. */
const TILE: Record<SeatStageFilter, { off: string; on: string }> = {
  all: { off: "bg-seat-soft text-seat-ink", on: "bg-seat text-card" },
  shipping: { off: "bg-amber-soft text-amber-ink", on: "bg-amber text-card" },
  idea: { off: "bg-idea-soft text-idea", on: "bg-idea text-card" },
};

export function SeatFilter({ current, counts }: { current: SeatStageFilter; counts: Record<SeatStageFilter, number> }) {
  return (
    <nav
      aria-label="Seat filters"
      data-seat-filters
      className="flex flex-col gap-0.5 rounded-[16px] bg-card p-2.5 [scrollbar-width:none] max-md:-mx-3 max-md:flex-row max-md:gap-1.5 max-md:overflow-x-auto max-md:rounded-none max-md:bg-transparent max-md:px-3 max-md:py-0"
    >
      <div className={`${EYEBROW} px-2.5 pb-2 pt-1.5 max-md:hidden`}>Open seats</div>
      {SEAT_STAGE_FILTERS.map((stage) => {
        const on = stage === current;
        return (
          <AppLink
            key={stage}
            href={seatsPath(stage)}
            {...(on ? { "aria-current": "page" as const } : {})}
            data-seat-filter={stage}
            className={`flex min-h-[40px] items-center gap-3 rounded-[14px] px-2.5 text-[15px] no-underline transition-colors max-md:min-h-[44px] max-md:flex-[1_0_auto] max-md:justify-center max-md:gap-1.5 max-md:whitespace-nowrap max-md:rounded-full max-md:px-3 max-md:text-[13px] ${
              on
                ? "font-semibold text-foreground max-md:bg-primary max-md:text-primary-foreground"
                : "text-copy hover:bg-accent max-md:bg-card max-md:font-medium"
            } ${FOCUS}`}
          >
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] max-md:hidden ${on ? TILE[stage].on : TILE[stage].off}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d={GLYPH[stage]} />
              </svg>
            </span>
            <span className="flex-1 text-left max-md:flex-none">{SEAT_STAGE_FILTER_LABEL[stage]}</span>
            <span className={`font-mono text-[11px] ${on ? "text-foreground max-md:text-primary-foreground" : "text-muted-foreground"}`}>
              {counts[stage]}
            </span>
          </AppLink>
        );
      })}
    </nav>
  );
}
