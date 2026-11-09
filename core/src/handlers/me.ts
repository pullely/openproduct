// The contributor surface (openproduct-home OH2): /internal/openproduct/me/…
//
// Authorized by the forwarded subject id, exactly like the maintainer door —
// this worker resolves no token (design.md §2; OPX-4: no IDENTITY_WORKER
// binding, asserted in CI). api-edge already ran the OI1 scope check, so a
// request that reaches here holds either full authority or the identity
// scope; both mean "this subject", which is the only authority these routes
// use.
//
// CONTRIBUTORS ARE PEOPLE. A service principal or workflow subject is refused
// outright: a bot with a contributor bio on a public page is a spam surface,
// not a feature.
//
// Everything authored here feeds a public host, so the OD2a boundary rule
// applies at the write: no email, refused rather than filtered at read time.
import type { ContributorProfile, ContributorApplication, MeOverlay } from "@openproduct/contracts";
import {
  DEFAULT_TRUST_LEVEL,
  claimRefusal,
  endorsementStateFor,
  parseHandle,
  parseOverlayIds,
  parseFollowKeys,
  parseOverlayPostIds,
  followKey,
  type FollowTarget,
  parseProfileLink,
  thumbnailOf,
  type MediaThumbnail,
} from "@openproduct/contracts";
import type {
  ApplicationRecord,
  ContributorRecord,
  OpenproductRepository,
  ProfileCardRecord,
} from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { orgPublicId, profilePublicId, projectPublicId, type Uuid } from "../ids.js";
import { publishEndorsementCounts } from "./endorsement-counts.js";
import { mediaFactOf, thumbnailsForSlugs } from "./media.js";

export interface MeHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "getContributor"
    | "upsertContributor"
    | "eraseSubject"
    | "exportSubject"
    | "listApplicationsBySubject"
    | "listProfilesMaintainedBy"
    | "listSavedPublicCards"
    | "saveProductBySlug"
    | "unsaveProductBySlug"
    | "overlayFor"
    // CG1 — the handle and the standing gate, for the contributor's own view.
    | "getActiveHandleForSubject"
    | "claimHandle"
    | "releaseHandle"
    | "getHandle"
    | "setProfileVisibility"
    // EN1 — the public act.
    | "getPublicProfileId"
    | "getProfileIdBySlug"
    | "endorse"
    | "withdrawEndorsement"
    | "getTrustLevel"
    // FL0 — the overlay's second bounded question, and the handle→subject
    // translation it needs to ask it in the page's own language.
    | "listFollowed"
    // DQ1 — which of the page's comments this visitor has upvoted.
    | "listPostVotesBy"
    // NF0 — the unread badge.
    | "countUnreadNotifications"
    | "getSubjectsForHandles"
    // openproduct-studio OSD3 — the tiles' logos: saved (public reads) and
    // the studio list (the maintainer's own rows, drafts included).
    | "listPublicMediaForSlugs"
    | "listMediaForProfiles"
  >;
  /** The moment an exit's kept rows are stamped with (the handle's release). */
  now?: () => Date;
  generateId?: () => string;
}

const MAX_DISPLAY_NAME = 120;
const MAX_BIO = 2000;
const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Only people have contributor surfaces. */
export function requireUserSubject(
  actor: ActorContext,
  requestId: string,
): Response | null {
  if (actor.subjectType !== "user") {
    return errorResponse("forbidden", "Contributors are people — this credential is not one", 403, requestId);
  }
  return null;
}

