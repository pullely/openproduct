// The agent credential store against a live engine (openproduct-mcp MC1).
//
// What a credential store gets wrong, asked of the real schema: a token kept
// in the clear, a code redeemed twice, a refresh token that keeps working
// after it was copied, and one person revoking another's agent.

import { describe, expect, it } from "vitest";

import { ACTOR, ADMIN, repo, sql, usePgEngine } from "./harness.js";

usePgEngine();

const AT = "2026-11-28T12:00:00.000Z";
const LATER = "2026-11-28T12:30:00.000Z";
const HOUR = "2026-11-28T13:00:00.000Z";
const MONTH = "2026-12-28T12:00:00.000Z";

async function client(id = "ocl_test") {
  await repo.registerOAuthClient({
    clientId: id,
    clientName: "Test client",
    redirectUris: ["https://client.example/cb"],
    registeredAt: AT,
  });
}

async function oauthCredential(id = "agc_one") {
  await client();
  await repo.createAgentCredential({
    id,
    subjectId: ACTOR,
    kind: "oauth",
    clientId: "ocl_test",
    clientName: "Test client",
    tokenHash: `access-${id}`,
    tokenExpiresAt: HOUR,
    refreshHash: `refresh-${id}`,
    scopes: ["read", "posts"],
    listingIds: null,
    at: AT,
    expiresAt: MONTH,
  });
}

