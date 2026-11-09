// The sign-in round trip, against both halves of the seam (AC2b).
//
// This is AC2b's done-when in test form: "both doors reach the same session
// shape and a tampered cookie is refused". The first half is here (the second
// is in tests/web, where the cookie lives).
//
// TWO FIXTURES STAND IN FOR TWO AUTHORITIES, and keeping them separate is the
// point rather than a convenience:
//
//   the platform  POST /v1/seam/openproduct/subject-by-email → { subjectId }
//   core          GET  /internal/openproduct/credentials/{id} → { verifier }
//                 POST /internal/openproduct/auth/sessions    → { issued }
//
// A sign-in needs BOTH, and every way either of them can fail has to reach
// the person as the same sentence. Most of what follows is that list.

import {
  AUTH_TOO_FAST,
  SESSION_TOKEN_PREFIX,
  SIGN_IN_REFUSAL,
  SIGN_IN_UNAVAILABLE_NOTE,
  SIGN_OUT_NOTE,
  isOpenproductSessionToken,
} from "@openproduct/contracts";
import { route } from "@openproduct-gateway/router";
import type { Env } from "@openproduct-gateway/env";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import { resetSubjectCache } from "@openproduct-gateway/subject";

const ADDRESS = "ada@example.com";
const PASSWORD = "correct horse battery staple";
const SUBJECT = "usr_0123456789abcdef0123456789abcdef";
const VERIFIER = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$aGFzaGVkdmFsdWVoZXJl";
const SEAM_SECRET = "auth-seam-secret-at-least-32-chars";

const SIGN_IN = "https://gw.test/v1/openproduct/auth/sign-in";
const SIGN_OUT = "https://gw.test/v1/openproduct/auth/sign-out";

interface Wire {
  platform: Array<{ url: string; body: string; headers: Record<string, string> }>;
  core: Array<{ url: string; method: string; body: string }>;
}

interface Over {
  /** What the seam answers. `undefined` = the address resolves to SUBJECT. */
  subjectId?: string | null;
  /** What core's credential read answers. `undefined` = VERIFIER. */
  verifier?: string | null;
  seamFails?: boolean;
  seamSecretMissing?: boolean;
  sessionMintFails?: boolean;
  /** Does the password check pass. Injected so no case pays argon2id. */
  passwordMatches?: boolean;
}

function fixture(over: Over = {}): { env: Env; wire: Wire; restore: () => void } {
  const wire: Wire = { platform: [], core: [] };
  const realFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    wire.platform.push({ url, body: String(init?.body ?? ""), headers });

    if (url.endsWith("/v1/seam/openproduct/subject-by-email")) {
      if (over.seamFails) return new Response("{}", { status: 503 });
      const subjectId = over.subjectId === undefined ? SUBJECT : over.subjectId;
      return Response.json({ data: { subjectId } });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  const core = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      wire.core.push({
        url,
        method: (init?.method ?? "GET").toUpperCase(),
        body: String(init?.body ?? ""),
      });
      if (url.includes("/internal/openproduct/credentials/")) {
        const verifier = over.verifier === undefined ? VERIFIER : over.verifier;
        return Response.json({ data: { verifier } });
      }
      if (url.endsWith("/auth/sessions")) {
        if (over.sessionMintFails) return new Response("{}", { status: 500 });
        return Response.json({ data: { issued: true } }, { status: 201 });
      }
      if (url.endsWith("/auth/sessions/revoke")) {
        return Response.json({ data: { revoked: true } });
      }
      if (url.endsWith("/auth/sessions/resolve")) {
        return Response.json({ data: { subjectId: SUBJECT } });
      }
      return new Response("{}", { status: 404 });
    },
  } as unknown as Fetcher;

  return {
    env: {
      CORE: core,
      ENVIRONMENT: "test",
      PLATFORM_API_URL: "https://platform.test",
      SITE_ORIGIN: "https://openproduct.live",
      ...(over.seamSecretMissing ? {} : { OPENPRODUCT_AUTH_SEAM_SECRET: SEAM_SECRET }),
    } as Env,
    wire,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

function post(url: string, body: unknown, ip = "203.0.113.7", bearer?: string): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_ac2b",
      "cf-connecting-ip": ip,
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * The happy path's password check, dictated rather than computed.
 *
 * The fixture's verifier was never derived from PASSWORD — it is a
 * correctly-SHAPED argon2id string, which is what the decoy tests need — so a
 * real comparison would (correctly) fail. These cases are about what happens
 * AFTER a password matches, and paying 82ms to be told what the test already
 * decided is 82ms spent on nothing.
 */
const MATCHES = { verifyPassword: async () => true };

async function data(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  resetBuckets();
  resetSubjectCache();
});

