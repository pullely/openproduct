// The S6 receiver — join-request lifecycle events over the listing seam
// (openproduct-independence OX5; specs/components/19-openproduct-seam.md).
//
// The platform delivers a signed webhook to the openproduct GATEWAY, which
// verifies the HMAC (its inline verifier, the repo-cut property) and forwards
// the parsed event here over the one in-product binding. By the time a body
// reaches this handler its authenticity is settled; what this handler owns is
// the UPSERT discipline:
//
//   join_request.submitted  → the sole record path for an application row
//                             since OX5: resolve the listed door's opening
//                             (through the public-listing filter, as the
//                             retired console POST did) and write the row.
//   join_request.decided    → overwrite the status snapshot by request ref.
//                             The projection has no state machine — JR is the
//                             source of truth, and whatever it says, we store.
//                             An APPROVAL also puts the person on the
//                             product's crew as a Member (SC-3, design §2.4);
//                             denied, withdrawn and expired touch no crew.
//
// Fail-soft mirrors the sender: an event that resolves to nothing (a door
// with no live opening, a ref we never saw) answers 200 {recorded:false} —
// the platform's delivery is fire-and-forget, and a 4xx would only make a
// benign miss look like an outage. The snapshot heals on the next event.

import type { OpenproductRepository } from "@openproduct/db";

import {
  decisionPublication,
  isProjectEventType,
  readProjectDeploy,
  readProjectRoster,
  type ProjectDeploy,
  type ProjectRoster,
} from "@openproduct/contracts";

import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { generateId, parseOrgPublicId, parseProjectPublicId, type Uuid } from "../ids.js";

export interface SeamEventDeps {
  repo: Pick<
    OpenproductRepository,
    | "recordApplication"
    | "getRoleOpeningByJoinLinkRef"
    | "setApplicationStatusByRequestRef"
    // CB3 — the decision trail.
    | "getApplicationByRequestRef"
    | "appendActivity"
    // SC-3 — an approved seat request joins the crew as a Member.
    | "addSeatMember"
  >;
  generateId?: () => string;
  now?: () => Date;
}

const SEAM_VERSION = "v1";
const EVENT_TYPES = ["join_request.submitted", "join_request.decided"] as const;
const STATUSES = ["pending", "approved", "denied", "withdrawn", "expired"] as const;
type Status = (typeof STATUSES)[number];

