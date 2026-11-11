// GET /auth/session (openproduct host) — who am I, per this host (OH1).
//
// The ONE place the session cookie is read (OH2's /me chrome builds on this).
// The anonymous pages never look for a session — that is what keeps the
// directory and every project page byte-identical signed-in and signed-out,
// served from cache with no actor resolved. Never cacheable.
//
// It is ALSO where the session refreshes: the SessionChip calls this on every
// page, so a stale access token is minted fresh here and the cookie re-set —
// which is what makes login persist past the ~15-minute access-token TTL
// instead of silently expiring.
import { NextResponse, type NextRequest } from "next/server";

import { platformApiBase } from "@/lib/platform";
import { fetchMe } from "../../me/me-api";
import {
  SESSION_COOKIE,
  SESSION_HINT_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  accessTokenStale,
  cookieAttributes,
  decodeSession,
  discoverEndpoints,
  encodeSession,
  hintAttributes,
  identityStale,
  refreshTokens,
  sessionKind,
} from "../auth";

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * EVERY ANSWER THIS ROUTE GIVES, WITH THE RENDERING HINT KEPT IN STEP.
 *
 * There are five ways to be signed in by the time this route replies — an
 * openproduct session resolved, an openproduct session whose resolver was
 * unreachable, a platform token still fresh, a platform token that could not
 * be checked, and one just refreshed — plus three ways to be signed out. A
 * hint written at four of the eight is worse than no hint at all: it would be
 * right often enough to be trusted and wrong often enough to flicker.
 *
 * So there is one constructor and no bare `NextResponse.json` left in the
 * file, which a test pins. `hintAttributes(0)` on the signed-out branch is a
 * DELETION — the same expiry the sign-out route uses.
 *
 * IT ALSO BACKFILLS. Every session that predates this mechanism has no hint
 * cookie; the next page any of them loads calls this route, and this line
 * gives them one. Nobody has to sign in again to stop flickering.
 */