function contributorView(
  record: ContributorRecord,
  extras: { handle: string | null; hasStanding: boolean },
): ContributorProfile {
  return {
    subjectId: record.subjectId,
    displayName: record.displayName,
    bio: record.bio,
    // CG1 — the controls, for the contributor's own eyes. `hasStanding` is
    // sent so their page can tell them WHY their profile is not visible
    // rather than leaving them to guess at a toggle that does nothing.
    handle: extras.handle,
    profilePublic: record.profilePublic,
    openToProject: record.openToProject,
    githubUrl: record.githubUrl,
    siteUrl: record.siteUrl,
    publishedAt: record.publishedAt,
    hasStanding: extras.hasStanding,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** CG-2's second gate, for the contributor's own view of themselves. */
async function profileExtras(
  deps: MeHandlerDeps,
  subjectId: string,
): Promise<{ handle: string | null; hasStanding: boolean }> {
  const [handle, listings] = await Promise.all([
    deps.repo.getActiveHandleForSubject(subjectId),
    deps.repo.listProfilesMaintainedBy(subjectId),
  ]);
  return {
    handle: handle?.handle ?? null,
    hasStanding: listings.some((listing) => listing.visibility === "public"),
  };
}

function applicationView(record: ApplicationRecord): ContributorApplication {
  return {
    id: record.id,
    profileId: record.profileId,
    roleOpeningId: record.roleOpeningId,
    requestRef: record.jrRequestRef,
    status: record.status,
    createdAt: record.createdAt,
    // The joined product identity, for the contributor's own list. Null when
    // the join could not resolve (should not happen — the FK cascades — but
    // the shape never lies about what it read).
    productSlug: record.productSlug ?? null,
    productTagline: record.productTagline ?? null,
  };
}

/** GET /internal/openproduct/me — the contributor's own presence, or null. */
export async function handleGetMe(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const record = await deps.repo.getContributor(actor.subjectId);
  return successResponse(
    {
      contributor: record ? contributorView(record, await profileExtras(deps, actor.subjectId)) : null,
      subjectId: actor.subjectId,
    },
    requestId,
    200,
  );
}

/** PUT /internal/openproduct/me — author (or re-author) the presence. */
export async function handleUpsertMe(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError(requestId, { body: ["Must be a valid JSON object"] });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return validationError(requestId, { body: ["Must be a JSON object"] });
  }
  const obj = body as Record<string, unknown>;

  const displayName = normalizeAuthored(obj.displayName);
  if (displayName === INVALID) {
    return validationError(requestId, { displayName: ["Must be a string or null"] });
  }
  if (displayName && displayName.length > MAX_DISPLAY_NAME) {
    return validationError(requestId, { displayName: [`Must be at most ${MAX_DISPLAY_NAME} characters`] });
  }
  // This string renders on a public host. An email here would be a leak, so
  // it is refused at the boundary — the OD2a published_maintainers rule.
  if (displayName && displayName.includes("@")) {
    return validationError(requestId, { displayName: ["A display name, never an email"] });
  }

  const bio = normalizeAuthored(obj.bio);
  if (bio === INVALID) {
    return validationError(requestId, { bio: ["Must be a string or null"] });
  }
  if (bio && bio.length > MAX_BIO) {
    return validationError(requestId, { bio: [`Must be at most ${MAX_BIO} characters`] });
  }

  // CG1 — the two authored links. `undefined` leaves each unchanged; an
  // empty string CLEARS it, because clearing a link is a thing people do and
  // making somebody delete their profile to remove one would be absurd.
  //
  // `parseProfileLink` refuses anything that is not an https URL, and refuses
  // a `githubUrl` that is not on github.com: a field labelled `githubUrl`
  // that renders somewhere else is a mislabelled link on a page a stranger is
  // reading, which is the shape of a phishing link whoever typed it.
  let githubUrl: string | null | undefined;
  if (obj.githubUrl !== undefined) {
    const checked = parseProfileLink(obj.githubUrl === null ? "" : String(obj.githubUrl), "github");
    if (!checked.ok) return validationError(requestId, { githubUrl: [checked.message] });
    githubUrl = checked.url;
  }
  let siteUrl: string | null | undefined;
  if (obj.siteUrl !== undefined) {
    const checked = parseProfileLink(obj.siteUrl === null ? "" : String(obj.siteUrl), "site");
    if (!checked.ok) return validationError(requestId, { siteUrl: [checked.message] });
    siteUrl = checked.url;
  }

  let openToProject: boolean | undefined;
  if (obj.openToProject !== undefined) {
    if (typeof obj.openToProject !== "boolean") {
      return validationError(requestId, { openToProject: ["Must be a boolean"] });
    }
    openToProject = obj.openToProject;
  }

  const record = await deps.repo.upsertContributor({
    subjectId: actor.subjectId,
    displayName,
    bio,
    ...(githubUrl !== undefined ? { githubUrl } : {}),
    ...(siteUrl !== undefined ? { siteUrl } : {}),
    ...(openToProject !== undefined ? { openToProject } : {}),
  });
  return successResponse(
    { contributor: contributorView(record, await profileExtras(deps, actor.subjectId)) },
    requestId,
    200,
  );
}

/** GET /internal/openproduct/me/applications — the snapshot, as stored.
 *
 *  Since OX5 the snapshot heals by S6 WEBHOOK, not by a per-request JR read:
 *  the platform pushes every lifecycle change over the seam (see
 *  handlers/seam-events.ts), so this list serves what it has — stale-but-
 *  honest between deliveries, exactly OH-4's posture, with no binding left to
 *  ask live. */
export async function handleListMyApplications(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const records = await deps.repo.listApplicationsBySubject(actor.subjectId);
  return successResponse({ applications: records.map(applicationView) }, requestId, 200);
}

/** GET /internal/openproduct/me/listings — every listing this subject
 *  maintains, across workspaces (OX5). The maintainer landing's whole input:
 *  answered from `listing_maintainers` alone, which since the authority
 *  handover IS the fact of who maintains what — no org enumeration, no
 *  platform read. */
export async function handleListMyListings(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const profiles = await deps.repo.listProfilesMaintainedBy(actor.subjectId);
  // openproduct-studio OSD3 — each listing's logo, ONE read keyed by profile
  // id rather than slug and without the public gate: this is the maker's
  // own list, and a draft's logo is theirs to see.
  const media = await deps.repo.listMediaForProfiles(profiles.map((p) => p.id));
  return successResponse(
    {
      listings: profiles.map((p) => ({
        id: profilePublicId(p.id as Uuid),
        orgId: orgPublicId(p.orgId as Uuid),
        projectId: projectPublicId(p.projectId as Uuid),
        slug: p.slug,
        visibility: p.visibility,
        tagline: p.tagline,
        publishedAt: p.publishedAt,
        reviewedAt: p.reviewedAt,
        repoVisibility: p.repoVisibility,
        workspaceLinkedAt: p.linkGrant?.grantedAt ?? null,
        thumbnail: thumbnailOf((media.get(p.id) ?? []).map(mediaFactOf)),
      })),
    },
    requestId,
    200,
  );
}

// (POST /me/applications — the console join door's interim record path, S11 —
// retired at OX5b: the S6 `join_request.submitted` webhook upsert is the sole
// record path, and it resolves the door through the same public-listing
// filter this handler did. See handlers/seam-events.ts.)

/** GET /internal/openproduct/me/export — everything the subject may take
 *  with them (CS3). One document from the subject registry's `rows` columns
 *  and the maintainer projection of their listings, and nothing else: not
 *  anybody else's posts (replies to theirs included), not who else endorsed
 *  anything, not a moderation act about them (a record they may read at
 *  /transparency like anyone, and not theirs to take — CS-5), and no email,
 *  because there is none (I3). The exit (`DELETE /me`) reads the same list,
 *  so it removes exactly the `theirs` tables this hands over and keeps the
 *  rest without them. */
export async function handleExportMe(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const document = await deps.repo.exportSubject(actor.subjectId, (deps.now ?? (() => new Date()))().toISOString());
  return successResponse(document, requestId, 200);
}

/** DELETE /internal/openproduct/me — the subject's own exit (OX5c; CS2).
 *
 *  Everything subject-keyed goes together, by the subject registry's one
 *  list: every row that is THEIRS is deleted (the presence, the applications,
 *  the saved list, the follows, the votes, the sessions, the roster edges,
 *  the curation…), every row they appear in as somebody else's context is
 *  kept with the subject replaced (a post in a conversation that stands, a
 *  handle released and never re-issued), and every RECORD is kept the same
 *  way (CS-5: an act about them is not theirs to take). What does NOT go:
 *  the platform's join requests (JR's records of asks made under platform
 *  authority, exactly as teardown §5 reasons about granted memberships) and
 *  any listing the subject maintains (a listing belongs to its workspace,
 *  not to one maintainer). Idempotent: a second exit answers the same 200
 *  with nothing counted. */
export async function handleDeleteMe(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const erased = await deps.repo.eraseSubject(actor.subjectId, (deps.now ?? (() => new Date()))().toISOString());
  return successResponse(
    { deleted: erased.deleted + erased.anonymised > 0, rows: { deleted: erased.deleted, anonymised: erased.anonymised } },
    requestId,
    200,
  );
}

/** GET /internal/openproduct/me/saved — public cards only, re-asserted in SQL. */
export async function handleListSaved(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  const cards = await deps.repo.listSavedPublicCards(actor.subjectId);
  // openproduct-studio OSD3 — the saved rows' logos, one read.
  const thumbnailFor = await thumbnailsForSlugs(deps.repo, cards.map((card) => card.slug));
  return successResponse(
    { products: cards.map((card) => savedCardView(card, thumbnailFor(card.slug))) },
    requestId,
    200,
  );
}

/** PUT /internal/openproduct/me/saved — save by slug. Only a PUBLIC listing
 *  can be saved (the repo resolves the slug through the visibility filter), so
 *  this route cannot be used to probe drafts: unknown and private answer
 *  identically. */
export async function handleSaveProduct(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError(requestId, { body: ["Must be a valid JSON object"] });
  }
  const slug = (body as Record<string, unknown> | null)?.slug;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return validationError(requestId, { slug: ["A product slug is required"] });
  }
  const saved = await deps.repo.saveProductBySlug(actor.subjectId, slug);
  if (!saved) return errorResponse("not_found", "Not found", 404, requestId);
  return successResponse({ saved: true }, requestId, 200);
}

