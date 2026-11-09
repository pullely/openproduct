// From an observation to a verdict, and which failure mode (OO1).

import { describe, expect, it } from "vitest";

import { judge, searchGraceMs } from "./slo.js";
import type { Observation } from "./walk.js";

const NOW = new Date("2026-09-10T12:00:00Z");

function observed(over: Partial<{ [K in keyof Observation]: Partial<Observation[K]> }> = {}): Observation {
  const base: Observation = {
    health: {
      reachable: true,
      status: 200,
      phases: { searchIndex: { healthy: true, reason: null, lastRunAt: null }, integrity: { healthy: true, reason: null, lastRunAt: null } },
      build: { version: null, deployedAt: null },
    },
    front: { reachable: true, status: 200, cacheStatus: "HIT", titled: true },
    seeded: { reachable: true, slug: "acme-thing", publishedAt: "2026-09-01T00:00:00Z" },
    search: { reachable: true, found: true },
    listing: { reachable: true, status: 200, titled: true },
    rs4: { upvoteGate: true, signinOwned: true },
    durationMs: 100,
  };
  return {
    health: { ...base.health, ...(over.health ?? {}) } as Observation["health"],
    front: { ...base.front, ...(over.front ?? {}) } as Observation["front"],
    seeded: { ...base.seeded, ...(over.seeded ?? {}) } as Observation["seeded"],
    search: { ...base.search, ...(over.search ?? {}) } as Observation["search"],
    listing: over.listing === undefined ? base.listing : (over.listing as Observation["listing"]),
    rs4: base.rs4,
    durationMs: base.durationMs,
  };
}

const verdict = (obs: Observation, slo: string) => judge(obs, NOW).verdicts.find((v) => v.slo === slo);

describe("two failure modes that need different people", () => {
  it("a healthy product holds on both, and the cache sample is HIT", () => {
    const j = judge(observed(), NOW);
    expect(j.verdicts).toEqual([
      { slo: "search-freshness", holding: true, mode: null },
      { slo: "count-freshness", holding: true, mode: null },
    ]);
    expect(j.cacheSample).toBe("HIT");
    expect(j.frontReachable).toBe(true);
  });

  it("the sweep did not run: /health says the phase is unhealthy — an operations problem", () => {
    expect(verdict(observed({ health: { phases: { searchIndex: { healthy: false, reason: "stale", lastRunAt: null }, integrity: { healthy: true, reason: null, lastRunAt: null } } } }), "search-freshness")).toEqual({
      slo: "search-freshness",
      holding: false,
      mode: "sweep_not_run",
    });
    expect(verdict(observed({ health: { phases: { searchIndex: { healthy: true, reason: null, lastRunAt: null }, integrity: { healthy: false, reason: "never_run", lastRunAt: null } } } }), "count-freshness")).toEqual({
      slo: "count-freshness",
      holding: false,
      mode: "sweep_not_run",
    });
    // A phase /health does not list at all is a phase that did not run.
    expect(verdict(observed({ health: { phases: {} } }), "search-freshness")!.mode).toBe("sweep_not_run");
  });

  it("the sweep ran and the page disagrees: /health healthy, search empty for a listing old enough — a product defect", () => {
    expect(verdict(observed({ search: { reachable: true, found: false } }), "search-freshness")).toEqual({
      slo: "search-freshness",
      holding: false,
      mode: "page_disagrees",
    });
    // A listing published inside the grace may honestly not be indexed yet.
    const fresh = new Date(NOW.getTime() - searchGraceMs() + 60_000).toISOString();
    expect(verdict(observed({ seeded: { publishedAt: fresh }, search: { found: false } }), "search-freshness")!.holding).toBe(true);
    // No listing at all: nothing to disagree about.
    expect(verdict(observed({ seeded: { slug: null, publishedAt: null }, search: { reachable: null, found: null } }), "search-freshness")!.holding).toBe(true);
  });

  it("unreachable comes first and the others wait", () => {
    for (const obs of [
      observed({ health: { reachable: false, status: 503, phases: null } }),
      observed({ health: { reachable: true, status: 200, phases: null } }),
    ]) {
      expect(judge(obs, NOW).verdicts).toEqual([
        { slo: "search-freshness", holding: false, mode: "unreachable" },
        { slo: "count-freshness", holding: false, mode: "unreachable" },
      ]);
    }
    // Search itself down while /health is fine is the search promise unreachable, not a disagreement.
    expect(verdict(observed({ search: { reachable: false, found: null } }), "search-freshness")!.mode).toBe("unreachable");
  });

  it("the cache sample: HIT is a hit, anything else a miss, and an unreadable front page is no sample", () => {
    expect(judge(observed({ front: { cacheStatus: "DYNAMIC" } }), NOW).cacheSample).toBe("MISS");
    expect(judge(observed({ front: { cacheStatus: null } }), NOW).cacheSample).toBe("MISS");
    const down = judge(observed({ front: { reachable: false, status: 502, cacheStatus: null, titled: false } }), NOW);
    expect(down.cacheSample).toBeNull();
    expect(down.frontReachable).toBe(false);
  });
});
