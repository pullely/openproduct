// The signal plane's write door (openproduct-commons SN1).
//
// Two routes, reachable ONLY over the gateway's service binding — this worker
// has no public hostname (`workers_dev: false`, asserted in CI), so the same
// property that makes the seam event receivers safe makes these safe: there
// is no address at which an outsider can reach them.
//
// THE SHAPE, AND WHY THE GATEWAY DOES THE OBSERVING. The gateway holds the
// outbound fetch and the host pin (`github.ts`, OX3); core holds the database
// and no egress at all. Keeping it that way means the isolate that can write
// metrics cannot reach the internet, and the isolate that can reach the
// internet holds no database — which is the same division OD drew between the
// public read and the maintainer door, applied to ingestion.
//
//   GET  /internal/openproduct/signals/due          what to poll
//   POST /internal/openproduct/signals/observation  what was seen
//
// AN OUTAGE IS NOT AN OBSERVATION. The observation body carries `ok`, and a
// false one records a FAILURE — never a zero. Every route below preserves
// that distinction, because it is the one thing the whole sub-epic is for.

import {
  ACTIVITY_KINDS,
  MAX_ACTIVITY_SUMMARY,
  METRICS,
  METRIC_WINDOWS,
  REPO_SIGNAL_SOURCES,
  SOURCE_FAILURE_TOLERANCE,
  type ActivityKind,
  type MetricName,
  type MetricWindow,
  type RepoSignalSource,
} from "@openproduct/contracts";
// No `SignalSourceName` import any more: `RepoSignalSource` IS that union, and
// passing one where the repository asks for the other is now the compiler's
// check rather than a cast's assertion.
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { successResponse, validationError } from "../http.js";
import { readRepoObservation } from "../repo-observation.js";
import { generateId, parseProfilePublicId, profilePublicId, type Uuid } from "../ids.js";

export interface SignalHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listDueSignalSources"
    | "seedDeclaredRepoSources"
    | "recordRepoObservation"
    | "recordSignalSuccess"
    | "recordSignalFailure"
    | "writeMetric"
    | "appendActivity"
  >;
  generateId?: () => Uuid;
  now?: () => Date;
}

/** How long a source may go unread before the sweep picks it up again. Read
 *  from the contract so the cadence is a decision somebody made, not a
 *  constant that drifted. */
const DUE_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function handleListDueSignals(
  env: Env,
  requestId: string,
  deps: SignalHandlerDeps,
): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))();
  const before = new Date(now.getTime() - DUE_WINDOW_MS).toISOString();
  // OB2 — declare before reading. Every listed build with a GitHub URL gets
  // its watch row here, so a build is observed from the first sweep after it
  // publishes, and a cleared URL stops being polled. Idempotent: an unchanged
  // corpus writes nothing.
  await deps.repo.seedDeclaredRepoSources(now.toISOString());
  const sources = await deps.repo.listDueSignalSources(before, 50);
  void env;
  return successResponse(
    {
      sources: sources.map((source) => ({
        // A PUBLIC id over the wire, never the row's uuid — the gateway is
        // the other side of a boundary, and internal ids do not cross it.
        profileId: profilePublicId(source.profileId),
        source: source.source,
        locator: source.locator,
        slug: source.slug,
        repoUrl: source.repoUrl,
        failureCount: source.failureCount,
      })),
    },
    requestId,
  );
}

interface ObservationBody {
  profileId?: unknown;
  source?: unknown;
  ok?: unknown;
  error?: unknown;
  metrics?: unknown;
  activity?: unknown;
  repo?: unknown;
}

interface MetricInput {
  metric?: unknown;
  window?: unknown;
  value?: unknown;
}

interface ActivityInput {
  kind?: unknown;
  summary?: unknown;
  occurredAt?: unknown;
}

