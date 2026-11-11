// The ingestion door (openproduct-commons SN1).
//
// What is pinned: an `ok: false` observation writes NO metric; the metric and
// activity vocabularies are closed at the door and not merely in the schema;
// and the wire carries public ids, never the row's uuid.

import {
  METRICS,
  METRIC_WINDOWS,
  REPO_SIGNAL_SOURCES,
  SIGNAL_SOURCES,
  SOURCE_FAILURE_TOLERANCE,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";

const PROFILE_UUID = "55555555-5555-4555-8555-555555555555";
const PROFILE_PUBLIC = "opp_55555555555545558555555555555555";
const BASE = "https://openproduct.internal/internal/openproduct/signals";

interface Harness {
  deps: ProfileHandlerDeps;
  metrics: Array<{ metric: string; window: string; value: number }>;
  activity: Array<{ kind: string; summary: string; actorSubjectId: string | null }>;
  failures: Array<{ error: string; withdrawAfter: number }>;
  successes: number;
  /** OB2 — what the due queue declared before it read, in call order. */
  seeds: string[];
  /** OB2 — repository rows the sweep's observation wrote. */
  repoWrites: Array<Record<string, unknown>>;
}

function harness(): Harness {
  const h: Harness = {
    deps: {} as ProfileHandlerDeps,
    metrics: [],
    activity: [],
    failures: [],
    successes: 0,
    seeds: [],
    repoWrites: [],
  };
  const repo = {
    async seedDeclaredRepoSources(at: string) {
      h.seeds.push(at);
      return { seeded: 0, withdrawn: 0 };
    },
    async recordRepoObservation(_profileId: string, observation: Record<string, unknown>) {
      h.repoWrites.push(observation);
      return null;
    },
    async listDueSignalSources() {
      h.seeds.push("listed");
      return [
        {
          profileId: PROFILE_UUID,
          source: "linked_repo" as const,
          locator: "acme/thing",
          lastSuccessAt: null,
          failureCount: 0,
          lastError: null,
          withdrawnAt: null,
          slug: "acme-thing",
          repoUrl: "https://github.com/acme/thing",
        },
      ];
    },
    async writeMetric(input: { metric: string; window: string; value: number }) {
      h.metrics.push({ metric: input.metric, window: input.window, value: input.value });
    },
    async appendActivity(input: { kind: string; summary: string; actorSubjectId?: string | null }) {
      h.activity.push({
        kind: input.kind,
        summary: input.summary,
        actorSubjectId: input.actorSubjectId ?? null,
      });
    },
    async recordSignalSuccess() {
      h.successes += 1;
    },
    async recordSignalFailure(_p: string, _s: string, error: string, _at: string, withdrawAfter: number) {
      h.failures.push({ error, withdrawAfter });
      return null;
    },
  } as unknown as OpenproductRepository;
  h.deps = { repo } as ProfileHandlerDeps;
  return h;
}

function post(body: unknown): Request {
  return new Request(`${BASE}/observation`, {
    method: "POST",
    headers: { "x-request-id": "req_sig", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ENV = { ENVIRONMENT: "test" } as Env;

describe("the due queue", () => {
  it("answers with PUBLIC ids and the listing's coordinates", async () => {
    const h = harness();
    const res = await route(
      new Request(`${BASE}/due`, { method: "GET", headers: { "x-request-id": "req_due" } }),
      ENV,
      h.deps,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { sources: Array<Record<string, unknown>> } };
    const source = body.data.sources[0]!;
    // Internal uuids do not cross the boundary to the gateway.
    expect(source.profileId).toBe(PROFILE_PUBLIC);
    expect(source.profileId).not.toBe(PROFILE_UUID);
    expect(source.repoUrl).toBe("https://github.com/acme/thing");
  });

  it("needs no actor — the sweep is not a person, and the binding is the authorization", async () => {
    const h = harness();
    const res = await route(
      new Request(`${BASE}/due`, { method: "GET", headers: { "x-request-id": "req_due" } }),
      ENV,
      h.deps,
    );
    expect(res.status).toBe(200);
  });
});

describe("every public repo is watched (OB2)", () => {
  it("declares the sources BEFORE reading the queue, so a new build is due on its first sweep", async () => {
    const h = harness();
    await route(
      new Request(`${BASE}/due`, { method: "GET", headers: { "x-request-id": "req_due" } }),
      ENV,
      h.deps,
    );
    expect(h.seeds).toHaveLength(2);
    expect(h.seeds[1]).toBe("listed");
    expect(Number.isNaN(Date.parse(h.seeds[0]!))).toBe(false);
  });

  it("refreshes the observed row from the sweep's repository read", async () => {
    const h = harness();
    const res = await route(
      post({
        profileId: PROFILE_PUBLIC,
        source: "declared_repo",
        ok: true,
        metrics: [{ metric: "merges", window: "30d", value: 4 }],
        repo: {
          linked: true,
          visibility: "public",
          licence: "MIT",
          name: "thing",
          description: "  A   thing\n built in the open ",
          topics: ["CLI", " db "],
          language: "TypeScript",
          pushedAt: "2026-08-25T09:00:00Z",
          openIssues: 7,
        },
      }),
      ENV,
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(h.repoWrites).toHaveLength(1);
    // The same fail-closed reader the maintainer's check uses.
    expect(h.repoWrites[0]).toMatchObject({
      repoVisibility: "public",
      repoLicence: "MIT",
      repoDescription: "A thing built in the open",
      repoTopics: ["cli", "db"],
      repoLanguage: "TypeScript",
      repoPushedAt: "2026-08-25T09:00:00.000Z",
      repoOpenIssues: 7,
    });
    expect(h.metrics).toEqual([{ metric: "merges", window: "30d", value: 4 }]);
  });

  it("never writes a private answer from the sweep — one hourly 404 unpublishes nobody's facts", async () => {
    const h = harness();
    for (const repo of [
      { linked: true, visibility: "private", licence: null },
      { linked: true, visibility: "PUBLIC" },
      { linked: false },
      "public",
      null,
    ]) {
      const res = await route(
        post({ profileId: PROFILE_PUBLIC, source: "declared_repo", ok: true, metrics: [], repo }),
        ENV,
        h.deps,
      );
      expect(res.status).toBe(200);
    }
    expect(h.repoWrites).toEqual([]);
    expect(h.successes).toBe(5);
  });

  it("writes no repository row on an outage either", async () => {
    const h = harness();
    await route(
      post({
        profileId: PROFILE_PUBLIC,
        source: "declared_repo",
        ok: false,
        error: "github_unreachable",
        repo: { linked: true, visibility: "public" },
      }),
      ENV,
      h.deps,
    );
    expect(h.repoWrites).toEqual([]);
  });
});

describe("an outage is never an observation", () => {
  it("records a failure and writes NO metric", async () => {
    const h = harness();
    const res = await route(
      post({ profileId: PROFILE_PUBLIC, source: "linked_repo", ok: false, error: "github_unreachable" }),
      ENV,
      h.deps,
    );
    expect(res.status).toBe(200);
    expect(h.failures).toEqual([
      { error: "github_unreachable", withdrawAfter: SOURCE_FAILURE_TOLERANCE },
    ]);
    // The claim, stated as an absence.
    expect(h.metrics).toEqual([]);
    expect(h.successes).toBe(0);
  });

  it("writes a genuine zero, because a real zero is information", async () => {
    const h = harness();
    await route(
      post({
        profileId: PROFILE_PUBLIC,
        source: "linked_repo",
        ok: true,
        metrics: [{ metric: "merges", window: "7d", value: 0 }],
      }),
      ENV,
      h.deps,
    );
    expect(h.metrics).toEqual([{ metric: "merges", window: "7d", value: 0 }]);
    expect(h.successes).toBe(1);
  });
});

describe("the vocabularies are closed at the door, not only in the schema", () => {
  it("refuses a metric, window, kind or tier nobody defined", async () => {
    const h = harness();
    for (const body of [
      { profileId: PROFILE_PUBLIC, source: "trust_me", ok: true },
      { profileId: PROFILE_PUBLIC, source: "linked_repo", ok: true, metrics: [{ metric: "vibes", window: "7d", value: 1 }] },
      { profileId: PROFILE_PUBLIC, source: "linked_repo", ok: true, metrics: [{ metric: "merges", window: "fortnight", value: 1 }] },
      { profileId: PROFILE_PUBLIC, source: "linked_repo", ok: true, metrics: [{ metric: "merges", window: "7d", value: "lots" }] },
      { profileId: PROFILE_PUBLIC, source: "linked_repo", ok: true, activity: [{ kind: "shipped", summary: "x" }] },
      { profileId: PROFILE_PUBLIC, source: "linked_repo", ok: true, activity: [{ kind: "merged", summary: "x".repeat(201) }] },
      { profileId: "not-an-id", source: "linked_repo", ok: true },
    ]) {
      const res = await route(post(body), ENV, h.deps);
      expect(res.status).toBe(422);
    }
    expect(h.metrics).toEqual([]);
    expect(h.activity).toEqual([]);
  });

  it("the door's vocabularies ARE the contract's", () => {
    expect(METRICS).toContain("merges");
    expect(METRICS).toContain("last_touched");
    expect([...METRIC_WINDOWS]).toEqual(["7d", "30d", "all"]);
  });

  it("takes the REPOSITORY tiers and refuses `declared_url` (MD0)", async () => {
    // MD0 widened the product's observation vocabulary with `declared_url` —
    // a read of a listing's LIVE ADDRESS, for a screenshot. This door
    // validated against the WIDER list until then, and `signal_sources` has
    // no row shape for one: its rows are keyed on (listing, source) and every
    // write here addresses one. A `declared_url` observation would have
    // matched no row, recorded nothing, and answered 200 — an outage-shaped
    // silence in the one plane built to tell an outage from a zero.
    const h = harness();
    for (const source of REPO_SIGNAL_SOURCES) {
      const res = await route(post({ profileId: PROFILE_PUBLIC, source, ok: true }), ENV, h.deps);
      expect([source, res.status]).toEqual([source, 200]);
    }
    const refused = await route(
      post({ profileId: PROFILE_PUBLIC, source: "declared_url", ok: true }),
      ENV,
      h.deps,
    );
    expect(refused.status).toBe(422);
    // And it is a published source rather than a typo — the point is that it
    // is real and still does not belong here.
    expect(SIGNAL_SOURCES).toContain("declared_url");
    expect(REPO_SIGNAL_SOURCES as readonly string[]).not.toContain("declared_url");
  });
});

describe("ingestion attributes nothing to a person", () => {
  it("writes activity with no actor until CG3 can confirm one", async () => {
    // A name renders only for a confirmed person (OPC-5). Until there is
    // somebody to confirm, the act renders without an actor rather than with
    // a subject id nobody agreed to publish.
    const h = harness();
    await route(
      post({
        profileId: PROFILE_PUBLIC,
        source: "linked_repo",
        ok: true,
        activity: [{ kind: "merged", summary: "Back off on lock contention" }],
      }),
      ENV,
      h.deps,
    );
    expect(h.activity).toEqual([
      { kind: "merged", summary: "Back off on lock contention", actorSubjectId: null },
    ]);
  });
});
