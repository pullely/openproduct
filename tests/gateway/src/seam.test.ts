// The seam receivers (openproduct-independence OX5 — S6/S7).
//
// What is pinned: the HMAC is the ENTIRE identity — a valid signature is the
// platform speaking and anything else is refused with nothing learned; the
// verifier speaks the canonical OrunCloud webhook scheme byte-for-byte (so
// membership-worker's @saas/webhook-verifier-signed deliveries verify here);
// S7 passes core's body through verbatim, because the platform's purge
// orchestrator parses its context receipt from it.

import { route } from "@openproduct-gateway/router";
import { verifySeamSignature } from "@openproduct-gateway/seam";
import type { Env } from "@openproduct-gateway/env";

const SECRET = "test-seam-secret";

async function sign(body: string, timestamp: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

function nowSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

interface Captured {
  url: string;
  body: string;
  headers: Record<string, string>;
}

function coreStub(respond: Response, captured: Captured[] = []): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({
        url: String(input),
        body: String(init?.body ?? ""),
        headers: Object.fromEntries([...new Headers(init?.headers ?? {}).entries()]),
      });
      return respond;
    },
  } as unknown as Fetcher;
}

function env(core: Fetcher | undefined, secret: string | null = SECRET): Env {
  return {
    CORE: core,
    ENVIRONMENT: "test",
    ...(secret ? { LISTING_SEAM_SECRET: secret } : {}),
  } as Env;
}

