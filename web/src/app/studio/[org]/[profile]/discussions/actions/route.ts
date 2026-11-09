// POST .../discussions/actions — lock, unlock (CB1).
//
// No `remove` intent, and that is deliberate: removal is a TS3 act with a
// ledger row and a reason, taken by an operator. See the page's header.
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../../../../auth/auth";
import { studioAnswer } from "../../../../answer";
import { maintainThread } from "../../../../../me/me-api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ org: string; profile: string }> },
): Promise<NextResponse> {
  const { org, profile } = await context.params;
  const page = `/studio/${encodeURIComponent(org)}/${encodeURIComponent(profile)}/discussions`;
  const back = (query: string) => answer.back(`${page}${query}`);

  // OPP15 — the same act, answered as a `303` to a browser posting the form
  // and as that same address in JSON to the save island. One decision below,
  // two ways of carrying it; see `studio/answer.ts`.
  const answer = studioAnswer(request);

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return answer.signIn(page);

  const form = await request.formData();
  const threadId = String(form.get("threadId") ?? "");
  const intent = String(form.get("intent") ?? "");
  if (!UUID_RE.test(threadId)) return back("?error=1");
  if (intent !== "lock" && intent !== "unlock" && intent !== "answer") return back("?error=1");

  const postId = String(form.get("postId") ?? "");
  const result = await maintainThread(
    session.accessToken,
    threadId,
    intent === "answer" ? { intent, postId } : { intent },
  );
  if (result.kind !== "ok") return back("?error=1");
  return back(`?notice=${intent === "lock" ? "locked" : intent === "unlock" ? "unlocked" : "answered"}`);
}
