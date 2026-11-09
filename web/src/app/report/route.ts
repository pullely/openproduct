// POST /report — the one door every public surface's report control posts to
// (openproduct-commons TS3).
//
// ONE ROUTE FOR EVERY SUBJECT KIND, not one per surface. The subject kind and
// ref travel in the form body because the CONTROL knows what it is attached
// to and the route does not need to; a route per surface would be four copies
// of this session dance, and the fourth would be the one that forgot to
// sanitize the return path.
//
// THE SESSION IS READ HERE AND NOWHERE ELSE. The control is static markup on
// an anonymous, edge-cached page (I6) — it cannot know whether the visitor is
// signed in, and must not, or the page stops being cacheable. Signed out, the
// post bounces through sign-in and comes back to the same page, at the same
// control, with the `#report` fragment.
import { NextResponse, type NextRequest } from "next/server";

import { MAX_REPORT_DETAIL, REPORT_REASONS, REPORT_SUBJECT_KINDS } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession, sanitizeReturnTo } from "../auth/auth";
import { submitReport } from "../me/me-api";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const subjectKind = String(form.get("subjectKind") ?? "");
  const subjectRef = String(form.get("subjectRef") ?? "");
  const reason = String(form.get("reason") ?? "");
  const detailRaw = form.get("detail");

  // `sanitizeReturnTo` is the authority — same-host paths only, never /auth.
  // A report control renders on pages we control, so a return path we cannot
  // sanitize is a bug rather than a visitor's choice: land them on the root
  // rather than following it.
  const returnTo = sanitizeReturnTo(String(form.get("returnTo") ?? "")) ?? "/";
  const back = (query: string) => NextResponse.redirect(new URL(`${returnTo}${query}`, request.url), 303);

  if (
    !(REPORT_SUBJECT_KINDS as readonly string[]).includes(subjectKind) ||
    !(REPORT_REASONS as readonly string[]).includes(reason) ||
    subjectRef.length === 0
  ) {
    return back("?reported=invalid#report");
  }

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    // Their intent survives the round trip: they come back to the control they
    // opened, with what they typed gone but the reason they came still there.
    return NextResponse.redirect(
      new URL(`/signin?return_to=${encodeURIComponent(`${returnTo}#report`)}`, request.url),
      303,
    );
  }

  const detail =
    typeof detailRaw === "string" && detailRaw.trim().length > 0
      ? detailRaw.trim().slice(0, MAX_REPORT_DETAIL)
      : null;

  const result = await submitReport(session.accessToken, {
    subjectKind,
    subjectRef,
    reason,
    detail,
  });

  if (result.kind === "unauthorized") {
    return NextResponse.redirect(
      new URL(`/signin?return_to=${encodeURIComponent(`${returnTo}#report`)}`, request.url),
      303,
    );
  }
  if (result.kind !== "ok") {
    // Anything that is not a clean acceptance is one message. The reporter
    // does not need our taxonomy of failures, and a validation refusal here
    // would mean the control sent something the contract rejects — a bug on
    // our side, not something to explain to them.
    return back("?reported=failed#report");
  }

  // A DUPLICATE LOOKS EXACTLY LIKE A FIRST REPORT, because core answers it
  // that way on purpose: an error code here would let anybody probe whether
  // their own earlier report is still open, which is a brigading signal and
  // the beginning of a queue-shaped oracle.
  return back("?reported=1#report");
}
