// The probe Worker on LOCAL D1 (openproduct-standalone OPN-2).
//
// Every test talks to the BUILT bundle (`wrangler deploy --dry-run`) served
// by miniflare on real workerd with a real local D1 — the artifact a deploy
// uploads, not its sources. What local D1 cannot show (the remote limits,
// latency, replicas) is what the deployed probe is for; what it CAN show is
// here: the routes, their refusals, idempotence, the whole flow end to end,
// the smoke script's verdict logic, and that the committed snapshot is what
// local D1 produces.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PACKAGE_DIR, buildProbe, startLocalProbe } from "../scripts/local-probe.mjs";

// The routes answer arbitrary JSON; the assertions read into it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only view of response bodies
type Json = any;

const TOKEN = `test-${"0123456789abcdef".repeat(3)}`;
const SMOKE = join(PACKAGE_DIR, "scripts/probe-run.mjs");

interface LocalProbe {
  url: string;
  dispose(): Promise<void>;
}

let dist: string;
let probe: LocalProbe;

async function post(path: string, init: { token?: string | null; method?: string; body?: string } = {}) {
  const headers: Record<string, string> = {};
  const token = init.token === undefined ? TOKEN : init.token;
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${probe.url}${path}`, { method: init.method ?? "POST", headers, body: init.body ?? null });
  const text = await res.text();
  return { status: res.status, text, json: text ? (JSON.parse(text) as Record<string, Json>) : null };
}

async function load(size: string) {
  let step = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    const res = await post(`/load?size=${size}&step=${step}`);
    expect(res.status).toBe(200);
    if (res.json!.done) return res.json!;
    step = res.json!.nextStep;
  }
  throw new Error("the load did not finish");
}

function runSmoke(env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SMOKE], {
      env: { PATH: process.env.PATH ?? "", PROBE_MARKER: "off", ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

beforeAll(async () => {
  dist = buildProbe();
  probe = await startLocalProbe({ outdir: dist, token: TOKEN });
}, 180_000);

afterAll(async () => {
  await probe?.dispose();
  if (dist) rmSync(dist, { recursive: true, force: true });
});

describe("the surface", () => {
  it("answers a bare 404 to no token, a wrong token, a wrong method and an unknown path — and echoes nothing", async () => {
    for (const res of [
      await post("/schema", { token: null }),
      await post("/schema", { token: "not-the-token-not-the-token" }),
      await post("/schema", { token: `${TOKEN}x` }),
      await post("/schema", { token: TOKEN.slice(0, -1) }),
      await post("/schema", { method: "GET" }),
      await post("/nope", { body: "echo-me-if-you-dare" }),
      await post("/schema", { token: null, body: "echo-me-if-you-dare" }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.text).toBe("");
    }
  });

  it("a Worker never given a token (or a short one) answers nothing at all", async () => {
    for (const token of [undefined, "short-token"]) {
      const bare = await startLocalProbe({ outdir: dist, ...(token === undefined ? {} : { token }) });
      try {
        for (const presented of ["", "short-token", TOKEN]) {
          const res = await fetch(`${bare.url}/schema`, { method: "POST", headers: { authorization: `Bearer ${presented}` } });
          expect(res.status).toBe(404);
          expect(await res.text()).toBe("");
        }
      } finally {
        await bare.dispose();
      }
    }
  }, 60_000);

  it("refuses bad parameters with a reason, and /bench and /export before a load with 409", async () => {
    expect((await post("/schema")).status).toBe(200);
    expect((await post("/reset")).status).toBe(200);
    expect(await post("/load?size=huge")).toMatchObject({ status: 400 });
    expect(await post("/load?size=smoke&step=x")).toMatchObject({ status: 400 });
    expect(await post("/bench?op=nope")).toMatchObject({ status: 409 });
    expect(await post("/export")).toMatchObject({ status: 409 });
  });
});

describe("POST /schema", () => {
  it("applies 0001_slice.sql and is idempotent: a second apply changes nothing", async () => {
    const first = await post("/schema");
    const second = await post("/schema");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.json!.tables).toEqual([
      "catalog_cards", "catalog_state", "d1_probe_meta", "metrics", "product_media", "profiles",
      "role_openings", "search_index", "search_index_state", "search_index_terms",
    ]);
    expect(second.json!.triggers).toEqual(["product_media_gallery_ceiling_insert", "product_media_gallery_ceiling_update"]);
    expect(second.json!.indexes).toHaveLength(11);
    expect(second.json!.singletonRows).toEqual({ search_index_state: 1, catalog_state: 1 });
    const shape = (r: typeof first) => [r.json!.statements, r.json!.tables, r.json!.indexes, r.json!.triggers, r.json!.singletonRows];
    expect(shape(second)).toEqual(shape(first));
  });
});

describe("the flow on a small corpus", () => {
  it("loads step by step, refuses a second load, benches every op correctly, and exports the committed snapshot", async () => {
    await post("/schema");
    await post("/reset");
    const loaded = await load("smoke");
    expect(loaded.total).toBe(10);
    expect(loaded.nextStep).toBeNull();
    expect(await post("/load?size=smoke&step=0")).toMatchObject({ status: 409 });
    expect(await post("/load?size=suite&step=3")).toMatchObject({ status: 409 });

    const bench = await post("/bench?runs=2");
    expect(bench.status).toBe(200);
    const ops = bench.json!.ops as Record<string, Json>;
    expect(Object.keys(ops)).toEqual([
      "rebuildCatalogue.cold", "rebuildCatalogue.quiet", "listCataloguePage.first", "listCataloguePage.deep",
      "searchCandidates.common", "searchCandidates.rare", "searchCandidates.multi",
      "replaceSearchIndex.cold", "replaceSearchIndex.unchanged", "sessions",
    ]);
    for (const [name, op] of Object.entries(ops)) {
      expect({ name, accepted: op.accepted, error: op.error, checkFailures: op.checkFailures }).toEqual({ name, accepted: true, error: null, checkFailures: [] });
      expect(op.completed).toBe(2);
    }
    expect(ops["rebuildCatalogue.cold"].samples[0]).toMatchObject({ rounds: 1, statements: 3, servedByPrimary: true });
    expect(ops["replaceSearchIndex.cold"].info.payload).toMatchObject({ documents: 120, statements: 5 });
    expect(ops.sessions.supported).toBe(true);
    expect(ops.sessions.constraints.bookmark.staleMarker).toBe(0);

    const exported = await post("/export");
    expect(exported.status).toBe(200);
    expect(exported.json!.prep).toEqual({ computedAt: "2026-09-09T12:00:00.000Z", cards: 120, written: 0, removed: 0 });
    const expected = JSON.parse(readFileSync(join(PACKAGE_DIR, "expected/smoke.json"), "utf8"));
    expect(exported.json!.sections).toEqual(expected.sections);

    const full = await post("/export?detail=full");
    expect(full.json!.content.catalogue[0].cards).toHaveLength(120);
    expect(full.json!.content.searchIndex).toHaveLength(120);

    const reset = await post("/reset");
    expect(reset.json!.reset.profiles.rows).toBe(120);
    expect(await post("/export")).toMatchObject({ status: 409 });
  }, 120_000);
});

describe("POST /negative on LOCAL D1", () => {
  it("shows what the static guard is for: local workerd ACCEPTS the 34-argument call, the 2.1 MB value and the 56 MB result", async () => {
    const res = await post("/negative");
    expect(res.status).toBe(200);
    const by = Object.fromEntries((res.json!.probes as Json[]).map((p) => [p.probe, p]));
    expect(by.args34).toMatchObject({ outcome: "accepted", detail: { keys: 17 } });
    expect(by.string2mb).toMatchObject({ outcome: "accepted", detail: { boundLength: 2_100_000 } });
    expect(by.result50mb).toMatchObject({ outcome: "accepted", detail: { rows: 56, bytes: 56_000_000 } });
    // Local workerd DOES enforce the pattern limit (PROOF.md: caught locally on the first run).
    expect(by.like51).toMatchObject({ outcome: "refused" });
    expect(by.like51.error).toMatch(/LIKE or GLOB pattern too complex/);
  }, 60_000);
});

describe("the smoke script (scripts/probe-run.mjs) against local D1", () => {
  const base = () => ({ PROBE_URL: probe.url, PROBE_TOKEN: TOKEN, PROBE_SIZE: "smoke", PROBE_RUNS: "2" });

  it("runs the whole flow, matches the snapshot, and fails ONLY on the probes local D1 accepts — never printing the token", async () => {
    const { code, stdout, stderr } = await runSmoke(base());
    expect(stdout).not.toContain(TOKEN);
    expect(stderr).not.toContain(TOKEN);
    const report = JSON.parse(stdout);
    expect(code).toBe(1);
    expect(report.verdict).toBe("fail");
    expect(report.failures).toHaveLength(3);
    for (const [i, probeName] of ["args34", "string2mb", "result50mb"].entries()) {
      expect(report.failures[i]).toMatch(new RegExp(`^negative ${probeName}: ACCEPTED`));
    }
    expect(report.schema.idempotent).toBe(true);
    expect(report.load).toMatchObject({ statements: 10, everyStatementUnder30s: true });
    expect(report.export.matched).toBe(true);
    expect(report.bench["replaceSearchIndex.cold"].batch).toBe("accepted");
    expect(report.bench["rebuildCatalogue.cold"].summary.wallMs.n).toBe(2);
    expect(report.budgets.rows.length).toBeGreaterThan(0);
    expect(report.cleanup.emptied).toBe(true);
  }, 120_000);

  it("passes (exit 0) when the negative phase is left out", async () => {
    const { code, stdout } = await runSmoke({ ...base(), PROBE_PHASES: "schema,reset,load,bench,export,cleanup" });
    const report = JSON.parse(stdout);
    expect(report.failures).toEqual([]);
    expect(code).toBe(0);
  }, 120_000);

  it("fails when remote and local differ: a tampered snapshot is caught and located", async () => {
    const dir = mkdtempSync(join(tmpdir(), "d1-probe-expected-"));
    try {
      const snapshot = JSON.parse(readFileSync(join(PACKAGE_DIR, "expected/smoke.json"), "utf8"));
      snapshot.sections.catalogue.pageDigests[0] = "0".repeat(64);
      snapshot.sections.census.windows.week += 1;
      const file = join(dir, "smoke.json");
      writeFileSync(file, JSON.stringify(snapshot));
      const { code, stdout } = await runSmoke({ ...base(), PROBE_PHASES: "schema,reset,load,export", PROBE_EXPECTED_FILE: file });
      const report = JSON.parse(stdout);
      expect(code).toBe(1);
      expect(report.export.matched).toBe(false);
      expect(report.export.differences.join("\n")).toMatch(/sections\.catalogue\.pageDigests/);
      expect(report.export.differences.join("\n")).toMatch(/sections\.census\.windows\.week/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("refuses to start without its secrets (exit 2), and names the secret, not a value", async () => {
    const noToken = await runSmoke({ CLOUDFLARE_WORKERS_SUBDOMAIN: "example" });
    expect(noToken.code).toBe(2);
    expect(JSON.parse(noToken.stdout).failures[0]).toMatch(/PROBE_TOKEN is not set/);
    const noTarget = await runSmoke({ PROBE_TOKEN: TOKEN });
    expect(noTarget.code).toBe(2);
    expect(JSON.parse(noTarget.stdout).failures[0]).toMatch(/CLOUDFLARE_WORKERS_SUBDOMAIN/);
    expect(noTarget.stdout).not.toContain(TOKEN);
  });

  it("asks Cloudflare for the workers.dev subdomain with the deploy credentials, and says plainly when there is none", async () => {
    // A stand-in for api.cloudflare.com: one account with no subdomain
    // registered (Cloudflare answers 404 with an error code), so the probe
    // never reaches for a workers.dev host at all.
    const seen: { path?: string | undefined; auth?: string | undefined } = {};
    const api = createServer((req, res) => {
      seen.path = req.url;
      seen.auth = req.headers.authorization;
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: false, errors: [{ code: 10007, message: "workers.api.error.subdomain_not_found" }], result: null }));
    });
    await new Promise<void>((done) => api.listen(0, "127.0.0.1", () => done()));
    try {
      const { port } = api.address() as AddressInfo;
      const out = await runSmoke({
        PROBE_TOKEN: TOKEN,
        CLOUDFLARE_API_TOKEN: "cf-test-token",
        CLOUDFLARE_ACCOUNT_ID: "acct123",
        CLOUDFLARE_API_BASE: `http://127.0.0.1:${port}`,
      });
      expect(out.code).toBe(2);
      expect(seen.path).toBe("/accounts/acct123/workers/subdomain");
      expect(seen.auth).toBe("Bearer cf-test-token");
      expect(JSON.parse(out.stdout).failures[0]).toMatch(/no workers\.dev subdomain registered.*10007/);
      expect(out.stdout).not.toContain("cf-test-token");
      expect(out.stdout).not.toContain(TOKEN);
    } finally {
      await new Promise<void>((done) => api.close(() => done()));
    }
  });

  it("on the composition's retry, re-prints a reached verdict instead of loading again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "d1-probe-marker-"));
    try {
      const marker = join(dir, "marker.json");
      const env = { ...base(), PROBE_PHASES: "schema,reset,load,negative", PROBE_MARKER: "", PROBE_MARKER_FILE: marker };
      const first = await runSmoke(env);
      expect(first.code).toBe(1);
      // The retry would fail to reach anything — and does not try.
      const retry = await runSmoke({ ...env, PROBE_URL: "http://127.0.0.1:9" });
      expect(retry.code).toBe(1);
      expect(retry.stderr).toMatch(/already ran the probe to a verdict/);
      expect(JSON.parse(retry.stdout)).toEqual(JSON.parse(first.stdout));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("leaves no marker when it never reached a verdict, so the retry runs for real", async () => {
    const dir = mkdtempSync(join(tmpdir(), "d1-probe-marker-"));
    try {
      const marker = join(dir, "marker.json");
      const unreachable = await runSmoke({ ...base(), PROBE_URL: "http://127.0.0.1:9", PROBE_FIRST_CALL_ATTEMPTS: "1", PROBE_MARKER: "", PROBE_MARKER_FILE: marker });
      expect(unreachable.code).toBe(3);
      expect(JSON.parse(unreachable.stdout).verdict).toBe("error");
      const real = await runSmoke({ ...base(), PROBE_PHASES: "schema", PROBE_MARKER: "", PROBE_MARKER_FILE: marker });
      expect(real.code).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

// Opt-in: the scale target, as the stage smoke runs it (minus the run count).
describe.skipIf(process.env.D1_PROBE_FULL !== "1")("the smoke at the scale target (D1_PROBE_FULL=1)", () => {
  it("matches expected/full.json on local D1 after the whole bench", async () => {
    const { stdout } = await runSmoke({ PROBE_URL: probe.url, PROBE_TOKEN: TOKEN, PROBE_SIZE: "full", PROBE_RUNS: "3", PROBE_PHASES: "schema,reset,load,bench,export,cleanup" });
    const report = JSON.parse(stdout);
    expect(report.failures).toEqual([]);
    expect(report.export).toMatchObject({ matched: true, catalogue: { cards: 5000, pages: 25 } });
    expect(report.bench["replaceSearchIndex.cold"].info.payload).toMatchObject({ chunkBytes: [899_893, 423_999], statements: 7 });
  }, 600_000);
});
