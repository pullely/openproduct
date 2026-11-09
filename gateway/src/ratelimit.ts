// Rate limiting, gateway edition (OX3) — counted in one place (CS1).
//
// The numbers are the facade's `openproduct` family's (identity 60/min, org
// 300/min, anon 120/min) and the auth plane's four (AC1, AC2b); they live in
// `contracts/rate-limits.ts` now, where the OpenAPI document and `/docs/api`
// read them too, so the number a consumer sees is the number enforced here.
//
// ─── WHERE THE COUNT IS (CS1) ────────────────────────────────────────────
//
// Until CS1 the buckets were per-isolate maps, "approximate by construction",
// and this header said the honest fix was "a Durable Object added to THIS
// worker — never a platform binding". That is what `RateLimitBucket` is: one
// object per `kind:key`, addressed by `idFromName`, so the runtime serialises
// every take on a key through one instance and the read-modify-write is
// atomic across every data centre. The object keeps its bucket in memory —
// an evicted object is a refilled bucket, which is what an idle bucket would
// be anyway — and runs the SAME pure step (`tokenBucketTake`) the fallback
// below runs, so the two cannot disagree about what a refusal is.
//
// FAILS OPEN, TO THE OLD LIMITER. The object is the second line of defence
// and the cache is the first (OPP4a: Workers Caching answers a hit before
// this worker runs at all — so what reaches a bucket is a miss, a flood of
// one URL spends nothing of ours, and a flood of distinct URLs spends
// tokens, which is the order this header always wanted). A front door that
// closed when its counter hiccupped would have inverted which line matters.
// So an object that cannot be asked — unreachable, a non-2xx, a body that is
// not an answer — hands the take to the per-isolate bucket this file always
// had: nothing is refused that the pre-CS1 limiter would not have refused,
// and `rate_limit_unavailable` is logged at most once a minute per isolate.
// A binding that is ABSENT (a test, `wrangler dev` without the class) is a
// configuration rather than a failure, and says nothing.
//
// ─── WHAT A REFUSAL SAYS ─────────────────────────────────────────────────
//
// `429`, a `Retry-After` computed from the refill (when the next token is
// this caller's — not a flat window that makes them wait fifty-seven
// seconds for nothing), and a body naming the bucket, its limit and its
// window. The auth plane keeps its own body (`AUTH_TOO_FAST`, a fact about
// the caller's behaviour) and gains the header.

import {
  AUTH_RATE_LIMITS,
  RATE_LIMITS,
  rateLimitRefusal,
  tokenBucketTake,
  type BucketState,
} from "@openproduct/contracts";

import type { Env } from "./env.js";
import { errorResponse } from "./http.js";

/** Every bucket this gateway takes from — the published three and the auth four, one map. */
export const LIMITS = { ...RATE_LIMITS, ...AUTH_RATE_LIMITS } as const;

export type BucketName = keyof typeof LIMITS;

export interface Refused {
  readonly ok: false;
  readonly bucket: BucketName;
  readonly limit: number;
  readonly windowSec: number;
  /** Whole seconds until a token is this caller's; at least 1. */
  readonly retryAfterSec: number;
}

export type Verdict = { readonly ok: true } | Refused;

const ALLOWED: Verdict = { ok: true };

// ─── the in-isolate bucket: the fallback, and the whole limiter where no
//     object is bound ──────────────────────────────────────────────────────

const buckets = new Map<string, BucketState>();

function takeLocally(kind: BucketName, key: string, now: number): Verdict {
  const { limit, windowSec } = LIMITS[kind];
  const id = `${kind}:${key}`;
  const step = tokenBucketTake(buckets.get(id) ?? null, limit, windowSec, now);
  buckets.set(id, step.next);
  // Unbounded key growth is the classic in-memory-limiter leak; cap the map.
  if (buckets.size > 10_000) buckets.clear();
  return step.allowed ? ALLOWED : { ok: false, bucket: kind, limit, windowSec, retryAfterSec: step.retryAfterSec };
}

// ─── the object ──────────────────────────────────────────────────────────

const TAKE_URL = "https://rate-limit.internal/take";

interface TakeRequest {
  readonly limit: number;
  readonly windowSec: number;
}

interface TakeAnswer {
  readonly allowed: boolean;
  readonly retryAfterSec: number;
}

function isTakeRequest(value: unknown): value is TakeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TakeRequest).limit === "number" &&
    (value as TakeRequest).limit > 0 &&
    typeof (value as TakeRequest).windowSec === "number" &&
    (value as TakeRequest).windowSec > 0
  );
}

function isTakeAnswer(value: unknown): value is TakeAnswer {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TakeAnswer).allowed === "boolean" &&
    typeof (value as TakeAnswer).retryAfterSec === "number"
  );
}

