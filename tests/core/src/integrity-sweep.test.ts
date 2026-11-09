// The integrity sweep (openproduct-commons EN3).
//
// The MODEL is tested in packages/contracts against synthetic fixtures. What
// is pinned here is the SWEEP around it:
//
//   - it restates rather than deletes, and reverses what it no longer holds
//   - every restatement that moved a number leaves an audit row
//   - the audit row carries counts and listings and NEVER a subject id
//   - the route is internal, so a public request cannot trigger a week-long
//     scan by holding down refresh
//   - the disclosure is by reason, and by nothing else

import { assessIntegrity } from "@openproduct/contracts";
import type { AppendAuditInput, OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { IntegrityHandlerDeps } from "@openproduct-worker/handlers/integrity";

const BASE = "https://openproduct.internal/internal/openproduct/endorsements";
const SWEEP = `${BASE}/integrity-sweep`;
const DISCLOSURE = `${BASE}/integrity-disclosure`;
const NOW = Date.parse("2026-08-26T12:00:00.000Z");

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(url: string, method = "POST"): Request {
  return new Request(url, { method, headers: { "x-request-id": "req_en3" } });
}

interface Harness {
  deps: IntegrityHandlerDeps;
  audits: AppendAuditInput[];
  restatements: Array<{ findings: unknown[]; windowStart: string; decidedBy: string }>;
  observations: Array<{
    profileId: string;
    subjectId: string;
    createdAt: string;
    subjectFirstSeenAt: string;
  }>;
  result: { applied: number; reversed: number; touchedProfileIds: string[] };
  /** The floor's state, so a test can put the sweep just inside or outside it. */
  state: { sweptAt: string | null };
  marks: string[];
  written: Array<{ profileId: string; metric: string; window: string; value: number }>;
}

/** A ring: three accounts, five listings each, minutes apart. */
function ringRows(): Harness["observations"] {
  const rows: Harness["observations"] = [];
  for (let s = 0; s < 3; s += 1) {
    for (let l = 0; l < 5; l += 1) {
      rows.push({
        subjectId: `usr_ring${s}`,
        profileId: `11111111-1111-4111-8111-00000000000${l}`,
        createdAt: new Date(NOW - 60 * 60 * 1000 + s * 60_000 + l * 1000).toISOString(),
        subjectFirstSeenAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
      });
    }
  }
  return rows;
}

function harness(observations: Harness["observations"] = []): Harness {
  const audits: AppendAuditInput[] = [];
  const restatements: Harness["restatements"] = [];
  const result = { applied: 0, reversed: 0, touchedProfileIds: [] as string[] };
  const disclosure = [{ reason: "ring", discounted: 15 }];
  const state: { sweptAt: string | null } = { sweptAt: null };
  const marks: string[] = [];
  const written: Array<{ profileId: string; metric: string; window: string; value: number }> = [];
  // PV3 — the mark, written beside the totals by the same function.
  const cleanMarks: Array<{ profileId: string; clean: boolean }> = [];

  const repo = {
    async listEndorsementsForIntegrity() {
      return observations;
    },
    async restateIntegrity(input: { findings: unknown[]; windowStart: string; decidedBy: string }) {
      restatements.push(input);
      return result;
    },
    async integrityDisclosure() {
      return disclosure;
    },
    async appendAudit(input: AppendAuditInput) {
      audits.push(input);
    },
    // EN2 — the restatement republishes the totals it moved.
    //
    // PV3 — `discounted` rides here too, because the same function computes
    // the clean-vote mark from it. Two of seven is over the 5% ratio, so this
    // listing is deliberately NOT clean: the harness's ordinary case should be
    // the one where the mark is withheld, since that is most listings.
    async countEndorsements() {
      return { total: 7, recent: 2, discounted: 2 };
    },
    async setCleanVotes(profileId: string, clean: boolean) {
      cleanMarks.push({ profileId, clean });
    },
    async writeMetric(input: { profileId: string; metric: string; window: string; value: number }) {
      written.push(input);
    },
    async getIntegritySweptAt() {
      return state.sweptAt;
    },
    async markIntegritySwept(at: string) {
      marks.push(at);
      state.sweptAt = at;
    },
  } as unknown as OpenproductRepository;

  return {
    deps: { repo, now: () => NOW } as IntegrityHandlerDeps,
    audits,
    restatements,
    observations,
    result,
    state,
    marks,
    written,
  };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("the sweep restates, and never deletes", () => {
  it("hands the model's findings to the repository verbatim", async () => {
    const h = harness(ringRows());
    h.result.applied = 15;
    h.result.touchedProfileIds = ["11111111-1111-4111-8111-000000000000"];

    const res = await route(req(SWEEP), env(), h.deps as never);
    expect(res.status).toBe(200);

    // The handler does not second-guess the model: what the pure assessor
    // decided is what gets written. A handler that filtered would be a second
    // integrity model nobody tested.
    const expected = assessIntegrity(
      h.observations.map((o) => ({
        profileId: o.profileId,
        subjectId: o.subjectId,
        createdAt: Date.parse(o.createdAt),
        subjectFirstSeenAt: Date.parse(o.subjectFirstSeenAt),
      })),
    ).discount;
    expect(h.restatements).toHaveLength(1);
    expect(h.restatements[0]!.findings).toEqual(
      expected.map((f) => ({ profileId: f.profileId, subjectId: f.subjectId, reason: f.reason })),
    );
    expect(h.restatements[0]!.decidedBy).toBe("automatic");
  });

  it("bounds the reversal to the window it actually looked at", async () => {
    const h = harness(ringRows());
    const swept = (await json(await route(req(SWEEP), env(), h.deps as never))).swept as Record<
      string,
      unknown
    >;
    // Without the window bound, a short sweep would silently restore every
    // historical discount it simply did not read — a ring caught last month
    // coming back because today's sweep only looked at today.
    const windowStart = h.restatements[0]!.windowStart;
    expect(Date.parse(windowStart)).toBe(NOW - 7 * 24 * 60 * 60 * 1000);
    // The same window is reported, so an operator reading the response knows
    // what the reversal was allowed to touch.
    expect(swept.windowStart).toBe(windowStart);
  });

  it("reports what it did, including the rings it found", async () => {
    const h = harness(ringRows());
    h.result.applied = 15;
    h.result.touchedProfileIds = ["a", "b"];
    const swept = (await json(await route(req(SWEEP), env(), h.deps as never))).swept as Record<
      string,
      unknown
    >;
    expect(swept.observations).toBe(15);
    expect(swept.rings).toBe(1);
    expect(swept.applied).toBe(15);
    expect(swept.touched).toBe(2);
    expect(swept.truncated).toBe(false);
  });

  it("says when it read as much as it is allowed to", async () => {
    // A limit that silently stops the integrity model is worse than a limit
    // that makes it read less: an operator must be able to see a sweep that
    // needs a shorter window rather than one that is quietly half-blind.
    const many = Array.from({ length: 50_000 }, (_, i) => ({
      subjectId: `usr_${i}`,
      profileId: `p-${i}`,
      createdAt: new Date(NOW - 1000).toISOString(),
      subjectFirstSeenAt: new Date(NOW - 1000).toISOString(),
    }));
    const h = harness(many);
    const swept = (await json(await route(req(SWEEP), env(), h.deps as never))).swept as Record<
      string,
      unknown
    >;
    expect(swept.truncated).toBe(true);
  });
});

describe("every restatement that moved a number is accountable", () => {
  it("writes an audit row when something changed", async () => {
    const h = harness(ringRows());
    h.result.applied = 15;
    h.result.reversed = 2;
    h.result.touchedProfileIds = ["11111111-1111-4111-8111-000000000000"];

    await route(req(SWEEP), env(), h.deps as never);
    expect(h.audits).toHaveLength(1);
    const audit = h.audits[0]!;
    expect(audit.type).toBe("openproduct.endorsement_integrity_restated");
    expect(audit.actorId).toBe("integrity-sweep");
    expect(audit.payload).toMatchObject({ applied: 15, reversed: 2, rings: 1 });
  });

  it("writes NOTHING when the sweep changed nothing", async () => {
    // An audit trail where most rows say "no change" is a trail nobody reads,
    // and the rows that matter are the ones that moved a public number.
    const h = harness(ringRows());
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.audits).toEqual([]);
  });

  it("carries NO SUBJECT ID anywhere in the audit row (EN-4)", async () => {
    // A per-person integrity record in an audit log is still a per-person
    // integrity record. The row carries counts and the listings whose totals
    // moved, and that is the whole of it.
    const h = harness(ringRows());
    h.result.applied = 15;
    h.result.touchedProfileIds = ["11111111-1111-4111-8111-000000000000"];
    await route(req(SWEEP), env(), h.deps as never);

    const serialised = JSON.stringify(h.audits[0]);
    expect(serialised).not.toContain("usr_ring0");
    expect(serialised).not.toContain("usr_");
    expect(serialised).not.toContain("subjectId");
    // ...but the listings ARE there, because a restatement nobody can trace
    // to the totals it moved is a number nobody can check.
    expect(serialised).toContain("touchedProfileIds");
  });

  it("says nothing about an individual in the RESPONSE either", async () => {
    const h = harness(ringRows());
    h.result.applied = 15;
    const res = await route(req(SWEEP), env(), h.deps as never);
    const body = await res.text();
    expect(body).not.toContain("usr_");
    expect(body).not.toContain("subjectId");
  });
});

describe("the sweep is internal and is not a read", () => {
  it("405s every verb but POST", async () => {
    const h = harness();
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      expect([method, (await route(req(SWEEP, method), env(), h.deps as never)).status]).toEqual([
        method,
        405,
      ]);
    }
  });

  it("is not reachable on the public plane", async () => {
    const h = harness(ringRows());
    const res = await route(
      req("https://openproduct.internal/internal/public/openproduct/endorsements/integrity-sweep"),
      env(),
      h.deps as never,
    );
    // A read that writes is a write amplifier somebody discovers by holding
    // down refresh, and this one walks a week of endorsements.
    //
    // The assertion that carries this is NOT the status code — the public
    // branch refuses every write with a 405 before it looks at the path, so
    // the code says nothing about routing. What matters is that no sweep
    // happened: the repository was never touched.
    expect(res.status).not.toBe(200);
    expect(h.restatements).toEqual([]);
    expect(h.audits).toEqual([]);
  });
});

