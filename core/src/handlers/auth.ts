// Sign-up and verification, minus the address (openproduct-launch AC1).
//
// ─── WHAT THIS FILE DOES NOT HAVE, AND CANNOT ────────────────────────────
//
// An address. Not a parameter, not a variable, not a line of validation.
//
// That is not restraint, it is architecture. Only the GATEWAY can reach the
// platform's API — core has a database binding and nothing else, which is an
// existing boundary on this estate rather than one AC1 invented. So the
// address is typed by a person, forwarded to the platform by the gateway, and
// gone when that request ends. It never arrives here, and AC0's schema has
// nowhere to put it if it did.
//
// What crosses into core is a CHALLENGE HASH, a HASHED PASSWORD and, on the
// way back, a SUBJECT ID.
//
// ─── WHY THE PLATFORM'S MAGIC LINK AND NOT A SECOND ONE ──────────────────
//
// AC0 designed a seam capability to ask the platform for. AC1 went looking for
// where to add it and found it already there: the identity worker has
// magic-link login, which holds the address, sends the mail, and mints or
// finds the subject.
//
// That settles OL-7's hardest requirement for free. "One subject id per
// person, whichever door they used" was going to need a merge rule keyed on a
// verified address — the one piece of state openproduct refuses to hold. It
// needs none: the platform is the only thing on this estate that ever creates
// a subject, so signing up here with a password and continuing with Orunbase
// later reach the same account because there was only ever one way to make it.
//
// ─── THE TWO HANDLERS SAY THE SAME THING WHATEVER HAPPENS ────────────────
//
// Sign-up answers `AUTH_AMBIGUOUS_ANSWER` for a known address, an unknown one,
// a duplicate attempt and a challenge that could not be created. Here that is
// nearly free — core cannot tell most of them apart, because it never learns
// which addresses exist. The residue this discipline exists for is the token
// outcomes, which core CAN distinguish and must not.

import {
  AUTH_AMBIGUOUS_ANSWER,
  TOKEN_SPENT_NOTE,
  credentialTokenExpiry,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";

export interface AuthHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    "issueCredentialToken" | "consumeCredentialToken" | "writeCredential" | "getCredential"
  >;
  now?: () => number;
}

interface SignUpBody {
  challengeId?: unknown;
  verifier?: unknown;
}

/**
 * POST /internal/openproduct/auth/sign-up
 *
 * The gateway has already asked the platform to send the mail and has the
 * challenge id back. This remembers which password is waiting behind it.
 *
 * ANSWERS THE SAME THING WHETHER OR NOT THE ROW WAS WRITTEN. A challenge that
 * already had a password behind it (a retry, or a second attempt on the same
 * mail) writes nothing and answers identically — telling those apart would say
 * "somebody already started signing up with this address", which is the
 * enumeration this whole design exists to make impossible.
 */
export async function handleSignUp(
  _env: Env,
  request: Request,
  requestId: string,
  deps: AuthHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  let body: SignUpBody;
  try {
    body = (await request.json()) as SignUpBody;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }

  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
  const verifier = typeof body.verifier === "string" ? body.verifier : "";
  // A SHAPE CHECK, NOT A PASSWORD CHECK. The password's own rule
  // (`passwordAcceptable`) is applied at the gateway, where the plaintext
  // still exists; by here it is a hash and its length says nothing about the
  // password's. What is refused here is a caller that constructed the request
  // wrongly, and the schema refuses it again.
  if (challengeId.length === 0 || verifier.length < 16) {
    return validationError(requestId, {
      challengeId: challengeId.length === 0 ? ["A challenge is required"] : [],
      verifier: verifier.length < 16 ? ["A verifier is required"] : [],
    });
  }

  const now = deps.now?.() ?? Date.now();
  // SWALLOWED, AND THE ANSWER IS THE SAME. A store that was unavailable and a
  // challenge that already had a password behind it both reach the person as
  // "check your inbox" — which is TRUE in both cases, because the platform has
  // already sent the mail either way. What they lose is the password they
  // typed, and they find that out by it not working, at which point the reset
  // path is the answer. That is worse than a specific error and better than an
  // oracle.
  try {
    await deps.repo.issueCredentialToken({
      tokenHash: await hashChallenge(challengeId),
      purpose: "verify",
      subjectId: null,
      verifier,
      at: new Date(now).toISOString(),
      expiresAt: credentialTokenExpiry("verify", now),
    });
  } catch {
    // Deliberately swallowed — see above.
  }

  return successResponse({ note: AUTH_AMBIGUOUS_ANSWER }, requestId, 202);
}