export async function handleRecordObservation(
  env: Env,
  request: Request,
  requestId: string,
  deps: SignalHandlerDeps,
): Promise<Response> {
  let body: ObservationBody;
  try {
    body = (await request.json()) as ObservationBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const profileId =
    typeof body.profileId === "string" ? parseProfilePublicId(body.profileId) : null;
  if (!profileId) return validationError(requestId, { profileId: ["Unknown listing"] });

  // THE REPOSITORY TIERS, NOT EVERY SOURCE THIS PRODUCT OBSERVES FROM.
  //
  // This validated against `SIGNAL_SOURCES` until MD0, which widened that
  // vocabulary with `declared_url` — a read of a listing's LIVE ADDRESS, for
  // a screenshot. `signal_sources` has no row shape for one: its rows are
  // keyed on (listing, source) and every write below addresses one. A
  // `declared_url` observation would therefore have matched no row, recorded
  // nothing, and answered 200 — an outage-shaped silence in the one plane
  // built to tell an outage from a zero.
  //
  // So the door names its own subset, and adding a source now forces the
  // question of which list it belongs to.
  const source = body.source;
  if (typeof source !== "string" || !(REPO_SIGNAL_SOURCES as readonly string[]).includes(source)) {
    return validationError(requestId, {
      source: [`Must be one of: ${REPO_SIGNAL_SOURCES.join(", ")}`],
    });
  }
  // A `RepoSignalSource`, which is EXACTLY `SignalSourceName` — the four
  // values `signal_sources` can hold. Narrowing here rather than to the wider
  // `SignalSource` turned four `as SignalSourceName` casts below into
  // type-checked assignments, so the day the two lists disagree the compiler
  // says so instead of a cast covering for it.
  const tier: RepoSignalSource = source as RepoSignalSource;
  const at = ((deps.now ?? (() => new Date()))()).toISOString();

  // An outage. Record the failure and withdraw at tolerance — and write NO
  // metric, because a number we could not read is never a number we read as
  // zero. This branch is the whole reason the body carries `ok`.
  if (body.ok === false) {
    const error = typeof body.error === "string" ? body.error : "unknown";
    const updated = await deps.repo.recordSignalFailure(
      profileId,
      tier,
      error,
      at,
      SOURCE_FAILURE_TOLERANCE,
    );
    void env;
    return successResponse(
      { recorded: "failure", withdrawn: updated?.withdrawnAt !== null && updated !== null },
      requestId,
    );
  }

  const metrics = Array.isArray(body.metrics) ? (body.metrics as MetricInput[]) : [];
  const activity = Array.isArray(body.activity) ? (body.activity as ActivityInput[]) : [];
  const fields: Record<string, string[]> = {};

  for (const entry of metrics) {
    if (
      typeof entry.metric !== "string" ||
      !(METRICS as readonly string[]).includes(entry.metric)
    ) {
      fields.metrics = [`Unknown metric: ${String(entry.metric)}`];
      break;
    }
    if (
      typeof entry.window !== "string" ||
      !(METRIC_WINDOWS as readonly string[]).includes(entry.window)
    ) {
      fields.metrics = [`Unknown window: ${String(entry.window)}`];
      break;
    }
    if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
      // Integers only. A float here would be the first step toward a score,
      // and OPC-4 forbids one.
      fields.metrics = ["Values must be finite numbers"];
      break;
    }
  }
  for (const entry of activity) {
    if (typeof entry.kind !== "string" || !(ACTIVITY_KINDS as readonly string[]).includes(entry.kind)) {
      fields.activity = [`Unknown kind: ${String(entry.kind)}`];
      break;
    }
    if (typeof entry.summary !== "string" || entry.summary.trim().length === 0) {
      fields.activity = ["Every event needs a summary"];
      break;
    }
    if (entry.summary.length > MAX_ACTIVITY_SUMMARY) {
      fields.activity = [`Summaries are at most ${MAX_ACTIVITY_SUMMARY} characters`];
      break;
    }
  }
  if (Object.keys(fields).length > 0) return validationError(requestId, fields);

  const nextId = deps.generateId ?? generateId;
  for (const entry of metrics) {
    await deps.repo.writeMetric({
      id: nextId(),
      profileId,
      metric: entry.metric as MetricName,
      window: entry.window as MetricWindow,
      value: entry.value as number,
      source: tier,
      observedAt: at,
    });
  }
  for (const entry of activity) {
    await deps.repo.appendActivity({
      id: nextId(),
      profileId,
      kind: entry.kind as ActivityKind,
      summary: entry.summary as string,
      // A name renders only for a CG3-confirmed person (OPC-5). Until CG3
      // exists there is nobody to confirm, so ingestion attributes nothing —
      // the act renders without an actor rather than with a subject id.
      actorSubjectId: null,
      source: tier,
      occurredAt:
        typeof entry.occurredAt === "string" && !Number.isNaN(Date.parse(entry.occurredAt))
          ? entry.occurredAt
          : at,
    });
  }
  // OB2 — the repository's own facts, refreshed on every pass rather than
  // only when a maintainer presses the check. ONLY A PUBLIC READ IS WRITTEN:
  // the sweep is not the door that decides a listing's repository has gone
  // private — a 404 on one hourly read is too thin to unpublish anyone's
  // facts on, and the maintainer's check (which can say so) stays the one
  // writer of that answer. Read with the same fail-closed reader that check
  // uses, so the two cannot disagree about what a body means.
  let repoObserved = false;
  if (body.repo && typeof body.repo === "object" && !Array.isArray(body.repo)) {
    const read = readRepoObservation(body.repo as Record<string, unknown>, at);
    if (read.linked && read.observation.repoVisibility === "public") {
      await deps.repo.recordRepoObservation(profileId, read.observation);
      repoObserved = true;
    }
  }
  await deps.repo.recordSignalSuccess(profileId, tier, at);

  return successResponse(
    {
      recorded: "observation",
      metrics: metrics.length,
      activity: activity.length,
      repo: repoObserved,
    },
    requestId,
  );
}

/** Exported so the gateway's sweep and this door agree on one number. */
export { DUE_WINDOW_MS };
