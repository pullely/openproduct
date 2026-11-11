// Everything one request owns (openproduct-performance OPP6, OPP10).
//
// Two things now happen per request that used to happen nowhere: its
// statements are timed, and the client they ran on is closed. Both are
// per-request facts, both are needed at the same sixteen call sites, and
// threading two parameters through five routing helpers to carry them would be
// two chances to thread one and forget the other.
//
// So there is one object, and `repoFor` takes it.

import { startRequestTimings, type RequestTimings } from "./timing.js";

export interface RequestScope extends RequestTimings {
  /** Register work to run once the response is out. */
  onDispose(fn: () => Promise<void>): void;
  /**
   * Every registered close, run together and never allowed to throw.
   *
   * A failed `dispose()` must not become a 500 on a request that already
   * answered correctly: the response has been sent by the time this runs, and
   * the only honest thing left to do with the error is not make it somebody's
   * outage.
   */
  disposeAll(): Promise<void>;
}

export function startRequestScope(now?: () => number): RequestScope {
  const timings = startRequestTimings(now);
  const disposals: Array<() => Promise<void>> = [];
  return {
    ...timings,
    onDispose(fn) {
      disposals.push(fn);
    },
    async disposeAll() {
      await Promise.allSettled(disposals.map((fn) => fn()));
    },
  };
}