/** DELETE /internal/openproduct/me/saved/{slug} — works even after the
 *  listing went private or away: a bookmark you cannot remove is a bug. */
export async function handleUnsaveProduct(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  slug: string,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  if (!SLUG_RE.test(slug)) return errorResponse("not_found", "Not found", 404, requestId);
  const removed = await deps.repo.unsaveProductBySlug(actor.subjectId, slug);
  return successResponse({ removed }, requestId, 200);
}

function savedCardView(
  card: ProfileCardRecord,
  thumbnail: MediaThumbnail | null,
): {
  slug: string;
  tagline: string | null;
  stack: string[];
  roleOpeningCount: number;
  publishedAt: string | null;
  thumbnail: MediaThumbnail | null;
} {
  // The PUBLIC card projection, composed literally (the OD3 discipline) — a
  // saved list is still a public surface's data, never an internal row.
  return {
    slug: card.slug,
    tagline: card.tagline,
    stack: card.stack,
    roleOpeningCount: card.roleOpeningCount,
    publishedAt: card.publishedAt,
    thumbnail,
  };
}

const INVALID = Symbol("invalid");

function normalizeAuthored(value: unknown): string | null | typeof INVALID {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return INVALID;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * GET /internal/openproduct/me/overlay?ids=… — the personalisation overlay
 * (openproduct-commons XP2).
 *
 * THE ONLY PER-SUBJECT READ THAT REACHES A PUBLIC PAGE. Everything about its
 * shape follows from that, and the constraints are stated on `MeOverlay`
 * rather than restated here — but two are worth naming at the handler, since
 * this is where they could most easily be broken by a future edit:
 *
 *   - IT RETURNS NO CONTENT. Not a tagline, not a name, not a timestamp. If a
 *     page needs to render something, it came from the cached document; this
 *     answers only which of that document is the visitor's. Adding a
 *     renderable field here would create a second rendering path for the same
 *     product, one cached and one not, and they would drift.
 *
 *   - IT IS ALLOWED TO FAIL. Every caller treats a non-200 as "no overlay" and
 *     renders the anonymous page, which is always correct. So this handler
 *     never needs to degrade gracefully in some bespoke way — it either
 *     answers or it doesn't, and not answering is a state the surface already
 *     handles on every anonymous page view.
 *
 * A malformed or over-long `ids` is truncated rather than refused
 * (`parseOverlayIds`): the overlay is decoration, and a 400 that blanks a
 * visitor's own state is a worse outcome than a partial answer.
 */
export async function handleGetOverlay(
  _env: Env,
  url: URL,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;

  const ids = parseOverlayIds(url.searchParams.get("ids"));
  // FL0 — a SECOND bounded question on the same request. A topic page holds
  // one follow key and no slugs; a product page holds a slug and no follow
  // keys; the topic index holds many keys. One parameter each, both bounded by
  // what the page rendered, and one round trip for all of it.
  const followKeys = parseFollowKeys(url.searchParams.get("follows"));
  // DQ1 — the post ids the page rendered. Bounded by what it drew, like
  // every other overlay question.
  const postIds = parseOverlayPostIds(url.searchParams.get("posts"));
  // Four reads, one round trip: the counts, the follows, and — for the account
  // menu's identity block — the visitor's own handle and whether their page is
  // on.
  const [record, handle, contributor, followed, postVotes, unread] = await Promise.all([
    deps.repo.overlayFor(actor.subjectId, ids),
    deps.repo.getActiveHandleForSubject(actor.subjectId),
    deps.repo.getContributor(actor.subjectId),
    // A `person` key is a HANDLE on the wire and a subject id in the table, so
    // asking the table directly with a handle would answer nothing. FL0's
    // overlay read therefore takes what the page sent and core resolves the
    // person keys first — see `resolveFollowKeys`.
    resolveFollowKeys(deps, actor.subjectId, followKeys),
    // DQ1 — no translation needed: a post id is the same on the wire and in
    // the table, unlike a `person` follow key.
    postIds.length === 0
      ? Promise.resolve([] as string[])
      : deps.repo.listPostVotesBy(actor.subjectId, postIds),
    // NF0 — the badge. One integer, always asked for: it is a fact about the
    // READER rather than about anything the page rendered, so it has no bound
    // to take from the page — and a second fetch for one number on every page
    // would double the personalisation traffic of the whole site.
    deps.repo.countUnreadNotifications(actor.subjectId),
  ]);
  const overlay: MeOverlay = {
    saved: record.savedSlugs,
    endorsed: record.endorsedSlugs,
    savedCount: record.savedCount,
    requests: record.requestCount,
    listings: record.listingCount,
    handle: handle?.handle ?? null,
    profilePublic: contributor?.profilePublic === true,
    follows: followed,
    postVotes,
    unread,
  };
  return successResponse({ overlay }, requestId, 200);
}

/**
 * Which of the asked-about targets this subject follows, as the keys the page
 * sent (FL0).
 *
 * THE TRANSLATION LIVES HERE because the wire and the table disagree on
 * purpose: a `person` target is a HANDLE in a URL — the public address, and
 * the only name a page has — and a subject id in the row. Resolving handles in
 * one batched read and mapping the answer back to the keys the page asked
 * about keeps the internal identifier off every public surface, and keeps this
 * from becoming a way to ask "does this subject id exist".
 *
 * A key that resolves to nothing is simply not in the answer — the same
 * silence `parseOverlayIds` gives a malformed slug, and for the same reason:
 * the keys come from whatever the page rendered.
 */
async function resolveFollowKeys(
  deps: MeHandlerDeps,
  subjectId: string,
  targets: readonly FollowTarget[],
): Promise<string[]> {
  if (targets.length === 0) return [];
  // handle → the key the page used, so the answer speaks the page's language.
  const byHandle = new Map<string, string>();
  for (const t of targets) {
    if (t.kind === "person") byHandle.set(t.value, followKey(t));
  }
  const handles = await deps.repo.getSubjectsForHandles([...byHandle.keys()]);
  const subjectToKey = new Map<string, string>();
  for (const [handle, subject] of handles) {
    const key = byHandle.get(handle);
    if (key) subjectToKey.set(subject, key);
  }

  const asked = [
    ...targets
      .filter((t) => t.kind === "topic")
      .map((t) => ({ kind: "topic" as const, target: t.value })),
    ...[...subjectToKey.keys()].map((subject) => ({ kind: "person" as const, target: subject })),
  ];
  const rows = await deps.repo.listFollowed(subjectId, asked);
  return rows.map((row) =>
    row.kind === "topic" ? `topic:${row.target}` : (subjectToKey.get(row.target) ?? ""),
  ).filter((key) => key.length > 0);
}

/**
 * PUT /internal/openproduct/me/handle — claim, or release, a handle (CG0/CG1).
 *
 * `{ handle: "ada" }` claims; `{ handle: null }` releases.
 *
 * TWO CHECKS, AND THEY ARE DELIBERATELY SEPARATE. `parseHandle` answers "is
 * this a handle" without a database; `claimRefusal` answers "may THIS person
 * have it" given what the database holds. Splitting them is what lets a
 * refusal arrive with a REASON — "reserved", "taken", "released" — instead of
 * a constraint violation, and "invalid handle" is the failure mode the whole
 * contract exists to prevent.
 *
 * THE DATABASE STILL DECIDES. `claimHandle` re-asserts every rule in SQL, so
 * two people submitting the same handle in the same second cannot both win.
 * The contract decides WHY a claim is refused; the statement decides WHO.
 *
 * RELEASING IS PERMANENT AND SAYS SO. The row survives as a tombstone and
 * nobody is ever given that handle again — including the person releasing it.
 * "I released it by mistake" and "I am impersonating whoever released it" are
 * indistinguishable afterwards, and only one of them is safe to be wrong
 * about.
 */
export async function handleSetHandle(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError(requestId, { body: ["Must be a valid JSON object"] });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return validationError(requestId, { body: ["Must be a JSON object"] });
  }
  const raw = (body as Record<string, unknown>).handle;

  if (raw === null) {
    const released = await deps.repo.releaseHandle(actor.subjectId, new Date().toISOString());
    // Releasing what you do not hold is a no-op, not an error: the caller's
    // intent ("I have no handle") is satisfied either way.
    return successResponse({ handle: null, released: released?.handle ?? null }, requestId, 200);
  }

  if (typeof raw !== "string") {
    return validationError(requestId, { handle: ["Must be a string, or null to release"] });
  }

  const parsed = parseHandle(raw);
  if (!parsed.ok) return validationError(requestId, { handle: [parsed.message] });

  const state = await deps.repo.getHandle(parsed.handle);
  const allowed = claimRefusal(parsed.handle, state, actor.subjectId);
  if (!allowed.ok) return validationError(requestId, { handle: [allowed.message] });

  const claimed = await deps.repo.claimHandle(parsed.handle, actor.subjectId, new Date().toISOString());
  if (!claimed) {
    // The statement refused what the contract allowed, which means the row
    // changed between the two reads. Re-read and answer with the real reason
    // rather than a generic conflict.
    const current = await deps.repo.getHandle(parsed.handle);
    const why = claimRefusal(parsed.handle, current, actor.subjectId);
    return validationError(requestId, {
      handle: [why.ok ? "That handle could not be claimed — try again." : why.message],
    });
  }
  return successResponse({ handle: claimed.handle }, requestId, 200);
}

