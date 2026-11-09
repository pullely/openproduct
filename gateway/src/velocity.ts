// Velocity enforcement, at the door (openproduct-commons TS2).
//
// WHY THE GATEWAY AND NOT THE HANDLER. TS2's done-when is that a synthetic
// flood is refused and NEVER REACHES A HANDLER, and that is a claim about
// where the check sits rather than about what it does. A limit inside
// `handleEndorse` still costs a service-binding hop, a database connection
// and a transaction per refused request — which is exactly the resource a
// flood is trying to spend. Refusing here spends a map lookup.
//
// It is also the only place that CAN refuse uniformly. Every write on the
// authenticated plane passes through one function; a per-handler limit is a
// rule seven handlers have to remember, and the eighth handler is the hole.
//
// APPROXIMATE BY CONSTRUCTION, AND THAT IS SAID OUT LOUD. These are
// per-isolate counters, as `ratelimit.ts`'s were before CS1, so a request landing on a cold
// isolate starts with a full allowance. What that means concretely: the real
// ceiling is the configured limit multiplied by however many isolates
// Cloudflare has warm, which is a number nobody here controls.
//
// It is still worth having, for a reason worth being precise about: the
// attack this refuses is a script, and a script's requests land on a handful
// of isolates because they come from a handful of places. The attack it does
// NOT refuse is a distributed one, and no per-isolate counter ever will —
// that wants a Durable Object, which `ratelimit.ts` now has (CS1) and this
// limiter can share when traffic earns it. Shipping
// the approximate version now is what lets EN2 and CB1 through the OPC-8
// gate with the honest note attached, rather than blocking them on
// infrastructure nobody needs yet.

import {
  DEFAULT_VELOCITY_RULES,
  GENERIC_REFUSAL,
  parseVelocityConfig,
  type VelocityRule,
  type WriteAction,
} from "@openproduct/contracts";

import type { Env } from "./env.js";

interface Counter {
  /** Timestamps of the actions inside the longest window we care about. */
  hits: number[];
}

/**
 * The counters, keyed by `action:dimension:key`.
 *
 * A SLIDING LOG rather than a token bucket, unlike `ratelimit.ts`. The
 * difference matters for exactly one property TS2 needs: a bucket refilling
 * continuously cannot express "twelve a minute AND three hundred a day"
 * without two buckets whose refill rates disagree about what a day is. A log
 * of timestamps answers both windows from one list, and the list is bounded
 * by the larger limit rather than by time.
 */
const counters = new Map<string, Counter>();

/** The classic in-memory-limiter leak is unbounded key growth. */
const MAX_KEYS = 20_000;

export interface VelocityRefusal {
  readonly action: WriteAction;
  readonly dimension: string;
  /** Which window tripped — for the log, and for `Retry-After`. */
  readonly window: "burst" | "sustained";
  readonly limit: number;
  readonly windowSec: number;
  /** What the person is told. */
  readonly message: string;
  /** Seconds until the oldest hit in the tripped window falls out of it. */
  readonly retryAfterSec: number;
}

/**
 * The effective rules, resolved once per isolate.
 *
 * Cached because `parseVelocityConfig` runs a JSON parse and a scan, and a
 * limiter that did that per request would be its own denial of service. The
 * cache key is the raw config string, so an operator changing the variable
 * takes effect when the isolate next sees the new value — no deploy, which is
 * TS2's "limits change without a deploy", and no restart either.
 */
let cachedRaw: string | null | undefined;
let cachedRules: readonly VelocityRule[] = DEFAULT_VELOCITY_RULES;
let cachedProblems: readonly string[] = [];

export function rulesFor(env: Env): readonly VelocityRule[] {
  const raw = env.OPENPRODUCT_VELOCITY ?? null;
  if (raw !== cachedRaw) {
    const result = parseVelocityConfig(raw);
    cachedRaw = raw;
    cachedRules = result.rules;
    cachedProblems = result.problems;
    for (const problem of result.problems) {
      // LOUD, and at `warn`. A misconfiguration that quietly reverted to
      // defaults is a limit somebody believes they changed and did not,
      // which is worse than either value — it is a value nobody knows.
      console.warn(JSON.stringify({ level: "warn", msg: "velocity_config_rejected", problem }));
    }
  }
  return cachedRules;
}

/** Test seam — the problems the last parse recorded. */
export function velocityConfigProblems(): readonly string[] {
  return cachedProblems;
}

