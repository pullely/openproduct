// The maintainer door (saas-openproduct OD2).
//
// Authenticated, policy-gated, audited writes over the `openproduct` schema.
// Every handler here answers to an actor api-edge resolved; none of them is
// reachable with the flag off, and none of them shares a code path with the
// public read that OD3 adds — the two doors share a database connection and
// nothing else (design.md §5).
//
// Two invariants worth stating once, because every handler below relies on
// them:
//
//   1. A profile is addressed by (org, profile). The org comes from the URL
//      and is authorized against the caller's memberships; the profile is
//      fetched with `getProfileForOrg`, which is org-scoped in SQL. Guessing
//      another workspace's profile id yields 404, not somebody else's data.
//   2. Publishing is not an update. It is its own action, its own permission,
//      its own audit event, and its own set of preconditions — because "the
//      moment this became public" is the question the audit trail must be able
//      to answer later.

import type {
  MaintainerInput,
  OpenproductRepository,
  ProfileRecord,
  RoleOpeningRecord,
  StoredLinkGrant,
} from "@openproduct/db";
import {
  DEFAULT_TRUST_LEVEL,
  canonicalise,
  facet,
  installLineRefusal,
  normaliseInstallLine,
  parseHandle,
  promotionAfterReview,
  publishDecision,
  type PublishBlocker,
  type PublishDecision,
} from "@openproduct/contracts";
import { canonicalDocBody, docDigest } from "@openproduct/db/content";

import type { ActorContext } from "../authorize.js";
import {
  listingActionAllowed,
  parseOperators,
  type ListingAction,
} from "../authorize.js";
import { readRepoObservation } from "../repo-observation.js";
import { verifyListingGrant } from "../seam.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import {
  generateId,
  orgPublicId,
  parseProjectPublicId,
  profilePublicId,
  projectPublicId,
  roleOpeningPublicId,
  type Uuid,
} from "../ids.js";

export interface ProfileHandlerDeps {
  repo: OpenproductRepository;
  now?: () => Date;
  generateId?: () => Uuid;
}

const MAX_SLUG = 64;
const MAX_TAGLINE = 200;
const MAX_PITCH = 20_000;
const MAX_STACK_TAGS = 12;
const MAX_STACK_TAG = 32;
const MAX_TITLE = 120;
const MAX_MAINTAINERS = 50;

/**
 * A slug is the public URL segment, so it is validated to the narrowest thing
 * that can appear in one: lowercase, digits, single hyphens, no leading or
 * trailing hyphen. Deliberately stricter than "what Postgres would store" —
 * this string ends up in `openproduct.live/<slug>` and in other people's links.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Reserved at the boundary rather than in the database (OD-M): a global slug
 * namespace on a multi-tenant platform lets any workspace take any name, and
 * the console's own route words must not become project URLs.
 */
const RESERVED_SLUGS = new Set([
  "about", "account", "admin", "api", "app", "auth", "billing", "blog", "console",
  "create", // the founder funnel's form page on the public host
  "dashboard", "docs", "favicon", "help", "internal", "join", "legal", "login",
  "logout",
  "me", // the contributor home (OH2) — a product slugged "me" could never render
  "new", "oauth", "openproduct", "orunbase", "pricing", "privacy", "projects",
  "robots", "root", "security", "settings", "signup", "sitemap", "start",
  "static", "status", "support", "terms", "www", "you",
]);

function httpsUrl(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || value.length === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  // https only: a listing's links are printed on a public page, and http is a
  // downgrade a visitor cannot see coming.
  return parsed.protocol === "https:" ? parsed.toString() : undefined;
}

function parseStack(raw: unknown, fields: Record<string, string[]>): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_STACK_TAGS) {
    fields.stack = [`At most ${MAX_STACK_TAGS} tags`];
    return undefined;
  }
  const tags: string[] = [];
  for (const tag of raw) {
    if (typeof tag !== "string" || tag.length === 0 || tag.length > MAX_STACK_TAG) {
      fields.stack = [`Each tag is 1–${MAX_STACK_TAG} characters`];
      return undefined;
    }
    tags.push(tag);
  }
  return tags;
}


/**
 * An ASSIGNED facet value (CT1). Single-valued, closed vocabulary.
 *
 * Three answers, and all three are meaningful:
 *   undefined  the field was not in the body — leave it as it is
 *   null       the maintainer cleared it — "we do not answer this", which is
 *              not the same as never having been asked
 *   a value    it resolved against the vocabulary
 *
 * A value that does NOT resolve is refused rather than stored, because unlike
 * `stack` these facets have no authored half to fall back to: an unrecognised
 * category would be a bucket of one that no reader can filter by. The refusal
 * names the vocabulary, so the maintainer can pick.
 */
function parseFacet(
  facetId: "category" | "hosting" | "pricing",
  raw: unknown,
  fields: Record<string, string[]>,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") {
    fields[facetId] = ["Must be a string, or null to clear"];
    return undefined;
  }
  const resolved = canonicalise(facetId, raw);
  if (resolved === null) {
    const values = facet(facetId)?.values.map((v) => v.value).join(", ") ?? "";
    fields[facetId] = [`Must be one of: ${values}`];
    return undefined;
  }
  return resolved;
}

/** The maintainer-facing shape. Never the public projection — that is OD3's. */
const MAX_COMPONENTS = 50;
const MAX_COMPONENT_NAME = 100;
const MAX_COMPONENT_KIND = 40;

/** Parse and bound the OH4 publish body. Null = publish no snapshot (the
 *  default, and the shape of every pre-OH4 caller); a Response = refusal. */
