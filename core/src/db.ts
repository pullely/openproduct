// One place a request gets its repository (openproduct-performance OPP6).
//
// `router.ts` built one inline at seventeen call sites —
// `createOpenproductRepository(createSqlExecutor(env.PLATFORM_DB!))` — which
// was fine while nothing else needed to happen per request. Two things do now,
// and both are the kind that must happen at ALL seventeen or at none:
//
//   OPP6   the statements a request runs are timed, so `Server-Timing` can say
//          `db` rather than leaving the whole request as one opaque number.
//   OPP10  the executor is DISPOSED when the request ends. `createSqlExecutor`
//          has always returned a `dispose()`, and nothing in
//          `apps/openproduct/**` had ever called it — so every request opened a
//          client and walked away from it, leaving the socket to whatever the
//          isolate did next. That is the other half of the lesson PERF3 paid
//          for: cross-request reuse is forbidden, so a per-request client is
//          right, and a per-request client needs a real close.
//
// Seventeen copies of a thing that must be identical is a place where one copy
// eventually is not. So the copies became a call.
//
// WHAT THIS IS NOT. It is not a shared or cached executor. Cross-request reuse
// is forbidden on Workers — the platform shipped it once (PERF3), stage
// answered `Cannot perform I/O on behalf of a different request`, and it was
// reverted. Every call here makes a NEW executor for the request that asked,
// exactly as the seventeen inline copies did.

import { createOpenproductRepository, type OpenproductRepository } from "@openproduct/db";
import { createSqlExecutor } from "@openproduct/db/executor";

import type { Env } from "./env.js";
import type { RequestScope } from "./request.js";

/**
 * The repository for one request, with its statements timed.
 *
 * `timings` is optional so a caller that has none — a test, a path that runs
 * outside `route()` — behaves exactly as before rather than having to invent
 * one.
 */
export function repoFor(env: Env, scope?: RequestScope): OpenproductRepository {
  const executor = createSqlExecutor(
    env.PLATFORM_DB!,
    undefined,
    scope ? { onQuery: (ms) => scope.query(ms) } : undefined,
  );
  // AFTER the response, never before it. Closing a pooled client costs a round
  // trip of its own, and a visitor should not wait for a connection they have
  // finished with — `route()` hands these to `ctx.waitUntil`.
  scope?.onDispose(() => executor.dispose());
  return createOpenproductRepository(executor);
}
