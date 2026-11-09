// The rate limit, published and stepped (openproduct-consumers CS1).

import { describe, expect, it } from "vitest";

import {
  AUTH_RATE_LIMITS,
  RATE_LIMITS,
  RATE_LIMIT_NAMES,
  RATE_LIMIT_SENTENCE,
  rateLimitClause,
  rateLimitRefusal,
  retryAfterSeconds,
  tokenBucketTake,
} from "./rate-limits.js";

describe("the published buckets", () => {
  it("are three, keyed as the page says, and the sentence names every one with its number", () => {
    expect(RATE_LIMIT_NAMES).toEqual(["anon", "identity", "org"]);
    expect(RATE_LIMITS.anon).toEqual({ limit: 120, windowSec: 60, keyedBy: "address", guards: "the public read" });
    expect(RATE_LIMITS.identity.keyedBy).toBe("subject");
    expect(RATE_LIMITS.org.keyedBy).toBe("organisation");
    for (const name of RATE_LIMIT_NAMES) {
      const bucket = RATE_LIMITS[name];
      expect(RATE_LIMIT_SENTENCE).toContain(`${bucket.limit} requests a minute per ${bucket.keyedBy}`);
      expect(RATE_LIMIT_SENTENCE).toContain(`(\`${name}\`)`);
    }
    expect(RATE_LIMIT_SENTENCE).toContain("429 with a Retry-After header");
  });

  it("keeps the auth plane's four beside them, per hour, and off the sentence", () => {
    expect(Object.keys(AUTH_RATE_LIMITS).sort()).toEqual(["authSignIn", "authSignInSubject", "authSignUp", "authVerify"]);
    for (const bucket of Object.values(AUTH_RATE_LIMITS)) expect(bucket.windowSec).toBe(3600);
    expect(RATE_LIMIT_SENTENCE).not.toMatch(/sign-up|sign-in|verification|an hour/);
    // The published names and the auth names never collide: one map in the gateway.
    for (const name of Object.keys(AUTH_RATE_LIMITS)) expect(name in RATE_LIMITS).toBe(false);
  });

  it("says a bucket as one clause, and a refusal as what it allows", () => {
    expect(rateLimitClause("anon", RATE_LIMITS.anon)).toBe("120 requests a minute per address on the public read (`anon`)");
    expect(rateLimitRefusal(AUTH_RATE_LIMITS.authSignUp)).toBe(
      "Too many requests: sign-up allows 10 an hour per address. Retry-After says when the next one is yours.",
    );
  });
});

describe("the step", () => {
  it("a bucket never seen is full, and the limit-th take is the last allowed", () => {
    let state = null as ReturnType<typeof tokenBucketTake>["next"] | null;
    for (let i = 0; i < 120; i += 1) {
      const step = tokenBucketTake(state, 120, 60, 0);
      expect([i, step.allowed]).toEqual([i, true]);
      state = step.next;
    }
    const refused = tokenBucketTake(state, 120, 60, 0);
    expect(refused.allowed).toBe(false);
    expect(refused.next.tokens).toBe(0);
  });

  it("Retry-After is the refill's answer, not a flat window", () => {
    // 120 a minute is a token every 500 ms: empty → one second, rounded up.
    expect(retryAfterSeconds(0, 120, 60)).toBe(1);
    // 10 an hour is a token every 360 s: empty → 360; half a token → 180.
    expect(retryAfterSeconds(0, 10, 3600)).toBe(360);
    expect(retryAfterSeconds(0.5, 10, 3600)).toBe(180);
    // Never zero: an integer header that said 0 would send the caller back into the same refusal.
    expect(retryAfterSeconds(0.9999, 120, 60)).toBe(1);
  });

  it("refills continuously, and a refused take is not a free one", () => {
    const drained = { tokens: 0, updatedAt: 0 };
    // 60 a minute: one token a second. At 400 ms nothing has arrived.
    const early = tokenBucketTake(drained, 60, 60, 400);
    expect(early.allowed).toBe(false);
    expect(early.retryAfterSec).toBe(1);
    // The refused take carried the refill forward — retrying did not reset it.
    expect(early.next).toEqual({ tokens: 0.4, updatedAt: 400 });
    const later = tokenBucketTake(early.next, 60, 60, 1000);
    expect(later.allowed).toBe(true);
    expect(later.next.tokens).toBeCloseTo(0, 9);
  });

  it("never overfills, and a clock that went backwards drains nothing", () => {
    const idle = tokenBucketTake({ tokens: 5, updatedAt: 0 }, 60, 60, 10 * 60 * 1000);
    expect(idle.next.tokens).toBe(59);
    const skewed = tokenBucketTake({ tokens: 5, updatedAt: 1000 }, 60, 60, 0);
    expect(skewed.allowed).toBe(true);
    expect(skewed.next.tokens).toBe(4);
  });
});
