// The public host's sign-in (openproduct-home OH1), kept pure for tests.
//
// The flow is the platform's own OAuth 2.1 AS end to end: the authorize and
// token endpoints are DISCOVERED from the RFC 8414 metadata rather than
// hardcoded (the AS's own claims are the configuration), PKCE S256 is built
// here, and the request carries `scope=identity` and nothing else. The
// session this mints holds an OI-scoped token, which the edge refuses on
// every route but the one identity read — that is the point of OI, and it is
// what makes holding the token in a host-scoped HttpOnly cookie an acceptable
// shape (OH-C): the credential cannot be replayed into platform authority.
//
// COLOCATED INSIDE THE ROUTE GROUP (the public-api.ts precedent): teardown
// stays a directory delete, and the session read has exactly one home — the
// anonymous pages never import this module, which a test pins by source scan.
//
// No Buffer: the console worker's runtime is workerd-shaped, so base64url is
// built on btoa/atob exactly as the identity-worker's JWT module does.

export const SESSION_COOKIE = "op_session";
export const STATE_COOKIE = "op_oauth_state";
export const VERIFIER_COOKIE = "op_oauth_verifier";
/** Where the round trip should land (launch polish): stored at /auth/start,
 *  consumed at the callback, cleared with the rest of the handshake. */
export const RETURN_COOKIE = "op_oauth_return";
export const HANDSHAKE_COOKIES = [STATE_COOKIE, VERIFIER_COOKIE, RETURN_COOKIE] as const;

/** The vetted static client (contracts OAUTH_PUBLIC_CLIENTS, OI2). */
export const OPENPRODUCT_CLIENT_ID = "openproduct-live";

/** State/verifier live exactly as long as a consent screen plausibly takes. */
export const HANDSHAKE_MAX_AGE_SECONDS = 600;

/**
 * How long the SESSION COOKIE lives (30 days), independent of the access
 * token's much shorter TTL. The cookie carries a refresh token, so login
 * persists across access-token expiry: /auth/session refreshes on the next
 * visit rather than signing the visitor out ~15 minutes in.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Which door this session came through (AC2c).
 *
 * `platform` — the OAuth round trip. `accessToken` is an OI-scoped platform
 *              token, refreshable, and the gateway resolves it against
 *              `/v1/identity/me`.
 * `openproduct` — a password sign-in. `accessToken` is an `ops_` token this
 *              product minted, NOT refreshable (there is nothing to refresh
 *              — the session either lives until its expiry or is revoked),
 *              and the gateway resolves it against core.
 *
 * ABSENT MEANS PLATFORM. Every cookie written before AC2c is one, and reading
 * a missing field as the older meaning is what lets this ship without signing
 * anybody out.
 */
export type SessionKind = "platform" | "openproduct";

export interface OpenproductSession {
  subjectId: string;
  displayName: string | null;
  /**
   * The bearer this session carries. A platform OAuth token, or an `ops_`
   * session token — the gateway routes on the prefix and resolves either
   * against the authority that issued it.
   *
   * IT IS A POINTER AND NEVER A CLAIM, at both doors. That sentence is what
   * makes this cookie safe unsigned, and `cookie-is-not-authority.test.ts`
   * is what keeps it true.
   */
  accessToken: string;
  /** Epoch ms the ACCESS token expires; when past, a refresh is due. */
  expiresAt: number;
  /** The refresh token, when the AS issued one — lets the session outlive the
   *  access token. Absent for a legacy cookie or an AS that issues none. */
  refreshToken?: string | null;
  /** Absent on every cookie written before AC2c, and that reads as
   *  `platform` — see {@link SessionKind}. */
  kind?: SessionKind;
  /**
   * Epoch ms this cookie's `subjectId`/`displayName` were last read from core
   * (openproduct-performance OPP8b). Absent on every cookie written before it,
   * which reads as "stale" and refills on the next `/auth/session`.
   *
   * IT DATES THE CACHE, NOT THE SESSION. Nothing about authority hangs on it:
   * the bearer is still the only thing that proves anything, and the gateway
   * still resolves that on every request. This says how old the NAME is.
   */
  identityAt?: number;
}

