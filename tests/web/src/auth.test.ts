// The public host's sign-in (openproduct-home OH1) — the pure module behind
// /auth/*. What is pinned:
//
//   - The authorize request asks for `identity` and nothing else — the whole
//     epic rests on the token being narrow.
//   - PKCE is real S256 (checked against RFC 7636's own test vector).
//   - The session cookie is host-scoped by construction: the attribute set is
//     a CLOSED object with no Domain key, the OD5 closed-list discipline.
//   - The anonymous pages never read the session — a source scan, because
//     byte-identical signed-in/signed-out rendering is a claim about absence.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTH_ERROR_COPY,
  HANDSHAKE_MAX_AGE_SECONDS,
  OPENPRODUCT_CLIENT_ID,
  SESSION_COOKIE,
  accessTokenStale,
  buildAuthorizeUrl,
  cookieAttributes,
  decodeSession,
  discoverEndpoints,
  encodeSession,
  exchangeCode,
  fetchIdentity,
  randomToken,
  refreshTokens,
  s256Challenge,
  sanitizeReturnTo,
} from "@openproduct-web/app/auth/auth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PKCE and the authorize request", () => {
  it("computes the RFC 7636 appendix-B challenge", async () => {
    expect(await s256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("mints 43-char base64url tokens, distinct per call — a valid verifier shape", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(a).not.toBe(b);
  });

  it("asks for scope=identity and NOTHING else — the narrow token is the epic", () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: "https://app.orunbase.com/oauth/authorize",
        redirectUri: "https://openproduct.live/auth/callback",
        state: "st",
        challenge: "ch",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://app.orunbase.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(OPENPRODUCT_CLIENT_ID);
    expect(url.searchParams.get("scope")).toBe("identity");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("https://openproduct.live/auth/callback");
  });
});

describe("the session cookie", () => {
  it("round-trips, and refuses garbage, wrong shapes, and expired sessions", () => {
    const session = {
      subjectId: "usr_" + "a".repeat(32),
      displayName: "Ada",
      accessToken: "tok.x.y",
      expiresAt: Date.now() + 60_000,
    };
    expect(decodeSession(encodeSession(session))).toEqual(session);
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession("not-base64url-json")).toBeNull();
    expect(decodeSession(encodeSession({ ...session, expiresAt: Date.now() - 1 }))).toBeNull();
  });

  it("is host-scoped by construction: the attribute set is closed and carries NO Domain", () => {
    const attrs = cookieAttributes(HANDSHAKE_MAX_AGE_SECONDS);
    // The closed list — an attribute that is not here does not exist, which is
    // how "no Domain" is checkable rather than asserted.
    expect(attrs).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: HANDSHAKE_MAX_AGE_SECONDS,
    });
  });

  it("keeps an access-expired session ALIVE when it carries a refresh token — it is due, not dead", () => {
    const base = {
      subjectId: "usr_" + "a".repeat(32),
      displayName: "Ada",
      accessToken: "tok.x.y",
      expiresAt: Date.now() - 1,
    };
    // Expired + no refresh token → dead (signed out).
    expect(decodeSession(encodeSession(base))).toBeNull();
    // Expired + refresh token → still returned, so /auth/session can refresh it.
    const refreshable = { ...base, refreshToken: "r3fr3sh" };
    expect(decodeSession(encodeSession(refreshable))).toEqual(refreshable);
    // A malformed refreshToken type is rejected outright.
    expect(decodeSession(encodeSession({ ...base, refreshToken: 5 as unknown as string }))).toBeNull();
  });

  it("accessTokenStale is true within the refresh skew, not only after expiry", () => {
    const fresh = { subjectId: "s", displayName: null, accessToken: "a", expiresAt: Date.now() + 600_000 };
    const nearlyGone = { ...fresh, expiresAt: Date.now() + 30_000 };
    expect(accessTokenStale(fresh)).toBe(false);
    expect(accessTokenStale(nearlyGone)).toBe(true);
  });
});

