// Media rows — add, list, remove (openproduct-worldclass MD1).
//
// THE BYTES NEVER COME HERE. The gateway holds the bucket, sniffs the file,
// stores it under its content hash and asks this handler for a ROW: kind,
// alt, position, the reference, and the dimensions the sniff read. This
// handler decides whether the maker may have that row — which is the same
// question `handleUpdateProfile` answers for a tagline, asked of an image —
// and refuses anything the media model refuses (MD0's `mediaViolations`,
// which 1820's constraints back up at the column).
//
// ─── ONLY THE AUTHORED KINDS, AND THAT IS NOT A GAP ──────────────────────
//
// A maker may add a hero or a gallery image. A maker may NOT add a
// screenshot: that kind is OBSERVED, the sweep captures it (MD4), and a row
// of that kind arriving through the maintainer door would be a maker
// choosing their own "observation" — WC-3's failure in one request. The
// refusal names the kind rather than hiding behind validation.
//
// ─── WHY THE HANDLER VALIDATES WHAT THE DATABASE ALREADY REFUSES ─────────
//
// 1820 has the unique slot index and the gallery-ceiling trigger; a violating
// insert would fail there. It is checked here first because the constraint's
// failure is one sentence about one row, and `mediaViolations` returns the
// whole list — a maker with a full gallery AND a blank alt is told both,
// once, which is what a form wants (MD0 said so: "MD1's upload path wants to
// tell a maker what is wrong with their gallery, not fail on the first
// thing").

import {
  AUTHORED_MEDIA_KINDS,
  MEDIA_ALT_MAX,
  MEDIA_MAX_SIDE,
  MEDIA_MIN_HEIGHT,
  MEDIA_MIN_WIDTH,
  MEDIA_REFUSALS,
  authoredMedia,
  mediaShapeRefusal,
  mediaViolations,
  observedScreenshot,
  parseMediaRef,
  thumbnailOf,
  type AuthoredMediaKind,
  type MediaFact,
  type MediaThumbnail,
} from "@openproduct/contracts";
import type { OpenproductRepository, ProductMediaRecord } from "@openproduct/db";
import type { Uuid } from "../ids.js";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";
import { generateId } from "../ids.js";
import { authorizeFor, type ProfileHandlerDeps } from "./profiles.js";

/** A stored row, as the wire shape MD0 defined. One function, every reader. */
export function mediaFactOf(row: ProductMediaRecord): MediaFact {
  const asset = {
    id: row.id,
    ref: row.storageRef,
    alt: row.alt,
    width: row.width,
    height: row.height,
    position: row.position,
  };
  if (row.kind === "screenshot") {
    return observedScreenshot({ ...asset, kind: "screenshot" }, row.observedAt ?? "");
  }
  return authoredMedia({ ...asset, kind: row.kind });
}

/**
 * Every row's tile picture, in ONE read (openproduct-studio OSD3).
 *
 * The board, the leaderboard, search, a maker's rows, saved and the studio
 * list all draw a product's tile, and each asks this once per request with
 * every slug on the page — never once per row. The lookup is the feed's
 * (MD3): the lower-cased slug first, then as written. A slug with no public
 * logo answers `null` and the tile keeps its monogram.
 */
export async function thumbnailsForSlugs(
  repo: Pick<OpenproductRepository, "listPublicMediaForSlugs">,
  slugs: readonly string[],
): Promise<(slug: string) => MediaThumbnail | null> {
  const unique = [...new Set(slugs)];
  if (unique.length === 0) return () => null;
  const mediaBySlug = await repo.listPublicMediaForSlugs(unique);
  return (slug) =>
    thumbnailOf((mediaBySlug.get(slug.toLowerCase()) ?? mediaBySlug.get(slug) ?? []).map(mediaFactOf));
}

/**
 * openproduct-studio OSD3 (risk R2) — the home list reads a listing's media
 * from `catalog_cards`, which the sweep rebuilds every ten minutes. A maker
 * who adds a logo should see it on the home list now, so the listing's row
 * is refreshed here. BEST-EFFORT: the media row is the fact and it is
 * already written; a failed refresh waits for the sweep, it never fails the
 * upload.
 */
async function refreshCatalogue(deps: ProfileHandlerDeps, profileId: Uuid): Promise<void> {
  try {
    await deps.repo.refreshCatalogueMedia(profileId);
  } catch {
    // Deliberately swallowed — see the note above.
  }
}

/** GET …/profiles/{id}/media — the maintainer's own view: every row,
 *  including on a draft. The public read is `listPublicMedia`, elsewhere. */
