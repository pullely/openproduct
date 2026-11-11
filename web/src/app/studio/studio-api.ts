// The maintainer studio's API client (openproduct-independence OX5b).
//
// The maintainer surface's move out of the platform console is what OX4/OX5a
// made possible: authority is listing-local (`listing_maintainers` + the
// operator bit), so the SAME narrow OH1 session token that serves /me serves
// the studio — the gateway resolves it to a subject, core authorizes against
// its own table, and no platform authority is involved anywhere.
//
// The me-api discipline holds: the token is a REQUIRED argument, the header
// set is closed, every read is no-store. One refinement — a third failure
// kind, `refused`, carrying status/code/blockers: the studio's writes have
// meaningful refusals (409 slug taken, 412 publish blockers, 403 stale grant)
// that the pages turn into copy, where /me only ever needed ok/dead/down.
//
// COLOCATED inside the route group (the me-api precedent): teardown stays a
// directory delete, and the maintainer client has exactly one home.
import type {
  AuthoredMediaKind,
  AppealView,
  AppealableAct,
  ModerationAct,
  LaunchPolicy,
  LaunchRefusalReason,
  MaintainerEntry,
  MaintainerProfile,
  MediaFact,
  MediaThumbnail,
  PublicThread,
  PublishBlocker,
  CuratorCollection,
  PublicFlag,
  QueuedReport,
  StudioLaunch,
} from "@openproduct/contracts";

import { openproductApiBase } from "../../lib/platform";

export type StudioFetch = typeof fetch;

interface Envelope<T> {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    // LC0 adds `reason`: a launch refusal is ONE stable token plus its
    // sentence, where a publish refusal is a LIST of blockers. Two shapes,
    // because they answer different questions — "what is wrong" versus
    // "everything that is wrong" — and collapsing them would make a launch
    // refusal a one-element list nobody reads as a sentence.
    // openproduct-studio OSD7 adds `fields`: a 422's per-field sentences,
    // which is where core names the handle nobody goes by.
    details?: { blockers?: PublishBlocker[]; reason?: LaunchRefusalReason; fields?: Record<string, string[]> };
  };
}

export type StudioResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | {
      kind: "refused";
      status: number;
      code: string;
      message: string;
      blockers?: PublishBlocker[];
      reason?: LaunchRefusalReason;
      fields?: Record<string, string[]>;
    }
  | {
      kind: "unavailable";
      /**
       * What the upstream actually said, when it said anything: the HTTP
       * status, the envelope's code/message and its requestId. A 5xx from the
       * gateway is one of a handful of distinct sentences ("Platform
       * unreachable", "Openproduct service unavailable", "Internal error"), and
       * each names a different hop — so the page can print a reference a
       * maintainer can quote, and a log line can say which hop failed, instead
       * of both saying only "could not be reached".
       */
      status?: number;
      code?: string;
      message?: string;
      requestId?: string;
    };

/** The landing's row shape — core's GET /me/listings projection. */
export interface StudioListing {
  id: string;
  orgId: string;
  projectId: string;
  slug: string;
  visibility: "private" | "public";
  tagline: string | null;
  publishedAt: string | null;
  reviewedAt: string | null;
  repoVisibility: "public" | "private" | null;
  workspaceLinkedAt: string | null;
  /** The listing's logo, drafts included (openproduct-studio OSD3); null
   *  keeps the monogram. */
  thumbnail: MediaThumbnail | null;
}

function headers(token: string, withBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    ...(withBody ? { "content-type": "application/json" } : {}),
  };
}

