import { route } from "@openproduct-worker/router";
import type { Env } from "@openproduct-worker/env";
import type { SweepStateHandlerDeps } from "@openproduct-worker/handlers/sweep-state";
import type { SweepOutcome, SweepStateDocument } from "@openproduct/contracts";

const STATE = "https://openproduct.internal/internal/openproduct/sweep/state";
const OUTCOME = "https://openproduct.internal/internal/openproduct/sweep/outcome";

function env(): Env {
  return { ENVIRONMENT: "test" } as Env;
}

function req(url: string, method = "GET", body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "x-request-id": "req_li0", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

const NEVER = { lastRunAt: null, lastError: null, lastErrorAt: null };

function harness(
  document: SweepStateDocument = {
    catalogue: NEVER,
    searchIndex: NEVER,
    integrity: NEVER,
    defence: NEVER,
    board: NEVER,
    digest: NEVER,
    snapshots: NEVER,
  },
): { deps: SweepStateHandlerDeps; reads: number; recorded: Array<{ outcomes: SweepOutcome[]; at: string }> } {
  const state = { deps: undefined as unknown as SweepStateHandlerDeps, reads: 0, recorded: [] as Array<{ outcomes: SweepOutcome[]; at: string }> };
  state.deps = {
    repo: {
      getSweepPhaseStates: async () => {
        state.reads += 1;
        return document;
      },
      recordSweepOutcomes: async (outcomes: readonly SweepOutcome[], at: string) => {
        state.recorded.push({ outcomes: [...outcomes], at });
        return outcomes.length;
      },
    },
  } as unknown as SweepStateHandlerDeps;
  return state;
}

async function body(res: Response): Promise<Record<string, unknown>> {
  const parsed = (await res.json()) as { data?: Record<string, unknown> };
  return parsed.data ?? {};
}

describe("GET /internal/openproduct/sweep/state (RS1, widened by LI0)", () => {
  it("returns every phase's state — seven, each with its run and its failure", async () => {
    const h = harness({
      catalogue: NEVER,
      searchIndex: {
        lastRunAt: null,
        lastError: "internal_error: Search index rebuild failed (503)",
        lastErrorAt: "2026-09-09T18:50:00.000Z",
      },
      integrity: { lastRunAt: "2026-09-09T17:50:37.182Z", lastError: null, lastErrorAt: null },
      defence: { lastRunAt: "2026-09-09T13:00:52.818Z", lastError: null, lastErrorAt: null },
      board: NEVER,
      digest: NEVER,
      snapshots: NEVER,
    });
    const res = await route(req(STATE), env(), h.deps as never);
    expect(res.status).toBe(200);
    const data = await body(res);
    expect(Object.keys(data).sort()).toEqual([
      "board",
      "catalogue",
      "defence",
      "digest",
      "integrity",
      "searchIndex",
      "snapshots",
    ]);
    expect(data.searchIndex).toEqual({
      lastRunAt: null,
      lastError: "internal_error: Search index rebuild failed (503)",
      lastErrorAt: "2026-09-09T18:50:00.000Z",
    });
    expect(data.integrity).toEqual({ lastRunAt: "2026-09-09T17:50:37.182Z", lastError: null, lastErrorAt: null });
  });

  it("reports never-run as nulls rather than omitting the phase", async () => {
    const h = harness();
    const data = await body(await route(req(STATE), env(), h.deps as never));
    expect(data.board).toEqual(NEVER);
    expect(data.digest).toEqual(NEVER);
  });

  it("reads once", async () => {
    const h = harness();
    await route(req(STATE), env(), h.deps as never);
    expect(h.reads).toBe(1);
  });

  it("is a read: anything but GET is refused", async () => {
    const h = harness();
    expect((await route(req(STATE, "POST"), env(), h.deps as never)).status).toBe(405);
  });
});

describe("POST /internal/openproduct/sweep/outcome (LI0)", () => {
  it("records each phase's outcome with the sweep's instant", async () => {
    const h = harness();
    const res = await route(
      req(OUTCOME, "POST", {
        at: "2026-09-09T19:00:00.000Z",
        outcomes: [
          { phase: "searchIndex", ok: false, reason: "internal_error: Search index rebuild failed (503)" },
          { phase: "integrity", ok: true, reason: null },
          { phase: "board", ok: true },
        ],
      }),
      env(),
      h.deps as never,
    );
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ recorded: 3, at: "2026-09-09T19:00:00.000Z" });
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0]!.outcomes).toEqual([
      { phase: "searchIndex", ok: false, reason: "internal_error: Search index rebuild failed (503)" },
      { phase: "integrity", ok: true, reason: null },
      { phase: "board", ok: true, reason: null },
    ]);
  });

  it("bounds the reason and never records one on a success", async () => {
    const h = harness();
    await route(
      req(OUTCOME, "POST", {
        outcomes: [
          { phase: "digest", ok: false, reason: "x".repeat(500) },
          { phase: "defence", ok: true, reason: "should be dropped" },
        ],
      }),
      env(),
      h.deps as never,
    );
    const [digest, defence] = h.recorded[0]!.outcomes;
    expect(digest!.reason).toHaveLength(200);
    expect(defence!.reason).toBeNull();
  });

  it("a failure with no reason still records one, so the column is never an empty string", async () => {
    const h = harness();
    await route(req(OUTCOME, "POST", { outcomes: [{ phase: "board", ok: false }] }), env(), h.deps as never);
    expect(h.recorded[0]!.outcomes[0]!.reason).toBe("unknown");
  });

  it("refuses an unknown phase, a non-boolean ok, a duplicate, and a non-JSON body", async () => {
    const h = harness();
    const unknown = await route(
      req(OUTCOME, "POST", { outcomes: [{ phase: "search_rebuild", ok: false }] }),
      env(),
      h.deps as never,
    );
    expect(unknown.status).toBe(422);
    const notBool = await route(
      req(OUTCOME, "POST", { outcomes: [{ phase: "board", ok: "yes" }] }),
      env(),
      h.deps as never,
    );
    expect(notBool.status).toBe(422);
    const twice = await route(
      req(OUTCOME, "POST", { outcomes: [{ phase: "board", ok: true }, { phase: "board", ok: false }] }),
      env(),
      h.deps as never,
    );
    expect(twice.status).toBe(422);
    const garbage = await route(req(OUTCOME, "POST", "not json"), env(), h.deps as never);
    expect(garbage.status).toBe(422);
    expect(h.recorded).toHaveLength(0);
  });

  it("takes the instant from the caller when it is one, and supplies its own when it is not", async () => {
    const h = harness();
    await route(req(OUTCOME, "POST", { at: "not a date", outcomes: [] }), env(), h.deps as never);
    expect(Number.isFinite(Date.parse(h.recorded[0]!.at))).toBe(true);
  });

  it("is a write: GET is refused", async () => {
    const h = harness();
    expect((await route(req(OUTCOME), env(), h.deps as never)).status).toBe(405);
  });
});
