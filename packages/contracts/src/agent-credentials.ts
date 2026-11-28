// Agent credentials and the OAuth door that mints them (openproduct-mcp MC1).
//
// ─── WHAT AN AGENT HOLDS ──────────────────────────────────────────────────
//
// An agent never holds a person's session. It holds its OWN credential — a
// row in core, keyed by the SHA-256 of a token that starts `opa_` — with the
// scopes the person granted it and, optionally, the listings it may touch.
// Revoking it never signs the person out; signing out never cuts it off.
// That separation is the whole reason it is a second kind of token and not
// the `ops_` session reused (design §2.1.5).
//
// The prefix does what `ops_` does for sessions: it decides WHERE the gateway
// asks, never whether the answer is yes.
//
// ─── TWO WAYS IN, ONE ROW ─────────────────────────────────────────────────
//
//   oauth     an MCP client ran the authorization-code flow with PKCE. The
//             access token lives an hour; the refresh token thirty days and
//             is rotated on every use. A refresh token presented twice means
//             it was copied, and the whole credential is revoked.
//   personal  the person minted it in Settings → Connected agents, for a
//             CLI or a script. Shown once, never refreshed, 30/90/365 days
//             or no expiry, the person's choice.
//
// ─── WHAT THIS FILE IS ────────────────────────────────────────────────────
//
// The vocabulary and every rule that has a right answer without a database:
// the scopes and their words, the lifetimes, what a redirect URI may be, how
// one is matched, PKCE, and the two discovery documents. Core and the gateway
// both read it, so a rule cannot be one thing at registration and another at
// the token endpoint.

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** An agent's access token, OAuth or personal. */
export const AGENT_TOKEN_PREFIX = "opa_";
/** An OAuth refresh token. Never accepted as a bearer anywhere. */
export const AGENT_REFRESH_PREFIX = "opr_";
/** A one-time authorization code. */
export const OAUTH_CODE_PREFIX = "opc_";
/** A registered client's public id. Not a secret: there are no client secrets. */
export const OAUTH_CLIENT_PREFIX = "ocl_";
/** A credential's own id, shown on Connected agents and used to revoke. */
export const AGENT_CREDENTIAL_ID_PREFIX = "agc_";

/** 32 random bytes, base64url — the same entropy as a session token. */
export const AGENT_TOKEN_BYTES = 32;

export function isAgentToken(token: string): boolean {
  return token.startsWith(AGENT_TOKEN_PREFIX);
}

export function isAgentRefreshToken(token: string): boolean {
  return token.startsWith(AGENT_REFRESH_PREFIX);
}

/** A fresh token with its prefix: `prefix` + base64url(32 random bytes). */
export function mintOpaqueToken(prefix: string, bytes = AGENT_TOKEN_BYTES): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return `${prefix}${base64Url(raw)}`;
}

/** SHA-256, lower-case hex: what a token is stored under. Never the token. */
export async function agentTokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Lifetimes
// ---------------------------------------------------------------------------

/** An OAuth access token: one hour. */
export const OAUTH_ACCESS_TTL_SECONDS = 60 * 60;
/** An OAuth refresh token: thirty days from its last rotation. */
export const OAUTH_REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
/** An authorization code: ten minutes, single use. */
export const OAUTH_CODE_TTL_SECONDS = 10 * 60;

/** What a personal token may live, in days; `null` is no expiry. */
export const PERSONAL_TOKEN_LIFETIMES = [30, 90, 365, null] as const;
export type PersonalTokenLifetime = (typeof PERSONAL_TOKEN_LIFETIMES)[number];
export const PERSONAL_TOKEN_DEFAULT_DAYS: PersonalTokenLifetime = 90;

/**
 * How long a revoked credential may still be honoured: the gateway's
 * in-isolate resolution cache. Stated on Connected agents, so the number a
 * person reads is the number enforced (design §2.3, R6).
 */
export const AGENT_RESOLVE_CACHE_SECONDS = 60;

/** `last_used_at` moves at most this often: a read must not become a write per request. */
export const AGENT_LAST_USED_GRANULARITY_SECONDS = 60;

