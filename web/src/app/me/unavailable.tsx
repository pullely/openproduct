import { PAGE_TITLE } from "../ui/design";
import { ME_LEDE, ME_MAIN, ME_TITLE_GAP, MeNav } from "./nav";

/**
 * The authenticated half's service-failure state (distinct from signed-out by
 * construction — me-api returns `unavailable` only for non-auth failures).
 * A page, not a redirect: bouncing an outage through /auth/start looped the
 * visitor through the authorization server for as long as the API was down.
 */
export function MeUnavailable({
  active,
}: {
  active: "profile" | "applications" | "saved" | "notifications";
}) {
  return (
    <main className={ME_MAIN}>
      <MeNav active={active} />
      <h1 className={`${PAGE_TITLE} ${ME_TITLE_GAP}`}>Temporarily unavailable</h1>
      <p className={`${ME_LEDE} max-w-[65ch]`}>
        This page could not be loaded right now. Reload in a moment.
      </p>
    </main>
  );
}
