// What the synthetic remembers, and how a cycle changes it (OO1).
//
// ONE ROW OF ITS OWN STATE: for each promise, whether it held at the last
// look, since when, and the last time it did; the last hour of cache samples;
// when the last cycle ran. It lives in this worker's own Durable Object —
// openproduct's own store in the only sense that matters here, which is that
// nothing outside this worker can fail and take the memory with it (OO-1).
//
// THE TRANSITION IS A PURE FUNCTION. `applyCycle` takes the stored document
// and what the walk saw and returns the new document and the FLIPS — a
// promise that went from holding to not, or from not to holding — because a
// flip is the only thing worth an alert. A promise that is still breached is
// still breached; saying so every five minutes is how people learn to ignore
// the channel. The object persists what the function returns and nothing
// else, so the whole of the logic is testable without it.

import {
  CACHE_SAMPLE_MINIMUM,
  CACHE_SAMPLE_WINDOW,
  CACHE_HIT_TARGET,
  deployVerifyWindowMs,
  perTickPhases,
  type DeployUnverifiedReason,
  type FailureMode,
  type SloId,
  type SloState,
  type SweepPhase,
} from "@openproduct/contracts";

/** The three promises, in the order the state document lists them. */
export const SLO_IDS: readonly SloId[] = ["search-freshness", "count-freshness", "cache-hit"];

/** A cache sample, as `cf-cache-status` read on the plain fetch. Anything
 *  that is not a hit is a miss for the ratio's purposes, and `null` is a
 *  read with no header at all — which OPP5 found once and is a miss too. */
export type CacheSample = "HIT" | "MISS";

export interface SloRecord {
  /** `null` until the first cycle that could judge it. */
  readonly holding: boolean | null;
  /** When `holding` last changed — the start of the current run of holding or not. */
  readonly since: string | null;
  /** The last cycle that saw it hold. */
  readonly lastHeldAt: string | null;
  readonly lastCheckedAt: string | null;
  /** Why it is not holding, when it is not. */
  readonly mode: FailureMode | null;
}

/**
 * OO3 — the deploy under verification: the version /health answers with,
 * when it was uploaded, when this synthetic first saw it, when every
 * per-tick phase had run after it (verified), and when it was reported
 * unverified — so the report goes out once, and the recovery once.
 */
export interface DeployRecord {
  readonly version: string | null;
  readonly deployedAt: string | null;
  readonly noticedAt: string | null;
  readonly verifiedAt: string | null;
  readonly reportedAt: string | null;
}

export interface StateDocument {
  readonly version: 1;
  readonly lastRunAt: string | null;
  readonly cycles: number;
  readonly slos: Readonly<Record<SloId, SloRecord>>;
  /** Oldest first, at most `CACHE_SAMPLE_WINDOW`. */
  readonly cacheSamples: readonly CacheSample[];
  readonly deploy: DeployRecord;
}

const NO_DEPLOY: DeployRecord = Object.freeze({ version: null, deployedAt: null, noticedAt: null, verifiedAt: null, reportedAt: null });

const EMPTY_RECORD: SloRecord = Object.freeze({
  holding: null,
  since: null,
  lastHeldAt: null,
  lastCheckedAt: null,
  mode: null,
});

export const EMPTY_STATE: StateDocument = Object.freeze({
  version: 1,
  lastRunAt: null,
  cycles: 0,
  slos: Object.freeze({
    "search-freshness": EMPTY_RECORD,
    "count-freshness": EMPTY_RECORD,
    "cache-hit": EMPTY_RECORD,
  }),
  cacheSamples: Object.freeze([]) as readonly CacheSample[],
  deploy: NO_DEPLOY,
});

/** One promise's verdict from one cycle. `holding: null` is "could not judge yet". */
export interface Verdict {
  readonly slo: SloId;
  readonly holding: boolean | null;
  readonly mode: FailureMode | null;
}

/** What a cycle hands the state: the verdicts on the first two promises and
 *  the cache sample; the third verdict is computed HERE, from the window. */
