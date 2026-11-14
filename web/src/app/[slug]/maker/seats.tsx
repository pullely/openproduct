"use client";

import { consoleOrigin } from "@/lib/platform";

import { useOpeningRequested } from "../../ui/use-overlay";
import { BTN_SEAT, FOCUS } from "../../ui/design";
import { AppLink } from "../../ui/link";

import { studioSeatsPath } from "./model";
import { useMaker } from "./use-maker";

/**
 * "Add a seat" (boards `Product`, `ProductIdea`): the link in the head of the
 * Open seats card. Crew only, on Manage.
 *
 * IT GOES TO THE STUDIO'S PEOPLE STEP. A seat (a role opening) is written
 * through routes addressed by the workspace and listing ids, and the only web
 * client for them is the studio's own form handler; this page links to that
 * step instead of carrying a second copy of its form. The ids in the address
 * come from the overlay's crew answer, in the crew's own browser — they are
 * never in the cached page.
 */
export function AddSeatLink({ slug }: { slug: string }) {
  const { crew, managing } = useMaker(slug);
  if (!managing || crew === null) return null;
  return (
    <AppLink
      href={studioSeatsPath(crew)}
      data-add-seat
      className={`tap-h inline-flex items-center text-[13px] font-semibold text-link no-underline hover:underline hover:underline-offset-[3px] ${FOCUS}`}
    >
      Add a seat
    </AppLink>
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
 *   the crew, Manage   "Edit seat", to the studio's People step.
 *
 * `quiet` is the side card's text link ("Take it" / "Edit"); otherwise the
 * teal pill.
 */
export function SeatAction({
  slug,
  openingId,
  title,
  joinLinkRef,
  quiet = false,
}: {
  slug: string;
  openingId: string;
  title: string;
  joinLinkRef: string | null;
  quiet?: boolean;
}) {
  const { crew, managing } = useMaker(slug);
  const requested = useOpeningRequested(openingId);
  const quietClass =
    "tap shrink-0 justify-end text-[13px] font-semibold text-seat-ink no-underline hover:underline hover:underline-offset-[3px]";

  if (managing && crew !== null) {
    return (
      <AppLink href={studioSeatsPath(crew)} data-edit-seat className={quiet ? quietClass : `${BTN_SEAT} max-sm:w-full ${FOCUS}`}>
        {quiet ? "Edit" : "Edit seat"}
        <span className="sr-only">: {title}</span>
      </AppLink>
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
