// `/studio/{org}/{profile}/discussions` forwards to Talk (openproduct-redesign
// OPR-4, design §5).
//
// The maintainer's list of their listing's threads lived here. Talk on the
// product's own page is that list now — with the kinds, the private threads
// and Mark resolved this page never had — so the address goes there:
// `/{slug}/talk` for a published product (`/{slug}#talk` for an idea). A
// draft has no public page and goes to its settings page, whose Discussions
// card is where a thread is locked or an answer marked; those acts still
// post to `./actions`.
//
// A ROUTE HANDLER, for the reason `../route.ts` is one: its status line is
// the status line. 307, `no-store`: where it goes depends on who is asking
// and on the listing's state now.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../../../auth/auth";
import { LISTING_BASE_STATUS, listingDiscussionsDestination } from "../../../moved";
import { fetchProfile } from "../../../studio-api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ org: string; profile: string }> };

export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { org, profile } = await params;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  let listing: Parameters<typeof listingDiscussionsDestination>[2] = null;
  if (session) {
    // The maintainer's own read: only somebody who maintains the listing
    // learns where it is published.
    const read = await fetchProfile(session.accessToken, org, profile);
    if (read.kind === "ok") {
      listing = {
        visibility: read.data.profile.visibility,
        slug: read.data.profile.slug,
        stage: (read.data.profile as { stage?: string | null }).stage ?? null,
      };
    }
  }
  const to = listingDiscussionsDestination(org, profile, listing, request.nextUrl.search);
  const response = NextResponse.redirect(new URL(to, request.url), LISTING_BASE_STATUS);
  response.headers.set("cache-control", "no-store");
  return response;
}