/**
 * PUT /internal/openproduct/me/profile-visibility — the opt-in (CG-2).
 *
 * `{ public: true }` publishes; `{ public: false }` withdraws.
 *
 * TWO PRECONDITIONS FOR PUBLISHING, AND ONLY ONE OF THEM IS THIS ENDPOINT'S:
 * a handle (there is no page without an address) and STANDING (CG-2's
 * anti-spam property — a profile exists only for somebody on a listed
 * product). Standing is re-checked by the public read on every request, so
 * this refusal is a courtesy that tells the person WHY rather than letting
 * them flip a toggle that appears to do nothing.
 *
 * WITHDRAWING IS ALWAYS ALLOWED, unconditionally. Taking your own page down
 * is not a privilege, and gating it behind the same checks as putting it up
 * would trap somebody whose standing lapsed with a page they cannot remove.
 */
export async function handleSetProfileVisibility(
  _env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError(requestId, { body: ["Must be a valid JSON object"] });
  }
  const wanted = (body as Record<string, unknown> | null)?.public;
  if (typeof wanted !== "boolean") {
    return validationError(requestId, { public: ["Must be a boolean"] });
  }

  if (wanted) {
    const extras = await profileExtras(deps, actor.subjectId);
    if (!extras.handle) {
      return validationError(requestId, {
        public: ["Claim a handle first — a profile needs an address before it can be public."],
      });
    }
    if (!extras.hasStanding) {
      return validationError(requestId, {
        public: [
          "Profiles are for people on a listed product. Publish a listing you maintain, and this becomes available.",
        ],
      });
    }
  }

  const record = await deps.repo.setProfileVisibility(
    actor.subjectId,
    wanted,
    new Date().toISOString(),
  );
  if (!record) {
    return validationError(requestId, {
      public: ["Write your name or bio first — there is nothing to publish yet."],
    });
  }
  return successResponse(
    { contributor: contributorView(record, await profileExtras(deps, actor.subjectId)) },
    requestId,
    200,
  );
}

