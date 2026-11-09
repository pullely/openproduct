// What one request owns, and gives back (openproduct-performance OPP6, OPP10).
//
// `createSqlExecutor` has always returned a `dispose()`, and until OPP10
// nothing in `apps/openproduct/**` called it: every request opened a client and
// walked away from it. That is the other half of the lesson PERF3 paid for on
// the platform — cross-request reuse is forbidden on Workers, so a per-request
// client is right, and a per-request client needs a real close.

import { startRequestScope } from "@openproduct-worker/request";

describe("the request scope", () => {
  it("runs every registered close", async () => {
    const scope = startRequestScope();
    const closed: string[] = [];
    scope.onDispose(async () => {
      closed.push("a");
    });
    scope.onDispose(async () => {
      closed.push("b");
    });
    expect(closed).toEqual([]);
    await scope.disposeAll();
    expect(closed.sort()).toEqual(["a", "b"]);
  });

  it("does not let a failed close become somebody's outage", async () => {
    // The response has already been sent by the time this runs. A `dispose()`
    // that throws is worth a log line at most; it is not worth turning a
    // request that answered correctly into a 500, and it must not stop the
    // OTHER clients being closed.
    const scope = startRequestScope();
    let second = false;
    scope.onDispose(async () => {
      throw new Error("socket already gone");
    });
    scope.onDispose(async () => {
      second = true;
    });
    await expect(scope.disposeAll()).resolves.toBeUndefined();
    expect(second).toBe(true);
  });

  it("is still a timer — the two facts a request owns travel together", async () => {
    // One object rather than two threaded parameters, because both are needed
    // at the same sixteen call sites and threading two is two chances to
    // thread one and forget the other.
    let t = 0;
    const scope = startRequestScope(() => t);
    t = 10;
    scope.query(4);
    const phases = scope.finish().toJSON();
    expect(phases.db).toBe(4);
    expect(phases.total).toBe(10);
    expect(phases.handler).toBe(6);
  });

  it("closes nothing twice, however many times it is asked", async () => {
    const scope = startRequestScope();
    let calls = 0;
    scope.onDispose(async () => {
      calls += 1;
    });
    await scope.disposeAll();
    expect(calls).toBe(1);
  });
});
