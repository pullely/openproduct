// Synced from Orunbase (openproduct-stages-crew SC-4, design §3).
//
// THE SEAM EDGE S14. The platform's membership-worker delivers two kinds of
// event to `{LISTING_SEAM_URL}/seam/v1/project-events`, signed like S6 (the
// canonical `X-Webhook-{Signature,Timestamp,ID}` scheme with
// `LISTING_SEAM_SECRET`) in the `{seam, eventId, occurredAt, type, data}`
// envelope, for every project with a listed door:
//
//   project.roster   everyone with access to the project, a FULL snapshot,
//                    never a delta: on every change that can alter the set,
//                    when the link grant is minted, and in a daily sweep
//   project.deploy   one environment's last successful deploy
//
// The ids are the PUBLIC forms (`org_…`, `prj_…`), as the S4 grant and the
// workspace event carry them; core parses them. The exact keys are pinned by
// `seam-fixtures/project.roster.json` and `project.deploy.json`, copied byte
// for byte from the platform's side.
//
// This module READS a delivery's `data` into a shape core can trust (or says
// which field is wrong), names what an Orunbase access means on a crew, and
// words the crew-only Orunbase card and the stage form's sync lines.
//
// PURE, AND NO JSX: imported by core and the web.

import { CREW_SUBJECT_ID_RE, type CrewRole } from "./crew-roles.js";

// ─── the edge ──────────────────────────────────────────────────────────────

/** The edge's path on the gateway. */
export const SEAM_PROJECT_EVENTS_PATH = "/seam/v1/project-events";

export const PROJECT_EVENT_TYPES = ["project.roster", "project.deploy"] as const;
export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];

export function isProjectEventType(value: unknown): value is ProjectEventType {
  return typeof value === "string" && (PROJECT_EVENT_TYPES as readonly string[]).includes(value);
}

/** `project.roster`'s `data`, exactly. */
export const PROJECT_ROSTER_KEYS = ["issuedAt", "members", "orgId", "projectId"] as const;
/** One member of it, exactly. */
export const PROJECT_ROSTER_MEMBER_KEYS = ["access", "displayName", "subjectId"] as const;
/** `project.deploy`'s `data`, exactly. */
export const PROJECT_DEPLOY_KEYS = ["deployedAt", "environment", "orgId", "projectId", "runRef", "url", "version"] as const;

/** Orunbase project access, highest first (design §3.1 "Members"). */
export const ORUNBASE_ACCESS = ["admin", "builder", "viewer"] as const;
export type OrunbaseAccess = (typeof ORUNBASE_ACCESS)[number];

export function isOrunbaseAccess(value: unknown): value is OrunbaseAccess {
  return typeof value === "string" && (ORUNBASE_ACCESS as readonly string[]).includes(value);
}

/**
 * The role an Orunbase access starts somebody at (design §3.2): an admin is
 * a Lead — and a LOCKED one, changed only on Orunbase — a builder a
 * Maintainer, a viewer a Member.
 */
export const CREW_ROLE_OF_ACCESS: Record<OrunbaseAccess, CrewRole> = {
  admin: "lead",
  builder: "maintainer",
  viewer: "member",
};

export const DEPLOY_ENVIRONMENTS = ["stage", "production"] as const;
export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

/** The most people one roster may carry. Far above any crew in play (risk
 *  R3 revisits at 2,000); a bigger one is refused rather than half-read. */
export const PROJECT_ROSTER_MAX = 5_000;
/** A synced name, as stored: longer is cut. */
export const SYNCED_NAME_MAX = 120;
/** The same bounds the stage form holds a crew's own values to. */
export const SYNCED_URL_MAX = 200;
export const SYNCED_VERSION_MAX = 40;

export interface ProjectRosterMember {
  subjectId: string;
  displayName: string | null;
  access: OrunbaseAccess;
}

export interface ProjectRoster {
  /** `org_…`, as delivered. */
  orgId: string;
  /** `prj_…`, as delivered. */
  projectId: string;
  members: ProjectRosterMember[];
  issuedAt: string;
}

