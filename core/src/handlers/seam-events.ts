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
//
// Fail-soft mirrors the sender: an event that resolves to nothing (a door
// with no live opening, a ref we never saw) answers 200 {recorded:false} —
// the platform's delivery is fire-and-forget, and a 4xx would only make a
// benign miss look like an outage. The snapshot heals on the next event.

import type { OpenproductRepository } from "@openproduct/db";

import { decisionPublication } from "@openproduct/contracts";

import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { parseOrgPublicId } from "../ids.js";

export interface SeamEventDeps {
  repo: Pick<
    OpenproductRepository,
    | "recordApplication"
    | "getRoleOpeningByJoinLinkRef"
    | "setApplicationStatusByRequestRef"
    // CB3 — the decision trail.
    | "getApplicationByRequestRef"
    | "appendActivity"
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
