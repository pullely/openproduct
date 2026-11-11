// A reply in a thread (openproduct-worldclass CV1; the JSON answer at
// openproduct-performance OPP14).
//
// ONE ROUTE, TWO ANSWERS — the same shape as `/comment`. A browser posting
// the form gets its `303` back to the thread (and to the parent post, when
// the reply answered one); a caller that says `accept: application/json` —
// `ui/conversation-live.tsx`, having already drawn the reply under its
// parent — gets `201 { data: { postId } }`, `401`, `422` or `502`, and
// settles or fails the reply with it.

import { NextResponse, type NextRequest } from "next/server";

import { MAX_POST_BODY } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../../auth/auth";
import { wantsJson } from "../../../me/act";
import { createPost } from "../../../me/me-api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { "cache-control": "no-store" } as const;

const REPLY_INVALID_MESSAGE = "That reply was empty or too long to post.";
const REPLY_FAILED_MESSAGE = "The thread may be closed, or your account may not be eligible yet.";

function refused(status: number, message: string): NextResponse {
  return NextResponse.json({ error: { message } }, { status, headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const json = wantsJson(request);
  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return json ? refused(422, REPLY_INVALID_MESSAGE) : NextResponse.redirect(new URL("/", request.url), 303);
  }

  const here = `/threads/${id}`;
  const back = (query: string) => NextResponse.redirect(new URL(`${here}${query}`, request.url), 303);
  const signIn = () =>
    json
      ? new NextResponse(null, { status: 401, headers: NO_STORE })
      : NextResponse.redirect(
          new URL(`/signin?return_to=${encodeURIComponent(here)}`, request.url),
          303,
        );

  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return signIn();

  const form = await request.formData();
  const body = String(form.get("body") ?? "").trim();
  if (body.length === 0 || body.length > MAX_POST_BODY) {
    return json ? refused(422, REPLY_INVALID_MESSAGE) : back("?posted=invalid");
  }

  // The words are the part somebody typed. Losing them to a mangled hidden
  // field would be the worse failure, so a malformed parent is a top-level
  // post rather than a refusal.
  const parentRaw = String(form.get("parentPostId") ?? "").trim();
  const parentPostId = UUID_RE.test(parentRaw) ? parentRaw : null;

  const result = await createPost(session.accessToken, id, body, parentPostId);
  if (result.kind === "unauthorized") return signIn();
  if (result.kind !== "ok") {
    return json ? refused(502, REPLY_FAILED_MESSAGE) : back("?posted=failed");
  }

  if (json) {
    return NextResponse.json(
      { data: { postId: result.data.postId, threadId: id } },
      { status: 201, headers: NO_STORE },
    );
  }
  return back(parentPostId === null ? "" : `#post-${parentPostId}`);
}