describe("openproduct — agent credentials (openproduct-mcp MC1)", () => {
  it("holds no address, and no token in the clear", async () => {
    const found = await sql.execute<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'openproduct'
          AND table_name IN ('agent_credentials', 'oauth_codes', 'oauth_clients')
          AND (column_name ILIKE '%email%' OR column_name ILIKE '%mail%' OR column_name ILIKE '%address%'
               OR column_name = 'token' OR column_name ILIKE '%secret%')`,
    );
    expect(found.rows).toEqual([]);
  });

  it("registers a client and reads it back", async () => {
    await client();
    expect(await repo.getOAuthClient("ocl_test")).toEqual({
      clientId: "ocl_test",
      clientName: "Test client",
      redirectUris: ["https://client.example/cb"],
      registeredAt: AT,
    });
    expect(await repo.getOAuthClient("ocl_missing")).toBeNull();
  });

  it("redeems a code once and only once", async () => {
    await client();
    await repo.issueOAuthCode({
      codeHash: "code-1",
      clientId: "ocl_test",
      subjectId: ACTOR,
      redirectUri: "https://client.example/cb",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      scopes: ["read"],
      listingIds: ["prf_one"],
      at: AT,
      expiresAt: LATER,
    });
    const first = await repo.consumeOAuthCode("code-1", AT);
    expect(first).toMatchObject({ clientId: "ocl_test", subjectId: ACTOR, scopes: ["read"], listingIds: ["prf_one"] });
    expect(await repo.consumeOAuthCode("code-1", AT)).toBeNull();
  });

  it("resolves by access-token hash, and rotates a refresh in place", async () => {
    await oauthCredential();
    expect(await repo.resolveAgentCredential("access-agc_one")).toMatchObject({
      id: "agc_one",
      subjectId: ACTOR,
      scopes: ["read", "posts"],
      listingIds: null,
      revokedAt: null,
    });
    const rotated = await repo.rotateAgentCredential({
      refreshHash: "refresh-agc_one",
      clientId: "ocl_test",
      newTokenHash: "access-two",
      newRefreshHash: "refresh-two",
      tokenExpiresAt: HOUR,
      expiresAt: MONTH,
      at: LATER,
    });
    expect(rotated.kind).toBe("rotated");
    expect(await repo.resolveAgentCredential("access-agc_one")).toBeNull();
    expect(await repo.resolveAgentCredential("access-two")).toMatchObject({ id: "agc_one", lastUsedAt: LATER });
  });

  it("revokes the whole credential when a replaced refresh token comes back", async () => {
    await oauthCredential();
    await repo.rotateAgentCredential({
      refreshHash: "refresh-agc_one",
      clientId: "ocl_test",
      newTokenHash: "access-two",
      newRefreshHash: "refresh-two",
      tokenExpiresAt: HOUR,
      expiresAt: MONTH,
      at: LATER,
    });
    const replay = await repo.rotateAgentCredential({
      refreshHash: "refresh-agc_one",
      clientId: "ocl_test",
      newTokenHash: "access-three",
      newRefreshHash: "refresh-three",
      tokenExpiresAt: HOUR,
      expiresAt: MONTH,
      at: LATER,
    });
    expect(replay).toEqual({ kind: "reused" });
    expect((await repo.resolveAgentCredential("access-two"))?.revokedAt).toBe(LATER);
    // The live refresh token died with it.
    const after = await repo.rotateAgentCredential({
      refreshHash: "refresh-two",
      clientId: "ocl_test",
      newTokenHash: "access-four",
      newRefreshHash: "refresh-four",
      tokenExpiresAt: HOUR,
      expiresAt: MONTH,
      at: LATER,
    });
    expect(after.kind).not.toBe("rotated");
  });

  it("refuses a refresh from another client", async () => {
    await oauthCredential();
    await client("ocl_other");
    const stolen = await repo.rotateAgentCredential({
      refreshHash: "refresh-agc_one",
      clientId: "ocl_other",
      newTokenHash: "x",
      newRefreshHash: "y",
      tokenExpiresAt: HOUR,
      expiresAt: MONTH,
      at: LATER,
    });
    expect(stolen).toEqual({ kind: "unknown" });
  });

  it("lists a subject's live credentials and lets only them revoke one", async () => {
    await oauthCredential();
    await repo.createAgentCredential({
      id: "agc_pat",
      subjectId: ACTOR,
      kind: "personal",
      clientId: null,
      clientName: "My script",
      tokenHash: "access-pat",
      tokenExpiresAt: null,
      refreshHash: null,
      scopes: ["read"],
      listingIds: ["prf_one"],
      at: LATER,
      expiresAt: null,
    });
    expect((await repo.listAgentCredentials(ACTOR, LATER)).map((c) => c.id)).toEqual(["agc_pat", "agc_one"]);
    expect(await repo.revokeAgentCredential(ADMIN, "agc_pat", LATER)).toBe(false);
    expect(await repo.revokeAgentCredential(ACTOR, "agc_pat", LATER)).toBe(true);
    expect(await repo.revokeAgentCredential(ACTOR, "agc_pat", LATER)).toBe(false);
    expect((await repo.listAgentCredentials(ACTOR, LATER)).map((c) => c.id)).toEqual(["agc_one"]);
  });

  it("refuses a personal token that refreshes, and an OAuth grant that never ends", async () => {
    await client();
    await expect(
      repo.createAgentCredential({
        id: "agc_bad",
        subjectId: ACTOR,
        kind: "personal",
        clientId: null,
        clientName: "x",
        tokenHash: "h",
        tokenExpiresAt: null,
        refreshHash: "r",
        scopes: ["read"],
        listingIds: null,
        at: AT,
        expiresAt: null,
      }),
    ).rejects.toThrow();
    await expect(
      repo.createAgentCredential({
        id: "agc_bad2",
        subjectId: ACTOR,
        kind: "oauth",
        clientId: "ocl_test",
        clientName: "x",
        tokenHash: "h2",
        tokenExpiresAt: HOUR,
        refreshHash: "r2",
        scopes: ["read"],
        listingIds: null,
        at: AT,
        expiresAt: null,
      }),
    ).rejects.toThrow();
  });

  it("moves last_used_at at most once a minute", async () => {
    await oauthCredential();
    await repo.touchAgentCredential("agc_one", "2026-11-28T12:00:10.000Z", 60);
    await repo.touchAgentCredential("agc_one", "2026-11-28T12:00:40.000Z", 60);
    expect((await repo.resolveAgentCredential("access-agc_one"))?.lastUsedAt).toBe("2026-11-28T12:00:10.000Z");
    await repo.touchAgentCredential("agc_one", "2026-11-28T12:01:30.000Z", 60);
    expect((await repo.resolveAgentCredential("access-agc_one"))?.lastUsedAt).toBe("2026-11-28T12:01:30.000Z");
  });

  it("revokes by either token (RFC 7009)", async () => {
    await oauthCredential();
    await repo.revokeAgentCredentialByTokenHash("refresh-agc_one", LATER);
    expect((await repo.resolveAgentCredential("access-agc_one"))?.revokedAt).toBe(LATER);
  });
});
