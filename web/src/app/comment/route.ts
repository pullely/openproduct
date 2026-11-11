// The comment box's act (openproduct-launch DQ0b; the JSON answer at
// openproduct-performance OPP14).
//
// ONE ROUTE, TWO ANSWERS, the shape `me/act.ts` gave the four toggles. A
// browser posting the form gets what it always got: a `303` back to the
// listing's discussion with `?commented=ok|invalid|failed`, or through
// sign-in with the draft kept. A caller that says `accept: application/json`
// — `ui/conversation-live.tsx`, after it has already drawn the comment —
// gets a status and a body it can settle or fail that comment with:
//
//     201  { data: { postId, threadId } }   drawn, and now real
//     401                                   the hint was stale: post the form
//     422  { error: { message } }           refused by the rules
//     502  { error: { message } }           could not be made right now
//
// The session is read ONCE, here, and never in the section that renders
// (I6). The body is bounded before it reaches the network, whichever answer
// is on the way back.

import { NextResponse, type NextRequest } from "next/server";

import { MAX_POST_BODY, isChosenThreadTag } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../auth/auth";
import { wantsJson } from "../me/act";
import { createComment } from "../me/me-api";

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

const NO_STORE = { "cache-control": "no-store" } as const;

/** What the JSON answer says when it says no — the same two sentences the
 *  redirect's `?commented=…` used to spell out after the reload. */
const COMMENT_INVALID_MESSAGE = "That comment was empty or too long to post.";
const COMMENT_FAILED_MESSAGE =
  "The discussion may be closed, or your account may not be eligible yet.";

function refused(status: number, message: string): NextResponse {
  return NextResponse.json({ error: { message } }, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const json = wantsJson(request);
  const form = await request.formData();
  const slug = String(form.get("slug") ?? "");
  if (!SLUG_RE.test(slug)) {
    return json ? refused(422, COMMENT_INVALID_MESSAGE) : NextResponse.redirect(new URL("/", request.url), 303);
  }

  const back = (query: string) =>
    NextResponse.redirect(new URL(`/${slug}${query}`, request.url), 303);
  const signIn = () =>
    json
      ? new NextResponse(null, { status: 401, headers: NO_STORE })
      : NextResponse.redirect(
          new URL(`/signin?return_to=${encodeURIComponent(`/${slug}#discussion`)}`, request.url),
          303,
        );

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return signIn();

  const body = String(form.get("body") ?? "").trim();
  if (body.length === 0 || body.length > MAX_POST_BODY) {
    return json ? refused(422, COMMENT_INVALID_MESSAGE) : back("?commented=invalid#discussion");
  }

  // PP0 — an optional tag; anything that is not one of the six is dropped
  // here rather than refused, because a stale radio is not a reason to lose
  // a comment somebody wrote.
  const rawTag = String(form.get("tag") ?? "");
  const tag = isChosenThreadTag(rawTag) ? rawTag : null;
  const result = await createComment(session.accessToken, { slug, body, tag });
  if (result.kind === "unauthorized") return signIn();
  if (result.kind !== "ok") {
    return json ? refused(502, COMMENT_FAILED_MESSAGE) : back("?commented=failed#discussion");
  }

  if (json) {
    return NextResponse.json(
      { data: { postId: result.data.postId, threadId: result.data.threadId } },
      { status: 201, headers: NO_STORE },
    );
  }
  return back("?commented=ok#discussion");
}
