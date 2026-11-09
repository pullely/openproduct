// The full sign-up round trip, against a seam fixture (openproduct-launch AC1).
//
// THIS IS AC1'S DONE-WHEN: "a full sign-up round trip works against the seam
// fixture and the address is gone from the row after verification". The second
// half is stronger than it was written — the address is never IN a row, so
// what is asserted is that it never crosses out of this worker at all.
//
// The fixture stands in for the platform's identity worker:
//
//   POST /v1/auth/login/start     { email }             → { challengeId }
//   POST /v1/auth/login/complete  { challengeId, code } → { token, user }
//
// and it answers with `user.email` populated, exactly as the real one does —
// because the whole point of `narrowCompletion` is that openproduct throws
// that away, and a fixture that omitted it would test nothing.

import {
  AUTH_AMBIGUOUS_ANSWER,
  AUTH_TOO_FAST,
  PASSWORD_REFUSAL,
  TOKEN_SPENT_NOTE,
} from "@openproduct/contracts";
import { route } from "@openproduct-gateway/router";
import type { Env } from "@openproduct-gateway/env";
import { resetBuckets } from "@openproduct-gateway/ratelimit";

const ADDRESS = "ada@example.com";
const PASSWORD = "correct horse battery staple";
const CHALLENGE = "chl_0123456789abcdef";
const CODE = "482913";
const SUBJECT = "usr_0123456789abcdef0123456789abcdef";

const SIGN_UP = "https://gw.test/v1/openproduct/auth/sign-up";
const VERIFY = "https://gw.test/v1/openproduct/auth/verify";

/** Everything that left this worker, in order — the record the assertions
 *  about "the address never crosses" are made against. */
interface Wire {
  platform: Array<{ url: string; body: string }>;
  core: Array<{ url: string; body: string }>;
}

function fixture(
  over: { startFails?: boolean; completeFails?: boolean; credentialSet?: boolean } = {},
): { env: Env; wire: Wire; restore: () => void } {
  const wire: Wire = { platform: [], core: [] };
  const realFetch = globalThis.fetch;

  // ─── the platform ───────────────────────────────────────────────────────
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = String(init?.body ?? "");
    wire.platform.push({ url, body });

    if (url.endsWith("/v1/auth/login/start")) {
      if (over.startFails) return new Response("{}", { status: 500 });
      return Response.json({ data: { challengeId: CHALLENGE, expiresAt: "2026-09-06T12:00:00.000Z" } });
    }
    if (url.endsWith("/v1/auth/login/complete")) {
      if (over.completeFails) return new Response("{}", { status: 400 });
      // THE ADDRESS COMES BACK, exactly as the real platform sends it.
      return Response.json({
        data: {
          token: "tok_live",
          tokenType: "bearer",
          expiresAt: "2026-09-06T12:00:00.000Z",
          user: { id: SUBJECT, email: ADDRESS, displayName: "Ada" },
        },
      });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  // ─── core ───────────────────────────────────────────────────────────────
  const core = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      wire.core.push({ url: String(input), body: String(init?.body ?? "") });
      return Response.json({ data: { credentialSet: over.credentialSet ?? true } });
    },
  } as unknown as Fetcher;

  return {
    env: {
      CORE: core,
      ENVIRONMENT: "test",
      PLATFORM_API_URL: "https://platform.test",
      SITE_ORIGIN: "https://openproduct.live",
    } as Env,
    wire,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

function post(url: string, body: unknown, ip = "203.0.113.7"): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_ac1",
      "cf-connecting-ip": ip,
    },
    body: JSON.stringify(body),
  });
}

async function data(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  resetBuckets();
});