/** The door this session came through, defaulting an old cookie to platform. */
export function sessionKind(session: OpenproductSession): SessionKind {
  return session.kind === "openproduct" ? "openproduct" : "platform";
}

/** Refresh a little before the access token actually expires, so a request is
 *  never made with a token that dies in flight. */
export const ACCESS_REFRESH_SKEW_MS = 60_000;

/**
 * How long a cached identity is good for (openproduct-performance OPP8b).
 *
 * Sixty seconds, which is the same number the rest of this product uses for
 * "how stale may a public answer be" (OD-H, `PUBLIC_CACHE_SECONDS`, every
 * page's `revalidate`). Reusing it is deliberate: a display name that can be
 * one minute out of date is exactly as stale as the launch board a visitor is
 * reading it on, and one freshness constant is easier to reason about than
 * two.
 */
export const IDENTITY_MAX_AGE_MS = 60_000;

/**
 * Is the cached `displayName` old enough to re-read?
 *
 * WHY THIS EXISTS. `/auth/session` runs on every page load, and for an
 * OPENPRODUCT-kind session it called `fetchMe()` every single time — a full
 * browser → web worker → gateway → core → Hyperdrive → Postgres chain, to
 * refresh a name that almost never changes. Alongside the overlay's own read,
 * that made a signed-in page view cost TWO upstream chains where an anonymous
 * one costs none. OPP5 made that the dominant remaining cost: the document
 * itself is now served from cache without running the worker at all.
 *
 * A missing `identityAt` is stale by construction, so every cookie written
 * before this backfills on its next page load. Nobody signs in again.
 */
export function identityStale(session: OpenproductSession, now: number = Date.now()): boolean {
  return typeof session.identityAt !== "number" || now - session.identityAt >= IDENTITY_MAX_AGE_MS;
}

export function accessTokenStale(session: OpenproductSession, now: number = Date.now()): boolean {
  // AC2c — AN OPENPRODUCT SESSION IS NEVER STALE IN THIS SENSE. There is no
  // refresh endpoint for one: it lives until its expiry or until it is
  // revoked, and the gateway learns which on the next request it resolves.
  // Calling it stale would send `/auth/session` down the OAuth refresh path
  // with a token no authorization server has ever heard of.
  if (sessionKind(session) === "openproduct") return false;
  return session.expiresAt - ACCESS_REFRESH_SKEW_MS <= now;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToBase64url(s: string): string {
  return bytesToBase64url(new TextEncoder().encode(s));
}

function base64urlToString(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** 32 random bytes as base64url — 43 unreserved chars, a valid RFC 7636
 *  verifier and an unguessable state in one shape. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64url(bytes);
}

export async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return bytesToBase64url(new Uint8Array(digest));
}

export function encodeSession(session: OpenproductSession): string {
  return stringToBase64url(JSON.stringify(session));
}

/**
 * Null for anything that is not a well-shaped session. An access-EXPIRED
 * session is still returned WHEN it carries a refresh token — it is not dead,
 * it is due for refresh, and the caller (/auth/session) mints a fresh access
 * token from it. Only a session that is both expired AND unrefreshable reads
 * as signed out.
 */
export function decodeSession(raw: string | null | undefined): OpenproductSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(base64urlToString(raw)) as OpenproductSession;
    if (
      typeof parsed.subjectId !== "string" ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      (parsed.displayName !== null && typeof parsed.displayName !== "string") ||
      (parsed.refreshToken != null && typeof parsed.refreshToken !== "string") ||
      (parsed.kind != null && parsed.kind !== "platform" && parsed.kind !== "openproduct") ||
      (parsed.identityAt != null && typeof parsed.identityAt !== "number")
    ) {
      return null;
    }
    // AC2c — AN OPENPRODUCT SESSION HAS NO REFRESH, so its expiry is the whole
    // of its life on this side. Past it, the cookie is dead here; the row in
    // core may still say so too, and the gateway would refuse it either way.
    if (sessionKind(parsed) === "openproduct") {
      return parsed.expiresAt > Date.now() ? parsed : null;
    }
    const refreshable = typeof parsed.refreshToken === "string" && parsed.refreshToken.length > 0;
    if (parsed.expiresAt <= Date.now() && !refreshable) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Host-scoped on purpose: no Domain attribute, so the cookie never travels to
 * the console apex or anywhere else. HttpOnly (no script access), Secure,
 * SameSite=Lax — the OAuth callback is a top-level navigation, which Lax
 * permits (design.md §3).
 */