interface VerifyBody {
  challengeId?: unknown;
  subjectId?: unknown;
}

/**
 * POST /internal/openproduct/auth/verify
 *
 * The gateway has completed the platform's challenge and narrowed the answer
 * to a subject id. This spends openproduct's own row and writes the password
 * against that subject.
 *
 * THE ORDER MATTERS AND IT IS THIS ONE: consume first, write second. Consuming
 * is the atomic step — one `UPDATE … WHERE consumed_at IS NULL` — so two
 * clicks on the same link race there and exactly one wins. Writing first would
 * mean the loser of that race had already written a password.
 */
export async function handleVerify(
  _env: Env,
  request: Request,
  requestId: string,
  deps: AuthHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }

  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
  const subjectId = typeof body.subjectId === "string" ? body.subjectId.trim() : "";
  if (challengeId.length === 0 || subjectId.length === 0) {
    return validationError(requestId, {
      challengeId: challengeId.length === 0 ? ["A challenge is required"] : [],
      subjectId: subjectId.length === 0 ? ["A subject is required"] : [],
    });
  }

  const at = new Date(deps.now?.() ?? Date.now()).toISOString();
  const spent = await deps.repo.consumeCredentialToken(
    await hashChallenge(challengeId),
    "verify",
    at,
  );

  // ONE ANSWER FOR FOUR OUTCOMES — already used, expired, wrong purpose, never
  // issued. Telling them apart is an oracle, and the action is the same in all
  // four: ask for a new link.
  //
  // 200 RATHER THAN 4xx, and that is deliberate. The person completing this
  // has ALREADY proved they can read the mail — the platform's challenge said
  // so, and the gateway has already minted them a session. They are signed in;
  // what they have lost is the password they typed. An error status here would
  // put a failure in front of somebody the product has just let in.
  if (!spent || spent.verifier === null) {
    return successResponse({ credentialSet: false, note: TOKEN_SPENT_NOTE }, requestId, 200);
  }

  await deps.repo.writeCredential({ subjectId, verifier: spent.verifier, at });
  return successResponse({ credentialSet: true }, requestId, 200);
}

/**
 * GET /internal/openproduct/credentials/{subjectId}
 *
 * Hands the gateway a stored verifier so it can check a typed password
 * against it (AC2b).
 *
 * ─── THE VERIFIER COMES OUT; THE PASSWORD NEVER GOES IN ─────────────────
 *
 * The other shape was available and is worse: a `POST …/check { subjectId,
 * password }` that compares here. It would mean the plaintext somebody typed
 * crossed into core — the one process with a database binding — and AC1's
 * whole arrangement is that it never does. A hash leaving is a smaller fact
 * than a password arriving.
 *
 * That this route exists at all is bounded by where it lives: core is
 * reachable only over the gateway's `CORE` service binding. There is no
 * public route to it and no second holder of that binding.
 *
 * ABSENT IS A 200 WITH NULL, not a 404. The caller must answer identically
 * for "no such person" and "wrong password", and giving it two status codes
 * to conflate is how that promise gets broken by a refactor.
 */
export async function handleReadCredential(
  _env: Env,
  request: Request,
  requestId: string,
  subjectId: string,
  deps: Pick<AuthHandlerDeps, "repo">,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  if (subjectId.length === 0) {
    return validationError(requestId, { subjectId: ["A subject is required"] });
  }
  const found = await deps.repo.getCredential(subjectId);
  return successResponse({ verifier: found?.verifier ?? null }, requestId, 200);
}

/**
 * The hash a challenge is stored under.
 *
 * SHA-256, AND NOT A PASSWORD HASH. A challenge id is a high-entropy
 * identifier the platform generated, not something a person chose, so there is
 * nothing here for argon2id's cost to defend against — its expense buys
 * resistance to guessing a low-entropy secret, and this is not one.
 *
 * It is hashed at all so that a row read out of this table cannot be joined
 * back to a challenge id seen in a log somewhere else.
 */
async function hashChallenge(challengeId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(challengeId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
