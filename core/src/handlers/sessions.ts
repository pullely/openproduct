// openproduct's own sessions (openproduct-launch AC2b).
//
// Three verbs — issue, resolve, revoke — and between them they are what makes
// R2's argument still true after AC2b. The platform door's cookie is safe
// because the gateway RE-RESOLVES its token on every request; this door's
// cookie is safe for the same reason and by the same mechanism, with core
// standing where the platform stands.
//
// ─── WHAT THESE HANDLERS DO NOT DECIDE ───────────────────────────────────
//
// Whether the person is who they say they are. That happened at the gateway,
// which had the password; by the time `issue` is called the answer is already
// yes. Core is asked to REMEMBER a decision, not to make one.
//
// So there is no password here, no address, no verifier comparison — and the
// only thing that could make this file dangerous is if a later milestone
// moved one of those in. The credential lives one route over and stays there.
//
// ─── LIVENESS IS DECIDED IN ONE PLACE, AND IT IS NOT SQL ─────────────────
//
// `resolveAuthSession` returns the row as stored, revoked and expired
// included, and `sessionUsable` in the contract decides. Putting the filter
// in the query would read as tidier and would put the rule where a second
// caller has to remember to repeat it — and the second caller who forgets is
// the one that accepts a revoked session.

import { sessionUsable, type AuthSessionRow } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";

export interface SessionHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    "issueAuthSession" | "resolveAuthSession" | "revokeAuthSession"
  >;
  now?: () => number;
}

/**
 * The hash a session token is stored under.
 *
 * SHA-256 and not argon2id, and the reasoning is the opposite of a password's:
 * this token is 32 bytes the gateway generated, so there is no low-entropy
 * guess for argon2id's cost to defend against — and unlike a password hash,
 * this one is computed on EVERY authenticated request. Paying argon2id there
 * would be a real cost for nothing.
 */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface IssueBody {
  token?: unknown;
  subjectId?: unknown;
  expiresAt?: unknown;
}

/**
 * POST /internal/openproduct/auth/sessions
 *
 * The gateway has checked a password and wants the decision remembered.
 *
 * IT SENDS THE TOKEN AND CORE HASHES IT, rather than the gateway hashing and
 * sending a digest. Both are defensible; this one is chosen so that the rule
 * "only the hash is ever stored" is enforced where the storing happens. A
 * caller that sent a digest could equally send a token by mistake, and the
 * table would accept it — the column is TEXT either way.
 */
export async function handleIssueSession(
  _env: Env,
  request: Request,
  requestId: string,
  deps: SessionHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  let body: IssueBody;
  try {
    body = (await request.json()) as IssueBody;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }

  const token = typeof body.token === "string" ? body.token : "";
  const subjectId = typeof body.subjectId === "string" ? body.subjectId.trim() : "";
  const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : "";
  if (token.length < 16 || subjectId.length === 0 || expiresAt.length === 0) {
    return validationError(requestId, {
      token: token.length < 16 ? ["A session token is required"] : [],
      subjectId: subjectId.length === 0 ? ["A subject is required"] : [],
      expiresAt: expiresAt.length === 0 ? ["An expiry is required"] : [],
    });
  }

  const at = new Date(deps.now?.() ?? Date.now()).toISOString();
  await deps.repo.issueAuthSession({
    tokenHash: await hashToken(token),
    subjectId,
    at,
    expiresAt,
  });

  // NOT AN ECHO. The gateway already holds the token — it generated it — and
  // sending it back would put it in a second response body and a second log
  // for no reason.
  return successResponse({ issued: true }, requestId, 201);
}

interface TokenBody {
  token?: unknown;
}

/**
 * POST /internal/openproduct/auth/sessions/resolve
 *
 * A POST for a read, because the token is the input and a token in a URL is a
 * token in an access log, a referrer and a browser history.
 *
 * ONE ANSWER FOR EVERY NON-SESSION: unknown, expired, revoked, malformed all
 * return `{ subjectId: null }` with a 200. There is nobody to protect from an
 * oracle here — the caller is the gateway — but the shapes would multiply for
 * no gain, and a 404 for "revoked" would invite a caller to treat it as
 * different from "expired", which it is not: in both cases the person signs
 * in again.
 */
export async function handleResolveSession(
  _env: Env,
  request: Request,
  requestId: string,
  deps: SessionHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  let body: TokenBody;
  try {
    body = (await request.json()) as TokenBody;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (token.length === 0) return successResponse({ subjectId: null }, requestId, 200);

  const row = await deps.repo.resolveAuthSession(await hashToken(token));
  if (!row) return successResponse({ subjectId: null }, requestId, 200);

  const usable = sessionUsable(row as AuthSessionRow, deps.now?.() ?? Date.now());
  return successResponse({ subjectId: usable ? row.subjectId : null }, requestId, 200);
}

/**
 * POST /internal/openproduct/auth/sessions/revoke
 *
 * ANSWERS THE SAME WHETHER OR NOT A ROW MOVED. Signing out an already-dead
 * session is a success from where the person is standing — they wanted to be
 * signed out and they are — and reporting otherwise would leave a failure on
 * a screen for somebody who got exactly what they asked for.
 */
export async function handleRevokeSession(
  _env: Env,
  request: Request,
  requestId: string,
  deps: SessionHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  let body: TokenBody;
  try {
    body = (await request.json()) as TokenBody;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (token.length > 0) {
    await deps.repo.revokeAuthSession(
      await hashToken(token),
      new Date(deps.now?.() ?? Date.now()).toISOString(),
    );
  }
  return successResponse({ revoked: true }, requestId, 200);
}