async function componentsFromRequest(
  request: Request,
  requestId: string,
): Promise<Array<{ name: string; kind: string | null }> | null | Response> {
  let body: unknown = null;
  try {
    const text = await request.text();
    if (text.trim().length === 0) return null;
    body = JSON.parse(text);
  } catch {
    return validationError(requestId, { body: ["Must be a valid JSON object"] });
  }
  const raw = (body as { components?: unknown } | null)?.components;
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length > MAX_COMPONENTS) {
    return validationError(requestId, { components: [`Must be a list of at most ${MAX_COMPONENTS}`] });
  }
  const out: Array<{ name: string; kind: string | null }> = [];
  for (const entry of raw) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (!name || name.length > MAX_COMPONENT_NAME) {
      return validationError(requestId, { components: ["Each entry needs a name (\u2264100 chars)"] });
    }
    // The same boundary rule as every authored public field: no email.
    if (name.includes("@")) {
      return validationError(requestId, { components: ["A component name, never an email"] });
    }
    const kind = typeof e.kind === "string" && e.kind.trim().length > 0 ? e.kind.trim() : null;
    if (kind && kind.length > MAX_COMPONENT_KIND) {
      return validationError(requestId, { components: [`kind must be \u2264${MAX_COMPONENT_KIND} chars`] });
    }
    out.push({ name, kind });
  }
  return out.length > 0 ? out : null;
}

function toMaintainerProfile(
  profile: ProfileRecord,
  openings: RoleOpeningRecord[],
  maintainers: Array<{ subjectId: string; roleLabel: string | null }>,
  // openproduct-studio OSD7 — subject → ACTIVE handle, from
  // `listMaintainerHandles`. Only the editor's read asks for it (the studio
  // pre-fills its People step from that read); every write answer passes
  // nothing and says `null`, which the studio never reads back.
  handles: ReadonlyMap<string, string> = new Map(),
) {
  return {
    id: profilePublicId(profile.id),
    projectId: projectPublicId(profile.projectId),
    slug: profile.slug,
    visibility: profile.visibility,
    tagline: profile.tagline,
    installLine: profile.installLine,
    pitch: profile.pitchBody,
    pitchDigest: profile.pitchDigest,
    stack: profile.stack,
    // CT1 — the maintainer sees BOTH halves: what they wrote, and what of it
    // the vocabulary recognised. That is the whole facet picker's feedback
    // loop, and it is why the console does not have to guess.
    stackCanonical: profile.stackCanonical,
    category: profile.category,
    hosting: profile.hosting,
    pricing: profile.pricing,
    repoUrl: profile.repoUrl,
    liveUrl: profile.liveUrl,
    repoVisibility: profile.repoVisibility,
    repoLicence: profile.repoLicence,
    repoCheckedAt: profile.repoCheckedAt,
    // IN2 — the maintainer projection carries the observation so the studio
    // can show it BESIDE what was authored. It is deliberately not on the
    // public projection: rendering observed-vs-authored in public is PV0's
    // milestone and its own design question.
    repoName: profile.repoName,
    repoDescription: profile.repoDescription,
    repoTopics: profile.repoTopics,
    reviewedAt: profile.reviewedAt,
    publishedAt: profile.publishedAt,
    components: profile.components,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    // OX5 — when the listing was linked to its workspace (the stored grant's
    // grantedAt), or null for a pre-seam listing that still needs the link
    // flow. Presence is the fact the console needs; the grant's contents stay
    // server-side.
    workspaceLinkedAt: profile.linkGrant?.grantedAt ?? null,
    maintainers: maintainers.map((m) => ({
      subjectId: m.subjectId,
      displayName: null,
      roleLabel: m.roleLabel,
      handle: handles.get(m.subjectId) ?? null,
    })),
    roleOpenings: openings.map((o) => ({
      id: roleOpeningPublicId(o.id),
      title: o.title,
      description: o.description,
      commitment: o.commitment,
      status: o.status,
      joinLinkRef: o.joinLinkRef,
    })),
  };
}

/**
 * Resolve the caller's authority for one LISTING (OX4 — the authority
 * handover): the answer comes from openproduct's own `listing_maintainers`
 * table plus the operator allowlist, never from the platform. Also returns
 * `operator` so a handler can answer a second question (may this person
 * review?) without a second read.
 */
export async function authorizeFor(
  env: Env,
  actor: ActorContext,
  action: ListingAction,
  profileId: Uuid,
  deps: ProfileHandlerDeps,
  requestId: string,
): Promise<{ ok: true; operator: boolean } | { ok: false; response: Response }> {
  const operator = parseOperators(env.OPENPRODUCT_OPERATORS).has(actor.subjectId);
  const role = await deps.repo.getListingRole(profileId, actor.subjectId);
  if (!listingActionAllowed(action, role, operator)) {
    // 404, not 403 — see authorize.ts.
    return { ok: false, response: errorResponse("not_found", "Not found", 404, requestId) };
  }
  return { ok: true, operator };
}

/** Fire-and-forget-shaped, but awaited: an unaudited mutation is not
 *  acceptable here. LOCAL since OX5c — `openproduct.audit_log`, the context's
 *  own trail, replacing the platform events write (the last platform-schema
 *  write this worker made). Same type vocabulary; openproduct owns it now. */