export interface CycleInput {
  readonly at: string;
  readonly verdicts: readonly Verdict[];
  /** `null` when the front page could not be read — no sample is recorded. */
  readonly cacheSample: CacheSample | null;
  /** Whether the front page was reachable at all; an unreachable page is the
   *  cache promise's `unreachable`, not a miss. */
  readonly frontReachable: boolean;
  /** OO3 — which build answered, each phase's last run, and RS4's four walks. */
  readonly build: { readonly version: string | null; readonly deployedAt: string | null };
  readonly phaseRuns: Partial<Record<SweepPhase, string | null>>;
  /** `null` when the walks could not be made (the product unreachable). */
  readonly walk: Readonly<Record<"upvoteGate" | "signinOwned" | "frontTitled" | "searchAnswers", boolean | null>> | null;
}

/** OO3 — what a cycle said about the deploy, if anything. */
export type DeployEvent =
  | { readonly kind: "noticed"; readonly version: string }
  | { readonly kind: "verified"; readonly version: string; readonly afterMs: number; readonly wasReported: boolean }
  | { readonly kind: "unverified"; readonly version: string; readonly reason: DeployUnverifiedReason };

export interface Flip {
  readonly slo: SloId;
  readonly state: SloState;
  readonly mode: FailureMode | null;
}

export interface Applied {
  readonly state: StateDocument;
  readonly flips: readonly Flip[];
  readonly deployEvents: readonly DeployEvent[];
}

/**
 * OO3 — every deploy verifies itself. A version not seen before opens a
 * window; inside it, the deploy is VERIFIED the first cycle that finds every
 * per-tick phase's last run after the upload and all four walks true, and
 * UNVERIFIED — once — if the window closes first. A verification after a
 * report is the recovery. A version already verified is left alone.
 */
export function applyDeploy(record: DeployRecord, input: CycleInput): { record: DeployRecord; events: DeployEvent[] } {
  const events: DeployEvent[] = [];
  let next = record;
  const seen = input.build.version;
  if (seen !== null && seen !== record.version) {
    next = { version: seen, deployedAt: input.build.deployedAt ?? input.at, noticedAt: input.at, verifiedAt: null, reportedAt: null };
    events.push({ kind: "noticed", version: seen });
  }
  if (next.version === null || next.verifiedAt !== null) return { record: next, events };

  const deployedMs = Date.parse(next.deployedAt ?? next.noticedAt ?? input.at);
  const nowMs = Date.parse(input.at);
  const runs = perTickPhases().map((phase) => Date.parse(input.phaseRuns[phase] ?? ""));
  const ranAfter = runs.length > 0 && runs.every((t) => Number.isFinite(t) && t >= deployedMs);
  const walkOk = input.walk !== null && Object.values(input.walk).every((v) => v === true);
  if (ranAfter && walkOk) {
    const latest = Math.max(...runs);
    events.push({ kind: "verified", version: next.version, afterMs: Math.max(0, latest - deployedMs), wasReported: next.reportedAt !== null });
    return { record: { ...next, verifiedAt: input.at }, events };
  }
  if (next.reportedAt === null && nowMs - deployedMs > deployVerifyWindowMs()) {
    events.push({ kind: "unverified", version: next.version, reason: ranAfter ? "walk_failed" : "phases_stale" });
    return { record: { ...next, reportedAt: input.at }, events };
  }
  return { record: next, events };
}

/** The cache promise, judged from the window. */
export function cacheVerdict(samples: readonly CacheSample[], frontReachable: boolean): Verdict {
  if (!frontReachable) return { slo: "cache-hit", holding: false, mode: "unreachable" };
  if (samples.length < CACHE_SAMPLE_MINIMUM) return { slo: "cache-hit", holding: null, mode: null };
  const hits = samples.filter((s) => s === "HIT").length;
  const holding = hits / samples.length >= CACHE_HIT_TARGET;
  return { slo: "cache-hit", holding, mode: holding ? null : "cache_cold" };
}

