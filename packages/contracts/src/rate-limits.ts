// The rate limit, published (openproduct-consumers CS1).
//
// `gateway/src/ratelimit.ts` carried these numbers as a private constant and
// its own header called them approximate: per-isolate token buckets, the
// published number nowhere published. A limit that exists is a limit that is
// stated — this file is the statement, and it is the ONE place the numbers
// live. The gateway imports its buckets from here, the OpenAPI document's
// `info` lists them from here, and `/docs/api` renders them from here, so
// the number a consumer reads is the number the limiter enforces — a test
// holds the three to the same object.
//
// THE STEP IS HERE TOO. `tokenBucketTake` is the whole of the algorithm, pure,
// so the Durable Object that holds a bucket and the in-isolate fallback that
// stands in when the object is unreachable cannot disagree about what a
// refusal is or when it lifts. `Retry-After` is computed from the refill —
// when the next token arrives — rather than a flat window: telling somebody
// "60 seconds" when it is actually 3 makes them wait 57 seconds for nothing.

/** How a bucket is keyed — what "one caller" means to it. */
export type RateLimitKey = "address" | "subject" | "organisation";

export interface RateBucket {
  /** Requests allowed per window. */
  readonly limit: number;
  /** The window, in seconds. The bucket refills continuously at limit/window. */
  readonly windowSec: number;
  /** What one caller is. */
  readonly keyedBy: RateLimitKey;
  /** What the bucket stands in front of, for the sentence. */
  readonly guards: string;
}

/**
 * The three published buckets. These are the numbers the facade's
 * `openproduct` family carried (OX3) and the gateway kept; the change CS1
 * made is where they are counted, not what they are.
 */
export const RATE_LIMITS = {
  anon: { limit: 120, windowSec: 60, keyedBy: "address", guards: "the public read" },
  identity: { limit: 60, windowSec: 60, keyedBy: "subject", guards: "the signed-in plane" },
  org: { limit: 300, windowSec: 60, keyedBy: "organisation", guards: "an organisation's maintainer routes" },
} as const satisfies Record<string, RateBucket>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** The published buckets, in the order the page lists them. */
export const RATE_LIMIT_NAMES: readonly RateLimitName[] = ["anon", "identity", "org"];

/**
 * The auth plane's buckets (AC1, AC2b) — the only ones that guard something
 * a rate limit is the real shield for, and per hour rather than per minute
 * because the thing they refuse is a slow grind. Kept beside the published
 * three so the gateway reads one file, and NOT on `/docs/api`: the page
 * states what a consumer of the catalogue API can rely on, and the auth
 * plane is not that API. Its refusal is `AUTH_TOO_FAST`, which now carries
 * `Retry-After` like every other 429 this gateway answers.
 */
export const AUTH_RATE_LIMITS = {
  authSignUp: { limit: 10, windowSec: 3600, keyedBy: "address", guards: "sign-up" },
  authVerify: { limit: 30, windowSec: 3600, keyedBy: "address", guards: "verification" },
  authSignIn: { limit: 20, windowSec: 3600, keyedBy: "address", guards: "sign-in" },
  authSignInSubject: { limit: 10, windowSec: 3600, keyedBy: "subject", guards: "sign-in to one account" },
} as const satisfies Record<string, RateBucket>;

/** "a minute", "an hour", or "every N seconds" — for the sentence. */
export function rateWindowWord(windowSec: number): string {
  if (windowSec === 60) return "a minute";
  if (windowSec === 3600) return "an hour";
  return `every ${windowSec} seconds`;
}

/** One bucket as a clause: "120 requests a minute per address on the public read (`anon`)". */
export function rateLimitClause(name: string, bucket: RateBucket): string {
  return `${bucket.limit} requests ${rateWindowWord(bucket.windowSec)} per ${bucket.keyedBy} on ${bucket.guards} (\`${name}\`)`;
}

/** What a refused caller is told — which bucket, and what it allows. */
export function rateLimitRefusal(bucket: RateBucket): string {
  return `Too many requests: ${bucket.guards} allows ${bucket.limit} ${rateWindowWord(bucket.windowSec)} per ${bucket.keyedBy}. Retry-After says when the next one is yours.`;
}

/**
 * The paragraph the OpenAPI document's `info` and `/docs/api` carry. Built
 * from the table, never typed: a sentence that named a number the table did
 * not would be the drift this file exists to end.
 */
export const RATE_LIMIT_SENTENCE =
  `Rate limited, and the limit is published: ${RATE_LIMIT_NAMES.map((name) => rateLimitClause(name, RATE_LIMITS[name])).join("; ")}. Each bucket refills continuously. A refused request answers 429 with a Retry-After header computed from the refill and a body naming the bucket. The count is one per key rather than one per data centre, so the number here is the number enforced.`;

// ─── the step ──────────────────────────────────────────────────────────────

/** A bucket's state between two takes. */
export interface BucketState {
  readonly tokens: number;
  readonly updatedAt: number;
}

export interface BucketStep {
  readonly next: BucketState;
  readonly allowed: boolean;
  /** 0 when allowed; otherwise whole seconds until a token is available, at least 1. */
  readonly retryAfterSec: number;
}

/**
 * Seconds until a bucket holding `tokens` (below 1) next holds one. The
 * refill is `limit / windowSec` a second; the wait is the gap divided by it,
 * rounded UP to whole seconds because `Retry-After` is an integer and a
 * caller told 0 would retry into the same refusal.
 */
export function retryAfterSeconds(tokens: number, limit: number, windowSec: number): number {
  const refillPerMs = limit / (windowSec * 1000);
  return Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000));
}

/**
 * Take one token. `state` null is a bucket never seen: full.
 *
 * A refused take still advances `updatedAt` and keeps the refilled count, so
 * retrying at the limit does not hold the door open — every retry refills,
 * none is free. The clock never runs backwards here: a `now` earlier than
 * `updatedAt` refills nothing rather than draining.
 */
export function tokenBucketTake(state: BucketState | null, limit: number, windowSec: number, now: number): BucketStep {
  const refillPerMs = limit / (windowSec * 1000);
  const prior = state ?? { tokens: limit, updatedAt: now };
  const tokens = Math.min(limit, prior.tokens + Math.max(0, now - prior.updatedAt) * refillPerMs);
  if (tokens < 1) {
    return { next: { tokens, updatedAt: now }, allowed: false, retryAfterSec: retryAfterSeconds(tokens, limit, windowSec) };
  }
  return { next: { tokens: tokens - 1, updatedAt: now }, allowed: true, retryAfterSec: 0 };
}
