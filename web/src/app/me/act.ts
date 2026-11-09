// How an act answers (openproduct-performance OPP2).
//
// Six routes — endorse, unendorse, save, unsave, follow, comment-vote — are
// each posted to by a `<form method="post">` and answer `303` back to the page
// the visitor was on. That is the no-JavaScript path, it is the reason those
// controls are forms, and OPP2 does not touch it.
//
// What OPP2 adds is a SECOND caller: `ui/use-toggle.ts`, which posts the same
// URL with `fetch` and updates the overlay optimistically, so an upvote stops
// costing a whole document. A redirect is exactly the wrong answer for that
// caller — `redirect: "follow"` would fetch the page it is trying not to
// fetch, and `redirect: "manual"` yields an opaque response it cannot read.
//
// So the answer depends on WHO ASKED, and the request says so with `accept`.
//
// ─── AND THE JSON BRANCH SAYS SOMETHING THE FORM BRANCH CANNOT ────────────
//
// The redirect answer is the same for a write that succeeded and a write that
// failed — `endorse/route.ts` says so in a comment, and is right that the
// control "will simply still read Endorse, which is the truth" once the page
// re-renders. An optimistic control has no such re-render to fall back on: it
// has already moved, and it needs to know whether to move back. So the JSON
// branch distinguishes the three outcomes the form branch collapses:
//
//   ok       204   the act landed; the optimistic state was right
//   signin   401   no session, or a dead token — the browser must hand the
//                  visitor to sign-in rather than pretend the act happened
//   failed   502   the service refused or could not be reached; revert
//
// Every one of them is `no-store`: these are per-subject answers, and an
// intermediary that cached a 204 would pin every later visitor to "it worked".

import { NextResponse, type NextRequest } from "next/server";

import { cookieAttributes } from "../auth/auth";
import {
  PENDING_COOKIE,
  PENDING_MAX_AGE_SECONDS,
  bounceTarget,
  encodePending,
  sameOriginPost,
  type PendingAct,
} from "./pending";

export type ActOutcome = "ok" | "signin" | "failed";

/**
 * Did the enhanced client send this, rather than a browser submitting a form?
 *
 * `accept: application/json` is the whole test, and it is a test of what the
 * caller can USE rather than of who they claim to be. A browser form submit
 * sends `accept: text/html,...` and takes the redirect; anything asking for
 * JSON gets JSON. There is no header a page could forget to send that would
 * silently change the no-JS path, because the no-JS path is the default.
 */
export function wantsJson(request: NextRequest): boolean {
  return (request.headers.get("accept") ?? "").includes("application/json");
}

const NO_STORE = { "cache-control": "no-store" } as const;

const STATUS: Record<ActOutcome, number> = { ok: 204, signin: 401, failed: 502 };

/**
 * Answer one act, in whichever shape the caller can use.
 *
 * `signInTo` and `returnTo` are only read on the form path — the JSON caller
 * is told WHAT happened and decides for itself where to send anybody, because
 * it is the side that knows what the visitor was looking at.
 *
 * ─── AND ON THE SIGN-IN BRANCH, THE ACT GOES WITH THEM (FR3) ─────────────
 *
 * `pending` is the act this visitor was trying to perform, which every route
 * knows and which was, until FR3, dropped on the floor the moment the bounce
 * began. Written here rather than in six routes because this is the one place
 * that knows the outcome is `signin`.
 *
 * THE JSON BRANCH DELIBERATELY WRITES NOTHING. `ui/use-toggle.ts` answers a
 * 401 by submitting the form — the no-JS path, unchanged — so the record is
 * written by that second, real POST. One write site, and the enhanced path
 * gets FR3 by taking the path it already took.
 */
export function actAnswer(
  request: NextRequest,
  outcome: ActOutcome,
  where: { returnTo: string; signInTo?: string; pending?: PendingAct },
): NextResponse {
  if (wantsJson(request)) {
    return new NextResponse(null, { status: STATUS[outcome], headers: NO_STORE });
  }
  const signInFrom = where.signInTo ?? where.returnTo;
  // The record is written only for a bounce, and only when the browser says
  // this post came from a page on this origin — see `pending.ts` for what
  // that guard is holding back.
  const record =
    outcome === "signin" && where.pending && sameOriginPost(request) ? where.pending : null;
  const target =
    outcome === "signin"
      ? `/signin?return_to=${encodeURIComponent(bounceTarget(signInFrom, record !== null))}`
      : where.returnTo;
  // 303 for the reason it was always 303: a POST answered with a redirect must
  // become a GET, or a reload re-submits the act.
  const res = NextResponse.redirect(new URL(target, request.url), 303);
  if (record) {
    res.cookies.set(PENDING_COOKIE, encodePending(record), cookieAttributes(PENDING_MAX_AGE_SECONDS));
  }
  return res;
}
