// One subject per person, whichever door (openproduct-launch AC3).
//
// ─── THE MILESTONE THAT TURNED OUT TO BE ALREADY TRUE ────────────────────
//
// AC3's done-when is *"signing in both ways lands on the same profile, and an
// unverified address never merges"*, and the plan expected a merge rule keyed
// on a verified address to get there. There is none, and there is no room for
// one, because openproduct never makes a subject:
//
//   the Orunbase door  a platform token → GET /v1/identity/me → subjectId
//   the password door  an address       → the seam            → subjectId
//                      a code           → login/complete      → user.id
//
// Every one of those is the identity worker answering. The platform is the
// only thing on this estate that mints a subject, so two doors CANNOT reach
// two subjects — not because somebody remembered to link them, but because
// there is only one thing that makes them.
//
// ─── SO THIS FILE IS A GUARD, NOT A FEATURE TEST ─────────────────────────
//
// A property that holds by construction is exactly the kind that gets broken
// by a later change that looks harmless: a local subject id "just for
// sessions", a fallback when the seam is down, an id derived from an address.
// Each of those is one commit, and each silently ends the linking.
//
// What follows pins the property at the two places it could break — the
// subject a verification writes against, and the subject a sign-in mints
// against — and then pins the negative: nothing reaches core until the
// platform has said the mail was read.

import { SESSION_TOKEN_PREFIX } from "@openproduct/contracts";
import { route } from "@openproduct-gateway/router";
import type { Env } from "@openproduct-gateway/env";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import { resetSubjectCache } from "@openproduct-gateway/subject";

const ADDRESS = "ada@example.com";
const PASSWORD = "correct horse battery staple";
const CHALLENGE = "chl_0123456789abcdef";
const CODE = "482913";

/** The one subject the platform holds for ADA. Every assertion below is some
 *  form of "this exact string, and never one we made up". */
const SUBJECT = "usr_0123456789abcdef0123456789abcdef";
const VERIFIER = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$aGFzaGVkdmFsdWVoZXJl";
const SEAM_SECRET = "auth-seam-secret-at-least-32-chars";

const SIGN_UP = "https://gw.test/v1/openproduct/auth/sign-up";
const VERIFY = "https://gw.test/v1/openproduct/auth/verify";
const SIGN_IN = "https://gw.test/v1/openproduct/auth/sign-in";
const SAVED = "https://gw.test/v1/openproduct/me/saved";

interface CoreCall {
  url: string;
  method: string;
  body: string;
  /** The `x-actor-*` pair, which is how a subject actually reaches core —
   *  never the URL, and never anything the caller supplied. */
  actor: string | null;
}

interface Wire {
  platform: Array<{ url: string; body: string }>;
  core: CoreCall[];
}

/**
 * ONE FIXTURE FOR BOTH DOORS, which is the only way this file can say
 * anything. Two fixtures with two `SUBJECT` constants would agree because the
 * test author typed the same string twice; one platform that answers all four
 * of its questions from a single record is the arrangement where "the same
 * subject" is a fact about the code.
 */
