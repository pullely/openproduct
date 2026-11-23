import { FOCUS } from "../ui/design";
import { AppLink } from "../ui/link";

import { SEAT_STAGE_FILTERS, SEAT_STAGE_FILTER_LABEL, seatsPath, type SeatStageFilter } from "./seats";

/**
 * Help wanted's filter (openproduct-redesign OPR-3; boards `Seats`,
 * `PhoneSeats`): All, then the four stages (SC-2), each with how many seats
 * are open there.
 *
 * LINKS, NOT A WIDGET: each filter is an address (`seatsPath`), so it works
 * with no JavaScript and the page it goes to is one static document. A card
 * of rows in the left column from `md` up; a row of 44px pills that scrolls
 * sideways on a phone, the current one in ink.
 */
const GLYPH: Record<SeatStageFilter, string> = {
  all: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c1-4 4-6 7-6s6 2 7 6M19 8v6M16 11h6",
  idea: "M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z",
  building: "M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  stage: "M8 5v14l11-7z",
  production: "M5 12l5 5 9-10",
};

/** A colour here is a KIND (design §3): teal is seats, and each stage wears
 *  its own (SC-2) — lavender, amber, slate, green. */
export function SeatFilter({ current, counts }: { current: SeatStageFilter; counts: Record<SeatStageFilter, number> }) {
  return (
    <nav
      aria-label="Seat filters"
      data-seat-filters
      className="flex flex-row flex-wrap gap-1.5 max-sm:-mx-3 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-3 max-sm:[scrollbar-width:none]"
    >
      <div className="sr-only">Open seats</div>
      {SEAT_STAGE_FILTERS.map((stage) => {
        const on = stage === current;
        return (
          <AppLink
            key={stage}
            href={seatsPath(stage)}
            {...(on ? { "aria-current": "page" as const } : {})}
            data-seat-filter={stage}
            className={`flex min-h-[40px] flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] no-underline transition-colors max-sm:min-h-[44px] ${
              on ? "bg-secondary font-semibold text-foreground" : "font-medium text-foreground hover:bg-accent"
            } ${FOCUS}`}
          >
            <span aria-hidden="true" className="grid shrink-0 place-items-center text-muted-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d={GLYPH[stage]} />
              </svg>
            </span>
            <span>{SEAT_STAGE_FILTER_LABEL[stage]}</span>
            <span className={`text-[12px] ${on ? "text-foreground" : "text-muted-foreground"}`}>
              {counts[stage]}
            </span>
          </AppLink>
        );
      })}
    </nav>
  );
}
