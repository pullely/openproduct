// The ingestion sweep (openproduct-commons SN1).
//
// Runs on a schedule, not on a request. Its whole job is to move one fact
// across the one boundary that matters:
//
//   core knows WHICH listings to look at and holds the database.
//   the gateway can reach the internet and holds the host pin.
//
// Neither can do the other's half, and that is deliberate — it is the same
// division OD drew between the public read and the maintainer door, applied
// to ingestion. The isolate that can write metrics cannot reach the internet;
// the isolate that can reach the internet holds no database.
//
// AN OUTAGE IS NOT AN OBSERVATION, and this file is where that rule is most
// likely to be broken, because the easy shape is `catch { count = 0 }`. Every
// failure path below posts `ok: false` instead, which records a failure and
// withdraws at tolerance. There is no branch here that turns a failed read
// into a number.

import {
  CAPTURE_MAX_PER_RUN,
  INGESTION_MAX_SOURCES_PER_RUN,
  NEVER_RUN,
  SWEEP_PHASES,
  captureProvider,
  type CaptureReport,
  type DueCapture,
  type SweepMode,
  type SweepOutcome,
  type SweepPhase,
  type SweepPhaseState,
  type SweepStateDocument,
  MERGE_WINDOW_DAYS,
} from "@openproduct/contracts";

import { captureOne } from "./capture.js";
import { observeActivity, observeRepo, parseGithubRepo } from "./github.js";
import { requireMediaBucket } from "./media.js";
import { deliverDigests, type OutboundDigest } from "./seam.js";
import type { Env } from "./env.js";

/** The trailing window every activity metric is measured over. Matches the
 *  `merges.7d` formula's published sentence — one number, one meaning. */
/** OB2 — how far back the activity read looks: the longer of the two
 *  published windows, so one request answers both `merges.7d` and
 *  `merges.30d`. */
const WINDOW_DAYS = MERGE_WINDOW_DAYS["30d"];

/** How many listings one run will look at. A schedule that cannot finish is
 *  a schedule that starves its own tail, so the cap is explicit and the
 *  remainder is simply picked up by the next run (the queue is oldest-first). */
// LI4 — the cap is a number on /docs/checks, so it lives in the contract.
const MAX_PER_RUN = INGESTION_MAX_SOURCES_PER_RUN;

interface DueSource {
  profileId: string;
  source: string;
  locator: string | null;
  slug: string;
  repoUrl: string | null;
  failureCount: number;
}

export interface SweepResult {
  looked: number;
  observed: number;
  failed: number;
  skipped: number;
  /** OS5 — whether this run materialised the catalogue (core stamps the moment). */
  catalogued: boolean;
  /** DS0 — whether this run rebuilt the search index. */
  reindexed: boolean;
  /** EN3 — whether the integrity sweep actually ran (core's floor decides). */
  integritySwept: boolean;
  /** PV4 — today's snapshot recorded, so a diff has a baseline next week. */
  snapshotsTaken: boolean;
  /** LC0 — what happened to the launches whose moment had passed. */
  launchesFired: { live: number; missed: number };
  /** TS4 — whether the defence sweep actually ran (core's floor decides). */
  defenceSwept: boolean;
  /** LC3 — the board days this run ranked. */
  boardsRanked: number;
  /** LC5 — digests queued and handed to the seam this run. */
  digest: { queued: number; sent: number };
  /** MD4 — screenshots this run tried for, took, and failed to take. */
  captures: { looked: number; captured: number; failed: number };
}

/**
 * What a phase did, when it did not do the thing (openproduct-worldclass RS5).
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * Every phase in this file already fails SAFELY, and each `catch` has a good
 * sentence beside it: a failed rebuild leaves the previous index serving, a
 * failed ranking leaves the previous board standing, a failed defence sweep
 * leaves nothing flagged. Those are the right failures, and none of them is
 * being changed.
 *
 * What none of them does is SAY SO. Before RS5 this file held ten `catch`
 * blocks and not one `console` call, so a phase that failed on every run
 * forever was indistinguishable — from outside, and from `/health` — from a
 * phase that had never been asked to run.
 *
 * RS4 found exactly that on prod, on the sweep's very first firing: integrity
 * and defence recorded runs at 06:20:35 and the search index did not, and
 * there was no way from any surface to learn whether the rebuild had thrown,
 * answered "not due", or never been called. The index rebuild is the phase
 * behind the audit's lowest-scoring dimension, and it failed in silence.
 *
 * This is WC-1 one level deeper. RS0 said a scheduled job with no schedule is
 * an outage rather than a safe default; RS5 says a phase that fails every run
 * is an outage rather than a quiet one. The remedy is the same shape: make
 * the absence audible.
 *
 * ─── WHY A LOG AND NOT A COLUMN ───────────────────────────────────────────
 *
 * The obvious alternative is to persist each phase's last error beside its
 * `built_at` / `swept_at`, so `/health` could report it. That is probably
 * right eventually and it is deliberately not done here: it is a migration on
 * three tables to diagnose a defect that is live NOW, and Workers Logs are
 * already enabled on this worker (`observability` in wrangler.jsonc). One
 * structured line per failure is readable in the dashboard this afternoon.
 *
 * The line is deliberately narrow: a phase name, a machine-readable reason,
 * and an optional status. No listing slug, no subject id, no repository URL —
 * a sweep failure is about our machinery, and the only thing a wider line
 * would add is something to leak.
 */
