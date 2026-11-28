// Agent credentials and the OAuth door (openproduct-mcp MC1).
//
// Core REMEMBERS and DECIDES what a database must decide: whether a code was
// already redeemed, whether a refresh token was replaced, whose credential
// this is. The gateway speaks OAuth on the wire; these handlers answer it in
// core's envelope, and an OAuth refusal travels as `data.oauthError` so the
// gateway can render RFC 6749's shape without guessing from a status.
//
// Tokens are minted HERE and hashed HERE, so the rule "only the hash is ever
// stored" is enforced where the storing happens (the sessions' reasoning).
// A token appears in exactly one response body — the one that hands it to
// the client — and is never echoed again.

import {
  AGENT_CREDENTIAL_ID_PREFIX,
  AGENT_LAST_USED_GRANULARITY_SECONDS,
  AGENT_LISTING_RESTRICTION_MAX,
  AGENT_REFRESH_PREFIX,
  AGENT_TOKEN_PREFIX,
  OAUTH_ACCESS_TTL_SECONDS,
  OAUTH_CLIENT_PREFIX,
  OAUTH_CODE_PREFIX,
  OAUTH_CODE_TTL_SECONDS,
  OAUTH_REFRESH_TTL_SECONDS,
  OAUTH_STATE_MAX,
  PERSONAL_TOKEN_DEFAULT_DAYS,
  PERSONAL_TOKEN_NAME_MAX,
  agentCredentialUsable,
  agentTokenHash,
  authorizationRedirect,
  isAgentRefreshToken,
  isAgentScope,
  isPersonalTokenLifetime,
  isPkceChallenge,
  mintOpaqueToken,
  normaliseScopes,
  personalTokenExpiry,
  pkceVerifies,
  readClientRegistration,
  redirectUriMatches,
  scopeParam,
  type AgentCredentialSummary,
  type AgentScope,
  type ResolvedAgentCredential,
} from "@openproduct/contracts";
import type { AgentCredentialRecord, OpenproductRepository } from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { profilePublicId } from "../ids.js";
import { requireUserSubject } from "./me.js";

export interface AgentCredentialDeps {
  repo: Pick<
    OpenproductRepository,
    | "registerOAuthClient"
    | "getOAuthClient"
    | "issueOAuthCode"
    | "consumeOAuthCode"
    | "linkOAuthCode"
    | "pruneOAuthStore"
    | "createAgentCredential"
    | "resolveAgentCredential"
    | "rotateAgentCredential"
    | "touchAgentCredential"
    | "listAgentCredentials"
    | "revokeAgentCredential"
    | "revokeAgentCredentialByTokenHash"
    | "listProfilesMaintainedBy"
  >;
  now?: () => number;
}

function nowOf(deps: AgentCredentialDeps): number {
  return deps.now?.() ?? Date.now();
}

function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function badBody(requestId: string): Response {
  return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
}

/** An OAuth refusal, in core's envelope; the gateway renders RFC 6749's shape. */
function oauthError(error: string, description: string, requestId: string, status = 400): Response {
  return successResponse({ oauthError: { error, description } }, requestId, status);
}

function summaryOf(row: AgentCredentialRecord): AgentCredentialSummary {
  return {
    id: row.id,
    kind: row.kind,
    clientName: row.clientName,
    scopes: normaliseScopes(row.scopes),
    listingIds: row.listingIds,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
  };
}

/**
 * A scope list as a person submits it: every entry known, at least one.
 * Null when it is not one.
 */
function scopesFrom(value: unknown): AgentScope[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every(isAgentScope)) return null;
  return normaliseScopes(value as string[]);
}

/**
 * A listing restriction: null for "every listing", or ids the subject is
 * on the crew of. A listing they are not on is refused, not dropped — an
 * agent restricted to a listing nobody let it touch is a restriction that
 * means nothing.
 */
async function listingsFrom(
  value: unknown,
  subjectId: string,
  deps: AgentCredentialDeps,
): Promise<{ ok: true; listingIds: string[] | null } | { ok: false; message: string }> {
  if (value === null || value === undefined) return { ok: true, listingIds: null };
  if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== "string")) {
    return { ok: false, message: "listings must be null or a list of listing ids" };
  }
  const wanted = [...new Set(value as string[])];
  if (wanted.length > AGENT_LISTING_RESTRICTION_MAX) {
    return { ok: false, message: `At most ${AGENT_LISTING_RESTRICTION_MAX} listings` };
  }
  const mine = new Set((await deps.repo.listProfilesMaintainedBy(subjectId)).map((p) => profilePublicId(p.id)));
  const foreign = wanted.filter((id) => !mine.has(id));
  if (foreign.length > 0) return { ok: false, message: "You can only give an agent listings you are on the crew of" };
  return { ok: true, listingIds: wanted };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/** POST /internal/openproduct/oauth/clients — RFC 7591, public clients only. */
