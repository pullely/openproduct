// RS1 read the three floors the sweep phases already kept. LI0 (openproduct-
// worldclass-v2) widens the read to five phases and adds the write: what the
// gateway saw of each phase this tick, so a failure is a COLUMN a health read
// can report rather than a log line only a dashboard can (WC2-1).
import {
  SWEEP_REASON_MAX_LENGTH,
  isSweepPhase,
  type SweepOutcome,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { successResponse, validationError } from "../http.js";

export interface SweepStateHandlerDeps {
  repo: Pick<OpenproductRepository, "getSweepPhaseStates" | "recordSweepOutcomes">;
}

/**
 * GET /internal/openproduct/sweep/state
 *
 * One state per phase — `{ lastRunAt, lastError, lastErrorAt }` — computed by
 * nobody: core has the database and no opinion about what "stale" means,
 * while the gateway carries the cron whose interval defines it. The five rows
 * are read concurrently inside the repository; a health endpoint that
 * serialises five round trips is one that times out under exactly the
 * conditions it exists to report.
 */
export async function handleSweepState(
  _env: Env,
  requestId: string,
  deps: SweepStateHandlerDeps,
): Promise<Response> {
  return successResponse(await deps.repo.getSweepPhaseStates(), requestId);
}

interface OutcomeBody {
  at?: unknown;
  outcomes?: unknown;
}

/**
 * POST /internal/openproduct/sweep/outcome
 *
 * `{ at, outcomes: [{ phase, ok, reason }] }`, once per sweep, from the
 * gateway. The reason is bounded here as well as there: this route is
 * reachable only over the gateway's service binding, but a column a public
 * health read serves is not somewhere to trust a caller about length.
 */
export async function handleSweepOutcome(
  _env: Env,
  request: Request,
  requestId: string,
  deps: SweepStateHandlerDeps,
): Promise<Response> {
  let body: OutcomeBody;
  try {
    body = (await request.json()) as OutcomeBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const at =
    typeof body.at === "string" && Number.isFinite(Date.parse(body.at))
      ? body.at
      : new Date().toISOString();

  if (!Array.isArray(body.outcomes)) {
    return validationError(requestId, { outcomes: ["Must be a list"] });
  }

  const outcomes: SweepOutcome[] = [];
  const seen = new Set<string>();
  for (const raw of body.outcomes as unknown[]) {
    const candidate = (raw ?? {}) as { phase?: unknown; ok?: unknown; reason?: unknown };
    if (!isSweepPhase(candidate.phase)) {
      return validationError(requestId, { outcomes: ["Unknown phase"] });
    }
    if (typeof candidate.ok !== "boolean") {
      return validationError(requestId, { outcomes: [`${candidate.phase}: ok must be a boolean`] });
    }
    if (seen.has(candidate.phase)) {
      return validationError(requestId, { outcomes: [`${candidate.phase}: listed twice`] });
    }
    seen.add(candidate.phase);
    const reason =
      candidate.ok || typeof candidate.reason !== "string" || candidate.reason.length === 0
        ? null
        : candidate.reason.slice(0, SWEEP_REASON_MAX_LENGTH);
    outcomes.push({
      phase: candidate.phase,
      ok: candidate.ok,
      reason: candidate.ok ? null : (reason ?? "unknown"),
    });
  }

  const recorded = await deps.repo.recordSweepOutcomes(outcomes, at);
  return successResponse({ recorded, at }, requestId);
}
