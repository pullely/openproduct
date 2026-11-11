// The report door (openproduct-commons TS0).
//
// Live from day one, before there is anything to report, and that ordering is
// the point: OPC-8 makes every public write surface this program adds wait
// for its named control here, and a control that arrives with the surface it
// governs has never been exercised when it is first needed.
//
// WHO MAY REPORT. A signed-in subject, and nobody else. TS-1's first layer is
// standing, and OPX-2 already settles that login gates interaction. An
// anonymous report carries no accountability, and a flood of them is itself
// an attack on the queue this endpoint feeds. Anonymous visitors keep the
// route they have always had — the report address in the footer (OD-C),
// which reaches a human rather than this table.
//
// WHAT A REPORTER LEARNS. That we received it. Nothing else — not how many
// others reported the same thing, not whether their own previous report is
// still open, not what state the subject is in. Every one of those is a
// brigading signal, and a duplicate is answered 200 with the same body a
// first report gets, so an error code cannot be used to probe the queue.
//
// This worker resolves no token (OPX-4). The subject arrives forwarded by the
// gateway, exactly as it does for every other authenticated route here.

import {
  MAX_REPORT_DETAIL,
  REPORT_REASONS,
  REPORT_SUBJECT_KINDS,
  type ReportReason,
  type ReportSubjectKind,
  type SubmitReportResponse,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import { parseOperators, type ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { generateId, type Uuid } from "../ids.js";

export interface ReportHandlerDeps {
  repo: Pick<OpenproductRepository, "createReport" | "listOpenReports">;
  generateId?: () => Uuid;
  now?: () => Date;
}

/** A public ref from the open internet. Bounded before it reaches SQL. */
const SUBJECT_REF_RE = /^[A-Za-z0-9@._-]{1,128}$/;

interface ReportBody {
  subjectKind?: unknown;
  subjectRef?: unknown;
  reason?: unknown;
  detail?: unknown;
}

export async function handleSubmitReport(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: ReportHandlerDeps,
): Promise<Response> {
  // Reporting is a human act. A service principal filing reports is either a
  // bug or an attack, and neither is worth a code path.
  if (actor.subjectType !== "user") {
    return errorResponse(
      "forbidden",
      "Reports come from people — this credential is not one",
      403,
      requestId,
    );
  }

  let body: ReportBody;
  try {
    body = (await request.json()) as ReportBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const subjectKind = body.subjectKind;
  if (
    typeof subjectKind !== "string" ||
    !(REPORT_SUBJECT_KINDS as readonly string[]).includes(subjectKind)
  ) {
    return validationError(requestId, {
      subjectKind: [`Must be one of: ${REPORT_SUBJECT_KINDS.join(", ")}`],
    });
  }

  const subjectRef = body.subjectRef;
  if (typeof subjectRef !== "string" || !SUBJECT_REF_RE.test(subjectRef)) {
    return validationError(requestId, { subjectRef: ["Must be a public identifier"] });
  }

  const reason = body.reason;
  if (typeof reason !== "string" || !(REPORT_REASONS as readonly string[]).includes(reason)) {
    return validationError(requestId, { reason: [`Must be one of: ${REPORT_REASONS.join(", ")}`] });
  }

  let detail: string | null = null;
  if (body.detail !== undefined && body.detail !== null) {
    if (typeof body.detail !== "string")
      return validationError(requestId, { detail: ["Must be a string"] });
    const trimmed = body.detail.trim();
    if (trimmed.length > MAX_REPORT_DETAIL) {
      return validationError(requestId, {
        detail: [`Must be at most ${MAX_REPORT_DETAIL} characters`],
      });
    }
    detail = trimmed.length > 0 ? trimmed : null;
  }

  const id = (deps.generateId ?? generateId)();
  const created = await deps.repo.createReport({
    id,
    subjectKind: subjectKind as ReportSubjectKind,
    subjectRef,
    reporterSubjectId: actor.subjectId,
    reason: reason as ReportReason,
    detail,
  });

  // A duplicate returns null from the repository (the partial unique index
  // refused it). Answer exactly as a first report does: the reporter has told
  // us, which is true, and the queue is not a thing they get to probe.
  const response: SubmitReportResponse = created
    ? { id: created.id, state: created.state as SubmitReportResponse["state"] }
    : { id, state: "open" };

  return successResponse(response, requestId, 202);
}

/**
 * The queue. Oldest first — a moderation queue worked newest-first is a queue
 * that never reaches its tail, and the reports it never reaches are the ones
 * about the listings nobody else is watching.
 *
 * Authorization is deliberately narrow at TS0: an operator subject, named in
 * the environment. The full triage surface, its permissions and its acts are
 * TS3; what TS0 owes is a queue a human can actually read today.
 */
export async function handleListReportQueue(
  env: Env,
  requestId: string,
  actor: ActorContext,
  deps: ReportHandlerDeps,
): Promise<Response> {
  if (!isOperator(env, actor)) {
    return errorResponse("forbidden", "The moderation queue is not yours", 403, requestId);
  }
  const reports = await deps.repo.listOpenReports(100);
  return successResponse({ reports }, requestId);
}

/**
 * The operator allowlist — the SAME one OD's admin review already reads, not a
 * second list. An empty allowlist means nobody, which is the correct default
 * for a surface that shows what people reported about each other.
 */
function isOperator(env: Env, actor: ActorContext): boolean {
  return parseOperators(env.OPENPRODUCT_OPERATORS).has(actor.subjectId);
}
