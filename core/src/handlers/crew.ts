// The crew's own list and its roles (openproduct-stages-crew SC-3, design §2).
//
//   GET  …/orgs/{org}/profiles/{id}/crew?q=&role=&cursor=   read_crew
//   PUT  …/orgs/{org}/profiles/{id}/crew/{subjectId}        manage_crew
//   PUT  …/orgs/{org}/profiles/{id}/crew                    manage_crew
//
// WHO: the decision table in `authorize.ts` — anybody on the crew reads the
// list; only a Lead changes a role. The listing must be this workspace's
// (`getProfileForOrg` is org-scoped in SQL). Every refusal of the door is the
// same 404 the other crew routes answer, so a route here never says whether a
// product exists to somebody who is not on its crew.
//
// WHAT A ROLE CHANGE REFUSES, in the repository's one statement:
//
//   locked     an Orunbase admin's role is changed only on Orunbase (SC-4)
//   last_lead  the product would be left with nobody who can change roles
//
// THE BATCH is what the Edit crew popup's "Save n changes" sends: one request,
// so a Lead sorting fifty people is one write against the gateway's
// listing-write bound (20 a minute), not fifty. Each change is still its own
// guarded statement and its own audit entry, applied promotions-to-Lead first
// (`crewChangeOrder`) so a Lead handing over is never refused halfway through
// their own save as the last Lead. A change that is refused is said beside
// its person; the others stand.
//
// AUDITED as `openproduct.crew.role_changed`, with the two roles and never
// the person's subject id: the audit log keeps acts, and a subject id in a
// payload is one the subject registry could not erase (the published-roster
// write counts its people for the same reason).

import type { CrewRoleChange, OpenproductRepository, ProfileRecord } from "@openproduct/db";
import {
  CREW_PAGE_SIZE,
  CREW_ROLE_REFUSALS,
  CREW_SUBJECT_ID_RE,
  crewChangeOrder,
  crewCursor,
  isCrewRole,
  readCrewChanges,
  readCrewQuery,
  type CrewList,
  type CrewRole,
  type CrewRolesAnswer,
} from "@openproduct/contracts";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { generateId, type Uuid } from "../ids.js";
import { authorizeFor, type ProfileHandlerDeps } from "./profiles.js";

export interface CrewHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    "getProfileForOrg" | "getListingRole" | "listCrew" | "setCrewRole" | "appendAudit"
  >;
  now?: () => Date;
  generateId?: () => Uuid;
}

const notFound = (requestId: string): Response => errorResponse("not_found", "Not found", 404, requestId);

/** The door: this workspace's listing, and the caller allowed the action. */
async function crewDoor(
  env: Env,
  actor: ActorContext,
  action: "read_crew" | "manage_crew",
  orgId: Uuid,
  profileId: Uuid,
  deps: CrewHandlerDeps,
  requestId: string,
): Promise<{ ok: true; profile: ProfileRecord } | { ok: false; response: Response }> {
  const [profile, auth] = await Promise.all([
    deps.repo.getProfileForOrg(orgId, profileId),
    authorizeFor(env, actor, action, profileId, deps as unknown as ProfileHandlerDeps, requestId),
  ]);
  if (!profile) return { ok: false, response: notFound(requestId) };
  if (!auth.ok) return auth;
  return { ok: true, profile };
}

async function countsOf(deps: CrewHandlerDeps, profileId: Uuid) {
  return (await deps.repo.listCrew(profileId, { q: null, role: null, offset: 0, limit: 1 })).counts;
}

/** GET …/crew — the crew's own list, a page at a time, with the counts. */
export async function handleListCrew(
  env: Env,
  url: URL,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: CrewHandlerDeps,
): Promise<Response> {
  const door = await crewDoor(env, actor, "read_crew", orgId, profileId, deps, requestId);
  if (!door.ok) return door.response;
  const query = readCrewQuery(url.searchParams);
  const page = await deps.repo.listCrew(profileId, { ...query, limit: CREW_PAGE_SIZE });
  const total = page.counts.lead + page.counts.maintainer + page.counts.member;
  const list: CrewList = {
    // Field by field, never spread from the record (OD3).
    people: page.people.map((person) => ({
      subjectId: person.subjectId,
      role: person.role,
      locked: person.locked,
      source: person.source,
      name: person.displayName,
      handle: person.handle,
    })),
    counts: page.counts,
    total,
    matching: page.matching,
    next: page.nextOffset === null ? null : crewCursor(page.nextOffset),
  };
  return successResponse(list, requestId);
}

