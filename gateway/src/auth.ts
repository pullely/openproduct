// Sign-up and verification, at the only layer that may see an address (AC1).
//
// ─── WHY THIS IS IN THE GATEWAY AND NOT IN CORE ──────────────────────────
//
// Because only the gateway can reach the platform. Core has a Hyperdrive
// binding and nothing else — an existing boundary on this estate, not one AC1
// drew — so the address a person types is forwarded from HERE and is gone when
// this request ends.
//
// That makes I3 architectural rather than careful. Core cannot receive an
// address; AC0's schema has no column for one; and this file, which does hold
// one for the length of one request, has no database to put it in. Three
// layers, and the address only exists in the one that cannot store it.
//
// ─── THE PLATFORM ALREADY DOES THIS ──────────────────────────────────────
//
// AC0 designed a seam capability to ask for. It already exists: the identity
// worker's magic-link login holds the address, sends the mail, and mints or
// finds the subject. openproduct uses the estate's own account-creation path
// rather than building a second one beside it — which is also why OL-7's "one
// subject id per person, whichever door they used" needs no merge rule. There
// is only one door that makes subjects.
//
// ─── WHAT COMES BACK IS DELIBERATELY THROWN AWAY ─────────────────────────
//
// `login/complete` answers with `user.email` alongside `user.id`. The platform
// has no reason to know openproduct's rules, so openproduct narrows the answer
// itself, in one place, through `narrowCompletion`. `deliverDigests` already
// applies exactly this discipline outbound — "anything more in the body is
// ignored rather than logged, because the only shapes it could take that we do
// not already have are facts about how people are reached". This is inbound.

import {
  AUTH_AMBIGUOUS_ANSWER,
  AUTH_TOO_FAST,
  PASSWORD_REFUSAL,
  PLATFORM_LOGIN_COMPLETE_PATH,
  PLATFORM_LOGIN_START_PATH,
  SESSION_TOKEN_BYTES,
  SESSION_TOKEN_PREFIX,
  SIGN_IN_REFUSAL,
  SIGN_IN_UNAVAILABLE_NOTE,
  SIGN_OUT_NOTE,
  TOKEN_SPENT_NOTE,
  isOpenproductSessionToken,
  narrowCompletion,
  passwordAcceptable,
  plausibleAddress,
  sessionExpiry,
} from "@openproduct/contracts";

import type { Env } from "./env.js";
import { anonKey, takeToken, withRetryAfter } from "./ratelimit.js";

/** What core is told, and it is never an address. */
interface CoreSignUp {
  challengeId: string;
  verifier: string;
}

/**
 * AC2b's dependencies, injected for the same two reasons AC1's are: a test
 * must not pay argon2id's 82ms on every case, and the two calls that leave
 * this worker — the seam and the hash — should be visible in one place rather
 * than reached for inside a branch.
 */
export interface SignInDeps {
  resolveSubjectByEmail: (env: Env, email: string) => Promise<string | null>;
  verifyPassword: (plaintext: string, encoded: string) => Promise<boolean>;
  now?: () => number;
}

