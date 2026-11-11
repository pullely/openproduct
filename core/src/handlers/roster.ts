// The two-sided roster (openproduct-commons CG3).
//
// FOUR ACTS, AND THE AUTHORIZATION IS A TABLE RATHER THAN FOUR GUARDS.
// `ROSTER_ACTS` in the contract says who may do what and from which state;
// every handler here asks `mayAct` and none of them decides for itself. That
// is not tidiness: the interesting property of this feature is the SHAPE of
// the permission table — exactly one act belongs to the maintainer alone,
// exactly one to the named person alone, one to both — and a reviewer can
// check that in five seconds against one literal, where four scattered `if`s
// cannot be checked at all.
//
// THE ASYMMETRY THAT MATTERS: only the named person may confirm. If a
// maintainer could confirm on somebody's behalf, the edge would mean nothing
// and this table would be `published_maintainers` with extra columns.
//
// AND THE OTHER ONE: either side may retire, unilaterally. A person must be
// able to leave a product that has gone somewhere they do not want their name
// on; a maintainer must be able to end a role that ended. Making either ask
// the other's permission would make leaving a negotiation.

import {
  ROSTER_MEMBER_KEYS,
  mayAct,
  rosterAct,
  type RosterActor,
  type RosterMember,
  type RosterState,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import type { Uuid } from "../ids.js";

export interface RosterHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listRoster"
    | "listRosterForSubject"
    | "getRosterEdge"
    | "inviteToRoster"
    | "confirmRosterEdge"
    | "declineRosterEdge"
    | "retireRosterEdge"
    | "getListingRole"
    | "getProfileIdBySlug"
    | "getPublicProfileId"
  >;
  now?: () => number;
}

const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;
const SUBJECT_RE = /^(usr|sp)_[A-Za-z0-9]{1,64}$/;
/** The same bound the schema enforces. Checked here too so a hostile value
 *  never becomes a string the SQL layer has to reason about. */
const ROLE_LABEL_MAX = 80;

/**
 * Which side of this edge is the actor on?
 *
 * A person can be BOTH — a maintainer who is also named on their own listing
 * — and that is fine: `mayAct` is asked per role, and holding two roles means
 * being allowed what either allows. What it must never do is silently treat
 * a maintainer as the subject, which would let them confirm for somebody.
 */
async function actorRoles(
  deps: RosterHandlerDeps,
  profileId: Uuid,
  actor: ActorContext,
  subjectId: string,
): Promise<RosterActor[]> {
  const roles: RosterActor[] = [];
  // OX4's authority table — the same one every other maintainer door asks.
  // Owner and maintainer both count; a listing's roster is part of running it.
  const role = await deps.repo.getListingRole(profileId, actor.subjectId);
  if (role === "owner" || role === "maintainer") roles.push("maintainer");
  // `subject` means "the person this edge is ABOUT", which is only ever true
  // when the actor IS that person. Never inferred from anything else.
  if (actor.subjectId === subjectId) roles.push("subject");
  return roles;
}

function stateOf(edge: { state: RosterState } | null): RosterState | "absent" {
  return edge === null ? "absent" : edge.state;
}

/** One refusal shape for every act, so a caller cannot tell "you may not"
 *  from "there is nothing here" — which would make this an oracle for other
 *  people's pending invitations. */
function refuse(act: Parameters<typeof rosterAct>[0], requestId: string): Response {
  return errorResponse("forbidden", rosterAct(act).refusal, 403, requestId);
}

/**
 * GET the PUBLIC roster. Confirmed edges, reconciled with the publication
 * list, and nothing else — the filter is in SQL so there is no code path here
 * that could return a pending one.
 */
export async function handlePublicRoster(
  _env: Env,
  requestId: string,
  slug: string,
  deps: RosterHandlerDeps,
): Promise<Response> {
  if (!SLUG_RE.test(slug)) return errorResponse("not_found", "Not found", 404, requestId);
  // THROUGH the visibility filter: a draft's roster is not public, and
  // unknown and unpublished answer identically.
  const profileId = await deps.repo.getPublicProfileId(slug);
  if (!profileId) return errorResponse("not_found", "Not found", 404, requestId);

  const rows = await deps.repo.listRoster(profileId as Uuid);
  // Field by field from the pinned key set (OD3). On this surface a silent
  // widening is a disclosure about a person.
  const roster: RosterMember[] = rows.map((row) => ({
    subjectId: row.subjectId,
    roleLabel: row.roleLabel,
    handle: row.handle,
    displayName: row.displayName,
    since: row.since,
  }));
  void ROSTER_MEMBER_KEYS;
  return successResponse({ roster }, requestId, 200);
}