async function studioRequest<T>(
  token: string,
  path: string,
  init: { method: string; body?: unknown },
  fetchImpl: StudioFetch = fetch,
): Promise<StudioResult<T>> {
  try {
    const res = await fetchImpl(`${openproductApiBase()}${path}`, {
      method: init.method,
      headers: headers(token, init.body !== undefined),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });
    return await interpretStudioResponse<T>(res);
  } catch (error) {
    return { kind: "unavailable", code: "fetch_failed", message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One reading of the gateway's answer, shared by the JSON requests above and
 * the one request here whose body is not JSON (MD2's upload). Factored rather
 * than copied so a refusal is a refusal in both — the media step renders the
 * upload's 413 and 415 with the same panel every other step renders a 409.
 */
async function interpretStudioResponse<T>(res: Response): Promise<StudioResult<T>> {
  if (res.status === 401) return { kind: "unauthorized" };
  if (!res.ok) {
    // 4xx below 500 is an ANSWER (a refusal with a remedy), not an outage —
    // including the resource-hiding 404, which the pages render as "not
    // yours or not there", never as a service failure.
    if (res.status < 500) {
      const body = (await res.json().catch(() => null)) as Envelope<never> | null;
      return {
        kind: "refused",
        status: res.status,
        code: body?.error?.code ?? "refused",
        message: body?.error?.message ?? "The service refused this request",
        ...(body?.error?.details?.blockers ? { blockers: body.error.details.blockers } : {}),
        ...(body?.error?.details?.reason ? { reason: body.error.details.reason } : {}),
        ...(body?.error?.details?.fields ? { fields: body.error.details.fields } : {}),
      };
    }
    const body = (await res.json().catch(() => null)) as
      | (Envelope<never> & { error?: { requestId?: string } })
      | null;
    return {
      kind: "unavailable",
      status: res.status,
      ...(body?.error?.code ? { code: body.error.code } : {}),
      ...(body?.error?.message ? { message: body.error.message } : {}),
      ...(body?.error?.requestId ? { requestId: body.error.requestId } : {}),
    };
  }
  const data = ((await res.json()) as Envelope<T>).data;
  return data === undefined || data === null
    ? { kind: "unavailable", status: res.status, code: "empty_envelope", message: "The service answered without data" }
    : { kind: "ok", data };
}

// ── the landing ────────────────────────────────────────────────────────────

export function fetchMyListings(
  token: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ listings: StudioListing[] }>> {
  return studioRequest(token, "/v1/openproduct/me/listings", { method: "GET" }, fetchImpl);
}

// ── one listing ────────────────────────────────────────────────────────────

function profileBase(orgId: string, profileId?: string): string {
  const root = `/v1/organizations/${encodeURIComponent(orgId)}/openproduct/profiles`;
  return profileId ? `${root}/${encodeURIComponent(profileId)}` : root;
}

export function fetchProfile(
  token: string,
  orgId: string,
  profileId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ profile: MaintainerProfile; capabilities?: { canReview?: boolean } }>> {
  return studioRequest(token, profileBase(orgId, profileId), { method: "GET" }, fetchImpl);
}

export function createListing(
  token: string,
  orgId: string,
  body: { grant: string; slug: string; tagline?: string; pitch?: string },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ profile: MaintainerProfile }>> {
  return studioRequest(token, profileBase(orgId), { method: "POST", body }, fetchImpl);
}

/** Attach (or refresh) the link grant — the `workspace_link_required` remedy. */
export function linkListing(
  token: string,
  orgId: string,
  profileId: string,
  grant: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ profile: MaintainerProfile }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/link-grant`, { method: "PUT", body: { grant } }, fetchImpl);
}

export function updateListing(
  token: string,
  orgId: string,
  profileId: string,
  body: Record<string, unknown>,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ profile: MaintainerProfile }>> {
  return studioRequest(token, profileBase(orgId, profileId), { method: "PATCH", body }, fetchImpl);
}

// ── MD2 — the media step ─────────────────────────────────────────────────────
//
// Three calls, and the middle one is the only request in this file whose body
// is not JSON. The bytes go to the GATEWAY, which sniffs them, stores them
// under their hash and asks core for the row (MD1); the token never reaches
// the browser, so the file passes through the actions route — read from the
// form as a Blob, forwarded as the body, never buffered into a string.

/** The maintainer's own rows, draft or not. */
export function fetchMedia(
  token: string,
  orgId: string,
  profileId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ media: MediaFact[] }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/media`, { method: "GET" }, fetchImpl);
}

/**
 * One upload. The fields travel in the query so the body is the file and
 * nothing else (MD1's shape). `content-length` is set from the Blob, which is
 * what lets the gateway refuse a 50 MB body before it reads a byte.
 */
export async function uploadMedia(
  token: string,
  orgId: string,
  profileId: string,
  file: Blob,
  fields: { kind: AuthoredMediaKind; alt: string; position: number },
  fetchImpl: StudioFetch = fetch,
): Promise<StudioResult<{ media: MediaFact }>> {
  const query = new URLSearchParams({
    kind: fields.kind,
    alt: fields.alt,
    position: String(fields.position),
  });
  try {
    const res = await fetchImpl(`${openproductApiBase()}${profileBase(orgId, profileId)}/media?${query}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": file.type || "application/octet-stream",
        "content-length": String(file.size),
      },
      body: file,
      cache: "no-store",
    });
    return await interpretStudioResponse<{ media: MediaFact }>(res);
  } catch (error) {
    return { kind: "unavailable", code: "fetch_failed", message: error instanceof Error ? error.message : String(error) };
  }
}

/** Remove one row. The object stays — it is content-addressed and may be
 *  somebody else's (MD1). */
/** openproduct-studio OSD6 — the words under a picture, changed in place. */
export function updateMediaAlt(
  token: string,
  orgId: string,
  profileId: string,
  mediaId: string,
  alt: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ media: MediaFact }>> {
  return studioRequest(
    token,
    `${profileBase(orgId, profileId)}/media/${encodeURIComponent(mediaId)}`,
    { method: "PATCH", body: { alt } },
    fetchImpl,
  );
}

/** openproduct-studio OSD6 — the gallery in the maker's order, first to last. */
export function reorderGallery(
  token: string,
  orgId: string,
  profileId: string,
  gallery: readonly string[],
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ media: MediaFact[] }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/media`, { method: "PUT", body: { gallery } }, fetchImpl);
}

export function removeMedia(
  token: string,
  orgId: string,
  profileId: string,
  mediaId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ removed: boolean }>> {
  return studioRequest(
    token,
    `${profileBase(orgId, profileId)}/media/${encodeURIComponent(mediaId)}`,
    { method: "DELETE" },
    fetchImpl,
  );
}

/** The S8 repo read: the gateway observes GitHub and records the observation. */
export function checkRepo(
  token: string,
  orgId: string,
  profileId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ profile: MaintainerProfile; blockers: PublishBlocker[] }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/repo-check`, { method: "POST" }, fetchImpl);
}

/** The curation gate — operators only; everyone else gets the hiding 404. */
export function reviewListing(
  token: string,
  orgId: string,
  profileId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ profile: MaintainerProfile }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/review`, { method: "POST" }, fetchImpl);
}

export function publishListing(
  token: string,
  orgId: string,
  profileId: string,
  components: Array<{ name: string; kind: string | null }>,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ profile: MaintainerProfile }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/publish`, {
    method: "POST",
    ...(components.length > 0 ? { body: { components } } : {}),
  }, fetchImpl);
}

export function unpublishListing(
  token: string,
  orgId: string,
  profileId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ profile: MaintainerProfile }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/publish`, { method: "DELETE" }, fetchImpl);
}

