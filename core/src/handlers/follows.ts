// Follows — the act (openproduct-launch FL0).
//
// PUT    /internal/openproduct/me/follows/{kind}/{value}   follow
// DELETE /internal/openproduct/me/follows/{kind}/{value}   unfollow
//
// ANONYMOUS IS REFUSED AT THE GATEWAY, NOT HERE. `/v1/openproduct/me/…` is on
// the authenticated plane, which resolves a subject before any of this code is
// reachable — EN1's rule, enforced by routing rather than by a check somebody
// could forget.
//
// ─── THE TARGET IS RESOLVED, NEVER TRUSTED ────────────────────────────────
//
// A topic must be a value the CT1 vocabulary knows AND that some live listing
// has chosen; a person must be a handle that `/@handle` actually resolves. A
// follow of something that does not exist is a row nothing will ever read,
// and — worse — a target the caller invented is a way to discover whether an
// id exists by watching which ones are accepted.
//
// ─── A HANDLE ON THE WIRE, A SUBJECT ID IN THE TABLE ──────────────────────
//
// CG1 keeps the subject id off the public projection deliberately: a handle is
// the public address and the only name a page has. So the route takes a handle
// and this file translates, which means no public surface is ever teaching a
// browser to send an internal identifier.

import {
  FOLLOW_KINDS,
  FOLLOW_VALUE_RE,
  TOPIC_FACET,
  buildTopicIndex,
  facet,
  topicIn,
  type FollowKind,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";
import type { ActorContext } from "../authorize.js";

export interface FollowsHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "follow"
    | "unfollow"
    | "countFollowers"
    | "listFollowed"
    | "listPublicCards"
    | "getPublicContributor"
    | "getHandle"
    // PP1 — a listing is a target; the slug resolves only while it is public.
    | "getPublicProfileId"
  >;
}

/** The kind a path segment names, or null. */
function kindOf(raw: string): FollowKind | null {
  return (FOLLOW_KINDS as readonly string[]).includes(raw) ? (raw as FollowKind) : null;
}

/**
 * What this target is in the TABLE, or null if it does not exist.
 *
 * Every refusal is the same 404, and that is the point: a caller must not be
 * able to tell "no such handle" from "that person has no public page" from
 * "that topic exists in the vocabulary but nobody has chosen it". Answering
 * them differently would make this endpoint an existence oracle, which is the
 * reason `getPublicContributor` folds its own four cases into one null.
 */
async function resolveTarget(
  deps: FollowsHandlerDeps,
  kind: FollowKind,
  value: string,
): Promise<string | null> {
  // PP1 — the slug IS the target, and only while the listing is public: a
  // follow on an unpublished listing would confirm it exists (OD5).
  if (kind === "listing") {
    return (await deps.repo.getPublicProfileId(value)) ? value : null;
  }
  if (kind === "topic") {
    // The vocabulary AND the catalogue, both — the same gate TP0's page
    // applies, so a topic you can follow is a topic you can open.
    if (!facet(TOPIC_FACET)?.values.some((v) => v.value === value)) return null;
    const index = buildTopicIndex(await deps.repo.listPublicCards());
    return topicIn(index, value) ? value : null;
  }
  // A person: the handle must resolve to a PUBLIC profile (CG1's two gates),
  // and only then is it worth asking the namespace who holds it.
  if (!(await deps.repo.getPublicContributor(value))) return null;
  const handle = await deps.repo.getHandle(value);
  return handle?.subjectId ?? null;
}

export async function handleFollow(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  rawKind: string,
  rawValue: string,
  deps: FollowsHandlerDeps,
): Promise<Response> {
  const kind = kindOf(rawKind);
  if (!kind || !FOLLOW_VALUE_RE.test(rawValue)) {
    return errorResponse("not_found", "Not found", 404, requestId);
  }

  const target = await resolveTarget(deps, kind, rawValue);
  if (target === null) return errorResponse("not_found", "Not found", 404, requestId);

  if (request.method === "DELETE") {
    await deps.repo.unfollow(actor.subjectId, kind, target);
    // NOT 404 WHEN THERE WAS NOTHING TO DELETE. Unfollowing something you do
    // not follow is the state you asked for, and a refusal here would make a
    // double-click look like an error (the unsave rule, kept).
    return successResponse(await state(deps, actor, kind, rawValue, target), requestId, 200);
  }

  const written = await deps.repo.follow(actor.subjectId, kind, target);
  if (!written) {
    // The one honest refusal: a maker opening their own page finds the button
    // there. Saying so beats a silent no-op that leaves the control looking
    // broken.
    return errorResponse("invalid", "You cannot follow yourself", 409, requestId);
  }
  return successResponse(await state(deps, actor, kind, rawValue, target), requestId, 200);
}

/**
 * What the caller gets back: whether they follow it now, and how many do.
 *
 * BOTH, because the control needs both and a second round trip to learn the
 * number it just moved is a round trip the page should not pay. The count is
 * recomputed rather than incremented — EN0's no-counter rule applies to reads
 * as well as to columns.
 */
async function state(
  deps: FollowsHandlerDeps,
  actor: ActorContext,
  kind: FollowKind,
  value: string,
  target: string,
) {
  const [followed, counts] = await Promise.all([
    deps.repo.listFollowed(actor.subjectId, [{ kind, target }]),
    deps.repo.countFollowers(kind, [target]),
  ]);
  return {
    follow: {
      kind,
      // The HANDLE goes back out, never the subject id we resolved it to.
      value,
      following: followed.length > 0,
      followers: counts.get(target) ?? 0,
    },
  };
}