export interface ProjectDeploy {
  orgId: string;
  projectId: string;
  environment: DeployEnvironment;
  /** Null today: no run knows its environment's address yet. */
  url: string | null;
  version: string | null;
  runRef: string;
  deployedAt: string;
}

type Read<T> = { ok: true; value: T } | { ok: false; fields: Record<string, string[]> };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function instant(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

function idOf(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null;
}

/** A name as a person gave it: trimmed, cut to the bound, or null. */
export function syncedNameOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, SYNCED_NAME_MAX).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A `project.roster` delivery's `data`, read. Every member must be whole: a
 * snapshot with one unreadable person is refused rather than applied without
 * them, because applying it would REMOVE that person from the crew.
 */
export function readProjectRoster(data: unknown): Read<ProjectRoster> {
  const body = record(data);
  if (!body) return { ok: false, fields: { data: ["Required"] } };
  const fields: Record<string, string[]> = {};
  const orgId = idOf(body.orgId);
  const projectId = idOf(body.projectId);
  const issuedAt = instant(body.issuedAt);
  if (!orgId) fields.orgId = ["Required org public id"];
  if (!projectId) fields.projectId = ["Required project public id"];
  if (!issuedAt) fields.issuedAt = ["Required instant"];
  const members: ProjectRosterMember[] = [];
  if (!Array.isArray(body.members)) {
    fields.members = ["Required list"];
  } else if (body.members.length > PROJECT_ROSTER_MAX) {
    fields.members = [`At most ${PROJECT_ROSTER_MAX} people`];
  } else {
    body.members.forEach((raw, index) => {
      const member = record(raw);
      const subjectId = member?.subjectId;
      if (!member || typeof subjectId !== "string" || !CREW_SUBJECT_ID_RE.test(subjectId)) {
        fields[`members.${index}.subjectId`] = ["Required subject id"];
        return;
      }
      if (!isOrunbaseAccess(member.access)) {
        fields[`members.${index}.access`] = ["Unknown access"];
        return;
      }
      if (member.displayName !== null && typeof member.displayName !== "string") {
        fields[`members.${index}.displayName`] = ["A name or null"];
        return;
      }
      members.push({ subjectId, displayName: syncedNameOf(member.displayName), access: member.access });
    });
  }
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, value: { orgId: orgId!, projectId: projectId!, members, issuedAt: issuedAt! } };
}

/** An address a deploy reported, kept only when it is one the page may link. */
function deployUrlOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length > SYNCED_URL_MAX) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** A `project.deploy` delivery's `data`, read. A url that is not https, or a
 *  version past the bound, is dropped (null) rather than refusing the deploy:
 *  the run still happened. */
export function readProjectDeploy(data: unknown): Read<ProjectDeploy> {
  const body = record(data);
  if (!body) return { ok: false, fields: { data: ["Required"] } };
  const fields: Record<string, string[]> = {};
  const orgId = idOf(body.orgId);
  const projectId = idOf(body.projectId);
  const deployedAt = instant(body.deployedAt);
  const environment = body.environment;
  const runRef = typeof body.runRef === "string" && body.runRef.length > 0 && body.runRef.length <= 128 ? body.runRef : null;
  if (!orgId) fields.orgId = ["Required org public id"];
  if (!projectId) fields.projectId = ["Required project public id"];
  if (!deployedAt) fields.deployedAt = ["Required instant"];
  if (environment !== "stage" && environment !== "production") fields.environment = ["stage or production"];
  if (!runRef) fields.runRef = ["Required run ref"];
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  const version =
    typeof body.version === "string" && body.version.trim().length > 0 && body.version.trim().length <= SYNCED_VERSION_MAX
      ? body.version.trim()
      : null;
  return {
    ok: true,
    value: {
      orgId: orgId!,
      projectId: projectId!,
      environment: environment as DeployEnvironment,
      url: deployUrlOf(body.url),
      version,
      runRef: runRef!,
      deployedAt: deployedAt!,
    },
  };
}

// ─── the crew's own read: the Orunbase card ────────────────────────────────

/** One environment's last deploy, as the crew reads it. */
export interface SyncedDeploy {
  url: string | null;
  version: string | null;
  runRef: string;
  deployedAt: string;
  /** The earliest deploy ever seen for the environment: "live since". */
  firstDeployedAt: string;
}