describe("the disclosure is by reason and by nothing else (EN-4)", () => {
  it("answers counts per reason", async () => {
    const h = harness();
    const data = await json(await route(req(DISCLOSURE, "GET"), env(), h.deps as never));
    const disclosure = data.disclosure as { since: string; byReason: Array<Record<string, unknown>> };
    expect(disclosure.byReason).toEqual([{ reason: "ring", discounted: 15 }]);
    for (const row of disclosure.byReason) {
      // Never a listing, never a subject: either would be an accusation made
      // in public by arithmetic.
      expect(Object.keys(row).sort()).toEqual(["discounted", "reason"]);
    }
  });

  it("clamps the window, and defaults to a week", async () => {
    const h = harness();
    const week = (await json(await route(req(DISCLOSURE, "GET"), env(), h.deps as never)))
      .disclosure as { since: string };
    expect(NOW - Date.parse(week.since)).toBe(7 * 24 * 60 * 60 * 1000);

    const huge = (await json(
      await route(req(`${DISCLOSURE}?days=99999`, "GET"), env(), h.deps as never),
    )).disclosure as { since: string };
    expect(NOW - Date.parse(huge.since)).toBe(365 * 24 * 60 * 60 * 1000);

    const nonsense = (await json(
      await route(req(`${DISCLOSURE}?days=-3`, "GET"), env(), h.deps as never),
    )).disclosure as { since: string };
    expect(NOW - Date.parse(nonsense.since)).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("405s a write", async () => {
    const h = harness();
    expect((await route(req(DISCLOSURE, "POST"), env(), h.deps as never)).status).toBe(405);
  });
});

describe("the floor lives in the database, not in worker memory", () => {
  it("does the expensive read only when it is due", async () => {
    const h = harness(ringRows());
    let reads = 0;
    (h.deps.repo as unknown as { listEndorsementsForIntegrity: () => Promise<unknown[]> })
      .listEndorsementsForIntegrity = async () => {
      reads += 1;
      return h.observations;
    };

    expect((await json(await route(req(SWEEP), env(), h.deps as never))).swept).not.toBeNull();
    expect(reads).toBe(1);

    // A second tick, well inside the hour. THE CHECK IS BEFORE THE READ:
    // checking after would mean the not-due path still walked a week of
    // endorsements, which is the entire cost the floor exists to avoid.
    const second = await json(await route(req(SWEEP), env(), h.deps as never));
    expect(second.swept).toBeNull();
    expect(second.reason).toBe("not_due");
    expect(reads).toBe(1);
  });

  it("sweeps again once the hour has passed", async () => {
    const h = harness(ringRows());
    h.state.sweptAt = new Date(NOW - 61 * 60 * 1000).toISOString();
    expect((await json(await route(req(SWEEP), env(), h.deps as never))).swept).not.toBeNull();
  });

  it("sweeps when one has NEVER run", async () => {
    // Null means never, which is due: a fresh estate should assess as soon as
    // it is asked to rather than waiting out a floor it has not started.
    const h = harness(ringRows());
    expect(h.state.sweptAt).toBeNull();
    expect((await json(await route(req(SWEEP), env(), h.deps as never))).swept).not.toBeNull();
  });

  it("honours an explicit force", async () => {
    const h = harness(ringRows());
    await route(req(SWEEP), env(), h.deps as never);
    const forced = await json(await route(req(`${SWEEP}?force=1`), env(), h.deps as never));
    expect(forced.swept).not.toBeNull();
  });

  it("marks the floor AFTER the restatement, never before", async () => {
    // A sweep that crashed half-way must be due again. Recording the ATTEMPT
    // rather than the completion would silently skip an hour of assessment
    // for every failure — an integrity model that quietly assesses less the
    // more often it breaks.
    const h = harness(ringRows());
    const order: string[] = [];
    (h.deps.repo as unknown as { restateIntegrity: () => Promise<unknown> }).restateIntegrity =
      async () => {
        order.push("restate");
        return h.result;
      };
    (h.deps.repo as unknown as { markIntegritySwept: (at: string) => Promise<void> })
      .markIntegritySwept = async () => {
      order.push("mark");
    };
    await route(req(SWEEP), env(), h.deps as never);
    expect(order).toEqual(["restate", "mark"]);
  });

  it("does not mark the floor when the restatement threw", async () => {
    const h = harness(ringRows());
    (h.deps.repo as unknown as { restateIntegrity: () => Promise<unknown> }).restateIntegrity =
      async () => {
        throw new Error("database went away");
      };
    const res = await route(req(SWEEP), env(), h.deps as never);
    expect(res.status).toBe(500);
    // The next tick tries again. A failed sweep leaves the PREVIOUS
    // assessment standing, which is the right failure: totals stay as they
    // were rather than reverting to undefended.
    expect(h.marks).toEqual([]);
  });
});

describe("EN2 — the restatement republishes the totals it moved", () => {
  it("recomputes every listing whose discount changed", async () => {
    const h = harness(ringRows());
    h.result.applied = 15;
    h.result.touchedProfileIds = ["listing-a", "listing-b"];

    const swept = (await json(await route(req(SWEEP), env(), h.deps as never))).swept as Record<
      string,
      unknown
    >;
    expect(swept.republished).toBe(2);
    // Both windows for both listings, so a surface reading either gets a
    // figure that already reflects the discount.
    expect(h.written.map((w) => `${w.profileId}:${w.metric}.${w.window}`)).toEqual([
      "listing-a:endorsements.total",
      "listing-a:endorsements.7d",
      "listing-b:endorsements.total",
      "listing-b:endorsements.7d",
    ]);
  });

  it("republishes BEFORE it marks the floor", async () => {
    // A total that ignored the integrity model until the next endorse on that
    // listing is a total the model does not actually defend — a discounted
    // ring would keep counting until somebody happened to click.
    const h = harness(ringRows());
    h.result.applied = 15;
    h.result.touchedProfileIds = ["listing-a"];
    const order: string[] = [];
    (h.deps.repo as unknown as { writeMetric: () => Promise<void> }).writeMetric = async () => {
      order.push("write");
    };
    (h.deps.repo as unknown as { markIntegritySwept: () => Promise<void> }).markIntegritySwept =
      async () => {
        order.push("mark");
      };
    await route(req(SWEEP), env(), h.deps as never);
    expect(order).toEqual(["write", "write", "mark"]);
  });

  it("recomputes nothing when nothing was restated", async () => {
    const h = harness(ringRows());
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.written).toEqual([]);
  });

  it("a failed recompute does not stop the rest, and is counted honestly", async () => {
    // A half-recomputed set is strictly better than an un-recomputed one, and
    // the number returned has to say how much actually landed rather than how
    // many were attempted.
    const h = harness(ringRows());
    h.result.applied = 1;
    h.result.touchedProfileIds = ["bad", "good"];
    (h.deps.repo as unknown as { countEndorsements: (id: string) => Promise<unknown> })
      .countEndorsements = async (id: string) => {
      if (id === "bad") throw new Error("connection reset");
      return { total: 3, recent: 1, discounted: 0 };
    };
    const swept = (await json(await route(req(SWEEP), env(), h.deps as never))).swept as Record<
      string,
      unknown
    >;
    expect(swept.republished).toBe(1);
    expect(h.written.map((w) => w.profileId)).toEqual(["good", "good"]);
  });
});
