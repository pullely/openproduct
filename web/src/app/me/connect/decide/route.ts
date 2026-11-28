// The consent screen's two buttons (openproduct-mcp MC1).
//
// Allow and Cancel post here. Both end in the same place — a 303 to the
// address the gateway names, which is the client's registered redirect with a
// code or with `access_denied` — and the gateway (core, behind it) re-checks
// the client and its redirect before naming anything. This route never builds
// the address itself, so it can never send the browser somewhere unverified.
//
// SAME-ORIGIN ONLY (`sameOriginPost`): an Allow is the one act on this site
// that hands somebody else authority, and a cross-site form must not be able
// to press it.

import { NextResponse, type NextRequest } from "next/server";

import { isAgentScope, normaliseScopes } from "@openproduct/contracts";

import { SESSION_COOKIE, decodeSession } from "../../../auth/auth";
import { createGrant } from "../../agents-api";
import { sameOriginPost } from "../../pending";
import { signInFor } from "../../section";

function back(request: NextRequest, form: FormData, error?: string): NextResponse {
  const params = new URLSearchParams();
  for (const key of ["client_id", "redirect_uri", "code_challenge", "state"]) {
    const value = form.get(key);
    if (typeof value === "string") params.set(key, value);
  }
  const scopes = form.getAll("scope").filter((v): v is string => typeof v === "string");
  if (scopes.length > 0) params.set("scope", scopes.join(" "));
  if (error) params.set("error", error);
  return NextResponse.redirect(new URL(`/me/connect?${params.toString()}`, request.url), 303);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!sameOriginPost(request)) return new NextResponse("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
  const form = await request.formData();
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL(signInFor("/me/connect"), request.url), 303);

  const decision = form.get("decision") === "allow" ? "allow" : "deny";
  const scopes = normaliseScopes(form.getAll("scope").filter((v): v is string => typeof v === "string" && isAgentScope(v)));
  const only = form.get("listings") === "only";
  const listingIds = only ? form.getAll("listing").filter((v): v is string => typeof v === "string") : null;
  if (decision === "allow" && scopes.length === 0) return back(request, form, "Choose at least one thing the agent may do.");
  if (decision === "allow" && only && (listingIds ?? []).length === 0) return back(request, form, "Choose the listings, or All my listings.");

  const result = await createGrant(session.accessToken, {
    clientId: String(form.get("client_id") ?? ""),
    redirectUri: String(form.get("redirect_uri") ?? ""),
    codeChallenge: String(form.get("code_challenge") ?? ""),
    state: typeof form.get("state") === "string" ? String(form.get("state")) : null,
    scopes,
    listingIds,
    decision,
  });
  if (result.kind === "unauthorized") return NextResponse.redirect(new URL(signInFor("/me/connect"), request.url), 303);
  if (result.kind === "refused") return back(request, form, result.message);
  if (result.kind === "unavailable") return back(request, form, "openproduct could not finish that. Try again.");
  // The gateway's own answer: the client's registered redirect, checked twice.
  // Built by hand: a native client's own scheme (com.example.app:) is not a
  // URL `NextResponse.redirect` will take.
  return new NextResponse(null, { status: 303, headers: { location: result.data.redirectTo, "cache-control": "no-store" } });
}
