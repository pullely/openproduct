// What a request reports about its own cost (openproduct-performance OPP6).
//
// `http.ts` has exported `withTimings` since the OX6a vendoring, and until now
// NO FILE CALLED IT. The helper, the `Server-Timing` header it renders and the
// sampled log line behind it were all present and all dead, so every openproduct
// response left with no timing on it at all and every number in the epic's
// measurement record had to come from a harness rather than from production.
//
// ─── THE PHASES, AND WHY THESE THREE ──────────────────────────────────────
//
//   db       cumulative statement time, summed across every query the request
//            ran, plus a count.
//   dbspan   the WALL CLOCK the same statements occupied — first one starting
//            to last one finishing. See below; this is the phase that turns an
//            inference into a reading.
//   handler  everything else the worker did — assembling the projection,
//            ordering, the contract's pure functions.
//   total    the whole `fetch`, measured from its first line.
//
// ─── WHY `dbspan` EXISTS, AND WHAT IT SETTLED ─────────────────────────────
//
// `db` alone cannot tell four reads in parallel from four in sequence: both
// sum the same. This file used to say the gap between `db` and `total` was
// that difference, which is an INFERENCE and one that only holds when the
// handler does nothing else. `dbspan` measures it instead:
//
//   dbspan ≈ db          the statements ran one after another
//   dbspan ≪ db          they overlapped, and `db / dbspan` is how much
//   total − dbspan       what the worker itself cost, with no DB in it
//
// IT COSTS NOTHING EXTRA TO COLLECT. The executor already reports each
// statement's duration when it completes; the end is therefore `now()` at that
// moment and the start is `end - duration`. So the span is the earliest start
// to the latest end, and no call site or observer signature changes.
//
// THE MEASUREMENT THAT ASKED FOR IT (2026-09-09, prod, via the gateway):
//
//   /v1/facets        0 queries   db=0      core=0      total=37
//   /v1/leaderboard   1 query     db=524    core=524
//   /v1/products      3 queries   db=1542   core=1036
//   /v1/sidebar       6 queries   db=4006   core=1008
//   /v1/transparency  6 queries   db=4563   core=1026
//
// A request that asks the database nothing costs 37 ms end to end; every one
// that asks it anything costs 500-760 ms PER STATEMENT. So the public API's
// latency is database time and nothing else — core's own compute rounds to
// zero. What `db` and `core` together cannot say is whether that per-statement
// cost is a round trip or the query itself, and D4 (Smart Placement) and
// OPP10's index question have opposite answers depending on which. `dbspan`
// is what distinguishes them without a guess.
//
// ─── MEASURED FROM THE FIRST LINE, WHICH IS THE WHOLE LESSON ──────────────
//
// PERF4 shipped `Server-Timing` on the platform with the clock started INSIDE
// the handler, and the ~264ms rate-limiter gate that turned out to be most of
// the request sat in none of the phases. It stayed invisible for six days and
// was found by a separate measurement, not by the instrumentation built to
// find it. So `total` here starts at the top of `route()`, before dispatch,
// before the repository exists, and `handler` is derived by subtraction rather
// than measured — a phase that is computed as "what is left" cannot have a gap
// hiding in it.

import { createTimings, type Timings } from "@openproduct/contracts/timing";

export interface RequestTimings {
  /** Told the elapsed time of one statement, as soon as it completes. */
  query(durationMs: number): void;
  /** Close `total`, derive `handler`, and hand back the renderable phases. */
  finish(): Timings;
}

export function startRequestTimings(now: () => number = () => Date.now()): RequestTimings {
  const timings = createTimings(now);
  const startedAt = now();
  let dbMs = 0;
  let queries = 0;
  // The span's edges, in absolute time. `null` until a statement reports, so
  // "no queries" is distinguishable from "a span of zero".
  let firstStart: number | null = null;
  let lastEnd: number | null = null;

  return {
    query(durationMs) {
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      dbMs += durationMs;
      queries += 1;
      // Reported AT COMPLETION, so this instant is the statement's end and its
      // start is that instant less its duration. Reconstructed rather than
      // passed, which is what keeps the observer's signature — and every call
      // site of it — unchanged.
      const end = now();
      const start = end - durationMs;
      if (firstStart === null || start < firstStart) firstStart = start;
      if (lastEnd === null || end > lastEnd) lastEnd = end;
    },
    finish() {
      const total = now() - startedAt;
      // `db` first, because it is the phase an operator reads first. The count
      // rides in `desc` rather than as a fourth phase: it is not a duration,
      // and a `Server-Timing` entry whose `dur` means "queries" would be read
      // as milliseconds by every tool that consumes this header.
      timings.add("db", dbMs, queries === 1 ? "1 query" : `${queries} queries`);
      // Only when there was something to span. A `dbspan;dur=0` on a request
      // that made no query reads as "the database answered instantly", which
      // is the opposite of true and exactly the kind of number that gets
      // averaged into a dashboard.
      if (firstStart !== null && lastEnd !== null) {
        timings.add("dbspan", Math.max(0, lastEnd - firstStart));
      }
      // Never negative: the clock can move, and a phase reading `-3` teaches a
      // reader to distrust the whole header.
      timings.add("handler", Math.max(0, total - dbMs));
      timings.add("total", total);
      return timings;
    },
  };
}
