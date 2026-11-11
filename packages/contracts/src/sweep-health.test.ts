import { describe, expect, it } from "vitest";

import {
  NEVER_RUN,
  SWEEP_PHASES,
  SWEEP_STALE_AFTER_SECONDS,
  isSweepPhase,
  sweepHealth,
  sweepPhaseHealth,
  sweepPhaseState,
  type SweepStateDocument,
} from "./sweep-health.js";

const NOW = new Date("2026-09-07T12:00:00.000Z");
const agoSeconds = (n: number): string => new Date(NOW.getTime() - n * 1000).toISOString();
const ran = (n: number) => sweepPhaseState(agoSeconds(n));

function document(overrides: Partial<SweepStateDocument> = {}): SweepStateDocument {
  return {
    catalogue: NEVER_RUN,
    searchIndex: NEVER_RUN,
    integrity: NEVER_RUN,
    defence: NEVER_RUN,
    board: NEVER_RUN,
    digest: NEVER_RUN,
    snapshots: NEVER_RUN,
    ...overrides,
  };
}

describe("sweepPhaseHealth", () => {
  it("calls a phase that has never run UNHEALTHY, and says never_run rather than stale", () => {
    const health = sweepPhaseHealth("searchIndex", NEVER_RUN, NOW);
    expect(health.healthy).toBe(false);
    expect(health.reason).toBe("never_run");
    expect(health.ageSeconds).toBeNull();
    expect(health.error).toBeNull();
  });

  it("is healthy inside the threshold and stale outside it", () => {
    const inside = sweepPhaseHealth("searchIndex", ran(29 * 60), NOW);
    expect(inside.healthy).toBe(true);
    expect(inside.reason).toBeNull();
    expect(inside.ageSeconds).toBe(29 * 60);

    const outside = sweepPhaseHealth("searchIndex", ran(31 * 60), NOW);
    expect(outside.healthy).toBe(false);
    expect(outside.reason).toBe("stale");
  });

  it("treats the threshold itself as still healthy", () => {
    const at = sweepPhaseHealth("integrity", ran(SWEEP_STALE_AFTER_SECONDS.integrity), NOW);
    expect(at.healthy).toBe(true);
  });

  it("treats an unparseable or future timestamp as never run, never as healthy", () => {
    expect(sweepPhaseHealth("defence", sweepPhaseState("not-a-date"), NOW).reason).toBe("never_run");
    const future = sweepPhaseHealth(
      "defence",
      sweepPhaseState(new Date(NOW.getTime() + 60_000).toISOString()),
      NOW,
    );
    expect(future.healthy).toBe(false);
    expect(future.reason).toBe("never_run");
  });

  it("gives every phase a threshold that is three times its own interval", () => {
    expect(SWEEP_STALE_AFTER_SECONDS.searchIndex).toBe(3 * 10 * 60);
    expect(SWEEP_STALE_AFTER_SECONDS.integrity).toBe(3 * 60 * 60);
    expect(SWEEP_STALE_AFTER_SECONDS.defence).toBe(3 * 6 * 60 * 60);
    expect(SWEEP_STALE_AFTER_SECONDS.board).toBe(3 * 10 * 60);
    expect(SWEEP_STALE_AFTER_SECONDS.digest).toBe(3 * 10 * 60);
    // OS2: a daily phase, so a three-day threshold — the same rule, one more row.
    expect(SWEEP_STALE_AFTER_SECONDS.snapshots).toBe(3 * 24 * 60 * 60);
  });
});

