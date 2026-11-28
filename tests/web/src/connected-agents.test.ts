// Connecting an agent, from the website's side (openproduct-mcp MC1).
//
// The consent screen and Connected agents are the two pages where a person
// hands somebody else authority, so what is pinned here is the handful of
// rules that keep that safe: the consent screen is never framed, its buttons
// and the token routes refuse a cross-site post, a new token never travels in
// a URL, and the cookie that carries it is scoped and short.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { newTokenCookie, readNewToken } from "@openproduct-web/app/me/settings/agents/new-token";
import { createGrant, fetchConsentClient, revokeAgentCredential } from "@openproduct-web/app/me/agents-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(__dirname, "../../../web");
const read = (path: string) => readFileSync(resolve(WEB, path), "utf-8");

describe("MC1 — the consent screen", () => {
  it("is never framed", () => {
    const config = read("next.config.mjs");
    expect(config).toContain('source: "/me/connect"');
    expect(config).toContain('source: "/me/settings/agents"');
    expect(config).toContain('{ key: "X-Frame-Options", value: "DENY" }');
    expect(config).toContain(`{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }`);
  });

  it("re-checks the client and its redirect before it offers Allow", () => {
    const page = read("src/app/me/connect/page.tsx");
    expect(page).toContain("redirectUriMatches(client.redirectUris, redirectUri)");
    expect(page).toContain("isPkceChallenge(challenge)");
    expect(page).toContain("unverified: the app named itself");
  });

  it("says only fixed sentences, never text from its own address", () => {
    for (const file of ["src/app/me/connect/page.tsx", "src/app/me/settings/agents/page.tsx"]) {
      expect([file, /\{q\.error\.slice/.test(read(file))]).toEqual([file, false]);
    }
    expect(read("src/app/me/connect/decide/route.ts")).not.toContain("result.message");
  });

  it("forgets a new token once it has been shown", () => {
    expect(read("src/app/me/settings/agents/page.tsx")).toContain("<ForgetNewToken />");
    expect(read("src/app/auth/agent-token-seen/route.ts")).toContain("maxAge: 0");
  });

  it("sends the browser only where the gateway names, and refuses a cross-site post", () => {
    const route = read("src/app/me/connect/decide/route.ts");
    expect(route).toContain("if (!sameOriginPost(request))");
    expect(route).toContain("location: result.data.redirectTo");
    expect(route).not.toMatch(/searchParams\.get\("redirect_uri"\)/);
  });
});

describe("MC1 — Connected agents", () => {
  it("guards mint, revoke and seen against a cross-site post", () => {
    for (const file of ["src/app/me/settings/agents/mint/route.ts", "src/app/me/settings/agents/revoke/route.ts", "src/app/auth/agent-token-seen/route.ts"]) {
      expect([file, read(file).includes("if (!sameOriginPost(request))")]).toEqual([file, true]);
    }
  });

  it("never puts a new token in a URL", () => {
    const mint = read("src/app/me/settings/agents/mint/route.ts");
    expect(mint).toContain("response.cookies.set(newTokenCookie(result.data.token));");
    expect(mint).not.toMatch(/\?[^"`]*token=/);
  });

  it("carries a new token in a strict, path-scoped, one-minute cookie, and reads only an agent token back", () => {
    const cookie = newTokenCookie("opa_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/me/settings/agents", maxAge: 60 });
    expect(readNewToken("opa_abcdefghijklmnopqrstuvwxyz0123456789")).toBe("opa_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(readNewToken("ops_abcdefghijklmnopqrstuvwxyz0123456789")).toBeNull();
    expect(readNewToken("opa_<script>")).toBeNull();
    expect(readNewToken(undefined)).toBeNull();
  });
});

describe("MC1 — the website's client", () => {
  it("asks for a client by id only when it is shaped like one", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    expect(await fetchConsentClient("../../me", fetchImpl)).toBeNull();
    expect(called).toBe(0);
    expect(await fetchConsentClient("ocl_abc", fetchImpl)).toBeNull();
    expect(called).toBe(1);
  });

  it("hands a refusal back in the service's own words", async () => {
    const fetchImpl = (async () =>
      Response.json({ error: { message: "Validation failed", details: { fields: { scopes: ["Choose at least one"] } } } }, { status: 422 })) as typeof fetch;
    const result = await createGrant(
      "ops_x",
      { clientId: "ocl_a", redirectUri: "https://a.example/cb", codeChallenge: "c", state: null, scopes: [], listingIds: null, decision: "allow" },
      fetchImpl,
    );
    expect(result).toEqual({ kind: "refused", message: "Choose at least one" });
  });

  it("never revokes an id that is not shaped like a credential's", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called += 1;
      return Response.json({ data: { revoked: true } });
    }) as typeof fetch;
    expect((await revokeAgentCredential("ops_x", "../me", fetchImpl)).kind).toBe("refused");
    expect(called).toBe(0);
  });
});
