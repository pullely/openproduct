"use client";

import * as React from "react";

import { FailurePanel, type FailureAction } from "./failure";
import { STALE_DEPLOY_NOTE, claimReload, isStaleDeployError } from "@/lib/stale-deploy";

/**
 * Every route's error boundary, in one place (openproduct-open-builds OB8).
 *
 * The boundaries kept their own words — each says what was lost where it
 * failed — and gained the two things none of them had all of:
 *
 *   THE ERROR IS LOGGED. `people/error.tsx` discarded it, which is why its
 *   failure could only be reproduced, never read. The digest is the one
 *   handle an operator has back to the server log; it is a hash, safe to say.
 *
 *   A PAGE FROM THE PREVIOUS BUILD RELOADS INTO THE CURRENT ONE. A missing
 *   chunk is a stale deploy (`lib/stale-deploy.ts` says why at length), and a
 *   reload is the whole remedy — once per address per minute, so a chunk
 *   broken in the current build still shows the panel. *Try again* on a
 *   stale page reloads too: re-rendering asks for the same missing chunk.
 */
export function RouteError({
  error,
  reset,
  what,
  actions,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  what?: string | undefined;
  /** The ways onward after *Try again*, which this component supplies. */
  actions: readonly FailureAction[];
}) {
  const stale = isStaleDeployError(error);
  const [reloading, setReloading] = React.useState(false);

  React.useEffect(() => {
    console.error("openproduct route error", error.digest ?? "(no digest)", stale ? "stale-deploy" : error.name);
    if (!stale) return;
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    if (claimReload(storage, window.location.pathname, Date.now())) {
      setReloading(true);
      window.location.reload();
    }
  }, [error, stale]);

  if (reloading) {
    return (
      <p role="status" className="mx-auto mt-16 max-w-[620px] px-5 text-[15px] text-muted-foreground">
        {STALE_DEPLOY_NOTE}
      </p>
    );
  }

  const tryAgain = stale ? () => window.location.reload() : reset;
  return <FailurePanel kind="broken" what={what} actions={[{ label: "Try again", onClick: tryAgain }, ...actions]} />;
}
