// The integrity sweep (openproduct-commons EN3).
//
// WHAT THIS DOES: reads a window of live endorsements, asks the contract's
// pure assessor what it thinks, and RESTATES — recording new discounts and
// reversing ones it no longer holds. It deletes nothing.
//
// NOT PUBLIC, AND NOT A READ. A read that writes is a write amplifier
// somebody discovers by holding down refresh, and this one walks a week of
// endorsements. It sits on the internal plane beside DS0's index rebuild,
// for the same reason and with the same shape.
//
// EVERY RESTATEMENT LEAVES AN AUDIT ROW. Not for tidiness: EN-3's rule is
// that a public total may be restated and the restatement must be
// accountable. "We discounted 412 endorsements this week" with no record of
// which sweep decided it, over what window, is a number nobody can check —
// which is the exact failure the discount exists to prevent, arriving from
// our side.
//
// THE AUDIT ROW CARRIES NO SUBJECT IDS. It carries counts and the listings
// whose totals moved. A per-person integrity record in an audit log is a
// per-person integrity record, wherever it is stored, and EN-4 says there
// is not one anywhere (the `endorsement_integrity` table itself is the
// machine's working state, read by the recompute and by nothing else).

import {
  INTEGRITY_REASONS,
  INTEGRITY_WINDOW_MS,
  assessIntegrity,
  type IntegrityObservation,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";
import { generateId, type Uuid } from "../ids.js";
import { publishEndorsementCountsFor } from "./endorsement-counts.js";

export interface IntegrityHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listEndorsementsForIntegrity"
    | "restateIntegrity"
    | "integrityDisclosure"
    | "appendAudit"
    | "getIntegritySweptAt"
    | "markIntegritySwept"
    // EN2 — the restatement moves public totals, so it republishes them.
    | "countEndorsements"
    | "writeMetric"
  >;
  now?: () => number;
  generateId?: () => Uuid;
}

/**
 * How many endorsements one sweep will read.
 *
 * Bounded because the sweep is a single request and an unbounded one over a
 * busy week is a request that times out and therefore never restates
 * anything — a limit that silently stops the integrity model is worse than a
 * limit that makes it read less. When the window truncates, the response
 * SAYS SO, so an operator sees a sweep that needs a shorter window rather
 * than one that is quietly half-blind.
 */
export const SWEEP_MAX_OBSERVATIONS = 50_000;

/**
 * The floor: how often the sweep will actually run.
 *
 * CORE DECIDES WHETHER IT IS DUE; THE CALLER ONLY ASKS — the same division
 * DS0 drew for the index rebuild, and for the same reason. The gateway's
 * cron cadence is per-environment configuration this repository cannot see,
 * so a sweep with no floor would read a week of endorsements on every tick,
 * and a floor in worker memory would be a floor per isolate.
 *
 * An hour, because integrity is about patterns across a WEEK. Assessing more
 * often does not see anything a week-long window did not already contain; it
 * just reads the same rows again.
 */
export const SWEEP_FLOOR_MS = 60 * 60 * 1000;

/** The org the audit row is filed under. The sweep is estate-wide rather than
 *  per-tenant, so it uses the nil uuid — a real org id here would file a
 *  cross-tenant decision in one tenant's trail. */
const SYSTEM_ORG = "00000000-0000-0000-0000-000000000000" as Uuid;

/**
 * The discount reasons this sweep is responsible for.
 *
 * EVERYTHING `assessIntegrity` CAN PRODUCE, minus what it cannot. TS4 added
 * `cohort` to the shared vocabulary and writes it from a different sweep on a
 * different cadence; a reversal that did not exclude it would leave the two
 * sweeps undoing each other's work forever.
 */
const SWEEP_REASONS: readonly string[] = INTEGRITY_REASONS.filter((r) => r !== "cohort");