async function audit(
  deps: ProfileHandlerDeps,
  input: {
    orgId: string;
    profile: ProfileRecord;
    type: string;
    actor: ActorContext;
    requestId: string;
    description: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  await deps.repo.appendAudit({
    id: (deps.generateId ?? generateId)(),
    orgId: input.orgId as Uuid,
    profileId: input.profile.id as Uuid,
    actorType: input.actor.subjectType,
    actorId: input.actor.subjectId,
    type: input.type,
    description: input.description,
    payload: {
      slug: input.profile.slug,
      visibility: input.profile.visibility,
      ...(input.payload ?? {}),
    },
    requestId: input.requestId,
    occurredAt: now.toISOString(),
  });
}


/**
 * Attach the listing's apply door to a role opening (OD4, reshaped at OX5).
 *
 * The door is no longer minted per opening over a binding — it was minted ONCE,
 * by the platform, inside the link grant (S4/S5), and every open opening on the
 * listing carries that same door's token in `join_link_ref`. Idempotent by
 * intent: an opening that already carries a ref keeps it, so re-saving a title
 * does not strand a printed URL visitors may already have.
 *
 * The token, not a public id: `/join/{secret}` — the shipped requester page —
 * resolves a token, and a LISTED door's secret is not a secret (design.md §6);
 * it is printed on a public page on purpose. JR still stores only the hash;
 * what bounds the door is its project_viewer ceiling (forced at the grant
 * mint and by `join_links_listed_check`), `max_pending`, JR6's throttle and
 * lockout, and one-click revoke — never the token's obscurity.
 *
 * An unlinked listing (no grant yet) simply renders no apply button — the same
 * fail-soft posture the binding-era mint had when the sibling service was down.
 */
async function attachListedDoor(
  profile: ProfileRecord,
  opening: RoleOpeningRecord,
  deps: ProfileHandlerDeps,
): Promise<string | null> {
  if (opening.joinLinkRef) return opening.joinLinkRef;
  if (opening.status !== "open") return null;
  const doorRef = profile.linkGrant?.doorRef;
  if (!doorRef) return null;
  const linked = await deps.repo.setRoleOpeningJoinLink(opening.id as Uuid, doorRef);
  return linked?.joinLinkRef ?? null;
}

// ---------------------------------------------------------------------------
// Reads (authenticated, org-scoped — drafts included)
// ---------------------------------------------------------------------------

export async function handleListProfiles(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  const profiles = await deps.repo.listProfilesForOrg(orgId);
  // The list read authorizes per LISTING (OX4): a maintainer of one listing
  // must not learn what else the workspace has drafted. An operator sees all
  // — review needs the queue.
  const operator = parseOperators(env.OPENPRODUCT_OPERATORS).has(actor.subjectId);
  const maintained = operator
    ? null
    : new Set(await deps.repo.listMaintainedProfileIds(orgId, actor.subjectId));
  const visible = maintained === null ? profiles : profiles.filter((p) => maintained.has(p.id));
  return successResponse(
    {
      profiles: visible.map((p) => ({
        id: profilePublicId(p.id),
        projectId: projectPublicId(p.projectId),
        slug: p.slug,
        visibility: p.visibility,
        tagline: p.tagline,
        publishedAt: p.publishedAt,
        reviewedAt: p.reviewedAt,
        repoVisibility: p.repoVisibility,
      })),
    },
    requestId,
  );
}

export async function handleGetProfile(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  // ONE ROUND TRIP, NOT THREE (openproduct-studio OSD5). The studio reads
  // this on every step of the editor, and it used to ask the database three
  // times in a row — the profile, THEN the caller's role, THEN the openings
  // and the maintainers — each a hop to a database in Singapore. None of the
  // four depends on another's answer, so they leave together. Nothing read
  // here reaches the response until the profile exists and the role allows
  // it: an unauthorised caller still gets the same hiding 404, having cost
  // the database two small reads it would not otherwise have made.
  // OSD7 adds a fifth, the maintainers' handles, keyed on the profile so it
  // leaves with the rest instead of waiting for the maintainer list.
  const [profile, auth, openings, maintainers, handles] = await Promise.all([
    deps.repo.getProfileForOrg(orgId, profileId),
    authorizeFor(env, actor, "read", profileId, deps, requestId),
    deps.repo.listRoleOpenings(profileId),
    deps.repo.listMaintainers(profileId),
    deps.repo.listMaintainerHandles(profileId),
  ]);
  if (!profile) return errorResponse("not_found", "Not found", 404, requestId);
  if (!auth.ok) return auth.response;
  // The caller's capability, computed HERE rather than guessed at by the
  // console. Since OX4, review is the OPERATOR's act (OX-J) — a maintainer
  // must never wave their own listing through — so the flag is exactly the
  // operator bit the authorization already resolved.
  const canReview = auth.operator;
  return successResponse(
    { profile: toMaintainerProfile(profile, openings, maintainers, handles), capabilities: { canReview } },
    requestId,
  );
}

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

export async function handleCreateProfile(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse("bad_request", "Invalid JSON body", 400, requestId);
  }

  const fields: Record<string, string[]> = {};
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (!slug || slug.length > MAX_SLUG || !SLUG_RE.test(slug)) {
    fields.slug = ["Lowercase letters, digits and single hyphens"];
  } else if (RESERVED_SLUGS.has(slug)) {
    fields.slug = ["That name is reserved"];
  }

  const tagline = typeof body.tagline === "string" ? body.tagline.trim() : null;
  if (tagline && tagline.length > MAX_TAGLINE) fields.tagline = [`At most ${MAX_TAGLINE} characters`];

  const pitch = typeof body.pitch === "string" ? body.pitch : null;
  if (pitch && pitch.length > MAX_PITCH) fields.pitch = [`At most ${MAX_PITCH} characters`];

  const repoUrl = httpsUrl(body.repoUrl);
  if (body.repoUrl !== undefined && repoUrl === undefined) fields.repoUrl = ["Must be an absolute https URL"];
  const liveUrl = httpsUrl(body.liveUrl);
  if (body.liveUrl !== undefined && liveUrl === undefined) fields.liveUrl = ["Must be an absolute https URL"];

  const stack = parseStack(body.stack, fields);
  if (typeof body.grant !== "string" || body.grant.length === 0) {
    fields.grant = ["Required listing link grant"];
  }
  if (Object.keys(fields).length > 0) return validationError(requestId, fields);

  // The CREATE gate (OX5 — S4/S5): creation binds a listing to platform
  // tenancy, and the caller proves the platform attested that binding by
  // presenting the LINK GRANT a workspace owner/admin just minted. Verifying
  // its signature and freshness is the WHOLE platform-authority question —
  // no binding, no per-request read. Null is every defect at once (malformed,
  // forged, stale, wrong shape), answered identically on purpose.
  const secret = (env.LISTING_SEAM_SECRET ?? "").trim();
  if (!secret) {
    return errorResponse("internal_error", "Listing seam not configured", 503, requestId);
  }
  const grant = await verifyListingGrant(secret, body.grant as string, deps.now);
  // The grant names its workspace; a grant presented against a different org's
  // URL is someone replaying an attestation where it does not apply.
  if (!grant || grant.orgId !== orgPublicId(orgId)) {
    return errorResponse(
      "invalid_grant",
      "The listing link grant is missing, invalid, or expired — run the link flow again",
      403,
      requestId,
    );
  }
  // The PROJECT comes from the grant — it is the attested half of the binding,
  // never the caller's to restate. A body that names a different project is
  // refused rather than silently corrected.
  const projectId = parseProjectPublicId(grant.projectId);
  if (!projectId) {
    return errorResponse("invalid_grant", "The grant names an unparseable project", 403, requestId);
  }
  if (typeof body.projectId === "string" && body.projectId !== grant.projectId) {
    return validationError(requestId, { projectId: ["Does not match the link grant"] });
  }
  const storedGrant: StoredLinkGrant = {
    doorRef: grant.doorRef,
    grantedBy: grant.grantedBy,
    grantedAt: grant.issuedAt,
    workspaceVisibility: "public",
  };

  const existing = await deps.repo.getProfileByProject(orgId, projectId);
  if (existing) {
    return errorResponse("conflict", "This project already has a listing", 409, requestId);
  }

  const canonical = pitch === null ? null : canonicalDocBody(pitch);
  const profile = await deps.repo
    .createProfile({
      id: (deps.generateId ?? generateId)(),
      orgId,
      projectId,
      slug,
      linkGrant: storedGrant,
      // openproduct.profiles.created_by is TEXT, not UUID (1160 migration —
      // the join_links.minted_by / organization_invitations.invited_by
      // precedent): an actor may be a user OR a service principal, so the
      // column stores the public id verbatim. Decoding it would throw away
      // which kind it was.
      // eslint-disable-next-line no-restricted-syntax
      createdBy: actor.subjectId,
      tagline,
      pitchBody: canonical,
      pitchDigest: canonical === null ? null : await docDigest(canonical),
      repoUrl: repoUrl ?? null,
      liveUrl: liveUrl ?? null,
      stack: stack ?? [],
    })
    .catch((error: unknown) => {
      // The global slug index is the one race a caller can lose to a stranger.
      if (String(error).includes("openproduct_profiles_slug_idx")) return "slug_taken" as const;
      if (String(error).includes("openproduct_profiles_project_idx")) return "duplicate" as const;
      throw error;
    });

  if (profile === "slug_taken") {
    return errorResponse("conflict", "That name is taken", 409, requestId);
  }
  if (profile === "duplicate") {
    return errorResponse("conflict", "This project already has a listing", 409, requestId);
  }

  await audit(deps, {
    orgId,
    profile,
    type: "openproduct.profile.created",
    actor,
    requestId,
    description: `openproduct listing ${profile.slug} created`,
  });

  return successResponse({ profile: toMaintainerProfile(profile, [], []) }, requestId, 201);
}