export async function handleRegisterOAuthClient(
  _env: Env,
  request: Request,
  requestId: string,
  deps: AgentCredentialDeps,
): Promise<Response> {
  const body = await bodyOf(request);
  if (!body) return oauthError("invalid_client_metadata", "The registration must be a JSON object.", requestId);
  const reg = readClientRegistration(body);
  if ("error" in reg) return oauthError(reg.error, reg.description, requestId);
  const clientId = mintOpaqueToken(OAUTH_CLIENT_PREFIX, 16);
  const registeredAt = isoAt(nowOf(deps));
  // REGISTRATION IS SELF-SERVICE, so it is also where the tables are kept
  // bounded: each one sweeps a bounded batch of codes nobody can redeem and
  // clients that never connected anybody (security review, MC1).
  await deps.repo.pruneOAuthStore(registeredAt);
  await deps.repo.registerOAuthClient({
    clientId,
    clientName: reg.clientName,
    redirectUris: [...reg.redirectUris],
    registeredAt,
  });
  return successResponse(
    { client: { clientId, clientName: reg.clientName, redirectUris: reg.redirectUris, registeredAt } },
    requestId,
    201,
  );
}

/** GET /internal/openproduct/oauth/clients/{id} — what the consent screen names. */
export async function handleGetOAuthClient(
  _env: Env,
  clientId: string,
  requestId: string,
  deps: AgentCredentialDeps,
): Promise<Response> {
  const client = await deps.repo.getOAuthClient(clientId);
  if (!client) return errorResponse("not_found", "No such client", 404, requestId);
  return successResponse({ client }, requestId);
}

// ---------------------------------------------------------------------------
// The person's Allow
// ---------------------------------------------------------------------------

/**
 * POST /internal/openproduct/me/oauth-grants — the person allowed a client.
 *
 * EVERYTHING THE AUTHORIZE STEP CHECKED IS CHECKED AGAIN HERE, against the
 * stored client, because this request comes from a page anybody can craft
 * a URL to: the client exists, the redirect URI is one it registered, the
 * challenge is S256. Then a ten-minute code is remembered by hash, and the
 * answer is where to send the browser.
 */
export async function handleCreateOAuthGrant(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: AgentCredentialDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const body = await bodyOf(request);
  if (!body) return badBody(requestId);

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri : "";
  const client = clientId ? await deps.repo.getOAuthClient(clientId) : null;
  if (!client || !redirectUriMatches(client.redirectUris, redirectUri)) {
    // Never redirect to a URI we cannot vouch for (RFC 6749 §4.1.2.1).
    return validationError(requestId, { client: ["Unknown client or redirect URI"] });
  }
  const state = typeof body.state === "string" ? body.state : null;
  if (state !== null && state.length > OAUTH_STATE_MAX) {
    return validationError(requestId, { state: [`At most ${OAUTH_STATE_MAX} characters`] });
  }
  if (body.decision === "deny") {
    return successResponse(
      { redirectTo: authorizationRedirect(redirectUri, { error: "access_denied", errorDescription: "The person said no.", state }) },
      requestId,
    );
  }
  if (!isPkceChallenge(body.codeChallenge)) {
    return validationError(requestId, { codeChallenge: ["An S256 code challenge is required"] });
  }
  const scopes = scopesFrom(body.scopes);
  if (!scopes) return validationError(requestId, { scopes: ["Choose at least one thing the agent may do"] });
  const listings = await listingsFrom(body.listingIds, actor.subjectId, deps);
  if (!listings.ok) return validationError(requestId, { listings: [listings.message] });

  const now = nowOf(deps);
  const code = mintOpaqueToken(OAUTH_CODE_PREFIX);
  await deps.repo.issueOAuthCode({
    codeHash: await agentTokenHash(code),
    clientId: client.clientId,
    subjectId: actor.subjectId,
    redirectUri,
    codeChallenge: body.codeChallenge,
    scopes,
    listingIds: listings.listingIds,
    at: isoAt(now),
    expiresAt: isoAt(now + OAUTH_CODE_TTL_SECONDS * 1000),
  });
  return successResponse({ redirectTo: authorizationRedirect(redirectUri, { code, state }) }, requestId, 201);
}

// ---------------------------------------------------------------------------
// The token endpoint
// ---------------------------------------------------------------------------

async function tokenAnswer(
  requestId: string,
  access: string,
  refresh: string,
  scopes: readonly string[],
): Promise<Response> {
  return successResponse(
    {
      token: {
        accessToken: access,
        refreshToken: refresh,
        expiresIn: OAUTH_ACCESS_TTL_SECONDS,
        scope: scopeParam(normaliseScopes(scopes)),
      },
    },
    requestId,
  );
}

