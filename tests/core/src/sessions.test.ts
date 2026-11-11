// openproduct's own sessions, at the layer that stores them (AC2b).
//
// The gateway decided WHO; these three verbs only remember, answer and
// forget. So the properties worth testing are not about authentication at
// all — they are about the two things a session store gets wrong:
//
//   the token is stored in the clear   (it is not: only its SHA-256)
//   a dead session still resolves      (it does not: revoked, expired and
//                                       unknown all answer the same way)

import { AUTH_SESSION_TTL_MS, sessionExpiry } from "@openproduct/contracts";
import {
  handleIssueSession,
  handleResolveSession,
  handleRevokeSession,
  type SessionHandlerDeps,
} from "@openproduct-worker/handlers/sessions";
import type { Env } from "@openproduct-worker/env";

const SUBJECT = "usr_0123456789abcdef0123456789abcdef";
// A fixture, not a credential: no session was ever issued with it. Shaped like a
// real one (the prefix, well past the 16-character floor) and named so no
// reader or scanner can mistake it for one.
const TOKEN = "ops_test_fixture_session_token_not_a_real_one";
const NOW = Date.parse("2026-09-05T12:00:00.000Z");

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

interface Row {
  tokenHash: string;
  subjectId: string;
  expiresAt: string;
  revokedAt: string | null;
}

function store(seed: Row[] = []): { rows: Row[]; deps: SessionHandlerDeps } {
  const rows = [...seed];
  const deps: SessionHandlerDeps = {
    now: () => NOW,
    repo: {
      issueAuthSession: async (input) => {
        rows.push({
          tokenHash: input.tokenHash,
          subjectId: input.subjectId,
          expiresAt: input.expiresAt,
          revokedAt: null,
        });
      },
      resolveAuthSession: async (tokenHash) => {
        const row = rows.find((r) => r.tokenHash === tokenHash);
        return row
          ? { subjectId: row.subjectId, expiresAt: row.expiresAt, revokedAt: row.revokedAt }
          : null;
      },
      revokeAuthSession: async (tokenHash, at) => {
        const row = rows.find((r) => r.tokenHash === tokenHash);
        if (row && row.revokedAt === null) row.revokedAt = at;
      },
    },
  };
  return { rows, deps };
}

