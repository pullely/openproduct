// The inbox: what writes into it, and what reads it (openproduct-launch NF0).
//
// FAN-OUT IS BEST-EFFORT AND ALWAYS AFTER THE ACT. The comment is posted, the
// vote is cast, the board is ranked — whether we managed to tell anybody is a
// separate question from whether it happened, and a failed notification must
// never undo a person's work. CB4 made this call first and this follows it.
//
// ONCE PER EVENT PER PERSON IS A SCHEMA PROPERTY, not a check here. The event
// key is built from the event and never from the clock: a key with a timestamp
// in it changes on a retry, which is the same as having no key at all.
//
// NOBODY IS TOLD ABOUT THEIR OWN ACT. Every fan-out below drops the actor, and
// that is not politeness — a notification about a thing you just did is a
// notification that trains people to ignore the badge.

import {
  INBOX_LIMIT,
  inboxEventKey,
  type InboxKind,
  type InboxTarget,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";
import { generateId, type Uuid } from "../ids.js";
import { requireUserSubject } from "./me.js";

export interface InboxWriter {
  repo: Pick<OpenproductRepository, "writeNotification">;
  generateId?: () => Uuid;
}

export interface InboxEvent {
  kind: InboxKind;
  /** Everybody who should hear about it. The actor is removed here rather
   *  than at each call site, so a new caller cannot forget. */
  subjectIds: readonly string[];
  /** Whoever did it, and therefore whoever is NOT told. */
  actorSubjectId?: string | null;
  /** Their HANDLE, for the sentence. Null for something the system observed
   *  — a rank, a sweep — because nobody did it. */
  actorHandle?: string | null;
  targetKind: InboxTarget;
  targetRef: string;
  /** What makes this event this event. Never a timestamp. */
  eventRef: string;
  figure?: number | null;
}

/**
 * Write one event to everybody who should hear it.
 *
 * SWALLOWS EVERYTHING. The act already happened; a notifier that could undo it
 * would be a notifier that makes the product less reliable than not having one.
 */
export async function fanOut(deps: InboxWriter, event: InboxEvent): Promise<number> {
  const make = deps.generateId ?? generateId;
  const key = inboxEventKey(event.kind, event.eventRef);
  const recipients = [...new Set(event.subjectIds)].filter(
    (id) => id.length > 0 && id !== event.actorSubjectId,
  );

  let written = 0;
  for (const subjectId of recipients) {
    try {
      const ok = await deps.repo.writeNotification({
        id: make(),
        subjectId,
        kind: event.kind,
        eventKey: key,
        actor: event.actorHandle ?? null,
        targetKind: event.targetKind,
        targetRef: event.targetRef,
        figure: event.figure ?? null,
      });
      if (ok) written += 1;
    } catch {
      // Deliberately swallowed — see the header. One recipient failing must
      // not cost the others theirs.
    }
  }
  return written;
}


// ---------------------------------------------------------------------------
// What a person reads
// ---------------------------------------------------------------------------

export interface InboxHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    "listNotifications" | "countUnreadNotifications" | "markNotificationsRead"
  >;
  now?: () => Date;
}

/**
 * GET the inbox, or PUT the read cursor.
 *
 * PERSONAL AND THEREFORE NEVER CACHED. This is the one openproduct surface
 * that is ABOUT the reader rather than about a product, so it is the one that
 * may resolve an actor — and it does so at its own address rather than by
 * making a public page conditional (I6 holds because this is not one).
 *
 * READING WRITES NOTHING. The cursor moves only when somebody presses the
 * button, which is the whole reason read state is a cursor and not a flag per
 * row: a page whose purpose is to be looked at should not be a write.
 */
export async function handleInbox(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: InboxHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;

  if (request.method === "PUT") {
    const at = (deps.now ?? (() => new Date()))().toISOString();
    await deps.repo.markNotificationsRead(actor.subjectId, at);
    // The count AFTER the mark, so a caller does not have to guess it is zero
    // — and it is not always zero: a row written between the mark and this
    // read is genuinely unread.
    const unread = await deps.repo.countUnreadNotifications(actor.subjectId);
    return successResponse({ unread }, requestId);
  }

  if (request.method !== "GET") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const [items, unread] = await Promise.all([
    deps.repo.listNotifications(actor.subjectId, INBOX_LIMIT),
    deps.repo.countUnreadNotifications(actor.subjectId),
  ]);

  return successResponse(
    {
      // EXACTLY THE PINNED KEYS, and no prose: the sentence is composed by the
      // page from the contract's phrasebook, so a wording somebody regrets is
      // a deploy rather than a backfill.
      items: items.map((item) => ({
        id: item.id,
        kind: item.kind,
        actor: item.actor,
        targetKind: item.targetKind,
        targetRef: item.targetRef,
        figure: item.figure,
        createdAt: item.createdAt,
        unread: item.unread,
      })),
      unread,
    },
    requestId,
  );
}
