import { orderBuilds } from "@openproduct/contracts";

import { consoleOrigin } from "../../lib/platform";
import { fetchAllDirectoryProjects, fetchPublicProfile } from "../public-api";
import { EMPTY_NOTE, PAGE_TITLE, RAIL_LEFT, SECTION_PAGE } from "../ui/design";
import { FailurePanel } from "../ui/failure";

import { SeatCard } from "./seat-card";
import { SeatFilter } from "./seat-filter";
import { SeatList } from "./seat-list";
import {
  SEATS_EMPTY,
  SEATS_EMPTY_AT_STAGE,
  SEAT_PRODUCT_LIMIT,
  seatAction,
  seatStageCounts,
  seatTotals,
  seatsCountLine,
  seatsCountLineShort,
  seatsOf,
  seatsPath,
  type Seat,
  type SeatStageFilter,
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
 * THE FILTER (OPR-3). A seat is on a product that is shipping or on an
 * idea, and the board's filter (All / On shipping products / On ideas — a
 * left column, a row of pills on a phone) narrows the tickets to one of the
 * two. Each filtered list is an ADDRESS (`seatsPath(stage)`:
 * `/help-wanted/stage/shipping`, `/help-wanted/stage/ideas`), so the filter
 * is links and every view is one static document; each ticket says the stage
 * of its product in its quiet line.
 *
 * "REQUESTED" COMES FROM THE OVERLAY, AND ONLY FROM IT. The server draws
 * every ticket un-requested — the same bytes for everybody. Whether THIS
 * visitor has asked for a seat arrives after paint (`SeatButton`, which asks
 * the overlay about the seat's id) and only then does a ticket say so.
 *
 * Static and cacheable: no query string is read and no actor is resolved
 * (I6). `/builds/roles`, the section's old address, redirects here.
 */
export async function HelpWantedView({ stage = "all" }: { stage?: SeatStageFilter }) {
  const here = seatsPath(stage);
  const cards = await fetchAllDirectoryProjects();
  // The failure panel is a page of its own (its own `main` and `h1`).
  if (cards === null) {
    return (
      <FailurePanel
        kind="unavailable"
        what="The open seats could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: here },
          { label: "Products", href: "/products" },
        ]}
      />
    );
  }
  const everyHiring = orderBuilds(cards, "roles");
  // The title's two numbers and the filter's three are the catalogue's, in
  // every view; the tickets are the filter's.
  const totals = seatTotals(everyHiring);
  const counts = seatStageCounts(everyHiring);
  const hiring = stage === "all" ? everyHiring : everyHiring.filter((card) => card.stage === stage);
  const documents = await Promise.all(hiring.slice(0, SEAT_PRODUCT_LIMIT).map((card) => fetchPublicProfile(card.slug)));
  const seats: Seat[] = hiring
    .slice(0, SEAT_PRODUCT_LIMIT)
    .flatMap((card, index) => seatsOf(card, documents[index]?.roleOpenings ?? []));
  const origin = consoleOrigin();

  return (
    <main className={SECTION_PAGE}>
      <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1.5 sm:sr-only max-sm:justify-between max-sm:gap-x-[10px] max-sm:gap-y-1 max-sm:px-[2px]">
        <h1 className={PAGE_TITLE}>Help wanted</h1>
        <p className="m-0 font-mono text-label uppercase tracking-[0.1em] text-muted-foreground max-sm:whitespace-nowrap max-sm:text-mono-label" data-seats-count>
          <span className="max-sm:hidden">{seatsCountLine(totals.seats, totals.products)}</span>
          <span className="sm:hidden">{seatsCountLineShort(totals.seats, totals.products)}</span>
        </p>
      </div>

      <div data-seats-body className="flex items-start gap-4 max-md:flex-col max-md:items-stretch max-md:gap-2.5">
        <div className={RAIL_LEFT}>
          <SeatFilter current={stage} counts={counts} />
        </div>
        <div className="min-w-0 flex-1">
          {seats.length > 0 ? (
            <SeatList key={stage}>
              {seats.map((seat) => (
                <SeatCard key={seat.id} seat={seat} action={seatAction(seat, { consoleOrigin: origin })} />
              ))}
            </SeatList>
          ) : (
            <p className={EMPTY_NOTE}>{stage === "all" ? SEATS_EMPTY : SEATS_EMPTY_AT_STAGE[stage]}</p>
          )}
        </div>
      </div>
    </main>
  );
}