/**
 * PUT /internal/openproduct/me/endorsements — endorse (openproduct-commons EN1).
 * DELETE /internal/openproduct/me/endorsements/{slug} — withdraw.
 *
 * THE PUBLIC ACT. Its private counterpart is `/me/saved`, and the two are
 * deliberately separate endpoints over separate tables (OPC-3, EN-1) — the
 * day they share a handler is the day a promise made in `1250` quietly stops
 * being true.
 *
 * ANONYMOUS IS REFUSED AT THE GATEWAY, NOT HERE. This handler never sees an
 * unauthenticated request: `/v1/openproduct/me/…` is on the authenticated
 * plane, which resolves a subject before any of this code is reachable. That
 * is EN-2's "never anonymous" enforced by routing rather than by a check
 * somebody could forget — an anonymous vote is an unbounded vote.
 *
 * ELIGIBILITY FROM TS1, AND IT RECORDS RATHER THAN REFUSES. A subject below
 * the trust floor endorses `pending`: the act happens, the row exists, and it
 * simply does not count yet. Refusing the click would throw away a newcomer's
 * honest gesture and teach them the button is broken.
 *
 * IDEMPOTENT. Endorsing twice is a no-op; withdrawing and re-endorsing reuses
 * the row. The key is the (listing, subject) pair, so there is no state in
 * which one person has endorsed one listing twice.
 */
