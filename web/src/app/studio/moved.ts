// Where a listing's base address goes (openproduct-redesign OPR-3, design §5).
//
// `/studio/{org}/{profile}` was the listing's overview. The product's own
// page is its dashboard now (owner rule 5), so the address forwards:
//
//   a PUBLISHED listing   → `/{slug}`, the product's page
//   a DRAFT               → `/studio/{org}/{profile}/settings`. A draft has no
//                           public page; its overview is that settings page,
//                           unchanged, one segment down
//   anything unreadable   → the settings page too (signed out, not yours,
//                           the service down): that page already answers each
//                           of those — sign-in, the hiding 404, "try again" —
//                           and this must not answer them a second way
//
// PURE, so the decision is assertable without a request (the web test lane
// does not run Next). `route.ts` beside the listing's layout is the adapter.
//
// The query is carried to the settings page (an old link with `?notice=`
// still says what it said) and dropped on the way to the public page, which
// is cached and reads none.

import { listingSettingsPath } from "@openproduct/contracts";

/** What the redirect needs to know about the listing; `null` when it could
 *  not be read for any reason. */
export type MovedListing = { visibility: string; slug: string } | null;

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

export function listingBaseDestination(
  org: string,
  profile: string,
  listing: MovedListing,
  search = "",
): string {
  if (listing && listing.visibility === "public" && SLUG_RE.test(listing.slug)) return `/${listing.slug}`;
  return `${listingSettingsPath(org, profile)}${search}`;
}

/**
 * The status the forward answers with: 307, not 308.
 *
 * Where it goes depends on whether the listing is published TODAY. A
 * permanent redirect is kept by a browser, and a listing that is later
 * unpublished would go on being sent to a public page that is not there.
 */
export const LISTING_BASE_STATUS = 307;
