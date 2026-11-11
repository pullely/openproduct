// Appeals (openproduct-commons TS5).
//
// The REPOSITORY's half — the one-appeal-per-person-per-act rule in the
// INSERT, and the guarded resolve — is tested in packages/db against real
// Postgres. What is pinned here is the handlers and the rules that would be
// easy to lose in a refactor:
//
//   - standing is RE-DERIVED on the write, never trusted from the form
//   - the ledger is written BEFORE anything changes, on every path
//   - upholding writes TWO rows: the judgement and the reversal
//   - a reversal that does not land writes no reversal row and says so
//   - the queue names neither the appellant nor the original operator
//   - the appellant is told the outcome, never the operator's reason

import {
  APPEAL_VIEW_KEYS,
  MIN_APPEAL_SAYS,
} from "@openproduct/contracts";
import type { AppealRecord, ModerationActRecord, OpenproductRepository } from "@openproduct/db";
import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { AppealHandlerDeps } from "@openproduct-worker/handlers/appeals";

const ME = "https://openproduct.internal/internal/openproduct/me/appeals";
const QUEUE = "https://openproduct.internal/internal/openproduct/reports/appeals";
const DECIDE = "https://openproduct.internal/internal/openproduct/reports/appeals/decide";

const SUBJECT = "usr_0123456789abcdef0123456789abcdef";
const OTHER = "usr_ffffffffffffffffffffffffffffffff";
const ACT_ID = "11111111-1111-4111-8111-111111111111";
const APPEAL_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-08-26T12:00:00.000Z");
const SAYS = "This is not spam — it is a small tool I have maintained for four years.";

function env(operators = SUBJECT): Env {
  return { ENVIRONMENT: "test", OPENPRODUCT_OPERATORS: operators } as Env;
}

