// The runbook, on the page (openproduct-operations OO4, OO-D).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RUNBOOK, RUNBOOK_ANCHORS, RUNBOOK_PATH, SWEEP_PHASES, runbookAnchor } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("one page per degraded state, its anchor from the contract", () => {
  const page = () => code("docs/runbook/page.tsx");

  it("renders the three registries and types no anchor of its own", () => {
    const source = page();
    expect(source).toContain("RUNBOOK.map(");
    expect(source).toContain("SWEEP_PHASES.map(");
    expect(source).toContain("id={entry.anchor}");
    expect(source).toContain("id={phaseRunbookAnchor(phase)}");
    expect(source).toContain("id={DEPLOY_LAG.anchor}");
    expect(source).toContain("id={DEPLOY_UNVERIFIED.anchor}");
    expect(source).toContain("REFIRE_HOW.map(");
    expect(source).toContain("DEPLOY_LAG.read.map(");
    // No literal anchor on the page: an id typed here would be one the alert cannot check.
    for (const anchor of RUNBOOK_ANCHORS) expect(source).not.toContain(`id="${anchor}"`);
    // The section headings carry their own ids for `aria-labelledby`; no ARTICLE does.
    expect(source).not.toMatch(/<article[^>]*\sid="/);
  });

  it("is a static, canonical document under /docs, listed and linked", () => {
    const source = page();
    expect(source).toContain(`alternates: { canonical: "${RUNBOOK_PATH}" }`);
    expect(source).toContain("export const revalidate = 600;");
    expect(source).not.toMatch(/fetch\(|"use client"/);
    expect(code("docs/page.tsx")).toContain(`href="${RUNBOOK_PATH}"`);
    expect(code("sitemap.xml/route.ts")).toContain('{ path: "docs/runbook", lastmod: null }');
  });

  it("every phase row on /docs/checks links to its page by the same anchor function", () => {
    const checks = code("docs/checks/page.tsx");
    expect(checks).toContain("href={`${RUNBOOK_PATH}#${phaseRunbookAnchor(health.phase)}`}");
    expect(checks).toContain("data-runbook-link={health.phase}");
  });

  it("every anchor an alert can carry is one the page renders (OO-D, walked)", () => {
    const rendered = new Set(RUNBOOK_ANCHORS);
    for (const entry of RUNBOOK) expect(rendered.has(runbookAnchor(entry.slo, entry.mode))).toBe(true);
    for (const slo of ["search-freshness", "count-freshness", "cache-hit"] as const) {
      expect(rendered.has(runbookAnchor(slo, "unreachable"))).toBe(true);
    }
    expect(RUNBOOK_ANCHORS).toHaveLength(RUNBOOK.length + SWEEP_PHASES.length + 2);
  });
});
