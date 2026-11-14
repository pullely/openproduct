// `/studio` moved (openproduct-redesign OPR-3, design §5).
//
// The studio's landing was the list of the listings you maintain. That list
// is "Your products" on your profile now — the same read (`GET /me/listings`),
// with each product's stage beside it and the same two doors to a new one —
// so the old address goes there.
//
// A ROUTE HANDLER THAT ANSWERS 308, NOT A PAGE THAT CALLS `permanentRedirect`.
// SB0 recorded what the page form does: Next prerenders it, and what deploys
// is a `200` with an RSC payload the client router follows — a browser
// arrives, and `curl -I` gets a cacheable empty document. A handler's status
// line is the status line. `force-dynamic` keeps it from being prerendered;
// `no-store` because the destination is a personal page.
//
// WHAT DID NOT MOVE: a listing's own settings (`/studio/{org}/{profile}` and
// its steps) and the moderation pages stay where they are.
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** Where the list of your products lives now. */
export const STUDIO_MOVED_TO = "/me";

export function GET(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(new URL(STUDIO_MOVED_TO, request.url), 308);
  response.headers.set("cache-control", "no-store");
  return response;
}
