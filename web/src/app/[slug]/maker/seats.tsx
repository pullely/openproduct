"use client";

import * as React from "react";

import { consoleOrigin } from "@/lib/platform";

import { useOpeningRequested } from "../../ui/use-overlay";
import { BTN_SEAT, FOCUS } from "../../ui/design";
import { AppLink } from "../../ui/link";

import { seatFormPath } from "./gate";
import { NEW_SEAT, setSeatForm, useMaker } from "./use-maker";

/** A seat as the cached page holds it: the words its form starts with. */
export interface SeatOnPage {
  id: string;
  title: string;
  description: string | null;
  commitment: string | null;
}

const LINK = `tap-h inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-[13px] font-semibold text-link no-underline hover:underline hover:underline-offset-[3px] ${FOCUS}`;

/**
 * "Add a seat" (boards `Product`, `ProductIdea`): the control in the head of
 * a seats card. Crew only, on Manage.
 *
 * IT OPENS THE SEAT FORM IN PLACE (`SeatFormSlot`, on the Crew tab — or on an
 * idea's one page). A seat is a role opening: a role, what the person would
 * do, the time it asks for. With `href` (the side card on another tab's
 * page) it is a link to where the form is, and opens it on the way.
 */
export function AddSeatLink({ slug, href }: { slug: string; href?: string }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  if (href) {
    return (
      <AppLink href={href} data-add-seat onClick={() => setSeatForm(slug, NEW_SEAT)} className={LINK}>
        Add a seat
      </AppLink>
    );
  }
  return (
    <button type="button" data-add-seat onClick={() => setSeatForm(slug, NEW_SEAT)} className={LINK}>
      Add a seat
    </button>
  );
}

/**
 * A seat's one control.
 *
 *   a visitor          "Take the seat": the join door on the Orunbase console
 *                      (the existing flow; applying needs sign-in, and that
 *                      page handles it). No door, no button.
 *   who already asked  "Requested", from the overlay (`useOpeningRequested`),
 *                      after load — the cached page says "Take the seat" to
 *                      everybody.
 *   the crew, Manage   "Edit seat": opens the seat's form in place.
 *
 * `quiet` is the side card's text link ("Take it" / "Edit"); it is on a page
 * that does not hold the form, so it goes to where the form is (`idea` says
 * which page that is) and opens it on the way.
 */
export function SeatAction({
  slug,
  openingId,
  title,
  joinLinkRef,
  quiet = false,
  idea = false,
}: {
  slug: string;
  openingId: string;
  title: string;
  joinLinkRef: string | null;
  quiet?: boolean;
  idea?: boolean;
}) {
  const { managing } = useMaker(slug);
  const requested = useOpeningRequested(openingId);
  const quietClass =
    "tap shrink-0 justify-end text-[13px] font-semibold text-seat-ink no-underline hover:underline hover:underline-offset-[3px]";

  if (managing) {
    return quiet ? (
      <AppLink
        href={seatFormPath(slug, idea)}
        data-edit-seat
        onClick={() => setSeatForm(slug, openingId)}
        className={quietClass}
      >
        Edit
        <span className="sr-only">: {title}</span>
      </AppLink>
    ) : (
      <button
        type="button"
        data-edit-seat
        onClick={() => setSeatForm(slug, openingId)}
        className={`${BTN_SEAT} cursor-pointer border-0 max-sm:w-full ${FOCUS}`}
      >
        Edit seat
        <span className="sr-only">: {title}</span>
      </button>
    );
  }
  if (requested) {
    return (
      <span
        data-seat-requested
        className={
          quiet
            ? "shrink-0 text-[13px] font-semibold text-seat-ink"
            : "inline-flex h-[40px] shrink-0 items-center justify-center rounded-full bg-seat-soft px-[18px] text-[15px] font-semibold text-seat-ink max-sm:h-[44px] max-sm:w-full"
        }
      >
        Requested
      </span>
    );
  }
  if (!joinLinkRef) return null;
  return (
    <a
      href={`${consoleOrigin()}/join/${joinLinkRef}?from=openproduct`}
      className={quiet ? quietClass : `${BTN_SEAT} max-sm:w-full ${FOCUS}`}
    >
      {quiet ? "Take it" : "Take the seat"}
      <span className="sr-only">: {title}</span>
    </a>
  );
}

// ─── the crew's form, fetched for the crew ─────────────────────────────────

const SeatFormSlotBody = React.lazy(() => import("./seat-form").then((module) => ({ default: module.SeatFormSlotBody })));
const SeatsStarterBody = React.lazy(() => import("./seat-form").then((module) => ({ default: module.SeatsStarterBody })));

/**
 * Where a seat's form opens: under the seat's own row (`seat`), or at the end
 * of the card for a new one (`seat` null). Crew only, on Manage; nothing on
 * the server and nothing for anybody else.
 *
 * A GATE: the form itself (`seat-form.tsx`) is fetched once the overlay has
 * said "crew" and the switch is on Manage, so a visitor's browser never
 * downloads a form it can never open.
 */
export function SeatFormSlot({ slug, seat, idea = false }: { slug: string; seat: SeatOnPage | null; idea?: boolean }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  return (
    <React.Suspense fallback={null}>
      <SeatFormSlotBody slug={slug} seat={seat} idea={idea} />
    </React.Suspense>
  );
}

/**
 * The seats card for a page that has no open seat to show (an idea's page,
 * where the public card is absent): the head and "Add a seat", and the form.
 * Crew only, on Manage — a visitor's page has no card where nothing is open.
 */
export function SeatsStarter({ slug }: { slug: string }) {
  const { managing } = useMaker(slug);
  if (!managing) return null;
  return (
    <React.Suspense fallback={null}>
      <SeatsStarterBody slug={slug} />
    </React.Suspense>
  );
}
