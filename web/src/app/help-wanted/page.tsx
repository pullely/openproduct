import type { Metadata } from "next";

import { orderBuilds } from "@openproduct/contracts";

import { consoleOrigin } from "../../lib/platform";
import { fetchAllDirectoryProjects, fetchPublicProfile, publicApexOrigin } from "../public-api";
import { BOARD_PAGE, EMPTY_NOTE, PAGE_TITLE } from "../ui/design";
import { FailurePanel } from "../ui/failure";

import { SeatCard } from "./seat-card";
import { SeatList } from "./seat-list";
import {
  SEATS_EMPTY,
  SEAT_PRODUCT_LIMIT,
  seatAction,
  seatTotals,
  seatsCountLine,
  seatsCountLineShort,
  seatsOf,
  type Seat,
} from "./seats";

/**
 * Help wanted (openproduct-redesign OPR1; boards `Seats`, `PhoneSeats`) —
 * the address the header's third pill goes to.
 *
 * EVERY OPEN SEAT, AS A TICKET. A seat is today's open role: the title and
 * the count of them beside it, then one teal ticket per seat — its name,
 * what it asks for, the product it belongs to, and *Take the seat*, which
 * opens today's request-to-join door — ten at a time under *Show more*.
 *
 * THE READS. The catalogue says which products have a seat open and how
 * many (the Roles order: products with an open role, most active first —
 * nothing here makes a new order). A seat's NAME is on its product's own
 * public document, so the page reads one per product, in parallel, bounded
 * by `SEAT_PRODUCT_LIMIT`. Each is the cached public read; a product whose
 * document cannot be read contributes no ticket rather than failing the
 * page, and the title's count still counts its seats.
 *
 * WHAT IS LEFT OUT UNTIL OPR2, AND WHERE IT GOES. A listing has no stage
 * yet, so the board's filter (All / On shipping products / On ideas — a
 * left column, a row of pills on a phone) is absent, and a ticket does not
 * say "Shipping" or "Idea". The body is one column; the filter is a sibling
 * of `SeatList` inside the `data-seats-body` box when it arrives.
 *
 * "REQUESTED" IS DRAWN BUT NOT YET LIT. The overlay — the one personal read
 * a public page makes — carries how MANY requests a visitor has made, not
 * WHICH seats they are for, so no ticket can honestly be marked. The state
 * exists (`seatAction`, the card's teal-tint button) and every ticket is
 * rendered un-requested until the overlay names the openings.
 *
 * Static and cacheable: no query string is read and no actor is resolved
 * (I6). `/builds/roles`, the section's old address, redirects here.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Help wanted",
  description: "Every open seat on a product built in the open: what it asks for, and where to take it.",
  ...(publicApexOrigin() ? { alternates: { canonical: `${publicApexOrigin()}/help-wanted` } } : {}),
};

export default async function HelpWantedPage() {
  const cards = await fetchAllDirectoryProjects();
  // The failure panel is a page of its own (its own `main` and `h1`).
  if (cards === null) {
    return (
      <FailurePanel
        kind="unavailable"
        what="The open seats could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: "/help-wanted" },
          { label: "Products", href: "/products" },
        ]}
      />
    );
  }

  const hiring = orderBuilds(cards, "roles");
  const totals = seatTotals(hiring);
  const documents = await Promise.all(hiring.slice(0, SEAT_PRODUCT_LIMIT).map((card) => fetchPublicProfile(card.slug)));
  const seats: Seat[] = hiring
    .slice(0, SEAT_PRODUCT_LIMIT)
    .flatMap((card, index) => seatsOf(card, documents[index]?.roleOpenings ?? []));
  const origin = consoleOrigin();

  return (
    <main className={BOARD_PAGE}>
      <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1.5 max-sm:justify-between max-sm:gap-x-[10px] max-sm:gap-y-1 max-sm:px-[2px]">
        <h1 className={PAGE_TITLE}>Help wanted</h1>
        <p className="m-0 font-mono text-label uppercase tracking-[0.1em] text-muted-foreground max-sm:whitespace-nowrap max-sm:text-mono-label" data-seats-count>
          <span className="max-sm:hidden">{seatsCountLine(totals.seats, totals.products)}</span>
          <span className="sm:hidden">{seatsCountLineShort(totals.seats, totals.products)}</span>
        </p>
      </div>

      <div data-seats-body>
        {seats.length > 0 ? (
          <SeatList>
            {seats.map((seat) => (
              <SeatCard key={seat.id} seat={seat} action={seatAction(seat, { consoleOrigin: origin })} />
            ))}
          </SeatList>
        ) : (
          <p className={EMPTY_NOTE}>{SEATS_EMPTY}</p>
        )}
      </div>
    </main>
  );
}
