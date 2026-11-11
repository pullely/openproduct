// The snapshot sweep's floor (openproduct-scale OS2), and the read pattern it
// replaced.
//
// PV4 SHIPPED THIS HANDLER WITH NO TEST AT THIS LEVEL. The contract's diff had
// nineteen, the repository's rows had twelve, and the handler that decides
// WHEN to read and HOW MANY TIMES had none — which is how a phase with no
// floor and an N+1 read merged behind a green check. These are the claims
// that would have caught it:
//
//   A SECOND TICK ON THE SAME DAY READS ONCE AND WRITES NOTHING. This is the
//   floor, and it is the whole milestone.
//
//   A TICK THAT RUNS MAKES TWO CORPUS READS, NOT TWO PER LISTING. Counted on
//   a fake, so a refactor back to the per-listing shape fails here.
//
//   THE MARK IS WRITTEN UNLESS EVERY ATTEMPT FAILED. A few row failures do
//   not hold the whole corpus hostage; a total failure is retried.

import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { SnapshotHandlerDeps } from "@openproduct-worker/handlers/snapshots";

const SWEEP = "https://openproduct.internal/internal/openproduct/snapshots/sweep";
const ENV = { ENVIRONMENT: "test" } as Env;
const TODAY = new Date("2026-09-10T09:00:00.000Z");

interface Counts {
  floorReads: number;
  corpusReads: number;
  countReads: number;
  writes: number;
  marks: number;
}

function profile(id: string, slug: string) {
  return {
    id,
    slug,
    tagline: `${slug} in one line`,
    pitchBody: "A pitch.",
    installLine: null,
    category: "observability",
    hosting: null,
    stack: ["rust"],
    repoLicence: "MIT",
    repoLanguage: "Rust",
  };
}

function harness(over: {
  sweptAt: string | null;
  profiles?: ReturnType<typeof profile>[];
  openCounts?: Map<string, number>;
  failOn?: Set<string>;
  now?: Date;
}): { deps: SnapshotHandlerDeps; counts: Counts; written: string[] } {
  const counts: Counts = { floorReads: 0, corpusReads: 0, countReads: 0, writes: 0, marks: 0 };
  const written: string[] = [];
  const deps = {
    now: () => over.now ?? TODAY,
    repo: {
      async getSnapshotSweptAt() {
        counts.floorReads += 1;
        return over.sweptAt;
      },
      async markSnapshotSwept() {
        counts.marks += 1;
      },
      async listPublicProfilesForSnapshot() {
        counts.corpusReads += 1;
        return over.profiles ?? [];
      },
      async countOpenRoleOpeningsByProfile() {
        counts.countReads += 1;
        return over.openCounts ?? new Map<string, number>();
      },
      async recordSnapshot(profileId: string) {
        if (over.failOn?.has(profileId)) throw new Error("row refused");
        counts.writes += 1;
        written.push(profileId);
      },
      async latestSnapshotBefore() {
        return null;
      },
    },
  } as unknown as SnapshotHandlerDeps;
  return { deps, counts, written };
}

async function tick(h: ReturnType<typeof harness>) {
  // THIRD argument, not fourth: `route(request, env, injected, injectedPublic)`.
  // Internal routes read `injected`; the public ones read `injectedPublic`.
  // The digest test passes the fourth because the digest is a public route,
  // and copying that shape here handed this internal route `undefined` and a
  // 503 — the kind of mistake an honest test catches on its first run.
  const res = await route(
    new Request(SWEEP, { method: "POST", headers: { "x-request-id": "req_os2" } }),
    ENV,
    h.deps as never,
  );
  const body = (await res.json()) as {
    data: { snapshots: { takenOn: string; recorded: number; failed: number; skipped: boolean } };
  };
  return { status: res.status, result: body.data.snapshots };
}

const CORPUS = [profile("p1", "alpha"), profile("p2", "beta"), profile("p3", "gamma")];

