// The new token has been shown: forget the cookie that carried it (MC1).
//
// Under `auth/` rather than beside the page: it reads no session and asks the
// gateway nothing, so it is cookie handling, not a `/me` act. The cookie it
// clears is scoped to the Connected agents page, and a response from here may
// clear it by naming that path.

import { NextResponse, type NextRequest } from "next/server";

import { sameOriginPost } from "../../me/pending";
import { NEW_TOKEN_COOKIE, NEW_TOKEN_PATH } from "../../me/settings/agents/new-token";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOriginPost(request)) return new NextResponse("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
  const response = new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  response.cookies.set({ name: NEW_TOKEN_COOKIE, value: "", path: NEW_TOKEN_PATH, maxAge: 0, httpOnly: true, secure: true, sameSite: "strict" });
  return response;
}
