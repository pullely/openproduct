// The runbook holds together (openproduct-operations OO4, OO-D).

import { describe, expect, it } from "vitest";

import {
  DEPLOY_LAG,
  DEPLOY_UNVERIFIED,
  FAILURE_MODES,
  PHASE_RUNBOOK,
  REFIRE_HOW,
  RUNBOOK,
  RUNBOOK_ANCHORS,
  SWEEP_PHASES,
  deployVerifyWindowMs,
  perTickPhases,
  phaseRunbookAnchor,
  runbookAnchor,
  type SloId,
} from "./index.js";

describe("every degraded state has a page, and every page an anchor nobody else has", () => {
  it("one page per sweep phase, each naming core's route and both ends of the story", () => {
    for (const phase of SWEEP_PHASES) {
      const page = PHASE_RUNBOOK[phase];
      expect([phase, page.refire]).toEqual([phase, expect.stringMatching(/^\/internal\/openproduct\/[a-z/-]+$/)]);
      expect([phase, page.visitorSees.length > 60, page.recovered.length > 30]).toEqual([phase, true, true]);
      expect(page.recovered).toContain("/health");
    }
    expect(Object.keys(PHASE_RUNBOOK).sort()).toEqual([...SWEEP_PHASES].sort());
  });

  it("every alert line resolves to an anchor the page renders", () => {
    const anchors = new Set(RUNBOOK_ANCHORS);
    for (const slo of ["search-freshness", "count-freshness", "cache-hit"] as SloId[]) {
      for (const mode of FAILURE_MODES) {
        // Not every (promise, mode) pair is a page — a cold cache is not a
        // search failure — but every one an alert can name must be.
        const pair = RUNBOOK.find((e) => e.slo === slo && e.mode === mode);
        if (pair || mode === "unreachable") expect(anchors.has(runbookAnchor(slo, mode))).toBe(true);
        else expect(() => runbookAnchor(slo, mode)).toThrow();
      }
    }
  });

  it("anchors are unique, fragment-safe, and the phases' are derived from the phase names", () => {
    expect(new Set(RUNBOOK_ANCHORS).size).toBe(RUNBOOK_ANCHORS.length);
    for (const anchor of RUNBOOK_ANCHORS) expect(anchor).toMatch(/^[a-zA-Z0-9-]+$/);
    for (const phase of SWEEP_PHASES) expect(RUNBOOK_ANCHORS).toContain(phaseRunbookAnchor(phase));
    expect(RUNBOOK_ANCHORS).toContain(DEPLOY_LAG.anchor);
    expect(RUNBOOK_ANCHORS).toContain(DEPLOY_UNVERIFIED.anchor);
    expect(RUNBOOK_ANCHORS.length).toBe(RUNBOOK.length + SWEEP_PHASES.length + 2);
  });

  it("the deploy page states WC-H's rule and three ways to read the deployed version, the last of them /health itself (OO3)", () => {
    expect(DEPLOY_LAG.rule).toContain("does not run until the branch under test is the branch that is live");
    expect(DEPLOY_LAG.read).toHaveLength(3);
    expect(DEPLOY_LAG.read[2]).toContain("/health on the gateway carries `build`");
    expect(DEPLOY_LAG.read[2]).toContain("not a commit");
    // OO3 — the per-tick phases are the ones a deploy is held to, derived from the staleness table.
    expect(perTickPhases()).toEqual(["catalogue", "searchIndex", "board", "digest"]);
    expect(deployVerifyWindowMs()).toBe(15 * 60_000);
    expect(DEPLOY_UNVERIFIED.recovered).toContain("deploy_verified");
    expect(REFIRE_HOW).toHaveLength(3);
    expect(REFIRE_HOW[0]).toMatch(/^Wait one tick/);
  });
});
