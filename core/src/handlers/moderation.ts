// Acting on what the queue holds (openproduct-commons TS3).
//
// TS0 shipped the door and a queue a human could read, and deliberately
// stopped there: nothing could be done about anything in it. This is the
// acting half — triage, the four content acts, and the record each leaves.
//
// THREE RULES SHAPE EVERY HANDLER HERE.
//
// 1. NO ACT WITHOUT A LEDGER ROW. Every path writes `moderation_acts` before
//    it changes anything, and the state write carries the act's id. The
//    executor is non-transactional, so the ordering IS the guarantee: the
//    failure it leaves is "we recorded an act we did not carry out", never
//    "a listing was removed and nothing says who did it or why". TS-4 makes
//    every act appealable, and an act with no row cannot be appealed.
//
// 2. ONLY A PERSON REMOVES (TS-5). The actor is the forwarded subject, always
//    a human operator; the string `automatic` never reaches these handlers,
//    and the database has a CHECK that refuses it for anything but de-index.
//    Automation flags, discounts and de-indexes — that is the whole of what
//    it may do.
//
// 3. THE REPORTER IS TOLD, THE SUBJECT IS NOT TOLD WHO. Resolving a report
//    closes it with an outcome the reporter can see on their own report; the
//    listing's maintainers learn that an act was taken and never who asked
//    for it. A moderation surface that exposes reporters is one nobody uses
//    twice.
//
// This worker resolves no token (OPX-4): the subject arrives forwarded by the
// gateway, exactly as on every other authenticated route here.

import {
  ACT_LEGAL_FROM,
  DECLINE_ACT,
  MODERATION_REFUSALS,
  MODERATION_ACTS,
  actIsLegalFrom,
  reasonIsAcceptable,
  stateAfter,
  type ModerationAct,
  type ModerationRefusalReason,
} from "@openproduct/contracts";
import type { ModerationStateName, OpenproductRepository } from "@openproduct/db";

