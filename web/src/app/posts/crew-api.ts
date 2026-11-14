// The crew's API client (openproduct-redesign OPR-3, design §6.1 and §6.2).
//
// Everything a product's crew does from the product's own pages: write and
// publish template posts, keep the milestones, read what waits on them, set
// the address people try the product at. Every route is addressed by the
// workspace (`org_…`) and the listing (`opp_…`); core decides who is on the
// crew and answers 404 to everybody else, so a refusal here never says
// whether the product exists.
//
// THE ME-API DISCIPLINE: the token is a REQUIRED argument, the header set is
// closed, every call is `no-store`. Four outcomes, because the pages react to
// each differently:
//
//   ok            the act landed
//   unauthorized  the token is dead: through sign-in and back
//   refused       core understood and said no: 404 (not on the crew, or not
//                 there), 409 (already published, at the limit), 422 (field
//                 errors in `fields`, block errors keyed `blocks.<blockId>`)
//   unavailable   the service failed
//
// IT DOES NOT IMPORT THE STUDIO'S CLIENT. Nothing outside `studio/` imports
// from `studio/` (the routes suite holds that with a sweep), and these pages
// are not the studio: they are the product's public address with a maker's
// controls laid over it after load.

import {
  PRODUCT_POST_API,
  type AuthoredProductPostKind,
  type CrewMilestone,
  type CrewNeedsYou,
  type CrewProductPost,
  type MilestoneRequest,
  type OverlayCrew,
  type ProductPostBlock,
  type ProductStage,
  type PublishProductPostRequest,
} from "@openproduct/contracts";

import { fetchOverlay, meHeaders, type MeFetch } from "../me/me-api";
import { publicApiBase } from "../public-api";

export type CrewFetch = MeFetch;

export type CrewResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "refused"; status: number; code: string; message: string; fields: Record<string, string[]> }
  | { kind: "unavailable" };

/** The workspace and listing a crew route is addressed by. */
export type CrewIds = Pick<OverlayCrew, "org" | "profile">;

async function crewRequest<T>(
  token: string,
  path: string,
  init: { method: string; body?: unknown },
  fetchImpl: CrewFetch = fetch,
): Promise<CrewResult<T>> {
  try {
    const res = await fetchImpl(`${publicApiBase()}${path}`, {
      method: init.method,
      headers: meHeaders(token, init.body !== undefined),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });
    if (res.status === 401) return { kind: "unauthorized" };
    if (res.status >= 400 && res.status < 500) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { code?: string; message?: string; details?: { fields?: Record<string, string[]> } } }
        | null;
      return {
        kind: "refused",
        status: res.status,
        code: body?.error?.code ?? "refused",
        message: body?.error?.message ?? "The service refused this request",
        fields: body?.error?.details?.fields ?? {},
      };
    }
    if (!res.ok) return { kind: "unavailable" };
    const data = ((await res.json()) as { data?: T }).data;
    return data === undefined || data === null ? { kind: "unavailable" } : { kind: "ok", data };
  } catch {
    return { kind: "unavailable" };
  }
}

// ─── who is on the crew ────────────────────────────────────────────────────

export type CrewLookup =
  | { kind: "ok"; crew: OverlayCrew }
  /** Signed in, and not on this product's crew (or no such product). */
  | { kind: "not-crew" }
  | { kind: "unauthorized" }
  | { kind: "unavailable" };

/**
 * The workspace and listing ids behind a slug, FOR THIS PERSON — or the
 * answer that they are not on its crew.
 *
 * THE ONE PLACE A ROUTE HANDLER GETS THOSE IDS. A form never carries them:
 * the handler takes the slug from its own address, asks core (the overlay's
 * `crew`, which is core's own crew check) with the caller's token, and uses
 * what comes back. An id typed into a form could only ever name a product
 * the caller is not on the crew of, which core would refuse anyway — but
 * then the refusal would be the only thing standing there.
 */
export async function resolveCrew(token: string, slug: string, fetchImpl?: CrewFetch): Promise<CrewLookup> {
  const result = await fetchOverlay(
    token,
    { ids: slug, follows: null, posts: null, productPosts: null, openings: null },
    fetchImpl,
  );
  if (result.kind !== "ok") return { kind: result.kind };
  const crew = result.data.overlay?.crew;
  const entry = Array.isArray(crew)
    ? crew.find(
        (candidate) =>
          candidate?.slug === slug && typeof candidate.org === "string" && typeof candidate.profile === "string",
      )
    : undefined;
  return entry ? { kind: "ok", crew: { slug, org: entry.org, profile: entry.profile } } : { kind: "not-crew" };
}

// ─── posts ─────────────────────────────────────────────────────────────────

/** The product's posts as its crew sees them: drafts and published. */
export function listCrewPosts(
  token: string,
  ids: CrewIds,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ posts: CrewProductPost[] }>> {
  return crewRequest(token, PRODUCT_POST_API.crewPosts(ids.org, ids.profile), { method: "GET" }, fetchImpl);
}

/** Start a draft of one of the four authored kinds. */
export function createCrewPost(
  token: string,
  ids: CrewIds,
  body: { kind: AuthoredProductPostKind; blocks?: ProductPostBlock[] },
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ post: CrewProductPost }>> {
  return crewRequest(
    token,
    PRODUCT_POST_API.crewPosts(ids.org, ids.profile),
    { method: "POST", body: { kind: body.kind, blocks: body.blocks ?? [] } },
    fetchImpl,
  );
}