describe("a phase that fails says so (LI0, WC2-1)", () => {
  it("a phase that has never run BECAUSE it fails reports failed, with the reason — not never_run", () => {
    const state = sweepPhaseState(null, "internal_error: Search index rebuild failed (503)", agoSeconds(120));
    const health = sweepPhaseHealth("searchIndex", state, NOW);
    expect(health.healthy).toBe(false);
    expect(health.reason).toBe("failed");
    expect(health.error).toBe("internal_error: Search index rebuild failed (503)");
    expect(health.errorAt).toBe(agoSeconds(120));
    expect(health.lastRunAt).toBeNull();
  });

  it("a failure newer than the last run is current, and outranks a healthy age", () => {
    const state = sweepPhaseState(agoSeconds(60), "board: http_503", agoSeconds(30));
    const health = sweepPhaseHealth("board", state, NOW);
    expect(health.reason).toBe("failed");
    expect(health.lastRunAt).toBe(agoSeconds(60));
    expect(health.ageSeconds).toBe(60);
  });

  it("a failure OLDER than the last run is not current: the run cleared it", () => {
    const state = sweepPhaseState(agoSeconds(30), "board: http_503", agoSeconds(60));
    const health = sweepPhaseHealth("board", state, NOW);
    expect(health.healthy).toBe(true);
    expect(health.reason).toBeNull();
    expect(health.error).toBeNull();
  });

  it("a failure with no readable instant is taken as current rather than ignored", () => {
    const state = sweepPhaseState(agoSeconds(30), "digest: thrown", null);
    expect(sweepPhaseHealth("digest", state, NOW).reason).toBe("failed");
  });
});

describe("sweepHealth", () => {
  it("reports unreachable distinctly from never-run", () => {
    const unreachable = sweepHealth(null, NOW);
    expect(unreachable.reachable).toBe(false);
    expect(unreachable.healthy).toBe(false);
    expect(unreachable.phases).toHaveLength(0);
  });

  it("is healthy only when every phase is", () => {
    const fresh = document({
      catalogue: ran(60),
      searchIndex: ran(60),
      integrity: ran(60),
      defence: ran(60),
      board: ran(60),
      digest: ran(60),
      snapshots: ran(60),
    });
    expect(sweepHealth(fresh, NOW).healthy).toBe(true);

    const oneStale = { ...fresh, defence: ran(19 * 60 * 60) };
    const assessed = sweepHealth(oneStale, NOW);
    expect(assessed.healthy).toBe(false);
    expect(assessed.phases.find((p) => p.phase === "defence")?.reason).toBe("stale");
    expect(assessed.phases.find((p) => p.phase === "searchIndex")?.healthy).toBe(true);
  });

  it("reports the state the product was actually in before RS0", () => {
    const assessed = sweepHealth(document(), NOW);
    expect(assessed.reachable).toBe(true);
    expect(assessed.healthy).toBe(false);
    expect(assessed.phases.map((p) => p.reason)).toEqual([
      "never_run",
      "never_run",
      "never_run",
      "never_run",
      "never_run",
      "never_run",
      "never_run",
    ]);
  });

  it("reports the state production was in on 9 September 2026: two phases running, the index failing", () => {
    const assessed = sweepHealth(
      document({
        searchIndex: sweepPhaseState(null, "internal_error: Search index rebuild failed (503)", agoSeconds(300)),
        integrity: ran(3600),
        defence: ran(6 * 3600),
        board: ran(300),
        digest: ran(300),
      }),
      NOW,
    );
    expect(assessed.healthy).toBe(false);
    const index = assessed.phases.find((p) => p.phase === "searchIndex")!;
    expect(index.reason).toBe("failed");
    expect(index.error).toContain("rebuild failed");
    expect(assessed.phases.filter((p) => p.healthy).map((p) => p.phase)).toEqual([
      "integrity",
      "defence",
      "board",
      "digest",
    ]);
  });

  it("assesses every declared phase, so a phase added later cannot go unchecked", () => {
    expect(sweepHealth(document(), NOW).phases.map((p) => p.phase)).toEqual([...SWEEP_PHASES]);
  });

  it("a document missing a phase reads that phase as never run rather than throwing", () => {
    const partial = { searchIndex: ran(60) } as unknown as SweepStateDocument;
    const assessed = sweepHealth(partial, NOW);
    expect(assessed.phases.find((p) => p.phase === "board")?.reason).toBe("never_run");
  });

  it("knows its own phase names", () => {
    expect(isSweepPhase("board")).toBe(true);
    expect(isSweepPhase("search_rebuild")).toBe(false);
    expect(isSweepPhase(null)).toBe(false);
  });
});
