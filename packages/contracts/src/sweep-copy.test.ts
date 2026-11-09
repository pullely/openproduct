import { describe, expect, it } from "vitest";

import {
  INGESTION_COPY,
  SWEEP_PHASE_COPY,
  ingestionBudgetCopy,
  SWEEP_STANDING_COPY,
  sweepPhaseStanding,
  sweepStaleAfterCopy,
} from "./sweep-copy.js";
import {
  INGESTION_MAX_SOURCES_PER_RUN,
  SWEEP_PHASES,
  ingestionBudget,
  sweepPhaseHealth,
  sweepPhaseState,
} from "./sweep-health.js";

const NOW = new Date("2026-09-10T02:00:00.000Z");
const ago = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();

describe("every phase the health document assesses has copy a visitor can read (LI3)", () => {
  it("names every phase, once", () => {
    expect(Object.keys(SWEEP_PHASE_COPY).sort()).toEqual([...SWEEP_PHASES].sort());
    for (const phase of SWEEP_PHASES) {
      const copy = SWEEP_PHASE_COPY[phase];
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.does.endsWith(".")).toBe(true);
      expect(copy.cadence.endsWith(".")).toBe(true);
    }
  });

  it("renders the stale threshold as prose from the same table /health reads", () => {
    expect(sweepStaleAfterCopy("searchIndex")).toBe("30 minutes");
    expect(sweepStaleAfterCopy("integrity")).toBe("3 hours");
    expect(sweepStaleAfterCopy("defence")).toBe("18 hours");
  });

  it("decides one standing per phase, and failed outranks everything", () => {
    expect(sweepPhaseStanding(sweepPhaseHealth("board", sweepPhaseState(ago(60)), NOW))).toBe("running");
    expect(sweepPhaseStanding(sweepPhaseHealth("board", sweepPhaseState(ago(3 * 3600)), NOW))).toBe("stale");
    expect(sweepPhaseStanding(sweepPhaseHealth("board", sweepPhaseState(null), NOW))).toBe("never_run");
    expect(
      sweepPhaseStanding(sweepPhaseHealth("board", sweepPhaseState(ago(60), "board: http_503", ago(30)), NOW)),
    ).toBe("failed");
  });

  it("has a sentence for every standing", () => {
    expect(Object.keys(SWEEP_STANDING_COPY).sort()).toEqual(["failed", "never_run", "running", "stale"]);
  });
});

describe("the ingestion budget is a number on the page (LI4)", () => {
  it("reports the token's presence, never its value", () => {
    const withToken = ingestionBudget("ghp_secret");
    expect(withToken.authenticated).toBe(true);
    expect(JSON.stringify(withToken)).not.toContain("ghp_secret");
    expect(ingestionBudget("   ").authenticated).toBe(false);
    expect(ingestionBudget(undefined).authenticated).toBe(false);
  });

  it("says the cap either way, and the ceiling only when it applies", () => {
    expect(ingestionBudgetCopy(ingestionBudget("t"))).toBe(`Up to ${INGESTION_MAX_SOURCES_PER_RUN} repositories a run, authenticated to GitHub.`);
    expect(ingestionBudgetCopy(ingestionBudget(undefined))).toContain("60 reads an hour");
    expect(INGESTION_COPY.cadence).toContain("Hourly");
  });
});