export async function handleListMedia(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  const existing = await deps.repo.getProfileForOrg(orgId, profileId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);
  const auth = await authorizeFor(env, actor, "read", profileId, deps, requestId);
  if (!auth.ok) return auth.response;
  const rows = await deps.repo.listMediaForProfile(profileId);
  return successResponse({ media: rows.map(mediaFactOf) }, requestId);
}

/** POST …/profiles/{id}/media — one authored row. */
export async function handleAddMedia(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }

  const existing = await deps.repo.getProfileForOrg(orgId, profileId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);
  const auth = await authorizeFor(env, actor, "write", profileId, deps, requestId);
  if (!auth.ok) return auth.response;

  const fields: Record<string, string[]> = {};
  const kind = typeof body.kind === "string" ? body.kind : "";
  if (kind === "screenshot") {
    // Named, not folded into "one of hero, gallery": the difference is the
    // whole of WC-3, and a maker who tried it should learn why.
    fields.kind = ["A screenshot is observed by the sweep, never uploaded"];
  } else if (!(AUTHORED_MEDIA_KINDS as readonly string[]).includes(kind)) {
    fields.kind = [`One of: ${AUTHORED_MEDIA_KINDS.join(", ")}`];
  }
  const alt = typeof body.alt === "string" ? body.alt.trim() : "";
  if (alt.length === 0) fields.alt = ["Alt text is required"];
  else if (alt.length > MEDIA_ALT_MAX) fields.alt = [`At most ${MEDIA_ALT_MAX} characters`];
  const position = typeof body.position === "number" ? body.position : NaN;
  if (!Number.isInteger(position) || position < 0) fields.position = ["A non-negative integer"];
  const ref = typeof body.ref === "string" ? body.ref : "";
  if (!parseMediaRef(ref)) fields.ref = ["A content reference the gateway produced"];
  const width = typeof body.width === "number" ? body.width : NaN;
  const height = typeof body.height === "number" ? body.height : NaN;
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    fields.dimensions = [
      `Between ${MEDIA_MIN_WIDTH}×${MEDIA_MIN_HEIGHT} and ${MEDIA_MAX_SIDE}×${MEDIA_MAX_SIDE}`,
    ];
  } else {
    // The gateway's rule, on the row: one function, so the two cannot
    // disagree about what a logo is (openproduct-studio OSD-3).
    const shape = mediaShapeRefusal(kind, width, height);
    if (shape) fields.dimensions = [MEDIA_REFUSALS[shape]];
  }
  if (Object.keys(fields).length > 0) {
    return errorResponse("validation_failed", "Validation failed", 422, requestId, { fields });
  }

  const id = (deps.generateId ?? generateId)();
  const candidate = authoredMedia({
    id,
    kind: kind as AuthoredMediaKind,
    ref,
    alt,
    width,
    height,
    position,
  });
  // A logo or a hero REPLACES the one in its slot (openproduct-studio OSD4),
  // so the one it replaces is not counted against it.
  const singleton = kind === "logo" || kind === "hero";
  const current = (await deps.repo.listMediaForProfile(profileId))
    .map(mediaFactOf)
    .filter((m) => !(singleton && m.value.kind === kind));
  const violations = mediaViolations([...current, candidate]);
  if (violations.length > 0) {
    return errorResponse("validation_failed", "Validation failed", 422, requestId, {
      fields: { media: violations },
    });
  }

  let stored = candidate;
  try {
    if (kind === "logo" || kind === "hero") {
      const row = await deps.repo.replaceAuthoredSingleton({
        id,
        profileId,
        kind,
        storageRef: ref,
        alt,
        width,
        height,
        position: 0,
      });
      stored = mediaFactOf(row) as typeof candidate;
    } else {
      await deps.repo.insertMedia({
        id,
        profileId,
        kind: kind as AuthoredMediaKind,
        storageRef: ref,
        alt,
        width,
        height,
        position,
      });
    }
  } catch (error) {
    // The column's word, when a race beat the check above: two uploads to
    // one slot in the same second. 409, so the form re-reads and re-offers.
    const message = error instanceof Error ? error.message : "";
    if (/product_media_slot|gallery/i.test(message)) {
      return errorResponse("conflict", "That slot was just taken", 409, requestId);
    }
    throw error;
  }

  await refreshCatalogue(deps, profileId);

  await deps.repo.appendAudit({
    id: (deps.generateId ?? generateId)(),
    orgId,
    profileId,
    actorType: actor.subjectType,
    actorId: actor.subjectId,
    type: "openproduct.media.added",
    description: `Added ${kind} media at position ${position}`,
    payload: { slug: existing.slug, kind, position, ref, width, height },
    requestId,
    occurredAt: (deps.now ?? (() => new Date()))().toISOString(),
  });

  return successResponse({ media: stored }, requestId, 201);
}