function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/** POST /internal/openproduct/seam/join-request */
export async function handleSeamJoinRequestEvent(
  _env: Env,
  request: Request,
  requestId: string,
  deps: SeamEventDeps,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }

  if (body.seam !== SEAM_VERSION) {
    return validationError(requestId, { seam: [`Must be "${SEAM_VERSION}"`] });
  }
  const type = body.type;
  if (typeof type !== "string" || !(EVENT_TYPES as readonly string[]).includes(type)) {
    return validationError(requestId, { type: ["Unknown seam event type"] });
  }
  const data = (body.data ?? {}) as Record<string, unknown>;
  const jrRequestRef = typeof data.jrRequestRef === "string" ? data.jrRequestRef : "";
  if (!jrRequestRef || jrRequestRef.length > 128) {
    return validationError(requestId, { jrRequestRef: ["Required request ref"] });
  }
  if (!isStatus(data.status)) {
    return validationError(requestId, { status: ["Unknown status"] });
  }

  if (type === "join_request.submitted") {
    const doorRef = typeof data.doorRef === "string" ? data.doorRef : "";
    const subjectId = typeof data.subjectId === "string" ? data.subjectId : "";
    if (!doorRef || doorRef.length > 128) {
      return validationError(requestId, { doorRef: ["Required door ref on submitted"] });
    }
    if (!subjectId || subjectId.length > 128) {
      return validationError(requestId, { subjectId: ["Required subject id"] });
    }
    // Through the public-listing filter, exactly as the retired console POST
    // was: a door whose listing is no longer public records nothing, so this
    // path confirms nothing about drafts either.
    const opening = await deps.repo.getRoleOpeningByJoinLinkRef(doorRef);
    if (!opening) return successResponse({ recorded: false }, requestId, 200);
    await deps.repo.recordApplication({
      id: (deps.generateId?.() ?? crypto.randomUUID()) as never,
      subjectId,
      profileId: opening.profileId as never,
      roleOpeningId: opening.id as never,
      jrRequestRef,
    });
    return successResponse({ recorded: true }, requestId, 200);
  }

  // join_request.decided — overwrite the snapshot; an unknown ref is a benign
  // miss (the submitted event may have found no public listing), not an error.
  const updated = await deps.repo.setApplicationStatusByRequestRef(jrRequestRef, data.status);
  if (updated === 0) return successResponse({ recorded: false }, requestId, 200);

  // CB3 — THE DECISION TRAIL, and the two halves are not symmetric.
  //
  // An ACCEPTANCE is published: somebody joined a product, which is a fact
  // about the product, is what a reader came to learn, and names a person who
  // consented by applying and being accepted. The row is attributed, and SN3's
  // filter resolves the NAME at read time from the consent edge — so a row
  // written now cannot publish somebody who has not confirmed yet (OPC-5).
  //
  // A DECLINE WRITES NOTHING HERE. Not silently-with-a-flag, not with an
  // empty summary: this path has no branch for it at all. "Ada was declined"
  // is a fact about Ada, published at an address she does not control,
  // permanently, on a page search engines crawl — and nobody applies twice to
  // a place that publishes its rejections.
  //
  // A maintainer CAN publish why they decline, and that is a separate,
  // deliberate act from their studio (`decisionPublication` with a reason).
  // KEEPING THE TWO APART IS NOT TIDINESS, IT IS THE PRIVACY PROPERTY: a
  // decline note emitted the instant a decision landed would be joinable
  // against that moment, and on an opening with one pending offer the timing
  // alone identifies the person — the same arithmetic CB2 refuses. Published
  // later, by hand, about the opening rather than the decision, it is the
  // maintainer's reasoning and nobody's name.
  if (data.status === "approved") {
    const application = await deps.repo.getApplicationByRequestRef(jrRequestRef);
    if (application) {
      // SC-3 — THE SEAT JOINS THE CREW, as a Member. The application row is
      // the proof of a listed door for THIS listing: it is written only by
      // `join_request.submitted` through the public-listing filter above, so
      // a decision for a request we never recorded (a door whose listing was
      // not public) finds no row here and adds nobody. Idempotent and never
      // a demotion (the repository's ON CONFLICT DO NOTHING): a redelivered
      // approval, or a Lead who asked for a seat on their own product,
      // changes nobody's role. SC-4's roster sync will reconcile the crew
      // with the Orunbase project from there.
      await deps.repo.addSeatMember(application.profileId as never, application.subjectId, `seam:${jrRequestRef}`);
      const publication = decisionPublication({
        decision: "approved",
        applicantSubjectId: application.subjectId,
        openingTitle: application.openingTitle ?? "a contributor",
      });
      await deps.repo.appendActivity({
        id: (deps.generateId?.() ?? crypto.randomUUID()) as never,
        profileId: application.profileId as never,
        kind: publication.kind,
        summary: publication.summary,
        actorSubjectId: publication.actorSubjectId,
        source: "seam",
        occurredAt: (deps.now?.() ?? new Date()).toISOString(),
      });
    }
  }

  return successResponse({ recorded: true }, requestId, 200);
}

// ── the workspace lifecycle event (OX5c) ───────────────────────────────────

export interface SeamWorkspaceDeps {
  repo: Pick<OpenproductRepository, "revokeWorkspaceEligibility" | "appendAudit">;
  generateId?: () => string;
  now?: () => Date;
}

/**
 * POST /internal/openproduct/seam/workspace-event — the platform's workspace
 * lifecycle deliveries (today exactly one type). `visibility_narrowed` is the
 * one-way door's only legal transition, and its consequence here is total:
 * every listing in the org loses its grant AND its public page in one
 * statement — a private workspace with a live listing is precisely the drift
 * the event exists to prevent. Idempotent by construction (an already-revoked
 * org matches no rows), audited per listing in the LOCAL log.
 */
