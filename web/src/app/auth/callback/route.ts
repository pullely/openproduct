// GET /auth/callback (openproduct host) — the registered redirect URI (OH1).
//
// Verifies the state binding, exchanges the code (PKCE), asks the ONE
// question the scoped token can answer, and mints the host-scoped session.
// Every failure is a generic redirect — token-endpoint detail never reaches
// the visitor's URL bar.
import { NextResponse, type NextRequest } from "next/server";

import { platformApiBase } from "@/lib/platform";
import {
  HANDSHAKE_COOKIES,
  RETURN_COOKIE,
  SESSION_COOKIE,
  SESSION_HINT_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  cookieAttributes,
  hintAttributes,
  discoverEndpoints,
  encodeSession,
  exchangeCode,
  fetchIdentity,
  sanitizeReturnTo,
} from "../auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const fail = (reason: string): NextResponse => {
    const res = NextResponse.redirect(new URL(`/?auth_error=${reason}`, request.url));
    for (const name of HANDSHAKE_COOKIES) res.cookies.set(name, "", cookieAttributes(0));
    return res;
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = request.cookies.get(STATE_COOKIE)?.value;
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  if (url.searchParams.get("error")) return fail("denied");
  if (!code || !state || !storedState || state !== storedState || !verifier) {
    return fail("handshake");
  }

  const endpoints = await discoverEndpoints(platformApiBase());
  if (!endpoints) return fail("unavailable");

  const redirectUri = new URL("/auth/callback", request.url).toString();
  const exchanged = await exchangeCode({
    tokenEndpoint: endpoints.tokenEndpoint,
    code,
    redirectUri,
    verifier,
  });
  // TWO WAYS TO HAVE NO TOKEN, AND THEY DESERVE DIFFERENT SENTENCES. An
  // `unavailable` outcome means the authorization server never judged this
  // code — it was unreachable, or at a ceiling — so the visitor is told to
  // go again rather than that their sign-in failed. `exchange` keeps its old
  // meaning: the code itself was refused, and trying it again cannot work.
  if (!exchanged.ok) return fail(exchanged.failure === "unavailable" ? "busy" : "exchange");
  const token = exchanged.grant;

  const identity = await fetchIdentity(platformApiBase(), token.accessToken);
  if (!identity) return fail("identity");

  // Launch polish — the round trip lands where it started (sanitized again on
  // read: the cookie is HttpOnly but defence stays in depth), default "/".
  const returnTo = sanitizeReturnTo(request.cookies.get(RETURN_COOKIE)?.value) ?? "/";
  const res = NextResponse.redirect(new URL(returnTo, request.url));
  for (const name of HANDSHAKE_COOKIES) res.cookies.set(name, "", cookieAttributes(0));
  res.cookies.set(
    SESSION_COOKIE,
    encodeSession({
      ...identity,
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      refreshToken: token.refreshToken,
    }),
    // The cookie outlives the access token: the refresh token inside keeps the
    // session alive for the refresh horizon, not just the ~15-minute TTL.
    cookieAttributes(SESSION_MAX_AGE_SECONDS),
  );
  // The readable hint, beside the session and never instead of it: it says
  // only THAT somebody is signed in, so the shell can paint the right shape
  // before the first frame instead of a round trip later. Same lifetime as
  // the cookie above, so the two can never disagree by outliving each other.
  res.cookies.set(SESSION_HINT_COOKIE, "1", hintAttributes(SESSION_MAX_AGE_SECONDS));
  return res;
}
