import { seatSub, type Seat, type SeatAction } from "./seats";

import { BTN_SEAT, FOCUS, SEAT_RING } from "../ui/design";
import { PlusIcon } from "../ui/icons";
import { AppLink } from "../ui/link";
import { ProductTile } from "../ui/product-tile";

/**
 * An open seat, as a ticket (openproduct-redesign OPR1; boards `Seats`,
 * `PhoneSeats`).
 *
 * THE BOARD'S TICKET: a flat card with a notch bitten out of each side, an
 * empty seat drawn as a dashed teal ring with a plus in it, the mono label
 * *Open seat*, the role's name at 18px, the product it belongs to (a link to
 * the product's page) and the button. From `sm` up it is one row, with a
 * dashed rule between the ring and the words; on a phone the product and the
 * button drop into a foot under a dashed rule, and the notches sit on it.
 *
 * TEAL IS THE SEAT'S COLOUR, and nothing else on the page uses it.
 *
 * THE BUTTON IS ONE OF THREE THINGS (`seatAction`): *Take the seat* — a link
 * to today's request-to-join door; *Requested*, in the teal tint; or, where
 * the maintainers have not opened a door yet, the product page's own words
 * for that with no button at all.
 *
 * A SERVER COMPONENT, the same bytes for every visitor (I6). The card draws
 * the action it is handed and resolves nobody.
 *
 * WHAT THE DATA DOES NOT HOLD, THE TICKET DOES NOT SAY: the product's stage
 * ("Shipping", "Idea") is absent until OPR2, and an opening's age is said
 * only where the contract publishes it (`seatSub`).
 */
export function SeatCard({ seat, action }: { seat: Seat; action: SeatAction }) {
  const sub = seatSub(seat);
  const product = `/${seat.product.slug}`;
  return (
    <article
      aria-label={`Open seat on ${seat.product.slug}`}
      data-seat-card
      data-seat-state={action.state}
      className="relative flex h-full flex-wrap items-center gap-4 overflow-hidden rounded-[16px] bg-card px-[26px] py-[18px] max-sm:flex-col max-sm:flex-nowrap max-sm:items-stretch max-sm:gap-0 max-sm:p-0"
    >
      {/* The ticket's two notches: the page colour, half outside the card. */}
      <span aria-hidden="true" className="absolute -left-3 top-1/2 -mt-3 h-6 w-6 rounded-full bg-background max-sm:-left-[11px] max-sm:bottom-[53px] max-sm:top-auto max-sm:mt-0 max-sm:h-[22px] max-sm:w-[22px]" />
      <span aria-hidden="true" className="absolute -right-3 top-1/2 -mt-3 h-6 w-6 rounded-full bg-background max-sm:-right-[11px] max-sm:bottom-[53px] max-sm:top-auto max-sm:mt-0 max-sm:h-[22px] max-sm:w-[22px]" />

      <div className="contents max-sm:flex max-sm:items-center max-sm:gap-3 max-sm:px-[18px] max-sm:pb-3 max-sm:pt-[14px]">
        <span aria-hidden="true" className={`flex h-[52px] w-[52px] items-center justify-center border-2 text-seat max-sm:h-[44px] max-sm:w-[44px] ${SEAT_RING}`}>
          <PlusIcon className="h-5 w-5 shrink-0 max-sm:h-[18px] max-sm:w-[18px]" />
        </span>
        <div className="flex min-w-0 flex-[1_1_160px] flex-col border-l-2 border-dashed border-border pl-4 max-sm:flex-1 max-sm:border-l-0 max-sm:pl-0">
          <span className="font-mono text-mono-label uppercase text-seat-ink">Open seat</span>
          <h3 className="m-0 text-card-title font-semibold tracking-[-0.015em] text-foreground max-sm:leading-[1.25]">{seat.title}</h3>
          {sub ? <span className="text-[13px] text-muted-foreground sm:hidden">{sub}</span> : null}
          <AppLink
            href={product}
            data-seat-product
            className={`mt-1 flex min-w-0 items-center gap-[7px] text-[13px] text-copy no-underline hover:underline max-sm:hidden ${FOCUS}`}
          >
            <ProductTile slug={seat.product.slug} thumbnail={seat.product.thumbnail} size={32} />
            <span className="shrink-0 font-semibold">{seat.product.slug}</span>
            {sub ? <span className="truncate text-muted-foreground">· {sub}</span> : null}
          </AppLink>
        </div>
      </div>

      <div className="contents max-sm:mx-[18px] max-sm:flex max-sm:h-[64px] max-sm:items-center max-sm:justify-between max-sm:gap-[10px] max-sm:border-t-2 max-sm:border-dashed max-sm:border-border">
        <AppLink
          href={product}
          className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-[13px] text-foreground no-underline sm:hidden ${FOCUS}`}
        >
          <ProductTile slug={seat.product.slug} thumbnail={seat.product.thumbnail} size={32} />
          <span className="truncate font-semibold">{seat.product.slug}</span>
        </AppLink>
        <SeatButton action={action} />
      </div>
    </article>
  );
}

/** The ticket's button, in the state it was handed. */
function SeatButton({ action }: { action: SeatAction }) {
  if (action.state === "closed") {
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