export async function handleSeamWorkspaceEvent(
  _env: Env,
  request: Request,
  requestId: string,
  deps: SeamWorkspaceDeps,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }
  if (body.seam !== SEAM_VERSION) {
    return validationError(requestId, { seam: [`Must be "${SEAM_VERSION}"`] });
  }
  if (body.type !== "workspace.visibility_narrowed") {
    return validationError(requestId, { type: ["Unknown seam event type"] });
  }
  const data = (body.data ?? {}) as Record<string, unknown>;
  const orgRef = typeof data.orgId === "string" ? data.orgId : "";
  const orgUuid = parseOrgPublicId(orgRef);
  if (!orgUuid) {
    return validationError(requestId, { orgId: ["Required org public id"] });
  }

  const revoked = await deps.repo.revokeWorkspaceEligibility(orgUuid);
  const now = (deps.now ?? (() => new Date()))().toISOString();
  for (const profileId of revoked) {
    await deps.repo.appendAudit({
      id: (deps.generateId?.() ?? crypto.randomUUID()) as never,
      orgId: orgUuid,
      profileId: profileId as never,
      actorType: "system",
      actorId: "platform-seam",
      type: "openproduct.profile.workspace_narrowed",
      description: "workspace went private — listing unpublished and its link grant revoked",
      payload: { orgId: orgRef },
      requestId,
      occurredAt: now,
    });
  }
  return successResponse({ revoked: revoked.length }, requestId, 200);
}

// ── the project events (SC-4, seam S14) ────────────────────────────────────

export interface SeamProjectDeps {
  repo: Pick<
    OpenproductRepository,
    | "listProfilesLinkedToProject"
    | "getProductSync"
    | "applyCrewRoster"
    | "recordRosterSync"
    | "upsertProductDeploy"
    | "appendAudit"
  >;
  generateId?: () => string;
  now?: () => Date;
  /** Where an ignored roster is said. The default is the worker's log. */
  log?: (entry: { reason: "empty" | "no_admin"; eventId: string }) => void;
}

/** Why a roster was not applied to a listing. */
type RosterSkip = "stale" | "duplicate";

const ACTOR = { actorType: "system", actorId: "platform-seam" } as const;

/**
 * POST /internal/openproduct/seam/project-event — the platform's project
 * deliveries (design §3.1), applied to EVERY listing whose stored link grant
 * names the project (`listProfilesLinkedToProject`; a listing without a grant
 * gets nothing, and an unknown project answers `{recorded: false}`, the S6
 * fail-soft).
 *
 * `project.roster` — a full snapshot; the crew becomes it (design §3.1):
 *
 *   - IGNORED when older than the last applied roster (`issuedAt`) or the
 *     same event again (`eventId`): a late or repeated delivery never rolls
 *     the crew back.
 *   - IGNORED, AND SAID, when it lists nobody, or no admin. The platform
 *     sends nothing when a read fails and every workspace has an owner, so
 *     either means something went wrong upstream — and applying it would
 *     empty the crew or leave it with no Lead. These are the safety nets.
 *   - Otherwise `applyCrewRoster` (one statement): add the missing at their
 *     access's role, re-lock admins as Lead, unlock former admins, keep every
 *     chosen role, remove the unlisted (consent edges retired). Each change
 *     is audited in the local log with its roles and NO subject id — the
 *     crew route's rule (a subject id in a payload is one the registry could
 *     not erase). Then the roster is recorded, forward only.
 *
 * `project.deploy` — upsert per environment, newer `deployedAt` wins, the
 * first deploy kept. Not audited: a deploy is the platform's fact, not an act
 * on the listing, and the row itself is the record.
 *
 * ORDER: the roster sent when the link grant is minted can arrive before this
 * side stored the grant; it then finds no listing and is dropped. The next
 * change, or the daily sweep, heals it (said in the epic's status).
 */
