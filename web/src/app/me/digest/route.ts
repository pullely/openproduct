// POST /me/digest (openproduct host) — subscribe to or leave the weekly
// digest (openproduct-commons LC5).
//
// ONE ROUTE, TWO DIRECTIONS, dispatched on a hidden field. The form posts
// from the settings page (`/me/settings`) and from the public digest page,
// and both land back where they came from — somebody who subscribes while
// reading week 34 wants to still be reading week 34.
//
// THE SESSION IS READ HERE, SERVER-SIDE. The control on the public digest
// page is static markup, identical for every visitor (OPC-1, I6): reading a
// session to render it would break the cache and leak who is looking.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession, sanitizeReturnTo } from "../../auth/auth";
import { setDigestSubscription } from "../me-api";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  // `sanitizeReturnTo` is the authority — same-host paths only, never /auth.
  const returnTo = sanitizeReturnTo(String(form.get("return_to") ?? "")) ?? "/me/settings";
  const subscribed = String(form.get("subscribed") ?? "") === "true";

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    // Back to where they were after sign-in, intent intact — the same posture
    // the save and endorse controls take.
    return NextResponse.redirect(
      new URL(`/signin?return_to=${encodeURIComponent(returnTo)}`, request.url),
      303,
    );
  }

  const result = await setDigestSubscription(session.accessToken, subscribed);
  // A FAILED WRITE STILL RETURNS THEM to the page rather than to an error
  // screen: the control re-renders from the standing the next read reports,
  // so a failure shows as "nothing changed" — which is what happened.
  const query = result.kind === "ok" ? (subscribed ? "?digest=on" : "?digest=off") : "?digest=failed";
  return NextResponse.redirect(new URL(`${returnTo}${query}`, request.url), 303);
}
