// POST /studio/reports/actions — every decision the queue offers (TS3).
//
// ONE ROUTE FOR ALL FOUR INTENTS, dispatched on a hidden field, for the same
// reason LC0's launch actions are one route: four routes would be four copies
// of the session dance and the refusal mapping, and the fourth copy is the one
// that forgets to sanitize something.
//
// THE SESSION IS READ HERE, SERVER-SIDE, and the token never reaches the
// browser (OX5b). The forms are plain HTML with no client JS.
import { NextResponse, type NextRequest } from "next/server";

import { MODERATION_REFUSALS, type ModerationRefusalReason } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../../auth/auth";
import { studioAnswer } from "../../answer";
import { moderateListing, resolveFlag, triageReport } from "../../studio-api";

const QUEUE = "/studio/reports";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The intents that act on content, and the act each maps to. */
const ACT_FOR: Record<string, string> = { delist: "delist", remove: "remove" };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const back = (query: string) => answer.back(`${QUEUE}${query}`);

  // OPP15 — the same act, answered as a `303` to a browser posting the form
  // and as that same address in JSON to the save island. One decision below,
  // two ways of carrying it; see `studio/answer.ts`.
  const answer = studioAnswer(request);

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return answer.signIn(QUEUE);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  // TS4 — the flag verdicts, BEFORE the report id check below: a flag row
  // carries a flagId and no reportId, and falling through would refuse it as
  // an unknown subject.
  //
  // NO REASON IS REQUIRED HERE, unlike every act below, and the asymmetry is
  // deliberate: an act needs a reason because a person has to be able to
  // appeal it, and nobody appeals a machine being told it was wrong.
  // Requiring one would tax the path the estate most wants used.
  if (intent === "flag-dismiss" || intent === "flag-action") {
    const flagId = String(form.get("flagId") ?? "");
    if (!UUID_RE.test(flagId)) return back("?refused=unknown-subject");
    const verdict = intent === "flag-dismiss" ? "dismissed" : "actioned";
    const result = await resolveFlag(session.accessToken, { flagId, verdict });
    if (result.kind === "ok") return back(`?notice=flag-${verdict}`);
    // A flag two operators reached at once resolves once, and the second gets
    // "somebody has already resolved this" rather than the transition
    // sentence — which would be true of an act and is nonsense about a flag.
    // The code is still looked up in the contract's closed set, never
    // rendered from the API's own text.
    if (result.kind === "refused" && result.code === "already-resolved") {
      return back("?refused=already-resolved");
    }
    return back(refusalQuery(result.kind));
  }

  const reportId = String(form.get("reportId") ?? "");
  if (!UUID_RE.test(reportId)) return back("?refused=unknown-subject");

  if (intent === "claim") {
    const result = await triageReport(session.accessToken, { reportId, decision: "claim" });
    return back(result.kind === "ok" ? "?notice=claimed" : refusalQuery(result.kind));
  }

  // Every remaining intent needs a reason, and the API enforces it too. The
  // check is here as well so somebody who submits an empty field gets the
  // sentence rather than a round trip that looks like a failure.
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 3) return back("?refused=reason-required");

  if (intent === "decline") {
    const result = await triageReport(session.accessToken, {
      reportId,
      decision: "decline",
      reason,
    });
    return back(result.kind === "ok" ? "?notice=declined" : refusalQuery(result.kind));
  }

  const act = ACT_FOR[intent];
  if (!act) return back("?refused=illegal-transition");

  const slug = String(form.get("subjectRef") ?? "");
  if (slug.length === 0) return back("?refused=unknown-subject");

  // The act carries the report id, so core resolves the report as `actioned`
  // in the same call — which is what keeps "the reporter is told the outcome"
  // true without a second click nobody makes.
  const result = await moderateListing(session.accessToken, { act, slug, reason, reportId });
  return back(result.kind === "ok" ? "?notice=acted" : refusalQuery(result.kind));
}

/**
 * A refusal token from a CLOSED SET, never a message from the API.
 *
 * The page looks the token up in the contract and renders the contract's
 * sentence. Passing the API's own text through the query string would let
 * anybody with a link put arbitrary words on an operator's screen.
 */
function refusalQuery(kind: string): string {
  const reason: ModerationRefusalReason =
    kind === "unauthorized" ? "not-an-operator" : "illegal-transition";
  return `?refused=${reason in MODERATION_REFUSALS ? reason : "illegal-transition"}`;
}
