// The OAuth door and agent credentials, at the layer that decides (openproduct-mcp MC1).
//
// The whole round trip against an in-memory store with the repository's own
// semantics: register → Allow → code → token → resolve → refresh → revoke,
// and every way each step is refused.

import { agentTokenHash, pkceChallengeFor, type AgentScope } from "@openproduct/contracts";
import type { AgentCredentialRecord, ConsumedOAuthCode, OAuthClientRecord } from "@openproduct/db";
import {
  handleCreateOAuthGrant,
  handleGetOAuthClient,
  handleListAgentCredentials,
  handleMintPersonalToken,
  handleOAuthRevoke,
  handleOAuthToken,
  handleRegisterOAuthClient,
  handleResolveAgentCredential,
  handleRevokeMyAgentCredential,
  type AgentCredentialDeps,
} from "@openproduct-worker/handlers/agent-credentials";
import type { Env } from "@openproduct-worker/env";

const ADA = { subjectId: "usr_0123456789abcdef0123456789abcdef", subjectType: "user" };
const BOB = { subjectId: "usr_fedcba9876543210fedcba9876543210", subjectType: "user" };
const ADA_LISTING_UUID = "55555555-5555-4555-8555-555555555555";
const ADA_LISTING = "opp_55555555555545558555555555555555";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const REDIRECT = "https://client.example/cb";
const T0 = Date.parse("2026-11-28T12:00:00.000Z");

const env = { ENVIRONMENT: "test" } as Env;

interface StoredCredential extends AgentCredentialRecord {
  tokenHash: string;
  refreshHash: string | null;
  previousRefreshHash: string | null;
}

function harness() {
  let now = T0;
  const clients = new Map<string, OAuthClientRecord>();
  const codes = new Map<string, ConsumedOAuthCode & { consumed: boolean }>();
  const creds: StoredCredential[] = [];
  const links = new Map<string, string>();
  const strip = (c: StoredCredential): AgentCredentialRecord => ({
    id: c.id,
    subjectId: c.subjectId,
    kind: c.kind,
    clientId: c.clientId,
    clientName: c.clientName,
    scopes: c.scopes,
    listingIds: c.listingIds,
    createdAt: c.createdAt,
    lastUsedAt: c.lastUsedAt,
    tokenExpiresAt: c.tokenExpiresAt,
    expiresAt: c.expiresAt,
    revokedAt: c.revokedAt,
  });
  const deps: AgentCredentialDeps = {
    now: () => now,
    repo: {
      registerOAuthClient: async (c) => void clients.set(c.clientId, c),
      getOAuthClient: async (id) => clients.get(id) ?? null,
      issueOAuthCode: async (c) =>
        void codes.set(c.codeHash, {
          clientId: c.clientId,
          subjectId: c.subjectId,
          redirectUri: c.redirectUri,
          codeChallenge: c.codeChallenge,
          scopes: c.scopes,
          listingIds: c.listingIds,
          expiresAt: c.expiresAt,
          consumed: false,
        }),
      consumeOAuthCode: async (hash, clientId) => {
        const c = codes.get(hash);
        if (!c || c.clientId !== clientId) return null;
        if (c.consumed) {
          const made = creds.find((x) => x.id === links.get(hash));
          if (made) made.revokedAt = made.revokedAt ?? new Date(now).toISOString();
          return null;
        }
        c.consumed = true;
        return {
          clientId: c.clientId,
          subjectId: c.subjectId,
          redirectUri: c.redirectUri,
          codeChallenge: c.codeChallenge,
          scopes: c.scopes,
          listingIds: c.listingIds,
          expiresAt: c.expiresAt,
        };
      },
      linkOAuthCode: async (hash, id) => void links.set(hash, id),
      // MC3/MC4 — not exercised here (agent-writes.test.ts covers them).
      getAgentIdempotency: async () => null,
      putAgentIdempotency: async () => undefined,
      issueAgentUploadTicket: async () => undefined,
      consumeAgentUploadTicket: async () => null,
      getAgentCredential: async () => null,
      pruneOAuthStore: async () => ({ codes: 0, clients: 0 }),
      createAgentCredential: async (i) =>
        void creds.push({
          id: i.id,
          subjectId: i.subjectId,
          kind: i.kind,
          clientId: i.clientId,
          clientName: i.clientName,
          scopes: i.scopes,
          listingIds: i.listingIds,
          createdAt: i.at,
          lastUsedAt: null,
          tokenExpiresAt: i.tokenExpiresAt,
          expiresAt: i.expiresAt,
          revokedAt: null,
          tokenHash: i.tokenHash,
          refreshHash: i.refreshHash,
          previousRefreshHash: null,
        }),
      resolveAgentCredential: async (hash) => {
        const c = creds.find((x) => x.tokenHash === hash);
        return c ? strip(c) : null;
      },
      rotateAgentCredential: async (i) => {
        const live = creds.find(
          (c) => c.refreshHash === i.refreshHash && c.clientId === i.clientId && !c.revokedAt && Date.parse(c.expiresAt!) > Date.parse(i.at),
        );
        if (live) {
          live.previousRefreshHash = live.refreshHash;
          live.refreshHash = i.newRefreshHash;
          live.tokenHash = i.newTokenHash;
          live.tokenExpiresAt = i.tokenExpiresAt;
          live.expiresAt = i.expiresAt;
          return { kind: "rotated", credential: strip(live) };
        }
        const reused = creds.filter((c) => c.previousRefreshHash === i.refreshHash);
        for (const c of reused) c.revokedAt = c.revokedAt ?? i.at;
        return reused.length > 0 ? { kind: "reused" } : { kind: "unknown" };
      },
      touchAgentCredential: async (id, at) => {
        const c = creds.find((x) => x.id === id);
        if (c) c.lastUsedAt = at;
      },
      listAgentCredentials: async (subjectId) => creds.filter((c) => c.subjectId === subjectId && !c.revokedAt).map(strip),
      revokeAgentCredential: async (subjectId, id, at) => {
        const c = creds.find((x) => x.id === id && x.subjectId === subjectId && !x.revokedAt);
        if (c) c.revokedAt = at;
        return !!c;
      },
      revokeAgentCredentialByTokenHash: async (hash, at) => {
        for (const c of creds) if (c.tokenHash === hash || c.refreshHash === hash) c.revokedAt = c.revokedAt ?? at;
      },
      listProfilesMaintainedBy: async (subjectId) =>
        (subjectId === ADA.subjectId ? [{ id: ADA_LISTING_UUID }] : []) as never,
    },
  };
  return { deps, creds, codes, advance: (ms: number) => (now += ms) };
}

