// GET /api/builds/{cursor} (openproduct host) — the endless list's read
// (openproduct-calm CL2, CL-R7).
//
// THE SAME PAGE `/products/{cursor}` DRAWS, AS JSON. The front page's list
// continues on scroll in the browser, and the browser cannot call the
// gateway's origin without CORS, so this hop is same-origin by construction,
// exactly as `/api/search` is. The cursor is a PATH segment, so the edge
// caches each page as its own address (OPC-1), and it is opaque here as
// everywhere: handed to the directory, never decoded (OS-1).
//
// THE FLOOR HOLDS HERE TOO (IN3): a listing below it is withheld, as it is on
// the front page and on `/products/{cursor}`.
//
// NOTHING PERSONAL PASSES THROUGH IT. No session is read, no cookie is
// forwarded; the answer is the same for every visitor.
import { NextResponse } from "next/server";

import { frontPageEligible } from "@openproduct/contracts";

import { fetchDirectoryPage } from "../../../public-api";

/** The catalogue document's own TTL: a page here cannot usefully be fresher
 *  than the front page it continues. */
const CACHE_SECONDS = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ cursor: string }> }): Promise<NextResponse> {
  const { cursor } = await params;
  const page = await fetchDirectoryPage(cursor);
  if (page === null) {
    // A cursor the directory did not issue, or a directory that could not be
    // read: either way there is no page here, and the list keeps its plain
    // link. Not cached.
    return NextResponse.json({ error: { code: "unavailable", message: "No such page of builds" } }, { status: 404 });
  }
  return NextResponse.json(
    { builds: page.projects.filter(frontPageEligible), next: page.next },
    { headers: { "cache-control": `public, max-age=0, s-maxage=${CACHE_SECONDS}` } },
  );
}
