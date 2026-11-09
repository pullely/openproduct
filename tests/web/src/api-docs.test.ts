// The API's changelog and stability policy, on the page (openproduct-consumers CS0).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  API_CHANGELOG,
  CATALOG_API_VERSION,
  DEPRECATION_NOTICE_DAYS,
  RATE_LIMITS,
  RATE_LIMIT_NAMES,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("the page renders the contract's registry, not a copy of it", () => {
  const page = () => code("docs/api/page.tsx");

  it("reads the changelog, the notices and the policy sentence from the contract", () => {
    const source = page();
    expect(source).toContain("API_CHANGELOG.map(");
    expect(source).toContain("API_DEPRECATIONS.length === 0");
    expect(source).toContain("{API_STABILITY_SENTENCE}");
    expect(source).toContain("{CATALOG_API_VERSION}");
    expect(source).toContain("DEPRECATION_NOTICE_DAYS");
    // No hand-typed version or day count on the page: one constant, everywhere.
    expect(source).not.toMatch(/"1\.[0-9]\.[0-9]"/);
    expect(source).not.toContain(`${DEPRECATION_NOTICE_DAYS} days`);
  });

  it("CS1 — renders the limit from the contract's table, and types no number of its own", () => {
    const source = page();
    expect(source).toContain("RATE_LIMIT_NAMES.map(");
    expect(source).toContain("{RATE_LIMIT_SENTENCE}");
    expect(source).toContain("data-rate-limits={RATE_LIMIT_NAMES.length}");
    expect(source).toContain("rateWindowWord(bucket.windowSec)");
    // Not one of the three limits, nor the window, appears as a literal.
    for (const name of RATE_LIMIT_NAMES) {
      const bucket = RATE_LIMITS[name];
      expect(source).not.toMatch(new RegExp(`\\b${bucket.limit}\\b`));
      expect(source).not.toMatch(new RegExp(`\\b${bucket.windowSec}\\b`));
    }
    expect(source).not.toMatch(/a minute|an hour/);
  });

  it("is a static, canonical document under /docs, and /docs links to it", () => {
    const source = page();
    expect(source).toContain('alternates: { canonical: "/docs/api" }');
    expect(source).toContain("export const revalidate = 600;");
    expect(source).not.toMatch(/fetch\(|"use client"/);
    expect(code("docs/page.tsx")).toContain('href="/docs/api"');
    expect(code("sitemap.xml/route.ts")).toContain('{ path: "docs/api", lastmod: null }');
  });

  it("the newest release is the version the docs index advertises", () => {
    expect(API_CHANGELOG[0]!.version).toBe(CATALOG_API_VERSION);
    expect(code("docs/page.tsx")).toContain("${CATALOG_API_VERSION}");
  });
});