export async function handleUpdateProfile(
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
  let slug: string | undefined;
  if (body.slug !== undefined) {
    const candidate = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    if (!candidate || candidate.length > MAX_SLUG || !SLUG_RE.test(candidate)) {
      fields.slug = ["Lowercase letters, digits and single hyphens"];
    } else if (RESERVED_SLUGS.has(candidate)) {
      fields.slug = ["That name is reserved"];
    } else {
      slug = candidate;
    }
  }

  let tagline: string | null | undefined;
  if (body.tagline !== undefined) {
    if (body.tagline === null) tagline = null;
    else if (typeof body.tagline === "string" && body.tagline.length <= MAX_TAGLINE) tagline = body.tagline.trim();
    else fields.tagline = [`At most ${MAX_TAGLINE} characters`];
  }

  let pitchBody: string | null | undefined;
  let pitchDigest: string | null | undefined;
  if (body.pitch !== undefined) {
    if (body.pitch === null) {
      pitchBody = null;
      pitchDigest = null;
    } else if (typeof body.pitch === "string" && body.pitch.length <= MAX_PITCH) {
      pitchBody = canonicalDocBody(body.pitch);
      pitchDigest = await docDigest(pitchBody);
    } else {
      fields.pitch = [`At most ${MAX_PITCH} characters`];
    }
  }

  // PV2 — THE API IS THE AUTHORITY, and this is where a caller that is not
  // our studio arrives. The contract holds the rule, the column holds it
  // again, and this refuses before either: a maintainer's own token posting
  // `{"installLine": "npm i x | sh"}` straight at the PATCH is a real client
  // of this endpoint, and it gets the contract's own sentence rather than a
  // constraint-violation 500 from Postgres.
  let installLine: string | null | undefined;
  if (body.installLine !== undefined) {
    if (body.installLine === null) installLine = null;
    else if (typeof body.installLine !== "string") {
      fields.installLine = ["Must be a string, or null to clear it"];
    } else {
      const candidate = normaliseInstallLine(body.installLine);
      // An empty answer CLEARS rather than refuses: a maintainer who deletes
      // the box is saying there is no longer a command to give, which is a
      // different act from typing something unacceptable.
      if (candidate.length === 0) installLine = null;
      else {
        const refusal = installLineRefusal(candidate);
        if (refusal) fields.installLine = [refusal];
        else installLine = candidate;
      }
    }
  }

  let repoUrl: string | null | undefined;
  if (body.repoUrl !== undefined) {
    repoUrl = httpsUrl(body.repoUrl);
    if (repoUrl === undefined) fields.repoUrl = ["Must be an absolute https URL"];
  }
  let liveUrl: string | null | undefined;
  if (body.liveUrl !== undefined) {
    liveUrl = httpsUrl(body.liveUrl);
    if (liveUrl === undefined) fields.liveUrl = ["Must be an absolute https URL"];
  }

  const stack = parseStack(body.stack, fields);
  const category = parseFacet("category", body.category, fields);
  const hosting = parseFacet("hosting", body.hosting, fields);
  const pricing = parseFacet("pricing", body.pricing, fields);
  if (Object.keys(fields).length > 0) return validationError(requestId, fields);

  const updated = await deps.repo
    .updateProfile(orgId, profileId, {
      slug,
      tagline,
      pitchBody,
      pitchDigest,
      installLine,
      repoUrl,
      liveUrl,
      stack,
      category,
      hosting,
      pricing,
      // updated_by is TEXT and holds the public actor id by design — see
      // createProfile above.
      // eslint-disable-next-line no-restricted-syntax
      updatedBy: actor.subjectId,
    })
    .catch((error: unknown) => {
      if (String(error).includes("openproduct_profiles_slug_idx")) return "slug_taken" as const;
      throw error;
    });

  if (updated === "slug_taken") return errorResponse("conflict", "That name is taken", 409, requestId);
  if (!updated) return errorResponse("not_found", "Not found", 404, requestId);

  await audit(deps, {
    orgId,
    profile: updated,
    type: "openproduct.profile.updated",
    actor,
    requestId,
    description: `openproduct listing ${updated.slug} updated`,
  });

  const [openings, maintainers] = await Promise.all([
    deps.repo.listRoleOpenings(profileId),
    deps.repo.listMaintainers(profileId),
  ]);
  return successResponse({ profile: toMaintainerProfile(updated, openings, maintainers) }, requestId);
}