function post(body: unknown): Request {
  return new Request("https://openproduct.internal/x", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a test reads whatever the envelope holds
type Loose = Record<string, any>;

async function data(res: Response): Promise<Loose> {
  return ((await res.json()) as { data: Loose }).data;
}

async function register(h: ReturnType<typeof harness>): Promise<string> {
  const res = await handleRegisterOAuthClient(env, post({ client_name: "Claude", redirect_uris: [REDIRECT] }), "r", h.deps);
  expect(res.status).toBe(201);
  return (await data(res)).client.clientId as string;
}

async function allow(
  h: ReturnType<typeof harness>,
  clientId: string,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  return handleCreateOAuthGrant(
    env,
    post({
      clientId,
      redirectUri: REDIRECT,
      codeChallenge: await pkceChallengeFor(VERIFIER),
      scopes: ["read", "posts"] satisfies AgentScope[],
      listingIds: null,
      state: "xyz",
      ...extra,
    }),
    "r",
    ADA,
    h.deps,
  );
}

function codeFrom(redirectTo: string): string {
  return new URL(redirectTo).searchParams.get("code")!;
}

async function exchange(h: ReturnType<typeof harness>, clientId: string, code: string, extra: Record<string, unknown> = {}) {
  return handleOAuthToken(
    env,
    post({ grantType: "authorization_code", clientId, code, codeVerifier: VERIFIER, redirectUri: REDIRECT, ...extra }),
    "r",
    h.deps,
  );
}

describe("MC1 — registration", () => {
  it("registers a public client and names it back", async () => {
    const h = harness();
    const id = await register(h);
    expect(id.startsWith("ocl_")).toBe(true);
    const got = await data(await handleGetOAuthClient(env, id, "r", h.deps));
    expect(got.client).toMatchObject({ clientName: "Claude", redirectUris: [REDIRECT] });
  });

  it("refuses a confidential client in RFC 7591's words", async () => {
    const h = harness();
    const res = await handleRegisterOAuthClient(
      env,
      post({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" }),
      "r",
      h.deps,
    );
    expect(res.status).toBe(400);
    expect((await data(res)).oauthError.error).toBe("invalid_client_metadata");
  });
});

describe("MC1 — the person's Allow", () => {
  it("answers with the client's redirect, a code and the state", async () => {
    const h = harness();
    const id = await register(h);
    const res = await allow(h, id);
    expect(res.status).toBe(201);
    const to = new URL((await data(res)).redirectTo);
    expect(`${to.origin}${to.pathname}`).toBe(REDIRECT);
    expect(to.searchParams.get("code")!.startsWith("opc_")).toBe(true);
    expect(to.searchParams.get("state")).toBe("xyz");
    // Stored by hash only.
    expect([...h.codes.keys()]).toEqual([await agentTokenHash(to.searchParams.get("code")!)]);
  });

  it("says no to the client when the person does", async () => {
    const h = harness();
    const id = await register(h);
    const to = new URL((await data(await allow(h, id, { decision: "deny" }))).redirectTo);
    expect(to.searchParams.get("error")).toBe("access_denied");
    expect(h.codes.size).toBe(0);
  });

  it("never redirects to a URI the client did not register", async () => {
    const h = harness();
    const id = await register(h);
    expect((await allow(h, id, { redirectUri: "https://evil.example/cb" })).status).toBe(422);
    expect((await allow(h, "ocl_nobody")).status).toBe(422);
  });

  it("refuses a plain challenge, no scopes, and a listing the person is not on", async () => {
    const h = harness();
    const id = await register(h);
    expect((await allow(h, id, { codeChallenge: "plain" })).status).toBe(422);
    expect((await allow(h, id, { scopes: [] })).status).toBe(422);
    expect((await allow(h, id, { scopes: ["admin"] })).status).toBe(422);
    expect((await allow(h, id, { listingIds: ["opp_00000000000000000000000000000000"] })).status).toBe(422);
    expect((await allow(h, id, { listingIds: [ADA_LISTING] })).status).toBe(201);
  });
});

describe("MC1 — the token endpoint", () => {
  it("exchanges a code once, with PKCE, for an access and a refresh token", async () => {
    const h = harness();
    const id = await register(h);
    const code = codeFrom((await data(await allow(h, id))).redirectTo);
    const res = await exchange(h, id, code);
    expect(res.status).toBe(200);
    const token = (await data(res)).token;
    expect(token.accessToken.startsWith("opa_")).toBe(true);
    expect(token.refreshToken.startsWith("opr_")).toBe(true);
    expect(token.expiresIn).toBe(3600);
    expect(token.scope).toBe("read posts");
    expect(h.creds).toHaveLength(1);
    expect(h.creds[0]!.tokenHash).toBe(await agentTokenHash(token.accessToken));
    expect(JSON.stringify(h.creds)).not.toContain(token.accessToken);
    // A second redemption of the same code fails, and revokes what the first made.
    expect((await data(await exchange(h, id, code))).oauthError.error).toBe("invalid_grant");
    expect(h.creds[0]!.revokedAt).not.toBeNull();
  });

  it("answers invalid_grant for a wrong verifier, redirect, client or an expired code", async () => {
    const h = harness();
    const id = await register(h);
    const other = await register(h);
    for (const extra of [
      { codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXX" },
      { redirectUri: "https://client.example/other" },
    ]) {
      const code = codeFrom((await data(await allow(h, id))).redirectTo);
      expect((await data(await exchange(h, id, code, extra))).oauthError.error).toBe("invalid_grant");
    }
    const stolen = codeFrom((await data(await allow(h, id))).redirectTo);
    expect((await data(await exchange(h, other, stolen))).oauthError.error).toBe("invalid_grant");
    const late = codeFrom((await data(await allow(h, id))).redirectTo);
    h.advance(11 * 60 * 1000);
    expect((await data(await exchange(h, id, late))).oauthError.error).toBe("invalid_grant");
    expect(h.creds).toHaveLength(0);
  });

  it("refuses an unknown client as invalid_client", async () => {
    const h = harness();
    const res = await exchange(h, "ocl_nobody", "opc_x");
    expect(res.status).toBe(401);
    expect((await data(res)).oauthError.error).toBe("invalid_client");
  });

  it("rotates on refresh, and revokes the grant when a replaced refresh token returns", async () => {
    const h = harness();
    const id = await register(h);
    const first = (await data(await exchange(h, id, codeFrom((await data(await allow(h, id))).redirectTo)))).token;
    const refresh = (t: string) => handleOAuthToken(env, post({ grantType: "refresh_token", clientId: id, refreshToken: t }), "r", h.deps);
    const second = (await data(await refresh(first.refreshToken))).token;
    expect(second.accessToken).not.toBe(first.accessToken);
    // The old access token no longer resolves; the new one does.
    const resolve = async (t: string) => (await data(await handleResolveAgentCredential(env, post({ token: t }), "r", h.deps))).credential;
    expect(await resolve(first.accessToken)).toBeNull();
    expect(await resolve(second.accessToken)).toMatchObject({ subjectId: ADA.subjectId, scopes: ["read", "posts"] });
    // The copy comes back: the whole grant dies.
    expect((await data(await refresh(first.refreshToken))).oauthError.error).toBe("invalid_grant");
    expect(await resolve(second.accessToken)).toBeNull();
    expect((await data(await refresh(second.refreshToken))).oauthError.error).toBe("invalid_grant");
  });

  it("refuses a grant type it does not support", async () => {
    const h = harness();
    const id = await register(h);
    const res = await handleOAuthToken(env, post({ grantType: "password", clientId: id }), "r", h.deps);
    expect((await data(res)).oauthError.error).toBe("unsupported_grant_type");
  });
});

describe("MC1 — resolution", () => {
  it("answers null for an expired access token, a session token and nonsense", async () => {
    const h = harness();
    const id = await register(h);
    const token = (await data(await exchange(h, id, codeFrom((await data(await allow(h, id))).redirectTo)))).token;
    const resolve = async (t: string) => (await data(await handleResolveAgentCredential(env, post({ token: t }), "r", h.deps))).credential;
    expect(await resolve("ops_a_session_token_is_not_an_agent_token")).toBeNull();
    expect(await resolve("opa_nonsense")).toBeNull();
    h.advance(61 * 60 * 1000);
    expect(await resolve(token.accessToken)).toBeNull();
  });

  it("revokes by token (RFC 7009) and always says yes", async () => {
    const h = harness();
    const id = await register(h);
    const token = (await data(await exchange(h, id, codeFrom((await data(await allow(h, id))).redirectTo)))).token;
    expect((await handleOAuthRevoke(env, post({ token: token.refreshToken }), "r", h.deps)).status).toBe(200);
    expect((await handleOAuthRevoke(env, post({ token: "nothing" }), "r", h.deps)).status).toBe(200);
    expect(h.creds[0]!.revokedAt).not.toBeNull();
  });
});

describe("MC1 — personal tokens and Connected agents", () => {
  it("mints a token shown once, lists it without the token, and lets only its owner revoke it", async () => {
    const h = harness();
    const res = await handleMintPersonalToken(env, post({ name: "My script", scopes: ["read"], days: 30 }), "r", ADA, h.deps);
    expect(res.status).toBe(201);
    const minted = await data(res);
    expect(minted.token.startsWith("opa_")).toBe(true);
    expect(minted.credential).toMatchObject({ kind: "personal", clientName: "My script", scopes: ["read"], expiresAt: "2026-12-28T12:00:00.000Z" });

    const listed = await data(await handleListAgentCredentials(env, "r", ADA, h.deps));
    expect(listed.credentials).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(minted.token);
    expect((await data(await handleListAgentCredentials(env, "r", BOB, h.deps))).credentials).toEqual([]);

    await handleRevokeMyAgentCredential(env, minted.credential.id, "r", BOB, h.deps);
    expect((await data(await handleListAgentCredentials(env, "r", ADA, h.deps))).credentials).toHaveLength(1);
    await handleRevokeMyAgentCredential(env, minted.credential.id, "r", ADA, h.deps);
    expect((await data(await handleListAgentCredentials(env, "r", ADA, h.deps))).credentials).toEqual([]);
    const resolved = await data(await handleResolveAgentCredential(env, post({ token: minted.token }), "r", h.deps));
    expect(resolved.credential).toBeNull();
  });

  it("refuses a lifetime it does not offer, no name and no scopes", async () => {
    const h = harness();
    expect((await handleMintPersonalToken(env, post({ name: "x", scopes: ["read"], days: 7 }), "r", ADA, h.deps)).status).toBe(422);
    expect((await handleMintPersonalToken(env, post({ name: "", scopes: ["read"] }), "r", ADA, h.deps)).status).toBe(422);
    expect((await handleMintPersonalToken(env, post({ name: "x", scopes: [] }), "r", ADA, h.deps)).status).toBe(422);
    const never = await data(await handleMintPersonalToken(env, post({ name: "x", scopes: ["read"], days: null }), "r", ADA, h.deps));
    expect(never.credential.expiresAt).toBeNull();
  });

  it("is a person's door only", async () => {
    const h = harness();
    const service = { subjectId: "sp_0123", subjectType: "service_principal" };
    expect((await handleMintPersonalToken(env, post({ name: "x", scopes: ["read"] }), "r", service, h.deps)).status).toBe(403);
  });
});
