// The answer to an act (openproduct-commons TS5).
//
// TS0 wrote the ledger append-only and said, in its own header, that this is
// what it was for: "an act nobody wrote a reason for is an act nobody can
// appeal". TS3 made the acts. This is the appeal.
//
// FOUR HANDLERS ACROSS TWO AUDIENCES.
//
//   what was done to me   the maintainer's read. Every act ever taken against
//                         a listing they maintain, with their appeal beside it
//                         and whether it can still be appealed.
//   file one              the write, bounded by standing rather than by a
//                         rate: you may appeal acts against listings you
//                         maintain, each act once, ever.
//   the queue             the operator's read, oldest first.
//   decide                the write that reverses, or does not.
//
// ─── THE ORDERING, AGAIN, AND WHY IT IS THE SAME ORDERING ─────────────────
//
// TS3 established it and the reasoning transfers unchanged: the per-request
// executor is non-transactional, so a handler that changes state and then
// records it can leave a change nobody can account for, while one that
// records and then changes can leave a record of something that did not
// happen. The first is unappealable; the second is visible, repairable, and
// over-reports us in the published numbers, which is the direction an estate
// should err.
//
// So deciding an appeal writes, in order: the outcome act, the reversal act
// (when upholding), the reversal itself, and only then the appeal row. A
// crash anywhere leaves an appeal still OPEN whose ledger rows already exist
// — a state a person can read and finish, rather than a decision nobody can
// reconstruct.
//
// ─── THE APPEAL IS TOLD THE OUTCOME, NOT THE ARGUMENT ─────────────────────
//
// An upheld appeal reverses the act, which the appellant can see by looking
// at their own listing. A refused one says so. Neither carries the operator's
// reason or the operator's name: the reason is written for the ledger and for
// whoever reviews the decision later, and published to the appellant it would
// be a judgement about them delivered with no right of reply — which is the
// same asymmetry TS3 kept off the tombstone. What the estate answers for in
// public, it answers for in aggregate, at /transparency.

import {
  APPEAL_DECISIONS,
  APPEAL_OUTCOME_ACT,
  APPEAL_REFUSALS,
  MAX_APPEALABLE_ACTS,
  MAX_APPEAL_QUEUE,
  actIsAppealable,
  appealSaysIsAcceptable,
  reasonIsAcceptable,
  reversalOf,
  stateAfter,
  ACT_LEGAL_FROM,
  type AppealDecision,
  type AppealRefusalReason,
  type AppealView,
  type AppealableAct,
  type ModerationAct,
} from "@openproduct/contracts";
import type {
  AppealRecord,
  ModerationActRecord,
  ModerationStateName,
  OpenproductRepository,
} from "@openproduct/db";