export function personalTokenExpiry(days: PersonalTokenLifetime, now: number): string | null {
  return days === null ? null : new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isPersonalTokenLifetime(value: unknown): value is PersonalTokenLifetime {
  return value === null || (typeof value === "number" && (PERSONAL_TOKEN_LIFETIMES as readonly unknown[]).includes(value));
}

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

/**
 * Coarse, and named for what a person recognises on the consent screen.
 * A scope only ever NARROWS what the person may do; `authorize.ts` still
 * decides what that is (design §2.2.2).
 */
export const AGENT_SCOPES = ["read", "listings", "media", "posts", "crew", "community", "profile"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const AGENT_SCOPE_WORDS: Record<AgentScope, { readonly title: string; readonly detail: string }> = {
  read: {
    title: "Read your private things",
    detail: "Your drafts and listings, crew lists, private threads and notifications.",
  },
  listings: {
    title: "Create and edit your listings",
    detail: "Create listings; edit details, description, links and stage; publish and unpublish.",
  },
  media: { title: "Manage images", detail: "Upload, describe, reorder and remove logos, heroes and gallery images." },
  posts: { title: "Post updates", detail: "Write, publish and delete posts; keep milestones and launches." },
  crew: { title: "Run the crew", detail: "Open and close seats, read applications, change crew roles, moderate." },
  community: {
    title: "Take part for you",
    detail: "Comment, reply, vote, react, follow, save, endorse and keep collections.",
  },
  profile: { title: "Edit your profile", detail: "Your public profile and your handle." },
};

export function isAgentScope(value: unknown): value is AgentScope {
  return typeof value === "string" && (AGENT_SCOPES as readonly string[]).includes(value);
}

/** Every scope, in the vocabulary's order, once each. */
export function normaliseScopes(scopes: readonly string[]): AgentScope[] {
  return AGENT_SCOPES.filter((s) => scopes.includes(s));
}

/**
 * The OAuth `scope` parameter: space-separated. ABSENT OR EMPTY means "every
 * scope", and the consent screen lets the person narrow it — a client that
 * asks for nothing in particular is asking for what the person will give it.
 * An unknown scope is refused rather than dropped, so a client never believes
 * it holds something it does not.
 */
export function parseScopeParam(raw: string | null | undefined): { scopes: AgentScope[] } | { error: string } {
  const words = (raw ?? "").split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return { scopes: [...AGENT_SCOPES] };
  const unknown = words.filter((w) => !isAgentScope(w));
  if (unknown.length > 0) return { error: `Unknown scope: ${unknown.join(", ")}. Known scopes: ${AGENT_SCOPES.join(" ")}.` };
  return { scopes: normaliseScopes(words) };
}

export function scopeParam(scopes: readonly AgentScope[]): string {
  return normaliseScopes(scopes).join(" ");
}

/** At most this many listings in a restriction. */
export const AGENT_LISTING_RESTRICTION_MAX = 50;

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export const OAUTH_CLIENT_NAME_MAX = 100;
export const OAUTH_REDIRECT_URIS_MAX = 5;
export const OAUTH_REDIRECT_URI_MAX = 500;
/** A personal token's label. */
export const PERSONAL_TOKEN_NAME_MAX = 60;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REFUSED_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:", "ftp:", "ws:", "wss:"]);

/**
 * What a client may register as a redirect URI (RFC 8252, OAuth 2.1 §2.3).
 *
 *   https:                 any host, no fragment, no credentials
 *   http:                  loopback only — a native client's local listener
 *   a private-use scheme   reverse-domain (`com.example.app:`), for native
 *                          apps that register one; never a scheme a browser
 *                          executes
 *
 * Null when it may; the reason when it may not.
 */
export function redirectUriRefusal(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return "A redirect URI must be a string.";
  if (value.length > OAUTH_REDIRECT_URI_MAX) return `A redirect URI is at most ${OAUTH_REDIRECT_URI_MAX} characters.`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "A redirect URI must be an absolute URI.";
  }
  if (url.hash !== "" || value.includes("#")) return "A redirect URI may not carry a fragment.";
  if (url.username !== "" || url.password !== "") return "A redirect URI may not carry credentials.";
  if (url.protocol === "https:") return url.hostname.length > 0 ? null : "An https redirect URI needs a host.";
  if (url.protocol === "http:") {
    return LOOPBACK_HOSTS.has(url.hostname) ? null : "An http redirect URI must be a loopback address (localhost, 127.0.0.1 or [::1]).";
  }
  if (REFUSED_SCHEMES.has(url.protocol)) return `The ${url.protocol} scheme cannot be a redirect URI.`;
  // A private-use scheme: reverse-domain, so it names its owner (RFC 8252 §7.1).
  const scheme = url.protocol.slice(0, -1);
  return /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+$/.test(scheme)
    ? null
    : "A custom redirect scheme must be reverse-domain, like com.example.app.";
}

function isLoopbackHttp(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Does the presented redirect URI match one registered?
 *
 * EXACTLY, string for string — with the one exception RFC 8252 §7.3 makes: a
 * loopback http URI matches whatever port it is presented on, because a
 * native client listens on whichever port its operating system gave it.
 */
export function redirectUriMatches(registered: readonly string[], presented: string): boolean {
  if (registered.includes(presented)) return true;
  let candidate: URL;
  try {
    candidate = new URL(presented);
  } catch {
    return false;
  }
  if (!isLoopbackHttp(candidate)) return false;
  return registered.some((uri) => {
    try {
      const known = new URL(uri);
      return (
        isLoopbackHttp(known) &&
        known.hostname === candidate.hostname &&
        known.pathname === candidate.pathname &&
        known.search === candidate.search
      );
    } catch {
      return false;
    }
  });
}

export interface ClientRegistration {
  readonly clientName: string;
  readonly redirectUris: readonly string[];
}

/** The RFC 7591 error codes this server answers. */
export type RegistrationErrorCode = "invalid_redirect_uri" | "invalid_client_metadata";

/**
 * A dynamic registration request (RFC 7591), read the way this server
 * supports it: public clients only, the code grant and refresh only.
 * Anything else that would change how the client authenticates is refused,
 * not ignored, so a client never believes it registered something it did not.
 */
export function readClientRegistration(
  body: unknown,
): ClientRegistration | { error: RegistrationErrorCode; description: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "invalid_client_metadata", description: "The registration must be a JSON object." };
  }
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0) {
    return { error: "invalid_redirect_uri", description: "redirect_uris must name at least one URI." };
  }
  if (uris.length > OAUTH_REDIRECT_URIS_MAX) {
    return { error: "invalid_redirect_uri", description: `At most ${OAUTH_REDIRECT_URIS_MAX} redirect URIs.` };
  }
  for (const uri of uris) {
    const refusal = redirectUriRefusal(uri);
    if (refusal) return { error: "invalid_redirect_uri", description: refusal };
  }
  const method = b.token_endpoint_auth_method;
  if (method !== undefined && method !== "none") {
    return { error: "invalid_client_metadata", description: "Only public clients are supported: token_endpoint_auth_method must be none." };
  }
  const grants = b.grant_types;
  if (grants !== undefined) {
    if (!Array.isArray(grants) || grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
      return { error: "invalid_client_metadata", description: "grant_types may be authorization_code and refresh_token only." };
    }
  }
  const responses = b.response_types;
  if (responses !== undefined) {
    if (!Array.isArray(responses) || responses.some((r) => r !== "code")) {
      return { error: "invalid_client_metadata", description: "response_types may be code only." };
    }
  }
  const rawName = typeof b.client_name === "string" ? b.client_name.trim() : "";
  const clientName = (rawName.length > 0 ? rawName : "An MCP client").slice(0, OAUTH_CLIENT_NAME_MAX);
  return { clientName, redirectUris: [...new Set(uris as string[])] };
}