export const SYNCED_DEPLOY_KEYS = ["deployedAt", "firstDeployedAt", "runRef", "url", "version"] as const;

/**
 * `GET …/profiles/{id}/orunbase` — the crew's (any role), never cached, never
 * in the public document. `linked` is false for a listing with no link grant:
 * nothing can sync, and the card does not draw.
 */
export interface OrunbaseSync {
  linked: boolean;
  /** When anything last synced, or null before the first delivery. */
  syncedAt: string | null;
  /** Everybody on the crew. */
  crew: number;
  stage: SyncedDeploy | null;
  production: SyncedDeploy | null;
  /** The workspace's public id, for "Manage on Orunbase". */
  workspaceRef: string | null;
}

export const ORUNBASE_SYNC_KEYS = ["crew", "linked", "production", "stage", "syncedAt", "workspaceRef"] as const;

/** The web route adds where "Manage on Orunbase" goes (the console origin is
 *  the web's to know). */
export interface OrunbaseCard extends OrunbaseSync {
  manageUrl: string | null;
}

export const ORUNBASE_CARD_TITLE = "Orunbase";
export const MANAGE_ON_ORUNBASE = "Manage on Orunbase";
export const NO_DEPLOY_YET = "No deploy yet";
export const NOT_SYNCED_YET = "Waiting for the first sync";

/** A run's public id as a line shows it: its tail, which is what differs. */
export function shortRunRef(runRef: string): string {
  return runRef.length > 8 ? runRef.slice(-8) : runRef;
}

/** `In sync · 2m ago`, or the wait before the first delivery. */
export function inSyncLine(syncedAt: string | null, ago: (iso: string) => string): string {
  return syncedAt ? `In sync · ${ago(syncedAt)}` : NOT_SYNCED_YET;
}

/** `12 people`. */
export function crewCountLine(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

/** `v1.4.0 · 3h ago`, `3h ago` without a version, or "No deploy yet". */
export function deployLine(deploy: SyncedDeploy | null, ago: (iso: string) => string): string {
  if (!deploy) return NO_DEPLOY_YET;
  return deploy.version ? `${deploy.version} · ${ago(deploy.deployedAt)}` : ago(deploy.deployedAt);
}

// ─── the stage form: synced values beside the crew's ───────────────────────

/** The stage form's fields a deploy can fill. */
export const SYNCED_STAGE_FIELDS = ["stageUrl", "productionUrl", "liveSince", "version"] as const;
export type SyncedStageField = (typeof SYNCED_STAGE_FIELDS)[number];

/** What a deploy says for each field it can fill; absent when it says
 *  nothing (no deploy, or a null url or version). */
export function syncedStageValues(sync: Pick<OrunbaseSync, "stage" | "production"> | null): Partial<Record<SyncedStageField, string>> {
  const out: Partial<Record<SyncedStageField, string>> = {};
  if (sync?.stage?.url) out.stageUrl = sync.stage.url;
  if (sync?.production?.url) out.productionUrl = sync.production.url;
  if (sync?.production) out.liveSince = sync.production.firstDeployedAt.slice(0, 10);
  if (sync?.production?.version) out.version = sync.production.version;
  return out;
}

/** The green line under a field that holds the synced value (boards
 *  `Stage`, `PhoneStage`). */
export function syncedFieldLine(
  field: SyncedStageField,
  sync: Pick<OrunbaseSync, "stage" | "production">,
  ago: (iso: string) => string,
): string {
  if (field === "stageUrl" && sync.stage) {
    return `Synced from Orunbase · stage deploy ${shortRunRef(sync.stage.runRef)} · ${ago(sync.stage.deployedAt)}`;
  }
  if (field === "productionUrl" && sync.production) {
    return `Synced from Orunbase · production deploy ${shortRunRef(sync.production.runRef)} · ${ago(sync.production.deployedAt)}`;
  }
  if (field === "liveSince") return "Synced from the first production deploy";
  return "Synced from the last deploy";
}

/** The amber line under a field the crew changed. */
export function changedFieldLine(synced: string): string {
  return `Changed by you · Orunbase has ${synced}`;
}

export const USE_SYNCED = "Use synced";