export async function handleEndorse(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  slug: string,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;

  // TS2 — the slug arrives in the PATH rather than the body, so the gateway
  // can bound endorsements per LISTING without buffering a request body it
  // otherwise streams straight through.
  if (!SLUG_RE.test(slug)) return errorResponse("not_found", "Not found", 404, requestId);

  const profileId = await deps.repo.getPublicProfileId(slug);
  // Unknown and unpublished answer identically — resolving one and refusing
  // the other would make this an existence oracle for drafts.
  if (!profileId) return errorResponse("not_found", "Not found", 404, requestId);

  const level = (await deps.repo.getTrustLevel(actor.subjectId))?.level ?? DEFAULT_TRUST_LEVEL;
  const state = endorsementStateFor(level);

  const record = await deps.repo.endorse(profileId, actor.subjectId, state, new Date().toISOString());
  // EN2 — recompute the ONE listing this touched, so the number a person just
  // moved is right on the next read rather than at the next sweep. Never
  // throws into this path: the act is the thing they did, the number is our
  // bookkeeping, and losing a click to a bad metrics insert is the wrong
  // trade. A stale total becomes a dash within the hour and the sweep fixes
  // it.
  await publishEndorsementCounts(deps.repo as never, profileId, Date.now());
  return successResponse(
    {
      endorsement: {
        slug,
        state: record.state,
        createdAt: record.createdAt,
        withdrawnAt: record.withdrawnAt,
      },
    },
    requestId,
    200,
  );
}