describe("AC1's done-when — the whole round trip", () => {
  it("signs somebody up, verifies them, and sets their password", async () => {
    const f = fixture();
    try {
      // ── 1. they type an address and a password ──
      const up = await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), f.env);
      expect(up.status).toBe(202);
      const upBody = await data(up);
      expect(upBody.note).toBe(AUTH_AMBIGUOUS_ANSWER);
      expect(upBody.challengeId).toBe(CHALLENGE);

      // The platform was asked to send, and core was told which password is
      // waiting behind that challenge.
      expect(f.wire.platform).toHaveLength(1);
      expect(f.wire.platform[0]!.url).toBe("https://platform.test/v1/auth/login/start");
      expect(f.wire.core).toHaveLength(1);
      expect(JSON.parse(f.wire.core[0]!.body).challengeId).toBe(CHALLENGE);

      // ── 2. they read the mail and come back with the code ──
      const done = await route(post(VERIFY, { challengeId: CHALLENGE, code: CODE }), f.env);
      expect(done.status).toBe(200);
      const doneBody = await data(done);
      expect(doneBody.credentialSet).toBe(true);
      expect(doneBody.token).toBe("tok_live");

      // Core was handed the SUBJECT the platform minted.
      expect(JSON.parse(f.wire.core[1]!.body)).toEqual({
        challengeId: CHALLENGE,
        subjectId: SUBJECT,
      });
    } finally {
      f.restore();
    }
  });

  it("NEVER LETS THE ADDRESS PAST THIS WORKER — the other half of the done-when", async () => {
    // The plan said "the address is gone from the row after verification".
    // There is no row it could be in (AC0), so the stronger thing is asserted:
    // it goes to the platform and nowhere else, and it comes BACK from the
    // platform and is dropped here.
    const f = fixture();
    try {
      await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), f.env);
      await route(post(VERIFY, { challengeId: CHALLENGE, code: CODE }), f.env);

      // Outbound to the platform: yes, once, and that is the point of the seam.
      expect(f.wire.platform[0]!.body).toContain(ADDRESS);

      // Outbound to core: never, on either call.
      for (const call of f.wire.core) {
        expect(call.body).not.toContain(ADDRESS);
        expect(call.body).not.toContain("ada");
        expect(call.body).not.toContain("@");
      }
    } finally {
      f.restore();
    }
  });

  it("never lets the PASSWORD past this worker either", async () => {
    // It is hashed while the plaintext still exists, before anything crosses a
    // boundary. Nothing downstream holds what somebody typed.
    const f = fixture();
    try {
      await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), f.env);
      for (const call of [...f.wire.core, ...f.wire.platform]) {
        expect(call.body).not.toContain(PASSWORD);
        expect(call.body).not.toContain("battery");
      }
      // What core got is an argon2id verifier at AC0's published parameters.
      const sent = JSON.parse(f.wire.core[0]!.body) as { verifier: string };
      expect(sent.verifier).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    } finally {
      f.restore();
    }
  });

  it("returns no address in its OWN answer, on either call", async () => {
    const f = fixture();
    try {
      const up = await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), f.env);
      const done = await route(post(VERIFY, { challengeId: CHALLENGE, code: CODE }), f.env);
      for (const res of [up, done]) {
        expect(JSON.stringify(await res.json())).not.toContain("@");
      }
    } finally {
      f.restore();
    }
  });
});

describe("what a stranger can learn by trying", () => {
  it("answers the same for an address the platform knows and one it does not", async () => {
    // openproduct cannot tell the difference — it never learns which addresses
    // exist — so this is structural rather than a rule. The assertion pins the
    // structure.
    const known = fixture();
    const unknown = fixture({ startFails: true });
    try {
      const a = await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), known.env);
      resetBuckets();
      const b = await route(
        post(SIGN_UP, { email: "nobody@example.com", password: PASSWORD }),
        unknown.env,
      );
      expect(a.status).toBe(b.status);
      expect((await data(a)).note).toBe((await data(b)).note);
    } finally {
      known.restore();
      unknown.restore();
    }
  });

  it("answers the same when core is unreachable", async () => {
    const f = fixture();
    (f.env.CORE as unknown as { fetch: () => Promise<never> }).fetch = async () => {
      throw new Error("core is down");
    };
    try {
      const res = await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), f.env);
      expect(res.status).toBe(202);
      expect((await data(res)).note).toBe(AUTH_AMBIGUOUS_ANSWER);
    } finally {
      f.restore();
    }
  });

  it("answers the same for a malformed address as for a real one", async () => {
    // "That is not an address" is a fact about the string in the box, and
    // saying it would still be safe — but there is no reason to have two
    // answers where one will do.
    const f = fixture();
    try {
      const res = await route(post(SIGN_UP, { email: "not-an-address", password: PASSWORD }), f.env);
      expect(res.status).toBe(202);
      expect((await data(res)).note).toBe(AUTH_AMBIGUOUS_ANSWER);
      // And nothing left the worker for it.
      expect(f.wire.platform).toEqual([]);
    } finally {
      f.restore();
    }
  });

  it("DOES say when the password is too short, and that is the one exception", async () => {
    // Swallowing this would leave somebody staring at "check your inbox" for
    // mail that will arrive and a password that will never work. It is a fact
    // about what they just typed, not about who exists.
    const f = fixture();
    try {
      const res = await route(post(SIGN_UP, { email: ADDRESS, password: "short" }), f.env);
      expect(res.status).toBe(422);
      expect((await data(res)).note).toBe(PASSWORD_REFUSAL);
      expect(f.wire.platform).toEqual([]);
    } finally {
      f.restore();
    }
  });

  it("gives one answer for a wrong code, an expired challenge and one that never existed", async () => {
    const f = fixture({ completeFails: true });
    try {
      const res = await route(post(VERIFY, { challengeId: CHALLENGE, code: "000000" }), f.env);
      expect(res.status).toBe(400);
      expect((await data(res)).note).toBe(TOKEN_SPENT_NOTE);
      // Core was never asked to spend anything.
      expect(f.wire.core).toEqual([]);
    } finally {
      f.restore();
    }
  });

  it("still signs somebody in when openproduct's own row was already spent", async () => {
    // They proved they can read the mail. Refusing them a session because they
    // clicked twice would punish them for the product's bookkeeping.
    const f = fixture({ credentialSet: false });
    try {
      const res = await route(post(VERIFY, { challengeId: CHALLENGE, code: CODE }), f.env);
      expect(res.status).toBe(200);
      const body = await data(res);
      expect(body.token).toBe("tok_live");
      expect(body.credentialSet).toBe(false);
    } finally {
      f.restore();
    }
  });
});