/**
 * POST /internal/openproduct/oauth/token — the code grant and the refresh
 * grant (RFC 6749 §4.1.3, §6), public clients with PKCE.
 *
 * ONE ANSWER FOR A BAD CODE: unknown, used, expired, another client's, the
 * wrong redirect URI or a verifier that does not answer the challenge are all
 * `invalid_grant`. A code is consumed by the read that inspected it, so a
 * failed redemption cannot be retried with a better guess.
 */
export async function handleOAuthToken(
  _env: Env,
  request: Request,
  requestId: string,
  deps: AgentCredentialDeps,
): Promise<Response> {
  const body = await bodyOf(request);
  if (!body) return oauthError("invalid_request", "The token request could not be read.", requestId);
  const grantType = body.grantType;
  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  if (!clientId) return oauthError("invalid_client", "client_id is required.", requestId, 401);
  const client = await deps.repo.getOAuthClient(clientId);
  if (!client) return oauthError("invalid_client", "Unknown client.", requestId, 401);
  const now = nowOf(deps);

  if (grantType === "authorization_code") {
    const code = typeof body.code === "string" ? body.code : "";
    const codeHash = code ? await agentTokenHash(code) : "";
    const consumed = code ? await deps.repo.consumeOAuthCode(codeHash, client.clientId, isoAt(now)) : null;
    const good =
      consumed !== null &&
      consumed.clientId === client.clientId &&
      Date.parse(consumed.expiresAt) > now &&
      consumed.redirectUri === body.redirectUri &&
      (await pkceVerifies(body.codeVerifier, consumed.codeChallenge));
    if (!good || consumed === null) return oauthError("invalid_grant", "The code is not valid.", requestId);

    const access = mintOpaqueToken(AGENT_TOKEN_PREFIX);
    const refresh = mintOpaqueToken(AGENT_REFRESH_PREFIX);
    const credentialId = mintOpaqueToken(AGENT_CREDENTIAL_ID_PREFIX, 12);
    await deps.repo.createAgentCredential({
      id: credentialId,
      subjectId: consumed.subjectId,
      kind: "oauth",
      clientId: client.clientId,
      clientName: client.clientName,
      tokenHash: await agentTokenHash(access),
      tokenExpiresAt: isoAt(now + OAUTH_ACCESS_TTL_SECONDS * 1000),
      refreshHash: await agentTokenHash(refresh),
      scopes: consumed.scopes,
      listingIds: consumed.listingIds,
      at: isoAt(now),
      expiresAt: isoAt(now + OAUTH_REFRESH_TTL_SECONDS * 1000),
    });
    // So that the code, presented again, revokes what it produced.
    await deps.repo.linkOAuthCode(codeHash, credentialId);
    return tokenAnswer(requestId, access, refresh, consumed.scopes);
  }

  if (grantType === "refresh_token") {
    const refresh = typeof body.refreshToken === "string" ? body.refreshToken : "";
    if (!isAgentRefreshToken(refresh)) return oauthError("invalid_grant", "The refresh token is not valid.", requestId);
    const access = mintOpaqueToken(AGENT_TOKEN_PREFIX);
    const nextRefresh = mintOpaqueToken(AGENT_REFRESH_PREFIX);
    const result = await deps.repo.rotateAgentCredential({
      refreshHash: await agentTokenHash(refresh),
      clientId: client.clientId,
      newTokenHash: await agentTokenHash(access),
      newRefreshHash: await agentTokenHash(nextRefresh),
      tokenExpiresAt: isoAt(now + OAUTH_ACCESS_TTL_SECONDS * 1000),
      expiresAt: isoAt(now + OAUTH_REFRESH_TTL_SECONDS * 1000),
      at: isoAt(now),
    });
    if (result.kind !== "rotated") {
      if (result.kind === "reused") {
        console.warn(JSON.stringify({ level: "warn", msg: "agent_refresh_reused", clientId: client.clientId, requestId }));
      }
      return oauthError("invalid_grant", "The refresh token is not valid.", requestId);
    }
    // A scope narrower than the grant may be asked for (RFC 6749 §6); the
    // stored grant does not change, so the narrower answer is the client's to keep.
    return tokenAnswer(requestId, access, nextRefresh, result.credential.scopes);
  }

  return oauthError("unsupported_grant_type", "authorization_code and refresh_token are supported.", requestId);
}

/** POST /internal/openproduct/oauth/revoke — RFC 7009: always 200. */
export async function handleOAuthRevoke(
  _env: Env,
  request: Request,
  requestId: string,
  deps: AgentCredentialDeps,
): Promise<Response> {
  const body = await bodyOf(request);
  const token = typeof body?.token === "string" ? body.token : "";
  if (token.length > 0) await deps.repo.revokeAgentCredentialByTokenHash(await agentTokenHash(token), isoAt(nowOf(deps)));
  return successResponse({ revoked: true }, requestId);
}

