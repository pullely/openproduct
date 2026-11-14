"use client";

import { BTN_SEAT, FOCUS } from "../ui/design";
import { AppLink } from "../ui/link";
import { useOpeningRequested } from "../ui/use-overlay";

import { SEAT_REQUESTED_HREF, SEAT_REQUESTED_LABEL, type SeatAction } from "./seats";

/**
 * A ticket's button (openproduct-redesign OPR1, lit by OPR-3; boards `Seats`,
 * `PhoneSeats`).
 *
 * THE SERVER DRAWS THE ACTION IT WAS HANDED — *Take the seat*, or the words
 * for a seat with no door yet — the same bytes for every visitor (I6).
 *
 * "REQUESTED" COMES ONLY FROM THE OVERLAY. `useOpeningRequested` asks the one
 * personal read a public page makes about THIS seat's id; its server
 * snapshot is always "not known", so the word can appear only in the
 * visitor's own browser, after the overlay answers that they have a request
 * waiting. Nothing the page was rendered with can say it.
 */
export function SeatButton({ seatId, action }: { seatId: string; action: SeatAction }) {
  const requested = useOpeningRequested(seatId);
  if (requested) {
    return (
      <AppLink
        href={SEAT_REQUESTED_HREF}
        data-seat-action="requested"
        className={`inline-flex h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-seat-soft px-[18px] text-[15px] font-semibold text-seat-ink no-underline max-sm:h-[44px] max-sm:text-[13px] ${FOCUS}`}
      >
        {SEAT_REQUESTED_LABEL}
      </AppLink>
    );
  }
  if (action.state === "closed" || action.href === null) {
    return (
      <span data-seat-action="closed" className="shrink-0 text-[13px] text-muted-foreground">
        {action.label}
      </span>
    );
  }
  if (action.state === "requested") {
    return (
      <AppLink
        href={action.href}
        data-seat-action="requested"
        className={`inline-flex h-[40px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-seat-soft px-[18px] text-[15px] font-semibold text-seat-ink no-underline max-sm:h-[44px] max-sm:text-[13px] ${FOCUS}`}
      >
        {action.label}
      </AppLink>
    );
  }
  return (
    // The door is on the console's origin (seam edge S5), so this is a plain
    // anchor: the app's router has nothing to prefetch there.
    <a href={action.href} data-seat-action="open" className={`${BTN_SEAT} max-sm:text-[13px] ${FOCUS}`}>
      {action.label}
    </a>
  );
}
