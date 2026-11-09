// The freshness state machine (openproduct-commons SN0).
//
// One rule, tested at every boundary it could be broken at:
//
//   an unobserved metric renders a DASH, never a zero.
//
// `0 commits this week` says the project is dead. An unmeasured project has
// said nothing (OPC-C). Everything below is that distinction, plus the
// window arithmetic OPC-7 turns into a rendered fact.

import { describe, expect, it } from "vitest";

import {
  ACTIVITY_KINDS,
  FRESHNESS_WINDOW_MS,
  METRICS,
  METRIC_SOURCES,
  SOURCE_FAILURE_TOLERANCE,
  backoffMs,
  metricObservableBy,
  metricState,
  renderableValue,
  type ObservedMetric,
} from "./signals.js";
import { SIGNAL_SOURCES } from "./provenance.js";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function observed(overrides: Partial<ObservedMetric> = {}): ObservedMetric {
  return {
    metric: "merges",
    window: "7d",
    value: 38,
    source: "linked_repo",
    observedAt: new Date(NOW - 60_000).toISOString(),
    ...overrides,
  };
}

describe("the tiers decide what can exist, never what it defaults to", () => {
  it("every metric names the tiers that can see it, and they are real tiers", () => {
    for (const metric of METRICS) {
      const sources = METRIC_SOURCES[metric];
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) expect(SIGNAL_SOURCES).toContain(source);
    }
  });

  it("CI is the tier-1 line — a declared repository has no tests figure at all", () => {
    // Not a zero one. We cannot see a declared repository's checks, and
    // rendering 0 would say its tests fail.
    expect(metricObservableBy("tests_passing", "linked_repo")).toBe(true);
    expect(metricObservableBy("tests_passing", "declared_repo")).toBe(false);
    expect(metricObservableBy("tests_passing", "manifest")).toBe(false);
    // Activity, by contrast, is readable from a public repository with no App.
    expect(metricObservableBy("merges", "declared_repo")).toBe(true);
    expect(metricObservableBy("merges", "manifest")).toBe(false);
  });
});

describe("metricState — the OPC-7 window arithmetic", () => {
  it("is fresh inside the window", () => {
    const at = new Date(NOW - FRESHNESS_WINDOW_MS.merges + 1000).toISOString();
    expect(metricState("merges", at, NOW)).toBe("fresh");
  });

  it("is stale between one and two windows, and withdrawn past two", () => {
    const window = FRESHNESS_WINDOW_MS.merges;
    expect(metricState("merges", new Date(NOW - window - 1).toISOString(), NOW)).toBe("stale");
    expect(metricState("merges", new Date(NOW - window * 2).toISOString(), NOW)).toBe("stale");
    expect(metricState("merges", new Date(NOW - window * 2 - 1).toISOString(), NOW)).toBe(
      "withdrawn",
    );
  });

  it("distinguishes 'we stopped being able to watch' from 'we never could'", () => {
    // Two different sentences on the page. Conflating them would tell a
    // reader that a manifest-only listing had gone dark.
    expect(metricState("merges", null, NOW)).toBe("unobserved");
    expect(metricState("merges", new Date(NOW).toISOString(), NOW, true)).toBe("withdrawn");
  });

  it("treats a future observation as fresh rather than rejecting it", () => {
    // Clock skew between our ingester and a repository host is real, and
    // refusing a number because it is three seconds ahead would be a worse
    // bug than accepting it.
    expect(metricState("merges", new Date(NOW + 3000).toISOString(), NOW)).toBe("fresh");
  });

  it("treats an unparseable timestamp as unobserved, not as fresh", () => {
    expect(metricState("merges", "whenever", NOW)).toBe("unobserved");
  });

  it("gives each metric a window matched to how fast its fact moves", () => {
    // A commit count is a day's news; a test result is a week's.
    expect(FRESHNESS_WINDOW_MS.merges).toBe(DAY);
    expect(FRESHNESS_WINDOW_MS.tests_passing).toBe(7 * DAY);
    for (const metric of METRICS) expect(FRESHNESS_WINDOW_MS[metric]).toBeGreaterThan(0);
  });
});

describe("renderableValue — no code path here produces 0 from an absence", () => {
  it("renders a fresh number", () => {
    expect(renderableValue(observed(), NOW)).toEqual({
      value: 38,
      state: "fresh",
      observedAt: expect.any(String),
    });
  });

  it("renders a stale number, so the reader sees the age rather than nothing", () => {
    const at = new Date(NOW - FRESHNESS_WINDOW_MS.merges - 1000).toISOString();
    expect(renderableValue(observed({ observedAt: at }), NOW)?.state).toBe("stale");
  });

  it("returns null — a dash — for every state that is not fresh or stale", () => {
    // The whole rule, at the one function most likely to be got wrong.
    expect(renderableValue(null, NOW)).toBeNull();
    const ancient = new Date(NOW - FRESHNESS_WINDOW_MS.merges * 3).toISOString();
    expect(renderableValue(observed({ observedAt: ancient }), NOW)).toBeNull();
    expect(renderableValue(observed(), NOW, true)).toBeNull();
  });

  it("never turns an absence into a zero, even when the value IS zero", () => {
    // A genuine, freshly-observed zero is information and renders. An absence
    // is not a zero and returns null. These are different, and the difference
    // is the whole of OPC-C.
    const genuineZero = renderableValue(observed({ value: 0 }), NOW);
    expect(genuineZero).toEqual({ value: 0, state: "fresh", observedAt: expect.any(String) });
    expect(renderableValue(null, NOW)).toBeNull();
  });
});

describe("ingestion cost is a number someone chose", () => {
  it("backs off exponentially and caps at a request a day", () => {
    expect(backoffMs(0)).toBe(15 * 60 * 1000);
    expect(backoffMs(1)).toBe(30 * 60 * 1000);
    // A repository that 404s forever must not cost more than one poll a day.
    expect(backoffMs(50)).toBe(DAY);
    expect(backoffMs(7)).toBeLessThanOrEqual(DAY);
  });

  it("gives up eventually, and giving up stops rendering too", () => {
    expect(SOURCE_FAILURE_TOLERANCE).toBeGreaterThan(1);
    // The pairing that matters: withdrawal is what `renderableValue` reads.
    expect(renderableValue(observed(), NOW, true)).toBeNull();
  });
});

describe("the activity vocabulary is closed", () => {
  it("is the design's seven verbs, and nothing else", () => {
    // Closed because this text renders on a public, crawled page: an open
    // vocabulary would let an ingester write attacker-influenced strings onto
    // it. That it also fits a 74px column is the lesser reason.
    expect([...ACTIVITY_KINDS]).toEqual([
      "merged",
      "thread",
      "joined",
      "snapshot",
      "opening",
      "answered",
      "declined",
    ]);
  });
});