import { parseOperators, type ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { generateId, type Uuid } from "../ids.js";

export interface AppealHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listProfilesMaintainedBy"
    | "listModerationActsForSubjects"
    | "listAppealsByAppellant"
    | "getModerationAct"
    | "createAppeal"
    | "hasAppealed"
    | "listOpenAppeals"
    | "getAppeal"
    | "resolveAppeal"
    | "appendModerationAct"
    | "setListingModerationState"
    | "getPublicProfile"
    | "getProfileIdBySlug"
    | "setListingIndexable"
  >;
  generateId?: () => Uuid;
  now?: () => Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(reason: AppealRefusalReason, requestId: string, status = 409): Response {
  return errorResponse(reason, APPEAL_REFUSALS[reason].says, status, requestId);
}

function isOperator(env: Env, actor: ActorContext): boolean {
  return parseOperators(env.OPENPRODUCT_OPERATORS).has(actor.subjectId);
}

/**
 * The appellant's view of their own appeal.
 *
 * `reversed` rather than the reversal act's id: the id is the ledger's
 * bookkeeping and means nothing to the person reading, while "did the thing
 * actually come back" is the only part of an outcome they can check.
 */
function appealView(appeal: AppealRecord, act: ModerationAct): AppealView {
  return {
    id: appeal.id,
    actId: appeal.actId,
    act,
    subjectKind: appeal.subjectKind,
    subjectRef: appeal.subjectRef,
    says: appeal.says,
    state: appeal.state,
    filedAt: appeal.filedAt,
    decidedAt: appeal.decidedAt,
    reversed: appeal.state === "open" ? null : appeal.reversalActId !== null,
  };
}

// ---------------------------------------------------------------------------
// What was done to me
// ---------------------------------------------------------------------------

/**
 * Every act taken against a listing this person maintains.
 *
 * STANDING IS COMPUTED HERE AND NOWHERE ELSE, from `listing_maintainers`, and
 * it is what makes every other handler in this file safe: the write path
 * re-derives the same set rather than trusting an act id from a form. A
 * person who maintains nothing gets an empty list without a second query.
 *
 * IT CARRIES THE ACT'S REASON, and this is the only surface on the estate
 * that does — the tombstone at the listing's public address deliberately does
 * not, because a reason there is a judgement about a person published to
 * strangers before they have answered it. Here it is being shown TO the
 * person it is about, which is the case that asymmetry exists to allow.
 */
export async function handleMyAppealableActs(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: AppealHandlerDeps,
): Promise<Response> {
  const mine = await deps.repo.listProfilesMaintainedBy(actor.subjectId);
  const slugs = mine.map((profile) => profile.slug);

  const [acts, appeals] = await Promise.all([
    deps.repo.listModerationActsForSubjects("listing", slugs, MAX_APPEALABLE_ACTS),
    // Their appeals, not the acts' appeals. Somebody else maintaining the
    // same listing may have appealed the same act, and telling this reader
    // about it would be telling them what a colleague said about a decision
    // — a fact about a person, arriving from us rather than from them.
    deps.repo.listAppealsByAppellant(actor.subjectId, MAX_APPEALABLE_ACTS),
  ]);

  const byAct = new Map(appeals.map((appeal) => [appeal.actId, appeal]));
  const rows: AppealableAct[] = acts.map((act) => {
    const appeal = byAct.get(act.id) ?? null;
    return {
      actId: act.id,
      act: act.act as ModerationAct,
      subjectKind: act.subjectKind,
      subjectRef: act.subjectRef,
      reason: act.reason,
      occurredAt: act.occurredAt,
      // Appealable means BOTH: the act is one of the three that can be
      // undone, and they have not already used their one attempt.
      appealable: actIsAppealable(act.act as ModerationAct) && appeal === null,
      appeal: appeal ? appealView(appeal, act.act as ModerationAct) : null,
    };
  });

  return successResponse({ acts: rows }, requestId);
}

// ---------------------------------------------------------------------------
// File one
// ---------------------------------------------------------------------------

interface FileBody {
  actId?: unknown;
  says?: unknown;
}

/**
 * File an appeal against one act.
 *
 * THE STANDING CHECK IS A RE-DERIVATION, NOT A TRUST. The act id arrives from
 * a form, so this handler looks the act up, then asks which listings the
 * caller maintains, and refuses unless the act names one of them. Doing it
 * the other way round — trusting that the form only ever offers appealable
 * acts — would make the read the security boundary, and a read is never one.
 *
 * The uniqueness rule is enforced in the INSERT (see `createAppeal`) rather
 * than by the check above it: two requests racing would both pass a read.
 * The read exists to produce a sentence, not to close the race.
 */
export async function handleFileAppeal(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: AppealHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  let body: FileBody;
  try {
    body = (await request.json()) as FileBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const actId = body.actId;
  if (typeof actId !== "string" || !UUID_RE.test(actId)) {
    return validationError(requestId, { actId: ["Must be the id of a decision"] });
  }
  const says = body.says;
  if (typeof says !== "string" || !appealSaysIsAcceptable(says)) {
    return refuse("says-required", requestId, 422);
  }

  const act = await deps.repo.getModerationAct(actId as Uuid);
  // 404 rather than a refusal that distinguishes "no such act" from "not
  // yours": an endpoint that answers differently for the two is an oracle for
  // whether a given id is a real moderation act.
  if (!act) return refuse("unknown-act", requestId, 404);
  if (!actIsAppealable(act.act as ModerationAct)) {
    return refuse("not-appealable", requestId, 422);
  }

  const mine = await deps.repo.listProfilesMaintainedBy(actor.subjectId);
  const holds =
    act.subjectKind === "listing" &&
    mine.some((profile) => profile.slug.toLowerCase() === act.subjectRef.toLowerCase());
  if (!holds) return refuse("no-standing", requestId, 403);

  const filed = await deps.repo.createAppeal({
    id: (deps.generateId ?? generateId)(),
    actId: act.id as Uuid,
    subjectKind: act.subjectKind,
    subjectRef: act.subjectRef,
    appellantSubjectId: actor.subjectId,
    says: says.trim(),
    filedAt: (deps.now ?? (() => new Date()))().toISOString(),
  });
  // Null means one of the two NOT EXISTS guards matched, and WHICH one is a
  // different sentence: their own earlier attempt, or a co-maintainer's
  // appeal still waiting. Classified after the failed write rather than
  // before it — a read before the INSERT would be a check two racing requests
  // could both pass, and the INSERT is what actually decides.
  if (!filed) {
    const mine = await deps.repo.hasAppealed(act.id as Uuid, actor.subjectId);
    return refuse(mine ? "already-appealed" : "already-open", requestId, 409);
  }

  return successResponse({ appeal: appealView(filed, act.act as ModerationAct) }, requestId, 201);
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

export interface QueuedAppeal {
  readonly id: string;
  readonly says: string;
  readonly filedAt: string;
  readonly act: ModerationAct;
  readonly subjectKind: string;
  readonly subjectRef: string;
  /** The reason given when the act was taken — what is being disputed. */
  readonly actReason: string;
  readonly actOccurredAt: string;
  /** What upholding would do, resolved here so the queue's buttons say it. */
  readonly reversal: ModerationAct | null;
}

/**
 * The appeals waiting, oldest first, each with the act it disputes.
 *
 * THE ACT IS JOINED IN RATHER THAN LINKED TO. An appeal read without the
 * decision it answers is unanswerable, and a queue that makes somebody click
 * through to find out what they are deciding is a queue worked by reading the
 * appeal alone — which is exactly how a reviewer ends up agreeing with
 * whoever wrote most persuasively rather than with whoever is right.
 *
 * IT DOES NOT NAME THE APPELLANT, and does not name the operator who took the
 * original act. Both for the reason TS3 keeps the reporter out of the queue:
 * a reviewer who can see whose decision they are reviewing can be lobbied
 * about whose decision they are reviewing, and the argument is supposed to
 * carry it.
 */
export async function handleAppealQueue(
  env: Env,
  requestId: string,
  actor: ActorContext,
  deps: AppealHandlerDeps,
): Promise<Response> {
  if (!isOperator(env, actor)) return refuse("not-an-operator", requestId, 403);

  const open = await deps.repo.listOpenAppeals(MAX_APPEAL_QUEUE);
  const acts = await Promise.all(
    open.map((appeal) => deps.repo.getModerationAct(appeal.actId as Uuid)),
  );

  const queue: QueuedAppeal[] = [];
  open.forEach((appeal, i) => {
    const act = acts[i];
    // An appeal whose act cannot be read is not rendered as a half-row: the
    // ledger is append-only so this cannot happen in practice, and a row that
    // silently lost the thing being disputed is worse than a shorter queue.
    if (!act) return;
    queue.push({
      id: appeal.id,
      says: appeal.says,
      filedAt: appeal.filedAt,
      act: act.act as ModerationAct,
      subjectKind: act.subjectKind,
      subjectRef: act.subjectRef,
      actReason: act.reason,
      actOccurredAt: act.occurredAt,
      reversal: reversalOf(act.act as ModerationAct),
    });
  });

  return successResponse({ appeals: queue }, requestId);
}

// ---------------------------------------------------------------------------
// Decide
// ---------------------------------------------------------------------------

interface DecideBody {
  appealId?: unknown;
  decision?: unknown;
  reason?: unknown;
}

/**
 * Uphold or refuse, and — when upholding — actually put it back.
 *
 * TWO LEDGER ROWS ON AN UPHELD APPEAL, and this is the one place where TS3's
 * "one button writing two ledger rows is a button whose ledger nobody can
 * read back" does NOT apply. There the two rows would have described a single
 * transition ambiguously (a restore and a delist, to express de-escalation),
 * so neither row was true on its own. Here they are two separate facts, each
 * true independently and each needed: `appeal_upheld` says we agreed, and the
 * reversal says the content came back. A reader of the ledger who saw only
 * the first could not tell whether anything happened.
 *
 * THE REVERSAL MAY BE A NO-OP, and the appeal is still upheld. Somebody else
 * may have restored the listing while the appeal waited; the judgement stands
 * and there is nothing left to undo. Writing a reversal act anyway would put
 * a row in an append-only ledger claiming an act that did not occur.
 */
export async function handleDecideAppeal(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: AppealHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  if (!isOperator(env, actor)) return refuse("not-an-operator", requestId, 403);
  // A decision that reverses a removal is as much a human act as the removal
  // was (TS-5). A service principal holding an operator id would otherwise be
  // automated moderation wearing a name.
  if (actor.subjectType !== "user") return refuse("not-an-operator", requestId, 403);

  let body: DecideBody;
  try {
    body = (await request.json()) as DecideBody;
  } catch {
    return validationError(requestId, { body: ["Body must be JSON"] });
  }

  const appealId = body.appealId;
  if (typeof appealId !== "string" || !UUID_RE.test(appealId)) {
    return validationError(requestId, { appealId: ["Must be an appeal id"] });
  }
  const decision = body.decision;
  if (
    typeof decision !== "string" ||
    !(APPEAL_DECISIONS as readonly string[]).includes(decision)
  ) {
    return validationError(requestId, {
      decision: [`Must be one of: ${APPEAL_DECISIONS.join(", ")}`],
    });
  }
  const reason = body.reason;
  // The same bound as the reason on the act being reviewed. A decision
  // recorded with less care than the act it reviews is the wrong way round.
  if (typeof reason !== "string" || !reasonIsAcceptable(reason)) {
    return errorResponse(
      "reason-required",
      "Every decision needs a reason, including this one.",
      422,
      requestId,
    );
  }

  const appeal = await deps.repo.getAppeal(appealId as Uuid);
  if (!appeal) return refuse("unknown-act", requestId, 404);
  if (appeal.state !== "open") return refuse("already-decided", requestId, 409);

  const act = await deps.repo.getModerationAct(appeal.actId as Uuid);
  if (!act) return refuse("unknown-act", requestId, 404);

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const newId = deps.generateId ?? generateId;
  const outcomeActId = newId();

  // THE LEDGER FIRST — see the header. This row is true whichever way the
  // reversal below goes, so writing it first costs nothing if the rest fails
  // and loses the decision entirely if it does not.
  await deps.repo.appendModerationAct({
    id: outcomeActId,
    subjectKind: appeal.subjectKind,
    subjectRef: appeal.subjectRef,
    act: APPEAL_OUTCOME_ACT[decision as AppealDecision],
    actorId: actor.subjectId,
    reason: reason.trim(),
    reportId: null,
    occurredAt: at,
  });

  let reversalActId: Uuid | null = null;
  if (decision === "uphold") {
    reversalActId = await applyReversal(act, actor, at, newId, deps);
  }

  const decided = await deps.repo.resolveAppeal({
    id: appeal.id as Uuid,
    state: decision === "uphold" ? "upheld" : "refused",
    outcomeActId,
    reversalActId,
    decidedBy: actor.subjectId,
    at,
  });
  // Guarded on `open`, so null means somebody decided it between the read
  // above and here. The ledger rows stand: they are append-only and honest
  // about what was attempted, and the transparency report over-counting a
  // decision is the recoverable direction.
  if (!decided) return refuse("already-decided", requestId, 409);

  return successResponse(
    {
      appeal: appealView(decided, act.act as ModerationAct),
      reversed: reversalActId !== null,
    },
    requestId,
  );
}

/**
 * Put back what the act took away, and return the ledger row that says so.
 *
 * Null when there was nothing left to reverse. TWO WAYS THAT HAPPENS, and
 * both are ordinary: somebody restored the listing while the appeal waited,
 * or the listing has since moved to a state the reversal is not legal from
 * (delisted in March, appealed, removed in June — relisting a removed listing
 * is exactly the transition TS3's table forbids, because it would need two
 * acts to describe).
 *
 * IN BOTH CASES NO ROW IS WRITTEN. An append-only ledger's whole value is
 * that every row happened; a reversal act recording a reversal that did not
 * occur would be the first row in it that did not, and the transparency
 * report reads these rows.
 */
async function applyReversal(
  act: ModerationActRecord,
  actor: ActorContext,
  at: string,
  newId: () => Uuid,
  deps: AppealHandlerDeps,
): Promise<Uuid | null> {
  const reversal = reversalOf(act.act as ModerationAct);
  if (!reversal) return null;

  const reversalId = newId();
  const toState = stateAfter(reversal);

  if (toState !== null) {
    // A content act: restore or relist. The transition table is passed to the
    // repository exactly as TS3 passes it, so the two cannot encode it twice
    // and one day differ.
    const listing = await deps.repo.getPublicProfile(act.subjectRef);
    if (!listing) return null;

    await deps.repo.appendModerationAct({
      id: reversalId,
      subjectKind: act.subjectKind,
      subjectRef: act.subjectRef,
      act: reversal,
      actorId: actor.subjectId,
      // The reversal's own reason names the appeal rather than repeating the
      // operator's argument: this row is read by anybody looking at the
      // listing's history, and the argument was written for the appeal.
      reason: "Reversed on appeal.",
      reportId: null,
      occurredAt: at,
    });

    const updated = await deps.repo.setListingModerationState({
      slug: listing.slug,
      state: toState as ModerationStateName,
      at,
      actId: toState === "visible" ? null : reversalId,
      legalFrom: (ACT_LEGAL_FROM[reversal] ?? []) as readonly ModerationStateName[],
    });
    // The listing moved since the read. The ledger row stands — it is honest
    // about what was attempted — but the appeal does not claim a reversal
    // that did not land.
    return updated ? reversalId : null;
  }

  if (reversal === "reindex") {
    const profileId = await deps.repo.getProfileIdBySlug(act.subjectRef);
    if (!profileId) return null;
    // Written BEFORE the change, like every other act on this estate.
    await deps.repo.appendModerationAct({
      id: reversalId,
      subjectKind: act.subjectKind,
      subjectRef: act.subjectRef,
      act: reversal,
      actorId: actor.subjectId,
      reason: "Reversed on appeal.",
      reportId: null,
      occurredAt: at,
    });
    // False means it was already indexable, or 1370's rule refuses it (a
    // public listing whose review was never recorded). Either way nothing
    // came back, and the appeal says so.
    const changed = await deps.repo.setListingIndexable(profileId as Uuid, true);
    return changed ? reversalId : null;
  }

  return null;
}
