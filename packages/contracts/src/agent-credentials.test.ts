import { describe, expect, it } from "vitest";

import {
  AGENT_SCOPES,
  agentCredentialUsable,
  authorizationRedirect,
  authorizationServerMetadata,
  isPkceChallenge,
  mcpChallenge,
  mintOpaqueToken,
  parseScopeParam,
  personalTokenExpiry,
  pkceChallengeFor,
  pkceVerifies,
  protectedResourceMetadata,
  readClientRegistration,
  redirectUriMatches,
  redirectUriRefusal,
} from "./agent-credentials.js";

describe("agent credentials — tokens", () => {
  it("mints prefixed, unguessable tokens", () => {
    const a = mintOpaqueToken("opa_");
    const b = mintOpaqueToken("opa_");
    expect(a.startsWith("opa_")).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(4 + 43);
    expect(/^opa_[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });

  it("decides liveness revoked first, then expiry; null is no expiry", () => {
    const now = Date.parse("2026-11-28T12:00:00Z");
    expect(agentCredentialUsable({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(agentCredentialUsable({ revokedAt: null, expiresAt: "2026-11-28T12:00:01Z" }, now)).toBe(true);
    expect(agentCredentialUsable({ revokedAt: null, expiresAt: "2026-11-28T12:00:00Z" }, now)).toBe(false);
    expect(agentCredentialUsable({ revokedAt: "2026-11-01T00:00:00Z", expiresAt: null }, now)).toBe(false);
  });

  it("gives a personal token its chosen lifetime", () => {
    const now = Date.parse("2026-11-28T00:00:00Z");
    expect(personalTokenExpiry(30, now)).toBe("2026-12-28T00:00:00.000Z");
    expect(personalTokenExpiry(null, now)).toBeNull();
  });
});

describe("agent credentials — scopes", () => {
  it("reads an absent scope as every scope, for the person to narrow", () => {
    expect(parseScopeParam(undefined)).toEqual({ scopes: [...AGENT_SCOPES] });
    expect(parseScopeParam("  ")).toEqual({ scopes: [...AGENT_SCOPES] });
  });

  it("orders and dedupes scopes, and refuses an unknown one rather than dropping it", () => {
    expect(parseScopeParam("posts read posts")).toEqual({ scopes: ["read", "posts"] });
    expect(parseScopeParam("read admin")).toHaveProperty("error");
  });
});

describe("agent credentials — redirect URIs", () => {
  it("allows https, loopback http and reverse-domain schemes", () => {
    expect(redirectUriRefusal("https://claude.ai/api/mcp/auth_callback")).toBeNull();
    expect(redirectUriRefusal("http://localhost:3334/callback")).toBeNull();
    expect(redirectUriRefusal("http://127.0.0.1/cb")).toBeNull();
    expect(redirectUriRefusal("com.example.app:/oauth")).toBeNull();
  });

  it("refuses public http, fragments, credentials and executable schemes", () => {
    expect(redirectUriRefusal("http://evil.example/cb")).not.toBeNull();
    expect(redirectUriRefusal("https://a.example/cb#x")).not.toBeNull();
    expect(redirectUriRefusal("https://user:pw@a.example/cb")).not.toBeNull();
    expect(redirectUriRefusal("javascript:alert(1)")).not.toBeNull();
    expect(redirectUriRefusal("data:text/html,hi")).not.toBeNull();
    expect(redirectUriRefusal("myapp:/cb")).not.toBeNull();
    expect(redirectUriRefusal("relative/path")).not.toBeNull();
  });

  it("matches exactly, except a loopback port", () => {
    const registered = ["https://a.example/cb", "http://127.0.0.1/callback"];
    expect(redirectUriMatches(registered, "https://a.example/cb")).toBe(true);
    expect(redirectUriMatches(registered, "https://a.example/cb2")).toBe(false);
    expect(redirectUriMatches(registered, "https://a.example/cb?x=1")).toBe(false);
    expect(redirectUriMatches(registered, "http://127.0.0.1:51234/callback")).toBe(true);
    expect(redirectUriMatches(registered, "http://127.0.0.1:51234/other")).toBe(false);
    expect(redirectUriMatches(registered, "http://localhost:51234/callback")).toBe(false);
  });
});

describe("agent credentials — dynamic registration", () => {
  it("registers a public client with a default name", () => {
    expect(readClientRegistration({ redirect_uris: ["https://a.example/cb", "https://a.example/cb"] })).toEqual({
      clientName: "An MCP client",
      redirectUris: ["https://a.example/cb"],
    });
  });

  it("refuses a confidential client, an implicit grant and a missing redirect", () => {
    expect(readClientRegistration({ redirect_uris: ["https://a.example/cb"], token_endpoint_auth_method: "client_secret_basic" })).toHaveProperty("error", "invalid_client_metadata");
    expect(readClientRegistration({ redirect_uris: ["https://a.example/cb"], grant_types: ["implicit"] })).toHaveProperty("error", "invalid_client_metadata");
    expect(readClientRegistration({ redirect_uris: [] })).toHaveProperty("error", "invalid_redirect_uri");
    expect(readClientRegistration({ redirect_uris: ["http://evil.example/cb"] })).toHaveProperty("error", "invalid_redirect_uri");
    expect(readClientRegistration([])).toHaveProperty("error", "invalid_client_metadata");
  });
});

describe("agent credentials — PKCE, S256 only", () => {
  it("matches RFC 7636's own example", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await pkceChallengeFor(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(await pkceVerifies(verifier, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
    expect(isPkceChallenge("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
  });

  it("refuses a wrong, short or plain verifier", async () => {
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(await pkceVerifies("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXX", challenge)).toBe(false);
    expect(await pkceVerifies("short", challenge)).toBe(false);
    expect(await pkceVerifies(challenge, challenge)).toBe(false);
    expect(await pkceVerifies(undefined, challenge)).toBe(false);
    expect(isPkceChallenge("plain-text-challenge")).toBe(false);
  });
});

describe("agent credentials — discovery", () => {
  it("names /mcp/me as the resource and this origin as its issuer", () => {
    const resource = protectedResourceMetadata("https://api.openproduct.live/");
    expect(resource.resource).toBe("https://api.openproduct.live/mcp/me");
    expect(resource.authorization_servers).toEqual(["https://api.openproduct.live"]);
    const server = authorizationServerMetadata("https://api.openproduct.live");
    expect(server.issuer).toBe("https://api.openproduct.live");
    expect(server.code_challenge_methods_supported).toEqual(["S256"]);
    expect(server.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(server.registration_endpoint).toBe("https://api.openproduct.live/oauth/register");
    expect(mcpChallenge("https://api.openproduct.live")).toBe(
      'Bearer resource_metadata="https://api.openproduct.live/.well-known/oauth-protected-resource"',
    );
  });

  it("builds the redirect back to the client, keeping its own query", () => {
    expect(authorizationRedirect("https://a.example/cb?x=1", { code: "opc_abc", state: "s1" })).toBe(
      "https://a.example/cb?x=1&code=opc_abc&state=s1",
    );
    expect(authorizationRedirect("com.example.app:/oauth", { error: "access_denied" })).toBe("com.example.app:/oauth?error=access_denied");
  });
});