function fixture(over: { completeFails?: boolean; unknownAddress?: boolean } = {}): {
  env: Env;
  wire: Wire;
  restore: () => void;
} {
  const wire: Wire = { platform: [], core: [] };
  const realFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    wire.platform.push({ url, body: String(init?.body ?? "") });

    // The Orunbase door.
    if (url.endsWith("/v1/identity/me")) {
      return Response.json({ data: { subjectId: SUBJECT } });
    }
    // The password door, half one: who is this address.
    if (url.endsWith("/v1/seam/openproduct/subject-by-email")) {
      return Response.json({ data: { subjectId: over.unknownAddress ? null : SUBJECT } });
    }
    // The password door, half two: send the mail, then read it back.
    if (url.endsWith("/v1/auth/login/start")) {
      return Response.json({ data: { challengeId: CHALLENGE } });
    }
    if (url.endsWith("/v1/auth/login/complete")) {
      if (over.completeFails) return new Response("{}", { status: 400 });
      return Response.json({
        data: {
          token: "tok_platform",
          user: { id: SUBJECT, email: ADDRESS, displayName: "Ada" },
        },
      });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  const core = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      wire.core.push(record(url, init));
      if (url.includes("/credentials/")) {
        return Response.json({ data: { verifier: VERIFIER } });
      }
      if (url.endsWith("/auth/sessions")) return Response.json({ data: { issued: true } });
      if (url.endsWith("/auth/verify")) return Response.json({ data: { credentialSet: true } });
      return Response.json({ data: { items: [] } });
    },
  } as unknown as Fetcher;

  return {
    env: {
      CORE: core,
      ENVIRONMENT: "test",
      PLATFORM_API_URL: "https://platform.test",
      SITE_ORIGIN: "https://openproduct.live",
      OPENPRODUCT_AUTH_SEAM_SECRET: SEAM_SECRET,
    } as Env,
    wire,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

/** One shape for every core call the fixtures record. */
function record(url: string, init?: RequestInit): CoreCall {
  return {
    url,
    method: init?.method ?? "GET",
    body: String(init?.body ?? ""),
    actor: new Headers(init?.headers).get("x-actor-subject-id"),
  };
}

function post(url: string, body: unknown, ip = "203.0.113.9"): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_ac3",
      "cf-connecting-ip": ip,
    },
    body: JSON.stringify(body),
  });
}

async function data(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

/** The password check, stubbed. No case here is about argon2id. */
const MATCHES = { verifyPassword: async () => true };

beforeEach(() => {
  resetBuckets();
  resetSubjectCache();
});

describe("AC3 — both doors reach the same subject", () => {
  it("writes the password against the subject the PLATFORM named, never one of ours", async () => {
    const { env, wire, restore } = fixture();
    try {
      await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), env);
      await route(post(VERIFY, { challengeId: CHALLENGE, code: CODE }), env);
    } finally {
      restore();
    }

    const verify = wire.core.find((c) => c.url.endsWith("/auth/verify"));
    expect(verify).toBeDefined();
    // The exact string `login/complete` answered with, and nothing derived.
    expect(JSON.parse(verify!.body).subjectId).toBe(SUBJECT);
  });

  it("mints the session against that same subject when they sign in later", async () => {
    const { env, wire, restore } = fixture();
    try {
      const res = await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, {
        verifyPassword: MATCHES.verifyPassword,
      });
      expect(res.status).toBe(200);
    } finally {
      restore();
    }

    const mint = wire.core.find((c) => c.url.endsWith("/auth/sessions"));
    expect(JSON.parse(mint!.body).subjectId).toBe(SUBJECT);
    // And the credential it checked was read under the same id.
    expect(wire.core.find((c) => c.url.includes("/credentials/"))!.url).toContain(SUBJECT);
  });

  it("hands core the same subject through the Orunbase door as through the password door", async () => {
    // THE DONE-WHEN, IN ONE TEST. Two authenticated reads, one signed in with
    // the platform's own token and one with a session this app minted, and
    // the subject core is told about is the same both times.
    const { env, wire, restore } = fixture();
    try {
      const signIn = await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, {
        verifyPassword: MATCHES.verifyPassword,
      });
      const ours = (await data(signIn)).token as string;
      expect(ours.startsWith(SESSION_TOKEN_PREFIX)).toBe(true);

      // Core resolves our session back to the subject it was minted for —
      // which is what the real handler does, from the row.
      const withSessions = {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          wire.core.push(record(url, init));
          if (url.endsWith("/auth/sessions/resolve")) {
            return Response.json({ data: { subjectId: SUBJECT } });
          }
          return Response.json({ data: { items: [] } });
        },
      } as unknown as Fetcher;

      const before = wire.core.length;
      await route(
        new Request(SAVED, { headers: { authorization: `Bearer ${ours}` } }),
        { ...env, CORE: withSessions } as Env,
      );
      await route(
        new Request(SAVED, { headers: { authorization: "Bearer tok_platform" } }),
        { ...env, CORE: withSessions } as Env,
      );

      // Every downstream call either door made names the same subject —
      // asserted on the header the gateway builds fresh, which is the only
      // thing core is ever told about who is asking.
      const downstream = wire.core.slice(before).filter((c) => c.url.includes("/me/"));
      expect(downstream).toHaveLength(2);
      expect(downstream.map((c) => c.actor)).toEqual([SUBJECT, SUBJECT]);
    } finally {
      restore();
    }
  });
});

