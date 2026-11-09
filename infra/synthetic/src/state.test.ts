// The memory and its transitions (OO1).

import { describe, expect, it } from "vitest";

import { CACHE_SAMPLE_MINIMUM, CACHE_SAMPLE_WINDOW } from "@openproduct/contracts";

import { EMPTY_STATE, SyntheticState, applyCycle, applyDeploy, cacheVerdict, type CycleInput, type DeployRecord, type StateStorage, type Verdict } from "./state.js";

const T = (n: number) => new Date(Date.UTC(2026, 8, 10, 12, n * 5)).toISOString();

const holding = (slo: Verdict["slo"]): Verdict => ({ slo, holding: true, mode: null });
const broken = (slo: Verdict["slo"], mode: Verdict["mode"]): Verdict => ({ slo, holding: false, mode });

const NO_BUILD = { version: null, deployedAt: null };
const ALL_TRUE = { upvoteGate: true, signinOwned: true, frontTitled: true, searchAnswers: true };

function cycle(n: number, verdicts: Verdict[], cacheSample: "HIT" | "MISS" | null = "HIT", frontReachable = true): CycleInput {
  return { at: T(n), verdicts, cacheSample, frontReachable, build: NO_BUILD, phaseRuns: {}, walk: ALL_TRUE };
}

describe("a flip is a change of word", () => {
  it("the first look that finds a promise holding says nothing; the first that finds it broken is a breach", () => {
    const first = applyCycle(EMPTY_STATE, cycle(0, [holding("search-freshness"), broken("count-freshness", "sweep_not_run")]));
    expect(first.flips).toEqual([{ slo: "count-freshness", state: "breached", mode: "sweep_not_run" }]);
    expect(first.state.slos["search-freshness"]).toEqual({ holding: true, since: T(0), lastHeldAt: T(0), lastCheckedAt: T(0), mode: null });
    expect(first.state.slos["count-freshness"]).toEqual({ holding: false, since: T(0), lastHeldAt: null, lastCheckedAt: T(0), mode: "sweep_not_run" });
    expect(first.state.cycles).toBe(1);
    expect(first.state.lastRunAt).toBe(T(0));
  });

  it("still broken is not a flip; holding again is a recovery; broken again is a breach with the new mode", () => {
    let state = applyCycle(EMPTY_STATE, cycle(0, [broken("search-freshness", "sweep_not_run")])).state;
    const still = applyCycle(state, cycle(1, [broken("search-freshness", "sweep_not_run")]));
    expect(still.flips).toEqual([]);
    expect(still.state.slos["search-freshness"].since).toBe(T(0));
    state = still.state;
    // The mode can change without a flip — it is the same breach, better understood.
    const reclassified = applyCycle(state, cycle(2, [broken("search-freshness", "page_disagrees")]));
    expect(reclassified.flips).toEqual([]);
    expect(reclassified.state.slos["search-freshness"].mode).toBe("page_disagrees");
    const back = applyCycle(reclassified.state, cycle(3, [holding("search-freshness")]));
    expect(back.flips).toEqual([{ slo: "search-freshness", state: "recovered", mode: null }]);
    expect(back.state.slos["search-freshness"]).toEqual({ holding: true, since: T(3), lastHeldAt: T(3), lastCheckedAt: T(3), mode: null });
    const again = applyCycle(back.state, cycle(4, [broken("search-freshness", "unreachable")]));
    expect(again.flips).toEqual([{ slo: "search-freshness", state: "breached", mode: "unreachable" }]);
    expect(again.state.slos["search-freshness"].lastHeldAt).toBe(T(3));
  });

  it("a promise that could not be judged keeps its last word and notes the look", () => {
    const state = applyCycle(EMPTY_STATE, cycle(0, [holding("count-freshness")])).state;
    const unjudged = applyCycle(state, { ...cycle(1, []), verdicts: [] });
    expect(unjudged.flips).toEqual([]);
    expect(unjudged.state.slos["count-freshness"]).toEqual({ holding: true, since: T(0), lastHeldAt: T(0), lastCheckedAt: T(1), mode: null });
  });
});

