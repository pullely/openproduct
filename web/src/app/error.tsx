"use client";

// The root error boundary (openproduct-commons XP3).
//
// THE ONE THAT CATCHES WHAT NOTHING ELSE DID. Next renders this when a route
// segment throws and no closer boundary exists — which in practice means a
// bug, not a condition. So the copy does not speculate about the cause: we do
// not know what happened, and a page inventing an explanation is worse than
// one admitting it has none.
//
// WHAT IT DOES KNOW is the two things a visitor can act on: reloading this
// page might be enough, and the rest of the product is unaffected. `reset()`
// re-renders the segment without a full document load, which is the cheaper
// of the two and therefore the first action.
//
// NOTHING FROM `error` REACHES THE PAGE. A thrown message can carry a query
// fragment, a hostname, an internal path — text written by us for us, and
// occasionally text derived from somebody's input. Rendering it would put all
// of that on a screen a stranger is looking at, to no benefit: a visitor
// cannot act on a stack frame. The digest goes to the console, where an
// operator can correlate it with a log line.

import { PUBLIC_WAYS_ONWARD } from "./ui/failure";
import { RouteError } from "./ui/route-error";

// OB8 — `RouteError` carries the digest log this boundary always had, and
// reloads a page from the previous build into the current one.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} actions={PUBLIC_WAYS_ONWARD} />;
}
