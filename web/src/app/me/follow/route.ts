// POST /me/follow?kind=…&value=…&on=… (openproduct host) — the private act (FL0).
//
// ONE ROUTE FOR BOTH DIRECTIONS, unlike `/me/endorse` and `/me/unendorse`
// beside it. That pair is two routes because endorsing and withdrawing are two
// acts over an append-only row with different meanings to the integrity model;
// following and unfollowing are one control's two positions over a row that is
// simply there or not, and splitting them would be two files that always
// change together.
//
// Signed out, this bounces through sign-in and returns to the control by its
// fragment — the intent is the click, and making somebody declare their
// identity before expressing an intent loses the intent (XP2).
import { NextResponse, type NextRequest } from "next/server";

import { FOLLOW_KINDS, FOLLOW_VALUE_RE } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession, sanitizeReturnTo } from "../../auth/auth";
import { actAnswer } from "../act";
import { setFollow } from "../me-api";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "";
  const value = params.get("value") ?? "";
  // The outer bound only. Core resolves the target — a topic against the CT1
  // vocabulary, a handle against a public profile — and answers 404 when it
  // does not exist; this refuses only what could never be either.
  if (!(FOLLOW_KINDS as readonly string[]).includes(kind) || !FOLLOW_VALUE_RE.test(value)) {
    return actAnswer(request, "failed", { returnTo: "/topics" });
  }

  const returnTo = sanitizeReturnTo(params.get("return_to")) ?? "/topics";
  const on = params.get("on") === "1";
  // FR3 — the act rides the bounce, and ONLY in the `on` direction. A
  // signed-out page renders every follow control unfollowed (I6), so an unfollow
  // is not something a bounced visitor can have asked for; see `me/pending.ts`
  // for why a record that could subtract would be worse than no record.
  const pending = on ? ({ act: "follow", kind, value } as const) : undefined;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return actAnswer(request, "signin", { returnTo, ...(pending ? { pending } : {}) });
  }

  const result = await setFollow(session.accessToken, kind, value, on);
  if (result.kind === "unauthorized") {
    return actAnswer(request, "signin", { returnTo, ...(pending ? { pending } : {}) });
  }
  // A failure returns them to the page rather than to an error screen: the
  // control will simply still read "Follow", which is the truth.
  return actAnswer(request, "ok", { returnTo });
}