// ---------------------------------------------------------------------------
// The curation gate, and the publish act
// ---------------------------------------------------------------------------

/**
 * The admin review that permits a first publish (README §Curation). Separate
 * permission (`…review`, owner/admin only — a builder may author and publish
 * but may not wave their own listing through), once per profile, audited.
 * This is also OD-C's v1 moderation lever.
 */
export async function handleReviewProfile(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  const existing = await deps.repo.getProfileForOrg(orgId, profileId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);

  const auth = await authorizeFor(env, actor, "review", profileId, deps, requestId);
  if (!auth.ok) return auth.response;

  const now = (deps.now ?? (() => new Date()))();
  const reviewed = await deps.repo.reviewProfile(profileId, actor.subjectId, now.toISOString());
  if (!reviewed) return errorResponse("not_found", "Not found", 404, requestId);

  // TS1 — THE PROMOTION, and without it TS1 has changed nothing. The rule the
  // sub-epic promises is "publishing a SECOND listing from an established
  // maker requires no human"; that only holds if the FIRST review is what
  // makes them established. Otherwise every listing waits for a person
  // forever and the ladder is decoration.
  //
  // The listing's OWNER is promoted, not the reviewer — the reviewer is the
  // human doing the clearing, and clearing somebody's listing must not
  // promote the clearer.
  //
  // Best-effort: a promotion that fails must not fail the review. The review
  // is the act with the audit entry and the public consequence; the level is
  // a convenience the next publish can recompute the slow way.
  const maker = reviewed.createdBy;
  const current = (await deps.repo.getTrustLevel(maker))?.level ?? DEFAULT_TRUST_LEVEL;
  const promoted = promotionAfterReview(current);
  if (promoted) {
    await deps.repo.setTrustLevel(maker, promoted, "automatic", "first listing reviewed");
  }

  await audit(deps, {
    orgId,
    profile: reviewed,
    type: "openproduct.profile.reviewed",
    actor,
    requestId,
    description: `openproduct listing ${reviewed.slug} reviewed for publication`,
    payload: { reviewedAt: reviewed.reviewedAt },
  });

  const [openings, maintainers] = await Promise.all([
    deps.repo.listRoleOpenings(profileId),
    deps.repo.listMaintainers(profileId),
  ]);
  return successResponse({ profile: toMaintainerProfile(reviewed, openings, maintainers) }, requestId);
}

