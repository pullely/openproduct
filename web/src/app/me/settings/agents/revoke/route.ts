// Revoke a connected agent or a personal token (openproduct-mcp MC1).

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, decodeSession } from "../../../../auth/auth";
import { revokeAgentCredential } from "../../../agents-api";
import { sameOriginPost } from "../../../pending";
import { signInFor } from "../../../section";
import { NEW_TOKEN_PATH } from "../new-token";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOriginPost(request)) return new NextResponse("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL(signInFor(NEW_TOKEN_PATH), request.url), 303);
  const form = await request.formData();
  const result = await revokeAgentCredential(session.accessToken, String(form.get("id") ?? ""));
  if (result.kind === "unauthorized") return NextResponse.redirect(new URL(signInFor(NEW_TOKEN_PATH), request.url), 303);
  const suffix = result.kind === "ok" ? "?revoked=1" : `?error=${encodeURIComponent("That agent could not be revoked. Try again.")}`;
  return NextResponse.redirect(new URL(`${NEW_TOKEN_PATH}${suffix}`, request.url), 303);
}
