// The three sentences hold to the code (openproduct-operations OO0), and the
// queries beside them speak the vocabulary (OO2).

import { describe, expect, it } from "vitest";

import {
  CACHE_HIT_TARGET,
  LOG_MESSAGES,
  LOG_MESSAGE_NAMES,
  SLOS,
  SWEEP_CRON,
  SWEEP_STALE_AFTER_SECONDS,
  isLogMessage,
  materialisationIntervalMinutes,
} from "./index.js";

describe("OO0 — each threshold number in the prose equals the constant", () => {
  it("reads the interval off the cron, and the cron is every ten minutes", () => {
    expect(SWEEP_CRON.materialisation).toBe("*/10 * * * *");
    expect(materialisationIntervalMinutes()).toBe(10);
  });

  it("carries every threshold as digits in its sentence, from the constant it names", () => {
    const constants: Record<string, number> = {
      "SWEEP_CRON.materialisation": materialisationIntervalMinutes(),
      "SWEEP_STALE_AFTER_SECONDS.searchIndex": SWEEP_STALE_AFTER_SECONDS.searchIndex / 60,
      "SWEEP_STALE_AFTER_SECONDS.integrity": SWEEP_STALE_AFTER_SECONDS.integrity / 3600,
      CACHE_HIT_TARGET,
    };
    expect(SLOS).toHaveLength(3);
    for (const slo of SLOS) {
      expect(slo.thresholds.length).toBeGreaterThan(0);
      for (const t of slo.thresholds) {
        expect([slo.id, t.constant, t.value]).toEqual([slo.id, t.constant, constants[t.constant]]);
        const inProse = t.unit === "ratio" ? `${t.value * 10} times in 10` : `${t.value} ${t.unit}`;
        expect([slo.id, slo.sentence.includes(inProse)]).toEqual([slo.id, true]);
      }
    }
  });

  it("is the three the plan transcribed: search within one interval, counts within three, a hit nine times in ten", () => {
    expect(SLOS.map((s) => s.id)).toEqual(["search-freshness", "count-freshness", "cache-hit"]);
    expect(SLOS[0]!.sentence).toContain("within 10 minutes");
    expect(SLOS[0]!.sentence).toContain("after 30");
    expect(SLOS[1]!.sentence).toContain("younger than 3 hours");
    expect(SLOS[2]!.sentence).toContain("9 times in 10");
    // The 3× RS1 already explains: the health threshold is three intervals.
    expect(SWEEP_STALE_AFTER_SECONDS.searchIndex).toBe(3 * materialisationIntervalMinutes() * 60);
  });

  it("commits a query beside each sentence, and a log query names only vocabulary messages", () => {
    for (const slo of SLOS) {
      expect(slo.query.text.length).toBeGreaterThan(10);
      if (slo.query.source === "workers-logs") {
        const msgs = [...slo.query.text.matchAll(/msg = "([a-z_]+)"/g)].map((m) => m[1]!);
        expect([slo.id, msgs.length > 0]).toEqual([slo.id, true]);
        for (const msg of msgs) expect([slo.id, msg, isLogMessage(msg)]).toEqual([slo.id, msg, true]);
      }
    }
    // Two are log queries; the ratio is analytics and says so.
    expect(SLOS.map((s) => s.query.source)).toEqual(["workers-logs", "workers-logs", "cache-analytics"]);
  });
});

describe("OO2 — the vocabulary is a closed list with a level and fields", () => {
  it("names every message once, with a level, a meaning and at least one field", () => {
    expect(LOG_MESSAGE_NAMES.length).toBeGreaterThan(15);
    for (const name of LOG_MESSAGE_NAMES) {
      const kind = LOG_MESSAGES[name];
      expect([name, ["info", "warn", "error"].includes(kind.level)]).toEqual([name, true]);
      expect([name, kind.means.length > 10]).toEqual([name, true]);
      expect([name, kind.fields.length > 0]).toEqual([name, true]);
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("carries nothing a stranger wrote: no body, no address, no token field", () => {
    for (const name of LOG_MESSAGE_NAMES) {
      for (const field of LOG_MESSAGES[name].fields) {
        expect([name, field, /body|token|secret|email|url|cookie|authorization/i.test(field)]).toEqual([name, field, false]);
      }
    }
  });
});
