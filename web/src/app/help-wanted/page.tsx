import type { Metadata } from "next";

import { FEED_PAGE_SUBTITLE } from "@openproduct/contracts";

import BuildsInOrderPage from "../builds/[order]/page";
import { publicApexOrigin } from "../public-api";

/**
 * Help wanted (openproduct-redesign OPR1) — the address the header's third
 * pill goes to.
 *
 * WHAT `/builds/roles` RENDERED, AT THE SECTION'S OWN ADDRESS. The builds
 * asking for people were one of the list's orders under `/builds/`; the
 * redesign makes them a section (board `Seats`). Until that page is rebuilt
 * to its board, this renders the Roles order's own body, unchanged — the
 * same component, asked for the same order — and `/builds/roles` redirects
 * here from the edge (`next.config.mjs`), so there is one address for it.
 *
 * Static and cacheable as the order pages are: no query string is read and
 * no actor is resolved (I6).
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Help wanted",
  description: FEED_PAGE_SUBTITLE,
  ...(publicApexOrigin() ? { alternates: { canonical: `${publicApexOrigin()}/help-wanted` } } : {}),
};

export default function HelpWantedPage() {
  return <BuildsInOrderPage params={Promise.resolve({ order: "roles" })} />;
}