describe("the velocity rules R1 asked for", () => {
  it("stops a grind from one address, tighter than the read plane", async () => {
    const f = fixture();
    try {
      let refused = 0;
      let last: Response | null = null;
      for (let i = 0; i < 15; i += 1) {
        const res = await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), f.env);
        if (res.status === 429) {
          refused += 1;
          last = res;
        }
      }
      // Ten an hour, so the last five are refused.
      expect(refused).toBe(5);
      // CS1 — the auth plane keeps its own body and gains the header: whole
      // seconds until a token is this address's, never 0.
      expect(last!.headers.get("retry-after")).toMatch(/^[1-9]\d*$/);
      expect((await data(last!)).note).toBe(AUTH_TOO_FAST);
    } finally {
      f.restore();
    }
  });

  it("counts each caller separately, so one grinder does not lock everybody out", async () => {
    const f = fixture();
    try {
      for (let i = 0; i < 12; i += 1) {
        await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }, "203.0.113.7"), f.env);
      }
      const other = await route(
        post(SIGN_UP, { email: ADDRESS, password: PASSWORD }, "198.51.100.9"),
        f.env,
      );
      expect(other.status).toBe(202);
    } finally {
      f.restore();
    }
  });

  it("gives verify more room than sign-up — one is a typo, the other is a grind", async () => {
    const f = fixture({ completeFails: true });
    try {
      let refused = 0;
      for (let i = 0; i < 15; i += 1) {
        const res = await route(post(VERIFY, { challengeId: CHALLENGE, code: "000000" }), f.env);
        if (res.status === 429) refused += 1;
      }
      expect(refused).toBe(0);
    } finally {
      f.restore();
    }
  });
});

describe("where these paths sit in the router", () => {
  it("refuses anything but POST", async () => {
    const f = fixture();
    try {
      for (const path of [SIGN_UP, VERIFY]) {
        const res = await route(new Request(path, { method: "GET" }), f.env);
        expect([path, res.status]).toEqual([path, 405]);
      }
    } finally {
      f.restore();
    }
  });

  it("is neither cached nor treated as a public read", async () => {
    // These are writes. A cache-control that let one be stored would be a
    // sign-up answer served to the next visitor.
    const f = fixture();
    try {
      const res = await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), f.env);
      // ABSENT, which is the right answer rather than a weaker one: a POST is
      // not cacheable by default, and adding a header to say so would invite
      // somebody to edit it. What is asserted is that nothing has set a
      // positive max-age here.
      const cacheControl = res.headers.get("cache-control");
      expect(cacheControl === null || !/max-age=[1-9]/.test(cacheControl)).toBe(true);
    } finally {
      f.restore();
    }
  });

  it("is unavailable rather than wrong when core is not bound", async () => {
    const f = fixture();
    try {
      const res = await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), {
        ...f.env,
        CORE: undefined,
      } as unknown as Env);
      expect(res.status).toBe(503);
    } finally {
      f.restore();
    }
  });
});
