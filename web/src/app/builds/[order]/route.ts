// GET /builds/{order} (openproduct host) — the old addresses of the list's
// orders, redirected (openproduct-redesign OPR1; design.md §5).
//
// `/builds/newest` and `/builds/upvoted` were two of the list's orders, each
// its own page. The redesign makes them sorts of the Products page:
// `/products?sort=newest`, `/products?sort=upvoted`. `/builds/roles` is the
// Help wanted section and is redirected from the edge (`next.config.mjs`)
// before this handler is reached; it is answered here too, so the mapping is
// whole in one function (`buildOrderRedirect`) and a config change cannot
// strand it.
//
// A ROUTE HANDLER, NOT A PAGE, and that is SB0's lesson rather than a taste:
// a `page.tsx` whose whole body is a redirect to a fixed path is prerendered,
// and what production then serves is `200` with an empty body instead of a
// status a crawler can read (`route-census.test.ts` forbids it). A handler
// answers each request with the status itself. 308, so the method and the
// address's standing both carry: these were public, linked, sitemap-listed
// pages, and the move is permanent.
//
// A SEGMENT THAT WAS NEVER AN ORDER IS A 404, as it was when a page lived
// here.
//
// NOTHING PERSONAL PASSES THROUGH IT. No session is read and no cookie is
// forwarded; the answer is the same for every visitor.
import { NextResponse } from "next/server";

import { buildOrderRedirect } from "../../feed/products";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ order: string }> }): Promise<NextResponse> {
  const { order } = await params;
  const target = buildOrderRedirect(order);
  if (target === null) {
    return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.redirect(new URL(target, request.url), 308);
}