/** DELETE …/profiles/{id}/media/{mediaId} — the row. The object stays: it is
 *  content-addressed and may be somebody else's (see the contract). */
export async function handleRemoveMedia(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  mediaId: string,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  const existing = await deps.repo.getProfileForOrg(orgId, profileId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);
  const auth = await authorizeFor(env, actor, "write", profileId, deps, requestId);
  if (!auth.ok) return auth.response;

  const removed = await deps.repo.deleteMedia(profileId, mediaId);
  if (!removed) return errorResponse("not_found", "Not found", 404, requestId);

  await refreshCatalogue(deps, profileId);

  await deps.repo.appendAudit({
    id: (deps.generateId ?? generateId)(),
    orgId,
    profileId,
    actorType: actor.subjectType,
    actorId: actor.subjectId,
    type: "openproduct.media.removed",
    description: `Removed ${removed.kind} media`,
    payload: { slug: existing.slug, kind: removed.kind, position: removed.position, ref: removed.storageRef },
    requestId,
    occurredAt: (deps.now ?? (() => new Date()))().toISOString(),
  });

  return successResponse({ removed: true }, requestId);
}

/**
 * PATCH …/profiles/{id}/media/{mediaId} — `{ alt }` (openproduct-studio OSD6).
 *
 * The words under a picture, changed in place. Before this, alt text could be
 * fixed only by removing the image and uploading it again.
 */
export async function handleUpdateMedia(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  mediaId: string,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  const existing = await deps.repo.getProfileForOrg(orgId, profileId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);
  const auth = await authorizeFor(env, actor, "write", profileId, deps, requestId);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }
  const alt = typeof body.alt === "string" ? body.alt.trim() : "";
  if (alt.length === 0) {
    return errorResponse("validation_failed", "Validation failed", 422, requestId, {
      fields: { alt: ["Alt text is required"] },
    });
  }
  if (alt.length > MEDIA_ALT_MAX) {
    return errorResponse("validation_failed", "Validation failed", 422, requestId, {
      fields: { alt: [`At most ${MEDIA_ALT_MAX} characters`] },
    });
  }

  const row = await deps.repo.updateMediaAlt(profileId, mediaId, alt);
  if (!row) return errorResponse("not_found", "Not found", 404, requestId);
  await refreshCatalogue(deps, profileId);
  await deps.repo.appendAudit({
    id: (deps.generateId ?? generateId)(),
    orgId,
    profileId,
    actorType: actor.subjectType,
    actorId: actor.subjectId,
    type: "openproduct.media.described",
    description: `Changed the alt text of ${row.kind} media`,
    payload: { slug: existing.slug, kind: row.kind, position: row.position },
    requestId,
    occurredAt: (deps.now ?? (() => new Date()))().toISOString(),
  });
  return successResponse({ media: mediaFactOf(row) }, requestId);
}

/**
 * PUT …/profiles/{id}/media — `{ gallery: [id, …] }` (openproduct-studio OSD6).
 *
 * The gallery in the maker's order. The list must name every gallery row
 * exactly once — a reorder that could drop or duplicate an image would be a
 * delete wearing a different name.
 */
export async function handleReorderGallery(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  const existing = await deps.repo.getProfileForOrg(orgId, profileId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);
  const auth = await authorizeFor(env, actor, "write", profileId, deps, requestId);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }
  const ids = Array.isArray(body.gallery) ? body.gallery.filter((id): id is string => typeof id === "string") : [];
  const current = (await deps.repo.listMediaForProfile(profileId)).filter((m) => m.kind === "gallery");
  const known = new Set(current.map((m) => m.id));
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    return errorResponse("validation_failed", "Validation failed", 422, requestId, {
      fields: { gallery: ["Name every gallery image exactly once"] },
    });
  }

  const rows = await deps.repo.reorderGallery(profileId, ids);
  await refreshCatalogue(deps, profileId);
  await deps.repo.appendAudit({
    id: (deps.generateId ?? generateId)(),
    orgId,
    profileId,
    actorType: actor.subjectType,
    actorId: actor.subjectId,
    type: "openproduct.media.reordered",
    description: `Reordered ${rows.length} gallery images`,
    payload: { slug: existing.slug, gallery: ids },
    requestId,
    occurredAt: (deps.now ?? (() => new Date()))().toISOString(),
  });
  return successResponse({ media: rows.map(mediaFactOf) }, requestId);
}