/** Why this profile cannot go public right now, in the order a human fixes them.
 *
 * The workspace gate (OW4) is first and is now a STORED fact (OX5): the link
 * grant attested the workspace's public eligibility at link time, so a listing
 * with no grant cannot publish — the remedy is running the link flow, and a
 * pre-seam listing starts exactly there. No per-request platform read remains
 * on this path.
 */
export function publishBlockers(
  profile: ProfileRecord,
  /**
   * TS1 — the ladder's answer for this maker, or null to keep OD's
   * unconditional review gate. Optional so every existing caller (the studio
   * read, which has no trust context to hand) keeps describing the listing
   * rather than the person.
   */
  decision?: PublishDecision | null,
): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (!profile.linkGrant) blockers.push("workspace_link_required");
  if (!profile.pitchBody) blockers.push("pitch_missing");
  // A listing without a repository IS a listing (openproduct-account, decided
  // 2026-09-03 on the first real walk): a founder lists a product before its
  // code has a home, and the repository — with its licence, stars and
  // activity — attaches when one is linked, exactly as a repo joins an
  // orunbase workspace. `repo_unlinked` is retired. What still blocks is a
  // repository that IS linked and read back private: that page would promise
  // readable code and break the promise.
  if (profile.repoVisibility === "private") blockers.push("repo_private");
  // TS1 — the review gate is now the LADDER's to raise. A `new` maker is not
  // blocked by it (they publish unindexed); an `established` one never sees
  // it; a `restricted` one gets a different, appealable blocker.
  if (decision) {
    for (const blocker of decision.blockers) blockers.push(blocker);
  } else if (!profile.reviewedAt) {
    blockers.push("awaiting_review");
  }
  return blockers;
}

export async function handlePublishProfile(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  // OH4 — the curated components snapshot rides the publish body. Optional
  // and bounded; an empty or absent body publishes none (the default).
  const componentsResult = await componentsFromRequest(request, requestId);
  if (componentsResult instanceof Response) return componentsResult;
  const components = componentsResult;

  const existing = await deps.repo.getProfileForOrg(orgId, profileId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);

  const auth = await authorizeFor(env, actor, "publish", profileId, deps, requestId);
  if (!auth.ok) return auth.response;

  // Named blockers rather than a bare 409: the OD6 dialog states the remedy
  // ("the repo is private, make it public on GitHub") instead of greying out
  // a button, and a caller that cannot act on a refusal has been told nothing.
  // The workspace gate rides publishBlockers now (OX5) — the stored link
  // grant IS the eligibility fact, so there is nothing left to fail open on.
  // TS1 — the ladder, consulted once and carried through. The level and the
  // unreviewed count are read together because the cap only matters for a
  // maker who has never been cleared, and the level is what says so.
  const level = (await deps.repo.getTrustLevel(actor.subjectId))?.level ?? DEFAULT_TRUST_LEVEL;
  const decision = publishDecision({
    level,
    alreadyReviewed: existing.reviewedAt !== null,
    unreviewedListings:
      level === "new" ? await deps.repo.countUnreviewedPublished(actor.subjectId) : 0,
  });

  const blockers = publishBlockers(existing, decision);
  if (blockers.length > 0) {
    return errorResponse("precondition_failed", "This listing cannot be published yet", 412, requestId, {
      blockers,
    });
  }

  const now = (deps.now ?? (() => new Date()))();
  const published = await deps.repo.publishProfile(orgId, profileId, now.toISOString(), actor.subjectId, {
    components,
    allowWithoutReview: !decision.requiresReview,
    indexable: decision.indexable,
  });
  if (!published) {
    // The repository re-asserts both gates in its WHERE clause. Landing here
    // means the row changed under us between the read and the write — a
    // revoked review, a sweep that saw the repo go private — so re-read and
    // answer with the real reason rather than a generic conflict.
    const current = await deps.repo.getProfileForOrg(orgId, profileId);
    return errorResponse("precondition_failed", "This listing cannot be published yet", 412, requestId, {
      blockers: current ? publishBlockers(current, decision) : ["awaiting_review"],
    });
  }

  await audit(deps, {
    orgId,
    profile: published,
    type: "openproduct.profile.published",
    actor,
    requestId,
    description: `openproduct listing ${published.slug} published`,
    payload: { publishedAt: published.publishedAt, pitchDigest: published.pitchDigest },
  });

  const [openings, maintainers] = await Promise.all([
    deps.repo.listRoleOpenings(profileId),
    deps.repo.listMaintainers(profileId),
  ]);
  return successResponse({ profile: toMaintainerProfile(published, openings, maintainers) }, requestId);
}

export async function handleUnpublishProfile(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  const existing = await deps.repo.getProfileForOrg(orgId, profileId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);

  // Unpublishing is a `publish` permission, not a `write` one: taking a page
  // down is the same authority as putting it up.
  const auth = await authorizeFor(env, actor, "publish", profileId, deps, requestId);
  if (!auth.ok) return auth.response;

  const unpublished = await deps.repo.unpublishProfile(orgId, profileId, actor.subjectId);
  if (!unpublished) return errorResponse("not_found", "Not found", 404, requestId);

  await audit(deps, {
    orgId,
    profile: unpublished,
    type: "openproduct.profile.unpublished",
    actor,
    requestId,
    description: `openproduct listing ${unpublished.slug} unpublished`,
  });

  const [openings, maintainers] = await Promise.all([
    deps.repo.listRoleOpenings(profileId),
    deps.repo.listMaintainers(profileId),
  ]);
  return successResponse({ profile: toMaintainerProfile(unpublished, openings, maintainers) }, requestId);
}