describe("refreshTokens (RFC 6749 §6)", () => {
  it("requests the SAME narrow scope as the public client and returns the rotated grant", async () => {
    let sent: string | null = null;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = String(init?.body);
      return jsonResponse({ access_token: "new.at", token_type: "Bearer", expires_in: 900, refresh_token: "rotated" });
    }) as typeof fetch;
    const outcome = await refreshTokens(
      { tokenEndpoint: "https://api.test/v1/auth/oauth2/token", refreshToken: "old" },
      fetchImpl,
    );
    expect(outcome.ok).toBe(true);
    const grant = outcome.ok ? outcome.grant : null;
    expect(grant?.accessToken).toBe("new.at");
    expect(grant?.refreshToken).toBe("rotated");
    const params = new URLSearchParams(sent!);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("old");
    expect(params.get("client_id")).toBe(OPENPRODUCT_CLIENT_ID);
    // Narrow, never widen: the refresh asks for identity, exactly as OI1 requires.
    expect(params.get("scope")).toBe("identity");
  });

  it("is `refused` on a refusal — the caller then clears the session, like a dead token", async () => {
    const fetchImpl = (async () => jsonResponse({ error: "invalid_grant" }, 400)) as typeof fetch;
    expect(await refreshTokens({ tokenEndpoint: "https://api.test/t", refreshToken: "x" }, fetchImpl)).toEqual({
      ok: false,
      failure: "refused",
    });
  });

  // THE BUG THIS PINS: a 429 from the shared platform ceiling used to read
  // exactly like a revoked token, and `/auth/session` signed the visitor out
  // over it. A refresh token the authorization server never judged is still
  // good, and only a refusal may end a session.
  it("is `unavailable` — never `refused` — for anything that is not an RFC 6749 §5.2 no", async () => {
    // 429 (a shared ceiling), 5xx (an outage), 403/404 (a mis-routed or
    // mis-configured endpoint): none of these judged the refresh token, so
    // none of them may end a session.
    for (const status of [403, 404, 429, 500, 502, 503]) {
      const fetchImpl = (async () => jsonResponse({ error: "rate_limited" }, status)) as typeof fetch;
      expect(await refreshTokens({ tokenEndpoint: "https://api.test/t", refreshToken: "x" }, fetchImpl)).toEqual({
        ok: false,
        failure: "unavailable",
      });
    }
  });

  it("is `unavailable` when the request never completes at all", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("network error");
    }) as unknown as typeof fetch;
    expect(await refreshTokens({ tokenEndpoint: "https://api.test/t", refreshToken: "x" }, fetchImpl)).toEqual({
      ok: false,
      failure: "unavailable",
    });
  });
});

