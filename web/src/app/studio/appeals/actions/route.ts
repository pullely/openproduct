// POST /studio/appeals/actions — filing one, and deciding one (TS5).
//
// TWO INTENTS ON ONE ROUTE, dispatched on a hidden field, for the reason TS3's
// queue actions are one route: two routes would be two copies of the session
// dance and the refusal mapping, and the second copy is the one that forgets
// something.
//
// THE SESSION IS READ HERE, SERVER-SIDE, and the token never reaches the
// browser (OX5b). Both forms are plain HTML with no client JS.
//
// EVERY REFUSAL IS A TOKEN FROM A CLOSED SET, never a message from the API.
// The page looks the token up in the contract and renders the contract's own
// sentence; passing the API's text through the query string would let anybody
// with a link put arbitrary words on somebody's screen.
import { NextResponse, type NextRequest } from "next/server";

import {
  APPEAL_REFUSALS,
  appealSaysIsAcceptable,
  type AppealRefusalReason,
} from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../../auth/auth";
import { studioAnswer } from "../../answer";
import { decideAppeal, fileAppeal } from "../../studio-api";

const PAGE = "/studio/appeals";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const back = (query: string) => answer.back(`${PAGE}${query}`);

  // OPP15 — the same act, answered as a `303` to a browser posting the form
  // and as that same address in JSON to the save island. One decision below,
  // two ways of carrying it; see `studio/answer.ts`.
  const answer = studioAnswer(request);

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return answer.signIn(PAGE);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "file") {
    const actId = String(form.get("actId") ?? "");
    if (!UUID_RE.test(actId)) return refused("unknown-act", back);

    const says = String(form.get("says") ?? "").trim();
    // Checked here as well as at the API, so somebody who submits a one-word
    // appeal gets the sentence rather than a round trip that reads as a
    // failure of the site.
    if (!appealSaysIsAcceptable(says)) return refused("says-required", back);

    const result = await fileAppeal(session.accessToken, { actId, says });
    if (result.kind === "ok") return back("?notice=filed");
    return refused(refusalOf(result), back);
  }

  if (intent === "decide") {
    const appealId = String(form.get("appealId") ?? "");
    if (!UUID_RE.test(appealId)) return refused("unknown-act", back);

    const decision = String(form.get("decision") ?? "");
    if (decision !== "uphold" && decision !== "refuse") {
      return refused("unknown-act", back);
    }

    const reason = String(form.get("reason") ?? "").trim();
    if (reason.length < 3) return refused("says-required", back);

    const result = await decideAppeal(session.accessToken, { appealId, decision, reason });
    if (result.kind !== "ok") return refused(refusalOf(result), back);

    if (decision === "refuse") return back("?notice=refused");
    // AN UPHELD APPEAL THAT REVERSED NOTHING GETS ITS OWN SENTENCE. Somebody
    // else may have undone the act while it waited, and "upheld" with no
    // visible change reads as a bug otherwise.
    return back(result.data.reversed ? "?notice=upheld" : "?notice=upheld-nothing");
  }

  return refused("unknown-act", back);
}

function refused(
  reason: AppealRefusalReason,
  back: (query: string) => NextResponse,
): NextResponse {
  const known = reason in APPEAL_REFUSALS ? reason : "unknown-act";
  return back(`?refused=${known}`);
}

/**
 * The API's refusal code, narrowed to the closed set the page can render.
 *
 * `unauthorized` becomes `no-standing` rather than `not-an-operator`: the
 * overwhelming majority of people who reach this route are maintainers, and
 * telling one of them the operator queue is not theirs would answer a
 * question they did not ask.
 */
function refusalOf(result: { kind: string; code?: string }): AppealRefusalReason {
  if (result.kind === "unauthorized") return "no-standing";
  const code = result.code ?? "";
  return code in APPEAL_REFUSALS ? (code as AppealRefusalReason) : "unknown-act";
}
