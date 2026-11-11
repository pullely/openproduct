// Sign-up and verification in core, which never sees an address (AC1).
//
// What is pinned here:
//   - core takes a CHALLENGE HASH and a VERIFIER, never an address, and there
//     is no request shape that could hand it one
//   - sign-up answers identically whether or not a row was written
//   - verify CONSUMES BEFORE IT WRITES, so two clicks race in the database
//   - a spent, expired or unknown token gets one answer and a 200, because
//     the person completing it has already been let in
//   - nothing on either path can be told apart by an outsider
//
// The SQL that makes single-use atomic is pinned against a live engine in
// packages/db, and the platform round trip in tests/gateway.

import { AUTH_AMBIGUOUS_ANSWER, TOKEN_SPENT_NOTE } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const SUBJECT = "usr_0123456789abcdef0123456789abcdef";
const CHALLENGE = "chl_0123456789abcdef";
const VERIFIER = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGVkcGFzc3dvcmQ";
const NOW = Date.parse("2026-09-05T12:00:00.000Z");

const SIGN_UP = "https://openproduct.internal/internal/openproduct/auth/sign-up";
const VERIFY = "https://openproduct.internal/internal/openproduct/auth/verify";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "x-request-id": "req_ac1", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface Harness {
  deps: ProfileHandlerDeps;
  issued: Array<{ tokenHash: string; purpose: string; verifier: string | null; subjectId: string | null }>;
  consumed: Array<{ tokenHash: string; purpose: string }>;
  written: Array<{ subjectId: string; verifier: string }>;
  order: string[];
}

