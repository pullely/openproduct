// POST /me/react?post=ppo_…&reaction=useful|would_use|impressive|curious|none
// (openproduct host) — my reaction on a product post (openproduct-redesign
// OPR-3).
//
// ONE ROUTE FOR SET, REPLACE AND CLEAR, like `/me/follow`: a reaction is one
// control's positions over a row that is there or not. The address names the
// reaction to hold AFTER the press (`none` clears).
//
// Signed out, this bounces through sign-in and returns to the control by its
// fragment; the reaction rides the bounce (`me/pending.ts`) when it SETS one.
// A clear never rides it: a signed-out page draws nobody's reaction (I6), so
// a clear is not something a bounced visitor can have asked for.
//
// THE ANSWER IS `me/act.ts`'s, with one addition for the enhanced caller: a
// `409` when the post is the caller's own. That is not a failure and not a
// sign-in; the control reverts and says nothing. A form gets the same 303
// back either way — the page it lands on shows the truth.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession, sanitizeReturnTo } from "../../auth/auth";
import { clearReaction, setReaction } from "../../posts/posts-api";
import { reactOutcome, readReactAct } from "../../posts/react-act";
import { actAnswer, wantsJson } from "../act";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const returnTo = sanitizeReturnTo(params.get("return_to")) ?? "/";
  const act = readReactAct(params);
  // Nothing this route can do with it. Back to the page, which is unchanged.
  if (!act) return actAnswer(request, "failed", { returnTo });

  const pending =
    act.reaction !== null ? ({ act: "react", postId: act.postId, reaction: act.reaction } as const) : undefined;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return actAnswer(request, "signin", { returnTo, ...(pending ? { pending } : {}) });
  }

  const result =
    act.reaction === null
      ? await clearReaction(session.accessToken, act.postId)
      : await setReaction(session.accessToken, act.postId, act.reaction);
  const outcome = reactOutcome(result);
  if (outcome === "signin") {
    return actAnswer(request, "signin", { returnTo, ...(pending ? { pending } : {}) });
  }
  if (outcome === "own-post" && wantsJson(request)) {
    return new NextResponse(null, { status: 409, headers: { "cache-control": "no-store" } });
  }
  if (outcome === "failed" && wantsJson(request)) {
    return actAnswer(request, "failed", { returnTo });
  }
  // A form is returned to the page whatever happened: the control will read
  // what the server holds, which is the truth.
  return actAnswer(request, "ok", { returnTo });
}
