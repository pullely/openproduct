// The gateway's half of the breakdown (openproduct-performance OPP6).
//
// Core measures itself (`core/src/timing.ts`) and answers with `db`, `handler`
// and `total`. That header dies at this worker unless somebody carries it: the
// public branch builds a FRESH `Response` around the downstream body, which is
// right — core's own 404 names an internal path and this surface passes no
// downstream header through by accident — and it means the timing has to be
// forwarded deliberately, like the `cache-control` beside it.
//
// ─── `total` ALWAYS MEANS THE WHOLE WAIT ──────────────────────────────────
//
// Core calls its own span `total`, which is true inside core and misleading
// once a second hop exists. So this renames on the way out:
//
//   db        core's, unchanged — cumulative statement time, with the count
//   handler   core's, unchanged — what core did that was not a query
//   core      what core's `total` said
//   edge      this worker's time minus core's — the gate, the routing
//             decision, the subrequest, and (once OPP4 lands) the cache lookup
//   total     the whole gateway fetch: what the caller actually waited for
//
// Read left to right, `db + handler = core` and `core + edge = total`, so a
// number that does not add up is itself the finding. That is the property
// PERF4's platform instrumentation LACKED — its phases summed to well under
// its total, and the ~264ms sitting in the gap was the rate limiter, invisible
// for six days.

import {
  appendServerTiming,
  parseServerTimingDuration,
} from "@openproduct/contracts/timing";

/**
 * Attach this worker's timing to a response, folding in core's if it came
 * with one.
 *
 * Returns the SAME response object — the header set of a streaming body is
 * still mutable, and rebuilding the response here would mean copying every
 * header this layer deliberately decided on.
 */
export function withGatewayTiming(response: Response, startedAt: number): Response {
  const total = Date.now() - startedAt;
  const fromCore = response.headers.get("server-timing");
  const core = parseServerTimingDuration(fromCore, "total");

  // Core's phases, minus the `total` that is about to mean something else.
  const carried = (fromCore ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^total;/.test(part))
    .join(", ");

  let header = carried;
  if (core !== null) {
    header = appendServerTiming(header, `core;dur=${core}`);
    // Never negative. The two clocks are the same clock here, but a phase
    // reading `-2` teaches a reader to distrust the whole header.
    header = appendServerTiming(header, `edge;dur=${Math.max(0, total - core)}`);
  }
  header = appendServerTiming(header, `total;dur=${total}`);
  response.headers.set("Server-Timing", header);
  return response;
}
