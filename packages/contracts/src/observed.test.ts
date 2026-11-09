// PV0 — the observed row (openproduct-worldclass).

import { describe, expect, it } from "vitest";

import { FORMULAS, allFormulas } from "./provenance.js";
import {
  OBSERVED_FRAME_NOTE,
  OBSERVED_SIGNALS,
  SIGNAL_STALE_AFTER_DAYS,
  SIGNAL_WITHDRAWN_NOTE,
  observedFormulas,
  observedRow,
  observedSentence,
  signalWithdrawn,
} from "./observed.js";

const NOW = new Date("2026-09-08T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const profile = (over: Partial<Parameters<typeof observedRow>[0]> = {}) => ({
  observedAt: daysAgo(1),
  licence: "MIT",
  language: "TypeScript",
  lastCommitAt: daysAgo(3),
  openIssues: 12,
  ...over,
});

describe("four signals, not five", () => {
  it("ships no tests figure", () => {
    // `declared_repo`'s own description in provenance.ts: "we cannot see CI,
    // so there is no tests figure and the field is absent rather than empty".
    // An absent field is honest; a guessed one would put a number nobody
    // could defend into a frame whose whole claim is that its numbers are
    // not claims.
    expect(OBSERVED_SIGNALS).toEqual(["licence", "language", "lastCommit", "openIssues"]);
    expect(OBSERVED_SIGNALS).not.toContain("tests");
    expect(Object.keys(FORMULAS)).not.toContain("repo.tests");
  });

  it("gives every signal a published rule", () => {
    const published = new Set(allFormulas().map((f) => f.id));
    for (const id of observedFormulas()) {
      expect([id, published.has(id)]).toEqual([id, true]);
      expect([id, FORMULAS[id].computedBy]).toEqual([id, "PV0"]);
    }
  });

  it("says what the open-issues number contains", () => {
    // GitHub counts pull requests in it. A reader comparing this against the
    // issue tab would otherwise conclude we cannot count.
    expect(observedSentence("openIssues")).toContain("INCLUDES open pull requests");
  });

  it("says the last commit is a push", () => {
    expect(observedSentence("lastCommit")).toContain("A push, not a merge");
  });
});

describe("a signal without its moment is not renderable", () => {
  it("renders nothing at all for a repository never read", () => {
    // NOT four dashes. Four dashes would say "we looked and found nothing",
    // which is a different and false statement.
    expect(observedRow(profile({ observedAt: null }), NOW)).toEqual([]);
  });

  it("carries the same moment on every line, because it was one read", () => {
    const row = observedRow(profile(), NOW);
    expect(new Set(row.map((s) => s.observedAt)).size).toBe(1);
  });
});

describe("an observation withdraws rather than ages quietly", () => {
  it("holds inside the horizon and withdraws past it", () => {
    expect(signalWithdrawn(daysAgo(SIGNAL_STALE_AFTER_DAYS - 1), NOW)).toBe(false);
    expect(signalWithdrawn(daysAgo(SIGNAL_STALE_AFTER_DAYS + 1), NOW)).toBe(true);
  });

  it("treats an unparseable moment as withdrawn", () => {
    // Fail closed: a date nobody can read is not evidence of freshness.
    expect(signalWithdrawn("not a date", NOW)).toBe(true);
  });

  it("withdraws the row whole, never a line of it", () => {
    const row = observedRow(profile({ observedAt: daysAgo(90) }), NOW);
    expect(row.every((s) => s.withdrawn)).toBe(true);
    // And it still renders — a withdrawn signal that vanished would be
    // indistinguishable from one never observed.
    expect(row).toHaveLength(4);
  });

  it("publishes the horizon in the sentence a reader meets", () => {
    expect(SIGNAL_WITHDRAWN_NOTE).toContain(String(SIGNAL_STALE_AFTER_DAYS));
  });

  it("takes the clock rather than reading one", () => {
    // A page renders on a server and hydrates in a browser; a rule reading
    // two clocks would withdraw a signal in one of them.
    const at = daysAgo(SIGNAL_STALE_AFTER_DAYS + 1);
    expect(signalWithdrawn(at, NOW)).toBe(true);
    expect(signalWithdrawn(at, new Date(NOW.getTime() - 5 * 86_400_000))).toBe(false);
  });
});

describe("a zero and a dash are different claims (OPC-C)", () => {
  it("keeps an earned zero", () => {
    // The repository was read and has none open. That is a finding.
    const row = observedRow(profile({ openIssues: 0 }), NOW);
    expect(row.find((s) => s.id === "openIssues")!.value).toBe("0");
  });

  it("renders nothing observed as nothing", () => {
    const row = observedRow(profile({ openIssues: null, language: null }), NOW);
    expect(row.find((s) => s.id === "openIssues")!.value).toBeNull();
    expect(row.find((s) => s.id === "language")!.value).toBeNull();
  });
});

describe("the frame says whose words these are", () => {
  it("names the source and denies the maintainer", () => {
    expect(OBSERVED_FRAME_NOTE).toContain("not written by its maintainers");
    expect(OBSERVED_FRAME_NOTE).toContain("links the rule");
  });
});