export function cookieAttributes(maxAgeSeconds: number): {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: maxAgeSeconds };
}

/**
 * THE RENDERING HINT, AND IT IS ONLY THAT.
 *
 * ─── THE PROBLEM IT SOLVES ───────────────────────────────────────────────
 *
 * I6 says the anonymous pages render byte-identically signed in and signed
 * out, so the shell's account control is SERVER-RENDERED ANONYMOUS for
 * everybody and corrected after hydration from `/auth/session`. That is why
 * the cached HTML never varies — and it is also why a signed-in visitor
 * watches "Sign in" repaint into their own name on every single load. The
 * window is a full server round trip: measured at 0.5–0.8s against
 * production for the case that makes NO upstream call at all.
 *
 * ─── WHY A COOKIE AND NOT `localStorage` ─────────────────────────────────
 *
 * Because the fix has to land BEFORE THE FIRST PAINT, and only a cookie is
 * readable from a synchronous script in `<head>`. This is the mechanism
 * `THEME_BOOT` in `layout.tsx` already uses, for the same reason and against
 * the same failure: a flash of the wrong thing.
 *
 * The `localStorage` version of this idea fights React. It has to render one
 * shape on the server and a different one on the client's first pass, which
 * is a hydration mismatch by construction. Here NOTHING about the render
 * changes: both branches of the chip are always in the HTML, identical for
 * everyone, and a class on `<html>` decides which is DISPLAYED. React never
 * sees the difference, so there is no mismatch to get wrong.
 *
 * ─── WHAT IT CARRIES: ONE CHARACTER ──────────────────────────────────────
 *
 * `1`, or absent. No token, no subject id, no name — which is why it can be
 * readable by scripts on this origin without being a new thing to steal.
 * Forging it paints an avatar with `··` in your own browser and buys you
 * exactly nothing: the gateway never sees this cookie, core never sees it,
 * and `/auth/session` still resolves the real one against the real
 * authority. That is the same argument AC2c made for why `op_session` is not
 * signed — what would make it unsafe is somebody TRUSTING a field in it, and
 * nothing does.
 *
 * The initials were the tempting second field and are not here. They would
 * put a person's name, in a readable cookie, on every request, to save one
 * repaint of two characters inside a circle that is already the right size
 * and in the right place.
 *
 * ─── IT FAILS SAFE IN BOTH DIRECTIONS ────────────────────────────────────
 *
 * Absent when signed in (cookies blocked, a session that predates this):
 * exactly today's behaviour, one repaint. Present when signed out (signed
 * out in another browser): the chip shows for one round trip and
 * `/auth/session` corrects the class AND clears the cookie. Neither state
 * can authorise anything, because it is not consulted for authority.
 */
export const SESSION_HINT_COOKIE = "op_signed_in";

/** What the boot script adds to `<html>`, and the only thing that decides
 *  which branch of the account control is displayed. */
export const SIGNED_IN_CLASS = "op-signed-in";

/**
 * The hint's attributes, and the ONE difference from `cookieAttributes` is
 * the whole point: `httpOnly: false`, because a script in `<head>` has to be
 * able to read it before the first paint.
 *
 * Everything else matches the session cookie exactly — `secure`, `sameSite`,
 * `path`, and the same max-age — so the two expire together and a hint can
 * never outlive the session it describes.
 */
export function hintAttributes(maxAgeSeconds: number): {
  httpOnly: false;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return { httpOnly: false, secure: true, sameSite: "lax", path: "/", maxAge: maxAgeSeconds };
}