// ---------------------------------------------------------------------------
// Resolution — the gateway's hot path
// ---------------------------------------------------------------------------

/**
 * POST /internal/openproduct/agent-credentials/resolve — a POST for a read,
 * because the token is the input. One answer for every non-credential.
 */
export async function handleResolveAgentCredential(
  _env: Env,
  request: Request,
  requestId: string,
  deps: AgentCredentialDeps,
): Promise<Response> {
  const body = await bodyOf(request);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token.startsWith(AGENT_TOKEN_PREFIX)) return successResponse({ credential: null }, requestId);
  const row = await deps.repo.resolveAgentCredential(await agentTokenHash(token));
  const now = nowOf(deps);
  if (!row || !agentCredentialUsable({ revokedAt: row.revokedAt, expiresAt: row.tokenExpiresAt }, now)) {
    return successResponse({ credential: null }, requestId);
  }
  if (row.expiresAt !== null && Date.parse(row.expiresAt) <= now) return successResponse({ credential: null }, requestId);
  await deps.repo.touchAgentCredential(row.id, isoAt(now), AGENT_LAST_USED_GRANULARITY_SECONDS);
  const credential: ResolvedAgentCredential = {
    credentialId: row.id,
    subjectId: row.subjectId,
    kind: row.kind,
    clientName: row.clientName,
    scopes: normaliseScopes(row.scopes),
    listingIds: row.listingIds,
  };
  return successResponse({ credential }, requestId);
}

// ---------------------------------------------------------------------------
// Connected agents — the person's own list
// ---------------------------------------------------------------------------

/** GET /internal/openproduct/me/agent-credentials */
export async function handleListAgentCredentials(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: AgentCredentialDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const rows = await deps.repo.listAgentCredentials(actor.subjectId, isoAt(nowOf(deps)));
  return successResponse({ credentials: rows.map(summaryOf) }, requestId);
}

/**
 * POST /internal/openproduct/me/agent-credentials — a personal token.
 * The token is in this response and nowhere else, ever.
 */
export async function handleMintPersonalToken(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: AgentCredentialDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const body = await bodyOf(request);
  if (!body) return badBody(requestId);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const scopes = scopesFrom(body.scopes);
  const days = body.days === undefined ? PERSONAL_TOKEN_DEFAULT_DAYS : body.days;
  const fields: Record<string, string[]> = {};
  if (name.length === 0 || name.length > PERSONAL_TOKEN_NAME_MAX) fields.name = [`A name of 1 to ${PERSONAL_TOKEN_NAME_MAX} characters`];
  if (!scopes) fields.scopes = ["Choose at least one thing the token may do"];
  if (!isPersonalTokenLifetime(days)) fields.days = ["30, 90 or 365 days, or no expiry"];
  if (Object.keys(fields).length > 0 || !scopes || !isPersonalTokenLifetime(days)) return validationError(requestId, fields);
  const listings = await listingsFrom(body.listingIds, actor.subjectId, deps);
  if (!listings.ok) return validationError(requestId, { listings: [listings.message] });

  const now = nowOf(deps);
  const token = mintOpaqueToken(AGENT_TOKEN_PREFIX);
  const expiresAt = personalTokenExpiry(days, now);
  const id = mintOpaqueToken(AGENT_CREDENTIAL_ID_PREFIX, 12);
  await deps.repo.createAgentCredential({
    id,
    subjectId: actor.subjectId,
    kind: "personal",
    clientId: null,
    clientName: name,
    tokenHash: await agentTokenHash(token),
    tokenExpiresAt: expiresAt,
    refreshHash: null,
    scopes,
    listingIds: listings.listingIds,
    at: isoAt(now),
    expiresAt,
  });
  const credential: AgentCredentialSummary = {
    id,
    kind: "personal",
    clientName: name,
    scopes,
    listingIds: listings.listingIds,
    createdAt: isoAt(now),
    lastUsedAt: null,
    expiresAt,
  };
  return successResponse({ credential, token }, requestId, 201);
}

/** DELETE /internal/openproduct/me/agent-credentials/{id} — idempotent for the owner. */
export async function handleRevokeMyAgentCredential(
  _env: Env,
  credentialId: string,
  requestId: string,
  actor: ActorContext,
  deps: AgentCredentialDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  await deps.repo.revokeAgentCredential(actor.subjectId, credentialId, isoAt(nowOf(deps)));
  // The same answer whether or not a row moved: somebody else's id and an
  // already-revoked one are both "not connected", which is what was asked for.
  return successResponse({ revoked: true }, requestId);
}
