// The visitor's own acts, as numbers, kept until the caches catch up
// (`ui/live-counts.ts`), driven against a fake storage and clock.
//
// What is pinned: a bump shows at once; a bump that cancels an earlier one
// leaves nothing; a bump survives a reload through storage; an entry older
// than the TTL counts for nothing and is dropped on the next write; and the
// toggle hook reads its delta from here rather than from component state, so
// the number a visitor moved stays moved across a navigation.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LIVE_COUNTS_STORAGE_KEY,
  LIVE_COUNT_TTL_MS,
  __resetLiveCountsForTests,
  bumpLiveCount,
  liveCountDelta,
  liveCountKey,
  liveCounts,
  loadLiveCounts,
  subscribeLiveCounts,
} from "@openproduct-web/app/ui/live-counts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("a count this browser moved", () => {
  let clock = 1_000_000;
  let store = fakeStorage();
  beforeEach(() => {
    clock = 1_000_000;
    store = fakeStorage();
    __resetLiveCountsForTests({ storage: () => store, now: () => clock });
  });

  it("shows the bump at once, and tells its listeners", () => {
    const key = liveCountKey("endorsed", "kettleworks");
    let told = 0;
    subscribeLiveCounts(() => {
      told += 1;
    });
    bumpLiveCount(key, 1);
    expect(liveCountDelta(liveCounts(), key)).toBe(1);
    expect(told).toBe(1);
  });

  it("a bump that cancels an earlier one leaves no entry", () => {
    const key = liveCountKey("endorsed", "kettleworks");
    bumpLiveCount(key, 1);
    bumpLiveCount(key, -1);
    expect(liveCountDelta(liveCounts(), key)).toBe(0);
    expect(liveCounts()[key]).toBeUndefined();
    expect(store.map.has(LIVE_COUNTS_STORAGE_KEY)).toBe(false);
  });

  it("survives a reload through storage", () => {
    const key = liveCountKey("follows", "topic:dev-tools");
    bumpLiveCount(key, 1);
    expect(store.map.has(LIVE_COUNTS_STORAGE_KEY)).toBe(true);
    __resetLiveCountsForTests({ storage: () => store, now: () => clock });
    expect(liveCountDelta(liveCounts(), key)).toBe(0);
    loadLiveCounts();
    expect(liveCountDelta(liveCounts(), key)).toBe(1);
  });

  it("counts for nothing once every cache has turned over", () => {
    const key = liveCountKey("endorsed", "kettleworks");
    bumpLiveCount(key, 1);
    clock += LIVE_COUNT_TTL_MS - 1;
    expect(liveCountDelta(liveCounts(), key)).toBe(1);
    clock += 1;
    expect(liveCountDelta(liveCounts(), key)).toBe(0);
    // And the next write sweeps it out of storage.
    bumpLiveCount(liveCountKey("endorsed", "other"), 1);
    expect(liveCounts()[key]).toBeUndefined();
  });

  it("ignores a storage entry it does not understand", () => {
    store.setItem(LIVE_COUNTS_STORAGE_KEY, JSON.stringify({ "endorsed:x": { delta: "1" }, junk: 3 }));
    loadLiveCounts();
    expect(liveCounts()).toEqual({});
  });

  it("is long enough for the API's and the page's minute each, with room", () => {
    expect(LIVE_COUNT_TTL_MS).toBeGreaterThanOrEqual(2 * 60 * 1000);
    expect(LIVE_COUNT_TTL_MS).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});

describe("the toggle reads its delta from here, not from component state", () => {
  const source = readFileSync(resolve(APP, "ui/use-toggle.ts"), "utf-8");

  it("bumps the shared count on the optimistic step and undoes it the same way", () => {
    expect(source).toContain("bumpLiveCount(countKey, step)");
    expect(source).toContain("bumpLiveCount(countKey, -step)");
    expect(source).not.toContain("setDelta");
  });

  it("subscribes through useSyncExternalStore and loads storage after mount", () => {
    expect(source).toContain("useSyncExternalStore(subscribeLiveCounts, liveCounts, emptyLiveCounts)");
    expect(source).toContain("loadLiveCounts()");
    expect(source).toContain("liveCountDelta(counts, countKey)");
  });

  it("keys the count by the overlay list and the act's own key", () => {
    expect(source).toContain("liveCountKey(list, key)");
  });
});