export function saveOpening(
  token: string,
  orgId: string,
  profileId: string,
  body: { title: string; description?: string; commitment?: string; status?: string },
  openingId?: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ roleOpening: unknown }>> {
  return openingId
    ? studioRequest(token, `${profileBase(orgId, profileId)}/role-openings/${encodeURIComponent(openingId)}`, { method: "PUT", body }, fetchImpl)
    : studioRequest(token, `${profileBase(orgId, profileId)}/role-openings`, { method: "POST", body }, fetchImpl);
}

export function deleteOpening(
  token: string,
  orgId: string,
  profileId: string,
  openingId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ deleted: boolean }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/role-openings/${encodeURIComponent(openingId)}`, { method: "DELETE" }, fetchImpl);
}

export function setMaintainers(
  token: string,
  orgId: string,
  profileId: string,
  maintainers: MaintainerEntry[],
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ maintainers: unknown[] }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/maintainers`, { method: "PUT", body: { maintainers } }, fetchImpl);
}

// ── the grant blob, read for ROUTING only ──────────────────────────────────

/**
 * Decode a grant blob's payload WITHOUT verifying it. The studio needs the
 * org (for the create URL) and the project (to find an existing listing on a
 * 409); AUTHORITY never comes from this read — core verifies the signature
 * and freshness before anything is written, and a tampered blob simply fails
 * there. Null on anything unparseable.
 */
export function readGrantPayload(blob: string): { orgId: string; projectId: string } | null {
  try {
    const encoded = blob.split(".")[0] ?? "";
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { orgId?: unknown; projectId?: unknown };
    if (typeof payload.orgId !== "string" || typeof payload.projectId !== "string") return null;
    return { orgId: payload.orgId, projectId: payload.projectId };
  } catch {
    return null;
  }
}

// ── launches (openproduct-commons LC0) ─────────────────────────────────────

