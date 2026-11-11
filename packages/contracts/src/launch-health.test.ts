// Launch health (openproduct-worldclass PV1, carried as WC2 PP6).
//
// WC-E: a checklist, not a score. What is pinned: five items and no number
// anywhere in the shape; an unobserved item is a dash-state, never `no`; a
// stale reading is withdrawn rather than false; the refused input is named;
// and no ordering module on the estate imports this one.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LAUNCH_HEALTH_ACTIVITY_DAYS,
  LAUNCH_HEALTH_ITEMS,
  LAUNCH_HEALTH_NOTE,
  LAUNCH_HEALTH_REFUSED_NOTE,
  launchHealth,
} from "./launch-health.js";
import { SIGNAL_STALE_AFTER_DAYS } from "./observed.js";

const NOW = new Date("2026-09-10T12:00:00Z");
const READ = "2026-09-09T00:00:00Z";
const __dirname = dirname(fileURLToPath(import.meta.url));

describe("five items, no number", () => {
  it("returns exactly the five, in order, and nothing numeric", () => {
    const items = launchHealth({ observedAt: READ, licence: "MIT", lastCommitAt: "2026-09-01T00:00:00Z" }, NOW);
    expect(items.map((i) => i.id)).toEqual([...LAUNCH_HEALTH_ITEMS]);
    for (const item of items) {
      for (const [key, value] of Object.entries(item)) {
        expect([item.id, key, typeof value]).not.toEqual([item.id, key, "number"]);
      }
    }
    expect(LAUNCH_HEALTH_NOTE).toMatch(/There is no total/);
  });

  it("answers what the repository answered, and dates each answer", () => {
    const items = launchHealth({ observedAt: READ, licence: "MIT", lastCommitAt: "2026-09-01T00:00:00Z" }, NOW);
    const by = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(by.licence).toMatchObject({ state: "yes", observedAt: READ, formula: "repo.licence" });
    expect(by.activity).toMatchObject({ state: "yes", observedAt: READ, formula: "repo.last-commit" });
    const old = launchHealth({ observedAt: READ, licence: null, lastCommitAt: "2026-01-01T00:00:00Z" }, NOW);
    expect(old.find((i) => i.id === "licence")?.state).toBe("no");
    expect(old.find((i) => i.id === "activity")?.state).toBe("no");
    expect(LAUNCH_HEALTH_ACTIVITY_DAYS).toBe(90);
  });

  it("an item nothing reads yet is a dash-state with no moment and no formula, never a no", () => {
    const items = launchHealth({ observedAt: READ, licence: "MIT", lastCommitAt: null }, NOW);
    for (const id of ["builds", "readme", "tests"] as const) {
      const item = items.find((i) => i.id === id)!;
      expect(item).toMatchObject({ state: "unobserved", observedAt: null, formula: null });
      expect(item.note).toMatch(/Not observed yet/);
    }
  });

  it("a repository never read is unobserved on every row, and a stale read is withdrawn, not false", () => {
    const never = launchHealth({ observedAt: null, licence: null, lastCommitAt: null }, NOW);
    expect(never.map((i) => i.state)).toEqual(["unobserved", "unobserved", "unobserved", "unobserved", "unobserved"]);
    const staleAt = new Date(NOW.getTime() - (SIGNAL_STALE_AFTER_DAYS + 1) * 86_400_000).toISOString();
    const stale = launchHealth({ observedAt: staleAt, licence: "MIT", lastCommitAt: staleAt }, NOW);
    expect(stale.find((i) => i.id === "licence")?.state).toBe("withdrawn");
    expect(stale.find((i) => i.id === "activity")?.state).toBe("withdrawn");
  });

  it("names the refused input, and it is not an item", () => {
    expect(LAUNCH_HEALTH_REFUSED_NOTE).toMatch(/first bug report/);
    expect(LAUNCH_HEALTH_ITEMS as readonly string[]).not.toContain("firstBug");
    expect(LAUNCH_HEALTH_ITEMS).toContain("tests");
  });
});

describe("no ordering takes the checklist as an input", () => {
  it("no module that orders, ranks, scores or searches imports launch-health", () => {
    const dir = __dirname;
    const orderers = readdirSync(dir).filter((f) =>
      /^(ranking|board|leaderboard|feed|alternatives|search|search-page|topics|stacks|pricing|sidebar|digest|catalog-api)\.ts$/.test(f),
    );
    expect(orderers.length).toBeGreaterThanOrEqual(10);
    for (const file of orderers) {
      expect([file, readFileSync(resolve(dir, file), "utf-8").includes("launch-health")]).toEqual([file, false]);
    }
    // And nothing in the contract reads it at all except its own test and the index.
    const readers = readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "index.ts" && f !== "launch-health.ts",
    );
    for (const file of readers) {
      expect([file, readFileSync(resolve(dir, file), "utf-8").includes("launch-health")]).toEqual([file, false]);
    }
  });
});
