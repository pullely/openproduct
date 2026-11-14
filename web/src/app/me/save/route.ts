// POST /me/save?slug=… (openproduct host) — the product page's save button
// (OH2). The button itself is STATIC markup on the anonymous page — identical
// for every visitor — and the session is read only here, on the POST.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession, sanitizeReturnTo } from "../../auth/auth";
import { actAnswer } from "../act";
import { saveProduct } from "../me-api";
import { meSectionHref } from "../section";

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

/** The saved list: the Saved section of `/me` (it was the page `/me/saved`). */
const SAVED_SECTION = meSectionHref("saved");

export async function POST(request: NextRequest): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? "";
  if (!SLUG_RE.test(slug)) return actAnswer(request, "failed", { returnTo: "/" });

  // XP2 — where to land afterwards. The default is unchanged (the saved
  // list, a section of `/me` since openproduct-redesign OPR1 — OH2's
  // original behaviour, which is right when the save came from a page
  // that is ABOUT saving). The product page passes its own path with a `#save`
  // fragment instead: since XP2 the control reflects its own state in place,
  // so navigating away from a page somebody was reading would be taking
  // something from them rather than confirming something for them.
  //
  // `sanitizeReturnTo` is the authority — same-host paths only, never /auth.
  const returnTo = sanitizeReturnTo(params.get("return_to")) ?? SAVED_SECTION;

  // FR3 — the act rides the bounce. The comment below used to end "clicks Save
  // again with their intent intact", which was the honest description of a
  // round trip that returned the address and dropped the act; now the act
  // comes back too and there is nothing left to click.
  const pending = { act: "save", slug } as const;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    // Back to the product page after sign-in, rather than to the root.
    return actAnswer(request, "signin", { returnTo, signInTo: `/${slug}`, pending });
  }

  const result = await saveProduct(session.accessToken, slug);
  if (result.kind === "unauthorized") {
    return actAnswer(request, "signin", { returnTo, signInTo: `/${slug}`, pending });
  }
  if (result.kind === "unavailable") {
    return actAnswer(request, "failed", { returnTo: `${SAVED_SECTION}&error=save_failed` });
  }
  return actAnswer(request, "ok", { returnTo });
}