export async function handleWithdrawEndorsement(
  _env: Env,
  requestId: string,
  actor: ActorContext,
  slug: string,
  deps: MeHandlerDeps,
): Promise<Response> {
  const refusal = requireUserSubject(actor, requestId);
  if (refusal) return refusal;
  if (!SLUG_RE.test(slug)) return errorResponse("not_found", "Not found", 404, requestId);

  // NOT through the visibility filter, deliberately — the mirror of the
  // unsave rule. An endorsement you cannot withdraw because the listing went
  // private is a public act you are stuck with, and withdrawing discloses
  // nothing.
  const profileId = await deps.repo.getProfileIdBySlug(slug);
  if (!profileId) return errorResponse("not_found", "Not found", 404, requestId);

  const withdrawn = await deps.repo.withdrawEndorsement(
    profileId,
    actor.subjectId,
    new Date().toISOString(),
  );
  // EN2 — recompute only when something actually moved. Withdrawing what you
  // never gave changed no total, and writing a metric row for it would put a
  // fresh `observedAt` on an unchanged number, which is a claim that we
  // looked when nothing had happened.
  if (withdrawn !== null) {
    await publishEndorsementCounts(deps.repo as never, profileId, Date.now());
  }
  // Withdrawing what you never gave is a no-op, not an error: the caller's
  // intent ("I do not endorse this") is satisfied either way.
  return successResponse({ withdrawn: withdrawn !== null }, requestId, 200);
}
