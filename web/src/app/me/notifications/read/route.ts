// POST /me/notifications/read — the one read action (openproduct-launch NF0).
//
// A ROUTE HANDLER RATHER THAN A SERVER ACTION, like every other act on this
// estate: a form, a 303, no client JS, and a session read exactly once in the
// place that does the write.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../../auth/auth";
import { markInboxRead } from "../../me-api";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const back = new URL("/me/notifications", request.url);
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.redirect(
      new URL("/signin?return_to=%2Fme%2Fnotifications", request.url),
      303,
    );
  }

  // THE RESULT IS NOT READ. A failed mark leaves the badge where it was, which
  // the next render shows — and a second page state for "we could not mark
  // your notifications read" is a sentence nobody needs.
  await markInboxRead(session.accessToken);
  return NextResponse.redirect(back, 303);
}
