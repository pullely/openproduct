// The OAuth door for MCP clients (openproduct-mcp MC1).
//
// ─── WHAT THIS FILE IS ────────────────────────────────────────────────────
//
// The wire half of an OAuth 2.1 authorization server, as far as the MCP
// authorization spec needs one and no further:
//
//   /.well-known/oauth-protected-resource      RFC 9728 — what /mcp/me is
//   /.well-known/oauth-authorization-server    RFC 8414 — this server
//   POST /oauth/register                       RFC 7591 — public clients
//   GET  /oauth/authorize                      checks, then the consent page
//   POST /oauth/token                          code + PKCE, refresh rotation
//   POST /oauth/revoke                         RFC 7009
//   GET  /v1/openproduct/oauth/clients/{id}    what the consent page names
//
// CORE DECIDES; THIS FILE TRANSLATES. Whether a code was used, a refresh
// token replaced, a redirect URI registered — those are core's answers, in
// core's envelope. Here they become RFC 6749's JSON and status codes.
//
// ─── NO COOKIES, SO OPEN CORS ─────────────────────────────────────────────
//
// Nothing here reads a cookie or a session: the token endpoint authenticates
// with the code and its PKCE verifier, registration with nothing at all. So
// a browser-based MCP client on any origin may call them, and they answer
// `access-control-allow-origin: *`. The consent step, which IS a person's,
// happens on the website under the website's own session.

import {
  AUTHORIZATION_SERVER_METADATA_PATH,
  CONSENT_PAGE_PATH,
  MCP_SIGNED_IN_PATH,
  OAUTH_AUTHORIZE_PATH,
  OAUTH_REGISTER_PATH,
  OAUTH_REVOKE_PATH,
  OAUTH_STATE_MAX,
  OAUTH_TOKEN_PATH,
  PROTECTED_RESOURCE_METADATA_PATH,
  authorizationServerMetadata,
  isPkceChallenge,
  parseScopeParam,
  protectedResourceMetadata,
  redirectUriMatches,
  scopeParam,
} from "@openproduct/contracts";

import type { Env } from "./env.js";
import { errorResponse } from "./http.js";
import { anonKey, networkKey, takeToken, withRetryAfter } from "./ratelimit.js";

const CLIENT_READ_RE = /^\/v1\/openproduct\/oauth\/clients\/(ocl_[A-Za-z0-9_-]{1,64})$/;

/** Every path this file answers. */
export function isOAuthPath(pathname: string): boolean {
  return (
    pathname === PROTECTED_RESOURCE_METADATA_PATH ||
    pathname === `${PROTECTED_RESOURCE_METADATA_PATH}${MCP_SIGNED_IN_PATH}` ||
    pathname === AUTHORIZATION_SERVER_METADATA_PATH ||
    pathname === OAUTH_REGISTER_PATH ||
    pathname === OAUTH_AUTHORIZE_PATH ||
    pathname === OAUTH_TOKEN_PATH ||
    pathname === OAUTH_REVOKE_PATH ||
    CLIENT_READ_RE.test(pathname)
  );
}

/** The paths any origin may call from a browser (see the header). */
export function isOpenCorsPath(pathname: string): boolean {
  return (
    isOAuthPath(pathname) && pathname !== OAUTH_AUTHORIZE_PATH && !CLIENT_READ_RE.test(pathname)
  ) || pathname === MCP_SIGNED_IN_PATH;
}

/**
 * This API's public origin: the configured one where there is one, else the
 * origin the request arrived on (a preview deployment, a test). The issuer
 * a client checks has to be the origin it is talking to.
 */
export function apiOriginOf(request: Request, env: Env): string {
  const configured = (env.PUBLIC_API_ORIGIN ?? "").trim().replace(/\/+$/, "");
  return configured.length > 0 ? configured : new URL(request.url).origin;
}

function openJson(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      "access-control-allow-origin": "*",
      ...extra,
    },
  });
}

function oauthErrorResponse(error: string, description: string, status = 400): Response {
  return openJson({ error, error_description: description }, status);
}

async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(body ?? {})) if (typeof v === "string") out[k] = v;
      return out;
    }
    const text = await request.text();
    const out: Record<string, string> = {};
    new URLSearchParams(text).forEach((value, key) => {
      out[key] = value;
    });
    return out;
  } catch {
    return {};
  }
}

interface CoreAnswer {
  status: number;
  data: Record<string, unknown> | null;
}

async function askCore(core: Fetcher, path: string, init: RequestInit): Promise<CoreAnswer | null> {
  try {
    const res = await core.fetch(new URL(path, "https://openproduct.internal").toString(), init);
    const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    return { status: res.status, data: body?.data ?? null };
  } catch {
    return null;
  }
}