async function audit(
  deps: CrewHandlerDeps,
  orgId: Uuid,
  profile: ProfileRecord,
  actor: ActorContext,
  requestId: string,
  change: { from: CrewRole; to: CrewRole },
): Promise<void> {
  await deps.repo.appendAudit({
    id: (deps.generateId ?? generateId)(),
    orgId,
    profileId: profile.id as Uuid,
    actorType: actor.subjectType,
    actorId: actor.subjectId,
    type: "openproduct.crew.role_changed",
    description: `openproduct ${profile.slug}: a crew role changed from ${change.from} to ${change.to}`,
    payload: { slug: profile.slug, from: change.from, to: change.to },
    requestId,
    occurredAt: (deps.now ?? (() => new Date()))().toISOString(),
  });
}

/** A refused change, in the popup's words. */
function refusalOf(change: Exclude<CrewRoleChange, { outcome: "changed" | "unchanged" }>): string {
  return CREW_ROLE_REFUSALS[change.outcome];
}

async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** PUT …/crew/{subjectId} `{role}` — one person's role. */
export async function handleSetCrewRole(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  subjectId: string,
  deps: CrewHandlerDeps,
): Promise<Response> {
  if (!CREW_SUBJECT_ID_RE.test(subjectId)) return notFound(requestId);
  const door = await crewDoor(env, actor, "manage_crew", orgId, profileId, deps, requestId);
  if (!door.ok) return door.response;
  const body = await bodyOf(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  if (!isCrewRole(body.role)) return validationError(requestId, { role: [CREW_ROLE_REFUSALS.role] });

  const change = await deps.repo.setCrewRole(profileId, subjectId, body.role);
  if (change.outcome === "absent") return notFound(requestId);
  if (change.outcome === "locked" || change.outcome === "last_lead") {
    return errorResponse("conflict", refusalOf(change), 409, requestId, { fields: { role: [refusalOf(change)] } });
  }
  if (change.outcome === "changed") await audit(deps, orgId, door.profile, actor, requestId, change);
  const answer: CrewRolesAnswer = {
    changed: change.outcome === "changed" ? [{ subjectId, from: change.from, to: change.to }] : [],
    counts: await countsOf(deps, profileId),
    refused: {},
  };
  return successResponse(answer, requestId);
}

/** PUT …/crew `{changes: [{subjectId, role}]}` — one save from Edit crew. */
export async function handleSetCrewRoles(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: CrewHandlerDeps,
): Promise<Response> {
  const door = await crewDoor(env, actor, "manage_crew", orgId, profileId, deps, requestId);
  if (!door.ok) return door.response;
  const body = await bodyOf(request);
  if (!body) return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  const read = readCrewChanges(body.changes);
  if (!read.ok) return validationError(requestId, read.fields);

  const changed: CrewRolesAnswer["changed"] = [];
  const refused: Record<string, string[]> = {};
  for (const { subjectId, role } of crewChangeOrder(read.changes)) {
    const change = await deps.repo.setCrewRole(profileId, subjectId, role);
    if (change.outcome === "changed") {
      changed.push({ subjectId, from: change.from, to: change.to });
      await audit(deps, orgId, door.profile, actor, requestId, change);
    } else if (change.outcome !== "unchanged") {
      refused[`changes.${subjectId}`] = [refusalOf(change)];
    }
  }
  if (changed.length === 0 && Object.keys(refused).length > 0) {
    return errorResponse("conflict", "No role was changed", 409, requestId, { fields: refused });
  }
  const answer: CrewRolesAnswer = {
    changed,
    counts: await countsOf(deps, profileId),
    refused,
  };
  return successResponse(answer, requestId);
}
