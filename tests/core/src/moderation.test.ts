// Acting on the queue, routed (openproduct-commons TS3).
//
// The act/state ALGEBRA is tested in packages/contracts and the SQL in
// packages/db. What is pinned here is what only a route layer can get wrong,
// and every one of these is a rule with a person on the other end of it:
//
//   - the ledger is written BEFORE the state, so the failure this leaves is
//     an over-record rather than an unappealable removal (TS-4);
//   - only a named operator, and only a human, may act (TS-5);
//   - an act with no reason is refused (TS-4 again: no reason, no appeal);
//   - an act answers its report, so the reporter learns the outcome;
//   - a removed listing's public read is a TOMBSTONE, not a 404 (TS-3), and
//     it carries the state and the date and nothing else.

import { MODERATION_REFUSALS, TOMBSTONE_KEYS } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { ProfileHandlerDeps } from "@openproduct-worker/handlers/profiles";
import type { PublicHandlerDeps } from "@openproduct-worker/handlers/public";

const OPERATOR = "usr_ffffffffffffffffffffffffffffffff";
const STRANGER = "usr_0123456789abcdef0123456789abcdef";
const ACTS = "https://openproduct.internal/internal/openproduct/reports/acts";
const TRIAGE = "https://openproduct.internal/internal/openproduct/reports/triage";
const REPORT = "cccccccc-1111-4111-8111-cccccccccccc";
const NOW = "2026-09-01T09:00:00.000Z";

function env(): Env {
  return { ENVIRONMENT: "test", OPENPRODUCT_OPERATORS: OPERATOR } as Env;
}

