"use client";

import * as React from "react";

import { SEATS_MORE_LABEL, SEATS_STEP, seatsShownLine } from "./seats";

import { BTN_SOFT, FOCUS } from "../ui/design";

/**
 * The grid of tickets, ten at a time (openproduct-redesign OPR1; boards
 * `Seats`, `PhoneSeats`).
 *
 * EVERY SEAT IS IN THE SERVER'S HTML; THIS ONLY DECIDES HOW MANY ARE OUT.
 * The tickets are server components handed in as children, so the document
 * a crawler reads lists every open seat. The first ten are shown, the rest
 * carry `hidden`, and *Show more* brings out ten more — no read, no fetch,
 * nothing personal: the same bytes and the same behaviour for every visitor
 * (I6).
 */
export function SeatList({ children }: { children: React.ReactNode }) {
  const seats = React.Children.toArray(children);
  const [shown, setShown] = React.useState(SEATS_STEP);
  const more = shown < seats.length;

  return (
    <section aria-labelledby="seats-list" className="flex min-w-0 flex-col gap-[18px] max-sm:gap-[10px]">
      <h2 id="seats-list" className="sr-only">
        Open seats
      </h2>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,400px),1fr))] gap-[18px] p-0 max-sm:grid-cols-1 max-sm:gap-[10px]" data-seat-cards>
        {seats.map((seat, index) => (
          <li key={index} hidden={index >= shown} className="min-w-0">
            {seat}
          </li>
        ))}
      </ul>
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 pt-1 max-sm:px-[2px] max-sm:pt-0">
        <span className="font-mono text-label uppercase tracking-[0.1em] text-muted-foreground max-sm:text-mono-label" data-seats-shown>
          {seatsShownLine(shown, seats.length)}
        </span>
        {more ? (
          <button type="button" onClick={() => setShown((n) => n + SEATS_STEP)} className={`${BTN_SOFT} border-0 ${FOCUS}`}>
            {SEATS_MORE_LABEL}
          </button>
        ) : null}
      </div>
    </section>
  );
}