/** Save a draft's blocks (or a published post's, re-validated in full). */
export function updateCrewPost(
  token: string,
  ids: CrewIds,
  postId: string,
  blocks: ProductPostBlock[],
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ post: CrewProductPost }>> {
  return crewRequest(
    token,
    PRODUCT_POST_API.crewPost(ids.org, ids.profile, postId),
    { method: "PATCH", body: { blocks } },
    fetchImpl,
  );
}

/** Publish a draft. Nothing publishes without a crew member pressing Post. */
export function publishCrewPost(
  token: string,
  ids: CrewIds,
  postId: string,
  body: PublishProductPostRequest = {},
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ post: CrewProductPost }>> {
  return crewRequest(
    token,
    PRODUCT_POST_API.crewPublish(ids.org, ids.profile, postId),
    { method: "POST", body },
    fetchImpl,
  );
}

/** Remove a post, draft or published. */
export function removeCrewPost(
  token: string,
  ids: CrewIds,
  postId: string,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ removed: boolean }>> {
  return crewRequest(token, PRODUCT_POST_API.crewPost(ids.org, ids.profile, postId), { method: "DELETE" }, fetchImpl);
}

// ─── milestones ────────────────────────────────────────────────────────────

/** What every milestone write answers with beside its own member: the stage
 *  the product is at now (it follows the milestones). */
export interface WithStage {
  stage: ProductStage;
}

export function listCrewMilestones(
  token: string,
  ids: CrewIds,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ milestones: CrewMilestone[] } & WithStage>> {
  return crewRequest(token, PRODUCT_POST_API.crewMilestones(ids.org, ids.profile), { method: "GET" }, fetchImpl);
}

export function createCrewMilestone(
  token: string,
  ids: CrewIds,
  body: MilestoneRequest,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ milestone: CrewMilestone } & WithStage>> {
  return crewRequest(token, PRODUCT_POST_API.crewMilestones(ids.org, ids.profile), { method: "POST", body }, fetchImpl);
}

export function updateCrewMilestone(
  token: string,
  ids: CrewIds,
  milestoneId: string,
  body: Partial<MilestoneRequest>,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ milestone: CrewMilestone } & WithStage>> {
  return crewRequest(
    token,
    PRODUCT_POST_API.crewMilestone(ids.org, ids.profile, milestoneId),
    { method: "PATCH", body },
    fetchImpl,
  );
}

/** Reorder: every milestone id of the product, in the new order. */
export function reorderCrewMilestones(
  token: string,
  ids: CrewIds,
  order: string[],
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ milestones: CrewMilestone[] } & WithStage>> {
  return crewRequest(
    token,
    PRODUCT_POST_API.crewMilestones(ids.org, ids.profile),
    { method: "PUT", body: { order } },
    fetchImpl,
  );
}

export function deleteCrewMilestone(
  token: string,
  ids: CrewIds,
  milestoneId: string,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ deleted: boolean } & WithStage>> {
  return crewRequest(
    token,
    PRODUCT_POST_API.crewMilestone(ids.org, ids.profile, milestoneId),
    { method: "DELETE" },
    fetchImpl,
  );
}

/** What shipping (or un-shipping) answers: the milestone, the stage now, and
 *  the draft Feature shipped post core prepared — null when un-shipping, or
 *  when a draft already existed. */
export interface ShippedAnswer extends WithStage {
  milestone: CrewMilestone;
  offeredPost: CrewProductPost | null;
}

/** Mark a milestone shipped (`true`) or not shipped (`false`). */
export function setCrewMilestoneShipped(
  token: string,
  ids: CrewIds,
  milestoneId: string,
  shipped: boolean,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<ShippedAnswer>> {
  return crewRequest(
    token,
    PRODUCT_POST_API.crewMilestoneShipped(ids.org, ids.profile, milestoneId),
    { method: shipped ? "PUT" : "DELETE" },
    fetchImpl,
  );
}

// ─── needs you, and the listing's own fields ───────────────────────────────

/** Pending seat requests and the product's drafts, in one read. */
export function fetchNeedsYou(
  token: string,
  ids: CrewIds,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ needsYou: CrewNeedsYou }>> {
  return crewRequest(token, PRODUCT_POST_API.crewNeedsYou(ids.org, ids.profile), { method: "GET" }, fetchImpl);
}

/** The listing fields the product page edits in place. `slug` is the name:
 *  renaming changes the address. */
export interface CrewProfilePatch {
  tryUrl?: string | null;
  slug?: string;
  tagline?: string | null;
  pitch?: string | null;
}

/** The fields of the answer these pages read. The full maintainer profile
 *  comes back; a page that needs more of it reads the studio. */
export interface CrewProfileAnswer {
  profile: { slug: string; tryUrl?: string | null; tagline?: string | null };
}

export function updateCrewProfile(
  token: string,
  ids: CrewIds,
  patch: CrewProfilePatch,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<CrewProfileAnswer>> {
  return crewRequest(
    token,
    `/v1/organizations/${encodeURIComponent(ids.org)}/openproduct/profiles/${encodeURIComponent(ids.profile)}`,
    { method: "PATCH", body: patch },
    fetchImpl,
  );
}