describe("AC2b — sign-in, the happy path", () => {
  it("resolves the address, checks the password, and hands back a session", async () => {
    const { env, wire, restore } = fixture();
    try {
      const res = await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, MATCHES);
      expect(res.status).toBe(200);
      const body = await data(res);
      expect(typeof body.token).toBe("string");
      expect(isOpenproductSessionToken(body.token as string)).toBe(true);
      expect(typeof body.expiresAt).toBe("string");

      // The order is the design: seam first, credential second, mint third.
      expect(wire.platform).toHaveLength(1);
      expect(wire.platform[0]!.url).toContain("/v1/seam/openproduct/subject-by-email");
      expect(wire.core.map((c) => c.method)).toEqual(["GET", "POST"]);
      expect(wire.core[1]!.url).toContain("/auth/sessions");
    } finally {
      restore();
    }
  });

  it("signs the seam call and sends the address on that line and no other", async () => {
    const { env, wire, restore } = fixture();
    try {
      await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, MATCHES);
      const call = wire.platform[0]!;
      expect(call.headers["x-webhook-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(call.headers["x-webhook-timestamp"]).toMatch(/^\d+$/);
      expect(JSON.parse(call.body)).toEqual({ email: ADDRESS });

      // I3, asserted rather than assumed: nothing that reached CORE mentions
      // the address in any form. Core has no parameter for one and AC0's
      // schema has no column, but the check is cheap and this is the request
      // where an address is briefly in memory.
      const toCore = JSON.stringify(wire.core);
      expect(toCore).not.toContain(ADDRESS);
      expect(toCore).not.toContain("@");
    } finally {
      restore();
    }
  });

  it("never sends the typed password anywhere", async () => {
    // The verifier comes OUT to be compared here; the plaintext goes nowhere.
    const { env, wire, restore } = fixture();
    try {
      await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, MATCHES);
      expect(JSON.stringify(wire)).not.toContain(PASSWORD);
    } finally {
      restore();
    }
  });

  it("mints a token core has never seen before this request", async () => {
    const { env, wire, restore } = fixture();
    try {
      const first = await data(
        await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, MATCHES),
      );
      resetBuckets();
      const second = await data(
        await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, MATCHES),
      );
      expect(first.token).not.toEqual(second.token);
      // And the token sent to core is the one handed back — core hashes it.
      expect(wire.core[1]!.body).toContain(first.token as string);
    } finally {
      restore();
    }
  });
});

describe("AC2b — one refusal for every failure", () => {
  const cases: Array<[string, Over]> = [
    ["an address the platform does not know", { subjectId: null }],
    ["an account with no password here", { verifier: null }],
    ["the wrong password", { passwordMatches: false }],
    ["a platform that did not answer", { seamFails: true }],
    ["a seam key that was never delivered", { seamSecretMissing: true }],
  ];

  for (const [name, over] of cases) {
    it(`answers identically for ${name}`, async () => {
      const { env, restore } = fixture(over);
      try {
        const res = await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, {
          verifyPassword: async () => over.passwordMatches !== false,
        } as never);
        expect([name, res.status]).toEqual([name, 401]);
        expect([name, (await data(res)).note]).toEqual([name, SIGN_IN_REFUSAL]);
      } finally {
        restore();
      }
    });
  }

  it("refuses a malformed address without troubling the seam", async () => {
    // Not an oracle: a fact about the string in the box. Refusing here spares
    // the platform a call that could not have succeeded.
    const { env, wire, restore } = fixture();
    try {
      const res = await route(post(SIGN_IN, { email: "not-an-address", password: PASSWORD }), env);
      expect(res.status).toBe(401);
      expect((await data(res)).note).toBe(SIGN_IN_REFUSAL);
      expect(wire.platform).toEqual([]);
    } finally {
      restore();
    }
  });

  it("says something DIFFERENT when the password was right and we failed", async () => {
    // The one place the ambiguity stops. By here the password was correct, so
    // there is nothing left to hide from this caller — and telling them it is
    // our fault is the difference between "try again" and "check your
    // password", which are different actions.
    const { env, restore } = fixture({ sessionMintFails: true });
    try {
      const res = await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, {
        verifyPassword: async () => true,
      } as never);
      expect(res.status).toBe(503);
      expect((await data(res)).note).toBe(SIGN_IN_UNAVAILABLE_NOTE);
    } finally {
      restore();
    }
  });
});