export interface AuthDeps {
  /** Hash a password. Injected so a test does not pay argon2id's cost on
   *  every case — and so the one place it is called is visible. */
  hashPassword: (plaintext: string) => Promise<string>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

function json(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify({ data: body, meta: { requestId } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * POST /v1/openproduct/auth/sign-up  { email, password }
 *
 * ANSWERS `202 AUTH_AMBIGUOUS_ANSWER` FOR EVERY OUTCOME BUT TWO. A known
 * address, an unknown one, a platform that refused, a core that was down: all
 * the same. The two exceptions are a malformed address and a password below
 * the floor — both of which are facts about what the CALLER just typed rather
 * than about who exists, so saying them reveals nothing and not saying them
 * would be cruel.
 */
export async function handleSignUp(
  request: Request,
  env: Env,
  core: Fetcher,
  requestId: string,
  deps: AuthDeps,
): Promise<Response> {
  const limited = await takeToken("authSignUp", anonKey(request), env);
  if (!limited.ok) return withRetryAfter(json({ note: AUTH_TOO_FAST }, 429, requestId), limited);

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ note: AUTH_AMBIGUOUS_ANSWER }, 202, requestId);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  // A MALFORMED ADDRESS IS NOT AN ORACLE. "That is not an address" is a fact
  // about the string in the box, not about whether anybody holds it.
  if (!plausibleAddress(email)) {
    return json({ note: AUTH_AMBIGUOUS_ANSWER }, 202, requestId);
  }
  // THE PASSWORD FLOOR IS SAID OUT LOUD, and it is the one refusal on this
  // path that names its reason. Swallowing it would leave somebody staring at
  // "check your inbox" for mail that will arrive and a password that will
  // never work.
  if (!passwordAcceptable(password)) {
    return json({ note: PASSWORD_REFUSAL }, 422, requestId);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = (env.PLATFORM_API_URL ?? "").replace(/\/+$/, "");
  if (!base) return json({ note: AUTH_AMBIGUOUS_ANSWER }, 202, requestId);

  // ─── the address leaves, and this is the only line it leaves on ────────
  let challengeId: string | null = null;
  try {
    const started = await fetchImpl(`${base}${PLATFORM_LOGIN_START_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (started.ok) {
      const parsed = (await started.json()) as { data?: { challengeId?: unknown } };
      const id = parsed?.data?.challengeId;
      if (typeof id === "string" && id.length > 0) challengeId = id;
    }
  } catch {
    // Swallowed into the same answer. A platform that was unreachable and an
    // address nobody holds must not be distinguishable from out here.
  }

  // HASHED HERE, WHILE THE PLAINTEXT STILL EXISTS AND BEFORE IT CROSSES ANY
  // BOUNDARY. Core is handed a verifier; nothing downstream ever sees what
  // somebody typed.
  if (challengeId !== null) {
    try {
      const payload: CoreSignUp = {
        challengeId,
        verifier: await deps.hashPassword(password),
      };
      await core.fetch("https://openproduct.internal/internal/openproduct/auth/sign-up", {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify(payload),
      });
    } catch {
      // Same answer. The mail is already on its way, so "check your inbox" is
      // true; what they lose is the password, and they find out when it does
      // not work.
    }
  }

  // THE CHALLENGE ID IS RETURNED, and it is not secret — the platform's own
  // code says so. It is the handle the verify step needs, and the actual
  // secret is the code in the mail, which openproduct never sees until it is
  // typed back.
  return json({ note: AUTH_AMBIGUOUS_ANSWER, challengeId }, 202, requestId);
}

/**
 * POST /v1/openproduct/auth/verify  { challengeId, code }
 *
 * Completes the platform's challenge, narrows the answer to a subject id, and
 * asks core to spend openproduct's row and write the password against it.
 */
export async function handleVerify(
  request: Request,
  env: Env,
  core: Fetcher,
  requestId: string,
  deps: AuthDeps,
): Promise<Response> {
  const limited = await takeToken("authVerify", anonKey(request), env);
  if (!limited.ok) return withRetryAfter(json({ note: AUTH_TOO_FAST }, 429, requestId), limited);

  let body: { challengeId?: unknown; code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ note: TOKEN_SPENT_NOTE }, 400, requestId);
  }

  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (challengeId.length === 0 || code.length === 0) {
    return json({ note: TOKEN_SPENT_NOTE }, 400, requestId);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = (env.PLATFORM_API_URL ?? "").replace(/\/+$/, "");
  if (!base) return json({ note: TOKEN_SPENT_NOTE }, 400, requestId);

  let completion: { subjectId: string } | null = null;
  let token: string | null = null;
  try {
    const done = await fetchImpl(`${base}${PLATFORM_LOGIN_COMPLETE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeId, code }),
    });
    if (done.ok) {
      const parsed = (await done.json()) as { data?: { token?: unknown } };
      // NARROWED IN ONE PLACE. Everything but the subject id is dropped here
      // — including `user.email`, which the platform sends because it has no
      // reason not to.
      completion = narrowCompletion(parsed);
      const t = parsed?.data?.token;
      if (typeof t === "string") token = t;
    }
  } catch {
    completion = null;
  }

  // ONE ANSWER FOR A WRONG CODE, AN EXPIRED CHALLENGE AND ONE THAT NEVER
  // EXISTED. Telling them apart is an oracle, and the action is the same.
  if (!completion) return json({ note: TOKEN_SPENT_NOTE }, 400, requestId);

  let credentialSet = false;
  try {
    const res = await core.fetch("https://openproduct.internal/internal/openproduct/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": requestId },
      body: JSON.stringify({ challengeId, subjectId: completion.subjectId }),
    });
    if (res.ok) {
      const parsed = (await res.json()) as { data?: { credentialSet?: unknown } };
      credentialSet = parsed?.data?.credentialSet === true;
    }
  } catch {
    // The session below still stands. They are signed in; the password is
    // what did not get set, and `credentialSet: false` says so.
  }

  // THE SESSION IS THE POINT, AND IT IS HANDED BACK EITHER WAY. Somebody who
  // completed the challenge has proved they can read the mail — refusing them
  // a session because openproduct's own row was already spent would punish
  // them for clicking twice.
  return json({ token, credentialSet }, 200, requestId);
}

