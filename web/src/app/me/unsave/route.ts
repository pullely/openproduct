// POST /me/unsave?slug=… (openproduct host) — remove a bookmark (OH2).
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession, sanitizeReturnTo } from "../../auth/auth";
import { actAnswer } from "../act";
import { unsaveProduct } from "../me-api";
import { meSectionHref } from "../section";

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

/** The saved list: a section of `/me` since openproduct-redesign OPR1 (it
 *  was the page `/me/saved`, which still arrives here). */
const SAVED_SECTION = meSectionHref("saved");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  // XP2 — the product page's own Saved control unsaves in place and comes
  // back here; everywhere else keeps the saved list as the destination —
  // the Saved section of `/me`.
  const returnTo = sanitizeReturnTo(params.get("return_to")) ?? SAVED_SECTION;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return actAnswer(request, "signin", { returnTo, signInTo: SAVED_SECTION });
  }

  if (SLUG_RE.test(slug)) {
    const result = await unsaveProduct(session.accessToken, slug);
    if (result.kind === "unauthorized") {
      return actAnswer(request, "signin", { returnTo, signInTo: SAVED_SECTION });
    }
    if (result.kind === "unavailable") {
      return actAnswer(request, "failed", { returnTo: `${SAVED_SECTION}&error=save_failed` });
    }
  }
  return actAnswer(request, "ok", { returnTo });
}
