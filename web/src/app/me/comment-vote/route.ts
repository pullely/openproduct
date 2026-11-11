// POST /me/comment-vote — the upvote on a comment (openproduct-launch DQ1).
//
// The control is static markup on an anonymous, edge-cached page, so it cannot
// know whether the visitor is signed in and must not (I6). The session is read
// here, once. Signed out, the vote bounces through sign-in and comes back to
// the comment it was cast on.
//
// THE SAME SHAPE AS `/me/follow`: a GET-safe verb never does this, the target
// and the direction are in the query, and the answer is a 303 back to where
// the person was standing.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../auth/auth";
import { actAnswer } from "../act";
import { setCommentVote } from "../me-api";

const POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only ever a path on this origin. An open redirect on a control every
 *  visitor can press is the cheapest phishing primitive there is. */
function safeReturn(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const postId = url.searchParams.get("post") ?? "";
  const on = url.searchParams.get("on") === "1";
  const returnTo = safeReturn(url.searchParams.get("return_to"));

  if (!POST_ID_RE.test(postId)) {
    return actAnswer(request, "ok", { returnTo });
  }

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    // Their intent survives the round trip — since FR3, the VOTE as well as
    // the comment they were on. Only the `on` direction: a signed-out page
    // draws every comment unvoted (I6).
    return actAnswer(request, "signin", {
      returnTo,
      ...(on ? { pending: { act: "comment-vote", postId } as const } : {}),
    });
  }

  // The RESULT is not read, and that is deliberate. A refusal here is a
  // self-vote or a comment that stopped existing, and neither is worth a
  // second page state on a control this small — the next render shows the
  // truth, which is the same answer a successful vote gets.
  await setCommentVote(session.accessToken, postId, on);
  return actAnswer(request, "ok", { returnTo });
}