function answer(identity: { subjectId: string; displayName: string | null } | null): NextResponse {
  const res = NextResponse.json(
    { data: identity === null ? { signedIn: false } : { signedIn: true, ...identity } },
    { headers: NO_STORE },
  );
  res.cookies.set(
    SESSION_HINT_COOKIE,
    identity === null ? "" : "1",
    hintAttributes(identity === null ? 0 : SESSION_MAX_AGE_SECONDS),
  );
  return res;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return answer(null);
  }

  // ─── AC2c: the password door answers from the product, not the platform ──
  //
  // An openproduct session carries an `ops_` token no authorization server
  // has heard of, so there is nothing to refresh and nothing at
  // `/v1/identity/me` to ask. WHO it belongs to comes from the same place
  // every `/me` page gets it — the gateway, resolving the token against core.
  //
  // That also settles what the cookie's own `subjectId` and `displayName`
  // are: a CACHE of the last answer, refreshed here, and never the source.
  // The password door writes them empty on purpose and this fills them in.
  if (sessionKind(session) === "openproduct") {
    // ─── OPP8b: DON'T RE-READ A NAME THAT CHANGED A MINUTE AGO ────────────
    //
    // This branch used to call `fetchMe()` on EVERY page load — a full
    // browser → web worker → gateway → core → Hyperdrive → Postgres chain, to
    // refresh a display name. Beside the overlay's own read that made a
    // signed-in page view cost two upstream chains, and OPP5 made it the
    // dominant remaining cost: the document itself is now served from cache
    // without running this worker at all.
    //
    // The cookie already holds the last answer and always has — its own
    // comment below calls `subjectId` and `displayName` "a CACHE of the last
    // answer". OPP8b simply dates that cache and honours the date.
    //
    // WHAT THIS TRADES, STATED RATHER THAN DISCOVERED. `fetchMe()` was also
    // acting as a liveness check: an `unauthorized` answer cleared the
    // session. Skipping it means a token revoked in the last minute leaves
    // the CHROME optimistic for up to sixty seconds. Nothing else is
    // affected — the bearer is still resolved by the gateway on every real
    // request, the overlay independently answers 204 and the counts empty,
    // and any act returns 401 and bounces through sign-in. The window is the
    // same sixty seconds the rest of the product already treats as fresh.
    if (!identityStale(session)) {
      return answer({ subjectId: session.subjectId, displayName: session.displayName });
    }
    const me = await fetchMe(session.accessToken);
    if (me.kind === "unauthorized") return clearSession();
    if (me.kind !== "ok") {
      // Unreachable is not the same as invalid. Report the last-known
      // identity rather than signing somebody out on a transient blip —
      // the same call the platform path already makes below.
      return answer({ subjectId: session.subjectId, displayName: session.displayName });
    }
    const identity = {
      subjectId: me.data.subjectId,
      displayName: me.data.contributor?.displayName ?? null,
    };
    const res = answer(identity);
    // ALWAYS re-set here, which is a change from "only when the value moved".
    //
    // The stamp is the point: a read that found the same name still has to
    // record THAT IT LOOKED, or `identityStale` stays true forever and this
    // branch re-reads on every page load exactly as it did before OPP8b — a
    // cache that never records a hit is not a cache. This is reached only
    // when the identity was already stale, so it is at most one `Set-Cookie`
    // per minute rather than one per page view.
    res.cookies.set(
      SESSION_COOKIE,
      encodeSession({ ...session, ...identity, identityAt: Date.now() }),
      cookieAttributes(SESSION_MAX_AGE_SECONDS),
    );
    return res;
  }

  // Fresh enough — answer straight away.
  if (!accessTokenStale(session)) {
    return answer({ subjectId: session.subjectId, displayName: session.displayName });
  }

  // Stale but refreshable (decodeSession only returns an expired session when
  // it carries a refresh token). Mint a new access token and re-set the cookie.
  const refreshToken = session.refreshToken;
  if (!refreshToken) {
    return clearSession();
  }
  const endpoints = await discoverEndpoints(platformApiBase());
  if (!endpoints) {
    // The AS is unreachable, not the session invalid — keep the cookie and
    // report the last-known identity rather than signing the visitor out on a
    // transient blip.
    return answer({ subjectId: session.subjectId, displayName: session.displayName });
  }
  const refreshed = await refreshTokens({ tokenEndpoint: endpoints.tokenEndpoint, refreshToken });
  if (!refreshed.ok) {
    // ─── ONLY A REFUSAL ENDS A SESSION ───────────────────────────────────
    //
    // A refused refresh (revoked, expired, reuse-detected) means this session
    // is genuinely over, and clearing the cookie is the right answer.
    //
    // AN UNREACHABLE AUTHORIZATION SERVER MEANS NOTHING OF THE KIND, and
    // treating it as one was a real bug rather than a theoretical one: the
    // token endpoint answers 429 when the platform's shared ceiling is full,
    // `refreshTokens` saw a non-ok response, and a visitor holding a
    // perfectly valid refresh token was signed out because somebody else had
    // just signed in. This is the same call the branch directly above makes
    // when DISCOVERY is unreachable — keep the cookie, report the last-known
    // identity — and the two now agree.
    //
    // The cost of being wrong in this direction is one stale display name
    // until the next page load, against signing somebody out of an account
    // nobody asked a question about.
    if (refreshed.failure === "unavailable") {
      return answer({ subjectId: session.subjectId, displayName: session.displayName });
    }
    return clearSession();
  }
  const grant = refreshed.grant;

  const next = {
    subjectId: session.subjectId,
    displayName: session.displayName,
    accessToken: grant.accessToken,
    expiresAt: grant.expiresAt,
    // Keep the existing refresh token when the AS did not rotate it.
    refreshToken: grant.refreshToken ?? refreshToken,
  };
  const res = answer({ subjectId: next.subjectId, displayName: next.displayName });
  res.cookies.set(SESSION_COOKIE, encodeSession(next), cookieAttributes(SESSION_MAX_AGE_SECONDS));
  return res;
}

function clearSession(): NextResponse {
  // `answer(null)` has already expired the hint; this adds the session cookie
  // itself. Both die together, which is the invariant the whole mechanism
  // rests on.
  const res = answer(null);
  res.cookies.set(SESSION_COOKIE, "", cookieAttributes(0));
  return res;
}