// ---------------------------------------------------------------------------
// PKCE (RFC 7636), S256 only
// ---------------------------------------------------------------------------

const PKCE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;

export function isPkceChallenge(value: unknown): value is string {
  return typeof value === "string" && PKCE_CHALLENGE_RE.test(value);
}

export async function pkceChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Does `verifier` answer `challenge`? A malformed verifier never does. */
export async function pkceVerifies(verifier: unknown, challenge: string): Promise<boolean> {
  if (typeof verifier !== "string" || !PKCE_VERIFIER_RE.test(verifier)) return false;
  const computed = await pkceChallengeFor(verifier);
  if (computed.length !== challenge.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i += 1) diff |= computed.charCodeAt(i) ^ challenge.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// The credential as core hands it back
// ---------------------------------------------------------------------------

export type AgentCredentialKind = "oauth" | "personal";

/** What the gateway learns when it resolves an `opa_` token. */
export interface ResolvedAgentCredential {
  readonly credentialId: string;
  readonly subjectId: string;
  readonly kind: AgentCredentialKind;
  readonly clientName: string;
  readonly scopes: readonly AgentScope[];
  /** Null: every listing the person may act on. */
  readonly listingIds: readonly string[] | null;
}

/** A row on Connected agents. No token, no hash. */
export interface AgentCredentialSummary {
  readonly id: string;
  readonly kind: AgentCredentialKind;
  readonly clientName: string;
  readonly scopes: readonly AgentScope[];
  readonly listingIds: readonly string[] | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
}

/** Liveness, decided in one place: revoked first, then expiry. */
export function agentCredentialUsable(
  row: { readonly revokedAt: string | null; readonly expiresAt: string | null },
  now: number,
): boolean {
  if (row.revokedAt !== null) return false;
  return row.expiresAt === null || Date.parse(row.expiresAt) > now;
}

// ---------------------------------------------------------------------------
// Addresses and discovery
// ---------------------------------------------------------------------------

/**
 * THE SIGNED-IN MCP ENDPOINT. `/mcp` answers anonymously, and a client that
 * gets a 200 from it never starts the OAuth flow — so the endpoint a person
 * connects an agent to has to be one that always asks. `/mcp/me` is that:
 * the same server, which answers 401 with `WWW-Authenticate` until a bearer
 * arrives (design §3.1, amended at MC1).
 */
export const MCP_SIGNED_IN_PATH = "/mcp/me";

export const OAUTH_AUTHORIZE_PATH = "/oauth/authorize";
export const OAUTH_TOKEN_PATH = "/oauth/token";
export const OAUTH_REGISTER_PATH = "/oauth/register";
export const OAUTH_REVOKE_PATH = "/oauth/revoke";
export const PROTECTED_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
export const AUTHORIZATION_SERVER_METADATA_PATH = "/.well-known/oauth-authorization-server";
/** Where the website shows the consent screen. */
export const CONSENT_PAGE_PATH = "/me/connect";
/** Where the website lists and revokes credentials. */
export const CONNECTED_AGENTS_PAGE_PATH = "/me/settings/agents";

function trimOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

/** RFC 9728 — what `/mcp/me` is and who issues tokens for it. */
export function protectedResourceMetadata(apiOrigin: string): Record<string, unknown> {
  const origin = trimOrigin(apiOrigin);
  return {
    resource: `${origin}${MCP_SIGNED_IN_PATH}`,
    authorization_servers: [origin],
    scopes_supported: [...AGENT_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "openproduct",
  };
}

/** RFC 8414 — the authorization server, exactly as far as it goes. */
export function authorizationServerMetadata(apiOrigin: string): Record<string, unknown> {
  const origin = trimOrigin(apiOrigin);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${OAUTH_AUTHORIZE_PATH}`,
    token_endpoint: `${origin}${OAUTH_TOKEN_PATH}`,
    registration_endpoint: `${origin}${OAUTH_REGISTER_PATH}`,
    revocation_endpoint: `${origin}${OAUTH_REVOKE_PATH}`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...AGENT_SCOPES],
  };
}

/** The `WWW-Authenticate` a 401 on `/mcp/me` carries (RFC 9728 §5.1). */
export function mcpChallenge(apiOrigin: string, error?: "invalid_token"): string {
  const origin = trimOrigin(apiOrigin);
  const parts = [`resource_metadata="${origin}${PROTECTED_RESOURCE_METADATA_PATH}"`];
  if (error) parts.unshift(`error="${error}"`);
  return `Bearer ${parts.join(", ")}`;
}

/**
 * Where the browser goes back to the client with a code (or a refusal).
 * `state` is echoed untouched; the redirect URI's own query is kept.
 */
export function authorizationRedirect(
  redirectUri: string,
  params: { code?: string; error?: string; errorDescription?: string; state?: string | null },
): string {
  const url = new URL(redirectUri);
  if (params.code) url.searchParams.set("code", params.code);
  if (params.error) url.searchParams.set("error", params.error);
  if (params.errorDescription) url.searchParams.set("error_description", params.errorDescription);
  // An empty state is still the client's state, and goes back as sent.
  if (params.state !== undefined && params.state !== null) url.searchParams.set("state", params.state);
  return url.toString();
}

/** `state` as a client sends it: opaque, bounded so it cannot carry a payload. */
export const OAUTH_STATE_MAX = 500;
