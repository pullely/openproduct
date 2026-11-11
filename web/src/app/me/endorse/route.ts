// POST /me/endorse?slug=… (openproduct host) — the PUBLIC act (EN1).
//
// Deliberately a separate route from `/me/save`, over a separate table, with
// a separate handler. The two are one keystroke apart and mean opposite
// things about privacy (OPC-3), and the day they share a code path is the day
// somebody's private bookmark is published by a refactor.
//
// Signed out, this bounces through sign-in and returns to the control by its
// fragment — the intent is the click, and making somebody declare their
// identity before expressing an intent loses the intent (XP2).
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession, sanitizeReturnTo } from "../../auth/auth";
import { actAnswer } from "../act";
import { endorseProduct } from "../me-api";

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  if (!SLUG_RE.test(slug)) return actAnswer(request, "failed", { returnTo: "/" });

  const returnTo = sanitizeReturnTo(params.get("return_to")) ?? `/${slug}`;
  // FR3 — the act rides the bounce, so they come back having upvoted rather
  // than looking at the arrow they already pressed.
  const pending = { act: "endorse", slug } as const;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return actAnswer(request, "signin", { returnTo, pending });
  }

  const result = await endorseProduct(session.accessToken, slug);
  if (result.kind === "unauthorized") {
    return actAnswer(request, "signin", { returnTo, pending });
  }
  // A failure returns them to the page rather than to an error screen: the
  // control will simply still read "Endorse", which is the truth.
  return actAnswer(request, "ok", { returnTo });
}