function postJson(body: unknown, requestId: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify(body),
  };
}

async function gate(bucket: "oauthRegister" | "oauthToken", request: Request, env: Env): Promise<Response | null> {
  const verdicts =
    bucket === "oauthRegister"
      ? [await takeToken("oauthRegister", networkKey(request), env), await takeToken("oauthRegisterAll", "all", env)]
      : [await takeToken("oauthToken", anonKey(request), env)];
  const refused = verdicts.find((v) => !v.ok);
  if (!refused || refused.ok) return null;
  return withRetryAfter(oauthErrorResponse("temporarily_unavailable", "Too many requests. Retry-After says when.", 429), refused);
}

interface StoredClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  registeredAt: string;
}

async function readClient(core: Fetcher, clientId: string, requestId: string): Promise<StoredClient | null | "unavailable"> {
  const answer = await askCore(core, `/internal/openproduct/oauth/clients/${clientId}`, {
    method: "GET",
    headers: { "x-request-id": requestId },
  });
  if (!answer) return "unavailable";
  if (answer.status === 404) return null;
  if (answer.status !== 200) return "unavailable";
  return (answer.data?.client as StoredClient | undefined) ?? null;
}

/** A 302 built by hand: `Response.redirect` refuses a native app's own scheme. */
function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } });
}

