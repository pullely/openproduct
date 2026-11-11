// The defence sweep (openproduct-commons TS4).
//
// The DETECTORS are tested in packages/contracts, against a corpus that
// measures what they wrongly catch. What is pinned here is the SWEEP around
// them, and every assertion below is about a way the sweep could be wrong
// while every detector was right:
//
//   - a de-index writes a `moderation_acts` row FIRST and the column second
//   - the ledger row names `automatic` and the act `deindex`, which is the
//     only pair 1330's CHECK permits
//   - nothing anywhere in the sweep removes
//   - a re-raise on an already-open flag takes NO consequence a second time,
//     so a cron cannot inflate TS5's numbers by running
//   - the brigade path raises a flag and does nothing else
//   - the audit row carries counts and never a subject id
//   - the route is internal
//   - the floor is checked before the expensive read

import { FLAG_CONSEQUENCE, COHORT_MATURITY_MS } from "@openproduct/contracts";
import type {
  AppendAuditInput,
  AppendModerationActInput,
  OpenproductRepository,
  RaiseFlagInput,
} from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { DefenceHandlerDeps } from "@openproduct-worker/handlers/defence";

const SWEEP = "https://openproduct.internal/internal/openproduct/defence/sweep";
const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(url: string, method = "POST"): Request {
  return new Request(url, { method, headers: { "x-request-id": "req_ts4" } });
}

const EMPTY_PITCH =
  "A revolutionary and innovative platform that empowers teams to unlock their full potential. " +
  "Our cutting-edge solution leverages a robust and scalable architecture to deliver a seamless, " +
  "frictionless experience across the entire ecosystem. Streamline your workflow, elevate your " +
  "output, and supercharge productivity with an intuitive and comprehensive set of powerful " +
  "capabilities designed to transform the way your organisation works. Best-in-class, " +
  "enterprise-grade and delightful from the very first moment.";

const REAL_PITCH =
  "This converts subtitle files between formats. It handles SRT, VTT, ASS and a few others. It " +
  "keeps the timing exactly as it was, which sounds obvious but is where most converters go wrong " +
  "when the source has overlapping cues. It can also shift all the timings by a fixed amount, " +
  "which is what you want when your file is a second and a half out of sync with your video.";

interface Harness {
  deps: DefenceHandlerDeps;
  audits: AppendAuditInput[];
  acts: AppendModerationActInput[];
  flags: RaiseFlagInput[];
  indexable: Array<{ profileId: string; indexable: boolean }>;
  discounts: Array<{ profileId: string; subjectIds: readonly string[]; reason: string }>;
  /** Flags the fake repository will refuse as already open. */
  alreadyOpen: Set<string>;
  state: { sweptAt: string | null };
  marks: string[];
  /** Every SQL-ish write the sweep made, in order, so the ordering assertion
   *  is about the sweep rather than about one method's internals. */
  order: string[];
}