/**
 * POST /v1/openproduct/auth/sign-in  { email, password }
 *
 * The one path that needs both halves of AC2: the platform to say WHO an
 * address is, and core to say what their password is.
 *
 * ─── ONE REFUSAL FOR EVERY FAILURE, AND THE LIST IS LONG ────────────────
 *
 * No such address; an address the platform knows but which has no password
 * here (somebody who only ever used Continue with Orunbase); the wrong
 * password; a corrupt verifier; a seam key that was never delivered; a
 * platform that did not answer; a core that did not answer. All of it is
 * `SIGN_IN_REFUSAL`.
 *
 * The two that feel harmless are the worst. "No account with that address"
 * and "that account has no password here" both answer a question the asker
 * had no way to ask, and the second is worse than the first because it
 * confirms the address AND describes how the person signs in.
 *
 * ─── THE WORK IS DONE EVEN WHEN THERE IS NOTHING TO CHECK ───────────────
 *
 * A sign-in that returned early on "no credential" would answer in a few
 * milliseconds, and one with a real account would answer in ~82ms, because
 * argon2id is deliberately expensive. That difference IS the oracle the
 * paragraph above is trying to close, arriving through the clock instead of
 * the body. So an unknown subject is verified against a decoy verifier and
 * the answer is thrown away.
 */