/** Where a client's own error page would be: a page with no redirect. */
function authorizeRefusal(message: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Cannot connect</title><p>${message.replace(/[<>&"]/g, "")}</p>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

export async function handleOAuth(request: Request, env: Env, requestId: string): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const origin = apiOriginOf(request, env);

  // ── discovery: pure documents, no core ──
  if (pathname === PROTECTED_RESOURCE_METADATA_PATH || pathname === `${PROTECTED_RESOURCE_METADATA_PATH}${MCP_SIGNED_IN_PATH}`) {
    if (request.method !== "GET" && request.method !== "HEAD") return oauthErrorResponse("invalid_request", "GET only.", 405);
    return openJson(protectedResourceMetadata(origin), 200, { "cache-control": "public, max-age=3600" });
  }
  if (pathname === AUTHORIZATION_SERVER_METADATA_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD") return oauthErrorResponse("invalid_request", "GET only.", 405);
    return openJson(authorizationServerMetadata(origin), 200, { "cache-control": "public, max-age=3600" });
  }

  if (!env.CORE) return oauthErrorResponse("temporarily_unavailable", "The service is unavailable.", 503);
  const core = env.CORE;

  // ── what the consent page names ──
  const clientRead = CLIENT_READ_RE.exec(pathname);
  if (clientRead) {
    if (request.method !== "GET") return errorResponse("unsupported", "Method not allowed", 405, requestId);
    const client = await readClient(core, clientRead[1]!, requestId);
    if (client === "unavailable") return errorResponse("internal_error", "Service unavailable", 503, requestId);
    if (!client) return errorResponse("not_found", "Not found", 404, requestId);
    return Response.json(
      { data: { client }, meta: { requestId, cursor: null } },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  }

  // ── RFC 7591 ──
  if (pathname === OAUTH_REGISTER_PATH) {
    if (request.method !== "POST") return oauthErrorResponse("invalid_request", "POST only.", 405);
    const limited = await gate("oauthRegister", request, env);
    if (limited) return limited;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return oauthErrorResponse("invalid_client_metadata", "The registration must be a JSON object.");
    }
    const answer = await askCore(core, "/internal/openproduct/oauth/clients", postJson(body, requestId));
    if (!answer) return oauthErrorResponse("temporarily_unavailable", "The service is unavailable.", 503);
    const refusal = answer.data?.oauthError as { error: string; description: string } | undefined;
    if (refusal) return oauthErrorResponse(refusal.error, refusal.description);
    const client = answer.data?.client as StoredClient | undefined;
    if (answer.status !== 201 || !client) return oauthErrorResponse("temporarily_unavailable", "The service is unavailable.", 503);
    return openJson(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        client_id_issued_at: Math.floor(Date.parse(client.registeredAt) / 1000),
      },
      201,
    );
  }

  // ── the authorization endpoint: check, then hand the person to the website ──
  if (pathname === OAUTH_AUTHORIZE_PATH) {
    if (request.method !== "GET") return authorizeRefusal("Open this address in a browser.");
    const q = url.searchParams;
    const clientId = q.get("client_id") ?? "";
    const redirectUri = q.get("redirect_uri") ?? "";
    // UNTIL THE CLIENT AND ITS REDIRECT ARE KNOWN, NOTHING REDIRECTS
    // (RFC 6749 §4.1.2.1): an error is shown here, never sent somewhere.
    if (!/^ocl_[A-Za-z0-9_-]{1,64}$/.test(clientId)) return authorizeRefusal("This app did not say who it is.");
    const client = await readClient(core, clientId, requestId);
    if (client === "unavailable") return authorizeRefusal("openproduct is unavailable right now. Try again in a minute.");
    if (!client) return authorizeRefusal("This app is not registered with openproduct.");
    if (!redirectUriMatches(client.redirectUris, redirectUri)) {
      return authorizeRefusal("This app asked to come back to an address it did not register.");
    }
    // NOTHING HERE REDIRECTS ON A REFUSAL (RFC 9700 §4.11.2, security
    // review): a client registers itself, so a redirect URI that "matches"
    // may be an attacker's own, and a 302 there with no person involved
    // would make this origin a trusted-looking hop to anywhere. Every refusal
    // is a page; only the person's own Allow or Cancel goes back.
    const state = q.get("state");
    if (state !== null && state.length > OAUTH_STATE_MAX) return authorizeRefusal("This app sent a state that is too long.");
    if (q.get("response_type") !== "code") return authorizeRefusal("This app asked for a kind of sign-in openproduct does not offer.");
    if (q.get("code_challenge_method") !== "S256" || !isPkceChallenge(q.get("code_challenge"))) {
      return authorizeRefusal("This app did not protect its sign-in with PKCE (S256), which openproduct requires.");
    }
    const resource = q.get("resource");
    if (resource !== null && resource.replace(/\/+$/, "") !== `${origin}${MCP_SIGNED_IN_PATH}` && resource.replace(/\/+$/, "") !== origin) {
      return authorizeRefusal(`This app asked for a token for another server. openproduct issues tokens for ${origin}${MCP_SIGNED_IN_PATH}.`);
    }
    const scopes = parseScopeParam(q.get("scope"));
    if ("error" in scopes) return authorizeRefusal(scopes.error);
    const site = (env.SITE_ORIGIN ?? "").trim().replace(/\/+$/, "");
    if (!site) return authorizeRefusal("openproduct is unavailable right now. Try again in a minute.");
    const consent = new URL(`${site}${CONSENT_PAGE_PATH}`);
    consent.searchParams.set("client_id", clientId);
    consent.searchParams.set("redirect_uri", redirectUri);
    consent.searchParams.set("code_challenge", q.get("code_challenge")!);
    consent.searchParams.set("scope", scopeParam(scopes.scopes));
    if (state !== null) consent.searchParams.set("state", state);
    return redirectTo(consent.toString());
  }

  // ── the token endpoint ──
  if (pathname === OAUTH_TOKEN_PATH) {
    if (request.method !== "POST") return oauthErrorResponse("invalid_request", "POST only.", 405);
    const limited = await gate("oauthToken", request, env);
    if (limited) return limited;
    const p = await readParams(request);
    const answer = await askCore(
      core,
      "/internal/openproduct/oauth/token",
      postJson(
        {
          grantType: p.grant_type,
          clientId: p.client_id,
          code: p.code,
          codeVerifier: p.code_verifier,
          redirectUri: p.redirect_uri,
          refreshToken: p.refresh_token,
        },
        requestId,
      ),
    );
    if (!answer) return oauthErrorResponse("temporarily_unavailable", "The service is unavailable.", 503);
    const refusal = answer.data?.oauthError as { error: string; description: string } | undefined;
    if (refusal) return oauthErrorResponse(refusal.error, refusal.description, refusal.error === "invalid_client" ? 401 : 400);
    const token = answer.data?.token as
      | { accessToken: string; refreshToken: string; expiresIn: number; scope: string }
      | undefined;
    if (!token) return oauthErrorResponse("temporarily_unavailable", "The service is unavailable.", 503);
    return openJson(
      {
        access_token: token.accessToken,
        token_type: "Bearer",
        expires_in: token.expiresIn,
        refresh_token: token.refreshToken,
        scope: token.scope,
      },
      200,
    );
  }

  // ── RFC 7009: always 200, unless the service is down ──
  if (pathname === OAUTH_REVOKE_PATH) {
    if (request.method !== "POST") return oauthErrorResponse("invalid_request", "POST only.", 405);
    const p = await readParams(request);
    const answer = await askCore(core, "/internal/openproduct/oauth/revoke", postJson({ token: p.token ?? "" }, requestId));
    if (!answer) return oauthErrorResponse("temporarily_unavailable", "The service is unavailable.", 503);
    return new Response(null, { status: 200, headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
  }

  return errorResponse("not_found", "Not found", 404, requestId);
}