function req(
  url: string,
  body?: unknown,
  subjectId: string = OPERATOR,
  subjectType = "user",
  method = "POST",
): Request {
  return new Request(url, {
    method,
    headers: {
      "x-request-id": "req_ts3",
      "content-type": "application/json",
      "x-actor-subject-id": subjectId,
      "x-actor-subject-type": subjectType,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** The order of writes, recorded — because the order IS the guarantee. */
type Write = { kind: "act"; act: string } | { kind: "state"; state: string } | { kind: "resolve" };

interface Harness {
  deps: ProfileHandlerDeps;
  writes: Write[];
  state: { value: "visible" | "delisted" | "removed" };
  /** Make the state write miss, as a concurrent act would. */
  stateWins: { value: boolean };
}

function harness(initial: "visible" | "delisted" | "removed" = "visible"): Harness {
  const writes: Write[] = [];
  const state = { value: initial };
  const stateWins = { value: true };

  const repo = {
    async getPublicProfile(slug: string) {
      if (slug !== "acme-thing") return null;
      return {
        id: "55555555-5555-4555-8555-555555555555",
        slug,
        moderationState: state.value,
        moderatedAt: state.value === "visible" ? null : NOW,
        moderationActId: null,
        updatedAt: NOW,
      } as unknown as Awaited<ReturnType<OpenproductRepository["getPublicProfile"]>>;
    },
    async appendModerationAct(input: { act: string }) {
      writes.push({ kind: "act", act: input.act });
      return { id: "act", ...input } as never;
    },
    async setListingModerationState(input: { state: string }) {
      if (!stateWins.value) return null;
      writes.push({ kind: "state", state: input.state });
      state.value = input.state as typeof state.value;
      return { slug: "acme-thing", moderationState: input.state, moderatedAt: NOW } as never;
    },
    async resolveReport() {
      writes.push({ kind: "resolve" });
      return { id: REPORT, state: "actioned", subjectKind: "listing", subjectRef: "acme-thing" } as never;
    },
    async triageReport() {
      return { id: REPORT, state: "triaged" } as never;
    },
    // UV1 — the placement's two reads. Empty by default: a listing that has
    // never launched is the common case, and the ABSENT `launch` key is what
    // the pinned key set asserts.
    async listLaunchesForProfile() {
      return [];
    },
    async readBoardRanks() {
      return [];
    },
  } as unknown as OpenproductRepository;

  return { deps: { repo } as unknown as ProfileHandlerDeps, writes, state, stateWins };
}

const REASON = "spam, and the maintainer has been told";

describe("only a named person may act (TS-5)", () => {
  it("refuses somebody who is not on the operator list", async () => {
    const h = harness();
    const res = await route(
      req(ACTS, { act: "delist", slug: "acme-thing", reason: REASON }, STRANGER),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
    expect(h.writes).toEqual([]);
  });

  it("refuses a SERVICE principal even when it holds the operator id", async () => {
    // TS-5 as a route rule: automation flags, discounts and de-indexes. Only
    // a person removes, and a service credential with an operator's id is an
    // automated removal wearing a name.
    const h = harness();
    const res = await route(
      req(ACTS, { act: "remove", slug: "acme-thing", reason: REASON }, OPERATOR, "service"),
      env(),
      h.deps,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { message: MODERATION_REFUSALS["automated-removal"].says },
    });
    expect(h.writes).toEqual([]);
  });
});

describe("no act without a reason (TS-4)", () => {
  it("refuses an empty reason, and writes nothing", async () => {
    const h = harness();
    const res = await route(req(ACTS, { act: "delist", slug: "acme-thing", reason: "  " }), env(), h.deps);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      error: { message: MODERATION_REFUSALS["reason-required"].says },
    });
    expect(h.writes).toEqual([]);
  });
});

describe("the ledger is written before the state", () => {
  it("appends the act, then moves the listing, in that order", async () => {
    // The executor is non-transactional, so the ordering is the guarantee:
    // the failure it leaves is "we recorded an act we did not carry out",
    // never "a listing was removed and nothing says who did it or why".
    const h = harness();
    const res = await route(req(ACTS, { act: "delist", slug: "acme-thing", reason: REASON }), env(), h.deps);
    expect(res.status).toBe(200);
    expect(h.writes).toEqual([{ kind: "act", act: "delist" }, { kind: "state", state: "delisted" }]);
  });

  it("keeps the ledger row when the state write loses a race", async () => {
    // Somebody else acted first. The act stands — it is append-only and
    // honest about what was attempted — and the caller is told the transition
    // no longer applies rather than shown a success that did not happen.
    const h = harness();
    h.stateWins.value = false;
    const res = await route(req(ACTS, { act: "delist", slug: "acme-thing", reason: REASON }), env(), h.deps);
    expect(res.status).toBe(409);
    expect(h.writes).toEqual([{ kind: "act", act: "delist" }]);
  });
});

describe("the transition table is the API's, not the caller's", () => {
  it("refuses restore on a DELISTED listing — relist is its undo", async () => {
    const h = harness("delisted");
    const res = await route(req(ACTS, { act: "restore", slug: "acme-thing", reason: REASON }), env(), h.deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { message: MODERATION_REFUSALS["illegal-transition"].says },
    });
    // Nothing written: an act recorded under the wrong name answers an appeal
    // wrongly for ever, because the ledger cannot be edited.
    expect(h.writes).toEqual([]);
  });

  it("refuses an act that moves no listing state at all", async () => {
    const h = harness();
    const res = await route(req(ACTS, { act: "trust_promote", slug: "acme-thing", reason: REASON }), env(), h.deps);
    expect(res.status).toBe(422);
    expect(h.writes).toEqual([]);
  });

  it("404s a slug that names nothing", async () => {
    const h = harness();
    const res = await route(req(ACTS, { act: "delist", slug: "no-such-thing", reason: REASON }), env(), h.deps);
    expect(res.status).toBe(404);
    expect(h.writes).toEqual([]);
  });
});

describe("the reporter is told the outcome", () => {
  it("resolves the report the act answered, in the same call", async () => {
    const h = harness();
    await route(
      req(ACTS, { act: "remove", slug: "acme-thing", reason: REASON, reportId: REPORT }),
      env(),
      h.deps,
    );
    expect(h.writes.map((w) => w.kind)).toEqual(["act", "state", "resolve"]);
  });

  it("a decline records an act too — TS5 counts what we decided not to do", async () => {
    const h = harness();
    const res = await route(req(TRIAGE, { reportId: REPORT, decision: "decline", reason: REASON }), env(), h.deps);
    expect(res.status).toBe(200);
    // An estate that publishes only its removals is publishing a boast.
    expect(h.writes.map((w) => w.kind)).toEqual(["resolve", "act"]);
  });

  it("claiming touches no content and needs no reason", async () => {
    const h = harness();
    const res = await route(req(TRIAGE, { reportId: REPORT, decision: "claim" }), env(), h.deps);
    expect(res.status).toBe(200);
    expect(h.writes).toEqual([]);
  });
});

describe("a removed listing renders a tombstone, not a 404 (TS-3)", () => {
  function publicHarness(moderationState: "visible" | "delisted" | "removed") {
    const repo = {
      async getPublicProfile(slug: string) {
        if (slug !== "acme-thing") return null;
        return {
          id: "55555555-5555-4555-8555-555555555555",
          slug,
          tagline: "A thing",
          stack: [],
          stackCanonical: [],
          components: null,
          moderationState,
          moderatedAt: moderationState === "visible" ? null : NOW,
          moderationActId: null,
          publishedAt: NOW,
          updatedAt: NOW,
          indexable: true,
        } as unknown as Awaited<ReturnType<OpenproductRepository["getPublicProfile"]>>;
      },
      // MD2 — the media rows; none on these fixtures.
      async listPublicMedia() {
        return [];
      },
      async listPublicMaintainers() {
        return [];
      },
      // PP1 — the follower count the profile now carries (WC2-7: a number, never a list).
      async countFollowers() {
        return new Map<string, number>();
      },
      async latestSnapshotBefore() {
        return null;
      },
      async listPublicRoleOpenings() {
        return [];
      },
      async latestMetrics() {
        return [];
      },
      // CB2 — no openings in this fixture, so no demand to count.
      async countOpeningDemand() {
        return [];
      },
  
    // UV1 — the placement's two reads. Empty by default: a listing that has
    // never launched is the common case, and the ABSENT `launch` key is what
    // the pinned key set asserts.
    async listLaunchesForProfile() {
      return [];
    },
    async readBoardRanks() {
      return [];
    },
  } as unknown as OpenproductRepository;
    return { repo } as unknown as PublicHandlerDeps;
  }

  const url = "https://openproduct.internal/internal/public/openproduct/projects/acme-thing";

  it("answers 200 with a tombstone, so the address keeps working", async () => {
    const res = await route(new Request(url), env(), undefined, publicHarness("removed"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { tombstone: Record<string, unknown>; profile?: unknown } };
    // I2 — exactly two keys. Not the reason, not the actor, not the reporter.
    expect(Object.keys(body.data.tombstone).sort()).toEqual([...TOMBSTONE_KEYS].sort());
    expect(body.data.tombstone).toEqual({ state: "removed", at: NOW });
    // And the listing itself is gone from the response, not merely hidden by
    // the page: a removed listing's content must not travel over the wire.
    expect(body.data.profile).toBeUndefined();
  });

  it("a DELISTED listing keeps its whole page AND says so", async () => {
    const res = await route(new Request(url), env(), undefined, publicHarness("delisted"));
    const body = (await res.json()) as { data: { tombstone?: unknown; profile?: unknown } };
    expect(body.data.profile).toBeDefined();
    expect(body.data.tombstone).toEqual({ state: "delisted", at: NOW });
  });

  it("a visible listing carries NO tombstone key at all", async () => {
    // Absent rather than null, so the ordinary response is byte-identical to
    // what it was before TS3 existed (I2's exact key sets).
    const res = await route(new Request(url), env(), undefined, publicHarness("visible"));
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect("tombstone" in body.data).toBe(false);
  });
});
