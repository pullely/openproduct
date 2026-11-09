"use client";

// A listing that threw (openproduct-commons XP3).
//
// CLOSER THAN THE ROOT BOUNDARY, and it earns its place by knowing one thing
// the root does not: the visitor was looking for a PRODUCT. So the way onward
// is the directory, where the thing they wanted is one search away — rather
// than the home page, which is where the root boundary would have sent them
// to start again.

import { RouteError } from "../ui/route-error";

// OB8 — logs the error, and reloads a page from the previous build.
export default function ListingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      what="This build's page stopped part way through. Reloading may be enough; the rest of the directory is unaffected."
      actions={[{ label: "Open builds", href: "/" }]}
    />
  );
}