describe("discovery, exchange, identity", () => {
  it("discovers the AS endpoints from RFC 8414 metadata — the AS's claims are the config", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return jsonResponse({
        authorization_endpoint: "https://app.test/oauth/authorize",
        token_endpoint: "https://api.test/v1/auth/oauth2/token",
      });
    }) as typeof fetch;
    const endpoints = await discoverEndpoints("https://api.test", fetchImpl);
    expect(endpoints).toEqual({
      authorizationEndpoint: "https://app.test/oauth/authorize",
      tokenEndpoint: "https://api.test/v1/auth/oauth2/token",
    });
    expect(calls).toEqual(["https://api.test/.well-known/oauth-authorization-server"]);
    expect(await discoverEndpoints("https://api.test", (async () => jsonResponse({}, 503)) as typeof fetch)).toBeNull();
  });

  it("exchanges the code with the exact RFC 6749 §4.1.3 fields, as the public client", async () => {
    let sent: string | null = null;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = String(init?.body);
      return jsonResponse({ access_token: "at.x.y", token_type: "Bearer", expires_in: 3600, refresh_token: "r" });
    }) as typeof fetch;
    const outcome = await exchangeCode(
      {
        tokenEndpoint: "https://api.test/v1/auth/oauth2/token",
        code: "c0de",
        redirectUri: "https://openproduct.live/auth/callback",
        verifier: "v".repeat(43),
      },
      fetchImpl,
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.grant.accessToken).toBe("at.x.y");
    const params = new URLSearchParams(sent!);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("client_id")).toBe("openproduct-live");
    expect(params.get("code")).toBe("c0de");
    expect(params.get("code_verifier")).toBe("v".repeat(43));
    // No client secret exists to send — a public client with PKCE (OI-C).
    expect(params.has("client_secret")).toBe(false);
  });

  // THE PRODUCTION FAILURE THIS PINS. `/?auth_error=exchange` says "the final
  // step of the sign-in failed", which is a dead end — and a 429 from the
  // platform's shared token-endpoint ceiling used to land there, telling a
  // visitor their sign-in was broken when the only true statement was "not
  // this second". The callback picks its copy off this distinction.
  it("separates a code the AS refused from an AS that never answered", async () => {
    const input = {
      tokenEndpoint: "https://api.test/v1/auth/oauth2/token",
      code: "c0de",
      redirectUri: "https://openproduct.live/auth/callback",
      verifier: "v".repeat(43),
    };
    const refused = (async () => jsonResponse({ error: "invalid_grant" }, 400)) as typeof fetch;
    expect(await exchangeCode(input, refused)).toEqual({ ok: false, failure: "refused" });

    for (const status of [403, 404, 429, 500, 503]) {
      const busy = (async () => jsonResponse({ error: "rate_limited" }, status)) as typeof fetch;
      expect(await exchangeCode(input, busy)).toEqual({ ok: false, failure: "unavailable" });
    }

    // 401 `invalid_client` is the other half of §5.2 and IS a verdict.
    const badClient = (async () => jsonResponse({ error: "invalid_client" }, 401)) as typeof fetch;
    expect(await exchangeCode(input, badClient)).toEqual({ ok: false, failure: "refused" });

    // A 200 that is not a token response is a broken server, not a verdict on
    // the code — retrying is the right advice there too.
    const malformed = (async () => jsonResponse({ nothing: "useful" })) as typeof fetch;
    expect(await exchangeCode(input, malformed)).toEqual({ ok: false, failure: "unavailable" });
  });

  it("reads the ONE endpoint the scoped token authorizes and nothing else", async () => {
    const calls: Array<{ url: string; auth: string | null }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(url), auth: headers.get("authorization") });
      return jsonResponse({ data: { subjectId: "usr_1", displayName: "Ada" } });
    }) as typeof fetch;
    const identity = await fetchIdentity("https://api.test", "tok", fetchImpl);
    expect(identity).toEqual({ subjectId: "usr_1", displayName: "Ada" });
    expect(calls).toEqual([{ url: "https://api.test/v1/identity/me", auth: "Bearer tok" }]);
  });
});

