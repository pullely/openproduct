// GET /auth/start (openproduct host) — begin the OAuth dance (OH1).
//
// Thin on purpose: every decision lives in ../auth.ts where it is tested.
import { NextResponse, type NextRequest } from "next/server";

import { platformApiBase } from "@/lib/platform";
import {
  HANDSHAKE_MAX_AGE_SECONDS,
  RETURN_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  buildAuthorizeUrl,
  cookieAttributes,
  discoverEndpoints,
  randomToken,
  s256Challenge,
  sanitizeReturnTo,
} from "../auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const endpoints = await discoverEndpoints(platformApiBase());
  if (!endpoints) {
    return NextResponse.redirect(new URL("/?auth_error=unavailable", request.url));
  }
  const state = randomToken();
  const verifier = randomToken();
  const challenge = await s256Challenge(verifier);
  // The browser URL is /auth/callback on THIS host — the registered redirect
  // URI. The middleware rewrite keeps the visitor's URL, so request.url's
  // origin is the public apex.
  const redirectUri = new URL("/auth/callback", request.url).toString();

  const res = NextResponse.redirect(
    buildAuthorizeUrl({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      redirectUri,
      state,
      challenge,
    }),
  );
  res.cookies.set(STATE_COOKIE, state, cookieAttributes(HANDSHAKE_MAX_AGE_SECONDS));
  res.cookies.set(VERIFIER_COOKIE, verifier, cookieAttributes(HANDSHAKE_MAX_AGE_SECONDS));
  // Launch polish — remember where the journey started, so the callback can
  // land there instead of on the root. Sanitized: same-host relative only.
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get("return_to"));
  if (returnTo) {
    res.cookies.set(RETURN_COOKIE, returnTo, cookieAttributes(HANDSHAKE_MAX_AGE_SECONDS));
  }
  return res;
}
