// The OAuth door and /mcp/me, over the wire (openproduct-mcp MC1).
//
// Core is a stub that answers the internal paths in core's envelope; what is
// asserted is the gateway's half: the discovery documents, RFC 6749 / 7591 /
// 7009 shapes and statuses, the authorize step's refusals (which never
// redirect to an unknown address), the hand-off to the consent page, the 401
// that teaches an MCP client to start OAuth, and agent tokens staying off
// every route but /mcp/me.

import { pkceChallengeFor } from "@openproduct/contracts";
import { route } from "@openproduct-gateway/router";
import { handlePreflight, applyCorsHeaders } from "@openproduct-gateway/cors";
import { resetAgentCache, resetSubjectCache } from "@openproduct-gateway/subject";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import type { Env } from "@openproduct-gateway/env";

const API = "https://api.openproduct.test";
const SITE = "https://openproduct.test";
const CLIENT = "ocl_testclient";
const REDIRECT = "https://client.example/cb";
const AGENT_TOKEN = "opa_test_fixture_agent_token_not_a_real_one";
const SESSION_TOKEN = "ops_test_fixture_session_token_not_a_real_one";

interface Seen {
  path: string;
  body: unknown;
}

function coreStub(seen: Seen[] = []): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      seen.push({ path: url.pathname, body });
      const ok = (data: unknown, status = 200) => Response.json({ data, meta: {} }, { status });
      switch (url.pathname) {
        case `/internal/openproduct/oauth/clients/${CLIENT}`:
          return ok({ client: { clientId: CLIENT, clientName: "Claude", redirectUris: [REDIRECT], registeredAt: "2026-11-28T12:00:00.000Z" } });
        case "/internal/openproduct/oauth/clients":
          if (!Array.isArray(body?.redirect_uris)) return ok({ oauthError: { error: "invalid_redirect_uri", description: "no" } }, 400);
          return ok({ client: { clientId: CLIENT, clientName: body.client_name ?? "An MCP client", redirectUris: body.redirect_uris, registeredAt: "2026-11-28T12:00:00.000Z" } }, 201);
        case "/internal/openproduct/oauth/token":
          if (body?.code === "opc_good") {
            return ok({ token: { accessToken: AGENT_TOKEN, refreshToken: "opr_x", expiresIn: 3600, scope: "read posts" } });
          }
          if (body?.clientId !== CLIENT) return ok({ oauthError: { error: "invalid_client", description: "Unknown client." } }, 401);
          return ok({ oauthError: { error: "invalid_grant", description: "The code is not valid." } }, 400);
        case "/internal/openproduct/oauth/revoke":
          return ok({ revoked: true });
        case "/internal/openproduct/agent-credentials/resolve":
          return ok({
            credential:
              body?.token === AGENT_TOKEN
                ? { credentialId: "agc_1", subjectId: "usr_0123456789abcdef0123456789abcdef", kind: "oauth", clientName: "Claude", scopes: ["read"], listingIds: null }
                : null,
          });
        case "/internal/openproduct/auth/sessions/resolve":
          return ok({ subjectId: "usr_0123456789abcdef0123456789abcdef" });
        default:
          if (url.pathname.startsWith("/internal/public/openproduct/catalog/facets")) return ok({ groups: [] });
          return ok({});
      }
    },
    connect: () => {
      throw new Error("not used");
    },
  } as unknown as Fetcher;
}

function env(seen?: Seen[]): Env {
  return { ENVIRONMENT: "test", CORE: coreStub(seen), PUBLIC_API_ORIGIN: API, SITE_ORIGIN: SITE } as Env;
}

beforeEach(() => {
  resetAgentCache();
  resetSubjectCache();
  resetBuckets();
});