function evaluate(
  rule: VelocityRule,
  key: string,
  now: number,
): VelocityRefusal | null {
  const id = `${rule.action}:${rule.dimension}:${key}`;
  const longest = Math.max(rule.burst.windowSec, rule.sustained.windowSec) * 1000;
  const counter = counters.get(id) ?? { hits: [] };
  // Drop everything outside the longest window first, so the list stays
  // bounded by the sustained limit rather than by uptime.
  const cutoff = now - longest;
  const hits = counter.hits.filter((at) => at > cutoff);

  for (const [name, window] of [
    ["burst", rule.burst],
    ["sustained", rule.sustained],
  ] as const) {
    const since = now - window.windowSec * 1000;
    const inWindow = hits.filter((at) => at > since);
    if (inWindow.length >= window.limit) {
      // Keep the pruned list: a refused request must not also be forgotten,
      // or a caller at the limit could hold the door open forever by
      // retrying — every retry would prune, none would count.
      counters.set(id, { hits });
      const oldest = inWindow[0] ?? now;
      return {
        action: rule.action,
        dimension: rule.dimension,
        window: name,
        limit: window.limit,
        windowSec: window.windowSec,
        message: rule.refusal || GENERIC_REFUSAL,
        // When the oldest hit in this window falls out of it. Honest rather
        // than a flat guess: telling somebody "60 seconds" when it is
        // actually 3 makes them wait 57 seconds for nothing.
        retryAfterSec: Math.max(1, Math.ceil((oldest + window.windowSec * 1000 - now) / 1000)),
      };
    }
  }

  hits.push(now);
  counters.set(id, { hits });
  if (counters.size > MAX_KEYS) counters.clear();
  return null;
}

/**
 * Check every rule that applies to this action, and record the hit.
 *
 * ALL RULES ARE EVALUATED IN ORDER and the FIRST refusal wins — but a
 * refusal by any rule means NO rule records a hit for this request, which is
 * the subtle part. If the per-subject rule passed and recorded, and then the
 * per-target rule refused, the person would have spent one of their own
 * allowance on a request that never happened. Over a busy hour on a popular
 * listing that quietly exhausts an innocent person's daily limit.
 *
 * So this evaluates first and commits second.
 */
export function checkVelocity(
  env: Env,
  action: WriteAction,
  keys: { subject: string; target?: string | null },
  now = Date.now(),
): VelocityRefusal | null {
  const rules = rulesFor(env).filter((rule) => rule.action === action);
  if (rules.length === 0) return null;

  // Pass one: would any rule refuse? Uses a probe that does not record.
  for (const rule of rules) {
    const key = rule.dimension === "subject" ? keys.subject : keys.target;
    if (!key) continue;
    const refusal = probe(rule, key, now);
    if (refusal) return refusal;
  }
  // Pass two: nobody refused, so every applicable rule records the hit.
  for (const rule of rules) {
    const key = rule.dimension === "subject" ? keys.subject : keys.target;
    if (!key) continue;
    evaluate(rule, key, now);
  }
  return null;
}

/** `evaluate` without the commit — the read half, so the two passes above
 *  cannot disagree about what counts. */
function probe(rule: VelocityRule, key: string, now: number): VelocityRefusal | null {
  const id = `${rule.action}:${rule.dimension}:${key}`;
  const counter = counters.get(id);
  if (!counter) return null;
  const longest = Math.max(rule.burst.windowSec, rule.sustained.windowSec) * 1000;
  const hits = counter.hits.filter((at) => at > now - longest);

  for (const [name, window] of [
    ["burst", rule.burst],
    ["sustained", rule.sustained],
  ] as const) {
    const inWindow = hits.filter((at) => at > now - window.windowSec * 1000);
    if (inWindow.length >= window.limit) {
      counters.set(id, { hits });
      const oldest = inWindow[0] ?? now;
      return {
        action: rule.action,
        dimension: rule.dimension,
        window: name,
        limit: window.limit,
        windowSec: window.windowSec,
        message: rule.refusal || GENERIC_REFUSAL,
        retryAfterSec: Math.max(1, Math.ceil((oldest + window.windowSec * 1000 - now) / 1000)),
      };
    }
  }
  return null;
}

/** Test seam. */
export function resetVelocity(): void {
  counters.clear();
  cachedRaw = undefined;
  cachedRules = DEFAULT_VELOCITY_RULES;
  cachedProblems = [];
}