export async function handleIntegritySweep(
  _env: Env,
  request: Request,
  requestId: string,
  deps: IntegrityHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  const force = new URL(request.url).searchParams.get("force") === "1";

  // THE FLOOR, BEFORE THE EXPENSIVE READ. Checking after would mean the
  // not-due path still walked a week of endorsements, which is the whole cost
  // the floor exists to avoid.
  const sweptAt = await deps.repo.getIntegritySweptAt();
  if (!force && sweptAt !== null && now - Date.parse(sweptAt) < SWEEP_FLOOR_MS) {
    return successResponse({ swept: null, reason: "not_due", sweptAt }, requestId, 200);
  }

  const windowStart = new Date(now - INTEGRITY_WINDOW_MS).toISOString();
  const rows = await deps.repo.listEndorsementsForIntegrity(windowStart, SWEEP_MAX_OBSERVATIONS);
  const truncated = rows.length >= SWEEP_MAX_OBSERVATIONS;

  const observations: IntegrityObservation[] = rows.map((row) => ({
    profileId: row.profileId,
    subjectId: row.subjectId,
    createdAt: Date.parse(row.createdAt),
    subjectFirstSeenAt: Date.parse(row.subjectFirstSeenAt),
  }));

  const assessment = assessIntegrity(observations);

  const restatement = await deps.repo.restateIntegrity({
    findings: assessment.discount.map((finding) => ({
      profileId: finding.profileId,
      subjectId: finding.subjectId,
      reason: finding.reason,
    })),
    windowStart,
    // THE REASONS THIS SWEEP OWNS — everything its assessor can produce, and
    // nothing else. TS4 writes `cohort` discounts to endorsements inside this
    // window that this model has never heard of; without this bound the
    // reversal half would undo every one of them on every run.
    reasons: SWEEP_REASONS,
    decidedBy: "automatic",
    at: new Date(now).toISOString(),
  });

  // ONE AUDIT ROW PER RESTATEMENT THAT CHANGED SOMETHING. A sweep that found
  // nothing new writes nothing: an audit trail where most rows say "no
  // change" is a trail nobody reads, and the ones that matter are the ones
  // that moved a public number.
  if (restatement.applied > 0 || restatement.reversed > 0) {
    await deps.repo.appendAudit({
      id: (deps.generateId ?? generateId)(),
      orgId: SYSTEM_ORG,
      profileId: null,
      actorType: "system",
      actorId: "integrity-sweep",
      type: "openproduct.endorsement_integrity_restated",
      description: `Restated ${restatement.applied} discount(s) and reversed ${restatement.reversed} across ${restatement.touchedProfileIds.length} listing(s).`,
      payload: {
        windowStart,
        observations: observations.length,
        truncated,
        applied: restatement.applied,
        reversed: restatement.reversed,
        rings: assessment.rings.length,
        // COUNTS AND LISTINGS, NEVER SUBJECTS. A per-person integrity record
        // in an audit log is still a per-person integrity record (EN-4).
        touchedProfileIds: restatement.touchedProfileIds,
      },
      requestId,
      occurredAt: new Date(now).toISOString(),
    });
  }

  // EN2 — REPUBLISH THE TOTALS THE RESTATEMENT MOVED, before marking the
  // floor. A total that ignored the integrity model until the next endorse
  // on that listing is a total the model does not actually defend — a
  // discounted ring would keep counting until somebody happened to click.
  const republished = await publishEndorsementCountsFor(
    deps.repo as never,
    restatement.touchedProfileIds,
    now,
    deps.generateId,
  );

  // MARKED AFTER THE RESTATEMENT LANDED, not before. A sweep that crashed
  // half-way must be due again — recording the attempt rather than the
  // completion would silently skip an hour of assessment for every failure.
  await deps.repo.markIntegritySwept(new Date(now).toISOString());

  return successResponse(
    {
      swept: {
        windowStart,
        observations: observations.length,
        truncated,
        rings: assessment.rings.length,
        applied: restatement.applied,
        reversed: restatement.reversed,
        touched: restatement.touchedProfileIds.length,
        republished,
      },
    },
    requestId,
    200,
  );
}

/**
 * GET the aggregate disclosure — counts by reason (EN-4, feeding TS5).
 *
 * ON THE INTERNAL PLANE FOR NOW. TS5 builds the public transparency report
 * and will read this; publishing it before that page exists would put a bare
 * number on the internet with no sentence around it, which is the shape this
 * program refuses everywhere else.
 */
export async function handleIntegrityDisclosure(
  _env: Env,
  request: Request,
  url: URL,
  requestId: string,
  deps: Pick<IntegrityHandlerDeps, "repo" | "now">,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  const now = deps.now?.() ?? Date.now();
  const days = Number.parseInt(url.searchParams.get("days") ?? "", 10);
  const window = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 7;
  const since = new Date(now - window * 24 * 60 * 60 * 1000).toISOString();

  const rows = await deps.repo.integrityDisclosure(since);
  return successResponse(
    { disclosure: { since, byReason: rows.map((r) => ({ reason: r.reason, discounted: r.discounted })) } },
    requestId,
    200,
  );
}
