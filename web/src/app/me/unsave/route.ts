// POST /me/unsave?slug=… (openproduct host) — remove a bookmark (OH2).
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession, sanitizeReturnTo } from "../../auth/auth";
import { actAnswer } from "../act";
import { unsaveProduct } from "../me-api";

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  // XP2 — the product page's own Saved control unsaves in place and comes
  // back here; everywhere else keeps the saved list as the destination.
  const returnTo = sanitizeReturnTo(params.get("return_to")) ?? "/me/saved";
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return actAnswer(request, "signin", { returnTo, signInTo: decodeURIComponent("%2Fme%2Fsaved") });
  }

  if (SLUG_RE.test(slug)) {
    const result = await unsaveProduct(session.accessToken, slug);
    if (result.kind === "unauthorized") {
      return actAnswer(request, "signin", { returnTo, signInTo: decodeURIComponent("%2Fme%2Fsaved") });
    }
    if (result.kind === "unavailable") {
      return actAnswer(request, "failed", { returnTo: "/me/saved?error=save_failed" });
    }
  }
  return actAnswer(request, "ok", { returnTo });
}