describe("AC3 — an unverified address never merges", () => {
  it("asks core NOTHING when the platform did not confirm the code", async () => {
    // The whole of "never merges": a credential is written against a subject
    // only after the platform has said the person read the mail. If
    // `login/complete` refuses, core is not called at all, so there is no row
    // for a later sign-in to find.
    const { env, wire, restore } = fixture({ completeFails: true });
    try {
      await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), env);
      const before = wire.core.length;
      const res = await route(post(VERIFY, { challengeId: CHALLENGE, code: "000000" }), env);
      expect(res.status).toBe(400);
      expect(wire.core.slice(before)).toEqual([]);
    } finally {
      restore();
    }
  });

  it("mints no session for an address the platform does not know", async () => {
    // The sign-in half of the same rule. An unresolvable address never
    // reaches `auth/sessions`, so there is no way to be signed in as somebody
    // whose address was never verified.
    const { env, wire, restore } = fixture({ unknownAddress: true });
    try {
      const res = await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }), env, {
        verifyPassword: MATCHES.verifyPassword,
      });
      expect(res.status).toBe(401);
    } finally {
      restore();
    }
    expect(wire.core.filter((c) => c.url.endsWith("/auth/sessions"))).toEqual([]);
  });

  it("does not take an unverified address as a subject, even shaped like one", async () => {
    // The failure mode this rules out is the tempting one: an address is a
    // stable unique string, so it LOOKS like an id. Nothing openproduct sends
    // core on either path carries it.
    const { env, wire, restore } = fixture();
    try {
      await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), env);
      await route(post(VERIFY, { challengeId: CHALLENGE, code: CODE }), env);
      await route(post(SIGN_IN, { email: ADDRESS, password: PASSWORD }, "203.0.113.10"), env, {
        verifyPassword: MATCHES.verifyPassword,
      });
    } finally {
      restore();
    }
    const toCore = JSON.stringify(wire.core);
    expect(toCore).not.toContain(ADDRESS);
    expect(toCore).not.toContain("ada");
    expect(toCore).not.toContain("@");
  });
});

describe("AC3 — the reset is the sign-up path, and this is the round trip", () => {
  it("sets a NEW password against the SAME subject when somebody signs up again", async () => {
    // What a reset is, end to end, with no reset flow anywhere in it:
    // somebody who already has an account signs up again, reads the mail, and
    // the verifier written the second time is a different one against the
    // same subject. Core's `writeCredential` upserts, so the last verified
    // password wins — the db lane pins that half against a real engine.
    const { env, wire, restore } = fixture();
    try {
      await route(post(SIGN_UP, { email: ADDRESS, password: PASSWORD }), env);
      await route(post(VERIFY, { challengeId: CHALLENGE, code: CODE }), env);
      await route(post(SIGN_UP, { email: ADDRESS, password: "a different long passphrase" }), env);
      await route(post(VERIFY, { challengeId: CHALLENGE, code: CODE }), env);
    } finally {
      restore();
    }

    const signUps = wire.core.filter((c) => c.url.endsWith("/auth/sign-up"));
    const verifies = wire.core.filter((c) => c.url.endsWith("/auth/verify"));
    expect(signUps).toHaveLength(2);
    expect(verifies).toHaveLength(2);

    // Two different passwords…
    const [first, second] = signUps.map((c) => JSON.parse(c.body).verifier as string);
    expect(first).not.toBe(second);
    // …and one subject, both times.
    expect(verifies.map((c) => JSON.parse(c.body).subjectId)).toEqual([SUBJECT, SUBJECT]);
  });

  it("has no reset route of its own, because the path above is it", async () => {
    // Pinned rather than assumed: a later reader who adds `/auth/reset` will
    // fail here and read the paragraph in `credentials.ts` that explains why
    // the flow they are about to build already exists under another name.
    const { env, restore } = fixture();
    try {
      for (const path of ["reset", "forgot", "password/reset"]) {
        const res = await route(post(`https://gw.test/v1/openproduct/auth/${path}`, {}), env);
        expect([path, res.status]).toEqual([path, 404]);
      }
    } finally {
      restore();
    }
  });
});
