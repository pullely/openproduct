// The worker's routing surface (saas-openproduct OD1, posture updated by the
// flag retirement).
//
// The OPENPRODUCT_ENABLED launch flag is gone: prod serves openproduct
// directly, so the routes answer wherever the worker is deployed. What this
// file still holds: /health is honest about deployment facts, unmounted paths
// 404 (never 403 — an absent surface should not advertise that it exists),
// and no route family is reachable that a milestone did not mount.

import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";

const ENV: Env = { ENVIRONMENT: "prod" };

function get(path: string, method = "GET"): Request {
  return new Request(`https://openproduct-worker.internal${path}`, { method });
}

describe("openproduct-worker health", () => {
  it("answers, and names the service", async () => {
    const res = await route(get("/health"), ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { service: string; environment: string } };
    expect(body.data.service).toBe("openproduct-worker");
    expect(body.data.environment).toBe("prod");
  });

  // The flag is retired: health must not resurrect an "enabled" claim that
  // nothing reads. Deployment facts only.
  it("reports no enabled field — the surface is always-on", async () => {
    const res = await route(get("/health"), ENV);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect("enabled" in body.data).toBe(false);
  });

  it("reports deployment facts without dereferencing anything — and no binding line remains (OX5)", async () => {
    const res = await route(get("/health"), ENV);
    const body = (await res.json()) as {
      data: { checks: Record<string, { configured: boolean }> };
    };
    expect(Object.keys(body.data.checks).sort()).toEqual(["database", "seam"]);
    expect(body.data.checks.database!.configured).toBe(false);
  });

  it("rejects a non-GET health request", async () => {
    const res = await route(get("/health", "POST"), ENV);
    expect(res.status).toBe(405);
  });
});

describe("openproduct-worker unmounted paths", () => {
  // Paths outside the mounted families stay 404 — always-on does not mean
  // everything-answers.
  const unmounted = ["/", "/v1/public/openproduct/projects", "/internal/nothing"];

  it.each(unmounted)("404s %s", async (path) => {
    const res = await route(get(path), ENV);
    expect(res.status).toBe(404);
  });

  // 404 rather than 403: an absent path should not advertise that it exists.
  it("answers 404, never 403, for an unmounted route", async () => {
    const res = await route(get("/v1/public/openproduct/projects"), ENV);
    expect(res.status).not.toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});

describe("the OX-E cutover freeze (READ_ONLY)", () => {
  const FROZEN: Env = { ENVIRONMENT: "prod", READ_ONLY: "true" };

  it("503s every write — maintainer, seam, and purge doors alike", async () => {
    for (const path of [
      "/internal/openproduct/me",
      "/internal/openproduct/seam/join-request",
      "/v1/internal/openproduct/workspace-purge",
    ]) {
      const res = await route(get(path, path === "/internal/openproduct/me" ? "PUT" : "POST"), FROZEN);
      expect(`${path}: ${res.status}`).toBe(`${path}: 503`);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("read_only");
    }
  });

  it("keeps the read plane and health serving", async () => {
    expect((await route(get("/health"), FROZEN)).status).toBe(200);
    // The public directory still answers (its DB is unconfigured here, but the
    // freeze must not be what stops it — anything but read_only/503 wire-off).
    const res = await route(get("/internal/public/openproduct/projects"), FROZEN);
    const body = (await res.json()) as { error?: { code: string } };
    expect(body.error?.code).not.toBe("read_only");
  });

  it("is exact-match on \"true\" — any other value serves writes normally", async () => {
    const res = await route(
      get("/internal/openproduct/me", "PUT"),
      { ENVIRONMENT: "prod", READ_ONLY: "yes" } as Env,
    );
    expect(res.status).not.toBe(503);
  });
});