describe("AC2b — the timing oracle is closed on purpose", () => {
  it("verifies a decoy when no credential exists, so the clock says nothing", async () => {
    // argon2id is ~82ms by design. Returning early on "no such account" would
    // answer in microseconds, and that difference IS the enumeration oracle
    // the response bodies are so careful about — arriving through the clock
    // instead. So the work is done and the answer thrown away.
    const seen: string[] = [];
    const { env, restore } = fixture({ subjectId: null });
    try {
      const res = await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, {
        verifyPassword: async (_plain: string, encoded: string) => {
          seen.push(encoded);
          return false;
        },
      } as never);
      expect(res.status).toBe(401);
      // It ran, and against a REAL argon2id-shaped verifier: a malformed one
      // would make the library throw immediately, which is the same early
      // return in a different costume.
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    } finally {
      restore();
    }
  });

  it("does the same work for an account that exists but has no password", async () => {
    const seen: string[] = [];
    const { env, restore } = fixture({ verifier: null });
    try {
      await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, {
        verifyPassword: async (_p: string, encoded: string) => {
          seen.push(encoded);
          return false;
        },
      } as never);
      expect(seen).toHaveLength(1);
    } finally {
      restore();
    }
  });
});

describe("AC2b — two buckets, two attacks", () => {
  it("stops one client trying many passwords, before the seam is touched", async () => {
    const { env, wire, restore } = fixture();
    try {
      let refused: Response | null = null;
      for (let i = 0; i < 25; i += 1) {
        const res = await route(post(SIGN_IN, { email: ADDRESS, password: "wrong" }), env, {
          verifyPassword: async () => false,
        } as never);
        if (res.status === 429) {
          refused = res;
          break;
        }
      }
      expect(refused).not.toBeNull();
      expect((await data(refused!)).note).toBe(AUTH_TOO_FAST);
      // The bucket is taken FIRST, so the refused attempts cost the platform
      // nothing: fewer seam calls than sign-in attempts.
      expect(wire.platform.length).toBeLessThan(25);
    } finally {
      restore();
    }
  });

  it("stops many clients trying ONE account, which the IP bucket cannot see", async () => {
    const { env, restore } = fixture();
    try {
      let refused = false;
      // A different IP every time — the per-IP bucket never fires.
      for (let i = 0; i < 15; i += 1) {
        const res = await route(
          post(SIGN_IN, { email: ADDRESS, password: "wrong" }, `198.51.100.${i}`),
          env,
          { verifyPassword: async () => false } as never,
        );
        if (res.status === 429) {
          refused = true;
          break;
        }
      }
      expect(refused).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("AC2b — sign-out", () => {
  it("revokes one of ours", async () => {
    const { env, wire, restore } = fixture();
    try {
      const res = await route(post(SIGN_OUT, {}, "203.0.113.7", `${SESSION_TOKEN_PREFIX}abc123`), env);
      expect(res.status).toBe(200);
      expect((await data(res)).note).toBe(SIGN_OUT_NOTE);
      expect(wire.core.some((c) => c.url.endsWith("/auth/sessions/revoke"))).toBe(true);
    } finally {
      restore();
    }
  });

  it("touches nothing when the bearer is the platform's", async () => {
    // Ending a platform session is the platform's to do. Quietly failing at
    // it would be worse than not trying: somebody would believe they had
    // signed out of everything.
    const { env, wire, restore } = fixture();
    try {
      const res = await route(post(SIGN_OUT, {}, "203.0.113.7", "tok_platform_issued"), env);
      expect(res.status).toBe(200);
      expect(wire.core).toEqual([]);
    } finally {
      restore();
    }
  });
});