import { parseOperators, type ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { generateId, type Uuid } from "../ids.js";

export interface ModerationHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "appendModerationAct"
    | "setListingModerationState"
    | "getPublicProfile"
    | "resolveReport"
    | "triageReport"
    | "listOpenReports"
    | "listReportsForSubject"
    | "listModerationActsForSubject"
    // TS4 — the flag queue, worked from the same surface and by the same
    // operators. A second queue on a second page is a second page nobody
    // opens.
    | "listOpenFlags"
    | "resolveFlag"
  >;
  generateId?: () => Uuid;
  now?: () => Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * The operator allowlist — the SAME one OD's admin review and TS0's queue
 * already read, never a second list. An empty allowlist means nobody, which
 * is the correct default for a surface that can erase somebody's work.
 */
function isOperator(env: Env, actor: ActorContext): boolean {
  return parseOperators(env.OPENPRODUCT_OPERATORS).has(actor.subjectId);
}

function refuse(reason: ModerationRefusalReason, requestId: string, status = 409): Response {
  return errorResponse(reason, MODERATION_REFUSALS[reason].says, status, requestId);
}

interface ActBody {
  act?: unknown;
  slug?: unknown;
  reason?: unknown;
  reportId?: unknown;
}

/**
 * Act on a listing: delist, remove, relist, restore.
 *
 * The transition table lives in the contract and is PASSED to the repository
 * rather than re-encoded in SQL — a removal is undone by restoring it and a
 * delisting by relisting it, never the other way round, and the ledger is
 * append-only, so an act recorded under the wrong name is wrong forever.
 */
export async function handleModerationAct(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: ModerationHandlerDeps,
): Promise<Response> {
  if (!isOperator(env, actor)) return refuse("not-an-operator", requestId, 403);
  // Removal is a HUMAN act in every path (TS-5). A service principal holding
  // an operator id would otherwise be an automated removal wearing a name.
  if (actor.subjectType !== "user") return refuse("automated-removal", requestId, 403);

  let body: ActBody;
  try {
    body = (await request.json()) as ActBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const act = body.act;
  if (typeof act !== "string" || !(MODERATION_ACTS as readonly string[]).includes(act)) {
    return validationError(requestId, { act: [`Must be one of: ${MODERATION_ACTS.join(", ")}`] });
  }
  const toState = stateAfter(act as ModerationAct);
  if (toState === null) {
    // A real act in the vocabulary that moves no content state — a trust
    // change, an appeal outcome. Those have their own paths; refusing here is
    // better than writing a ledger row this endpoint cannot honour.
    return validationError(requestId, { act: ["That act does not move a listing's state"] });
  }

  const slug = body.slug;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return validationError(requestId, { slug: ["Must be a listing slug"] });
  }

  const reason = body.reason;
  if (typeof reason !== "string" || !reasonIsAcceptable(reason)) {
    return refuse("reason-required", requestId, 422);
  }

  let reportId: Uuid | null = null;
  if (body.reportId !== undefined && body.reportId !== null) {
    if (typeof body.reportId !== "string" || !UUID_RE.test(body.reportId)) {
      return validationError(requestId, { reportId: ["Must be a report id"] });
    }
    reportId = body.reportId as Uuid;
  }

  // Read the current state so an illegal transition is refused with a
  // sentence rather than a silent no-op. The repository re-checks it in the
  // UPDATE's WHERE, which is what actually closes the race — this read is for
  // the message, not for the safety.
  const listing = await deps.repo.getPublicProfile(slug);
  if (!listing) return refuse("unknown-subject", requestId, 404);
  if (!actIsLegalFrom(act as ModerationAct, listing.moderationState)) {
    return refuse("illegal-transition", requestId, 409);
  }

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const actId = (deps.generateId ?? generateId)();

  // THE LEDGER FIRST. See the header: the two failure windows are not
  // symmetric, and this is the one that leaves a repairable over-record
  // rather than an unappealable removal.
  await deps.repo.appendModerationAct({
    id: actId,
    subjectKind: "listing",
    subjectRef: listing.slug,
    act: act as ModerationAct,
    actorId: actor.subjectId,
    reason: reason.trim(),
    reportId,
    occurredAt: at,
  });

  const updated = await deps.repo.setListingModerationState({
    slug: listing.slug,
    state: toState as ModerationStateName,
    at,
    // `visible` carries no act and no date: it is the absence of one, and the
    // 1440 CHECK refuses a visible row that claims either.
    actId: toState === "visible" ? null : actId,
    legalFrom: (ACT_LEGAL_FROM[act as ModerationAct] ?? []) as readonly ModerationStateName[],
  });

  // Null means the row moved between the read above and the write — somebody
  // else acted first. The ledger row stands (it is append-only and honest
  // about what was attempted); the caller is told the transition no longer
  // applies rather than being shown a success that did not happen.
  if (!updated) return refuse("illegal-transition", requestId, 409);

  // A report answered by an act is `actioned`, not `declined`. Resolving it
  // here rather than making the triager do it separately is what keeps "the
  // reporter is told the outcome" true without a second click nobody makes.
  if (reportId) {
    await deps.repo.resolveReport(reportId, "actioned", actor.subjectId, at);
  }

  return successResponse(
    {
      slug: updated.slug,
      moderationState: updated.moderationState,
      moderatedAt: updated.moderatedAt,
      actId,
    },
    requestId,
  );
}

interface TriageBody {
  reportId?: unknown;
  decision?: unknown;
  reason?: unknown;
}

/**
 * Move a report without touching content: claim it, or decline it.
 *
 * CLAIMING AND ACTING ARE TWO DECISIONS. A queue that fuses them has no way
 * to say "I have read this and I am thinking", which is how two people end up
 * working the same row and one of them acts twice.
 *
 * A DECLINE WRITES A LEDGER ROW TOO. TS-4 counts every act in public, and
 * "we looked and did nothing" is the number that makes the rest of the report
 * believable — an estate that only publishes its removals is publishing a
 * boast.
 */
export async function handleTriageReport(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: ModerationHandlerDeps,
): Promise<Response> {
  if (!isOperator(env, actor)) return refuse("not-an-operator", requestId, 403);
  if (actor.subjectType !== "user") return refuse("automated-removal", requestId, 403);

  let body: TriageBody;
  try {
    body = (await request.json()) as TriageBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const reportId = body.reportId;
  if (typeof reportId !== "string" || !UUID_RE.test(reportId)) {
    return validationError(requestId, { reportId: ["Must be a report id"] });
  }
  const decision = body.decision;
  if (decision !== "claim" && decision !== "decline") {
    return validationError(requestId, {
      decision: ["Must be one of: claim, decline (acting is POST /moderation/acts)"],
    });
  }

  const at = (deps.now ?? (() => new Date()))().toISOString();

  if (decision === "claim") {
    const claimed = await deps.repo.triageReport(reportId as Uuid, at);
    // Only `open` can be claimed, so null means somebody already has it.
    if (!claimed) return refuse("already-resolved", requestId, 409);
    return successResponse({ id: claimed.id, state: claimed.state }, requestId);
  }

  const reason = body.reason;
  if (typeof reason !== "string" || !reasonIsAcceptable(reason)) {
    return refuse("reason-required", requestId, 422);
  }

  // Ledger first here too, and for the same reason: a decline is an act
  // TS5 counts, and one that resolved the report without recording itself
  // would make the published totals understate what we actually decided.
  const actId = (deps.generateId ?? generateId)();
  const declined = await deps.repo.resolveReport(
    reportId as Uuid,
    "declined",
    actor.subjectId,
    at,
  );
  if (!declined) return refuse("already-resolved", requestId, 409);

  await deps.repo.appendModerationAct({
    id: actId,
    subjectKind: declined.subjectKind,
    subjectRef: declined.subjectRef,
    act: DECLINE_ACT,
    actorId: actor.subjectId,
    reason: reason.trim(),
    reportId: declined.id as Uuid,
    occurredAt: at,
  });

  return successResponse({ id: declined.id, state: declined.state, actId }, requestId);
}

/**
 * Everything a triager needs about one subject, in one read.
 *
 * The other reports about the same thing, and every act ever taken on it.
 * Both matter before acting: three open reports about one listing is a
 * different decision from one, and a listing that has been restored once
 * already is a different decision from one that has never been touched.
 */
export async function handleSubjectDossier(
  env: Env,
  url: URL,
  requestId: string,
  actor: ActorContext,
  deps: ModerationHandlerDeps,
): Promise<Response> {
  if (!isOperator(env, actor)) return refuse("not-an-operator", requestId, 403);

  const kind = url.searchParams.get("subjectKind") ?? "";
  const ref = url.searchParams.get("subjectRef") ?? "";
  if (!kind || !ref || !SLUG_RE.test(ref)) {
    return validationError(requestId, { subjectRef: ["Must be a public identifier"] });
  }

  const [reports, acts] = await Promise.all([
    deps.repo.listReportsForSubject(kind, ref, 50),
    deps.repo.listModerationActsForSubject(kind, ref, 50),
  ]);

  return successResponse({ reports, acts }, requestId);
}


// ---------------------------------------------------------------------------
// The flag queue (openproduct-commons TS4)
// ---------------------------------------------------------------------------

/**
 * What the detectors noticed, oldest first.
 *
 * SAME OPERATORS, SAME PAGE, SEPARATE TABLE. A flag is not a report — 1480's
 * header sets out why they are stored apart — but a triager has one attention
 * and a second queue on a second page is a second page nobody opens.
 *
 * The rows carry prose evidence and no score, so what a triager reads is a
 * sentence they can check against the thing itself rather than a number they
 * can only defer to.
 */
export async function handleListFlagQueue(
  env: Env,
  requestId: string,
  actor: ActorContext,
  deps: ModerationHandlerDeps,
): Promise<Response> {
  if (!isOperator(env, actor)) {
    return refuse("not-an-operator", requestId, 403);
  }
  const flags = await deps.repo.listOpenFlags(100);
  return successResponse({ flags }, requestId);
}

interface ResolveFlagBody {
  flagId?: unknown;
  verdict?: unknown;
}

/**
 * A human's verdict on a flag.
 *
 * TWO OUTCOMES AND BOTH ARE COUNTED. `dismissed` is not an absence of a
 * decision — it is the estate's only production measurement of its own
 * false-positive rate, and a detector that cannot be shown to be wrong is a
 * detector nobody can argue with.
 *
 * NO REASON IS REQUIRED, unlike a moderation act, and the asymmetry is
 * deliberate: an act needs a reason because a PERSON has to be able to appeal
 * it, and nobody appeals a machine being told it was wrong. Requiring one
 * would tax the dismissal path — the path the estate most wants used.
 *
 * RESOLVING A FLAG DOES NOT UNDO ITS CONSEQUENCE. Dismissing a filler flag
 * says the detector was wrong; RE-INDEXING the listing is a moderation act
 * with a reason, taken through the normal path, and recorded as one. Fusing
 * them would let a click un-take an act without leaving a row saying so,
 * which is precisely what the append-only ledger exists to prevent.
 */
export async function handleResolveFlag(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: ModerationHandlerDeps,
): Promise<Response> {
  if (!isOperator(env, actor)) {
    return refuse("not-an-operator", requestId, 403);
  }

  let body: ResolveFlagBody;
  try {
    body = (await request.json()) as ResolveFlagBody;
  } catch {
    return validationError(requestId, { body: ["Expected a JSON object"] });
  }

  const flagId = typeof body.flagId === "string" ? body.flagId : "";
  if (!UUID_RE.test(flagId)) {
    return validationError(requestId, { flagId: ["Expected a flag id"] });
  }
  const verdict = body.verdict === "actioned" || body.verdict === "dismissed" ? body.verdict : null;
  if (verdict === null) {
    return validationError(requestId, { verdict: ["Expected 'actioned' or 'dismissed'"] });
  }

  const at = (deps.now?.() ?? new Date()).toISOString();
  const resolved = await deps.repo.resolveFlag(flagId as Uuid, verdict, actor.subjectId, at);
  // Null means it was already resolved. Terminal from open only, for the same
  // reason a report is: re-resolving would rewrite who closed it and when,
  // and the dismissal count is a number the estate publishes.
  if (!resolved) return refuse("already-resolved", requestId);

  return successResponse({ id: resolved.id, state: resolved.state }, requestId);
}
