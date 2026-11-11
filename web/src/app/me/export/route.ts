// GET /me/export — the person's own data, as a file (openproduct-consumers CS3).
//
// A plain link on /me, not a script: the browser asks, this route reads the
// session the other /me routes read, asks the API for the export with the
// session's bearer, and answers the document as an attachment. Nothing is
// rendered or kept; signed out, it goes to sign-in and back here.

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../auth/auth";
import { fetchExport } from "../me-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.redirect(new URL("/signin?return_to=%2Fme%2Fexport", request.url), 303);
  }
  const result = await fetchExport(session.accessToken);
  if (result.kind === "unauthorized") {
    return NextResponse.redirect(new URL("/signin?return_to=%2Fme%2Fexport", request.url), 303);
  }
  if (result.kind === "unavailable") {
    return new NextResponse("The export is not available right now. Try again in a minute.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(result.data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="openproduct-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
