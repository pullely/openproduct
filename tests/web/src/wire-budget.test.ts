// The budget on the wire, held as WC2-8 wrote it (openproduct-worldclass-v2 QE0).
//
// The lane itself lives in `tests/web-perf` and needs a browser and a build;
// what is pinned HERE is the part a cheap suite can hold: the three numbers
// are the decision's, the lane runs in `all` (the profile CI executes), and
// the phone's section bar no longer prefetches four documents nobody asked
// for. A budget that could be loosened in one file with nothing else noticing
// is the WC-5 failure again — a number written down and never asserted.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PERF = resolve(__dirname, "../../web-perf/src");
// WC2-8's numbers, as the decision records them. They lived in the monorepo's
// specs/epics/openproduct-worldclass-v2/README.md until the repository cut;
// this repository carries them itself, beside this test.
const DECISION = resolve(__dirname, "wire-budget.decision.json");
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(file, "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("WC2-8's three numbers", () => {
  const wire = code(resolve(PERF, "wire.mjs"));

  it("are 276 KB compressed, 30 requests, no third-party host", () => {
    expect(wire).toContain("export const WIRE = { bytes: 276 * 1024, requests: 30, thirdPartyHosts: 0 };");
  });

  it("moved only by a recorded decision: the amendment is in WC2-8 itself", () => {
    // 250 → 276 KB at the Next 16 upgrade (2026-10-22): the runtime grew,
    // the app did not. The redesign (2026-11-14, OPR1) raised it to 300 KB
    // by arithmetic in its first commit and took that back once the lane had
    // measured: every archetype is under 276 KB, so there is no amendment
    // for it — only a note with the measured numbers. The number here and
    // the number in the decision move together or not at all.
    const wc28 = JSON.parse(read(DECISION)) as {
      decision: string;
      bytesKB: number;
      requests: number;
      thirdPartyHosts: number;
      amendments: Array<{ date: string; fromKB: number; toKB: number; why: string }>;
      notes: Array<{ date: string; heldKB: number; why: string }>;
    };
    expect(wc28.decision).toBe("WC2-8");
    expect(wc28.amendments.map((a) => [a.date, a.fromKB, a.toKB])).toEqual([
      ["2026-10-22", 250, 276],
    ]);
    // Each amendment starts where the last one ended, and says why.
    wc28.amendments.forEach((a, i) => {
      if (i > 0) expect(a.fromKB).toBe(wc28.amendments[i - 1]!.toKB);
      expect(a.why.length).toBeGreaterThan(40);
    });
    // The redesign is a NOTE, not an amendment: it held the number, and says
    // what was measured — the three archetypes, in bytes, and the font files
    // a page actually fetches.
    expect(wc28.notes.map((n) => [n.date, n.heldKB])).toEqual([["2026-11-14", 276]]);
    const held = wc28.notes[0]!.why;
    for (const measured of ["261,811", "276,145", "262,461", "75,924", "four font files"]) {
      expect([measured, held.includes(measured)]).toEqual([measured, true]);
    }
    // And every one of those is under the budget in force.
    for (const bytes of [261_811, 276_145, 262_461]) expect(bytes).toBeLessThanOrEqual(wc28.bytesKB * 1024);
    // The budget in force is the last amendment's, and the lane holds exactly it.
    expect(wc28.bytesKB).toBe(wc28.amendments.at(-1)!.toKB);
    expect(wire).toContain(
      `export const WIRE = { bytes: ${wc28.bytesKB} * 1024, requests: ${wc28.requests}, thirdPartyHosts: ${wc28.thirdPartyHosts} };`,
    );
  });

  it("are measured at both of the audit's viewports, on the three archetypes it measured", () => {
    expect(wire).toContain("width: 1280");
    expect(wire).toContain("width: 375");
    expect(wire).toContain('path: "/"');
    expect(wire).toContain("path: `/${SAMPLE_SLUG}`");
    // The audit's third archetype, the leaderboard, is the Upvoted order
    // since OB7 (#1875) — and since openproduct-redesign OPR1 that order is
    // the Products page's `?sort=upvoted`.
    expect(wire).toContain('path: "/products?sort=upvoted"');
  });

  it("counts compressed bytes, and keeps counting after load so a prefetch is seen", () => {
    expect(wire).toContain("e.encodedBodySize || e.transferSize");
    expect(wire).toContain("await page.waitForTimeout(SETTLE_MS)");
    expect(wire).toContain("const SETTLE_MS = 2_500;");
  });

  it("gates: the lane is in `all`, which is what the verify profile runs", () => {
    const run = code(resolve(PERF, "run.mjs"));
    expect(run).toContain('if (lane === "all" || lane === "wire")');
    expect(run).toContain('await import("./wire.mjs")');
  });
});

describe("the four documents nobody asked for", () => {
  it("the phone's tab bar does not prefetch on sight", () => {
    // The audit's W·15: four RSC documents, ~44 KB, on every phone home load.
    // The bar is four tabs again since OPR1, so the cost would be the same.
    const bar = code(resolve(APP, "shell/section-bar.tsx"));
    const link = (bar.match(/<AppLink\b[\s\S]*?>/g) ?? []).find((l) => l.includes("href={tab.href}"));
    expect(link).toContain("prefetch={false}");
  });
});
