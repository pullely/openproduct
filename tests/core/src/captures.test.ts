// The capture queue and the ledger's door (openproduct-worldclass MD4).
//
// Two routes beside the signals', shaped like them: the sweep asks which
// listings are due and reports what came of each. What these prove is the
// boundary — public ids over the wire, the closed list of failure words, an
// outage writing NO picture — and the one thing the model insists on for a
// screenshot: its moment.

import {
  CAPTURE_FAILURES,
  CAPTURE_FAILURE_TOLERANCE,
  CAPTURE_MAX_PER_RUN,
  SCREENSHOT_REFRESH_AFTER_DAYS,
  screenshotAlt,
} from "@openproduct/contracts";
import type { OpenproductRepository, ProductMediaRecord } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const PROFILE_PUBLIC = "opp_55555555555545558555555555555555";
const BASE = "https://openproduct.internal/internal/openproduct/media/captures";
const NOW = new Date("2026-09-10T12:00:00.000Z");
const REF = `${"a".repeat(64)}.png`;
const TARGET = "https://acme.example.com/";
const ENV = { ENVIRONMENT: "test" } as Env;

interface Harness {
  deps: ProfileHandlerDeps;
  dueArgs: Array<{ before: string; limit: number | undefined }>;
  replaced: Array<Record<string, unknown>>;
  successes: Array<{ profileId: string; target: string; at: string }>;
  failures: Array<{ profileId: string; target: string; error: string; at: string; withdrawAfter: number }>;
}

function harness(observedAt: string | null = null): Harness {
  const h: Harness = { deps: {} as ProfileHandlerDeps, dueArgs: [], replaced: [], successes: [], failures: [] };
  const repo = {
    async listDueCaptures(before: string, limit?: number) {
      h.dueArgs.push({ before, limit });
      return [{ profileId: PROFILE_UUID, slug: "acme-thing", target: TARGET, observedAt, failureCount: 2 }];
    },
    async replaceScreenshot(input: Record<string, unknown>): Promise<ProductMediaRecord> {
      h.replaced.push(input);
      return {
        id: input.id as string,
        kind: "screenshot",
        storageRef: input.storageRef as string,
        alt: input.alt as string,
        width: input.width as number,
        height: input.height as number,
        position: 0,
        observedAt: input.observedAt as string,
      };
    },
    async recordCaptureSuccess(profileId: string, target: string, at: string) {
      h.successes.push({ profileId, target, at });
      return { profileId, target, attemptedAt: at, capturedAt: at, failureCount: 0, lastError: null, withdrawnAt: null };
    },
    async recordCaptureFailure(profileId: string, target: string, error: string, at: string, withdrawAfter: number) {
      h.failures.push({ profileId, target, error, at, withdrawAfter });
      const failureCount = h.failures.length;
      return {
        profileId,
        target,
        attemptedAt: at,
        capturedAt: null,
        failureCount,
        lastError: error,
        withdrawnAt: failureCount >= withdrawAfter ? at : null,
      };
    },
  } as unknown as OpenproductRepository;
  h.deps = { repo, now: () => NOW, generateId: () => "99999999-9999-4999-8999-999999999999" } as ProfileHandlerDeps;
  return h;
}

