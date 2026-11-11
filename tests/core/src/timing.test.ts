// What a request reports about its own cost (openproduct-performance OPP6).
//
// `withTimings` and the whole vendored timing helper had been present and
// UNCALLED since OX6a: every openproduct response left with no timing on it,
// and every number in the epic's measurement record had to come from a harness
// rather than from production. These pin the shape that replaced that, and one
// property in particular — that the phases ADD UP, which is the thing PERF4's
// platform instrumentation could not claim and the reason a 264ms rate limiter
// hid in its gap for six days.

import { startRequestTimings } from "@openproduct-worker/timing";

/** A clock the test drives, so nothing here depends on how fast it runs. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("the phases", () => {
  it("adds up: db + handler = total", () => {
    const c = clock();
    const timings = startRequestTimings(c.now);
    c.advance(30);
    timings.query(12);
    timings.query(8);
    c.advance(10);
    const phases = timings.finish().toJSON();

    expect(phases.db).toBe(20);
    expect(phases.total).toBe(40);
    // The property. A phase that is DERIVED by subtraction cannot have a gap
    // hiding in it, which is exactly what measuring it directly allowed on the
    // platform.
    expect(phases.handler).toBe(20);
    expect((phases.db ?? 0) + (phases.handler ?? 0)).toBe(phases.total);
  });

  it("counts the queries, and says so in words rather than as a duration", () => {
    const c = clock();
    const one = startRequestTimings(c.now);
    one.query(5);
    expect(one.finish().header()).toContain('desc="1 query"');

    const many = startRequestTimings(c.now);
    many.query(1);
    many.query(2);
    many.query(3);
    const header = many.finish().header();
    // The count rides in `desc`, never as a fourth phase: a `Server-Timing`
    // entry whose `dur` meant "queries" would be read as milliseconds by
    // every tool that consumes this header.
    expect(header).toContain('desc="3 queries"');
    expect(header).toContain("db;dur=6");
    expect(header).not.toMatch(/queries;dur=/);
  });

  it("reports a request that ran no query at all, rather than omitting db", () => {
    // `/health` and every 404. A missing phase and a zero phase read very
    // differently on a dashboard: one is "we did not measure", the other is
    // "we measured and it was none".
    const c = clock();
    const timings = startRequestTimings(c.now);
    c.advance(3);
    const phases = timings.finish().toJSON();
    expect(phases.db).toBe(0);
    expect(phases.handler).toBe(3);
  });

  it("never renders a negative phase, however the clock behaves", () => {
    // Two clocks, or one clock that moved. A phase reading `-2` teaches a
    // reader to distrust the whole header, so the arithmetic is floored.
    const c = clock();
    const timings = startRequestTimings(c.now);
    timings.query(500); // longer than the request, which cannot really happen
    const phases = timings.finish().toJSON();
    expect(phases.handler).toBe(0);
    expect(phases.total).toBe(0);
  });

  it("ignores a duration that is not one", () => {
    const c = clock();
    const timings = startRequestTimings(c.now);
    timings.query(Number.NaN);
    timings.query(-5);
    timings.query(10);
    expect(timings.finish().toJSON().db).toBe(10);
  });
});

// ─── `dbspan` — the phase that stops the parallel/serial question being an
//     inference (openproduct-performance OPP6, added 2026-09-09) ───────────
//
// `db` sums statement time and cannot tell four reads in parallel from four in
// sequence: both add to the same number. The header above used to say the gap
// between `db` and `total` was that difference, which holds only when the
// handler does nothing else — an inference, and one this file is the wrong
// place to be making.
//
// The production measurement that asked for it, taken through the gateway:
// `/v1/facets` runs no query and costs 37 ms end to end, while every endpoint
// that runs one costs 500-760 ms PER STATEMENT. So the public API's latency is
// database time and nothing else. Whether that per-statement cost is a ROUND
// TRIP or the QUERY decides between two opposite fixes — Smart Placement (D4)
// or indexes (OPP10) — and `dbspan` is what tells them apart.

describe("dbspan — parallel or serial, read rather than inferred", () => {
  it("equals db when the statements ran one after another", () => {
    const c = clock();
    const t = startRequestTimings(c.now);
    // Serial: each statement's start is the previous one's end.
    c.advance(100);
    t.query(100);
    c.advance(100);
    t.query(100);
    const phases = t.finish().toJSON();
    expect(phases.db).toBe(200);
    expect(phases.dbspan).toBe(200);
  });

  it("is far below db when they overlapped, and the ratio is the concurrency", () => {
    const c = clock();
    const t = startRequestTimings(c.now);
    // Three statements issued together and completing together: each reports
    // 100ms, and all three finish at the same instant.
    c.advance(100);
    t.query(100);
    t.query(100);
    t.query(100);
    const phases = t.finish().toJSON();
    expect(phases.db).toBe(300);
    expect(phases.dbspan).toBe(100);
    // db / dbspan = 3 — which IS the number of statements that overlapped, and
    // the reading `db` alone cannot produce.
    expect((phases.db ?? 0) / (phases.dbspan ?? 1)).toBe(3);
  });

  it("spans from the EARLIEST start to the LATEST end, not the first to the last reported", () => {
    const c = clock();
    const t = startRequestTimings(c.now);
    // A long statement started first but reported second, which is the normal
    // case for concurrent reads: completion order is not start order. A span
    // that took the first REPORT as its start would read 50 instead of 200.
    c.advance(200);
    t.query(50); // started at 1150, ended 1200
    t.query(200); // started at 1000, ended 1200 — the earlier start
    const phases = t.finish().toJSON();
    expect(phases.dbspan).toBe(200);
  });

  it("is ABSENT on a request that asked the database nothing", () => {
    // Not zero. `dbspan;dur=0` reads as "the database answered instantly",
    // which is the opposite of true and exactly the kind of number that gets
    // averaged into a dashboard.
    const c = clock();
    const t = startRequestTimings(c.now);
    c.advance(37);
    const phases = t.finish().toJSON();
    expect(phases.dbspan).toBeUndefined();
    expect(phases.db).toBe(0);
    expect(t.finish().header()).not.toContain("dbspan");
  });

  it("never reports a negative span when the clock moves under it", () => {
    const c = clock();
    const t = startRequestTimings(c.now);
    t.query(500); // start reconstructed as 500ms BEFORE the request began
    const phases = t.finish().toJSON();
    expect(phases.dbspan).toBeGreaterThanOrEqual(0);
  });
});
