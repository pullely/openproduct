// POST /me/unendorse?slug=… (openproduct host) — withdraw the public act (EN1).
//
// Deliberately a separate route from `/me/save`, over a separate table, with
// a separate handler. The two are one keystroke apart and mean opposite
// things about privacy (OPC-3), and the day they share a code path is the day
// somebody's private bookmark is published by a refactor.
//
// Withdrawing works even after the listing went private — the mirror of the
// unsave rule. An endorsement you cannot withdraw because somebody else
// unpublished their listing is a public act you are stuck with, and
// withdrawing discloses nothing.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession, sanitizeReturnTo } from "../../auth/auth";
import { actAnswer } from "../act";
import { withdrawEndorsement } from "../me-api";

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  if (!SLUG_RE.test(slug)) return actAnswer(request, "failed", { returnTo: "/" });

  const returnTo = sanitizeReturnTo(params.get("return_to")) ?? `/${slug}`;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return actAnswer(request, "signin", { returnTo });
  }

  const result = await withdrawEndorsement(session.accessToken, slug);
  if (result.kind === "unauthorized") {
    return actAnswer(request, "signin", { returnTo });
  }
  // A failure returns them to the page rather than to an error screen: the
  // control will simply still read "Endorse", which is the truth.
  return actAnswer(request, "ok", { returnTo });
}
