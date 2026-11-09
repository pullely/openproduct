// Public-id helpers (saas-openproduct OD2).
//
// The platform convention: a UUID column, surfaced across the API boundary as
// `<prefix>_<32 hex>`. `Uuid` is branded, so a public id cannot be passed into
// a UUID column without going through a parse — a missing decode is a compile
// error rather than a runtime "invalid input syntax for type uuid".
//
// Profiles are addressed PUBLICLY by slug, never by id; `opp_` ids exist only
// on the authenticated maintainer door.

import { hexToUuid, uuidFromPublicId, uuidToHex, type Uuid } from "@openproduct/db/ids";

export type { Uuid };

export function generateId(): Uuid {
  return crypto.randomUUID() as Uuid;
}

export function orgPublicId(uuid: string): string {
  return `org_${uuidToHex(uuid)}`;
}

export function parseOrgPublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, "org");
}

export function projectPublicId(uuid: string): string {
  return `prj_${uuidToHex(uuid)}`;
}

export function parseProjectPublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, "prj");
}

export function profilePublicId(uuid: string): string {
  return `opp_${uuidToHex(uuid)}`;
}

export function parseProfilePublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, "opp");
}

export function roleOpeningPublicId(uuid: string): string {
  return `opr_${uuidToHex(uuid)}`;
}

export function parseRoleOpeningPublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, "opr");
}

/**
 * LC0 — a launch's public id.
 *
 * Prefixed like every other id that crosses the wire, and for the same
 * reason: a bare UUID in a URL is indistinguishable from any other bare UUID,
 * so a mistyped path resolves as "not found" rather than as somebody else's
 * object. `lch_` because `lch` reads as launch and nothing else here does.
 */
export function launchPublicId(uuid: string): string {
  return `lch_${uuidToHex(uuid)}`;
}

export function parseLaunchPublicId(publicId: string): Uuid | null {
  return uuidFromPublicId(publicId, "lch");
}

export { hexToUuid };