/** What the studio needs to render the scheduler: the history AND the rules. */
export interface LaunchesView {
  launches: StudioLaunch[];
  /** The listing's own name, for the crumbs. */
  slug: string | null;
  eligibility: {
    isPublished: boolean;
    hasScheduled: boolean;
    lastLaunchedAt: string | null;
    consumedVersions: string[];
  };
  /** The policy THIS API enforces — per-environment, so the studio states the
   *  rule a maker is actually held to rather than the compiled-in default. */
  policy: LaunchPolicy;
}

/**
 * THE ELIGIBILITY COMES BACK WITH THE LIST, in one read.
 *
 * A form that renders its own idea of the rules and finds out on submit is
 * the failure a shared `checkLaunchable` exists to prevent — but only if the
 * page is given the facts to ask it with. Fetching them separately would
 * introduce exactly the skew the shared function removed.
 */
export function fetchLaunches(
  token: string,
  orgId: string,
  profileId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<LaunchesView>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/launches`, { method: "GET" }, fetchImpl);
}

export function scheduleLaunch(
  token: string,
  orgId: string,
  profileId: string,
  body: { versionLabel: string; scheduledFor: string },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ launch: StudioLaunch }>> {
  return studioRequest(
    token,
    `${profileBase(orgId, profileId)}/launches`,
    { method: "POST", body },
    fetchImpl,
  );
}

export function rescheduleLaunch(
  token: string,
  orgId: string,
  profileId: string,
  launchId: string,
  body: { scheduledFor: string },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ launch: StudioLaunch }>> {
  return studioRequest(
    token,
    `${profileBase(orgId, profileId)}/launches/${encodeURIComponent(launchId)}`,
    { method: "PATCH", body },
    fetchImpl,
  );
}

export function cancelLaunch(
  token: string,
  orgId: string,
  profileId: string,
  launchId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ launch: StudioLaunch }>> {
  return studioRequest(
    token,
    `${profileBase(orgId, profileId)}/launches/${encodeURIComponent(launchId)}`,
    { method: "DELETE" },
    fetchImpl,
  );
}

// ---------------------------------------------------------------------------
// TS3 — the moderation queue and the acts that answer it
// ---------------------------------------------------------------------------

/**
 * NOT under `profileBase`. Every other studio read is scoped to one listing an
 * org owns; the queue is scoped to the ESTATE, and the authority is the
 * operator allowlist rather than a role on a listing. Routing it through an
 * org path would suggest an org could reach its own queue, which is exactly
 * the thing that must not be true — a maintainer must never see who reported
 * them.
 */
export function fetchReportQueue(
  token: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ reports: QueuedReport[] }>> {
  return studioRequest(token, "/v1/openproduct/reports/queue", { method: "GET" }, fetchImpl);
}

export function fetchSubjectDossier(
  token: string,
  subjectKind: string,
  subjectRef: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ reports: unknown[]; acts: unknown[] }>> {
  const query = `?subjectKind=${encodeURIComponent(subjectKind)}&subjectRef=${encodeURIComponent(subjectRef)}`;
  return studioRequest(token, `/v1/openproduct/reports/subject${query}`, { method: "GET" }, fetchImpl);
}

/** LC4 — the curator's own collections, and whether they may curate at all.
 *  `eligible` comes back even with an empty list: "you have none yet" and
 *  "you cannot yet, and here is why" are different pages. */
export function fetchMyCollections(
  token: string,
  fetchImpl?: StudioFetch,
): Promise<
  StudioResult<{
    eligible: boolean;
    curatorHandle: string | null;
    collections: CuratorCollection[];
  }>
> {
  return studioRequest(token, "/v1/openproduct/me/collections", { method: "GET" }, fetchImpl);
}

export function createCollection(
  token: string,
  body: { slug: string; title: string; blurb?: string },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ collection: { id: string } }>> {
  return studioRequest(token, "/v1/openproduct/me/collections", { method: "POST", body }, fetchImpl);
}

/** Add, remove or reorder — one shape, because all three carry the collection
 *  and differ only in what else they name. */
export function collectionItems(
  token: string,
  intent: "add" | "remove" | "reorder",
  body: { collectionId: string; slug?: string; note?: string; order?: string[] },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<Record<string, unknown>>> {
  return studioRequest(
    token,
    `/v1/openproduct/me/collections/${intent}`,
    { method: "POST", body },
    fetchImpl,
  );
}

export function setCollectionState(
  token: string,
  body: { collectionId: string; state: "published" | "retired" },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ collection: { state: string } }>> {
  return studioRequest(
    token,
    "/v1/openproduct/me/collections/state",
    { method: "POST", body },
    fetchImpl,
  );
}

/** TS4 — what the detectors noticed. Same operators, same page, separate
 *  table: a flag is not a report, but a triager has one attention. */
export function fetchFlagQueue(
  token: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ flags: PublicFlag[] }>> {
  return studioRequest(token, "/v1/openproduct/reports/flags", { method: "GET" }, fetchImpl);
}

/**
 * A human's verdict on a flag.
 *
 * Resolving does NOT undo the consequence. Dismissing a filler flag says the
 * detector was wrong; re-indexing the listing is a moderation act with a
 * reason, taken through the normal path and recorded as one.
 */
export function resolveFlag(
  token: string,
  body: { flagId: string; verdict: "actioned" | "dismissed" },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ id: string; state: string }>> {
  return studioRequest(token, "/v1/openproduct/reports/flags/resolve", { method: "POST", body }, fetchImpl);
}

/** Claim or decline a report, without touching what it names. */
export function triageReport(
  token: string,
  body: { reportId: string; decision: "claim" | "decline"; reason?: string },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ id: string; state: string }>> {
  return studioRequest(token, "/v1/openproduct/reports/triage", { method: "POST", body }, fetchImpl);
}

/** Act on the listing itself. Every call writes a ledger row first. */
export function moderateListing(
  token: string,
  body: { act: string; slug: string; reason: string; reportId?: string | null },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ slug: string; moderationState: string; moderatedAt: string | null }>> {
  return studioRequest(token, "/v1/openproduct/reports/acts", { method: "POST", body }, fetchImpl);
}

// ── appeals (openproduct-commons TS5) ──────────────────────────────────────

/**
 * What was done to the caller's listings, with their appeal beside each act.
 *
 * Under `/me` rather than under an org path, because standing is the whole of
 * its authorization: core derives which listings are theirs from
 * listing_maintainers and answers with those acts and no others. A maintainer
 * of nothing gets an empty list, not a refusal.
 */
export function fetchMyAppealableActs(
  token: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ acts: AppealableAct[] }>> {
  return studioRequest(token, "/v1/openproduct/me/appeals", { method: "GET" }, fetchImpl);
}

/** File one. Bounded by standing rather than by a rate: one act, once, ever. */
export function fileAppeal(
  token: string,
  body: { actId: string; says: string },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ appeal: AppealView }>> {
  return studioRequest(token, "/v1/openproduct/me/appeals", { method: "POST", body }, fetchImpl);
}

/** The operator queue, oldest first, each appeal carrying the act it disputes. */
export function fetchAppealQueue(
  token: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ appeals: QueuedAppealView[] }>> {
  return studioRequest(token, "/v1/openproduct/reports/appeals", { method: "GET" }, fetchImpl);
}

/** Uphold or refuse. Upholding reverses the act and records the reversal. */
export function decideAppeal(
  token: string,
  body: { appealId: string; decision: "uphold" | "refuse"; reason: string },
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ appeal: AppealView; reversed: boolean }>> {
  return studioRequest(
    token,
    "/v1/openproduct/reports/appeals/decide",
    { method: "POST", body },
    fetchImpl,
  );
}

/**
 * What the queue renders per row.
 *
 * DECLARED HERE rather than imported from core, because the studio talks to
 * the gateway over HTTP and importing a worker's type would be the studio
 * depending on core's build (the OX5 seam rule). The shape is pinned to
 * core's projection by a test in tests/web.
 */
export interface QueuedAppealView {
  id: string;
  says: string;
  filedAt: string;
  act: ModerationAct;
  subjectKind: string;
  subjectRef: string;
  actReason: string;
  actOccurredAt: string;
  reversal: ModerationAct | null;
}

/**
 * A listing's threads, for its maintainer (CB1).
 *
 * The PUBLIC read would do for the list itself, but this one is scoped by the
 * org path so it carries the maintainer's authority — and returns the slug,
 * so the breadcrumb can name the listing rather than echoing an opaque id
 * (the LC0 finding, kept).
 */
export function fetchProfileThreads(
  token: string,
  orgId: string,
  profileId: string,
  fetchImpl?: StudioFetch,
): Promise<StudioResult<{ threads: QueuedThreadView[]; slug: string | null }>> {
  return studioRequest(token, `${profileBase(orgId, profileId)}/threads`, { method: "GET" }, fetchImpl);
}

/** The public thread shape is what the studio list renders too — one shape,
 *  so the maintainer sees exactly what a reader sees. */
export type QueuedThreadView = PublicThread;