function harness(options: {
  pitches?: Array<{ profileId: string; slug: string; tagline: string | null; pitchBody: string | null }>;
  acts?: Array<{ subjectId: string; targetRef: string; actedAt: string; subjectFirstSeenAt: string }>;
  launches?: Array<{
    launchId: string;
    profileId: string;
    slug: string;
    launchedAt: string;
    endorsements: Array<{ subjectId: string; subjectFirstSeenAt: string }>;
  }>;
  rings?: Array<{ profileId: string; slug: string; discounted: number }>;
} = {}): Harness {
  const audits: AppendAuditInput[] = [];
  const acts: AppendModerationActInput[] = [];
  const flags: RaiseFlagInput[] = [];
  const indexable: Harness["indexable"] = [];
  const discounts: Harness["discounts"] = [];
  const alreadyOpen = new Set<string>();
  const state: { sweptAt: string | null } = { sweptAt: null };
  const marks: string[] = [];
  const order: string[] = [];

  const repo = {
    async listPitchesForDefence() {
      return options.pitches ?? [];
    },
    async listActsForCohorts() {
      return options.acts ?? [];
    },
    async listLaunchEndorsements() {
      return options.launches ?? [];
    },
    async listRingDiscountedProfiles() {
      return options.rings ?? [];
    },
    async raiseFlag(input: RaiseFlagInput) {
      flags.push(input);
      order.push(`flag:${input.kind}:${input.subjectRef}`);
      const key = `${input.subjectKind}|${input.subjectRef}|${input.kind}`;
      if (alreadyOpen.has(key)) return null;
      alreadyOpen.add(key);
      return { ...input, state: "open", raisedAt: input.at, resolvedAt: null, resolvedBy: null };
    },
    async appendModerationAct(input: AppendModerationActInput) {
      acts.push(input);
      order.push(`act:${input.act}:${input.subjectRef}`);
      return { ...input, occurredAt: input.occurredAt };
    },
    async setListingIndexable(profileId: string, value: boolean) {
      indexable.push({ profileId, indexable: value });
      order.push(`indexable:${profileId}`);
      return true;
    },
    async discountCohort(input: Harness["discounts"][number]) {
      discounts.push(input);
      order.push("discount");
      return input.subjectIds.length;
    },
    async appendAudit(input: AppendAuditInput) {
      audits.push(input);
    },
    async getDefenceSweptAt() {
      return state.sweptAt;
    },
    async markDefenceSwept(at: string) {
      marks.push(at);
      state.sweptAt = at;
      order.push("mark");
    },
  } as unknown as OpenproductRepository;

  return {
    deps: { repo, now: () => NOW } as DefenceHandlerDeps,
    audits,
    acts,
    flags,
    indexable,
    discounts,
    alreadyOpen,
    state,
    marks,
    order,
  };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json()) as { data: Record<string, unknown> }).data;
}

describe("nothing in the sweep removes anything (TS4's done-when)", () => {
  it("takes no act other than deindex, over every detector at once", async () => {
    const h = harness({
      pitches: [{ profileId: "p1", slug: "empty-one", tagline: null, pitchBody: EMPTY_PITCH }],
      rings: [{ profileId: "p2", slug: "ringed", discounted: 9 }],
      launches: [
        {
          launchId: "l1",
          profileId: "p3",
          slug: "brigaded",
          launchedAt: new Date(NOW - DAY).toISOString(),
          endorsements: Array.from({ length: 20 }, (_, i) => ({
            subjectId: `new-${i}`,
            subjectFirstSeenAt: new Date(NOW - DAY - 60_000).toISOString(),
          })),
        },
      ],
    });

    await route(req(SWEEP), env(), h.deps as never);

    // Every act this sweep is capable of writing, in one assertion. If a
    // future detector wired itself to `remove`, this is where it would show
    // up — and 1330's CHECK would refuse the row anyway.
    expect([...new Set(h.acts.map((a) => a.act))]).toEqual(["deindex"]);
    for (const act of h.acts) expect(act.actorId).toBe("automatic");
  });

  it("declares a consequence on every flag it raises, from the contract's table", async () => {
    const h = harness({
      pitches: [{ profileId: "p1", slug: "empty-one", tagline: null, pitchBody: EMPTY_PITCH }],
      rings: [{ profileId: "p2", slug: "ringed", discounted: 9 }],
    });
    await route(req(SWEEP), env(), h.deps as never);

    expect(h.flags.length).toBeGreaterThan(0);
    for (const flag of h.flags) {
      // The sweep does not invent a consequence per call site — it reads the
      // one table, so a kind cannot mean one thing here and another there.
      expect(flag.consequence).toBe(FLAG_CONSEQUENCE[flag.kind as keyof typeof FLAG_CONSEQUENCE]);
      expect(["deindex", "discount", "queue-only"]).toContain(flag.consequence);
    }
  });
});