function post(body: unknown): Request {
  return new Request(BASE, {
    method: "POST",
    headers: { "x-request-id": "req_cap", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const okReport = () => ({
  profileId: PROFILE_PUBLIC,
  target: TARGET,
  ok: true,
  ref: REF,
  alt: screenshotAlt("acme-thing", NOW.toISOString()),
  width: 1280,
  height: 800,
  observedAt: NOW.toISOString(),
});

describe("the capture queue", () => {
  it("answers with PUBLIC ids, the slug, the address as written and the capture's moment — and needs no actor", async () => {
    const h = harness("2026-08-01T00:00:00.000Z");
    const res = await route(new Request(`${BASE}/due`, { headers: { "x-request-id": "req_due" } }), ENV, h.deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { captures: Array<Record<string, unknown>> } };
    expect(body.data.captures).toEqual([
      { profileId: PROFILE_PUBLIC, slug: "acme-thing", target: TARGET, observedAt: "2026-08-01T00:00:00.000Z" },
    ]);
    expect(JSON.stringify(body)).not.toContain(PROFILE_UUID);
  });

  it("asks the repository for captures older than the refresh, capped at the contract's per-run number", async () => {
    const h = harness();
    await route(new Request(`${BASE}/due`, { headers: { "x-request-id": "req_due" } }), ENV, h.deps);
    const cutoff = new Date(NOW.getTime() - SCREENSHOT_REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
    expect(h.dueArgs).toEqual([{ before: cutoff, limit: CAPTURE_MAX_PER_RUN }]);
  });

  it("is a read, and the ledger's door is a write — each refuses the other's method", async () => {
    const h = harness();
    expect((await route(new Request(`${BASE}/due`, { method: "POST" }), ENV, h.deps)).status).toBe(405);
    expect((await route(new Request(BASE, { method: "GET" }), ENV, h.deps)).status).toBe(405);
  });
});

describe("an outage is not an observation", () => {
  it("records a failure against the address, at the tolerance, and writes NO picture", async () => {
    const h = harness();
    const res = await route(post({ profileId: PROFILE_PUBLIC, target: TARGET, ok: false, error: "provider_refused" }), ENV, h.deps);
    expect(res.status).toBe(200);
    expect(h.failures).toEqual([
      { profileId: PROFILE_UUID, target: TARGET, error: "provider_refused", at: NOW.toISOString(), withdrawAfter: CAPTURE_FAILURE_TOLERANCE },
    ]);
    expect(h.replaced).toEqual([]);
    expect(h.successes).toEqual([]);
    const body = (await res.json()) as { data: { recorded: string; failureCount: number; withdrawn: boolean } };
    expect(body.data).toEqual({ recorded: "failure", failureCount: 1, withdrawn: false });
  });

  it("accepts only the contract's failure words — the ledger holds a word, never a body", async () => {
    const h = harness();
    const res = await route(
      post({ profileId: PROFILE_PUBLIC, target: TARGET, ok: false, error: "500 Internal Server Error: <html>…" }),
      ENV,
      h.deps,
    );
    expect(res.status).toBe(422);
    expect(h.failures).toEqual([]);
    for (const word of CAPTURE_FAILURES) {
      const ok = await route(post({ profileId: PROFILE_PUBLIC, target: TARGET, ok: false, error: word }), ENV, harness().deps);
      expect([word, ok.status]).toEqual([word, 200]);
    }
  });
});

describe("a capture that came back", () => {
  it("replaces the one screenshot slot with the picture, its generated alt and its moment, and clears the run", async () => {
    const h = harness();
    const res = await route(post(okReport()), ENV, h.deps);
    expect(res.status).toBe(200);
    expect(h.replaced).toEqual([
      {
        id: "99999999-9999-4999-8999-999999999999",
        profileId: PROFILE_UUID,
        kind: "screenshot",
        storageRef: REF,
        alt: screenshotAlt("acme-thing", NOW.toISOString()),
        width: 1280,
        height: 800,
        position: 0,
        observedAt: NOW.toISOString(),
      },
    ]);
    expect(h.successes).toEqual([{ profileId: PROFILE_UUID, target: TARGET, at: NOW.toISOString() }]);
    const body = (await res.json()) as { data: { recorded: string; observedAt: string } };
    expect(body.data.recorded).toBe("capture");
    expect(body.data.observedAt).toBe(NOW.toISOString());
  });

  it("refuses a picture it cannot describe: a bad reference, blank alt, a tile-sized capture, no moment, a future moment", async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["ref", { ref: "not-a-ref.png" }],
      ["alt", { alt: "   " }],
      ["dimensions", { width: 160, height: 100 }],
      ["dimensions", { width: 1280.5, height: 800 }],
      ["observedAt", { observedAt: "yesterday" }],
      ["observedAt", { observedAt: "2027-01-01T00:00:00.000Z" }],
    ];
    for (const [field, patch] of cases) {
      const h = harness();
      const res = await route(post({ ...okReport(), ...patch }), ENV, h.deps);
      const body = (await res.json()) as { error: { details?: { fields?: Record<string, string[]> } } };
      expect([field, res.status]).toEqual([field, 422]);
      expect(Object.keys(body.error.details?.fields ?? {})).toContain(field);
      expect(h.replaced).toEqual([]);
      expect(h.successes).toEqual([]);
    }
  });

  it("refuses an unknown listing and a report with no address", async () => {
    const h = harness();
    expect((await route(post({ ...okReport(), profileId: "opp_nope" }), ENV, h.deps)).status).toBe(422);
    expect((await route(post({ ...okReport(), target: "" }), ENV, h.deps)).status).toBe(422);
    expect((await route(new Request(BASE, { method: "POST", body: "{" }), ENV, h.deps)).status).toBe(422);
    expect(h.replaced).toEqual([]);
  });
});