function applyVerdict(record: SloRecord, verdict: Verdict, at: string): { record: SloRecord; flip: Flip | null } {
  if (verdict.holding === null) {
    // Could not judge: the record keeps its last word and notes the look.
    return { record: { ...record, lastCheckedAt: at }, flip: null };
  }
  const next: SloRecord = {
    holding: verdict.holding,
    since: record.holding === verdict.holding ? record.since : at,
    lastHeldAt: verdict.holding ? at : record.lastHeldAt,
    lastCheckedAt: at,
    mode: verdict.holding ? null : verdict.mode,
  };
  // A FLIP is a change of word. The first look that finds a promise broken
  // is a flip too (null → false: nobody knew, now somebody does); the first
  // look that finds it holding is not (null → true: nothing to say).
  let flip: Flip | null = null;
  if (record.holding !== false && verdict.holding === false) flip = { slo: verdict.slo, state: "breached", mode: verdict.mode };
  else if (record.holding === false && verdict.holding === true) flip = { slo: verdict.slo, state: "recovered", mode: null };
  return { record: next, flip };
}

export function applyCycle(state: StateDocument, input: CycleInput): Applied {
  const samples =
    input.cacheSample === null ? state.cacheSamples : [...state.cacheSamples, input.cacheSample].slice(-CACHE_SAMPLE_WINDOW);
  const verdicts = [...input.verdicts.filter((v) => v.slo !== "cache-hit"), cacheVerdict(samples, input.frontReachable)];
  const slos: Record<SloId, SloRecord> = { ...state.slos };
  const flips: Flip[] = [];
  for (const id of SLO_IDS) {
    const verdict = verdicts.find((v) => v.slo === id) ?? { slo: id, holding: null, mode: null };
    const applied = applyVerdict(state.slos[id], verdict, input.at);
    slos[id] = applied.record;
    if (applied.flip) flips.push(applied.flip);
  }
  const deploy = applyDeploy(state.deploy ?? NO_DEPLOY, input);
  return {
    state: { version: 1, lastRunAt: input.at, cycles: state.cycles + 1, slos, cacheSamples: samples, deploy: deploy.record },
    flips,
    deployEvents: deploy.events,
  };
}

// ─── the object ──────────────────────────────────────────────────────────

const STATE_KEY = "state";

function isStateDocument(value: unknown): value is StateDocument {
  return typeof value === "object" && value !== null && (value as StateDocument).version === 1 && typeof (value as StateDocument).slos === "object";
}

function isCycleInput(value: unknown): value is CycleInput {
  const v = value as CycleInput;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.at === "string" &&
    Array.isArray(v.verdicts) &&
    (v.cacheSample === null || v.cacheSample === "HIT" || v.cacheSample === "MISS") &&
    typeof v.frontReachable === "boolean" &&
    typeof v.build === "object" &&
    v.build !== null &&
    typeof v.phaseRuns === "object" &&
    v.phaseRuns !== null &&
    (v.walk === null || typeof v.walk === "object")
  );
}

/** The slice of `DurableObjectState` the object uses — so a test can hand in a map. */
export interface StateStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

/**
 * The synthetic's memory — ONE object, named `state`, so every cycle reads
 * and writes the same row. `GET /` is the document; `POST /record` applies a
 * cycle and answers with the flips.
 */
export class SyntheticState {
  private readonly storage: StateStorage;

  constructor(state: { storage: StateStorage }, _env: unknown) {
    this.storage = state.storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return Response.json(await this.read());
    }
    if (request.method === "POST" && url.pathname === "/record") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return new Response("invalid body", { status: 400 });
      }
      if (!isCycleInput(body)) return new Response("invalid body", { status: 400 });
      const applied = applyCycle(await this.read(), body);
      await this.storage.put(STATE_KEY, applied.state);
      return Response.json(applied);
    }
    return new Response("not found", { status: 404 });
  }

  private async read(): Promise<StateDocument> {
    const stored = await this.storage.get<unknown>(STATE_KEY);
    return isStateDocument(stored) ? stored : EMPTY_STATE;
  }
}
