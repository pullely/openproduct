// openproduct-synthetic — the reader of /health (openproduct-operations OO1).
//
// `/health` was a document nobody fetched. This worker fetches it every five
// minutes, on its own schedule in its own worker (OO-1), as an anonymous
// visitor (OO-4), and judges the three promises OO0 wrote down. It remembers
// what it last saw in its own Durable Object, and when a promise FLIPS —
// from holding to not, or back — it says so: a line in the vocabulary that
// the saved queries find, and, once OO-A names a channel, an alert over the
// seam carrying the runbook line (OO-3).
//
// What it does not do: hold a binding to anything it watches; carry a
// session; page anybody about a threshold nobody agreed to route; or alert
// on a promise that is still broken five minutes after it said so.

import type { Env } from "./env.js";
import { deliverAlert, deliverDeployAlert, type AlertOutcome } from "./alert.js";
import { judge } from "./slo.js";
import { EMPTY_STATE, applyCycle, type Applied, type CycleInput, type StateDocument } from "./state.js";
import { walk } from "./walk.js";

export { SyntheticState } from "./state.js";

/** The one object's name: every cycle reads and writes the same row. */
const STATE_NAME = "state";

/**
 * Where no object is bound — a test, `wrangler dev` without the class — the
 * state lives in this isolate and the cycle still runs; it simply forgets on
 * eviction, which for a synthetic means a flip it already reported may be
 * reported again. Absent is a configuration, and the production config binds
 * the object in every environment (`config.test.ts` holds it to that).
 */
let localState: StateDocument = EMPTY_STATE;

async function record(env: Pick<Env, "SYNTHETIC_STATE">, input: CycleInput): Promise<Applied> {
  const namespace = env.SYNTHETIC_STATE;
  if (!namespace) {
    const applied = applyCycle(localState, input);
    localState = applied.state;
    return applied;
  }
  const stub = namespace.get(namespace.idFromName(STATE_NAME));
  const res = await stub.fetch("https://synthetic.internal/record", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`state object answered ${res.status}`);
  return (await res.json()) as Applied;
}

async function readState(env: Pick<Env, "SYNTHETIC_STATE">): Promise<StateDocument> {
  const namespace = env.SYNTHETIC_STATE;
  if (!namespace) return localState;
  const stub = namespace.get(namespace.idFromName(STATE_NAME));
  const res = await stub.fetch("https://synthetic.internal/");
  if (!res.ok) throw new Error(`state object answered ${res.status}`);
  return (await res.json()) as StateDocument;
}

export interface CycleReport {
  readonly state: StateDocument;
  readonly flips: Applied["flips"];
  readonly cacheStatus: string | null;
  readonly durationMs: number;
}

async function sayUndeliverable(outcome: AlertOutcome, slo: string): Promise<void> {
  if (outcome.sent) return;
  console.warn(JSON.stringify({ level: "warn", msg: "alert_undeliverable", slo, reason: outcome.reason }));
}

/** One cycle: walk, judge, remember, and say what changed. */
export async function runCycle(env: Env, fetchImpl: typeof fetch, now: Date): Promise<CycleReport> {
  const observation = await walk(env, fetchImpl, () => Date.now());
  const judged = judge(observation, now);
  const phases = observation.health.phases ?? {};
  const phaseRuns: Partial<Record<keyof typeof phases, string | null>> = {};
  for (const [phase, seen] of Object.entries(phases)) phaseRuns[phase as keyof typeof phases] = seen?.lastRunAt ?? null;
  const applied = await record(env, {
    at: now.toISOString(),
    verdicts: judged.verdicts,
    cacheSample: judged.cacheSample,
    frontReachable: judged.frontReachable,
    build: observation.health.build,
    phaseRuns,
    // OO3 — RS4's four, re-walked: null as a whole when the product could
    // not be asked, so an outage is `unreachable` and not a failed deploy.
    walk:
      observation.health.reachable && observation.front.reachable
        ? {
            upvoteGate: observation.rs4.upvoteGate,
            signinOwned: observation.rs4.signinOwned,
            frontTitled: observation.front.titled,
            searchAnswers: observation.seeded.slug === null ? true : observation.search.found,
          }
        : null,
  });

  for (const flip of applied.flips) {
    const runbook = flip.state === "breached" ? (flip.mode ?? "unreachable") : (applied.state.slos[flip.slo].mode ?? "recovered");
    if (flip.state === "breached") {
      console.warn(JSON.stringify({ level: "warn", msg: "slo_breached", slo: flip.slo, mode: flip.mode, runbook }));
    } else {
      // eslint-disable-next-line no-console -- structured recovery line for the saved queries (OO2)
      console.log(JSON.stringify({ level: "info", msg: "slo_recovered", slo: flip.slo, runbook }));
    }
    await sayUndeliverable(await deliverAlert(env, fetchImpl, flip, now), flip.slo);
  }

  // OO3 — every deploy verifies itself, and says so once either way.
  for (const event of applied.deployEvents) {
    if (event.kind === "noticed") {
      // eslint-disable-next-line no-console -- structured deploy line for the saved queries (OO2)
      console.log(JSON.stringify({ level: "info", msg: "deploy_noticed", version: event.version }));
    } else if (event.kind === "verified") {
      // eslint-disable-next-line no-console -- structured deploy line for the saved queries (OO2)
      console.log(JSON.stringify({ level: "info", msg: "deploy_verified", version: event.version, afterMs: event.afterMs }));
      if (event.wasReported) {
        await sayUndeliverable(await deliverDeployAlert(env, fetchImpl, { version: event.version, state: "recovered", reason: null }, now), "deploy");
      }
    } else {
      console.warn(JSON.stringify({ level: "warn", msg: "deploy_unverified", version: event.version, reason: event.reason }));
      await sayUndeliverable(await deliverDeployAlert(env, fetchImpl, { version: event.version, state: "breached", reason: event.reason }, now), "deploy");
    }
  }

  const holding = Object.values(applied.state.slos).filter((r) => r.holding === true).length;
  const cacheStatus = observation.front.cacheStatus;
  const durationMs = observation.durationMs;
  // eslint-disable-next-line no-console -- structured cycle line for the saved queries (OO2)
  console.log(JSON.stringify({ level: "info", msg: "synthetic_cycle", holding, cacheStatus, durationMs }));

  return { state: applied.state, flips: applied.flips, cacheStatus, durationMs };
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCycle(env, fetch, new Date()));
  },

  /**
   * The synthetic's own document: what it last saw. Anonymous and
   * uncacheable, like the `/health` it reads — a cached "holding" would be
   * the outage this worker exists to notice, one level up again. Nothing
   * personal is in it: three booleans, some timestamps, a dozen cache words.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET") return new Response("method not allowed", { status: 405 });
    if (url.pathname === "/") {
      return Response.json(
        { service: "openproduct-synthetic", environment: env.ENVIRONMENT ?? "local", state: await readState(env) },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return new Response("not found", { status: 404, headers: { "cache-control": "no-store" } });
  },
};