describe("byte-identical anonymous pages", () => {
  it("no anonymous page module reads cookies or the session — the session read has one home", () => {
    // The claim is absence, so it is a source scan over the CLOSED set of
    // modules that render the anonymous surface.
    for (const file of [
      "page.tsx",
      "[slug]/page.tsx",
      "layout.tsx",
      "public-api.ts",
      "not-found.tsx",
      // The launch-polish islands personalise CLIENT-SIDE from /auth/session
      // and the URL — they must never read the cookie itself.
      "auth-notice.tsx",
      // The four route archetypes (openproduct-commons XP1).
      // `list/directory.tsx` left the set with the directory itself: `/` is
      // the launches, and the feed's own modules are held below.
      "page.tsx",
      "feed/products-view.tsx",
      "feed/feed-row.tsx",
      "feed/product-card.tsx",
      "feed/product-list.tsx",
      "products/page.tsx",
      "help-wanted/page.tsx",
      "help-wanted/seat-card.tsx",
      "people/(index)/page.tsx",
      "people/[handle]/page.tsx",
      "ui/bits.tsx",
      "ui/pending.ts",
      // The commons shell (openproduct-commons XP0). It renders on EVERY
      // route, so it is the highest-consequence member of this set: one
      // cookie read here would personalise the whole cached surface.
      // `session-chip.tsx` left the set here — the shell's AccountChip is
      // where its job now lives.
      "shell/shell.ts",
      "shell/top-panel.tsx",
      "shell/account-chip.tsx",
      "shell/logomark.tsx",
      // theme-sync.tsx left the set at OX2, and the theme boot script left
      // with the second theme: the site paints one palette for everybody.
    ]) {
      const source = readFileSync(resolve(APP_DIR, file), "utf-8");
      expect(source).not.toMatch(/cookies\(|\.cookies|op_session|SESSION_COOKIE/);
    }
  });

  it("the sign-in entry's SERVER render is the same for every visitor — the chip personalises client-side only", () => {
    const chip = readFileSync(resolve(APP_DIR, "shell/account-chip.tsx"), "utf-8");
    // WHAT THIS USED TO ASSERT was the SSR fallback STATE — a React union
    // whose anonymous member the server always rendered. That union is gone,
    // and what replaced it satisfies the same invariant more directly: the
    // component renders BOTH branches unconditionally, so there is no state
    // for the server to fall back to and nothing for a render to choose
    // between. Which one a visitor SEES is decided by a class on `<html>`,
    // outside React and outside the HTML.
    expect(chip).toContain('data-auth-branch="anonymous"');
    expect(chip).toContain('data-auth-branch="signed-in"');
    // The anchor's target is the door, and it is the same markup for
    // everybody — which is the property this test is about.
    expect(chip).toContain("signInHref(returnTo)");
    // No branch may depend on a signed-in flag in state: that is exactly the
    // conditional render this invariant forbids.
    expect(chip).not.toMatch(/kind: "signedIn"/);
  });

  it("the server never reads the hint cookie — only the browser does", () => {
    // The flicker fix adds a READABLE cookie, and the one way it could break
    // I6 is if a server component started rendering from it: the HTML would
    // vary per visitor and the page would stop being one cached document.
    // It is read in exactly one place, by a script, in the visitor's browser.
    const layout = readFileSync(resolve(APP_DIR, "layout.tsx"), "utf-8");
    expect(layout).toContain("document.cookie");
    expect(layout).not.toMatch(/cookies\(\)/);
    const chip = readFileSync(resolve(APP_DIR, "shell/account-chip.tsx"), "utf-8");
    expect(chip).not.toContain("document.cookie");
  });
});

// SESSION_COOKIE is exercised via encode/decode above; referenced here so the
// import list stays honest about what the module exports.
void SESSION_COOKIE;

// ─── launch polish — return_to and the failure copy ───

describe("sanitizeReturnTo", () => {
  it("accepts same-host relative paths and nothing else", () => {
    expect(sanitizeReturnTo("/me/saved")).toBe("/me/saved");
    expect(sanitizeReturnTo("/acme-thing?x=1")).toBe("/acme-thing?x=1");
    expect(sanitizeReturnTo("https://evil.com/")).toBeNull();
    expect(sanitizeReturnTo("//evil.com")).toBeNull();
    expect(sanitizeReturnTo("/\\evil.com")).toBeNull();
    expect(sanitizeReturnTo("me")).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
  });

  it("refuses loops, control characters, and oversized values", () => {
    expect(sanitizeReturnTo("/auth/start")).toBeNull();
    expect(sanitizeReturnTo("/auth")).toBeNull();
    // The door is not a destination either: `/signin?return_to=/signin` is a
    // visitor sent back to the form they just filled in.
    expect(sanitizeReturnTo("/signin")).toBeNull();
    expect(sanitizeReturnTo("/signin?return_to=%2Fme")).toBeNull();
    expect(sanitizeReturnTo("/me\u0000")).toBeNull();
    expect(sanitizeReturnTo("/" + "x".repeat(600))).toBeNull();
  });
});

describe("the sign-in failure copy", () => {
  it("covers every reason the auth routes can emit — a new failure mode cannot ship silent", () => {
    const callback = readFileSync(resolve(APP_DIR, "auth/callback/route.ts"), "utf-8");
    const start = readFileSync(resolve(APP_DIR, "auth/start/route.ts"), "utf-8");
    const reasons = new Set<string>();
    for (const source of [callback, start]) {
      // `auth_error=<reason>` written straight into a URL.
      for (const match of source.matchAll(/auth_error=([a-z_]+)/g)) {
        reasons.add(match[1]!);
      }
      // Every string literal handed to `fail(...)`, WHATEVER THE EXPRESSION
      // SHAPE. This used to match only the literal `fail("reason")`, so the
      // day the callback started choosing between two reasons —
      // `fail(x ? "busy" : "exchange")` — the scan quietly saw neither and
      // this guard would have waved an uncovered reason through if the count
      // floor had not caught it. Reading the whole argument list keeps the
      // guard honest as the routes get more expressive.
      for (const call of source.matchAll(/\bfail\(([^)]*)\)/g)) {
        for (const literal of call[1]!.matchAll(/"([a-z_]+)"/g)) {
          reasons.add(literal[1]!);
        }
      }
    }
    expect(reasons.size).toBeGreaterThanOrEqual(6);
    for (const reason of reasons) {
      expect(AUTH_ERROR_COPY[reason]).toBeDefined();
    }
  });
});

