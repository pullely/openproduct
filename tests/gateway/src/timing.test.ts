// The gateway's half of the breakdown (openproduct-performance OPP6).
//
// Core answers with `db`, `handler` and `total`; that header dies at this
// worker unless somebody carries it, because the public branch builds a fresh
// Response so that no downstream header travels by accident. What is pinned
// here is the renaming that makes two hops readable as one line:
//
//   db + handler = core,  core + edge = total
//
// A header whose phases do not add up is itself the finding — PERF4's platform
// instrumentation summed to well under its own total, and the ~264ms sitting
// in that gap was the rate limiter, invisible for six days.

import { withGatewayTiming } from "@openproduct-gateway/timing";

/** Freeze the clock so a phase is what the test says it is. */
function at(ms: number): () => void {
  const real = Date.now;
  Date.now = () => ms;
  return () => {
    Date.now = real;
  };
}

function phases(response: Response): Record<string, number> {
  const header = response.headers.get("Server-Timing") ?? "";
  const out: Record<string, number> = {};
  for (const part of header.split(",")) {
    const match = /^\s*([A-Za-z0-9_]+);dur=([\d.]+)/.exec(part);
    if (match?.[1] && match[2]) out[match[1]] = Number(match[2]);
  }
  return out;
}

describe("two hops, one header", () => {
  it("renames core's `total` and derives `edge`, so the phases add up", () => {
    const response = new Response(null, {
      headers: { "Server-Timing": 'db;dur=18;desc="3 queries", handler;dur=7, total;dur=25' },
    });
    const restore = at(1_100);
    const out = phases(withGatewayTiming(response, 1_060));
    restore();

    // Core's own phases survive untouched.
    expect(out.db).toBe(18);
    expect(out.handler).toBe(7);
    // Its `total` becomes `core`, because `total` must always mean the whole
    // wait — true inside core, misleading once a second hop exists.
    expect(out.core).toBe(25);
    expect(out.edge).toBe(15);
    expect(out.total).toBe(40);
    expect((out.core ?? 0) + (out.edge ?? 0)).toBe(out.total);
    expect((out.db ?? 0) + (out.handler ?? 0)).toBe(out.core);
  });

  it("keeps core's `desc`, so the query count survives the hop", () => {
    const response = new Response(null, {
      headers: { "Server-Timing": 'db;dur=4;desc="2 queries", total;dur=9' },
    });
    const restore = at(1_020);
    const header = withGatewayTiming(response, 1_000).headers.get("Server-Timing") ?? "";
    restore();
    expect(header).toContain('desc="2 queries"');
  });

  it("still reports itself when core said nothing", () => {
    // A 404 decided at the gateway, a seam receiver, `/health` — nothing
    // downstream ran. The answer is one honest phase, not an invented `core`.
    const restore = at(1_007);
    const out = phases(withGatewayTiming(new Response(null), 1_000));
    restore();
    expect(out.total).toBe(7);
    expect(out.core).toBeUndefined();
    expect(out.edge).toBeUndefined();
  });

  it("never renders a negative edge", () => {
    // Two clocks, or one that moved. A phase reading `-3` teaches a reader to
    // distrust the whole header.
    const response = new Response(null, { headers: { "Server-Timing": "total;dur=99" } });
    const restore = at(1_005);
    const out = phases(withGatewayTiming(response, 1_000));
    restore();
    expect(out.edge).toBe(0);
  });
});

// ─── The carry is a PASS-THROUGH, not an allowlist (OPP6, 2026-09-09) ──────
//
// `withGatewayTiming` forwards every phase core sent except `total`, which it
// renames. That is what lets core gain a phase without this file being touched
// — and `dbspan` was added on exactly that assumption, so it is asserted here
// rather than left as a property somebody has to notice.
//
// The failure it guards is quiet: swapping the filter for an allowlist of the
// phases that existed on the day would keep every test green, keep the header
// well-formed, and silently drop the new instrument in transit. The measurement
// would then read as "core reports no span", which is indistinguishable from
// "core made no query".

describe("core's phases are carried, whatever they are called", () => {
  it("forwards a phase this file has never heard of", () => {
    const upstream = new Response("{}", {
      headers: {
        "server-timing": 'db;dur=1542;desc="3 queries", dbspan;dur=1010, handler;dur=4, total;dur=1036',
      },
    });
    const out = withGatewayTiming(upstream, Date.now() - 1100);
    const header = out.headers.get("Server-Timing") ?? "";
    expect(header).toContain("dbspan;dur=1010");
    // And the phases it does know are still there, still core's own numbers.
    expect(header).toContain('db;dur=1542;desc="3 queries"');
    expect(header).toContain("handler;dur=4");
    // Core's `total` became `core`, so the word `total` appears once and means
    // the gateway's own span.
    expect(header).toContain("core;dur=1036");
    expect(header.match(/(^|[\s,])total;/g)?.length).toBe(1);
  });
});
