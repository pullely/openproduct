// The digest by email (openproduct-commons LC5).
//
// THREE HANDLERS, AND THE INTERESTING ONE IS THE SMALLEST.
//
//   the preference   `/me` — where somebody stands, and the two acts that
//                    change it. Opt-IN, so absence means silence.
//   the queue run    internal, weekly. Turns "these people are subscribed"
//                    into rows in CB4's outbox.
//   the drain        internal, and in TWO HALVES across SN1's boundary: core
//                    hands out what is pending, the gateway posts it, core is
//                    told which subject ids went.
//
// WHAT IS NOT HERE, AND CANNOT BE: any code that composes an email. This
// worker never learns an address and never renders a message; it queues a
// subject id and a link, and the platform does the rest. That is I3, and it
// is also why this file is short — the temptation LC5 exists to resist is the
// one where a "small preview" of the week's launches ends up in the queue row
// and then in a log and then in a support ticket.
//
// ─── WHY THE QUEUE AND THE DRAIN ARE SEPARATE ─────────────────────────────
//
// They fail differently and they must be retryable differently. Queueing is
// idempotent by CB4's unique index and cheap; draining talks to another
// system and can half-succeed. Fusing them would mean a seam timeout in the
// middle of a send leaves half the week queued and no way to tell which half
// — and the obvious fix for that (queue everything first, then send) is
// exactly what these two functions are.

import {
  DIGEST_NOTIFICATION_KIND,
  MAX_DIGEST_QUEUE_PER_RUN,
  digestEventRef,
  digestLink,
  isSubscribed,
  weekOf,
  previousWeek,
  type DigestDelivery,
  type DigestStanding,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { generateId, type Uuid } from "../ids.js";

export interface DigestMailHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "getDigestStanding"
    | "setDigestSubscription"
    | "digestWeekQueued"
    | "listDigestSubscribers"
    | "listPendingDigests"
    | "markDigestDelivered"
    | "recordDigestAttempt"
    | "queueNotification"
  >;
  now?: () => number;
  generateId?: () => Uuid;
}

// ---------------------------------------------------------------------------
// The preference
// ---------------------------------------------------------------------------

export async function handleDigestPreference(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: DigestMailHandlerDeps,
): Promise<Response> {
  const now = deps.now?.() ?? Date.now();

  if (request.method === "GET") {
    const standing = await deps.repo.getDigestStanding(actor.subjectId);
    return successResponse({ subscription: standing }, requestId, 200);
  }
  if (request.method !== "PUT") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  let body: { subscribed?: unknown };
  try {
    body = (await request.json()) as { subscribed?: unknown };
  } catch {
    return validationError(requestId, { body: ["Expected a JSON object"] });
  }
  if (typeof body.subscribed !== "boolean") {
    return validationError(requestId, { subscribed: ["Expected true or false"] });
  }

  await deps.repo.setDigestSubscription(
    actor.subjectId,
    body.subscribed,
    new Date(now).toISOString(),
  );
  const standing = await deps.repo.getDigestStanding(actor.subjectId);
  return successResponse({ subscription: standing }, requestId, 200);
}

// ---------------------------------------------------------------------------
// The weekly queue
// ---------------------------------------------------------------------------

/**
 * Queue last week's digest for everybody currently subscribed.
 *
 * LAST WEEK, NOT THIS ONE. LC1 will not publish a digest for a week still in
 * progress — a page for an unfinished week says what has happened SO FAR,
 * which is a different claim under the same heading — so an email pointing at
 * the current week would link to a 404. The send runs on Monday and carries
 * the week that just ended.
 *
 * IDEMPOTENT BY CB4's INDEX. Running twice on a Monday queues nothing the
 * second time, which is what makes a partial failure safe to simply re-run.
 */