/**
 * Record what the GitHub App observed about the linked repo (OD2b, P1).
 *
 * The observation is established by **api-edge**, over the
 * `INTEGRATIONS_WORKER` binding it already holds — this worker has no such
 * binding and will not get one (design.md §3). So the fact arriving here was
 * established by the platform on an authenticated path, not asserted by a
 * client: api-edge overwrites whatever the caller sent.
 *
 * Its own endpoint rather than a step inside publish, for three reasons: the
 * sweep (OD-I) writes through exactly this path, the console can show "last
 * checked" and offer a re-check, and publish stays a pure gate over a stored
 * column — which is what lets the repository re-assert the same gate in SQL.
 */
export async function handleRecordRepoObservation(
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

  // Fail closed, read once: `readRepoObservation` is shared with the sweep's
  // observation door (OB2), so the two writers of `repo_*` cannot disagree
  // about what a body means.
  const now = (deps.now ?? (() => new Date()))();
  const { linked, observation } = readRepoObservation(body, now.toISOString());
  const visibility = observation.repoVisibility;
  const licence = typeof body.licence === "string" && body.licence.length > 0 ? body.licence : null;
  // An unlinked project records "no repository": repo_visibility becomes
  // NULL, which since 2026-09-03 blocks nothing (a listing without a
  // repository is a listing) and is still distinct from `private`, which
  // does. Written rather than skipped so a check after the link was removed
  // clears the reading the old link left behind.
  const recorded = await deps.repo.recordRepoObservation(profileId, observation);
  if (!recorded) return errorResponse("not_found", "Not found", 404, requestId);

  await audit(deps, {
    orgId,
    profile: recorded,
    type: "openproduct.profile.repo_checked",
    actor,
    requestId,
    description: `openproduct listing ${recorded.slug} repo observed ${linked ? visibility : "unlinked"}`,
    payload: { linked, repoVisibility: visibility, repoLicence: licence },
  });

  const [openings, maintainers] = await Promise.all([
    deps.repo.listRoleOpenings(profileId),
    deps.repo.listMaintainers(profileId),
  ]);
  // The informational blocker list is now exactly the gate publish will apply
  // (OX5): the workspace fact is the stored link grant, read locally, so this
  // one-round-trip answer can no longer diverge from the real gate.
  const blockers = publishBlockers(recorded);
  return successResponse(
    { profile: toMaintainerProfile(recorded, openings, maintainers), blockers },
    requestId,
  );
}

// ---------------------------------------------------------------------------
// Role openings and the published-maintainer list
// ---------------------------------------------------------------------------

export async function handleUpsertRoleOpening(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  openingId: Uuid | null,
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
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_TITLE) fields.title = [`1–${MAX_TITLE} characters`];
  const status = body.status === undefined ? undefined : String(body.status);
  if (status !== undefined && !["open", "filled", "closed"].includes(status)) {
    fields.status = ["One of open, filled, closed"];
  }
  if (Object.keys(fields).length > 0) return validationError(requestId, fields);

  const opening = await deps.repo.upsertRoleOpening({
    id: openingId ?? (deps.generateId ?? generateId)(),
    profileId,
    title,
    description: typeof body.description === "string" ? body.description : null,
    commitment: typeof body.commitment === "string" ? body.commitment : null,
    status: status as "open" | "filled" | "closed" | undefined,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
  });

  // OD4: an open role opening carries a printed door — since OX5, the
  // listing's ONE door from the link grant, copied after the row exists so an
  // unlinked listing cannot roll back the maintainer's edit.
  const joinLinkRef = await attachListedDoor(existing, opening, deps);

  await audit(deps, {
    orgId,
    profile: existing,
    type: openingId ? "openproduct.role_opening.updated" : "openproduct.role_opening.created",
    actor,
    requestId,
    description: `openproduct role opening "${opening.title}" on ${existing.slug}`,
    payload: { roleOpeningId: roleOpeningPublicId(opening.id), status: opening.status },
  });

  return successResponse(
    {
      roleOpening: {
        id: roleOpeningPublicId(opening.id),
        title: opening.title,
        description: opening.description,
        commitment: opening.commitment,
        status: opening.status,
        joinLinkRef,
      },
    },
    requestId,
    openingId ? 200 : 201,
  );
}

export async function handleDeleteRoleOpening(
  env: Env,
  requestId: string,
  actor: ActorContext,
  orgId: Uuid,
  profileId: Uuid,
  openingId: Uuid,
  deps: ProfileHandlerDeps,
): Promise<Response> {
  const existing = await deps.repo.getProfileForOrg(orgId, profileId);
  if (!existing) return errorResponse("not_found", "Not found", 404, requestId);

  const auth = await authorizeFor(env, actor, "write", profileId, deps, requestId);
  if (!auth.ok) return auth.response;

  const deleted = await deps.repo.deleteRoleOpening(profileId, openingId);
  if (!deleted) return errorResponse("not_found", "Not found", 404, requestId);

  await audit(deps, {
    orgId,
    profile: existing,
    type: "openproduct.role_opening.deleted",
    actor,
    requestId,
    description: `openproduct role opening removed from ${existing.slug}`,
  });

  return successResponse({ deleted: true }, requestId);
}

/**
 * Replace the published-maintainer set.
 *
 * Replace, not append: removing someone must be as easy as adding them, and a
 * partial update would leave a person published that the maintainer believes
 * they took down. Subject ids only — resolving them to names happens at read
 * time, and an email never enters this table (design.md §2.3).
 */