export type SweepPhaseName =
  | "signals_due"
  | "catalogue"
  | "search_rebuild"
  | "integrity"
  | "launches"
  | "board"
  | "defence"
  | "digest"
  | "snapshots"
  | "captures_due";

/**
 * What this run saw of each phase (openproduct-worldclass-v2 LI0).
 *
 * RS5 made a failing phase LOG. This makes it RECORD: the same bounded line,
 * kept per run and handed to core at the end as one write, so `/health` can
 * say `failed` and why rather than `never_run` and nothing (WC2-1). One
 * ledger per `runSweep`, threaded rather than module-scoped, because an
 * isolate may run two sweeps and neither should read the other's failures.
 */
export interface SweepLedger {
  readonly failures: Map<SweepPhaseName, string>;
}

export function createLedger(): SweepLedger {
  return { failures: new Map() };
}

/**
 * The gateway's phase names against the health document's. Two gateway
 * phases have no state row and no health line — `signals_due` is ingestion
 * (opt-in per environment by RS2) and `launches` keeps no singleton — so
 * they log and are not recorded. `snapshots` joined with OS2, the day its
 * floor gave it a row.
 */
const HEALTH_PHASE: Partial<Record<SweepPhaseName, SweepPhase>> = {
  catalogue: "catalogue",
  search_rebuild: "searchIndex",
  integrity: "integrity",
  defence: "defence",
  board: "board",
  digest: "digest",
  snapshots: "snapshots",
};

export function ledgerOutcomes(ledger: SweepLedger): SweepOutcome[] {
  const failed = new Map<SweepPhase, string>();
  for (const [phase, reason] of ledger.failures) {
    const health = HEALTH_PHASE[phase];
    if (health) failed.set(health, reason);
  }
  return SWEEP_PHASES.map((phase) => ({
    phase,
    ok: !failed.has(phase),
    reason: failed.get(phase) ?? null,
  }));
}

function phaseFailed(
  ledger: SweepLedger,
  phase: SweepPhaseName,
  reason: string,
  status?: number,
): void {
  ledger.failures.set(phase, status === undefined ? reason : `${reason} (${status})`);
  console.warn(
    JSON.stringify({
      level: "warn",
      msg: "sweep_phase_failed",
      phase,
      reason,
      ...(status === undefined ? {} : { status }),
    }),
  );
}

