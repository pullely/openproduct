// The launch scheduler, routed (openproduct-commons LC0).
//
// The RULES are tested in packages/contracts and the SQL in packages/db. What
// is pinned here is that the routes ask those rules and decide nothing
// themselves — and two things a route layer is uniquely able to get wrong:
//
//   1. a maintainer of one listing acting on another listing's launch,
//   2. a refusal arriving as an unactionable error rather than as its reason.

import {
  LAUNCH_REFUSALS,
  STUDIO_LAUNCH_KEYS,
  type StudioLaunch,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import { launchPublicId, orgPublicId, profilePublicId } from "@openproduct-worker/ids";
import type { LaunchHandlerDeps } from "@openproduct-worker/handlers/launches";

const BASE = "https://openproduct.internal";
const OWNER = "usr_0000000000000000000000000000own0";
const STRANGER = "usr_0000000000000000000000000str0000";
const ORG = "11111111-1111-4111-8111-111111111111";
const PROFILE = "55555555-5555-4555-8555-555555555555";
const OTHER = "66666666-6666-4666-8666-666666666666";
const LAUNCH = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_LAUNCH = "aaaaaaaa-0000-4000-8000-000000000002";

const NOW = Date.parse("2026-09-01T09:00:00.000Z");
const SOON = "2026-09-05T09:00:00.000Z";

function env(over: Partial<Env> = {}): Env {
  return { ENVIRONMENT: "test", ...over } as Env;
}

function url(profileId = PROFILE, launchId?: string): string {
  const root = `/internal/openproduct/orgs/${orgPublicId(ORG)}/profiles/${profilePublicId(profileId)}/launches`;
  return launchId ? `${root}/${launchPublicId(launchId)}` : root;
}

function req(path: string, method = "GET", actor: string | null = OWNER, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      "x-request-id": "req_lc0",
      "content-type": "application/json",
      ...(actor ? { "x-actor-subject-id": actor, "x-actor-subject-type": "user" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

interface Row {
  id: string;
  profileId: string;
  state: "scheduled" | "live" | "cancelled" | "missed";
  versionLabel: string;
  scheduledFor: string;
  launchedAt: string | null;
  cancelledAt: string | null;
  missedAt: string | null;
  scheduledBy: string;
}

interface Harness {
  deps: LaunchHandlerDeps;
  rows: Map<string, Row>;
  published: { value: boolean };
  scheduled: string[];
}

function harness(seed: Row[] = []): Harness {
  const rows = new Map<string, Row>(seed.map((r) => [r.id, r]));
  const published = { value: true };
  const scheduled: string[] = [];

  const repo = {
    async getListingRole(_profileId: string, subjectId: string) {
      // OX4's authority table, faked: exactly one person maintains exactly one
      // listing, so "a maintainer of A acting on B" is expressible.
      return subjectId === OWNER ? "owner" : null;
    },
    async launchEligibility(profileId: string) {
      const mine = [...rows.values()].filter((r) => r.profileId === profileId);
      return {
        profileId,
        isPublished: published.value,
        consumedVersions: mine
          .filter((r) => r.state === "scheduled" || r.state === "live")
          .map((r) => r.versionLabel),
        lastLaunchedAt:
          mine
            .filter((r) => r.state === "live")
            .map((r) => r.launchedAt)
            .sort()
            .pop() ?? null,
        hasScheduled: mine.some((r) => r.state === "scheduled"),
      };
    },
    async scheduleLaunch(input: {
      id: string;
      profileId: string;
      versionLabel: string;
      scheduledFor: string;
      scheduledBy: string;
    }) {
      scheduled.push(input.versionLabel);
      const row: Row = {
        id: input.id,
        profileId: input.profileId,
        state: "scheduled",
        versionLabel: input.versionLabel,
        scheduledFor: input.scheduledFor,
        launchedAt: null,
        cancelledAt: null,
        missedAt: null,
        scheduledBy: input.scheduledBy,
      };
      rows.set(row.id, row);
      return row;
    },
    async getLaunch(id: string) {
      return rows.get(id) ?? null;
    },
    async rescheduleLaunch(id: string, scheduledFor: string) {
      const row = rows.get(id);
      if (!row || (row.state !== "scheduled" && row.state !== "missed")) return null;
      const next: Row = { ...row, state: "scheduled", scheduledFor, missedAt: null };
      rows.set(id, next);
      return next;
    },
    async cancelLaunch(id: string, _actor: string, at: string) {
      const row = rows.get(id);
      if (!row || (row.state !== "scheduled" && row.state !== "missed")) return null;
      const next: Row = { ...row, state: "cancelled", cancelledAt: at, missedAt: null };
      rows.set(id, next);
      return next;
    },
    async listLaunchesForProfile(profileId: string) {
      return [...rows.values()].filter((r) => r.profileId === profileId);
    },
    async fireDueLaunches() {
      // NF0 widened this to say WHAT fired, so a caller announcing launches
      // does not have to re-read the day and find a different set.
      return { live: 0, missed: 0, fired: [] as Array<{ slug: string; topic: string | null }> };
    },
    async listTopicFollowers() {
      return [];
    },
    async listListingFollowers() {
      return [];
    },
    async writeNotification() {
      return true;
    },
  } as unknown as OpenproductRepository;

  return {
    deps: { repo, now: () => NOW, generateId: () => LAUNCH as never } as LaunchHandlerDeps,
    rows,
    published,
    scheduled,
  };
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: LAUNCH,
    profileId: PROFILE,
    state: "scheduled",
    versionLabel: "1.0",
    scheduledFor: SOON,
    launchedAt: null,
    cancelledAt: null,
    missedAt: null,
    scheduledBy: OWNER,
    ...over,
  };
}

// The MAINTAINER deps are `route`'s third argument; the fourth is the public
// branch's. Passing them in the wrong slot answers 503 on every route, which
// is how this harness was first written.
async function call(request: Request, h: Harness) {
  const res = await route(request, env(), h.deps as never);
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

describe("LC0 — only this listing's maintainers, and only on THEIR launch", () => {
  it("a stranger gets the resource-hiding 404, never a 403", async () => {
    // "Not yours" and "not there" are one answer (authorize.ts). A 403 would
    // confirm the listing exists to somebody with no business knowing.
    const h = harness();
    for (const [path, method, body] of [
      [url(), "POST", { versionLabel: "1.0", scheduledFor: SOON }],
      [url(), "GET", undefined],
    ] as const) {
      const { status } = await call(req(path, method, STRANGER, body), h);
      expect([method, status]).toEqual([method, 404]);
    }
    expect(h.scheduled).toEqual([]);
  });

  it("a maintainer of ONE listing cannot move ANOTHER listing's launch", async () => {
    // THE BUG A ROUTE LAYER IS UNIQUELY ABLE TO INTRODUCE. Authorization
    // checks the listing in the PATH; without a second check that the launch
    // belongs to it, putting somebody else's launch id in the path moves
    // theirs.
    const h = harness([row({ id: OTHER_LAUNCH, profileId: OTHER })]);
    const { status } = await call(
      req(url(PROFILE, OTHER_LAUNCH), "PATCH", OWNER, { scheduledFor: SOON }),
      h,
    );
    expect(status).toBe(404);
    expect(h.rows.get(OTHER_LAUNCH)!.scheduledFor).toBe(SOON);
    expect(h.rows.get(OTHER_LAUNCH)!.state).toBe("scheduled");
  });
});

describe("LC0 — a refusal arrives as its REASON, with the sentence", () => {
  it("refuses an unpublished listing with `not-published`, at 409", async () => {
    // 409, not 422: the request is well-formed and the WORLD refuses it. And
    // the reason is a stable token the studio branches on while the sentence
    // is what it renders — a caller that cannot act on a refusal has been told
    // nothing.
    const h = harness();
    h.published.value = false;
    const { status, body } = await call(
      req(url(), "POST", OWNER, { versionLabel: "1.0", scheduledFor: SOON }),
      h,
    );
    expect(status).toBe(409);
    const error = (body as unknown as { error: { message: string; details?: { reason?: string } } })
      .error;
    expect(error.details?.reason).toBe("not-published");
    expect(error.message).toBe(LAUNCH_REFUSALS["not-published"].says);
    expect(h.scheduled).toEqual([]);
  });

  it("refuses a duplicate version, and a cooldown, by their own reasons", async () => {
    const live = harness([
      row({ state: "live", versionLabel: "1.0", launchedAt: "2026-08-30T09:00:00.000Z" }),
    ]);
    const dup = await call(
      req(url(), "POST", OWNER, { versionLabel: "1.0", scheduledFor: SOON }),
      live,
    );
    expect(reasonOf(dup.body)).toBe("version-already-launched");

    // A DIFFERENT version inside the window is still refused — the half of the
    // rule that a label cannot argue past.
    const cooled = await call(
      req(url(), "POST", OWNER, { versionLabel: "2.0", scheduledFor: SOON }),
      live,
    );
    expect(reasonOf(cooled.body)).toBe("cooldown");
  });

  it("refuses a moment that is missing or unparseable as a VALIDATION error", async () => {
    // Distinct from a refusal on purpose: a malformed request is the client's
    // mistake and a refused one is the world's, and they need different
    // handling in the studio.
    const h = harness();
    for (const scheduledFor of [undefined, "", "next tuesday", 12345]) {
      const { status } = await call(
        req(url(), "POST", OWNER, { versionLabel: "1.0", scheduledFor }),
        h,
      );
      expect([String(scheduledFor), status]).toEqual([String(scheduledFor), 422]);
    }
  });
});

describe("LC0 — a launch that happened stays happened", () => {
  it("refuses to move or cancel a LIVE launch", async () => {
    const h = harness([row({ state: "live", launchedAt: SOON })]);
    for (const method of ["PATCH", "DELETE"] as const) {
      const { status, body } = await call(
        req(url(PROFILE, LAUNCH), method, OWNER, method === "PATCH" ? { scheduledFor: SOON } : undefined),
        h,
      );
      expect([method, status]).toEqual([method, 409]);
      expect([method, reasonOf(body)]).toEqual([method, "wrong-state"]);
    }
    expect(h.rows.get(LAUNCH)!.state).toBe("live");
  });

  it("lets a MISSED launch be rescheduled — the point of the state", async () => {
    const h = harness([row({ state: "missed", missedAt: "2026-09-02T00:00:00.000Z" })]);
    const { status } = await call(
      req(url(PROFILE, LAUNCH), "PATCH", OWNER, { scheduledFor: "2026-09-20T09:00:00.000Z" }),
      h,
    );
    expect(status).toBe(200);
    expect(h.rows.get(LAUNCH)!.state).toBe("scheduled");
  });

  it("does not treat a launch as a duplicate of ITSELF when moving it", async () => {
    // Moving keeps the label, so the label it already holds must be filtered
    // out before the check — otherwise every reschedule refuses as a duplicate
    // of the thing being rescheduled.
    const h = harness([row({ state: "scheduled", versionLabel: "1.0" })]);
    const { status } = await call(
      req(url(PROFILE, LAUNCH), "PATCH", OWNER, { scheduledFor: "2026-09-20T09:00:00.000Z" }),
      h,
    );
    expect(status).toBe(200);
    expect(h.rows.get(LAUNCH)!.scheduledFor).toBe("2026-09-20T09:00:00.000Z");
  });
});

describe("LC0 — what the studio is handed", () => {
  it("projects EXACTLY the pinned key set, with a public id", async () => {
    const h = harness();
    const { body } = await call(
      req(url(), "POST", OWNER, { versionLabel: "1.0", scheduledFor: SOON }),
      h,
    );
    const launch = (body as unknown as { data: { launch: StudioLaunch } }).data.launch;
    expect(Object.keys(launch).sort()).toEqual([...STUDIO_LAUNCH_KEYS]);
    // A PREFIXED id. A raw UUID in a URL is indistinguishable from any other,
    // so a mistyped path would resolve as somebody else's object.
    expect(launch.id).toMatch(/^lch_[0-9a-f]{32}$/);
    expect(launch.id).not.toContain(LAUNCH);
  });

  it("carries NO subject id anywhere", async () => {
    // `scheduledBy` is on the record and deliberately not on the projection:
    // it is a join key with no business on a screen (I3).
    const h = harness([row()]);
    const { body } = await call(req(url(), "GET", OWNER), h);
    const json = JSON.stringify(body);
    expect(json).not.toContain("usr_");
    expect(json).not.toContain("scheduledBy");
  });

  it("returns the POLICY the API enforces, not the compiled-in default", async () => {
    // A studio stating 180 days against a 90-day deployment has told somebody
    // something false on the surface meant to explain the rules.
    const h = harness();
    const res = await route(
      req(url(), "GET", OWNER),
      env({ OPENPRODUCT_LAUNCH_POLICY: '{"cooldownDays":90}' } as Partial<Env>),
      h.deps as never,
    );
    const body = (await res.json()) as { data: { policy: { cooldownDays: number } } };
    expect(body.data.policy.cooldownDays).toBe(90);
  });

  it("hands back the eligibility WITH the list, in one read", async () => {
    // A form that renders its own idea of the rules and finds out on submit is
    // the failure a shared `checkLaunchable` exists to prevent — but only if
    // the page is given the facts to ask it with.
    const h = harness([row({ state: "live", launchedAt: "2026-08-30T09:00:00.000Z" })]);
    const { body } = await call(req(url(), "GET", OWNER), h);
    const data = (body as unknown as {
      data: { eligibility: { isPublished: boolean; consumedVersions: string[] } };
    }).data;
    expect(data.eligibility.isPublished).toBe(true);
    expect(data.eligibility.consumedVersions).toEqual(["1.0"]);
  });
});

describe("LC0 — the sweep's tick has no actor", () => {
  it("fires without any forwarded identity", async () => {
    // Beside the search rebuild and the integrity sweep, and for the same
    // reason: it is work on a schedule, not a request.
    const h = harness();
    const res = await route(
      new Request(`${BASE}/internal/openproduct/launches/fire`, {
        method: "POST",
        headers: { "x-request-id": "req_lc0" },
      }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toMatchObject({ data: { fired: { live: 0, missed: 0 } } });
  });

  it("refuses a GET on the fire path", async () => {
    const h = harness();
    const res = await route(
      new Request(`${BASE}/internal/openproduct/launches/fire`, {
        headers: { "x-request-id": "req_lc0" },
      }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(405);
  });
});

function reasonOf(body: Record<string, never>): string | undefined {
  return (body as unknown as { error?: { details?: { reason?: string } } }).error?.details?.reason;
}

describe("NF0 — the people who follow a topic hear that something launched in it", () => {
  interface Row {
    subjectId: string;
    kind: string;
    eventKey: string;
    actor: string | null;
    targetKind: string;
    targetRef: string;
  }

  function inboxHarness(over: {
    fired?: Array<{ slug: string; topic: string | null }>;
    followers?: Record<string, string[]>;
    /** PP1 — who follows each LISTING, by slug. */
    listingFollowers?: Record<string, string[]>;
  } = {}) {
    const rows: Row[] = [];
    const asked: Array<{ kind: string; limit: number }> = [];
    const repo = {
      async fireDueLaunches() {
        return { live: (over.fired ?? []).length, missed: 0, fired: over.fired ?? [] };
      },
      async listTopicFollowers(topic: string, limit: number) {
        asked.push({ kind: topic, limit });
        return over.followers?.[topic] ?? ["usr_follower"];
      },
      // PP1 — the listing's own followers, beside the topic's.
      async listListingFollowers(slug: string, limit: number) {
        asked.push({ kind: `listing:${slug}`, limit });
        return over.listingFollowers?.[slug] ?? [];
      },
      async writeNotification(input: Row & { id: string }) {
        rows.push({
          subjectId: input.subjectId,
          kind: input.kind,
          eventKey: input.eventKey,
          actor: input.actor,
          targetKind: input.targetKind,
          targetRef: input.targetRef,
        });
        return true;
      },
    } as unknown as OpenproductRepository;
    return { deps: { repo, now: () => NOW } as unknown as LaunchHandlerDeps, rows, asked };
  }

  function fire(deps: LaunchHandlerDeps) {
    return route(
      new Request(`${BASE}/internal/openproduct/launches/fire`, {
        method: "POST",
        headers: { "x-request-id": "req_nf0" },
      }),
      env(),
      deps as never,
    );
  }

  it("PP1 — tells the people who follow the LISTING that it launched, one row each, beside the topic's", async () => {
    const h = inboxHarness({
      fired: [{ slug: "acme-thing", topic: "developer-tools" }],
      followers: { "developer-tools": ["usr_topic_fan"] },
      listingFollowers: { "acme-thing": ["usr_listing_fan", "usr_both"] },
    });
    const res = await fire(h.deps);
    expect(res.status).toBe(200);
    const listingRows = h.rows.filter((r) => r.kind === "launch.listing");
    expect(listingRows.map((r) => r.subjectId).sort()).toEqual(["usr_both", "usr_listing_fan"]);
    expect(listingRows.every((r) => r.targetKind === "listing" && r.targetRef === "acme-thing")).toBe(true);
    expect(h.rows.filter((r) => r.kind === "launch.topic").map((r) => r.subjectId)).toEqual(["usr_topic_fan"]);
  });

  it("writes one row per follower of the launched product's topic", async () => {
    const h = inboxHarness({
      fired: [{ slug: "acme-thing", topic: "developer-tools" }],
      followers: { "developer-tools": ["usr_ada", "usr_lin"] },
    });
    const res = await fire(h.deps);
    expect(res.status).toBe(200);
    expect(h.rows.map((r) => r.subjectId).sort()).toEqual(["usr_ada", "usr_lin"]);
    expect(new Set(h.rows.map((r) => r.kind))).toEqual(new Set(["launch.topic"]));
    // The row points at the TOPIC, not the product: it is the reason this
    // person is being told, and the page it links to explains itself.
    expect(new Set(h.rows.map((r) => r.targetKind))).toEqual(new Set(["topic"]));
    expect(new Set(h.rows.map((r) => r.targetRef))).toEqual(new Set(["developer-tools"]));
  });

  it("names no actor — the sentence names the topic, not a maintainer", async () => {
    const h = inboxHarness({ fired: [{ slug: "acme-thing", topic: "developer-tools" }] });
    await fire(h.deps);
    expect(h.rows[0]!.actor).toBeNull();
  });

  it("keys the row on the launch AND the topic, so a re-run says nothing twice", async () => {
    const h = inboxHarness({ fired: [{ slug: "acme-thing", topic: "developer-tools" }] });
    await fire(h.deps);
    expect(h.rows[0]!.eventKey).toBe("launch.topic:acme-thing:developer-tools");
    expect(h.rows[0]!.eventKey).not.toMatch(/T\d\d:\d\d/);
  });

  it("says nothing about a launch with no topic — the listing's own followers are still asked (PP1)", async () => {
    const h = inboxHarness({ fired: [{ slug: "acme-thing", topic: null }] });
    await fire(h.deps);
    expect(h.rows).toEqual([]);
    // No topic read at all; one listing read, because a listing can be
    // followed whether or not it chose a topic.
    expect(h.asked.filter((a) => !a.kind.startsWith("listing:"))).toEqual([]);
    expect(h.asked.filter((a) => a.kind.startsWith("listing:"))).toEqual([{ kind: "listing:acme-thing", limit: 5000 }]);
  });

  it("says nothing when nobody follows the topic", async () => {
    const h = inboxHarness({
      fired: [{ slug: "acme-thing", topic: "developer-tools" }],
      followers: { "developer-tools": [] },
    });
    await fire(h.deps);
    expect(h.rows).toEqual([]);
  });

  it("bounds the follower reads — a popular topic or listing is not an unbounded fan-out", async () => {
    const h = inboxHarness({ fired: [{ slug: "acme-thing", topic: "developer-tools" }] });
    await fire(h.deps);
    // One topic read, one listing read (PP1), both bounded.
    expect(h.asked).toHaveLength(2);
    for (const ask of h.asked) expect(ask.limit).toBeGreaterThan(0);
  });

  it("does NOT fail the sweep when the inbox write throws", async () => {
    // A launch going live is the thing that had to happen. Whether we managed
    // to announce it is a separate question.
    const h = inboxHarness({ fired: [{ slug: "acme-thing", topic: "developer-tools" }] });
    (h.deps.repo as unknown as { listTopicFollowers: () => Promise<never> }).listTopicFollowers =
      async () => {
        throw new Error("inbox is down");
      };
    const res = await fire(h.deps);
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toMatchObject({ data: { fired: { live: 1 } } });
  });
});
