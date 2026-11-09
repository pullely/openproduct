import { describe, expect, it } from "vitest";

import {
  MERGES_CAP_PER_CONTRIBUTOR_PER_DAY,
  countMergedChanges,
  isBotAccount,
  type CommitFact,
} from "./merge-count.js";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const DAY = 86_400_000;

/** A first-parent chain, newest first: each commit's first parent is the next. */
function chain(entries: Array<Partial<CommitFact> & { at: number }>): CommitFact[] {
  return entries.map((e, i) => ({
    sha: e.sha ?? `c${i}`,
    parents: e.parents ?? (i + 1 < entries.length ? [entries[i + 1]!.sha ?? `c${i + 1}`] : []),
    contributor: e.contributor === undefined ? "ada" : e.contributor,
    isBot: e.isBot ?? false,
    landedAt: e.at,
  }));
}

describe("countMergedChanges — the activity.merges sentence, clause by clause", () => {
  it("counts the first-parent line inside each window", () => {
    const commits = chain([
      { at: NOW - 1 * DAY, contributor: "ada" },
      { at: NOW - 3 * DAY, contributor: "bo" },
      { at: NOW - 10 * DAY, contributor: "ada" },
      { at: NOW - 40 * DAY, contributor: "ada" },
    ]);
    expect(countMergedChanges(commits, NOW)).toEqual({
      merges7d: 2,
      merges30d: 3,
      lastTouchedAt: Math.floor((NOW - DAY) / 1000),
    });
  });

  it("counts a merge commit once, never the commits it brought in", () => {
    // m (merge) ← parents [p (main), f2 (feature)]; f2 ← f1 ← p.
    const commits: CommitFact[] = [
      { sha: "m", parents: ["p", "f2"], contributor: "ada", isBot: false, landedAt: NOW - DAY },
      { sha: "f2", parents: ["f1"], contributor: "bo", isBot: false, landedAt: NOW - 2 * DAY },
      { sha: "f1", parents: ["p"], contributor: "bo", isBot: false, landedAt: NOW - 2 * DAY },
      { sha: "p", parents: [], contributor: "ada", isBot: false, landedAt: NOW - 3 * DAY },
    ];
    expect(countMergedChanges(commits, NOW).merges7d).toBe(2);
  });

  it("never counts a bot", () => {
    const commits = chain([
      { at: NOW - DAY, contributor: "dependabot[bot]", isBot: true },
      { at: NOW - DAY, contributor: "ada" },
    ]);
    expect(countMergedChanges(commits, NOW).merges7d).toBe(1);
  });

  it(`caps one contributor at ${MERGES_CAP_PER_CONTRIBUTOR_PER_DAY} a UTC day — an agent included`, () => {
    const sameDay = Array.from({ length: 40 }, (_, i) => ({
      at: Date.parse("2026-10-13T08:00:00Z") + i * 60_000,
      contributor: "busy-agent",
    }));
    const nextDay = Array.from({ length: 3 }, (_, i) => ({
      at: Date.parse("2026-10-14T01:00:00Z") + i * 60_000,
      contributor: "busy-agent",
    }));
    const result = countMergedChanges(chain([...nextDay.reverse(), ...sameDay.reverse()]), NOW);
    expect(result.merges7d).toBe(MERGES_CAP_PER_CONTRIBUTOR_PER_DAY + 3);
  });

  it("caps per contributor, so two people on one day count separately", () => {
    const day = Date.parse("2026-10-13T08:00:00Z");
    const commits = chain([
      ...Array.from({ length: 8 }, (_, i) => ({ at: day + i * 1000, contributor: "ada" })),
      ...Array.from({ length: 8 }, (_, i) => ({ at: day - (i + 1) * 1000, contributor: "bo" })),
    ]);
    expect(countMergedChanges(commits, NOW).merges7d).toBe(2 * MERGES_CAP_PER_CONTRIBUTOR_PER_DAY);
  });

  it("answers zero for an empty listing and null for its last touch", () => {
    expect(countMergedChanges([], NOW)).toEqual({ merges7d: 0, merges30d: 0, lastTouchedAt: null });
  });

  it("stops at the edge of what the listing returned rather than guessing beyond it", () => {
    const commits = chain([{ at: NOW - DAY }, { at: NOW - 2 * DAY, parents: ["not-in-listing"] }]);
    expect(countMergedChanges(commits, NOW).merges7d).toBe(2);
  });

  it("survives a cycle in malformed input", () => {
    const commits: CommitFact[] = [
      { sha: "a", parents: ["b"], contributor: "ada", isBot: false, landedAt: NOW - DAY },
      { sha: "b", parents: ["a"], contributor: "ada", isBot: false, landedAt: NOW - DAY },
    ];
    expect(countMergedChanges(commits, NOW).merges7d).toBe(2);
  });
});

describe("isBotAccount", () => {
  it("knows automation by account type, by suffix and by name", () => {
    expect(isBotAccount("anything", "Bot")).toBe(true);
    expect(isBotAccount("renovate[bot]", "User")).toBe(true);
    expect(isBotAccount("dependabot", null)).toBe(true);
    expect(isBotAccount("GitHub-Actions", null)).toBe(true);
    expect(isBotAccount("ada", "User")).toBe(false);
    expect(isBotAccount(null, null)).toBe(false);
  });
});