export async function handleSeamProjectEvent(
  _env: Env,
  request: Request,
  requestId: string,
  deps: SeamProjectDeps,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }
  if (body.seam !== SEAM_VERSION) {
    return validationError(requestId, { seam: [`Must be "${SEAM_VERSION}"`] });
  }
  if (!isProjectEventType(body.type)) {
    return validationError(requestId, { type: ["Unknown seam event type"] });
  }
  const eventId = typeof body.eventId === "string" && body.eventId.length > 0 && body.eventId.length <= 128 ? body.eventId : null;
  if (!eventId) return validationError(requestId, { eventId: ["Required event id"] });

  const read = body.type === "project.roster" ? readProjectRoster(body.data) : readProjectDeploy(body.data);
  if (!read.ok) return validationError(requestId, read.fields);
  const orgId = parseOrgPublicId(read.value.orgId);
  const projectId = parseProjectPublicId(read.value.projectId);
  if (!orgId) return validationError(requestId, { orgId: ["Required org public id"] });
  if (!projectId) return validationError(requestId, { projectId: ["Required project public id"] });

  const listings = await deps.repo.listProfilesLinkedToProject(orgId, projectId);
  if (listings.length === 0) return successResponse({ recorded: false }, requestId, 200);
  const now = (deps.now ?? (() => new Date()))().toISOString();

  if (body.type === "project.deploy") {
    const deploy = read.value as ProjectDeploy;
    let applied = 0;
    for (const listing of listings) {
      const won = await deps.repo.upsertProductDeploy(
        listing.id as Uuid,
        { environment: deploy.environment, url: deploy.url, version: deploy.version, runRef: deploy.runRef, deployedAt: deploy.deployedAt },
        now,
      );
      if (won) applied += 1;
    }
    return successResponse({ recorded: true, listings: listings.length, applied }, requestId, 200);
  }

  const roster = read.value as ProjectRoster;
  const log =
    deps.log ??
    ((entry: { reason: "empty" | "no_admin"; eventId: string }) =>
      console.warn(JSON.stringify({ level: "warn", msg: "seam_roster_ignored", reason: entry.reason, eventId: entry.eventId })));
  const ignored: "empty" | "no_admin" | null =
    roster.members.length === 0 ? "empty" : roster.members.some((member) => member.access === "admin") ? null : "no_admin";
  if (ignored) {
    log({ reason: ignored, eventId });
    return successResponse({ recorded: false, ignored }, requestId, 200);
  }

  const outcomes: Array<{ applied: boolean; skipped?: RosterSkip; changes?: number }> = [];
  for (const listing of listings) {
    const profileId = listing.id as Uuid;
    const last = await deps.repo.getProductSync(profileId);
    if (last?.rosterEventId === eventId) {
      outcomes.push({ applied: false, skipped: "duplicate" });
      continue;
    }
    if (last?.rosterIssuedAt && Date.parse(last.rosterIssuedAt) > Date.parse(roster.issuedAt)) {
      outcomes.push({ applied: false, skipped: "stale" });
      continue;
    }
    const changes = await deps.repo.applyCrewRoster(profileId, roster.members, now);
    for (const change of changes) {
      const words =
        change.change === "added"
          ? { type: "openproduct.crew.synced_added", description: `joined the crew from Orunbase as ${change.role}`, payload: { role: change.role, locked: change.locked } }
          : change.change === "removed"
            ? { type: "openproduct.crew.synced_removed", description: `left the crew: no longer on the Orunbase project (was ${change.role})`, payload: { role: change.role } }
            : {
                type: `openproduct.crew.synced_${change.change}`,
                description: `a crew role ${change.change === "relocked" ? "locked by" : "unlocked on"} Orunbase: ${change.from} to ${change.role}`,
                payload: { from: change.from, to: change.role },
              };
      await deps.repo.appendAudit({
        id: (deps.generateId ?? generateId)() as never,
        orgId,
        profileId,
        ...ACTOR,
        type: words.type,
        description: `openproduct ${listing.slug}: ${words.description}`,
        payload: { slug: listing.slug, ...words.payload },
        requestId,
        occurredAt: now,
      });
    }
    await deps.repo.recordRosterSync(profileId, { issuedAt: roster.issuedAt, eventId, at: now });
    outcomes.push({ applied: true, changes: changes.length });
  }
  return successResponse(
    {
      recorded: outcomes.some((o) => o.applied),
      listings: listings.length,
      applied: outcomes.filter((o) => o.applied).length,
      skipped: outcomes.filter((o) => !o.applied).map((o) => o.skipped),
    },
    requestId,
    200,
  );
}
