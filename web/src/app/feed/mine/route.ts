// GET /feed/mine — everything personal the feed draws, in one answer
// (openproduct-redesign OPR-3; board `Feed`).
//
// `/` is one cached document, the same bytes for every visitor (I6). What is
// the reader's own — the left column's "Your products", and the products and
// people they follow — is read here, after paint, by `feed/feed-you.tsx`.
//
// THE OVERLAY'S RULE, KEPT (`me/overlay/route.ts`): no session, a dead token
// and a failed read are ONE answer, `204 No Content`. The caller is an
// after-paint fetch on a page that is already correct, and may not act on
// the difference.
//
// NEVER CACHED. Every response says `no-store`, the empty one included: this
// is per-subject, and an intermediary that kept it would hand one visitor
// another's answer.
//
// "YOUR PRODUCTS" IS THE STUDIO'S OWN READ (`/me/listings`: every listing the
// subject maintains), narrowed to the ones with a public page — *Manage*
// opens that page. A listing has no stage of its own in that read, so each
// product's public document supplies the stage, the milestone counts and the
// open seats: a 60s-cached anonymous read per product, bounded by
// `MY_PRODUCTS_LIMIT`. A product whose document cannot be read is left out
// rather than drawn with a stage nobody checked.

import { NextResponse, type NextRequest } from "next/server";

import { thumbnailOf } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../auth/auth";
import { fetchMyListings } from "../../me/listings";
import { fetchFollowing } from "../../posts/posts-api";
import { fetchPublicProfile } from "../../public-api";

import { MY_PRODUCTS_LIMIT, type FeedMine, type MyFeedProduct } from "../feed-copy";

const NO_STORE = { "cache-control": "no-store" } as const;

/** Signed out, or failed. One response, one caller branch. */
function absent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return absent();

  const [following, listings] = await Promise.all([
    fetchFollowing(session.accessToken),
    fetchMyListings(session.accessToken),
  ]);
  if (following.kind !== "ok") return absent();

  // The listings failing costs "Your products" and nothing else: the profile
  // card and the Following list are still true.
  const mineSlugs =
    listings.kind === "ok"
      ? listings.data.listings
          .filter((listing) => listing.visibility === "public")
          .slice(0, MY_PRODUCTS_LIMIT)
          .map((listing) => listing.slug)
      : [];
  const documents = await Promise.all(mineSlugs.map((slug) => fetchPublicProfile(slug)));
  const products: MyFeedProduct[] = [];
  for (const profile of documents) {
    if (!profile) continue;
    products.push({
      slug: profile.slug,
      stage: profile.stage,
      milestoneCounts: profile.milestoneCounts ?? null,
      logo: thumbnailOf(profile.media),
      openSeats: profile.roleOpenings.filter((opening) => opening.status === "open").length,
    });
  }

  const data: FeedMine = { products, following: following.data.following };
  return NextResponse.json({ data }, { headers: NO_STORE });
}
