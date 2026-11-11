// GET /me/resume — the act, performed on the other side of sign-in (FR3).
//
// Every signed-out act bounces through the sign-in door. Since `me/pending.ts`
// the bounce carries a record of WHAT was being attempted, and this is where
// that record is spent: the visitor arrives here with a session, the act is
// performed as them, the record is destroyed, and they are sent on to the page
// they were reading — at the control's own fragment, which is where they were
// looking when they pressed it.
//
// ─── ONE READER, BOTH DOORS, NEITHER DOOR CHANGED ────────────────────────
//
// The platform round trip stores its destination in `op_oauth_return` and the
// callback redirects there. The password modal calls `location.assign` on the
// same value. Both already carry a `return_to` end to end, so putting this
// route IN that value is what lets Orunbase sign-in and password sign-in both
// resume without either one learning a new parameter. `/auth/*` could not have
// been the address: `sanitizeReturnTo` refuses that prefix on purpose, and it
// is right to.
//
// ─── A GET THAT WRITES, AND WHY THAT IS THE RIGHT SHAPE HERE ─────────────
//
// It is reached only as a `Location:` header. Nothing links to it, so nothing
// prefetches it. It does nothing at all without a record, the record can only
// have been written by a same-origin POST from one of the six act controls
// (`me/pending.ts` holds that guard), the record can only ADD, and it is
// cleared in the same response that spends it — so the worst a second visit
// can do is redirect. The alternative, a page that auto-submits a form, is a
// flash of chrome between sign-in and the thing they asked for, to protect
// against a repeat of an act the visitor requested and which is idempotent at
// the gateway anyway.
//
// ─── AND IT NEVER STRANDS ANYBODY ────────────────────────────────────────
//
// No record, an expired record, a record that fails validation, a session that
// died between the door and here, a gateway that refuses: every one of them
// ends in the same redirect to the same address. The act is the thing this
// route can lose; the destination is the thing it cannot, because that
// destination worked before FR3 existed and must still work when FR3 has
// nothing to say.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, cookieAttributes, decodeSession } from "../../auth/auth";
import {
  PENDING_COOKIE,
  decodePending,
  resumeDestination,
  type PendingAct,
} from "../pending";
import { endorseProduct, saveProduct, setCommentVote, setFollow } from "../me-api";

/** The four adds, each calling exactly the function its own route calls. */
async function perform(act: PendingAct, token: string): Promise<void> {
  switch (act.act) {
    case "endorse":
      await endorseProduct(token, act.slug);
      return;
    case "save":
      await saveProduct(token, act.slug);
      return;
    case "follow":
      await setFollow(token, act.kind, act.value, true);
      return;
    case "comment-vote":
      await setCommentVote(token, act.postId, true);
      return;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const destination = resumeDestination(new URL(request.url).searchParams.get("return_to"));
  // 303, like the act routes themselves, and `no-store` because this answer is
  // about one visitor's one session and means nothing to anybody else.
  const res = NextResponse.redirect(new URL(destination, request.url), 303);
  res.headers.set("cache-control", "no-store");
  // Spent whatever happens next — including when nothing happens. A record
  // that survived a failed replay would fire again on the visitor's next
  // sign-in, minutes or days later, on a page they are not looking at.
  res.cookies.set(PENDING_COOKIE, "", cookieAttributes(0));

  const act = decodePending(request.cookies.get(PENDING_COOKIE)?.value);
  if (!act) return res;
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return res;

  // THE RESULT IS NOT READ, and the reason is `comment-vote/route.ts`'s: the
  // page the visitor is about to land on renders the truth either way. A
  // refusal here would need a second page state on a control that is about to
  // re-render from the overlay in a few hundred milliseconds.
  try {
    await perform(act, session.accessToken);
  } catch {
    // Unreachable gateway. They land on the page with the act uncast, which is
    // exactly where this milestone found them.
  }
  return res;
}
