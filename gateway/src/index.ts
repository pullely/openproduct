// openproduct-gateway — the product's own front door (OX3).

import { sweepModeForCron } from "@openproduct/contracts";

import type { Env } from "./env.js";
import { applyCorsHeaders, handlePreflight } from "./cors.js";
import { route } from "./router.js";
import { withGatewayTiming } from "./timing.js";
import { runSweep, type SweepResult } from "./sweep.js";
import { purgeTags, purgeTagsForSweep } from "./tags.js";

// CS1 — the rate-limit counter. A Durable Object class has to be exported
// from the worker's entry module for `wrangler.jsonc`'s binding to find it;
// this line is that, and `bindings.test.ts` asserts it is here.
export { RateLimitBucket } from "./ratelimit.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // FIRST LINE. PERF4 started the platform's clock inside the handler and
    // the gate that turned out to be most of the request sat in none of the
    // phases (openproduct-performance OPP6).
    const startedAt = Date.now();
    const preflight = handlePreflight(request, env);
    // A preflight is answered from a table and never reaches core; timing it
    // would add a phase to every OPTIONS and say nothing.
    if (preflight) return preflight;
    // OPP14 — `ctx` rides along so a discussion write can purge what it
    // changed after answering (`purgeTagsForWrite`).
    const response = await route(request, env, { ctx });
    return withGatewayTiming(applyCorsHeaders(response, request, env), startedAt);
  },

  /**
   * The sweep — TWO schedules doing two different kinds of work
   * (openproduct-commons SN1, split at openproduct-worldclass RS2).
   *
   * INGESTION reaches outward, and every careful thing about it is careful
   * for that reason: on a schedule rather than on a request, because
   * observing a repository is not something a visitor should be able to
   * trigger — a page view that causes an outbound fetch is a page view
   * somebody can weaponise into one. Hourly, because the unauthenticated
   * GitHub ceiling is what affords it.
   *
   * MATERIALISATION reaches inward — the index, the counts, the launches, the
   * boards, the defence sweep and the digest — and leaves the estate nowhere.
   * Every ten minutes, in every environment that serves traffic, and NOT
   * optional: its absence is what the 7 Sep audit measured as an empty
   * search, a dash on every row, a blank leaderboard and a digest announcing
   * that nothing had launched.
   *
   * Which one a firing means is decided by WHICH CRON FIRED, mapped in
   * `contracts/sweep-schedule.ts` so that the expression in wrangler and the
   * branch here cannot drift apart unnoticed. An unrecognised expression runs
   * materialisation: a cron nobody recognises must never be able to start
   * reaching out to the internet on a schedule nobody chose.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runSweep(env, new Date(event.scheduledTime), fetch, sweepModeForCron(event.cron)).then(
        (result) => purgeChangedFamilies(ctx, result),
      ),
    );
  },
};

/**
 * Hand the sweep's own account of what it changed to the cache (OPP4a).
 *
 * THE SWEEP SAYS WHAT IT CHANGED; THIS TRANSLATES THAT INTO A PURGE. The
 * coupling is deliberately one-way — `runSweep` does not know a cache exists,
 * takes no `ctx`, and its two hundred lines of test do not change. It returns a
 * `SweepResult` and this reads it.
 *
 * `ctx.cache` is OPTIONAL IN THE RUNTIME TYPES, and the guard is not
 * defensive noise: a runtime without Workers Caching (a `wrangler dev` on an
 * older compatibility date, a test harness, this feature being turned off in
 * `wrangler.jsonc`) leaves it undefined, and a sweep that threw on its way out
 * because the cache was absent would take the product's only schedule with it.
 * The sweep's work is the important half; the purge is an optimisation on top
 * of a sixty-second TTL that is already correct without it.
 */
async function purgeChangedFamilies(ctx: ExecutionContext, result: SweepResult): Promise<void> {
  await purgeTags(ctx, purgeTagsForSweep(result));
}