export function buildAuthorizeUrl(input: {
  authorizationEndpoint: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(input.authorizationEndpoint);
  url.searchParams.set("client_id", OPENPRODUCT_CLIENT_ID);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  // The whole point: identity and nothing else. The consent screen renders
  // the narrow copy, and the minted token is refused everywhere but /me.
  url.searchParams.set("scope", "identity");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * A safe post-sign-in destination, or null. SAME-HOST RELATIVE ONLY: an
 * attacker who can get a victim to click a crafted sign-in link must not be
 * able to bounce the finished session to another origin. Also refuses the
 * auth routes AND the sign-in door itself (a loop is not a destination) and
 * anything oversized or carrying control characters.
 */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length > 512) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  if (value === "/auth" || value.startsWith("/auth/")) return null;
  // `/signin` is the door every act bounces through; returning TO it is the
  // loop that door exists to end.
  if (value === "/signin" || value.startsWith("/signin?")) return null;
  return value;
}

/**
 * The copy behind `/?auth_error=<reason>` (launch polish): every reason the
 * callback can emit has a sentence a person can act on. A test pins the key
 * set against the callback's own reasons, so a new failure mode cannot ship
 * silent.
 */
export const AUTH_ERROR_COPY: Record<string, { title: string; detail: string }> = {
  denied: {
    title: "Sign-in was cancelled",
    detail: "You declined on the consent screen, so nothing was shared.",
  },
  handshake: {
    title: "That sign-in attempt expired",
    detail: "The handshake took too long or the link was reused.",
  },
  unavailable: {
    title: "Sign-in is unavailable right now",
    detail: "The sign-in service could not be reached.",
  },
  exchange: {
    title: "Sign-in didn't complete",
    detail: "The final step of the sign-in failed.",
  },
  // `busy` is the RETRYABLE half of what `exchange` used to cover on its own.
  // The sign-in service never judged the handshake — it was unreachable or at
  // a ceiling — so the honest thing to say is "nothing is wrong with your
  // account, go again", which is exactly what the notice's own "Try signing
  // in again" link then does.
  busy: {
    title: "Sign-in couldn't be completed just now",
    detail: "The sign-in service was briefly unavailable, and nothing about your account changed.",
  },
  identity: {
    title: "Sign-in didn't complete",
    detail: "We could not confirm who signed in.",
  },
};

export interface AuthorizationServerEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