describe("OS2 — the floor", () => {
  it("a second tick on the same day reads ONCE and writes NOTHING", async () => {
    // The defect: before OS2 this tick made 3 × 3 reads and 3 writes, and did
    // so 143 more times before midnight. Now it makes one read.
    const h = harness({ sweptAt: "2026-09-10T00:05:00.000Z", profiles: CORPUS });
    const { status, result } = await tick(h);
    expect(status).toBe(200);
    expect(result.skipped).toBe(true);
    expect(result.recorded).toBe(0);
    expect(h.counts).toEqual({ floorReads: 1, corpusReads: 0, countReads: 0, writes: 0, marks: 0 });
  });

  it("yesterday's sweep does NOT floor today", async () => {
    // The day boundary is UTC and it is the SNAPSHOT'S day that matters: a
    // sweep that completed at 23:59 yesterday leaves today due at 00:00.
    const h = harness({ sweptAt: "2026-09-09T23:59:00.000Z", profiles: CORPUS });
    const { result } = await tick(h);
    expect(result.skipped).toBe(false);
    expect(result.recorded).toBe(3);
  });

  it("a fresh estate (never swept) is due", async () => {
    // Null is the loud case everywhere in this product's sweep state, and
    // here it means "record today" rather than "nothing to do".
    const h = harness({ sweptAt: null, profiles: CORPUS });
    const { result } = await tick(h);
    expect(result.skipped).toBe(false);
    expect(result.recorded).toBe(3);
    expect(h.counts.marks).toBe(1);
  });
});

describe("OS2 — two reads for the corpus, not two per listing", () => {
  it("reads the profiles once and the open counts once, whatever N is", async () => {
    const h = harness({ sweptAt: null, profiles: CORPUS });
    await tick(h);
    // 1 floor + 1 corpus + 1 counts. Before OS2: 1 id-list + 3 profiles + 3
    // openings = 7 reads for three listings, and linear in N.
    expect(h.counts.floorReads).toBe(1);
    expect(h.counts.corpusReads).toBe(1);
    expect(h.counts.countReads).toBe(1);
    expect(h.counts.writes).toBe(3);
  });

  it("reads a listing with no open roles as ZERO open roles", async () => {
    // The one place a missing row is a zero: "no open roles" is a complete
    // answer about a listing we did count (OPC-C's genuine-zero case).
    const h = harness({
      sweptAt: null,
      profiles: [profile("p1", "alpha")],
      openCounts: new Map([["somebody-else", 4]]),
    });
    const fields: Array<Record<string, unknown>> = [];
    (h.deps.repo as unknown as { recordSnapshot: unknown }).recordSnapshot = async (
      _id: string,
      _on: string,
      _at: string,
      f: Record<string, unknown>,
    ) => {
      fields.push(f);
    };
    await tick(h);
    expect(fields[0]?.openRoles).toBe(0);
  });
});

describe("OS2 — the mark", () => {
  it("is written when some rows fail, so one bad listing cannot redo the corpus every tick", async () => {
    const h = harness({ sweptAt: null, profiles: CORPUS, failOn: new Set(["p2"]) });
    const { result } = await tick(h);
    expect(result.recorded).toBe(2);
    expect(result.failed).toBe(1);
    expect(h.counts.marks).toBe(1);
    expect(h.written).toEqual(["p1", "p3"]);
  });

  it("is NOT written when every attempt failed — a corpus-wide failure is retried", async () => {
    // If nothing landed, the engine is the likely cause, and the next tick
    // should try again rather than skip the day.
    const h = harness({ sweptAt: null, profiles: CORPUS, failOn: new Set(["p1", "p2", "p3"]) });
    const { result } = await tick(h);
    expect(result.recorded).toBe(0);
    expect(result.failed).toBe(3);
    expect(h.counts.marks).toBe(0);
  });

  it("is written for an empty corpus, so an empty estate does not re-scan every tick", async () => {
    const h = harness({ sweptAt: null, profiles: [] });
    const { result } = await tick(h);
    expect(result.recorded).toBe(0);
    expect(h.counts.marks).toBe(1);
  });

  it("refuses anything but POST", async () => {
    const h = harness({ sweptAt: null });
    const res = await route(new Request(SWEEP, { method: "GET" }), ENV, h.deps as never);
    expect(res.status).toBe(405);
  });
});