describe("the cache promise is judged from the window", () => {
  it("withholds a verdict until the minimum, then needs nine in ten", () => {
    expect(cacheVerdict([], true)).toEqual({ slo: "cache-hit", holding: null, mode: null });
    expect(cacheVerdict(Array(CACHE_SAMPLE_MINIMUM - 1).fill("HIT"), true).holding).toBeNull();
    expect(cacheVerdict(Array(CACHE_SAMPLE_MINIMUM).fill("HIT"), true)).toEqual({ slo: "cache-hit", holding: true, mode: null });
    const nineOfTen = [...Array(9).fill("HIT"), "MISS"] as Array<"HIT" | "MISS">;
    expect(cacheVerdict(nineOfTen, true).holding).toBe(true);
    const eightOfTen = [...Array(8).fill("HIT"), "MISS", "MISS"] as Array<"HIT" | "MISS">;
    expect(cacheVerdict(eightOfTen, true)).toEqual({ slo: "cache-hit", holding: false, mode: "cache_cold" });
    // An unreachable front page is not a miss; it is the product being down.
    expect(cacheVerdict(Array(12).fill("HIT"), false)).toEqual({ slo: "cache-hit", holding: false, mode: "unreachable" });
  });

  it("keeps the last hour of samples, oldest first, and records none when the page could not be read", () => {
    let state = EMPTY_STATE;
    for (let i = 0; i < CACHE_SAMPLE_WINDOW + 3; i += 1) {
      state = applyCycle(state, cycle(i, [], i < 2 ? "MISS" : "HIT")).state;
    }
    expect(state.cacheSamples).toHaveLength(CACHE_SAMPLE_WINDOW);
    expect(state.cacheSamples.every((s) => s === "HIT")).toBe(true);
    const before = state.cacheSamples;
    state = applyCycle(state, cycle(99, [], null, false)).state;
    expect(state.cacheSamples).toEqual(before);
    expect(state.slos["cache-hit"]).toMatchObject({ holding: false, mode: "unreachable" });
  });

  it("the first cold hour after a deploy is 'not yet', and flips once to cold if it stays cold", () => {
    let state = EMPTY_STATE;
    const flips: string[] = [];
    for (let i = 0; i < CACHE_SAMPLE_WINDOW; i += 1) {
      const applied = applyCycle(state, cycle(i, [], "MISS"));
      state = applied.state;
      flips.push(...applied.flips.map((f) => `${i}:${f.slo}:${f.state}`));
    }
    expect(flips).toEqual([`${CACHE_SAMPLE_MINIMUM - 1}:cache-hit:breached`]);
  });
});

describe("the object", () => {
  function storage(): StateStorage & { map: Map<string, unknown> } {
    const map = new Map<string, unknown>();
    return {
      map,
      get: async <T>(key: string) => map.get(key) as T | undefined,
      put: async <T>(key: string, value: T) => {
        map.set(key, value);
      },
    };
  }

  it("answers the empty document before any cycle, applies a cycle, and persists it", async () => {
    const store = storage();
    const object = new SyntheticState({ storage: store }, {});
    const empty = await object.fetch(new Request("https://synthetic.internal/"));
    expect(await empty.json()).toEqual(EMPTY_STATE);
    const recorded = await object.fetch(
      new Request("https://synthetic.internal/record", {
        method: "POST",
        body: JSON.stringify(cycle(0, [broken("count-freshness", "sweep_not_run")])),
      }),
    );
    expect(recorded.status).toBe(200);
    const applied = (await recorded.json()) as { flips: unknown[]; state: { cycles: number } };
    expect(applied.flips).toEqual([{ slo: "count-freshness", state: "breached", mode: "sweep_not_run" }]);
    expect(applied.state.cycles).toBe(1);
    expect((store.map.get("state") as { cycles: number }).cycles).toBe(1);
    // A fresh object over the same storage reads what the last one wrote.
    const again = new SyntheticState({ storage: store }, {});
    expect(((await (await again.fetch(new Request("https://synthetic.internal/"))).json()) as { cycles: number }).cycles).toBe(1);
  });

  it("refuses a body that is not a cycle, and anything that is not its two routes", async () => {
    const object = new SyntheticState({ storage: storage() }, {});
    expect((await object.fetch(new Request("https://synthetic.internal/record", { method: "POST", body: "nope" }))).status).toBe(400);
    expect((await object.fetch(new Request("https://synthetic.internal/record", { method: "POST", body: JSON.stringify({ at: 1 }) }))).status).toBe(400);
    expect((await object.fetch(new Request("https://synthetic.internal/other"))).status).toBe(404);
  });
});

