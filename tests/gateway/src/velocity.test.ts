// Velocity, enforced (openproduct-commons TS2).
//
// TS2's done-when is four claims, and this file is one describe block per
// claim:
//
//   1. a synthetic flood is refused AT THE GATEWAY and never reaches a handler
//   2. limits change WITHOUT A DEPLOY
//   3. a legitimate burst is NOT refused
//   4. the refusal TELLS THE PERSON what happened
//
// Claim 1 is the one worth being pedantic about, and the assertion that
// carries it is not `status === 429` — it is that `captured` is empty. A
// limiter that returns 429 after calling core has spent the service-binding
// hop, the database connection and the transaction that the flood was trying
// to spend; it looks identical from outside and is worthless.

import { DEFAULT_VELOCITY_RULES, publishedRules } from "@openproduct/contracts";
import { classifyWrite, route } from "@openproduct-gateway/router";
import type { Env } from "@openproduct-gateway/env";
import { resetVelocity } from "@openproduct-gateway/velocity";
import { resetBuckets } from "@openproduct-gateway/ratelimit";
import { resetSubjectCache } from "@openproduct-gateway/subject";

const SUBJECT = "usr_0123456789abcdef0123456789abcdef";

interface CapturedFetch {
  url: string;
  method: string;
}

function coreStub(captured: CapturedFetch[]) {
  return {
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input as RequestInfo, init);
      captured.push({ url: request.url, method: request.method });
      return Response.json({ data: {} });
    },
  } as unknown as Fetcher;
}

function envWith(core: Fetcher, velocity?: string): Env {
  return {
    CORE: core,
    ENVIRONMENT: "test",
    PLATFORM_API_URL: "https://platform.test",
    ...(velocity === undefined ? {} : { OPENPRODUCT_VELOCITY: velocity }),
  } as Env;
}