export async function handleDigestQueue(
  _env: Env,
  request: Request,
  requestId: string,
  deps: DigestMailHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  const newId = deps.generateId ?? generateId;
  const week = previousWeek(weekOf(now));
  const eventRef = digestEventRef(week.id);

  // THE GUARD BEFORE THE LIST. Queueing is idempotent, so running twice is
  // harmless — but discovering that by walking every subscriber on every cron
  // tick is not, and "harmless" and "free" are different things.
  if (await deps.repo.digestWeekQueued(eventRef)) {
    return successResponse({ queued: null, reason: "already_queued", week: week.id }, requestId, 200);
  }

  const subscribers = await deps.repo.listDigestSubscribers(MAX_DIGEST_QUEUE_PER_RUN);
  let queued = 0;
  for (const subjectId of subscribers) {
    const added = await deps.repo.queueNotification({
      id: newId(),
      subjectId,
      kind: DIGEST_NOTIFICATION_KIND,
      // A digest is not about a conversation.
      threadId: null,
      eventRef,
    });
    if (added) queued += 1;
  }

  return successResponse(
    {
      queued: {
        week: week.id,
        subscribers: subscribers.length,
        added: queued,
        truncated: subscribers.length >= MAX_DIGEST_QUEUE_PER_RUN,
      },
    },
    requestId,
    200,
  );
}

// ---------------------------------------------------------------------------
// The drain, in two halves across the boundary SN1 drew
// ---------------------------------------------------------------------------
//
// CORE KNOWS WHO IS WAITING AND HOLDS THE DATABASE. THE GATEWAY CAN REACH THE
// INTERNET. Neither can do the other's half, and that is the same division
// SN1 drew for ingestion — the isolate that can write to the database cannot
// make an outbound request, and the one that can reach the seam holds no
// database.
//
// So the drain is a READ and a REPORT rather than a call: core hands out what
// is pending, the gateway signs and posts it, and core is told which subject
// ids went. An earlier draft had core taking a `deliver` function, which
// would have been a worker with no network reaching for the network.

/**
 * What is pending, for the gateway to deliver.
 *
 * THE SUBSCRIPTION IS RE-CHECKED IN THE READ (see the repository), so an
 * unsubscribe between Monday's queue run and the actual send takes effect.
 * That is the promise `DIGEST_UNSUBSCRIBE_NOTE` makes, kept in SQL rather
 * than by anybody remembering to check here.
 *
 * INTERNAL, and it carries subject ids: this is the one read on the estate
 * that hands out a list of people, and it goes to exactly one caller over a
 * service binding that is not on the internet.
 */
export async function handleDigestPending(
  _env: Env,
  request: Request,
  requestId: string,
  deps: DigestMailHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }
  const pending = await deps.repo.listPendingDigests(MAX_DIGEST_QUEUE_PER_RUN);
  const deliveries: DigestDelivery[] = pending.map((row) => {
    const week = row.eventRef.replace(/^digest:/, "");
    return { subjectId: row.subjectId, week, link: digestLink(week) };
  });
  return successResponse({ pending: deliveries }, requestId, 200);
}

interface DeliveredBody {
  delivered?: unknown;
  attempted?: unknown;
}

/**
 * What went, and what did not.
 *
 * The gateway reports back by SUBJECT ID rather than by outbox row id: the
 * row id is core's own bookkeeping and there is no reason for it to cross a
 * boundary, and matching on the id core already knows means a malformed
 * report can mark nothing it should not have.
 *
 * A FAILURE INCREMENTS AN ATTEMPT AND STAYS QUEUED. Core is never told WHY
 * one failed — the reason would be a fact about somebody's address, and this
 * side does not hold those.
 */
export async function handleDigestDelivered(
  _env: Env,
  request: Request,
  requestId: string,
  deps: DigestMailHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  let body: DeliveredBody;
  try {
    body = (await request.json()) as DeliveredBody;
  } catch {
    return validationError(requestId, { body: ["Expected a JSON object"] });
  }
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const delivered = new Set(strings(body.delivered));
  const attempted = new Set(strings(body.attempted));
  if (delivered.size === 0 && attempted.size === 0) {
    return successResponse({ sent: 0, failed: 0 }, requestId, 200);
  }

  const now = deps.now?.() ?? Date.now();
  const pending = await deps.repo.listPendingDigests(MAX_DIGEST_QUEUE_PER_RUN);
  const sentIds = pending.filter((row) => delivered.has(row.subjectId)).map((row) => row.id);
  const failedIds = pending
    .filter((row) => attempted.has(row.subjectId) && !delivered.has(row.subjectId))
    .map((row) => row.id);

  const sent = await deps.repo.markDigestDelivered(sentIds, new Date(now).toISOString());
  const failed = await deps.repo.recordDigestAttempt(failedIds);
  return successResponse({ sent, failed }, requestId, 200);
}

/** Re-exported so a caller wiring the routes does not import two modules to
 *  know what a standing can be. */
export type { DigestStanding };
export { isSubscribed };
