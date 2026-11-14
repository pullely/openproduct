import { PAGE_TITLE } from "../ui/design";
import { ACTIVITY_MAIN } from "./nav";

/**
 * The authenticated half's service-failure state (distinct from signed-out by
 * construction — me-api returns `unavailable` only for non-auth failures).
 * A page, not a redirect: bouncing an outage through /auth/start looped the
 * visitor through the authorization server for as long as the API was down.
 *
 * One title and one line in the narrow column, on every signed-in page: the
 * page that failed has nothing of its own to draw, so it draws no chrome of
 * its own either (openproduct-redesign OPR1 retired the strip of tabs that
 * used to sit above it).
 */
export function MeUnavailable() {
  return (
    <main className={ACTIVITY_MAIN}>
      <h1 className={PAGE_TITLE}>Temporarily unavailable</h1>
      <p className="m-0 max-w-[65ch] text-[15px] leading-[1.6] text-muted-foreground">
        This page could not be loaded right now. Reload in a moment.
      </p>
    </main>
  );
}