export async function handleSetMaintainers(
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

  const raw = body.maintainers;
  if (!Array.isArray(raw) || raw.length > MAX_MAINTAINERS) {
    return validationError(requestId, { maintainers: [`At most ${MAX_MAINTAINERS} people`] });
  }
  // BY HANDLE OR BY ID (openproduct-studio OSD7). An entry names its person
  // either as `{ handle }` — the public `@name` a maker can actually see on a
  // contributor page — or, as before, as `{ subjectId }`. Handles resolve
  // HERE, in one batched read, and not in the web: the studio is a client of
  // this door like any other, and a client that resolved names itself would
  // be one more place a released handle could still point at its old holder.
  // `getSubjectsForHandles` answers for ACTIVE holders only, so an unknown or
  // released handle is refused by name rather than saved as nobody.
  const entries: Array<{ subjectId: string | null; handle: string | null; item: Record<string, unknown> }> = [];
  for (const entry of raw) {
    const item = (entry ?? {}) as Record<string, unknown>;
    if (typeof item.handle === "string" && item.handle.trim().length > 0) {
      // The email refusal holds on this path too: `@ada@example.com` is an
      // address, not a handle, and is refused as one rather than looked up.
      if (item.handle.trim().replace(/^@+/, "").includes("@")) {
        return validationError(requestId, { maintainers: ["A maintainer is a handle or an id, never an email"] });
      }
      const parsed = parseHandle(item.handle);
      if (!parsed.ok) {
        return validationError(requestId, { maintainers: [`No one here goes by @${item.handle.trim().replace(/^@+/, "")}`] });
      }
      entries.push({ subjectId: null, handle: parsed.handle, item });
      continue;
    }
    const subjectId = typeof item.subjectId === "string" ? item.subjectId : "";
    if (!subjectId) return validationError(requestId, { maintainers: ["Each entry needs a handle or a subjectId"] });
    // An email in this field would be a leak on a public page, so it is
    // refused at the boundary rather than filtered at read time.
    if (subjectId.includes("@")) {
      return validationError(requestId, { maintainers: ["subjectId is an id, never an email"] });
    }
    entries.push({ subjectId, handle: null, item });
  }
  const wanted = entries.flatMap((e) => (e.handle ? [e.handle] : []));
  const holders = wanted.length > 0 ? await deps.repo.getSubjectsForHandles(wanted) : new Map<string, string>();
  const unknown = wanted.find((handle) => !holders.has(handle));
  if (unknown !== undefined) {
    return validationError(requestId, { maintainers: [`No one here goes by @${unknown}`] });
  }
  const maintainers: MaintainerInput[] = entries.map(({ subjectId, handle, item }) => ({
    subjectId: subjectId ?? holders.get(handle!)!,
    roleLabel: typeof item.roleLabel === "string" ? item.roleLabel : null,
    sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : undefined,
  }));

  const saved = await deps.repo.setMaintainers(profileId, maintainers);

  await audit(deps, {
    orgId,
    profile: existing,
    type: "openproduct.maintainers.updated",
    actor,
    requestId,
    description: `openproduct published maintainers set on ${existing.slug} (${saved.length})`,
    payload: { count: saved.length },
  });

  return successResponse(
    {
      maintainers: saved.map((m) => ({
        subjectId: m.subjectId,
        displayName: null,
        roleLabel: m.roleLabel,
      })),
    },
    requestId,
  );
}

/**
 * PUT …/profiles/{id}/link-grant — attach (or refresh) the listing's link
 * grant (OX5 — S4/S5). The path every PRE-SEAM listing must walk once before
 * it can publish again, and the remedy behind the `workspace_link_required`
 * blocker.
 *
 * Write authority plus a VALID grant, both required: the grant alone is not
 * enough (a stranger holding a fresh grant must not rebind someone else's
 * listing), and write authority alone is not enough (the workspace's say-so is
 * exactly what the grant carries). The grant must name this listing's own
 * workspace AND project — a grant for a different project is a different
 * binding, refused rather than absorbed.
 */
export async function handleSetLinkGrant(
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

  if (typeof body.grant !== "string" || body.grant.length === 0) {
    return validationError(requestId, { grant: ["Required listing link grant"] });
  }
  const secret = (env.LISTING_SEAM_SECRET ?? "").trim();
  if (!secret) {
    return errorResponse("internal_error", "Listing seam not configured", 503, requestId);
  }
  const grant = await verifyListingGrant(secret, body.grant, deps.now);
  if (
    !grant ||
    grant.orgId !== orgPublicId(orgId) ||
    parseProjectPublicId(grant.projectId) !== existing.projectId
  ) {
    return errorResponse(
      "invalid_grant",
      "The listing link grant is missing, invalid, or expired — run the link flow again",
      403,
      requestId,
    );
  }

  const updated = await deps.repo.setProfileLinkGrant(profileId, {
    doorRef: grant.doorRef,
    grantedBy: grant.grantedBy,
    grantedAt: grant.issuedAt,
    workspaceVisibility: "public",
  });
  if (!updated) return errorResponse("not_found", "Not found", 404, requestId);

  await audit(deps, {
    orgId,
    profile: updated,
    type: "openproduct.profile.workspace_linked",
    actor,
    requestId,
    description: `openproduct listing ${updated.slug} linked to its workspace`,
    payload: { grantedBy: grant.grantedBy, grantedAt: grant.issuedAt },
  });

  const [openings, maintainers] = await Promise.all([
    deps.repo.listRoleOpenings(profileId),
    deps.repo.listMaintainers(profileId),
  ]);
  return successResponse({ profile: toMaintainerProfile(updated, openings, maintainers) }, requestId);
}