describe("the de-index path", () => {
  it("writes the ledger row before the column, never after", async () => {
    const h = harness({
      pitches: [{ profileId: "p1", slug: "empty-one", tagline: null, pitchBody: EMPTY_PITCH }],
    });
    await route(req(SWEEP), env(), h.deps as never);

    // TS3's ordering rule, inherited. The executor is non-transactional, so
    // the recoverable failure — a recorded act we did not carry out — is the
    // one taken, rather than a listing de-indexed with nothing to appeal.
    const act = h.order.indexOf("act:deindex:empty-one");
    const column = h.order.indexOf("indexable:p1");
    expect(act).toBeGreaterThanOrEqual(0);
    expect(column).toBeGreaterThan(act);
  });

  it("records a reason a person could appeal", async () => {
    const h = harness({
      pitches: [{ profileId: "p1", slug: "empty-one", tagline: null, pitchBody: EMPTY_PITCH }],
    });
    await route(req(SWEEP), env(), h.deps as never);

    const act = h.acts[0]!;
    expect(act.reason.length).toBeGreaterThan(80);
    // It says what SURVIVES, because the whole defence of an automatic
    // consequence is that it took almost nothing away.
    expect(act.reason).toMatch(/remains published/i);
  });

  it("leaves a real pitch alone", async () => {
    const h = harness({
      pitches: [{ profileId: "p1", slug: "subtitles", tagline: "Convert subtitles", pitchBody: REAL_PITCH }],
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.flags).toEqual([]);
    expect(h.acts).toEqual([]);
    expect(h.indexable).toEqual([]);
  });

  it("reads the tagline and the body as one piece of writing", async () => {
    // A placeholder lives in the tagline as often as in the body, and the two
    // are one thing to the reader looking at the page.
    const h = harness({
      pitches: [{ profileId: "p1", slug: "placeholder", tagline: "[Product Name]", pitchBody: REAL_PITCH }],
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.flags.map((f) => f.kind)).toEqual(["filler"]);
  });
});

describe("a cron cannot inflate the numbers by running", () => {
  it("takes no consequence when the flag was already open", async () => {
    const h = harness({
      pitches: [{ profileId: "p1", slug: "empty-one", tagline: null, pitchBody: EMPTY_PITCH }],
    });
    // First sweep: raised, acted on.
    await route(req(`${SWEEP}?force=1`), env(), h.deps as never);
    expect(h.acts).toHaveLength(1);
    expect(h.indexable).toHaveLength(1);

    // Second sweep, same finding, flag still open. The finding has not
    // changed and neither has the world; appending a second ledger row would
    // make TS5's transparency figures a report on cron frequency.
    await route(req(`${SWEEP}?force=1`), env(), h.deps as never);
    expect(h.acts).toHaveLength(1);
    expect(h.indexable).toHaveLength(1);
  });

  it("discounts a cohort once, not once per sweep", async () => {
    const acted = NOW - COHORT_MATURITY_MS - HOUR;
    const acts = Array.from({ length: 5 }, (_, i) => ({
      subjectId: `sub-${i}`,
      targetRef: "listing-a",
      actedAt: new Date(acted + i * 60_000).toISOString(),
      subjectFirstSeenAt: new Date(acted - HOUR + i * 10 * 60_000).toISOString(),
    }));
    const h = harness({ acts });

    await route(req(`${SWEEP}?force=1`), env(), h.deps as never);
    expect(h.discounts).toHaveLength(1);
    await route(req(`${SWEEP}?force=1`), env(), h.deps as never);
    expect(h.discounts).toHaveLength(1);
  });
});

describe("cohorts are discounted as a unit", () => {
  const acted = NOW - COHORT_MATURITY_MS - HOUR;

  it("names every member of the cohort in one restatement", async () => {
    const acts = Array.from({ length: 6 }, (_, i) => ({
      subjectId: `sub-${i}`,
      targetRef: "listing-a",
      actedAt: new Date(acted + i * 60_000).toISOString(),
      subjectFirstSeenAt: new Date(acted - HOUR + i * 10 * 60_000).toISOString(),
    }));
    const h = harness({ acts });
    await route(req(SWEEP), env(), h.deps as never);

    // Half a cohort discounted is a cohort that still works (EN3's third
    // decision, which is about rings and is exactly as true here).
    expect(h.discounts).toHaveLength(1);
    expect(h.discounts[0]!.subjectIds).toHaveLength(6);
    expect(h.discounts[0]!.reason).toBe("cohort");
    expect(h.discounts[0]!.profileId).toBe("listing-a");
  });

  it("does nothing about a cohort that has not matured", async () => {
    const fresh = NOW - HOUR;
    const acts = Array.from({ length: 6 }, (_, i) => ({
      subjectId: `sub-${i}`,
      targetRef: "listing-a",
      actedAt: new Date(fresh + i * 60_000).toISOString(),
      subjectFirstSeenAt: new Date(fresh - HOUR + i * 10 * 60_000).toISOString(),
    }));
    const h = harness({ acts });
    await route(req(SWEEP), env(), h.deps as never);

    // A launch shared in a newsletter looks exactly like this today. The
    // waiting is the defence, so on the day there is nothing.
    expect(h.flags).toEqual([]);
    expect(h.discounts).toEqual([]);
  });
});

describe("which kinds may be raised again", () => {
  it("asks to be raised once for frozen history, and repeatedly for mutable content", async () => {
    const acted = NOW - COHORT_MATURITY_MS - HOUR;
    const h = harness({
      pitches: [{ profileId: "p1", slug: "empty-one", tagline: null, pitchBody: EMPTY_PITCH }],
      acts: Array.from({ length: 5 }, (_, i) => ({
        subjectId: `sub-${i}`,
        targetRef: "listing-a",
        actedAt: new Date(acted + i * 60_000).toISOString(),
        subjectFirstSeenAt: new Date(acted - HOUR + i * 10 * 60_000).toISOString(),
      })),
      rings: [{ profileId: "p2", slug: "ringed", discounted: 9 }],
    });
    await route(req(SWEEP), env(), h.deps as never);

    const once = Object.fromEntries(h.flags.map((f) => [f.kind, f.once]));
    // A pitch can be rewritten, so a listing dismissed, re-indexed and still
    // empty is a REAL second observation.
    expect(once.filler).toBe(false);
    // A cohort's accounts have already gone quiet and a ring has already
    // endorsed what it endorsed. Re-raising after a dismissal would re-ask a
    // question a person has answered, every six hours, forever.
    expect(once.cohort).toBe(true);
    expect(once.ring).toBe(true);
  });
});

describe("the brigade path observes and does not act", () => {
  it("raises a flag and takes no consequence at all", async () => {
    const h = harness({
      launches: [
        {
          launchId: "l1",
          profileId: "p3",
          slug: "brigaded",
          launchedAt: new Date(NOW - DAY).toISOString(),
          endorsements: Array.from({ length: 20 }, (_, i) => ({
            subjectId: `new-${i}`,
            subjectFirstSeenAt: new Date(NOW - DAY - 60_000).toISOString(),
          })),
        },
      ],
    });
    await route(req(SWEEP), env(), h.deps as never);

    expect(h.flags.map((f) => f.kind)).toEqual(["brigade"]);
    expect(h.flags[0]!.consequence).toBe("queue-only");
    // The board's own rule already ranked only what existed before the
    // launch. There is nothing left for the sweep to do, and doing something
    // anyway would be acting on a pattern it cannot tell from a good day.
    expect(h.acts).toEqual([]);
    expect(h.discounts).toEqual([]);
    expect(h.indexable).toEqual([]);
    expect(h.flags[0]!.evidence).toMatch(/Nothing was discounted/);
  });

  it("says nothing about a launch that merely went well", async () => {
    const h = harness({
      launches: [
        {
          launchId: "l1",
          profileId: "p3",
          slug: "good-day",
          launchedAt: new Date(NOW - DAY).toISOString(),
          endorsements: [
            ...Array.from({ length: 30 }, (_, i) => ({
              subjectId: `old-${i}`,
              subjectFirstSeenAt: new Date(NOW - 200 * DAY).toISOString(),
            })),
            ...Array.from({ length: 12 }, (_, i) => ({
              subjectId: `new-${i}`,
              subjectFirstSeenAt: new Date(NOW - DAY - 60_000).toISOString(),
            })),
          ],
        },
      ],
    });
    await route(req(SWEEP), env(), h.deps as never);
    expect(h.flags).toEqual([]);
  });
});

describe("the audit row, the floor, and the plane", () => {
  it("carries counts and never a subject id", async () => {
    const acted = NOW - COHORT_MATURITY_MS - HOUR;
    const h = harness({
      pitches: [{ profileId: "p1", slug: "empty-one", tagline: null, pitchBody: EMPTY_PITCH }],
      acts: Array.from({ length: 5 }, (_, i) => ({
        subjectId: `sub-${i}`,
        targetRef: "listing-a",
        actedAt: new Date(acted + i * 60_000).toISOString(),
        subjectFirstSeenAt: new Date(acted - HOUR + i * 10 * 60_000).toISOString(),
      })),
    });
    await route(req(SWEEP), env(), h.deps as never);

    expect(h.audits).toHaveLength(1);
    const serialised = JSON.stringify(h.audits[0]!.payload);
    // A per-person integrity record in an audit log is still a per-person
    // integrity record (EN-4), and this sweep handles more of them than any
    // other on the estate.
    expect(serialised).not.toContain("sub-0");
    expect(serialised).toContain("cohorts");
    expect(serialised).toContain("deindexed");
  });

  it("writes no audit row when it found nothing", async () => {
    const h = harness({
      pitches: [{ profileId: "p1", slug: "subtitles", tagline: null, pitchBody: REAL_PITCH }],
    });
    await route(req(SWEEP), env(), h.deps as never);
    // A trail where most rows say "no change" is a trail nobody reads.
    expect(h.audits).toEqual([]);
    // The floor is still marked: the sweep ran, it just found nothing.
    expect(h.marks).toHaveLength(1);
  });

  it("marks the floor after the work, never before", async () => {
    const h = harness({
      pitches: [{ profileId: "p1", slug: "empty-one", tagline: null, pitchBody: EMPTY_PITCH }],
    });
    await route(req(SWEEP), env(), h.deps as never);
    // A sweep that crashed halfway must be due again.
    expect(h.order.indexOf("mark")).toBe(h.order.length - 1);
  });

  it("checks the floor before the expensive read", async () => {
    const h = harness({
      pitches: [{ profileId: "p1", slug: "empty-one", tagline: null, pitchBody: EMPTY_PITCH }],
    });
    h.state.sweptAt = new Date(NOW - 60_000).toISOString();

    const res = await route(req(SWEEP), env(), h.deps as never);
    expect(res.status).toBe(200);
    expect((await json(res)).reason).toBe("not_due");
    // Nothing was read and nothing was written: checking after the read would
    // mean the not-due path still walked the whole catalog, which is the
    // entire cost the floor exists to avoid.
    expect(h.flags).toEqual([]);
    expect(h.marks).toEqual([]);
  });

  it("refuses anything but POST", async () => {
    const h = harness();
    const res = await route(req(SWEEP, "GET"), env(), h.deps as never);
    expect(res.status).toBe(405);
  });

  it("is not reachable from the public plane", async () => {
    // The only path on the estate by which automation changes anything a
    // reader sees has exactly one caller, and it is the gateway's binding.
    const res = await route(
      new Request("https://openproduct.live/openproduct/defence/sweep", { method: "POST" }),
      env(),
    );
    expect(res.status).toBe(404);
  });
});
