// An agent's writes, at the layer that records them (openproduct-mcp MC3).

import type { OpenproductRepository } from "@openproduct/db";
import { withVia } from "@openproduct-worker/db";
import { handleIdempotencyLookup, handleIdempotencyStore, type AgentCredentialDeps } from "@openproduct-worker/handlers/agent-credentials";
import type { Env } from "@openproduct-worker/env";

const env = { ENVIRONMENT: "test" } as Env;

function post(body: unknown): Request {
  return new Request("https://openproduct.internal/x", { method: "POST", body: JSON.stringify(body) });
}

describe("MC3 — every audit entry an agent's request writes says how it arrived", () => {
  it("stamps via into the payload, keeping what the handler wrote", async () => {
    const written: unknown[] = [];
    const repo = { appendAudit: async (input: unknown) => void written.push(input) } as unknown as OpenproductRepository;
    await withVia(repo, { kind: "agent", credentialId: "agc_x" }).appendAudit({
      id: "a" as never,
      orgId: "o" as never,
      actorType: "user",
      actorId: "usr_1",
      type: "openproduct.profile.updated",
      description: "edited",
      payload: { slug: "one" },
      occurredAt: "2026-11-28T12:00:00.000Z",
    });
    expect(written[0]).toMatchObject({ payload: { slug: "one", via: { kind: "agent", credentialId: "agc_x" } } });
  });

  it("leaves a person's own request exactly as it was", () => {
    const repo = { appendAudit: async () => undefined } as unknown as OpenproductRepository;
    expect(withVia(repo, undefined)).toBe(repo);
  });
});

describe("MC3 — the first answer is kept for a day", () => {
  function harness() {
    const kept = new Map<string, { method: string; path: string; status: number; body: unknown; createdAt: string }>();
    let now = Date.parse("2026-11-28T12:00:00.000Z");
    const deps = {
      now: () => now,
      repo: {
        getAgentIdempotency: async (credentialId: string, key: string, since: string) => {
          const k = kept.get(`${credentialId}/${key}`);
          return k && k.createdAt > since ? { credentialId, key, ...k } : null;
        },
        putAgentIdempotency: async (i: { credentialId: string; key: string; method: string; path: string; status: number; body: unknown; at: string }) => {
          if (!kept.has(`${i.credentialId}/${i.key}`)) kept.set(`${i.credentialId}/${i.key}`, { method: i.method, path: i.path, status: i.status, body: i.body, createdAt: i.at });
        },
      },
    } as unknown as AgentCredentialDeps;
    return { deps, advance: (ms: number) => (now += ms) };
  }
  const data = async (res: Response) => ((await res.json()) as { data: Record<string, unknown> }).data;

  it("keeps a 2xx answer and hands it back, until the day is out", async () => {
    const h = harness();
    const stored = await handleIdempotencyStore(env, post({ credentialId: "agc_x", key: "k1", method: "POST", path: "/v1/x", status: 201, body: { data: { id: 1 } } }), "r", h.deps);
    expect(stored.status).toBe(201);
    expect((await data(await handleIdempotencyLookup(env, post({ credentialId: "agc_x", key: "k1" }), "r", h.deps))).kept).toMatchObject({ status: 201, body: { data: { id: 1 } } });
    expect((await data(await handleIdempotencyLookup(env, post({ credentialId: "agc_y", key: "k1" }), "r", h.deps))).kept).toBeNull();
    h.advance(25 * 60 * 60 * 1000);
    expect((await data(await handleIdempotencyLookup(env, post({ credentialId: "agc_x", key: "k1" }), "r", h.deps))).kept).toBeNull();
  });

  it("refuses to keep a failure, a malformed key or a path outside the API", async () => {
    const h = harness();
    for (const body of [
      { credentialId: "agc_x", key: "k", method: "POST", path: "/v1/x", status: 409, body: {} },
      { credentialId: "agc_x", key: "bad key", method: "POST", path: "/v1/x", status: 201, body: {} },
      { credentialId: "agc_x", key: "k", method: "POST", path: "/internal/x", status: 201, body: {} },
    ]) {
      expect((await handleIdempotencyStore(env, post(body), "r", h.deps)).status).toBe(422);
    }
  });
});
