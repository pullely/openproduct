// openproduct's own session, and the sign-in that mints it (AC2b).
//
// ─── WHY THERE IS A SECOND KIND OF SESSION AT ALL ────────────────────────
//
// Until now every signed-in visitor arrived through the platform's OAuth
// flow, and the cookie carried an `identity`-scoped access token. The gateway
// never verified it — it ASKED, `GET /v1/identity/me`, on every request. R2's
// safety argument rests on exactly that: a forged cookie buys nothing,
// because the thing inside is re-resolved against somebody else's authority.
//
// A password sign-in has no such token. The platform mints one only at the
// end of a magic-link round trip, and a password sign-in that mailed a link
// every time is not a password sign-in.
//
// So openproduct mints its own — and keeps the SHAPE rather than the
// mechanism: an unguessable token in the cookie, a row in core, and the
// gateway resolves it against core exactly as it resolves a platform token
// against the platform. The cookie is a pointer at both doors, never a claim.
// (`1730_openproduct_sessions/up.sql` argues the alternative down in full.)
//
// ─── THE PREFIX IS LOAD-BEARING ──────────────────────────────────────────
//
// The gateway now has two things a bearer might be, and it has to know which
// without asking both. `ops_` says so in the token itself, which makes the
// routing a LOOKUP rather than a GUESS — no length heuristic, no "try the
// platform and fall back", both of which turn a malformed token into two
// round trips and an ambiguous failure. It also matches how this estate
// already names subjects (`usr_`, `sp_`), so the convention is not a new one.

/** How a token minted here announces itself. */
export const SESSION_TOKEN_PREFIX = "ops_";

/** 32 bytes, base64url — the same entropy as a credential token. */
export const SESSION_TOKEN_BYTES = 32;

/**
 * Is this bearer openproduct's own?
 *
 * Deliberately a shape test and nothing more. It decides WHERE to ask, never
 * whether the answer is yes: a token that starts with `ops_` and is otherwise
 * nonsense reaches core and is refused there, which is the only place that
 * can refuse it truthfully.
 */
export function isOpenproductSessionToken(token: string): boolean {
  return token.startsWith(SESSION_TOKEN_PREFIX);
}

/**
 * How long a session lives: 30 days, the same as the cookie that carries it.
 *
 * THE TWO NUMBERS MATCH ON PURPOSE and neither is the authority for the
 * other. A cookie that outlives its row leaves somebody looking signed in and
 * being refused; a row that outlives its cookie is a credential nobody can
 * present and nothing can revoke, sitting in a table until a sweep finds it.
 * A test pins them equal so the pair cannot drift in one file.
 */
export const AUTH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The `expires_at` a session minted now should carry. */
export function sessionExpiry(now: number): string {
  return new Date(now + AUTH_SESSION_TTL_MS).toISOString();
}

/** A session row as core hands it back. No address, and no name. */
export interface AuthSessionRow {
  readonly subjectId: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

/**
 * Is this row still a session?
 *
 * REVOKED FIRST, THEN EXPIRY, and the order is not cosmetic: a revoked
 * session must read as dead even if a clock somewhere disagrees about when it
 * expired.
 */
export function sessionUsable(row: AuthSessionRow, now: number): boolean {
  if (row.revokedAt !== null) return false;
  return Date.parse(row.expiresAt) > now;
}

// ---------------------------------------------------------------------------
// The addresses
// ---------------------------------------------------------------------------

/** The design's modal posts here. */
export const SIGN_IN_PATH = "/v1/openproduct/auth/sign-in";

/** And here, to end a session it minted. */
export const SIGN_OUT_PATH = "/v1/openproduct/auth/sign-out";

/**
 * The platform's address → subject resolver (AC2a), reached through api-edge
 * with an HMAC rather than a service binding — openproduct holds no binding
 * into the platform in either direction, which is what OPX-4 means.
 */
export const SEAM_SUBJECT_BY_EMAIL_PATH = "/v1/seam/openproduct/subject-by-email";

// ---------------------------------------------------------------------------
// Velocity
// ---------------------------------------------------------------------------

/**
 * TWO BUCKETS, AND THEY DEFEND AGAINST DIFFERENT ATTACKS. Getting this wrong
 * in one direction is the classic sign-in mistake, so both are named.
 *
 * PER IP bounds one client trying many passwords, and it is checked FIRST,
 * before anything crosses the seam — so a scripted attempt costs this worker
 * a token-bucket read and costs the platform nothing.
 *
 * PER SUBJECT bounds many clients trying one account, which is what a
 * credential-stuffing run actually looks like and what an IP bucket cannot
 * see at all. It can only be checked AFTER the address resolves, so it does
 * not protect the seam from the attempt — it protects the ACCOUNT, which is
 * the thing worth protecting.
 *
 * The numbers: sign-in is tighter than AC1's sign-up (10/hour) on the IP
 * dimension being the same order, because a person signs in a handful of
 * times an hour and the ceiling only has to clear that. The per-subject
 * number is smaller still — nobody types their own password fifteen times in
 * an hour, and somebody who did wanted the reset link.
 */
export const SIGN_IN_PER_IP_PER_HOUR = 20;
export const SIGN_IN_PER_SUBJECT_PER_HOUR = 10;

// ---------------------------------------------------------------------------
// What a person is told
// ---------------------------------------------------------------------------

/**
 * The one answer for every way a sign-in can fail.
 *
 * No account, wrong password, an account that exists only through Orunbase
 * and has no password here, a platform that did not answer, a store that was
 * down: all of it lands on `SIGN_IN_REFUSAL` (AC0's string, unchanged). Any
 * distinction is an enumeration oracle, and the two that feel most harmless
 * are the worst: "no account with that address" and "that account has no
 * password" both answer a question the asker had no way to ask.
 *
 * What is NOT swallowed is the rate limit, because `AUTH_TOO_FAST` is a fact
 * about the caller's own behaviour rather than about who exists.
 */
export const SIGN_IN_UNAVAILABLE_NOTE =
  "Sign-in is unavailable right now. Nothing about your account has changed.";

/**
 * Said after a successful sign-out, and it is deliberately not "Signed out".
 *
 * The session is revoked HERE, so it is over on every device that was holding
 * it — which is not what somebody assumes from a sign-out button, and is
 * worth saying once rather than discovering.
 */
export const SIGN_OUT_NOTE = "Signed out. That session has ended everywhere it was open.";