function harness(
  over: { spent?: boolean; issueThrows?: boolean; verifier?: string | null } = {},
): Harness {
  const issued: Harness["issued"] = [];
  const consumed: Harness["consumed"] = [];
  const written: Harness["written"] = [];
  const order: string[] = [];

  const repo = {
    async issueCredentialToken(input: {
      tokenHash: string;
      purpose: string;
      verifier?: string | null;
      subjectId?: string | null;
    }) {
      if (over.issueThrows) throw new Error("store is down");
      order.push("issue");
      issued.push({
        tokenHash: input.tokenHash,
        purpose: input.purpose,
        verifier: input.verifier ?? null,
        subjectId: input.subjectId ?? null,
      });
      return true;
    },
    async consumeCredentialToken(tokenHash: string, purpose: string) {
      order.push("consume");
      consumed.push({ tokenHash, purpose });
      if (over.spent) return null;
      return {
        purpose,
        subjectId: null,
        verifier: over.verifier === undefined ? VERIFIER : over.verifier,
      };
    },
    async writeCredential(input: { subjectId: string; verifier: string }) {
      order.push("write");
      written.push({ subjectId: input.subjectId, verifier: input.verifier });
    },
    async getCredential() {
      return null;
    },
  } as unknown as OpenproductRepository;

  return {
    deps: { repo, now: () => NOW } as unknown as ProfileHandlerDeps,
    issued,
    consumed,
    written,
    order,
  };
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("core is handed a challenge and a hash, and never an address", () => {
  it("remembers which password is waiting behind a challenge", async () => {
    const h = harness();
    const res = await route(post(SIGN_UP, { challengeId: CHALLENGE, verifier: VERIFIER }), env(), h.deps);
    expect(res.status).toBe(202);
    expect(h.issued).toHaveLength(1);
    expect(h.issued[0]!.purpose).toBe("verify");
    expect(h.issued[0]!.verifier).toBe(VERIFIER);
    // NO SUBJECT YET — the subject is minted when the challenge completes, and
    // the schema's CHECK refuses a `verify` row that names one.
    expect(h.issued[0]!.subjectId).toBeNull();
  });

  it("stores a HASH of the challenge, never the challenge itself", async () => {
    // So a row read out of this table cannot be joined back to a challenge id
    // seen in a log somewhere else.
    const h = harness();
    await route(post(SIGN_UP, { challengeId: CHALLENGE, verifier: VERIFIER }), env(), h.deps);
    expect(h.issued[0]!.tokenHash).not.toBe(CHALLENGE);
    expect(h.issued[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes the same challenge the same way on both paths", async () => {
    // Sign-up writes under a hash and verify reads under one. If they
    // disagreed, every sign-up would silently fail to set a password and the
    // symptom would be "my password does not work" months later.
    const up = harness();
    await route(post(SIGN_UP, { challengeId: CHALLENGE, verifier: VERIFIER }), env(), up.deps);
    const down = harness();
    await route(post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }), env(), down.deps);
    expect(down.consumed[0]!.tokenHash).toBe(up.issued[0]!.tokenHash);
  });

  it("takes no address, and has no field that could carry one", async () => {
    // Core cannot reach the platform, so an address could only arrive by
    // somebody adding a field. This asserts the request shape it actually
    // reads: an extra field is ignored rather than stored.
    const h = harness();
    await route(
      post(SIGN_UP, { challengeId: CHALLENGE, verifier: VERIFIER, email: "ada@example.com" }),
      env(),
      h.deps,
    );
    expect(JSON.stringify(h.issued)).not.toContain("@");
    expect(JSON.stringify(h.issued)).not.toContain("ada");
  });
});

describe("sign-up answers the same thing whatever happened", () => {
  it("answers 202 with the ambiguous note when a row was written", async () => {
    const h = harness();
    const res = await route(post(SIGN_UP, { challengeId: CHALLENGE, verifier: VERIFIER }), env(), h.deps);
    expect(res.status).toBe(202);
    expect((await body(res)).note).toBe(AUTH_AMBIGUOUS_ANSWER);
  });

  it("answers IDENTICALLY when the store threw", async () => {
    // A store that was unavailable and a challenge that already had a password
    // behind it must not be distinguishable. The mail is already on its way in
    // both cases, so "check your inbox" is true in both.
    const h = harness({ issueThrows: true });
    const res = await route(post(SIGN_UP, { challengeId: CHALLENGE, verifier: VERIFIER }), env(), h.deps);
    expect(res.status).toBe(202);
    expect((await body(res)).note).toBe(AUTH_AMBIGUOUS_ANSWER);
    expect(h.issued).toEqual([]);
  });

  it("refuses a request that is malformed rather than unlucky", async () => {
    // A missing challenge is a caller that built the request wrongly, not a
    // person whose address may or may not exist. Saying so reveals nothing.
    const h = harness();
    for (const bad of [
      { verifier: VERIFIER },
      { challengeId: CHALLENGE },
      { challengeId: "", verifier: VERIFIER },
      { challengeId: CHALLENGE, verifier: "short" },
    ]) {
      const res = await route(post(SIGN_UP, bad), env(), h.deps);
      expect([JSON.stringify(bad), res.status]).toEqual([JSON.stringify(bad), 422]);
    }
    expect(h.issued).toEqual([]);
  });

  it("refuses a method that is not POST", async () => {
    const res = await route(
      new Request(SIGN_UP, { method: "GET", headers: { "x-request-id": "req_ac1" } }),
      env(),
      harness().deps,
    );
    expect(res.status).toBe(405);
  });
});

describe("verify spends the row before it writes anything", () => {
  it("consumes FIRST and writes SECOND", async () => {
    // Consuming is the atomic step, so two clicks on the same link race there
    // and exactly one wins. Writing first would mean the loser of that race
    // had already set a password.
    const h = harness();
    const res = await route(post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }), env(), h.deps);
    expect(res.status).toBe(200);
    expect(h.order).toEqual(["consume", "write"]);
    expect((await body(res)).credentialSet).toBe(true);
  });

  it("writes the waiting password against the subject the platform minted", async () => {
    const h = harness();
    await route(post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }), env(), h.deps);
    expect(h.written).toEqual([{ subjectId: SUBJECT, verifier: VERIFIER }]);
  });

  it("writes NOTHING when the row was already spent, and says so gently", async () => {
    // One answer for already-used, expired, wrong-purpose and never-issued.
    // Telling them apart is an oracle, and the action is the same in all four.
    const h = harness({ spent: true });
    const res = await route(post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }), env(), h.deps);
    expect(h.written).toEqual([]);
    expect((await body(res)).credentialSet).toBe(false);
    expect((await body(await route(post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }), env(), harness({ spent: true }).deps))).note).toBe(
      TOKEN_SPENT_NOTE,
    );
  });

  it("answers 200 rather than an error on a spent row, ON PURPOSE", async () => {
    // Whoever got here has ALREADY proved they can read the mail — the
    // platform's challenge said so, and the gateway has already minted them a
    // session. They are signed in; what they lost is the password they typed.
    // An error status would put a failure in front of somebody the product
    // just let in.
    const res = await route(
      post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }),
      env(),
      harness({ spent: true }).deps,
    );
    expect(res.status).toBe(200);
  });

  it("writes nothing when the row carried no password", async () => {
    // A `reset` row reached by the verify path, or a row something wrote
    // wrongly. There is nothing to set, and inventing one would be worse.
    const h = harness({ verifier: null });
    await route(post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }), env(), h.deps);
    expect(h.written).toEqual([]);
  });

  it("asks only for the `verify` purpose, so a reset token cannot be spent here", async () => {
    const h = harness();
    await route(post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }), env(), h.deps);
    expect(h.consumed[0]!.purpose).toBe("verify");
  });

  it("refuses a request missing either half", async () => {
    const h = harness();
    for (const bad of [{ subjectId: SUBJECT }, { challengeId: CHALLENGE }, {}]) {
      const res = await route(post(VERIFY, bad), env(), h.deps);
      expect([JSON.stringify(bad), res.status]).toEqual([JSON.stringify(bad), 422]);
    }
    expect(h.consumed).toEqual([]);
  });
});

describe("neither path is an oracle", () => {
  it("returns no address, and no word that would distinguish an outcome", async () => {
    // NOT A BAN ON THE WORDS "email" AND "address": the published note has to
    // say both to be a sentence — "If that address needs an email from us, it
    // is on its way." What must never appear is AN address, or a word that
    // tells one outcome from another.
    const h = harness();
    const up = await route(
      post(SIGN_UP, { challengeId: CHALLENGE, verifier: VERIFIER, email: "ada@example.com" }),
      env(),
      h.deps,
    );
    const down = await route(post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }), env(), h.deps);
    for (const res of [up, down]) {
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain("@");
      expect(text).not.toContain("ada");
      for (const word of ["exists", "already", "unknown", "not found", "no account"]) {
        expect([word, text.toLowerCase().includes(word)]).toEqual([word, false]);
      }
    }
  });

  it("never echoes a verifier back to a caller", async () => {
    // The stored form is not a secret in the way a password is, but it is the
    // input to an offline cracking attempt and has no business on the wire.
    const h = harness();
    const res = await route(post(VERIFY, { challengeId: CHALLENGE, subjectId: SUBJECT }), env(), h.deps);
    expect(JSON.stringify(await res.json())).not.toContain("argon2");
  });
});
