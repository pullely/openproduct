// GET /auth/signout (openproduct host) — clear the session (OH1).
//
// A GET on purpose: idempotent, linkable from static chrome, and the worst a
// cross-site trigger can do is sign someone out — an annoyance, not an
// authority change. Grant revocation on the AS side rides the console's
// sessions surface (the grant is listed there as "openproduct.live (MCP)",
// labeled identity-only by OI3).
//
// AC2c — AND FOR THE PASSWORD DOOR IT REVOKES, which is a stronger act than
// clearing a cookie and worth being clear about. A platform session ends here
// only in this browser; an openproduct session ends EVERYWHERE, because the
// row it points at is marked revoked and the gateway refuses it on the next
// request from any device. That asymmetry is not a wrinkle to smooth over —
// it falls out of the two doors' different authorities, and `SIGN_OUT_NOTE`
// says so on the surface that has the word.
import { NextResponse, type NextRequest } from "next/server";

import { SIGN_OUT_PATH } from "@openproduct/contracts";

import { openproductApiBase } from "@/lib/platform";
import {
  SESSION_COOKIE,
  SESSION_HINT_COOKIE,
  cookieAttributes,
  decodeSession,
  hintAttributes,
  sessionKind,
} from "../auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);

  // THE COOKIE IS CLEARED WHATEVER HAPPENS UPSTREAM. Somebody who clicked
  // sign out is signed out of this browser even if the gateway is down; what
  // a failure costs is the row living until it expires, which the sweep
  // collects. Reporting an error here would leave a person looking at a
  // failure for something that did work.
  if (session && sessionKind(session) === "openproduct") {
    try {
      await fetch(`${openproductApiBase()}${SIGN_OUT_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.accessToken}`,
        },
        body: "{}",
      });
    } catch {
      // Deliberately swallowed — see above.
    }
  }

  const res = NextResponse.redirect(new URL("/", request.url));
  res.cookies.set(SESSION_COOKIE, "", cookieAttributes(0));
  // CLEARED IN THE SAME BREATH. A hint that survived a sign-out would paint
  // an account chip for somebody who no longer has an account here — the
  // failure this whole mechanism has to not have, and the reason its lifetime
  // is pinned to the session cookie's at every site that writes either.
  res.cookies.set(SESSION_HINT_COOKIE, "", hintAttributes(0));
  return res;
}