async function seamPost(path: string, body: string, headers: Record<string, string>): Promise<Request> {
  return new Request(`https://gw.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

const EVENT = JSON.stringify({
  seam: "v1",
  eventId: "8c5b3a1e-1111-4111-8111-111111111111",
  occurredAt: "2026-08-24T10:00:00.000Z",
  type: "join_request.decided",
  data: { jrRequestRef: "jrq_1", subjectId: "usr_a", status: "approved", occurredAt: "2026-08-24T10:00:00.000Z" },
});

describe("the inline verifier speaks the canonical scheme", () => {
  it("accepts a correctly signed body within tolerance", async () => {
    const ts = nowSeconds();
    const headers = new Headers({
      "X-Webhook-Signature": await sign(EVENT, ts),
      "X-Webhook-Timestamp": ts,
    });
    expect(await verifySeamSignature(SECRET, EVENT, headers)).toBe(true);
  });

  it.each([
    ["a wrong secret", async (ts: string) => ({ "X-Webhook-Signature": await sign(EVENT, ts, "other"), "X-Webhook-Timestamp": ts })],
    ["a tampered body", async (ts: string) => ({ "X-Webhook-Signature": await sign(`${EVENT} `, ts), "X-Webhook-Timestamp": ts })],
    ["a missing signature", async (ts: string) => ({ "X-Webhook-Timestamp": ts })],
    ["a malformed timestamp", async () => ({ "X-Webhook-Signature": await sign(EVENT, "soon"), "X-Webhook-Timestamp": "soon" })],
  ])("refuses %s", async (_label, make) => {
    const headers = new Headers(await make(nowSeconds()));
    expect(await verifySeamSignature(SECRET, EVENT, headers)).toBe(false);
  });

  it("refuses a REPLAY outside the ±300s window — a captured delivery goes stale", async () => {
    const stale = String(Math.floor(Date.now() / 1000) - 400);
    const headers = new Headers({
      "X-Webhook-Signature": await sign(EVENT, stale),
      "X-Webhook-Timestamp": stale,
    });
    expect(await verifySeamSignature(SECRET, EVENT, headers)).toBe(false);
  });
});

describe("the S6 receiver (/seam/v1/join-requests)", () => {
  it("verifies, then forwards the body verbatim to core's seam upsert", async () => {
    const captured: Captured[] = [];
    const core = coreStub(Response.json({ data: { recorded: true } }), captured);
    const ts = nowSeconds();
    const res = await route(
      await seamPost("/seam/v1/join-requests", EVENT, {
        "X-Webhook-Signature": await sign(EVENT, ts),
        "X-Webhook-Timestamp": ts,
        "X-Webhook-ID": "dlv_1",
      }),
      env(core),
    );
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toContain("/internal/openproduct/seam/join-request");
    expect(captured[0]!.body).toBe(EVENT);
  });

  it("401s a bad signature and never touches core", async () => {
    const captured: Captured[] = [];
    const core = coreStub(Response.json({}), captured);
    const ts = nowSeconds();
    const res = await route(
      await seamPost("/seam/v1/join-requests", EVENT, {
        "X-Webhook-Signature": await sign(EVENT, ts, "wrong"),
        "X-Webhook-Timestamp": ts,
      }),
      env(core),
    );
    expect(res.status).toBe(401);
    expect(captured).toEqual([]);
  });

  it("503s when the seam secret is unset — unconfigured is visible, never open", async () => {
    const captured: Captured[] = [];
    const core = coreStub(Response.json({}), captured);
    const res = await route(await seamPost("/seam/v1/join-requests", EVENT, {}), env(core, null));
    expect(res.status).toBe(503);
    expect(captured).toEqual([]);
  });

  it("rejects non-POST methods", async () => {
    const res = await route(new Request("https://gw.test/seam/v1/join-requests"), env(coreStub(Response.json({}))));
    expect(res.status).toBe(405);
  });
});

describe("the workspace-events receiver (/seam/v1/workspace-events)", () => {
  const EVENT_NARROWED = JSON.stringify({
    seam: "v1",
    eventId: "8c5b3a1e-2222-4222-8222-222222222222",
    occurredAt: "2026-08-24T10:00:00.000Z",
    type: "workspace.visibility_narrowed",
    data: { orgId: "org_abc" },
  });

  it("verifies, then forwards verbatim to core's workspace-event upsert", async () => {
    const captured: Captured[] = [];
    const core = coreStub(Response.json({ data: { revoked: 1 } }), captured);
    const ts = nowSeconds();
    const res = await route(
      await seamPost("/seam/v1/workspace-events", EVENT_NARROWED, {
        "X-Webhook-Signature": await sign(EVENT_NARROWED, ts),
        "X-Webhook-Timestamp": ts,
      }),
      env(core),
    );
    expect(res.status).toBe(200);
    expect(captured[0]!.url).toContain("/internal/openproduct/seam/workspace-event");
    expect(captured[0]!.body).toBe(EVENT_NARROWED);
  });

  it("401s a bad signature — same gate as every seam path", async () => {
    const captured: Captured[] = [];
    const core = coreStub(Response.json({}), captured);
    const ts = nowSeconds();
    const res = await route(
      await seamPost("/seam/v1/workspace-events", EVENT_NARROWED, {
        "X-Webhook-Signature": await sign(EVENT_NARROWED, ts, "wrong"),
        "X-Webhook-Timestamp": ts,
      }),
      env(core),
    );
    expect(res.status).toBe(401);
    expect(captured).toEqual([]);
  });
});

describe("the S7 receiver (/seam/v1/workspace-purge) is synchronous", () => {
  const PURGE = JSON.stringify({ orgId: "org_abc", lifecycleRequestId: "olr_0123456789abcdef0123456789abcdef", confirm: "purge" });

  it("passes core's receipt through VERBATIM — the orchestrator parses it", async () => {
    const receipt = { data: { context: "openproduct", done: true, rowsDeleted: 3 } };
    const captured: Captured[] = [];
    const core = coreStub(Response.json(receipt), captured);
    const ts = nowSeconds();
    const res = await route(
      await seamPost("/seam/v1/workspace-purge", PURGE, {
        "X-Webhook-Signature": await sign(PURGE, ts),
        "X-Webhook-Timestamp": ts,
        "x-request-id": "olr_0123456789abcdef0123456789abcdef",
      }),
      env(core),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(receipt);
    expect(captured[0]!.url).toContain("/v1/internal/openproduct/workspace-purge");
    // The request id survives the hop — the purge trail stays correlatable.
    expect(captured[0]!.headers["x-request-id"]).toBe("olr_0123456789abcdef0123456789abcdef");
  });

  it("passes a refusal through too — core's kill switch stays visible to the orchestrator", async () => {
    const core = coreStub(
      Response.json({ error: { code: "disabled", message: "purge disabled" } }, { status: 503 }),
    );
    const ts = nowSeconds();
    const res = await route(
      await seamPost("/seam/v1/workspace-purge", PURGE, {
        "X-Webhook-Signature": await sign(PURGE, ts),
        "X-Webhook-Timestamp": ts,
      }),
      env(core),
    );
    expect(res.status).toBe(503);
  });
});
