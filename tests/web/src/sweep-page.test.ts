// /docs/checks renders every sweep phase from /health (openproduct-worldclass-v2 LI3).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SLOS, SWEEP_PHASES, SWEEP_PHASE_COPY } from "@openproduct/contracts";

import { fetchSweepHealth } from "@openproduct-web/app/public-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PAGE = "docs/checks/page.tsx";

describe("the checks page reads the sweep from the gateway's own document", () => {
  it("reads /health through the public read and renders one row per phase from the contract's copy", () => {
    const source = code(PAGE);
    expect(source).toContain("fetchSweepHealth()");
    expect(source).toContain("SWEEP_PHASE_COPY");
    expect(source).toContain("sweep.phases.map(");
    expect(source).toContain("SWEEP_UNREACHABLE_COPY");
    expect(source).toContain("INGESTION_COPY");
    expect(source).toContain("ingestionBudgetCopy(");
    // MD4 — the other outward phase, described by its budget too.
    expect(source).toContain("SCREENSHOT_COPY");
    expect(source).toContain("screenshotBudgetCopy(");
  });

  it("renders the three promises from the contract, each with its constant and its query (OO0, OO2)", () => {
    const source = code(PAGE);
    expect(source).toContain("SLOS.map(");
    expect(source).toContain("{slo.sentence}");
    expect(source).toContain("{t.constant}");
    expect(source).toContain("{slo.query.text}");
    expect(source).toContain("{SLO_HEADING}");
    expect(SLOS).toHaveLength(3);
  });

  it("revalidates within the sweep's own interval, so the page cannot contradict its own number for long", () => {
    const match = /export const revalidate = (\d+);/.exec(code(PAGE));
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(60);
  });

  it("renders times the way every timestamp on the site does (VC6)", () => {
    const source = code(PAGE);
    expect(source).toContain("agoOf(");
    expect(source).toContain("absoluteOf(");
  });

  it("resolves no actor: the read carries no cookie and no credential (I6)", () => {
    const source = code("public-api.ts");
    const fn = source.slice(source.indexOf("export async function fetchSweepHealth"));
    expect(fn).toContain('readPublic<');
    expect(fn).not.toContain("cookies(");
    expect(fn).not.toContain("authorization");
  });
});

describe("fetchSweepHealth", () => {
  const document = {
    data: {
      status: "degraded",
      checks: {
        sweep: {
          reachable: true,
          healthy: false,
          phases: SWEEP_PHASES.map((phase) => ({
            phase,
            lastRunAt: null,
            ageSeconds: null,
            staleAfterSeconds: 1800,
            healthy: false,
            reason: "never_run",
            error: null,
            errorAt: null,
          })),
        },
      },
    },
  };

  const answering = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("returns the sweep block, one entry per phase, every phase with copy", async () => {
    const health = await fetchSweepHealth(answering(200, document));
    expect(health?.sweep.phases.map((p) => p.phase)).toEqual([...SWEEP_PHASES]);
    for (const p of health?.sweep.phases ?? []) expect(SWEEP_PHASE_COPY[p.phase].title.length).toBeGreaterThan(0);
    // A gateway that predates LI4 reports no budget, and the page says so rather than guessing.
    expect(health?.ingestion).toBeNull();
    expect(health?.screenshots).toBeNull();
  });

  it("carries the ingestion budget when the gateway reports one (LI4)", async () => {
    const withBudget = {
      data: {
        ...document.data,
        checks: {
          ...document.data.checks,
          ingestion: { authenticated: false, maxSourcesPerRun: 25, unauthenticatedReadsPerHour: 60 },
        },
      },
    };
    const health = await fetchSweepHealth(answering(200, withBudget));
    expect(health?.ingestion).toEqual({ authenticated: false, maxSourcesPerRun: 25, unauthenticatedReadsPerHour: 60 });
  });

  it("carries the capture budget when the gateway reports one, and says nothing when it does not (MD4)", async () => {
    const screenshots = { configured: false, maxPerRun: 5, refreshAfterDays: 7, withdrawnAfterDays: 30 };
    const withBudget = {
      data: { ...document.data, checks: { ...document.data.checks, screenshots } },
    };
    expect((await fetchSweepHealth(answering(200, withBudget)))?.screenshots).toEqual(screenshots);
    const malformed = {
      data: { ...document.data, checks: { ...document.data.checks, screenshots: { configured: "yes" } } },
    };
    expect((await fetchSweepHealth(answering(200, malformed)))?.screenshots).toBeNull();
  });

  it("is null when the gateway cannot be read or answers without a sweep block", async () => {
    expect(await fetchSweepHealth(answering(500, {}))).toBeNull();
    expect(await fetchSweepHealth(answering(200, { data: { status: "ok" } }))).toBeNull();
  });
});