describe("OO3 — every deploy verifies itself", () => {
  const V1 = "7b3c9f2e-0000-4000-8000-000000000001";
  const V2 = "8c4da0f3-0000-4000-8000-000000000002";
  const NO_DEPLOY: DeployRecord = { version: null, deployedAt: null, noticedAt: null, verifiedAt: null, reportedAt: null };
  /** Every per-tick phase ran at `at`. */
  const ranAt = (at: string) => ({ catalogue: at, searchIndex: at, board: at, digest: at, integrity: "2026-09-10T09:00:00.000Z" });
  const input = (n: number, over: Partial<CycleInput>): CycleInput => ({ ...cycle(n, []), ...over });

  it("a version not seen before is noticed, and verified the first cycle every per-tick phase has run after its upload", () => {
    const deployedAt = T(0);
    // Noticed at T(1); the phases last ran BEFORE the upload — not yet.
    const first = applyDeploy(NO_DEPLOY, input(1, { build: { version: V1, deployedAt }, phaseRuns: ranAt("2026-09-10T11:50:00.000Z") }));
    expect(first.events).toEqual([{ kind: "noticed", version: V1 }]);
    expect(first.record).toEqual({ version: V1, deployedAt, noticedAt: T(1), verifiedAt: null, reportedAt: null });
    // Next cycle: every per-tick phase ran after the upload. Verified, with how long after.
    const second = applyDeploy(first.record, input(2, { build: { version: V1, deployedAt }, phaseRuns: ranAt(T(1)) }));
    expect(second.events).toEqual([{ kind: "verified", version: V1, afterMs: 5 * 60_000, wasReported: false }]);
    expect(second.record.verifiedAt).toBe(T(2));
    // A verified version is left alone; the same version again says nothing.
    expect(applyDeploy(second.record, input(3, { build: { version: V1, deployedAt }, phaseRuns: ranAt(T(3)) })).events).toEqual([]);
  });

  it("one interval and a grace later without every phase run, it is reported unverified — once — and verified later is the recovery", () => {
    const deployedAt = T(0);
    let record = applyDeploy(NO_DEPLOY, input(0, { build: { version: V1, deployedAt }, phaseRuns: ranAt("2026-09-10T11:50:00.000Z") })).record;
    // Inside the window (10 min + 5 min grace): quiet.
    for (const n of [1, 2, 3]) {
      const step = applyDeploy(record, input(n, { build: { version: V1, deployedAt }, phaseRuns: ranAt("2026-09-10T11:50:00.000Z") }));
      expect([n, step.events]).toEqual([n, []]);
      record = step.record;
    }
    // T(4) is twenty minutes after the upload: the window has closed.
    const reported = applyDeploy(record, input(4, { build: { version: V1, deployedAt }, phaseRuns: ranAt("2026-09-10T11:50:00.000Z") }));
    expect(reported.events).toEqual([{ kind: "unverified", version: V1, reason: "phases_stale" }]);
    expect(reported.record.reportedAt).toBe(T(4));
    // Still not run: nothing more to say.
    expect(applyDeploy(reported.record, input(5, { build: { version: V1, deployedAt }, phaseRuns: ranAt("2026-09-10T11:50:00.000Z") })).events).toEqual([]);
    // The phases finally run: verified, and the recovery is flagged for the alert.
    const recovered = applyDeploy(reported.record, input(6, { build: { version: V1, deployedAt }, phaseRuns: ranAt(T(6)) }));
    expect(recovered.events).toEqual([{ kind: "verified", version: V1, afterMs: 30 * 60_000, wasReported: true }]);
  });

  it("phases ran but a walk failed is `walk_failed`; a walk that could not be made is not a failure; a new version restarts", () => {
    const deployedAt = T(0);
    const record = applyDeploy(NO_DEPLOY, input(0, { build: { version: V1, deployedAt }, phaseRuns: ranAt("2026-09-10T11:50:00.000Z") })).record;
    const walkBroken = applyDeploy(record, input(4, { build: { version: V1, deployedAt }, phaseRuns: ranAt(T(1)), walk: { ...ALL_TRUE, upvoteGate: false } }));
    expect(walkBroken.events).toEqual([{ kind: "unverified", version: V1, reason: "walk_failed" }]);
    const unasked = applyDeploy(record, input(4, { build: { version: V1, deployedAt }, phaseRuns: ranAt(T(1)), walk: null }));
    expect(unasked.events).toEqual([{ kind: "unverified", version: V1, reason: "walk_failed" }]);
    // A second version while the first is open: the first is forgotten, the second noticed.
    const next = applyDeploy(walkBroken.record, input(5, { build: { version: V2, deployedAt: T(5) }, phaseRuns: ranAt(T(1)) }));
    expect(next.events).toEqual([{ kind: "noticed", version: V2 }]);
    expect(next.record).toMatchObject({ version: V2, reportedAt: null, verifiedAt: null });
  });

  it("no build on /health means no deploy to verify, and a version with no upload moment is held to when it was noticed", () => {
    expect(applyDeploy(NO_DEPLOY, input(0, { build: NO_BUILD })).events).toEqual([]);
    const noticed = applyDeploy(NO_DEPLOY, input(0, { build: { version: V1, deployedAt: null }, phaseRuns: {} }));
    expect(noticed.record.deployedAt).toBe(T(0));
    // And it rides through applyCycle into the document.
    const applied = applyCycle(EMPTY_STATE, input(0, { build: { version: V1, deployedAt: T(0) }, phaseRuns: ranAt(T(0)) }));
    expect(applied.deployEvents.map((e) => e.kind)).toEqual(["noticed", "verified"]);
    expect(applied.state.deploy.verifiedAt).toBe(T(0));
  });
});