/** The platform identity read the gateway makes to resolve a subject (S2). */
function stubIdentity(subjectId: string): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://platform.test/v1/identity/me")) {
      return Response.json({ data: { subjectId, displayName: "Ada" } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

/**
 * A write, as a particular person.
 *
 * THE TOKEN IS PER-PERSON, and that matters more than it looks: the gateway
 * caches token→subject, so a test that switched `stubIdentity` while reusing
 * one bearer would have every request resolve to whoever went first — and the
 * brigade tests below would silently be testing one subject rather than
 * sixty. That is exactly the bug they exist to catch, arriving from inside
 * the test.
 */
function write(path: string, method = "PUT", token = "tok"): Request {
  return new Request(`https://gw.test${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

/**
 * Capture what the gateway logged.
 *
 * A plain swap rather than a spy: this lane runs jest in ESM mode, where the
 * `jest` global is not defined without importing it, and a captured array is
 * both simpler and exactly as much as these assertions need.
 */
function captureWarnings(): string[] {
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return lines;
}

beforeEach(() => {
  resetVelocity();
  resetBuckets();
  // The gateway caches token→subject; without this, every request in a test
  // that switches subjects would resolve to whoever went first.
  resetSubjectCache();
  stubIdentity(SUBJECT);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  resetSubjectCache();
});

describe("1 — a flood is refused at the gateway and never reaches a handler", () => {
  it("stops calling core the moment the burst window is full", async () => {
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured));
    const burst = DEFAULT_VELOCITY_RULES.find(
      (r) => r.action === "endorse" && r.dimension === "subject",
    )!.burst.limit;

    // One more than the limit allows.
    const results: number[] = [];
    for (let i = 0; i < burst + 5; i += 1) {
      results.push((await route(write(`/v1/openproduct/me/endorsements/thing-${i}`), env)).status);
    }

    expect(results.slice(0, burst).every((s) => s === 200)).toBe(true);
    expect(results.slice(burst).every((s) => s === 429)).toBe(true);
    // THE ASSERTION THAT CARRIES THE CLAIM. Not the status code — the number
    // of times core was reached. A limiter that 429s after calling core has
    // spent exactly the resource the flood was trying to spend.
    expect(captured).toHaveLength(burst);
  });

  it("bounds ONE LISTING across many subjects — the brigade shape", async () => {
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured));
    const target = DEFAULT_VELOCITY_RULES.find(
      (r) => r.action === "endorse" && r.dimension === "target",
    )!.burst.limit;

    // Every request from a DIFFERENT subject, each one comfortably inside
    // its own per-subject allowance. This is the only shape that catches a
    // coordinated arrival, and a purely per-subject limiter waves it through.
    for (let i = 0; i < target; i += 1) {
      stubIdentity(`usr_${String(i).padStart(32, "0")}`);
      const res = await route(
        write("/v1/openproduct/me/endorsements/one-thing", "PUT", `tok-${i}`),
        env,
      );
      expect([i, res.status]).toEqual([i, 200]);
    }
    stubIdentity("usr_ffffffffffffffffffffffffffffffff");
    const refused = await route(
      write("/v1/openproduct/me/endorsements/one-thing", "PUT", "tok-last"),
      env,
    );
    expect(refused.status).toBe(429);
    expect(captured).toHaveLength(target);

    // ...and a DIFFERENT listing is unaffected: the bound is about the
    // listing, not about the site.
    expect(
      (await route(write("/v1/openproduct/me/endorsements/other-thing", "PUT", "tok-last"), env))
        .status,
    ).toBe(200);
  });

  it("does NOT spend a person's own allowance on a request the target bound refused", async () => {
    // THE SUBTLE BUG THIS EXISTS TO CATCH. If the per-subject rule recorded a
    // hit and the per-target rule then refused, an innocent person would have
    // paid for a request that never happened — and over a busy hour on a
    // popular listing that quietly exhausts their daily limit for something
    // other people did.
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured));
    const targetLimit = DEFAULT_VELOCITY_RULES.find(
      (r) => r.action === "endorse" && r.dimension === "target",
    )!.burst.limit;

    // Fill the listing's bound using other people.
    for (let i = 0; i < targetLimit; i += 1) {
      stubIdentity(`usr_${String(i).padStart(32, "0")}`);
      await route(write("/v1/openproduct/me/endorsements/busy-thing", "PUT", `tok-${i}`), env);
    }

    // Now an innocent bystander tries, and is refused by the TARGET rule.
    stubIdentity(SUBJECT);
    expect(
      (await route(write("/v1/openproduct/me/endorsements/busy-thing", "PUT", "bystander"), env))
        .status,
    ).toBe(429);

    // Their own allowance must be intact: the full per-subject burst still
    // works on other listings.
    const subjectBurst = DEFAULT_VELOCITY_RULES.find(
      (r) => r.action === "endorse" && r.dimension === "subject",
    )!.burst.limit;
    for (let i = 0; i < subjectBurst; i += 1) {
      expect([
        i,
        (await route(write(`/v1/openproduct/me/endorsements/calm-${i}`, "PUT", "bystander"), env))
          .status,
      ]).toEqual([i, 200]);
    }
  });

  it("keeps counting a refused caller — retrying does not hold the door open", async () => {
    // The bug: pruning the hit list on a refused request but not keeping it,
    // so every retry prunes and none counts, and a caller sitting exactly at
    // the limit can retry forever.
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured));
    const burst = DEFAULT_VELOCITY_RULES.find((r) => r.action === "handle-claim")!.burst.limit;

    for (let i = 0; i < burst; i += 1) {
      await route(write("/v1/openproduct/me/handle"), env);
    }
    for (let i = 0; i < 20; i += 1) {
      expect((await route(write("/v1/openproduct/me/handle"), env)).status).toBe(429);
    }
    expect(captured).toHaveLength(burst);
  });

  it("limits each ACTION separately — one is not a budget for all", async () => {
    // A blanket per-subject limit is the shape every service starts with and
    // it is wrong in both directions at once: sixty handle claims a minute is
    // squatting a namespace, and sixty-one listing edits is a person getting
    // the wording right.
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured));
    const handleBurst = DEFAULT_VELOCITY_RULES.find((r) => r.action === "handle-claim")!.burst.limit;

    for (let i = 0; i < handleBurst; i += 1) await route(write("/v1/openproduct/me/handle"), env);
    expect((await route(write("/v1/openproduct/me/handle"), env)).status).toBe(429);
    // Endorsing is untouched by having exhausted handle claims.
    expect((await route(write("/v1/openproduct/me/endorsements/a-thing"), env)).status).toBe(200);
  });

  it("never limits a READ", async () => {
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured));
    for (let i = 0; i < 40; i += 1) {
      const res = await route(
        new Request("https://gw.test/v1/openproduct/me/overlay?ids=a-thing", {
          headers: { authorization: "Bearer tok" },
        }),
        env,
      );
      // The coarse per-identity bucket may eventually bite, but VELOCITY must
      // not: reading your own overlay forty times is a page reloading, not a
      // write worth bounding.
      expect([i, res.status === 429 && res.headers.get("retry-after") !== null]).toEqual([i, false]);
    }
  });
});

describe("2 — limits change without a deploy", () => {
  it("honours an operator override from the environment", async () => {
    const captured: CapturedFetch[] = [];
    const env = envWith(
      coreStub(captured),
      '[{"action":"endorse","dimension":"subject","burst":{"limit":2,"windowSec":60}}]',
    );
    expect((await route(write("/v1/openproduct/me/endorsements/a"), env)).status).toBe(200);
    expect((await route(write("/v1/openproduct/me/endorsements/b"), env)).status).toBe(200);
    expect((await route(write("/v1/openproduct/me/endorsements/c"), env)).status).toBe(429);
    expect(captured).toHaveLength(2);
  });

  it("falls back to the defaults when the override is nonsense, and says so", async () => {
    const warnings = captureWarnings();
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured), "{not json");
    // The dangerous failure is the OTHER one: an unparseable config that
    // disabled limiting entirely. Here the default still applies.
    const burst = DEFAULT_VELOCITY_RULES.find(
      (r) => r.action === "endorse" && r.dimension === "subject",
    )!.burst.limit;
    for (let i = 0; i < burst; i += 1) {
      await route(write(`/v1/openproduct/me/endorsements/x${i}`), env);
    }
    expect((await route(write("/v1/openproduct/me/endorsements/last"), env)).status).toBe(429);
    // And it was LOUD. A misconfiguration that quietly reverted is a limit
    // somebody believes they changed and did not.
    expect(warnings.join(" ")).toContain("velocity_config_rejected");
  });

  it("picks up a NEW value without a restart", async () => {
    const captured: CapturedFetch[] = [];
    const tight = envWith(
      coreStub(captured),
      '[{"action":"handle-claim","dimension":"subject","burst":{"limit":1,"windowSec":60}}]',
    );
    expect((await route(write("/v1/openproduct/me/handle"), tight)).status).toBe(200);
    expect((await route(write("/v1/openproduct/me/handle"), tight)).status).toBe(429);

    // The operator widens it during an incident. Same isolate, same process.
    const loose = envWith(
      coreStub(captured),
      '[{"action":"handle-claim","dimension":"subject","burst":{"limit":50,"windowSec":60}}]',
    );
    expect((await route(write("/v1/openproduct/me/handle"), loose)).status).toBe(200);
  });
});

describe("3 — a legitimate burst is not refused", () => {
  it("lets a maintainer edit their listing ten times in a row", async () => {
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured));
    for (let i = 0; i < 10; i += 1) {
      const res = await route(
        write("/v1/organizations/org_1/openproduct/profiles/acme-thing", "PATCH"),
        env,
      );
      expect([i, res.status]).toEqual([i, 200]);
    }
  });

  it("lets somebody report ten listings while walking a spam wave", async () => {
    // The most useful person on the site that day. A limit that turns them
    // away has sent our best moderator home.
    const rule = DEFAULT_VELOCITY_RULES.find((r) => r.action === "report")!;
    expect(rule.burst.limit).toBeGreaterThanOrEqual(10);
  });

  it("lets an enthusiast endorse ten products in a sitting", async () => {
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured));
    for (let i = 0; i < 10; i += 1) {
      const res = await route(write(`/v1/openproduct/me/endorsements/found-${i}`), env);
      expect([i, res.status]).toEqual([i, 200]);
    }
  });

  it("does not limit a write it has no rule for", async () => {
    // A write this table does not know still passes. Refusing anything
    // unrecognised would turn every new route into an outage until somebody
    // remembered the classifier.
    const captured: CapturedFetch[] = [];
    const env = envWith(coreStub(captured));
    for (let i = 0; i < 30; i += 1) {
      const res = await route(write("/v1/openproduct/me/applications", "POST"), env);
      expect([i, res.headers.get("retry-after")]).toEqual([i, null]);
    }
  });
});

describe("4 — the refusal tells the person what happened", () => {
  it("carries the rule's own sentence, not `Too many requests`", async () => {
    const env = envWith(coreStub([]));
    const burst = DEFAULT_VELOCITY_RULES.find((r) => r.action === "handle-claim")!.burst.limit;
    for (let i = 0; i < burst; i += 1) await route(write("/v1/openproduct/me/handle"), env);

    const res = await route(write("/v1/openproduct/me/handle"), env);
    const body = (await res.json()) as { error: { code: string; message: string; details: Record<string, unknown> } };
    expect(res.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.message).not.toBe("Too many requests");
    // The handle rule explains WHY it is tight, rather than just being tight.
    expect(body.error.message).toMatch(/never re-issued|deliberately slow/i);
    expect(body.error.message).not.toMatch(/abuse|spam|banned/i);
  });

  it("says how long, in the header and in the body", async () => {
    const env = envWith(coreStub([]));
    const burst = DEFAULT_VELOCITY_RULES.find((r) => r.action === "handle-claim")!.burst.limit;
    for (let i = 0; i < burst; i += 1) await route(write("/v1/openproduct/me/handle"), env);

    const res = await route(write("/v1/openproduct/me/handle"), env);
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(Number.isFinite(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    // Honest rather than a flat guess: the window is 60s and almost none of
    // it has elapsed, so it should be close to 60 — but never more.
    expect(retryAfter).toBeLessThanOrEqual(60);
    const body = (await res.json()) as { error: { details: { retryAfterSeconds?: number } } };
    expect(body.error.details.retryAfterSeconds).toBe(retryAfter);
  });

  it("logs the refusal with enough to tell a bad limit from a real flood", async () => {
    const warnings = captureWarnings();
    const env = envWith(coreStub([]));
    const burst = DEFAULT_VELOCITY_RULES.find((r) => r.action === "handle-claim")!.burst.limit;
    for (let i = 0; i < burst + 1; i += 1) await route(write("/v1/openproduct/me/handle"), env);

    const line = warnings.find((c) => c.includes("velocity_refused"));
    expect(line).toBeDefined();
    const parsed = JSON.parse(String(line)) as Record<string, unknown>;
    expect(parsed.action).toBe("handle-claim");
    expect(parsed.dimension).toBe("subject");
    expect(parsed.window).toBe("burst");
    expect(parsed.limit).toBe(burst);
    expect(parsed.subjectId).toBe(SUBJECT);
    // I3 — a subject id is a join key and this is an internal log; there is
    // no email anywhere in this worker to leak.
    expect(String(line)).not.toMatch(/@|email/);
  });
});

describe("TS5 — the appeal is a bounded write", () => {
  it("classifies POST /me/appeals as an appeal, and the GET as no write at all", () => {
    // OPC-8: every write surface this epic adds is bound to a named TS
    // control. The READ that shows somebody what was done to their listings
    // is not one — it is the page they were sent to.
    expect(classifyWrite("/v1/openproduct/me/appeals", "POST")).toEqual({
      action: "appeal",
      target: null,
    });
    expect(classifyWrite("/v1/openproduct/me/appeals", "GET")).toBeNull();
  });

  it("has a published rule, because a person refused deserves the rule", () => {
    const rule = DEFAULT_VELOCITY_RULES.find((r) => r.action === "appeal");
    expect(rule).toBeDefined();
    expect(rule!.dimension).toBe("subject");
    expect(rule!.publish).toBe(true);
    // Not a per-target bound: an appeal is about a decision that concerns
    // YOU, so "how many appeals has this listing attracted" is not a
    // brigading signal, it is a fact about how often we acted on it.
    expect(publishedRules().map((r) => r.action)).toContain("appeal");
  });

  it("refuses in a sentence that accuses nobody", () => {
    const rule = DEFAULT_VELOCITY_RULES.find((r) => r.action === "appeal")!;
    expect(rule.refusal).toMatch(/have all been recorded/i);
    expect(rule.refusal).not.toMatch(/abuse|spam|violat/i);
  });

  it("is bounded more tightly than a report, and says why in the contract", () => {
    // A report is somebody helping — somebody walking through a spam wave is
    // the most useful person on the site that day. An appeal is somebody
    // arguing about a decision that concerns them, and the honest number of
    // those is small.
    const appeal = DEFAULT_VELOCITY_RULES.find((r) => r.action === "appeal")!;
    const report = DEFAULT_VELOCITY_RULES.find(
      (r) => r.action === "report" && r.dimension === "subject",
    )!;
    expect(appeal.burst.limit).toBeLessThan(report.burst.limit);
    expect(appeal.sustained.limit).toBeLessThan(report.sustained.limit);
  });
});