function req(url: string, method = "GET", body?: unknown, subject = SUBJECT): Request {
  return new Request(url, {
    method,
    headers: {
      "x-request-id": "req_ts5",
      "x-actor-subject-id": subject,
      "x-actor-subject-type": "user",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function act(overrides: Partial<ModerationActRecord> = {}): ModerationActRecord {
  return {
    id: ACT_ID,
    subjectKind: "listing",
    subjectRef: "little-tool",
    act: "delist",
    actorId: "usr_operator",
    reason: "Looked like a mirror of somebody else's repository.",
    reportId: null,
    occurredAt: "2026-08-01T09:00:00.000Z",
    ...overrides,
  };
}

function appeal(overrides: Partial<AppealRecord> = {}): AppealRecord {
  return {
    id: APPEAL_ID,
    actId: ACT_ID,
    subjectKind: "listing",
    subjectRef: "little-tool",
    appellantSubjectId: SUBJECT,
    says: SAYS,
    state: "open",
    outcomeActId: null,
    reversalActId: null,
    filedAt: "2026-08-02T09:00:00.000Z",
    decidedAt: null,
    decidedBy: null,
    ...overrides,
  };
}

interface Harness {
  deps: AppealHandlerDeps;
  ledger: Array<{ act: string; subjectRef: string; reason: string }>;
  stateWrites: Array<{ slug: string; state: string; legalFrom: readonly string[] }>;
  indexWrites: Array<{ id: string; indexable: boolean }>;
  resolved: Array<{ state: string; reversalActId: string | null }>;
  created: unknown[];
}

function harness(options: {
  maintains?: string[];
  acts?: ModerationActRecord[];
  appeals?: AppealRecord[];
  theAct?: ModerationActRecord | null;
  theAppeal?: AppealRecord | null;
  openQueue?: AppealRecord[];
  createReturns?: AppealRecord | null;
  hasAppealed?: boolean;
  stateWriteLands?: boolean;
  indexWriteLands?: boolean;
  listingExists?: boolean;
} = {}): Harness {
  const ledger: Harness["ledger"] = [];
  const stateWrites: Harness["stateWrites"] = [];
  const indexWrites: Harness["indexWrites"] = [];
  const resolved: Harness["resolved"] = [];
  const created: unknown[] = [];

  const repo = {
    async listProfilesMaintainedBy() {
      return (options.maintains ?? ["little-tool"]).map((slug) => ({ slug }));
    },
    async listModerationActsForSubjects() {
      return options.acts ?? [];
    },
    async listAppealsByAppellant() {
      return options.appeals ?? [];
    },
    async getModerationAct() {
      return options.theAct === undefined ? act() : options.theAct;
    },
    async createAppeal(input: unknown) {
      created.push(input);
      return options.createReturns === undefined ? appeal() : options.createReturns;
    },
    async hasAppealed() {
      return options.hasAppealed === true;
    },
    async listOpenAppeals() {
      return options.openQueue ?? [];
    },
    async getAppeal() {
      return options.theAppeal === undefined ? appeal() : options.theAppeal;
    },
    async resolveAppeal(input: { state: string; reversalActId: string | null }) {
      resolved.push({ state: input.state, reversalActId: input.reversalActId });
      return appeal({
        state: input.state as AppealRecord["state"],
        reversalActId: input.reversalActId,
        outcomeActId: "33333333-3333-4333-8333-333333333333",
        decidedAt: NOW.toISOString(),
        decidedBy: SUBJECT,
      });
    },
    async appendModerationAct(input: { act: string; subjectRef: string; reason: string }) {
      ledger.push({ act: input.act, subjectRef: input.subjectRef, reason: input.reason });
      return act(input as Partial<ModerationActRecord>);
    },
    async setListingModerationState(input: {
      slug: string;
      state: string;
      legalFrom: readonly string[];
    }) {
      stateWrites.push({ slug: input.slug, state: input.state, legalFrom: input.legalFrom });
      return options.stateWriteLands === false ? null : { slug: input.slug };
    },
    async getPublicProfile() {
      return options.listingExists === false
        ? null
        : { slug: "little-tool", moderationState: "delisted" };
    },
    async getProfileIdBySlug() {
      return options.listingExists === false ? null : "44444444-4444-4444-8444-444444444444";
    },
    async setListingIndexable(id: string, indexable: boolean) {
      indexWrites.push({ id, indexable });
      return options.indexWriteLands !== false;
    },
  } as unknown as OpenproductRepository;

  let ids = 0;
  return {
    deps: {
      repo,
      now: () => NOW,
      generateId: () => `00000000-0000-4000-8000-${String(ids++).padStart(12, "0")}` as never,
    } as AppealHandlerDeps,
    ledger,
    stateWrites,
    indexWrites,
    resolved,
    created,
  };
}

async function code(res: Response): Promise<string> {
  const parsed = (await res.json()) as { error?: { code?: string } };
  return parsed.error?.code ?? "";
}

async function body(res: Response): Promise<Record<string, unknown>> {
  const parsed = (await res.json()) as { data?: Record<string, unknown> };
  return parsed.data ?? {};
}

describe("what was done to me", () => {
  it("shows the act's REASON, which no public surface does", async () => {
    // TS3 keeps the reason off the tombstone: a judgement about a person at
    // their own address, before they have answered it. Here it is shown TO
    // the person it is about, which is the case that asymmetry exists for.
    const h = harness({ acts: [act()] });
    const res = await route(req(ME), env(), h.deps as never);
    const rows = (await body(res)).acts as Array<Record<string, unknown>>;
    expect(rows[0]!.reason).toBe("Looked like a mirror of somebody else's repository.");
    expect(rows[0]!.appealable).toBe(true);
  });

  it("marks an act already appealed as not appealable, and shows where it got to", async () => {
    const h = harness({
      acts: [act()],
      appeals: [appeal({ state: "refused", decidedAt: "2026-08-05T00:00:00.000Z" })],
    });
    const res = await route(req(ME), env(), h.deps as never);
    const rows = (await body(res)).acts as Array<Record<string, unknown>>;
    expect(rows[0]!.appealable).toBe(false);
    const view = rows[0]!.appeal as Record<string, unknown>;
    expect(Object.keys(view).sort()).toEqual([...APPEAL_VIEW_KEYS].sort());
    expect(view.state).toBe("refused");
    // NEVER the operator's name or their reason for deciding.
    expect(JSON.stringify(view)).not.toContain("decidedBy");
  });

  it("marks a reversal as not appealable — it undid something", async () => {
    const h = harness({ acts: [act({ act: "relist" })] });
    const res = await route(req(ME), env(), h.deps as never);
    const rows = (await body(res)).acts as Array<Record<string, unknown>>;
    expect(rows[0]!.appealable).toBe(false);
  });

  it("is empty for somebody who maintains nothing", async () => {
    const h = harness({ maintains: [], acts: [] });
    const res = await route(req(ME), env(), h.deps as never);
    expect((await body(res)).acts).toEqual([]);
  });

  it("needs an actor", async () => {
    const h = harness();
    const res = await route(
      new Request(ME, { method: "GET", headers: { "x-request-id": "req_ts5" } }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(401);
  });
});

describe("filing one", () => {
  it("files against an act on a listing the caller maintains", async () => {
    const h = harness();
    const res = await route(req(ME, "POST", { actId: ACT_ID, says: SAYS }), env(), h.deps as never);
    expect(res.status).toBe(201);
    expect(h.created).toHaveLength(1);
  });

  it("RE-DERIVES standing rather than trusting the form", async () => {
    // The act names `little-tool`; this caller maintains something else. A
    // form that offered the act is not a form this handler believes.
    const h = harness({ maintains: ["a-different-thing"] });
    const res = await route(req(ME, "POST", { actId: ACT_ID, says: SAYS }), env(), h.deps as never);
    expect(res.status).toBe(403);
    expect(h.created).toEqual([]);
  });

  it("refuses an act that cannot be appealed, before touching standing", async () => {
    const h = harness({ theAct: act({ act: "appeal_refused" }) });
    const res = await route(req(ME, "POST", { actId: ACT_ID, says: SAYS }), env(), h.deps as never);
    expect(res.status).toBe(422);
    expect(h.created).toEqual([]);
  });

  it("answers an unknown act the same way for everybody, so it is no oracle", async () => {
    const h = harness({ theAct: null });
    const res = await route(req(ME, "POST", { actId: ACT_ID, says: SAYS }), env(), h.deps as never);
    expect(res.status).toBe(404);
  });

  it("refuses an argument too short to be one", async () => {
    const h = harness();
    const res = await route(
      req(ME, "POST", { actId: ACT_ID, says: "x".repeat(MIN_APPEAL_SAYS - 1) }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(422);
    expect(h.created).toEqual([]);
  });

  it("refuses a second attempt at the same act, and says it was theirs", async () => {
    // The repository's INSERT closes the race; the classification afterwards
    // is what makes the refusal a sentence rather than a code.
    const h = harness({ createReturns: null, hasAppealed: true });
    const res = await route(req(ME, "POST", { actId: ACT_ID, says: SAYS }), env(), h.deps as never);
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("already-appealed");
  });

  it("tells a CO-MAINTAINER that somebody else's appeal is open, not that it was theirs", async () => {
    // The two refusals are one null from the repository and two different
    // sentences here. Before this was classified, a co-maintainer filing
    // during an open appeal reached the unique index and got a 500 — a person
    // doing an ordinary thing given an outage.
    const h = harness({ createReturns: null, hasAppealed: false });
    const res = await route(req(ME, "POST", { actId: ACT_ID, says: SAYS }), env(), h.deps as never);
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("already-open");
  });
});

describe("the queue", () => {
  it("carries the act being disputed, and names nobody", async () => {
    const h = harness({ openQueue: [appeal()] });
    const res = await route(req(QUEUE), env(), h.deps as never);
    const rows = (await body(res)).appeals as Array<Record<string, unknown>>;
    expect(rows[0]!.actReason).toBe("Looked like a mirror of somebody else's repository.");
    expect(rows[0]!.reversal).toBe("relist");
    // Neither the appellant nor the operator who took the original act. A
    // reviewer who can see whose decision they are reviewing can be lobbied
    // about whose decision they are reviewing.
    const serialised = JSON.stringify(rows[0]);
    expect(serialised).not.toContain(SUBJECT);
    expect(serialised).not.toContain("usr_operator");
  });

  it("is operator-only", async () => {
    const h = harness({ openQueue: [appeal()] });
    const res = await route(req(QUEUE, "GET", undefined, OTHER), env(), h.deps as never);
    expect(res.status).toBe(403);
  });

  it("is not on the public surface", async () => {
    const res = await route(
      new Request("https://openproduct.live/openproduct/reports/appeals", { method: "GET" }),
      env(),
    );
    expect(res.status).toBe(404);
  });
});

describe("deciding", () => {
  it("writes the JUDGEMENT and the REVERSAL as two rows, judgement first", async () => {
    const h = harness();
    const res = await route(
      req(DECIDE, "POST", { appealId: APPEAL_ID, decision: "uphold", reason: "We were wrong." }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(200);
    // Two facts a reader of the ledger needs both of: that we agreed, and
    // that the content actually came back.
    expect(h.ledger.map((row) => row.act)).toEqual(["appeal_upheld", "relist"]);
    // And the state write came AFTER both, never before.
    expect(h.stateWrites).toHaveLength(1);
    expect(h.stateWrites[0]!.state).toBe("visible");
    expect((await body(res)).reversed).toBe(true);
  });

  it("passes TS3's transition table rather than re-encoding it", async () => {
    const h = harness();
    await route(
      req(DECIDE, "POST", { appealId: APPEAL_ID, decision: "uphold", reason: "We were wrong." }),
      env(),
      h.deps as never,
    );
    expect(h.stateWrites[0]!.legalFrom).toEqual(["delisted"]);
  });

  it("refuses without reversing, and still writes the ledger row", async () => {
    const h = harness();
    const res = await route(
      req(DECIDE, "POST", { appealId: APPEAL_ID, decision: "refuse", reason: "It is a mirror." }),
      env(),
      h.deps as never,
    );
    expect(h.ledger.map((row) => row.act)).toEqual(["appeal_refused"]);
    expect(h.stateWrites).toEqual([]);
    expect((await body(res)).reversed).toBe(false);
    expect(h.resolved[0]).toEqual({ state: "refused", reversalActId: null });
  });

  it("upholds WITHOUT a reversal when the act had already been undone", async () => {
    // Somebody restored the listing while the appeal waited. The judgement
    // stands; there is nothing left to undo; and no row claims otherwise.
    const h = harness({ stateWriteLands: false });
    const res = await route(
      req(DECIDE, "POST", { appealId: APPEAL_ID, decision: "uphold", reason: "We were wrong." }),
      env(),
      h.deps as never,
    );
    expect((await body(res)).reversed).toBe(false);
    expect(h.resolved[0]).toEqual({ state: "upheld", reversalActId: null });
  });

  it("re-indexes on an upheld de-index, through the indexable column", async () => {
    const h = harness({ theAct: act({ act: "deindex" }) });
    const res = await route(
      req(DECIDE, "POST", { appealId: APPEAL_ID, decision: "uphold", reason: "The check was wrong." }),
      env(),
      h.deps as never,
    );
    expect(h.ledger.map((row) => row.act)).toEqual(["appeal_upheld", "reindex"]);
    expect(h.indexWrites[0]).toEqual({
      id: "44444444-4444-4444-8444-444444444444",
      indexable: true,
    });
    expect(h.stateWrites).toEqual([]);
    expect((await body(res)).reversed).toBe(true);
  });

  it("says nothing came back when the re-index is refused by the schema", async () => {
    // 1370: a public, indexable, unreviewed listing cannot exist. The
    // repository returns false rather than throwing, and the appeal is honest
    // about it.
    const h = harness({ theAct: act({ act: "deindex" }), indexWriteLands: false });
    const res = await route(
      req(DECIDE, "POST", { appealId: APPEAL_ID, decision: "uphold", reason: "The check was wrong." }),
      env(),
      h.deps as never,
    );
    expect((await body(res)).reversed).toBe(false);
  });

  it("needs a reason of its own", async () => {
    const h = harness();
    const res = await route(
      req(DECIDE, "POST", { appealId: APPEAL_ID, decision: "uphold", reason: "" }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(422);
    expect(h.ledger).toEqual([]);
  });

  it("refuses a decided appeal rather than rewriting who decided it", async () => {
    const h = harness({ theAppeal: appeal({ state: "upheld", decidedBy: OTHER }) });
    const res = await route(
      req(DECIDE, "POST", { appealId: APPEAL_ID, decision: "refuse", reason: "No." }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(409);
    expect(h.ledger).toEqual([]);
  });

  it("is operator-only, and only a person", async () => {
    const h = harness();
    const notOperator = await route(
      req(DECIDE, "POST", { appealId: APPEAL_ID, decision: "refuse", reason: "No." }, OTHER),
      env(),
      h.deps as never,
    );
    expect(notOperator.status).toBe(403);

    const service = new Request(DECIDE, {
      method: "POST",
      headers: {
        "x-request-id": "req_ts5",
        "x-actor-subject-id": SUBJECT,
        "x-actor-subject-type": "service",
        "content-type": "application/json",
      },
      body: JSON.stringify({ appealId: APPEAL_ID, decision: "uphold", reason: "Automated." }),
    });
    expect((await route(service, env(), h.deps as never)).status).toBe(403);
  });

  it("refuses anything but POST", async () => {
    const h = harness();
    expect((await route(req(DECIDE, "GET"), env(), h.deps as never)).status).toBe(405);
  });
});