/** What a thrown value can be told to a log without becoming a leak. */
async function refusalReason(res: Response): Promise<string> {
  // THE CODE IS NOT ENOUGH, and finding that out is why this reads the
  // message too.
  //
  // Core answers a refused internal call with `{ error: { code, message } }`,
  // and on this route BOTH of the refusals that matter carry the same code.
  // `internal_error` + 503 is what a missing `PLATFORM_DB` binding answers
  // ("Service unavailable") AND what the rebuild's own catch answers
  // ("Search index rebuild failed"). Those are completely different problems
  // with completely different remedies, and a log that called them both
  // `internal_error` would be a log that had learned nothing — which is the
  // failure this whole milestone exists to end, reproduced inside its own fix.
  //
  // The message is safe to carry here: these are core's own fixed strings on
  // a route reachable only by this worker's service binding. Nothing a
  // visitor typed can reach it, and it is bounded on the way out.
  try {
    const body = (await res.clone().json()) as { error?: { code?: string; message?: string } };
    const code = body.error?.code;
    const message = body.error?.message;
    if (code && message) return `${code}: ${message}`.slice(0, 200);
    return code ?? `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

function thrownReason(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 200);
  return "non_error_thrown";
}

export async function runSweep(
  env: Env,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
  /**
   * Which half of the work to do (openproduct-worldclass RS2).
   *
   * `all` is the default because it is what a local run, a manual invocation
   * and every test before RS2 mean by "sweep". The two scheduled callers name
   * their half explicitly; nothing else has to know the split exists.
   */
  mode: SweepMode = "all",
): Promise<SweepResult> {
  const result: SweepResult = {
    looked: 0,
    observed: 0,
    failed: 0,
    skipped: 0,
    catalogued: false,
    reindexed: false,
    integritySwept: false,
    snapshotsTaken: false,
    launchesFired: { live: 0, missed: 0 },
    defenceSwept: false,
    boardsRanked: 0,
    digest: { queued: 0, sent: 0 },
    captures: { looked: 0, captured: 0, failed: 0 },
  };
  if (!env.CORE) return result;

  const ledger = createLedger();
  if (mode !== "materialisation") {
    await ingest(env, result, now, fetchImpl, ledger);
  }
  if (mode === "ingestion") return result;

  return materialise(env, result, ledger, now);
}

/**
 * The half that reaches OUTWARD (openproduct-commons SN1).
 *
 * Everything careful in here is careful because it leaves the estate: the
 * host pin, the parsed-not-fetched URL, the per-run cap, and the rule that no
 * page view can reach it. RS2 did not change any of that — it gave this half
 * its own, rarer schedule so the cap and the cadence are one decision instead
 * of two that happened to agree at a corpus of two listings.
 */
async function ingest(
  env: Env,
  result: SweepResult,
  now: Date,
  fetchImpl: typeof fetch,
  ledger: SweepLedger,
): Promise<void> {
  if (!env.CORE) return;

  const base = "https://openproduct.internal";
  const dueRes = await env.CORE.fetch(`${base}/internal/openproduct/signals/due`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!dueRes.ok) {
    phaseFailed(ledger, "signals_due", await refusalReason(dueRes), dueRes.status);
    return;
  }

  let sources: DueSource[];
  try {
    const body = (await dueRes.json()) as { data?: { sources?: DueSource[] } };
    sources = body.data?.sources ?? [];
  } catch (error) {
    phaseFailed(ledger, "signals_due", thrownReason(error));
    return;
  }

  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const batch = sources.slice(0, MAX_PER_RUN);
  for (const [index, source] of batch.entries()) {
    result.looked += 1;

    // `manifest` is a tier with nothing to poll: its facts were captured at
    // publish. It should not be in the queue at all, and if it is, skipping
    // is the honest answer — not an empty observation that would reset its
    // clock and imply we looked.
    if (source.source === "manifest" || source.source === "operator") {
      result.skipped += 1;
      continue;
    }

    const coords = source.repoUrl ? parseGithubRepo(source.repoUrl) : null;
    if (!coords) {
      // Not a github.com/{owner}/{repo} URL. A permanent condition with the
      // remedy in the maintainer's hands, so it counts toward withdrawal
      // rather than being retried forever at full rate.
      await post(env, source, { ok: false, error: "repo_url_unreadable" });
      result.failed += 1;
      continue;
    }

    const activity = await observeActivity(
      coords.owner,
      coords.repo,
      since,
      env.GITHUB_TOKEN,
      fetchImpl,
      now.getTime(),
    );
    if (!activity.ok && activity.rateLimited) {
      // OB2 — the limit is ours, not the repository's. Charge nobody, and stop
      // asking for the rest of this run: every further call would be refused
      // the same way. The un-read sources stay due and lead the next run.
      // Every source in the batch still counts as looked at, so the run's
      // tally keeps `looked = observed + failed + skipped`.
      result.looked += batch.length - index - 1;
      result.skipped += batch.length - index;
      break;
    }
    if (!activity.ok) {
      await post(env, source, { ok: false, error: "github_unreachable" });
      result.failed += 1;
      continue;
    }

    // The licence and visibility come from the same trip so a listing's
    // observed facts share one moment. A failure here is not fatal to the
    // activity we already have — but it is not a fact either, so nothing is
    // written for it.
    const repo = await observeRepo(coords.owner, coords.repo, env.GITHUB_TOKEN, fetchImpl);

    // OB2 — both published windows, from the one read.
    const metrics: Array<{ metric: string; window: string; value: number }> = [
      { metric: "merges", window: "7d", value: activity.observation.merges },
      { metric: "merges", window: "30d", value: activity.observation.merges30d },
    ];
    // `last_touched` is a TIMESTAMP stored as epoch seconds. Absent when the
    // repository has never been pushed to — which is an observed answer, and
    // is why this is a conditional rather than a `?? 0`.
    if (activity.observation.lastTouchedAt !== null) {
      metrics.push({
        metric: "last_touched",
        window: "all",
        value: activity.observation.lastTouchedAt,
      });
    }

    await post(env, source, {
      ok: true,
      metrics,
      // Deliberately no activity events yet: a `merged` line needs the commit
      // message, and putting attacker-influenced text on a crawled public page
      // is TS4's problem before it is SN's. SN3 adds them behind that.
      activity: [],
      repoVisibility: repo.ok ? repo.observation.visibility : null,
      // OB2 — the whole repository read, so core refreshes the observed row
      // (licence, language, last push, open issues) on every pass rather
      // than only when a maintainer presses the check. Null when the read
      // failed: an outage writes nothing.
      repo: repo.ok ? repo.observation : null,
    });
    result.observed += 1;
  }

  // MD4 — the other outward read, after the repositories: a browser render
  // is the most expensive thing a run does, so the cheap, numerous work goes
  // first and the captures take what is left of the run's budget.
  await captureScreenshots(env, result, now, fetchImpl, ledger);
}

/**
 * Observed screenshots (openproduct-worldclass MD4).
 *
 * INGESTION, so it lives in this half and inherits RS2's per-environment
 * opt-in — and adds one of its own: an environment with no provider
 * configured, or no bucket to put a picture in, captures nothing. Not
 * silently (RS5): one line per run says which, and `/health` reports
 * `configured: false` where `/docs/checks` reads it.
 *
 * Core decides WHICH listings (the queue is a public read, refresh-dated and
 * oldest-first); this takes each picture and reports one word per attempt.
 * A failed attempt writes no picture — an outage is not an observation — and
 * is charged to the address, which leaves the queue at the tolerance.
 */
async function captureScreenshots(
  env: Env,
  result: SweepResult,
  now: Date,
  fetchImpl: typeof fetch,
  ledger: SweepLedger,
): Promise<void> {
  if (!env.CORE) return;
  const provider = captureProvider(env.SCREENSHOT_CAPTURE_URL, env.SCREENSHOT_CAPTURE_TOKEN);
  const bucket = requireMediaBucket(env);
  if (!provider.ok || !bucket.ok) {
    // `warn`, the one level this worker logs at (RS5): an opt-out is not a
    // failure, but it is the kind of absence RS5 exists to make audible.
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "sweep_phase_skipped",
        phase: "captures",
        reason: provider.ok ? "no_media_bucket" : provider.reason,
      }),
    );
    return;
  }

  const base = "https://openproduct.internal";
  const dueRes = await env.CORE.fetch(`${base}/internal/openproduct/media/captures/due`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!dueRes.ok) {
    phaseFailed(ledger, "captures_due", await refusalReason(dueRes), dueRes.status);
    return;
  }
  let due: DueCapture[];
  try {
    const body = (await dueRes.json()) as { data?: { captures?: DueCapture[] } };
    due = body.data?.captures ?? [];
  } catch (error) {
    phaseFailed(ledger, "captures_due", thrownReason(error));
    return;
  }

  for (const item of due.slice(0, CAPTURE_MAX_PER_RUN)) {
    result.captures.looked += 1;
    const report = await captureOne(env, bucket.bucket, provider, item, now, fetchImpl);
    await postCapture(env, report);
    if (report.ok) {
      result.captures.captured += 1;
    } else {
      result.captures.failed += 1;
      // The word, and only the word: no address, no body (RS5's rule).
      console.warn(JSON.stringify({ level: "warn", msg: "capture_failed", reason: report.error }));
    }
  }
}

async function postCapture(env: Env, report: CaptureReport): Promise<void> {
  if (!env.CORE) return;
  await env.CORE.fetch("https://openproduct.internal/internal/openproduct/media/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
  }).catch(() => undefined);
}

/**
 * The half that reaches INWARD (openproduct-worldclass RS2).
 *
 * Seven phases, none of which leaves the estate: they compute what the product
 * SHOWS from what it already holds. That is why this half is mandatory in
 * every environment that serves traffic while ingestion stays rare — the
 * frequency costs only our own compute, and its absence is what the 7 Sep
 * audit measured as an empty search, a dash on every row, a blank leaderboard
 * and a digest announcing that nothing had launched.
 *
 * THE ORDER WITHIN CHANGED ONCE, at OS5, and each step's reason is kept
 * beside it. Before OS5 the index rebuild ran first — "the surface a visitor
 * is most likely to notice missing" — and read the live join. Since OS5 the
 * catalogue is written before the index is built from it, and integrity runs
 * before the catalogue because it is the last phase that moves a number on a
 * card; the index still lands within the same tick, so nothing a visitor
 * notices moved.
 */
async function materialise(
  env: Env,
  result: SweepResult,
  ledger: SweepLedger,
  now: Date,
): Promise<SweepResult> {
  // EN3 — the integrity sweep, FIRST since OS5: it is the last phase that
  // moves a number on a card (the discount every count shows), and the
  // catalogue below is written from the cards. Core decides whether it is
  // DUE (an hour's floor); this asks.
  result.integritySwept = await sweepIntegrity(env, ledger);

  // OS5 — THE CATALOGUE, after integrity and before the index. One table of
  // every listed product with its latest observations and its pictures, in
  // the published order, which the front page and the API read with one
  // indexed query and the rebuild below reads to build the index — so the
  // index cannot hold a card the catalogue would not serve, and a listing is
  // in search within one tick of being listed (OO0's first sentence). Core
  // rewrites only rows whose content changed; a quiet tick writes nothing.
  result.catalogued = await materialiseCatalogue(env, ledger);

  // DS0 — the index rebuild. It reads the catalogue document the API serves
  // (`catalogCards`), which since OS5 is the table the phase above just
  // wrote. Core decides whether a rebuild is due (never built, or dirty and
  // past the floor) — in the database rather than in worker memory, because
  // there is no single worker: an isolate with its own timer rebuilds once
  // per isolate, which on a busy minute is exactly the sixty rebuilds the
  // floor exists to prevent.
  result.reindexed = await rebuildIndex(env, ledger);

  result.snapshotsTaken = await takeSnapshots(env, ledger);

  // LC0 — fire the launches whose moment has passed. LAST, and deliberately:
  // a launch going live is the most visible thing this sweep does, and doing
  // it after the index rebuild means the board's listing is already in the
  // search index when somebody arrives from it.
  result.launchesFired = await fireDueLaunches(env);

  // LC3 — rank the boards, IMMEDIATELY AFTER the launches fire and never
  // before. A launch that went live this tick belongs on today's board;
  // ranking first would leave it off until the next one, which on a board
  // whose whole subject is "today" is a launch that missed its own day.
  result.boardsRanked = await rankBoards(env, ledger);

  // TS4 — the defence sweep. AFTER the launches, which matters for one of
  // its four detectors: the board's eligibility check reads live launches,
  // and running before the fire would leave today's launch unread until the
  // next tick. Its own floor is six hours, so it declines most of the time
  // and this ordering costs nothing when it does.
  result.defenceSwept = await sweepDefence(env, ledger);

  // LC5 — the weekly digest. LAST, and after the board: the digest links to a
  // page the board and the launches have already been written into, and
  // sending before they land would email somebody a link to a week the site
  // has not finished assembling.
  //
  // Core decides whether the queue is due (the week's rows either exist or do
  // not); this only asks, exactly as with the four sweeps above.
  result.digest = await sendDigest(env, ledger);

  await reportOutcomes(env, ledger, now);

  return result;
}

/**
 * The ledger, handed to core as one write (LI0). Its own failure is logged
 * and not recorded — there is nowhere left to record it — and never takes
 * the sweep down: every phase above has already done or not done its work.
 */
async function reportOutcomes(env: Env, ledger: SweepLedger, now: Date): Promise<void> {
  if (!env.CORE) return;
  try {
    const res = await env.CORE.fetch("https://openproduct.internal/internal/openproduct/sweep/outcome", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ at: now.toISOString(), outcomes: ledgerOutcomes(ledger) }),
    });
    if (!res.ok) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "sweep_outcome_unrecorded",
          reason: await refusalReason(res),
          status: res.status,
        }),
      );
    }
  } catch (error) {
    console.warn(
      JSON.stringify({ level: "warn", msg: "sweep_outcome_unrecorded", reason: thrownReason(error) }),
    );
  }
}

/**
 * Queue the week's digest, then hand what is pending to the seam (LC5).
 *
 * TWO CALLS, NOT ONE, because they fail differently. The queue is idempotent
 * and cheap; the drain talks to another system and can half-succeed. Draining
 * still runs when queueing failed — there may be rows from a previous run
 * that somebody is waiting for, and skipping them because today's queue had a
 * bad minute would hold a send hostage to an unrelated failure.
 */
async function sendDigest(env: Env, ledger: SweepLedger): Promise<{ queued: number; sent: number }> {
  const none = { queued: 0, sent: 0 };
  if (!env.CORE) return none;
  const base = "https://openproduct.internal/internal/openproduct/digest";

  let queued = 0;
  try {
    const res = await env.CORE.fetch(`${base}/queue`, {
      method: "POST",
      headers: { accept: "application/json" },
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { queued?: { added?: number } | null } };
      queued = Number(body.data?.queued?.added ?? 0);
    } else {
      phaseFailed(ledger, "digest", await refusalReason(res), res.status);
    }
  } catch (error) {
    // A failed queue leaves last week unqueued and the next tick tries again.
    // The week id is stable, so nothing is lost by being late.
    phaseFailed(ledger, "digest", thrownReason(error));
  }

  // THE DRAIN, IN THREE STEPS ACROSS THE BOUNDARY. Core hands out what is
  // pending (it holds the database), this isolate signs and posts it (it can
  // reach the internet), and core is told which subject ids went.
  let sent = 0;
  try {
    const res = await env.CORE.fetch(`${base}/pending`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { queued, sent };
    const body = (await res.json()) as { data?: { pending?: OutboundDigest[] } };
    const pending = body.data?.pending ?? [];
    if (pending.length === 0) return { queued, sent };

    // INERT WITHOUT A DESTINATION. `deliverDigests` returns nothing delivered
    // when no URL is configured, so the rows stay queued rather than being
    // marked attempted — an environment that has not wired the seam has not
    // failed to send, it has not tried, and burning the attempts ceiling on
    // that would silently drop the week once the seam did arrive.
    if (!env.DIGEST_DELIVERY_URL) return { queued, sent };

    const { delivered } = await deliverDigests(env, pending);
    const report = await env.CORE.fetch(`${base}/delivered`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        delivered,
        // Everything we TRIED, so core can increment attempts on the rest.
        attempted: pending.map((p) => p.subjectId),
      }),
    });
    if (report.ok) {
      const reported = (await report.json()) as { data?: { sent?: number } };
      sent = Number(reported.data?.sent ?? 0);
    }
  } catch {
    // A failed drain leaves everything queued and un-delivered, which is the
    // right failure: an unsent digest arrives late, and the pending read
    // re-checks the subscription, so somebody who left in the meantime still
    // does not get it.
  }

  return { queued, sent };
}

/**
 * Move every due launch to `live` or `missed` (LC0).
 *
 * A FAILURE LEAVES THEM SCHEDULED, which is the right failure: the next tick
 * tries again and a launch goes out late. The alternative — marking them
 * fired and hoping — would announce nothing while claiming it had, and a
 * maker whose launch silently evaporated has no way to find out.
 */
async function fireDueLaunches(env: Env): Promise<{ live: number; missed: number }> {
  const none = { live: 0, missed: 0 };
  if (!env.CORE) return none;
  try {
    const res = await env.CORE.fetch(
      "https://openproduct.internal/internal/openproduct/launches/fire",
      { method: "POST", headers: { accept: "application/json" } },
    );
    if (!res.ok) return none;
    const body = (await res.json()) as { data?: { fired?: { live?: number; missed?: number } } };
    return {
      live: Number(body.data?.fired?.live ?? 0),
      missed: Number(body.data?.fired?.missed ?? 0),
    };
  } catch {
    return none;
  }
}

/**
 * Ask core to rank the launch boards (LC3).
 *
 * Core decides WHICH days need it — open ones, plus any that were never
 * ranked at all. This only asks, exactly as with the three sweeps beside it.
 */
async function rankBoards(env: Env, ledger: SweepLedger): Promise<number> {
  if (!env.CORE) return 0;
  try {
    const res = await env.CORE.fetch(
      "https://openproduct.internal/internal/openproduct/launches/board-sweep",
      { method: "POST", headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      phaseFailed(ledger, "board", await refusalReason(res), res.status);
      return 0;
    }
    const body = (await res.json()) as { data?: { swept?: { ranked?: unknown[] } } };
    return Array.isArray(body.data?.swept?.ranked) ? body.data.swept.ranked.length : 0;
  } catch (error) {
    phaseFailed(ledger, "board", thrownReason(error));
    // A failed ranking leaves the PREVIOUS board standing, which is the right
    // failure: an out-of-date order is readable and self-correcting, and an
    // empty board on a day people launched into is not. Today's day stays
    // open, so the next tick ranks it again.
    return 0;
  }
}

/**
 * Ask core to run the defence sweep (TS4).
 *
 * CORE DECIDES WHETHER IT IS DUE, exactly as with the integrity sweep and the
 * index rebuild; this only asks. The floor is six hours rather than EN3's
 * one, because the slowest thing this sweep can notice — a cohort — is not
 * assessed until it has been quiet for three days.
 */
async function sweepDefence(env: Env, ledger: SweepLedger): Promise<boolean> {
  if (!env.CORE) return false;
  try {
    const res = await env.CORE.fetch(
      "https://openproduct.internal/internal/openproduct/defence/sweep",
      { method: "POST", headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      phaseFailed(ledger, "defence", await refusalReason(res), res.status);
      return false;
    }
    const body = (await res.json()) as { data?: { swept?: unknown } };
    return body.data?.swept !== null && body.data?.swept !== undefined;
  } catch (error) {
    phaseFailed(ledger, "defence", thrownReason(error));
    // A failed defence sweep leaves everything as it was: nothing flagged,
    // nothing de-indexed, nothing discounted. That is the right failure for
    // automation whose every action is a consequence for somebody — the
    // floor is not marked, so the next tick tries again.
    return false;
  }
}

async function sweepIntegrity(env: Env, ledger: SweepLedger): Promise<boolean> {
  if (!env.CORE) return false;
  try {
    const res = await env.CORE.fetch(
      "https://openproduct.internal/internal/openproduct/endorsements/integrity-sweep",
      { method: "POST", headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      phaseFailed(ledger, "integrity", await refusalReason(res), res.status);
      return false;
    }
    const body = (await res.json()) as { data?: { swept?: unknown } };
    return body.data?.swept !== null && body.data?.swept !== undefined;
  } catch (error) {
    phaseFailed(ledger, "integrity", thrownReason(error));
    // A failed sweep leaves the PREVIOUS assessment standing, which is the
    // right failure: the totals stay as they were rather than reverting to
    // undefended. The floor is not marked, so the next tick tries again.
    return false;
  }
}

async function takeSnapshots(env: Env, ledger: SweepLedger): Promise<boolean> {
  if (!env.CORE) return false;
  try {
    const res = await env.CORE.fetch(
      "https://openproduct.internal/internal/openproduct/snapshots/sweep",
      { method: "POST", headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      phaseFailed(ledger, "snapshots", await refusalReason(res), res.status);
      return false;
    }
    const body = (await res.json()) as { data?: { snapshots?: { recorded?: number } } };
    return typeof body.data?.snapshots?.recorded === "number";
  } catch (error) {
    phaseFailed(ledger, "snapshots", thrownReason(error));
    // A missed day is a missed BASELINE and nothing worse: the diff compares
    // against the most recent snapshot STRICTLY older than today, so a gap
    // widens the window rather than breaking it. The floor is not marked, so
    // the next tick tries again — and unlike the other phases, this one is
    // idempotent by primary key, so retrying costs nothing.
    return false;
  }
}

/**
 * OS5 — ask core to write the catalogue (`catalog_cards`) and stamp its moment.
 *
 * Core's answer is `rebuilt: true` with the counts, or a 503 naming the
 * failure's class; either way the previous catalogue stands with its own
 * moment, and the page renders that. Unlike the index there is no "not due":
 * the phase runs every tick and core writes only what changed.
 */
async function materialiseCatalogue(env: Env, ledger: SweepLedger): Promise<boolean> {
  if (!env.CORE) return false;
  try {
    const res = await env.CORE.fetch(
      "https://openproduct.internal/internal/openproduct/catalogue/rebuild",
      { method: "POST", headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      phaseFailed(ledger, "catalogue", await refusalReason(res), res.status);
      return false;
    }
    const body = (await res.json()) as { data?: { rebuilt?: boolean } };
    if (body.data?.rebuilt !== true) {
      phaseFailed(ledger, "catalogue", "declined:unknown", res.status);
      return false;
    }
    return true;
  } catch (error) {
    phaseFailed(ledger, "catalogue", thrownReason(error));
    return false;
  }
}

async function rebuildIndex(env: Env, ledger: SweepLedger): Promise<boolean> {
  if (!env.CORE) return false;
  try {
    const res = await env.CORE.fetch(
      "https://openproduct.internal/internal/openproduct/search/rebuild",
      { method: "POST", headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      // The one phase behind the audit's lowest-scoring dimension. RS4 watched
      // it fail here in silence on the sweep's first firing.
      phaseFailed(ledger, "search_rebuild", await refusalReason(res), res.status);
      return false;
    }
    const body = (await res.json()) as { data?: { rebuilt?: boolean; reason?: string } };
    if (body.data?.rebuilt !== true) {
      // DECLINING IS NOT FAILING, and the two are told apart by the reason.
      //
      // `clean` and `within-floor` are the floor doing its job — the system
      // working correctly, on every tick, forever. Logging those would be
      // logging the absence of news at six lines an hour, and a log that
      // fires on success is a log nobody reads on the day it matters.
      //
      // Any OTHER reason is a rebuild that declined for a cause nobody here
      // anticipated, which is worth exactly one line. This is the narrow
      // version of the distinction RS5 exists to draw: not "say everything",
      // but "never be silent about something surprising".
      const reason = body.data?.reason ?? "unknown";
      if (reason !== "clean" && reason !== "within-floor") {
        phaseFailed(ledger, "search_rebuild", `declined:${reason}`, res.status);
      }
      return false;
    }
    return true;
  } catch (error) {
    phaseFailed(ledger, "search_rebuild", thrownReason(error));
    // A failed rebuild leaves the previous index serving and `dirty_at` set,
    // so the next sweep tries again. A stale index is a far better failure
    // than an empty one, and it must never take the sweep down with it.
    return false;
  }
}

async function post(env: Env, source: DueSource, payload: Record<string, unknown>): Promise<void> {
  if (!env.CORE) return;
  await env.CORE.fetch("https://openproduct.internal/internal/openproduct/signals/observation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profileId: source.profileId, source: source.source, ...payload }),
  }).catch(() => undefined);
}


/**
 * Read what the sweep has actually done (openproduct-worldclass RS1).
 *
 * A READ, not a run — the counterpart to everything else in this file. The
 * gateway holds no database (the binding allowlist forbids one), so the three
 * durable timestamps live in core and this asks for them.
 *
 * IT MUST NOT BE ABLE TO HANG `/health`. A health endpoint that blocks on a
 * wedged dependency is a health endpoint that stops answering exactly when
 * somebody needs it to, so the call carries its own deadline and every
 * failure — no binding, non-200, unparseable body, timeout — returns `null`.
 * `null` is reported as `reachable: false`, which is a DIFFERENT answer from
 * three phases that have never run: "we could not ask" and "it never ran" are
 * distinct facts and the health document says which.
 */
const SWEEP_STATE_TIMEOUT_MS = 2_000;

/**
 * One phase's state as core sent it. Tolerates RS1's shape — a bare instant
 * or null — so a gateway deployed ahead of core reads a run as a run rather
 * than as nothing; LI0's shape carries the failure beside it.
 */
function phaseStateOf(value: unknown): SweepPhaseState {
  if (value === null || value === undefined) return NEVER_RUN;
  if (typeof value === "string") return { lastRunAt: value, lastError: null, lastErrorAt: null };
  if (typeof value === "object") {
    const v = value as Partial<Record<keyof SweepPhaseState, unknown>>;
    return {
      lastRunAt: typeof v.lastRunAt === "string" ? v.lastRunAt : null,
      lastError: typeof v.lastError === "string" ? v.lastError : null,
      lastErrorAt: typeof v.lastErrorAt === "string" ? v.lastErrorAt : null,
    };
  }
  return NEVER_RUN;
}

export async function readSweepState(env: Env): Promise<SweepStateDocument | null> {
  if (!env.CORE) return null;
  try {
    const res = await env.CORE.fetch(
      "https://openproduct.internal/internal/openproduct/sweep/state",
      {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(SWEEP_STATE_TIMEOUT_MS),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, unknown> };
    const data = body.data;
    if (!data) return null;
    const document: Record<SweepPhase, SweepPhaseState> = {
      catalogue: NEVER_RUN,
      searchIndex: NEVER_RUN,
      integrity: NEVER_RUN,
      defence: NEVER_RUN,
      board: NEVER_RUN,
      digest: NEVER_RUN,
      snapshots: NEVER_RUN,
    };
    for (const phase of SWEEP_PHASES) {
      document[phase] = phaseStateOf(data[phase]);
    }
    return document;
  } catch {
    return null;
  }
}