/** The maintainer names somebody. Always creates a `pending` edge. */
export async function handleInviteToRoster(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  slug: string,
  deps: RosterHandlerDeps,
): Promise<Response> {
  if (!SLUG_RE.test(slug)) return errorResponse("not_found", "Not found", 404, requestId);
  const profileId = await deps.repo.getProfileIdBySlug(slug);
  if (!profileId) return errorResponse("not_found", "Not found", 404, requestId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError(requestId, { body: ["Must be a valid JSON object"] });
  }
  const input = (body ?? {}) as { subjectId?: unknown; roleLabel?: unknown };
  if (typeof input.subjectId !== "string" || !SUBJECT_RE.test(input.subjectId)) {
    return validationError(requestId, { subjectId: ["A subject id is required"] });
  }
  const roleLabel =
    typeof input.roleLabel === "string" && input.roleLabel.trim().length > 0
      ? input.roleLabel.trim()
      : null;
  if (roleLabel !== null && roleLabel.length > ROLE_LABEL_MAX) {
    return validationError(requestId, { roleLabel: [`At most ${ROLE_LABEL_MAX} characters`] });
  }

  const edge = await deps.repo.getRosterEdge(profileId as Uuid, input.subjectId);
  const roles = await actorRoles(deps, profileId as Uuid, actor, input.subjectId);
  // A retired edge is `absent` for the purpose of inviting — asking somebody
  // back is a new invitation, not a resurrection, and the repository's upsert
  // says the same thing.
  const state = stateOf(edge) === "retired" ? "absent" : stateOf(edge);
  if (!roles.some((role) => mayAct("invite", role, state))) return refuse("invite", requestId);

  const created = await deps.repo.inviteToRoster({
    profileId: profileId as Uuid,
    subjectId: input.subjectId,
    roleLabel,
    invitedBy: actor.subjectId,
    at: new Date(deps.now?.() ?? Date.now()).toISOString(),
  });
  // The response says the STATE, so a studio cannot render "added" for
  // something the public will not see.
  return successResponse({ invitation: { state: created.state } }, requestId, 200);
}

/**
 * The named person answers. `confirm`, `decline` and `retire` share a handler
 * because they share every check but the last line — and three handlers with
 * one authorization pattern is three places for it to drift.
 */
export async function handleAnswerRosterInvitation(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  slug: string,
  act: "confirm" | "decline" | "retire",
  deps: RosterHandlerDeps,
  subjectId?: string,
): Promise<Response> {
  if (!SLUG_RE.test(slug)) return errorResponse("not_found", "Not found", 404, requestId);
  const profileId = await deps.repo.getProfileIdBySlug(slug);
  if (!profileId) return errorResponse("not_found", "Not found", 404, requestId);

  // `confirm` and `decline` are always about the ACTOR. Only `retire` may
  // name somebody else, and only a maintainer may use that — which falls out
  // of the permission table rather than being checked here.
  const target = act === "retire" && subjectId ? subjectId : actor.subjectId;
  if (!SUBJECT_RE.test(target)) return errorResponse("not_found", "Not found", 404, requestId);

  const edge = await deps.repo.getRosterEdge(profileId as Uuid, target);
  const roles = await actorRoles(deps, profileId as Uuid, actor, target);
  if (!roles.some((role) => mayAct(act, role, stateOf(edge)))) return refuse(act, requestId);

  const at = new Date(deps.now?.() ?? Date.now()).toISOString();
  if (act === "confirm") {
    const confirmed = await deps.repo.confirmRosterEdge(profileId as Uuid, target, at);
    return successResponse({ confirmed: confirmed !== null }, requestId, 200);
  }
  if (act === "decline") {
    // DELETES. See the contract's header: "I was never part of this" should
    // leave no record that they were asked.
    return successResponse(
      { declined: await deps.repo.declineRosterEdge(profileId as Uuid, target) },
      requestId,
      200,
    );
  }
  const retired = await deps.repo.retireRosterEdge(profileId as Uuid, target, actor.subjectId, at);
  return successResponse({ retired: retired !== null }, requestId, 200);
}

/**
 * One person's own view: what they are on, what they have been asked to join,
 * and — the sentence this epic owes them — which of their public listings
 * they never actually agreed to (OPC-G).
 */
export async function handleMyRoster(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: RosterHandlerDeps,
): Promise<Response> {
  const view = await deps.repo.listRosterForSubject(actor.subjectId);
  return successResponse(
    {
      roster: {
        confirmed: view.confirmed,
        invitations: view.invitations,
        // Named, not counted: a person told "3 of your listings were carried
        // over" cannot act on it, and acting on it is the whole point.
        grandfathered: view.grandfathered,
      },
    },
    requestId,
    200,
  );
}