/**
 * One bucket, as a Durable Object — one instance per `kind:key`.
 *
 * The limit arrives with every request rather than living here, so the
 * object holds no configuration that could go stale when the contract's
 * number moves; it holds the count, which is the one thing an isolate
 * cannot. No storage: the bucket is in memory, and an object the runtime
 * evicts comes back full, which for a token bucket is "it refilled while
 * nobody was asking" — true, and harmless. Declared as a SQLite-backed
 * class in `wrangler.jsonc` so that storage is a line away if a bucket ever
 * needs to survive eviction.
 */
export class RateLimitBucket {
  private bucket: BucketState | null = null;

  // The runtime constructs an object with (state, env); this one keeps
  // neither, but the signature is the contract.
  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("invalid body", { status: 400 });
    }
    if (!isTakeRequest(body)) return new Response("invalid body", { status: 400 });
    const step = tokenBucketTake(this.bucket, body.limit, body.windowSec, Date.now());
    this.bucket = step.next;
    const answer: TakeAnswer = { allowed: step.allowed, retryAfterSec: step.retryAfterSec };
    return Response.json(answer);
  }
}

type UnavailableReason = "unreachable" | "refused" | "malformed";

const UNAVAILABLE_LOG_GAP_MS = 60_000;
let unavailableLoggedAt = Number.NEGATIVE_INFINITY;

function noteUnavailable(kind: BucketName, reason: UnavailableReason, now: number): void {
  if (now - unavailableLoggedAt < UNAVAILABLE_LOG_GAP_MS) return;
  unavailableLoggedAt = now;
  // ONCE A MINUTE, not once a request: an object outage under a flood is
  // exactly when a log line per request would be its own incident.
  console.warn(JSON.stringify({ level: "warn", msg: "rate_limit_unavailable", bucket: kind, reason }));
}

async function takeFromObject(
  namespace: DurableObjectNamespace,
  kind: BucketName,
  key: string,
  now: number,
): Promise<Verdict> {
  const { limit, windowSec } = LIMITS[kind];
  let reason: UnavailableReason = "unreachable";
  try {
    const stub = namespace.get(namespace.idFromName(`${kind}:${key}`));
    const request: TakeRequest = { limit, windowSec };
    const response = await stub.fetch(TAKE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      reason = "refused";
      throw new Error(`rate-limit object answered ${response.status}`);
    }
    reason = "malformed";
    const answer: unknown = await response.json();
    if (!isTakeAnswer(answer)) throw new Error("rate-limit object answered something else");
    return answer.allowed ? ALLOWED : { ok: false, bucket: kind, limit, windowSec, retryAfterSec: answer.retryAfterSec };
  } catch {
    noteUnavailable(kind, reason, now);
    return takeLocally(kind, key, now);
  }
}

// ─── the API the router and the auth plane use ──────────────────────────

/**
 * Take one token from `kind`'s bucket for `key`. Through the object where
 * one is bound; in this isolate where none is, or where the object could not
 * be asked (see the header).
 */
export async function takeToken(
  kind: BucketName,
  key: string,
  env?: Pick<Env, "RATE_LIMIT">,
  now = Date.now(),
): Promise<Verdict> {
  const namespace = env?.RATE_LIMIT;
  if (!namespace) return takeLocally(kind, key, now);
  return takeFromObject(namespace, kind, key, now);
}

/** `Retry-After`, on any 429 — the auth plane's included. */
export function withRetryAfter(response: Response, refused: Refused): Response {
  response.headers.set("retry-after", String(refused.retryAfterSec));
  return response;
}

/**
 * The refusal the published planes answer: `rate_limited`, the bucket's own
 * sentence, and the facts — which bucket, what it allows, when to come back.
 */
export function rateLimited(refused: Refused, requestId: string): Response {
  return withRetryAfter(
    errorResponse("rate_limited", rateLimitRefusal(LIMITS[refused.bucket]), 429, requestId, {
      bucket: refused.bucket,
      limit: refused.limit,
      windowSec: refused.windowSec,
      retryAfterSeconds: refused.retryAfterSec,
    }),
    refused,
  );
}

/** Take a token, or hand back the 429 — the one-line gate the router uses. */
export async function rateLimitGate(
  kind: BucketName,
  key: string,
  env: Pick<Env, "RATE_LIMIT">,
  requestId: string,
): Promise<Response | null> {
  const verdict = await takeToken(kind, key, env);
  return verdict.ok ? null : rateLimited(verdict, requestId);
}

export function anonKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

/** Test seam — a cold isolate: no buckets, nothing logged yet. */
export function resetBuckets(): void {
  buckets.clear();
  unavailableLoggedAt = Number.NEGATIVE_INFINITY;
}
