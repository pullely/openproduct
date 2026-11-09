// GET /me/overlay?ids=… (openproduct host) — the personalisation overlay
// (openproduct-commons XP2).
//
// THE ONE DECISION IN THIS FILE: a visitor with no session gets **204 No
// Content**, which is exactly what a visitor gets when the service is down.
//
// That looks like a small thing and is the whole reliability argument. The
// requirement (XP-3) is that every public route renders correctly when the
// overlay fails. A failure branch that is taken only during a failure is a
// branch that is exercised only during a failure — which is to say, it is
// discovered broken by the outage it was written for. Collapsing "signed out"
// into it means the branch is taken by every anonymous visitor on every page
// load, forever. It cannot rot without somebody noticing immediately.
//
// It also means this route never distinguishes, in its response, between "you
// are not signed in" and "we could not tell" — which is the correct amount to
// say to a caller that is not allowed to act on the difference anyway.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../auth/auth";
import { OVERLAY_BOUND_KEYS, fetchOverlay, type OverlayBounds } from "../me-api";

/** Signed out, or failed. One response, one caller branch. */
function absent(): NextResponse {
  // no-store, and said explicitly: this is per-subject, and an intermediary
  // that cached it would hand one visitor another's answer. The response body
  // is empty, so this is belt-and-braces — but the header is what a cache
  // reads, and it must be right on the empty case too, because a 204 that got
  // cached would pin every later visitor to "no overlay".
  return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return absent();

  // EVERY BOUND THE PAGE SENT, AND ONLY THOSE. `overlayPath()` sends three
  // (`ids`, `follows`, `posts`) and core parses three; this hop used to read
  // `ids` alone, which is why follow buttons and comment votes never
  // personalised for anybody (OPP8). Built from the closed key list rather
  // than by naming three strings here, so a fourth bound cannot be added to
  // the browser and to core while quietly not arriving in between.
  //
  // NOT a forwarded query string: an inbound parameter this app does not know
  // about must not reach the platform just because somebody put it in a URL.
  const params = new URL(request.url).searchParams;
  const bounds = Object.fromEntries(
    OVERLAY_BOUND_KEYS.map((key) => [key, params.get(key)]),
  ) as unknown as OverlayBounds;
  const result = await fetchOverlay(session.accessToken, bounds);
  // `unauthorized` (a dead token) collapses here too. The caller is an
  // after-paint fetch on a page that is already correct; bouncing it into
  // sign-in would yank a reader off a page they are reading because a cookie
  // expired while they read it. The chip's own session read is what notices,
  // and it degrades to `Sign in` — the honest, non-disruptive outcome.
  if (result.kind !== "ok") return absent();

  return NextResponse.json(
    { data: { overlay: result.data.overlay } },
    { headers: { "cache-control": "no-store" } },
  );
}
