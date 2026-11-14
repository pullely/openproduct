import type { Metadata } from "next";

import { publicApexOrigin } from "../public-api";

import { HelpWantedView } from "./seats-view";

/**
 * Help wanted (openproduct-redesign OPR1; boards `Seats`, `PhoneSeats`) —
 * the address the header's third pill goes to: every open seat, as a ticket.
 * The body is `HelpWantedView` (`seats-view.tsx`), which the two filtered
 * addresses under `stage/` also draw.
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

export default function HelpWantedPage() {
  return <HelpWantedView />;
}
