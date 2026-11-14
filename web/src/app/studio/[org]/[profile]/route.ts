// `/studio/{org}/{profile}` forwards (openproduct-redesign OPR-3, design §5).
//
// The listing's overview lived here. A published product's own page is its
// dashboard now, so this address goes to `/{slug}`; a draft, which has no
// public page, goes to its settings page (`./settings`), where the overview
// is. `studio/moved.ts` is the decision and says why each way.
//
// A ROUTE HANDLER, NOT A PAGE THAT CALLS `redirect`. SB0 recorded what the
// page form does under a `loading.tsx`: the response has already started as
// a `200`, and the "redirect" is a tag the client follows — `curl -I` gets a
// document. A handler's status line is the status line. `force-dynamic`
// keeps it from being prerendered; `no-store` because the answer depends on
// who is asking and on the listing's state at this moment.
//
// The layout beside this file wraps the steps under it, never this handler.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../../auth/auth";
import { LISTING_BASE_STATUS, listingBaseDestination, type MovedListing } from "../../moved";
import { fetchProfile } from "../../studio-api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ org: string; profile: string }> };

export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { org, profile } = await params;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  let listing: MovedListing = null;
  if (session) {
    // The maintainer's own read: only somebody who maintains the listing
    // learns where it is published. Everybody else is sent to the settings
    // page, which answers "not yours" the way it always has.
    const read = await fetchProfile(session.accessToken, org, profile);
    if (read.kind === "ok") listing = { visibility: read.data.profile.visibility, slug: read.data.profile.slug };
  }
  const to = listingBaseDestination(org, profile, listing, request.nextUrl.search);
  const response = NextResponse.redirect(new URL(to, request.url), LISTING_BASE_STATUS);
  response.headers.set("cache-control", "no-store");
  return response;
}