/** RFC 8414 discovery — the AS's own metadata is the configuration. */
export async function discoverEndpoints(
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthorizationServerEndpoints | null> {
  try {
    const res = await fetchImpl(`${apiBase}/.well-known/oauth-authorization-server`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const meta = (await res.json()) as { authorization_endpoint?: string; token_endpoint?: string };
    if (!meta.authorization_endpoint || !meta.token_endpoint) return null;
    return { authorizationEndpoint: meta.authorization_endpoint, tokenEndpoint: meta.token_endpoint };
  } catch {
    return null;
  }
}

export interface TokenGrant {
  accessToken: string;
  expiresAt: number;
  refreshToken: string | null;
}

/**
 * WHY A TOKEN CALL CAME BACK EMPTY, AND WHY THE DIFFERENCE MATTERS.
 *
 * `refused` — the authorization server answered, and the answer was about the
 *   GRANT: this code is spent, this refresh token was revoked, PKCE did not
 *   verify. Nothing will change on a retry, and for a refresh it means the
 *   session is genuinely over.
 *
 * `unavailable` — nothing was decided about the grant at all. The request
 *   never arrived, or came back 5xx, or came back 429 because a shared
 *   ceiling was full. The credential presented is still perfectly good.
 *
 * COLLAPSING THE TWO IS WHAT MADE A CROWDED MINUTE LOOK LIKE A BROKEN
 * ACCOUNT. `exchangeCode` and `refreshTokens` both used to return null for
 * either, so a 429 at the token endpoint told a visitor their "sign-in didn't
 * complete" with no reason to try again, and a 429 on refresh ran
 * `/auth/session`'s clearSession() — signing out somebody whose session the
 * platform had not been asked about. `/auth/session` already refuses to make
 * that inference one branch earlier, where a failed DISCOVERY keeps the
 * cookie and reports the last-known identity rather than signing anybody out;
 * this type is what lets the refresh branch below it say the same thing.
 */
export type TokenFailure = "refused" | "unavailable";

export type TokenOutcome =
  | { ok: true; grant: TokenGrant }
  | { ok: false; failure: TokenFailure };

/**
 * A token-endpoint response that produced no grant, classified.
 *
 * ONLY 400 AND 401 COUNT AS A REFUSAL, because those are the only two
 * statuses RFC 6749 §5.2 uses to say no to a grant: 400 carries
 * `invalid_grant` / `invalid_request`, 401 carries `invalid_client`.
 * Everything else — 403, a 404 from a mis-routed endpoint, 405, 429 from a
 * shared ceiling, any 5xx — is the infrastructure talking, and the credential
 * presented has not been judged at all.
 *
 * The asymmetry is deliberate: calling a refusal "unavailable" costs one
 * pointless retry, while calling an outage a "refusal" signs somebody out of
 * an account nobody asked a question about. This errs toward the cheap
 * mistake.
 *
 * A 2xx whose body is not a token response lands here too (via the callers):
 * a malformed success is a broken server, and the grant it was asked about
 * was never judged either way.
 */
function tokenFailureFor(status: number): TokenFailure {
  return status === 400 || status === 401 ? "refused" : "unavailable";
}

function parseTokenResponse(body: {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
}): TokenGrant | null {
  if (typeof body.access_token !== "string") return null;
  const ttlSeconds = typeof body.expires_in === "number" ? body.expires_in : 900;
  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + ttlSeconds * 1000,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
  };
}

/** RFC 6749 §4.1.3 exchange. Never surfaces token-endpoint detail to the
 *  visitor — the outcome says only whether the grant was refused or the
 *  service was unreachable, which is the whole of what the callback needs to
 *  pick between "that link is spent" and "try again in a moment". */
export async function exchangeCode(
  input: { tokenEndpoint: string; code: string; redirectUri: string; verifier: string },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenOutcome> {
  try {
    const res = await fetchImpl(input.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: OPENPRODUCT_CLIENT_ID,
        redirect_uri: input.redirectUri,
        code_verifier: input.verifier,
      }).toString(),
    });
    if (!res.ok) return { ok: false, failure: tokenFailureFor(res.status) };
    const grant = parseTokenResponse(await res.json());
    return grant ? { ok: true, grant } : { ok: false, failure: "unavailable" };
  } catch {
    // The request never completed — DNS, a dropped connection, a body that
    // was not JSON. Nothing was decided about the code.
    return { ok: false, failure: "unavailable" };
  }
}

/**
 * RFC 6749 §6 refresh, requesting the SAME narrow scope. Returns the new grant
 * — including a rotated refresh token when the AS issues one; when it does not,
 * the caller keeps the existing one.
 *
 * ONLY A `refused` OUTCOME ENDS A SESSION. That is the whole reason this
 * returns an outcome rather than a nullable grant: the caller signs somebody
 * out when the authorization server says the refresh token is dead, and keeps
 * them signed in when it never got to say anything.
 */
export async function refreshTokens(
  input: { tokenEndpoint: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenOutcome> {
  try {
    const res = await fetchImpl(input.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: OPENPRODUCT_CLIENT_ID,
        scope: "identity",
      }).toString(),
    });
    if (!res.ok) return { ok: false, failure: tokenFailureFor(res.status) };
    const grant = parseTokenResponse(await res.json());
    return grant ? { ok: true, grant } : { ok: false, failure: "unavailable" };
  } catch {
    return { ok: false, failure: "unavailable" };
  }
}

/** The one read the scoped token authorizes (OI1): subject id + display name. */
export async function fetchIdentity(
  apiBase: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ subjectId: string; displayName: string | null } | null> {
  try {
    const res = await fetchImpl(`${apiBase}/v1/identity/me`, {
      headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { subjectId?: string; displayName?: string | null } };
    if (typeof body.data?.subjectId !== "string") return null;
    return { subjectId: body.data.subjectId, displayName: body.data.displayName ?? null };
  } catch {
    return null;
  }
}
