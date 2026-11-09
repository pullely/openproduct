// The digest by email (openproduct-commons LC5).
//
// The REPOSITORY's half — the opt-in standing, and the pending read that
// re-checks the subscription — is tested in packages/db against real
// Postgres. What is pinned here is the handlers and the boundary:
//
//   - the preference is OPT-IN: absence means silence
//   - the weekly queue asks the guard before walking the subscriber list
//   - it queues LAST week, because LC1 will not publish an unfinished one
//   - core hands out pending and is TOLD what went; it never calls out
//   - a failure increments an attempt and stays queued
//   - nothing anywhere in the response carries an address

import { MAX_DIGEST_QUEUE_PER_RUN, digestEventRef, previousWeek, weekOf } from "@openproduct/contracts";
import type { OpenproductRepository, QueueNotificationInput } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { DigestMailHandlerDeps } from "@openproduct-worker/handlers/digest-mail";

const ME = "https://openproduct.internal/internal/openproduct/me/digest";
const QUEUE = "https://openproduct.internal/internal/openproduct/digest/queue";
const PENDING = "https://openproduct.internal/internal/openproduct/digest/pending";
const DELIVERED = "https://openproduct.internal/internal/openproduct/digest/delivered";
const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const SUBJECT = "usr_0123456789abcdef0123456789abcdef";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(url: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      "x-request-id": "req_lc5",
      "x-actor-subject-id": SUBJECT,
      "x-actor-subject-type": "user",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

interface Harness {
  deps: DigestMailHandlerDeps;
  queued: QueueNotificationInput[];
  set: Array<{ subjectId: string; subscribed: boolean }>;
  markedDelivered: string[][];
  attempts: string[][];
  guardAsked: string[];
  listedSubscribers: number;
}

function harness(options: {
  standing?: { standing: string; since: string | null };
  weekQueued?: boolean;
  subscribers?: string[];
  pending?: Array<{ id: string; subjectId: string; eventRef: string }>;
} = {}): Harness {
  const queued: QueueNotificationInput[] = [];
  const set: Harness["set"] = [];
  const markedDelivered: string[][] = [];
  const attempts: string[][] = [];
  const guardAsked: string[] = [];
  const state = { listedSubscribers: 0 };

  const repo = {
    async getDigestStanding() {
      return options.standing ?? { standing: "never", since: null };
    },
    async setDigestSubscription(subjectId: string, subscribed: boolean) {
      set.push({ subjectId, subscribed });
    },
    async digestWeekQueued(eventRef: string) {
      guardAsked.push(eventRef);
      return options.weekQueued === true;
    },
    async listDigestSubscribers() {
      state.listedSubscribers += 1;
      return options.subscribers ?? [];
    },
    async listPendingDigests() {
      return options.pending ?? [];
    },
    async markDigestDelivered(ids: readonly string[]) {
      markedDelivered.push([...ids]);
      return ids.length;
    },
    async recordDigestAttempt(ids: readonly string[]) {
      attempts.push([...ids]);
      return ids.length;
    },
    async queueNotification(input: QueueNotificationInput) {
      queued.push(input);
      return true;
    },
  } as unknown as OpenproductRepository;

  let ids = 0;
  const h: Harness = {
    deps: {
      repo,
      now: () => NOW,
      generateId: () => `00000000-0000-4000-8000-${String(ids++).padStart(12, "0")}` as never,
    } as DigestMailHandlerDeps,
    queued,
    set,
    markedDelivered,
    attempts,
    guardAsked,
    get listedSubscribers() {
      return state.listedSubscribers;
    },
  };
  return h;
}

async function body(res: Response): Promise<Record<string, unknown>> {
  const parsed = (await res.json()) as { data?: Record<string, unknown> };
  return parsed.data ?? {};
}

describe("the preference is OPT-IN", () => {
  it("reports never-asked for somebody with no row", async () => {
    // Absence means SILENCE, not "we will send until you say stop". That is
    // the inverse of CB4's default and the whole of LC5's consent model.
    const h = harness();
    const res = await route(req(ME), env(), h.deps as never);
    expect(await body(res)).toEqual({ subscription: { standing: "never", since: null } });
  });

  it("subscribes and unsubscribes on a PUT", async () => {
    const h = harness();
    await route(req(ME, "PUT", { subscribed: true }), env(), h.deps as never);
    expect(h.set[0]).toEqual({ subjectId: SUBJECT, subscribed: true });
    await route(req(ME, "PUT", { subscribed: false }), env(), h.deps as never);
    expect(h.set[1]).toEqual({ subjectId: SUBJECT, subscribed: false });
  });

  it("refuses anything but a boolean, rather than guessing", async () => {
    const h = harness();
    for (const value of ["true", 1, null, undefined]) {
      const res = await route(req(ME, "PUT", { subscribed: value }), env(), h.deps as never);
      expect({ value, status: res.status }).toEqual({ value, status: 422 });
    }
    expect(h.set).toEqual([]);
  });

  it("needs an actor", async () => {
    const h = harness();
    const res = await route(
      new Request(ME, { method: "GET", headers: { "x-request-id": "req_lc5" } }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(401);
  });
});

describe("the weekly queue", () => {
  it("queues LAST week, not this one", async () => {
    // LC1 will not publish a digest for a week still in progress, so an email
    // pointing at the current week would link to a 404.
    const h = harness({ subscribers: [SUBJECT] });
    const res = await route(req(QUEUE, "POST"), env(), h.deps as never);
    const expected = previousWeek(weekOf(NOW));
    expect((await body(res)).queued).toMatchObject({ week: expected.id, added: 1 });
    expect(h.queued[0]!.eventRef).toBe(digestEventRef(expected.id));
  });

  it("asks the guard BEFORE walking the subscriber list", async () => {
    // Queueing is idempotent, so running twice is harmless — but discovering
    // that by reading every subscriber on every cron tick is not, and
    // "harmless" and "free" are different things.
    const h = harness({ weekQueued: true, subscribers: [SUBJECT] });
    const res = await route(req(QUEUE, "POST"), env(), h.deps as never);
    expect((await body(res)).reason).toBe("already_queued");
    expect(h.guardAsked).toHaveLength(1);
    expect(h.listedSubscribers).toBe(0);
    expect(h.queued).toEqual([]);
  });

  it("queues a digest with no thread, since it is not about a conversation", async () => {
    const h = harness({ subscribers: [SUBJECT] });
    await route(req(QUEUE, "POST"), env(), h.deps as never);
    expect(h.queued[0]).toMatchObject({ kind: "digest", threadId: null, subjectId: SUBJECT });
  });

  it("gives every subscriber the SAME event ref, which is what makes it once per week", async () => {
    const h = harness({ subscribers: ["usr_a", "usr_b", "usr_c"] });
    await route(req(QUEUE, "POST"), env(), h.deps as never);
    expect(new Set(h.queued.map((q) => q.eventRef)).size).toBe(1);
    // And distinct ids, so CB4's primary key does not collide them.
    expect(new Set(h.queued.map((q) => q.id)).size).toBe(3);
  });

  it("says when it truncated, rather than reporting a complete run", async () => {
    const many = Array.from({ length: MAX_DIGEST_QUEUE_PER_RUN }, (_, i) => `usr_${i}`);
    const h = harness({ subscribers: many });
    const res = await route(req(QUEUE, "POST"), env(), h.deps as never);
    expect((await body(res)).queued).toMatchObject({ truncated: true });
  });

  it("is internal, and refuses anything but POST", async () => {
    const h = harness();
    expect((await route(req(QUEUE, "GET"), env(), h.deps as never)).status).toBe(405);
    const publicAttempt = await route(
      new Request("https://openproduct.live/openproduct/digest/queue", { method: "POST" }),
      env(),
    );
    expect(publicAttempt.status).toBe(404);
  });
});

describe("core hands out pending and is TOLD what went", () => {
  const pending = [
    { id: "row-1", subjectId: "usr_a", eventRef: "digest:2026-W34" },
    { id: "row-2", subjectId: "usr_b", eventRef: "digest:2026-W34" },
  ];

  it("hands out a delivery with three fields, none of them an address", async () => {
    const h = harness({ pending });
    const res = await route(req(PENDING), env(), h.deps as never);
    const out = (await body(res)).pending as Array<Record<string, unknown>>;
    expect(out).toHaveLength(2);
    expect(Object.keys(out[0]!).sort()).toEqual(["link", "subjectId", "week"]);
    expect(out[0]).toEqual({
      subjectId: "usr_a",
      week: "2026-W34",
      link: "/digest/2026-W34",
    });
    // I3 — the row id is core's own bookkeeping and does not cross.
    expect(JSON.stringify(out)).not.toContain("row-1");
  });

  it("marks what went and increments an attempt on the rest", async () => {
    const h = harness({ pending });
    const res = await route(
      req(DELIVERED, "POST", { delivered: ["usr_a"], attempted: ["usr_a", "usr_b"] }),
      env(),
      h.deps as never,
    );
    expect(await body(res)).toEqual({ sent: 1, failed: 1 });
    expect(h.markedDelivered[0]).toEqual(["row-1"]);
    // A FAILURE STAYS QUEUED with an attempt against it, bounded by the
    // outbox ceiling — one permanently failing subscriber must not hold up
    // everybody behind them, and must not be retried forever either.
    expect(h.attempts[0]).toEqual(["row-2"]);
  });

  it("matches on the subject id core already knows, so a bad report marks nothing", async () => {
    const h = harness({ pending });
    await route(
      req(DELIVERED, "POST", { delivered: ["usr_nobody"], attempted: ["usr_nobody"] }),
      env(),
      h.deps as never,
    );
    expect(h.markedDelivered[0]).toEqual([]);
    expect(h.attempts[0]).toEqual([]);
  });

  it("does nothing on an empty report", async () => {
    const h = harness({ pending });
    const res = await route(req(DELIVERED, "POST", { delivered: [], attempted: [] }), env(), h.deps as never);
    expect(await body(res)).toEqual({ sent: 0, failed: 0 });
    expect(h.markedDelivered).toEqual([]);
  });

  it("never calls out — there is no delivery function to call", async () => {
    // SN1's division: core knows who is waiting and holds the database, the
    // gateway can reach the internet. An earlier draft had core taking a
    // `deliver` dep, which would have been a worker with no network reaching
    // for the network.
    const h = harness({ pending });
    expect("deliver" in (h.deps as unknown as Record<string, unknown>)).toBe(false);
  });

  it("is internal, with the right methods", async () => {
    const h = harness();
    expect((await route(req(PENDING, "POST"), env(), h.deps as never)).status).toBe(405);
    expect((await route(req(DELIVERED, "GET"), env(), h.deps as never)).status).toBe(405);
    const publicAttempt = await route(
      new Request("https://openproduct.live/openproduct/digest/pending", { method: "GET" }),
      env(),
    );
    expect(publicAttempt.status).toBe(404);
  });
});