function post(path: string, body: unknown): Request {
  return new Request(`https://openproduct.internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "req_ac2b" },
    body: JSON.stringify(body),
  });
}

async function data(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

/** What the handlers hash with, restated so the test does not trust the code
 *  it is testing to tell it what the key should be. */
async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("AC2b — issue", () => {
  it("stores the HASH and never the token", async () => {
    // The whole reason the gateway sends the token rather than a digest: the
    // rule "only the hash is stored" is enforced where the storing happens.
    const { rows, deps } = store();
    const res = await handleIssueSession(
      env(),
      post("/internal/openproduct/auth/sessions", {
        token: TOKEN,
        subjectId: SUBJECT,
        expiresAt: sessionExpiry(NOW),
      }),
      "req_t",
      deps,
    );
    expect(res.status).toBe(201);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(await sha256(TOKEN));
    expect(JSON.stringify(rows)).not.toContain(TOKEN);
  });

  it("does not echo the token back", async () => {
    // The gateway generated it and already holds it. Echoing would put it in
    // a second response body and a second log for nothing.
    const { deps } = store();
    const res = await handleIssueSession(
      env(),
      post("/internal/openproduct/auth/sessions", {
        token: TOKEN,
        subjectId: SUBJECT,
        expiresAt: sessionExpiry(NOW),
      }),
      "req_t",
      deps,
    );
    expect(await res.text()).not.toContain(TOKEN);
  });

  it("refuses a short token, a missing subject and a missing expiry", async () => {
    const { rows, deps } = store();
    for (const body of [
      { token: "ops_x", subjectId: SUBJECT, expiresAt: sessionExpiry(NOW) },
      { token: TOKEN, subjectId: "", expiresAt: sessionExpiry(NOW) },
      { token: TOKEN, subjectId: SUBJECT, expiresAt: "" },
    ]) {
      const res = await handleIssueSession(
        env(),
        post("/internal/openproduct/auth/sessions", body),
        "req_t",
        deps,
      );
      expect(res.status).toBe(422);
    }
    expect(rows).toEqual([]);
  });
});

describe("AC2b — resolve, and the four ways a session is not one", () => {
  async function seeded(over: Partial<Row> = {}): Promise<ReturnType<typeof store>> {
    return store([
      {
        tokenHash: await sha256(TOKEN),
        subjectId: SUBJECT,
        expiresAt: sessionExpiry(NOW),
        revokedAt: null,
        ...over,
      },
    ]);
  }

  it("answers a live session with its subject", async () => {
    const { deps } = await seeded();
    const res = await handleResolveSession(
      env(),
      post("/internal/openproduct/auth/sessions/resolve", { token: TOKEN }),
      "req_t",
      deps,
    );
    expect(res.status).toBe(200);
    expect((await data(res)).subjectId).toBe(SUBJECT);
  });

  const dead: Array<[string, Partial<Row>]> = [
    ["revoked", { revokedAt: new Date(NOW - 1000).toISOString() }],
    ["expired", { expiresAt: new Date(NOW - 1000).toISOString() }],
    // Revoked AND expired: the order matters — revoked is checked first, so a
    // clock that disagreed about expiry could not resurrect it.
    [
      "revoked and expired",
      { revokedAt: new Date(NOW - 1).toISOString(), expiresAt: new Date(NOW + 1e9).toISOString() },
    ],
  ];

  for (const [name, over] of dead) {
    it(`answers 200 with null for a ${name} session`, async () => {
      const { deps } = await seeded(over);
      const res = await handleResolveSession(
        env(),
        post("/internal/openproduct/auth/sessions/resolve", { token: TOKEN }),
        "req_t",
        deps,
      );
      // 200, NOT 404. In every case the person signs in again, and giving the
      // caller two status codes to conflate is how "these are the same
      // outcome" gets broken by a refactor.
      expect([name, res.status]).toEqual([name, 200]);
      expect([name, (await data(res)).subjectId]).toEqual([name, null]);
    });
  }

  it("answers the same for a token nobody ever issued", async () => {
    const { deps } = await seeded();
    const res = await handleResolveSession(
      env(),
      post("/internal/openproduct/auth/sessions/resolve", { token: "ops_never-existed" }),
      "req_t",
      deps,
    );
    expect(res.status).toBe(200);
    expect((await data(res)).subjectId).toBeNull();
  });

  it("reads by hash, so a stored hash cannot be replayed as a token", async () => {
    // Somebody with a database read holds hashes. Presenting one as a token
    // must not work — it would mean the hash IS the credential, which is the
    // whole thing hashing prevents.
    const { deps } = await seeded();
    const res = await handleResolveSession(
      env(),
      post("/internal/openproduct/auth/sessions/resolve", { token: await sha256(TOKEN) }),
      "req_t",
      deps,
    );
    expect((await data(res)).subjectId).toBeNull();
  });
});

describe("AC2b — revoke", () => {
  it("ends a session, and the next resolve says so", async () => {
    const { deps } = store([
      { tokenHash: await sha256(TOKEN), subjectId: SUBJECT, expiresAt: sessionExpiry(NOW), revokedAt: null },
    ]);
    await handleRevokeSession(
      env(),
      post("/internal/openproduct/auth/sessions/revoke", { token: TOKEN }),
      "req_t",
      deps,
    );
    const res = await handleResolveSession(
      env(),
      post("/internal/openproduct/auth/sessions/resolve", { token: TOKEN }),
      "req_t",
      deps,
    );
    expect((await data(res)).subjectId).toBeNull();
  });

  it("keeps the FIRST timestamp when revoked twice", async () => {
    // When it ended is the fact somebody asks for later; a second click is
    // not new information.
    const first = new Date(NOW - 60_000).toISOString();
    const { rows, deps } = store([
      { tokenHash: await sha256(TOKEN), subjectId: SUBJECT, expiresAt: sessionExpiry(NOW), revokedAt: first },
    ]);
    await handleRevokeSession(
      env(),
      post("/internal/openproduct/auth/sessions/revoke", { token: TOKEN }),
      "req_t",
      deps,
    );
    expect(rows[0]!.revokedAt).toBe(first);
  });

  it("succeeds for a session that never existed", async () => {
    // From where the person is standing they wanted to be signed out and they
    // are. Reporting a failure would put an error on a screen for somebody
    // who got exactly what they asked for.
    const { deps } = store();
    const res = await handleRevokeSession(
      env(),
      post("/internal/openproduct/auth/sessions/revoke", { token: TOKEN }),
      "req_t",
      deps,
    );
    expect(res.status).toBe(200);
    expect((await data(res)).revoked).toBe(true);
  });
});

describe("AC2b — the TTL is one number", () => {
  it("is thirty days, and `sessionExpiry` is the only thing that computes it", () => {
    expect(AUTH_SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(sessionExpiry(NOW)).toBe(new Date(NOW + AUTH_SESSION_TTL_MS).toISOString());
  });
});