export async function handleSignIn(
  request: Request,
  env: Env,
  core: Fetcher,
  requestId: string,
  deps: SignInDeps,
): Promise<Response> {
  // BY IP FIRST, BEFORE ANYTHING CROSSES THE SEAM. A scripted attempt costs
  // this worker a map lookup and costs the platform nothing.
  const limited = await takeToken("authSignIn", anonKey(request), env);
  if (!limited.ok) return withRetryAfter(json({ note: AUTH_TOO_FAST }, 429, requestId), limited);

  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ note: SIGN_IN_REFUSAL }, 401, requestId);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  // A MALFORMED ADDRESS IS NOT AN ORACLE — same reasoning as sign-up. It is a
  // fact about the string in the box, and refusing it here spares the seam a
  // call that could not have succeeded.
  if (!plausibleAddress(email) || password.length === 0) {
    return json({ note: SIGN_IN_REFUSAL }, 401, requestId);
  }

  const subjectId = await deps.resolveSubjectByEmail(env, email);

  // BY SUBJECT, SECOND. This is the bucket that stops a credential-stuffing
  // run spread across many IPs, and it can only be taken once the address has
  // resolved. `AUTH_TOO_FAST` rather than the refusal, because a velocity
  // answer is a fact about the caller's own behaviour — and one that only
  // somebody hammering a real account can provoke, which is who it is for.
  const accountLimited = subjectId === null ? null : await takeToken("authSignInSubject", subjectId, env);
  if (accountLimited && !accountLimited.ok) {
    return withRetryAfter(json({ note: AUTH_TOO_FAST }, 429, requestId), accountLimited);
  }

  const verifier = subjectId === null ? null : await readVerifier(core, subjectId, requestId);

  // THE DECOY. `verifyPassword` runs either way, so the response time of an
  // unknown address matches a known one. The result is discarded — this is
  // spending time on purpose, which is the only way to not leak it.
  if (verifier === null) {
    await deps.verifyPassword(password, DECOY_VERIFIER);
    return json({ note: SIGN_IN_REFUSAL }, 401, requestId);
  }
  if (!(await deps.verifyPassword(password, verifier))) {
    return json({ note: SIGN_IN_REFUSAL }, 401, requestId);
  }

  // ─── they are who they said, and this is where the session begins ─────
  const token = `${SESSION_TOKEN_PREFIX}${randomToken()}`;
  const now = deps.now?.() ?? Date.now();
  const expiresAt = sessionExpiry(now);
  try {
    const res = await core.fetch(
      "https://openproduct.internal/internal/openproduct/auth/sessions",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify({ token, subjectId: subjectId!, expiresAt }),
      },
    );
    if (!res.ok) throw new Error(`session mint failed: ${res.status}`);
  } catch {
    // NOT `SIGN_IN_REFUSAL`. They typed the right password and this is our
    // fault, so it says so — and it says nothing about the account, because
    // by this point the password was already correct and there is no longer
    // anything to hide from this caller.
    return json({ note: SIGN_IN_UNAVAILABLE_NOTE }, 503, requestId);
  }

  return json({ token, expiresAt }, 200, requestId);
}

/**
 * POST /v1/openproduct/auth/sign-out  { }  (bearer carries the session)
 *
 * ONLY EVER ENDS ONE OF OUR OWN. A platform token arriving here is answered
 * successfully and nothing happens, because ending a platform session is the
 * platform's to do and quietly failing at it would be worse than not trying:
 * somebody would believe they had signed out.
 */
export async function handleSignOut(
  request: Request,
  _env: Env,
  core: Fetcher,
  requestId: string,
): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";

  if (isOpenproductSessionToken(token)) {
    try {
      await core.fetch(
        "https://openproduct.internal/internal/openproduct/auth/sessions/revoke",
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-request-id": requestId },
          body: JSON.stringify({ token }),
        },
      );
    } catch {
      // Swallowed: the cookie is cleared by the caller either way, so the
      // person IS signed out of this browser. What a failure here costs is
      // the row living until it expires, which the sweep collects.
    }
  }

  return json({ note: SIGN_OUT_NOTE }, 200, requestId);
}

/** Core's credential read, narrowed to the one field and never throwing. */
async function readVerifier(
  core: Fetcher,
  subjectId: string,
  requestId: string,
): Promise<string | null> {
  try {
    const res = await core.fetch(
      `https://openproduct.internal/internal/openproduct/credentials/${encodeURIComponent(subjectId)}`,
      { method: "GET", headers: { "x-request-id": requestId } },
    );
    if (!res.ok) return null;
    const parsed = (await res.json()) as { data?: { verifier?: unknown } };
    const v = parsed?.data?.verifier;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * A real argon2id verifier at AC0's parameters, for a password nobody holds.
 *
 * IT HAS TO BE REAL. A short or malformed string would make `argon2Verify`
 * throw immediately, and the swallow-to-false in `password.ts` would return
 * in microseconds — which is the exact timing difference this exists to
 * remove. The password it encodes is not written down anywhere, and it does
 * not matter if it were: nothing accepts this verifier, because no row holds
 * it.
 */
const DECOY_VERIFIER =
  "$argon2id$v=19$m=19456,t=2,p=1$c2VhbXNoaWZ0ZGVjb3lzYWx0$" +
  "N0RiP1oKq7Wl8pQ2vXyZ3mJt5aHc9eFgKuLnRsTvWxY";

/** 32 random bytes as base64url — the same shape the web's own tokens use. */
function randomToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
