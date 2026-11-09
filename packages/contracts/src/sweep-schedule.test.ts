// RS2 — which cron means which work.
//
// The property under test is the one that keeps the split honest: the
// expression in `gateway/wrangler.jsonc` and the branch in
// `gateway/src/index.ts` are ONE decision written in two files, and this is
// the seam where a typo in either would silently pick the wrong mode.

import { describe, expect, it } from "vitest";

import {
  KNOWN_SWEEP_CRONS,
  SWEEP_CRON,
  sweepModeForCron,
} from "./sweep-schedule.js";

describe("sweepModeForCron", () => {
  it("maps each committed expression to its own work", () => {
    expect(sweepModeForCron(SWEEP_CRON.ingestion)).toBe("ingestion");
    expect(sweepModeForCron(SWEEP_CRON.materialisation)).toBe("materialisation");
  });

  it("runs materialisation for anything it does not recognise, and never ingestion", () => {
    // The safety default, and the reason this is a match rather than a
    // fallthrough. A cron nobody recognises is a config change somebody made
    // without changing this file. Materialisation reaches nothing outside the
    // estate, so the worst case is inward work running more often than
    // intended. Defaulting the other way would let an unreviewed line of JSON
    // start reaching out to the internet on a schedule nobody chose.
    for (const unknown of ["", "0 0 * * *", "* * * * *", "nonsense", undefined]) {
      expect(sweepModeForCron(unknown)).toBe("materialisation");
    }
  });

  it("tolerates the whitespace a config file can pick up", () => {
    expect(sweepModeForCron("  23 * * * *  ")).toBe("ingestion");
    expect(sweepModeForCron("23  *  * * *")).toBe("ingestion");
  });

  it("keeps the two expressions distinct, so one firing can never mean both", () => {
    expect(SWEEP_CRON.ingestion).not.toBe(SWEEP_CRON.materialisation);
    expect(new Set(KNOWN_SWEEP_CRONS).size).toBe(KNOWN_SWEEP_CRONS.length);
  });

  it("gives ingestion the rarer schedule", () => {
    // Not decoration: ingestion spends GitHub requests against an
    // unauthenticated ceiling and materialisation spends only our own compute.
    // If these ever swap, the ceiling is breached on the first busy day.
    expect(SWEEP_CRON.materialisation.startsWith("*/")).toBe(true);
    expect(SWEEP_CRON.ingestion.startsWith("*/")).toBe(false);
  });
});