describe("MC1 — discovery", () => {
  it("serves both documents, naming /mcp/me and this issuer, with open CORS", async () => {
    const resource = await route(new Request(`${API}/.well-known/oauth-protected-resource`), env());
    expect(resource.status).toBe(200);
    expect(resource.headers.get("access-control-allow-origin")).toBe("*");
    expect(await resource.json()).toMatchObject({ resource: `${API}/mcp/me`, authorization_servers: [API] });
    const pathInserted = await route(new Request(`${API}/.well-known/oauth-protected-resource/mcp/me`), env());
    expect(pathInserted.status).toBe(200);
    const server = (await (await route(new Request(`${API}/.well-known/oauth-authorization-server`), env())).json()) as Record<string, unknown>;
    expect(server).toMatchObject({
      issuer: API,
      authorization_endpoint: `${API}/oauth/authorize`,
      token_endpoint: `${API}/oauth/token`,
      registration_endpoint: `${API}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
    });
  });
});

describe("MC1 — /mcp/me asks for an agent", () => {
  it("answers 401 with WWW-Authenticate pointing at the resource metadata", async () => {
    const res = await route(new Request(`${API}/mcp/me`, { method: "POST", body: "{}" }), env());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${API}/.well-known/oauth-protected-resource"`);
  });

  it("says invalid_token for a bad bearer, and refuses a person's session", async () => {
    for (const token of ["opa_unknown", SESSION_TOKEN]) {
      const res = await route(
        new Request(`${API}/mcp/me`, { method: "POST", body: "{}", headers: { authorization: `Bearer ${token}` } }),
        env(),
      );
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }
  });

  it("serves the MCP server to a connected agent", async () => {
    const res = await route(
      new Request(`${API}/mcp/me`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${AGENT_TOKEN}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
      env(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((t) => t.name)).toContain("list_products");
  });
});

describe("MC1 — agent tokens stay on /mcp/me", () => {
  it("refuses an agent token on a person's route without asking anybody", async () => {
    const seen: Seen[] = [];
    const res = await route(
      new Request(`${API}/v1/openproduct/me`, { headers: { authorization: `Bearer ${AGENT_TOKEN}` } }),
      env(seen),
    );
    expect(res.status).toBe(401);
    expect(seen).toEqual([]);
  });
});

describe("MC1 — registration (RFC 7591)", () => {
  it("answers 201 with the client's metadata as a public client", async () => {
    const res = await route(
      new Request(`${API}/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT] }),
      }),
      env(),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      client_id: CLIENT,
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
    });
  });

  it("passes core's refusal through in RFC 7591's words", async () => {
    const res = await route(new Request(`${API}/oauth/register`, { method: "POST", body: "{}" }), env());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_redirect_uri", error_description: "no" });
  });

  it("is rate limited per network: an IPv6 /64 is one bucket", async () => {
    const e = env();
    let last: Response | null = null;
    for (let i = 0; i < 21; i += 1) {
      last = await route(
        new Request(`${API}/oauth/register`, {
          method: "POST",
          headers: { "cf-connecting-ip": `2001:db8:1:2::${(i + 1).toString(16)}` },
          body: JSON.stringify({ redirect_uris: [REDIRECT] }),
        }),
        e,
      );
    }
    expect(last!.status).toBe(429);
  });

  it("is rate limited per address", async () => {
    const e = env();
    let last: Response | null = null;
    for (let i = 0; i < 21; i += 1) {
      last = await route(
        new Request(`${API}/oauth/register`, {
          method: "POST",
          headers: { "cf-connecting-ip": "203.0.113.9" },
          body: JSON.stringify({ redirect_uris: [REDIRECT] }),
        }),
        e,
      );
    }
    expect(last!.status).toBe(429);
    expect(((await last!.json()) as { error: string }).error).toBe("temporarily_unavailable");
    expect(last!.headers.get("retry-after")).not.toBeNull();
  });
});

describe("MC1 — the authorization endpoint", () => {
  async function authorize(params: Record<string, string>): Promise<Response> {
    const q = new URLSearchParams(params);
    return route(new Request(`${API}/oauth/authorize?${q}`), env());
  }

  async function good(): Promise<Record<string, string>> {
    return {
      response_type: "code",
      client_id: CLIENT,
      redirect_uri: REDIRECT,
      code_challenge: await pkceChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
      code_challenge_method: "S256",
      state: "abc",
    };
  }

  it("hands the person to the consent page with the checked request", async () => {
    const res = await authorize({ ...(await good()), scope: "posts read" });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(`${to.origin}${to.pathname}`).toBe(`${SITE}/me/connect`);
    expect(to.searchParams.get("client_id")).toBe(CLIENT);
    expect(to.searchParams.get("scope")).toBe("read posts");
    expect(to.searchParams.get("state")).toBe("abc");
  });

  it("never redirects for an unknown client or an unregistered redirect", async () => {
    for (const over of [{ client_id: "ocl_nobody_at_all" }, { redirect_uri: "https://evil.example/cb" }, { client_id: "nonsense" }]) {
      const res = await authorize({ ...(await good()), ...over });
      expect(res.status).toBe(400);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("shows every other refusal as a page and never redirects (RFC 9700 §4.11.2)", async () => {
    for (const over of [{ response_type: "token" }, { code_challenge_method: "plain" }, { scope: "read admin" }, { resource: "https://elsewhere.example/mcp" }]) {
      const res = await authorize({ ...(await good()), ...over });
      expect(res.status).toBe(400);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("accepts this server's own resource indicator", async () => {
    const res = await authorize({ ...(await good()), resource: `${API}/mcp/me` });
    expect(new URL(res.headers.get("location")!).pathname).toBe("/me/connect");
  });
});

describe("MC1 — the token endpoint (RFC 6749)", () => {
  function tokenRequest(params: Record<string, string>): Request {
    return new Request(`${API}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
  }

  it("reads a form body and answers a Bearer token, never cached", async () => {
    const seen: Seen[] = [];
    const res = await route(
      tokenRequest({ grant_type: "authorization_code", client_id: CLIENT, code: "opc_good", code_verifier: "v", redirect_uri: REDIRECT }),
      env(seen),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ access_token: AGENT_TOKEN, token_type: "Bearer", expires_in: 3600, refresh_token: "opr_x", scope: "read posts" });
    expect(seen.find((s) => s.path === "/internal/openproduct/oauth/token")!.body).toMatchObject({
      grantType: "authorization_code",
      clientId: CLIENT,
      code: "opc_good",
      codeVerifier: "v",
      redirectUri: REDIRECT,
    });
  });

  it("answers invalid_grant as 400 and invalid_client as 401", async () => {
    const bad = await route(tokenRequest({ grant_type: "authorization_code", client_id: CLIENT, code: "opc_bad" }), env());
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_grant");
    const stranger = await route(tokenRequest({ grant_type: "authorization_code", client_id: "ocl_x", code: "opc_bad" }), env());
    expect(stranger.status).toBe(401);
  });

  it("revokes with a 200 whatever the token was", async () => {
    const res = await route(
      new Request(`${API}/oauth/revoke`, { method: "POST", body: new URLSearchParams({ token: "opr_x" }).toString() }),
      env(),
    );
    expect(res.status).toBe(200);
  });
});

describe("MC1 — CORS on the open paths only", () => {
  it("answers a preflight from any origin on the OAuth door and /mcp/me, and not elsewhere", () => {
    const e = env();
    const open = handlePreflight(new Request(`${API}/oauth/token`, { method: "OPTIONS", headers: { origin: "https://inspector.example" } }), e)!;
    expect(open.headers.get("access-control-allow-origin")).toBe("*");
    const mcp = handlePreflight(new Request(`${API}/mcp/me`, { method: "OPTIONS", headers: { origin: "https://inspector.example" } }), e)!;
    expect(mcp.headers.get("access-control-allow-headers")).toContain("authorization");
    const closed = handlePreflight(new Request(`${API}/v1/openproduct/me`, { method: "OPTIONS", headers: { origin: "https://inspector.example" } }), e)!;
    expect(closed.headers.get("access-control-allow-origin")).toBeNull();
    const consent = handlePreflight(new Request(`${API}/oauth/authorize`, { method: "OPTIONS", headers: { origin: "https://inspector.example" } }), e)!;
    expect(consent.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("exposes WWW-Authenticate to a browser client on /mcp/me", () => {
    const res = applyCorsHeaders(new Response(null, { status: 401 }), new Request(`${API}/mcp/me`, { headers: { origin: "https://inspector.example" } }), env());
    expect(res.headers.get("access-control-expose-headers")).toContain("www-authenticate");
  });
});
