// One crew act, from fields to an answer (openproduct-redesign OPR-3).
//
// The `/{slug}/manage/…` route files are adapters: they read the session
// cookie and the body, call one function here, and turn the `CrewAnswer` it
// returns into a response (`crew-route.ts`). Everything that decides
// anything is in this file, and none of it touches a request object or
// `next/server` — so the auth bounce, the id resolution and the passing
// through of core's field errors are each assertable directly.
//
// THE ORDER IS FIXED, AND IT IS THE SECURITY ARGUMENT:
//
//   1. no token                → sign in (and come back to `returnTo`)
//   2. the form is malformed   → 422 with field errors; nothing was asked
//   3. resolve `org`/`profile` for the slug WITH THE CALLER'S TOKEN
//      (`resolveCrew`: core's own crew check). Not on the crew → 404, the
//      same answer as "no such product". A dead token → sign in.
//   4. run the act against those ids; core authorizes again on every call
//   5. answer: a form gets a 303 back, an enhanced caller gets JSON
//
// A form cannot supply the ids in step 3, so a forged form can only ever act
// on a product its sender is already on the crew of.

import {
  composePostPagePath,
  productPostPagePath,
  type CrewMilestone,
  type CrewNeedsYou,
  type CrewProductPost,
  type ProductStage,
} from "@openproduct/contracts";

import { sanitizeReturnTo } from "../auth/auth";

import {
  changeCrewStage,
  createCrewMilestone,
  createCrewPost,
  createCrewSeat,
  deleteCrewMilestone,
  deleteCrewSeat,
  fetchNeedsYou,
  listCrewMilestones,
  listCrewPosts,
  publishCrewPost,
  removeCrewPost,
  reorderCrewMilestones,
  resolveCrew,
  setCrewMilestoneShipped,
  updateCrewMilestone,
  updateCrewPost,
  updateCrewProfile,
  updateCrewSeat,
  type CrewFetch,
  type CrewIds,
  type CrewResult,
} from "./crew-api";
import {
  readMilestoneAct,
  readPostAct,
  readProfilePatch,
  readSeatAct,
  readStageChange,
  type Fields,
  type FormError,
  type MilestoneAct,
  type PostAct,
  type SeatAct,
} from "./crew-forms";

/** What a route answers with, before it is a response. */
export type CrewAnswer =
  /** No session, or a dead one: through sign-in, back to `returnTo`. */
  | { kind: "signin"; returnTo: string }
  /** For an enhanced caller (and every GET). Always `no-store`. */
  | { kind: "json"; status: number; body: unknown }
  /** For a form: `303` to a path on this origin. */
  | { kind: "redirect"; to: string };

export interface CrewCall {
  /** The slug in the handler's own address. */
  slug: string;
  /** The bearer from the session cookie, or null when there is none. */
  token: string | null;
  /** The form's fields, or the JSON body's members. Empty for a GET. */
  fields: Fields;
  /** `accept: application/json` — the enhanced caller. */
  json: boolean;
  fetchImpl?: CrewFetch;
}

/**
 * The notices a form's redirect carries in `?notice=`, and the errors in
 * `?error=`. A CLOSED VOCABULARY, in sentence form, so the page that reads
 * the query prints one of these and never the query itself.
 */
export const CREW_NOTICES = {
  draft: "Draft saved",
  saved: "Saved",
  posted: "Posted",
  removed: "Post removed",
  "milestone-added": "Milestone added",
  "milestone-saved": "Milestone saved",
  "milestone-removed": "Milestone removed",
  reordered: "Order saved",
  shipped: "Marked as shipped",
  unshipped: "Marked as not shipped",
  "profile-saved": "Saved",
  "stage-moved": "Stage changed",
  "seat-added": "Seat added",
  "seat-saved": "Seat saved",
  "seat-removed": "Seat removed",
} as const;
export type CrewNotice = keyof typeof CREW_NOTICES;

export const CREW_ERRORS = {
  invalid: "Some fields need another look",
  conflict: "That cannot be done right now",
  "not-found": "That is not here, or it is not yours to change",
  unavailable: "That did not go through. Try again in a moment",
} as const;
export type CrewError = keyof typeof CREW_ERRORS;

/** The sentence for a `?notice=` value, or null for anything else. */
export function crewNotice(code: string | null | undefined): string | null {
  return code && Object.hasOwn(CREW_NOTICES, code) ? CREW_NOTICES[code as CrewNotice] : null;
}

/** The sentence for an `?error=` value, or null for anything else. */
export function crewError(code: string | null | undefined): string | null {
  return code && Object.hasOwn(CREW_ERRORS, code) ? CREW_ERRORS[code as CrewError] : null;
}

/** Where a form returns: its own `return_to` when that is a path on this
 *  origin, else the fallback. */
export function returnTarget(fields: Fields, fallback: string): string {
  const raw = fields.return_to;
  return (typeof raw === "string" ? sanitizeReturnTo(raw) : null) ?? fallback;
}

/** `path` with these query members added (a fragment, if any, kept last). */
export function withQuery(path: string, params: Readonly<Record<string, string | null | undefined>>): string {
  const [beforeHash, hash] = path.split("#", 2) as [string, string | undefined];
  const [pathname, existing] = beforeHash.split("?", 2) as [string, string | undefined];
  const query = new URLSearchParams(existing ?? "");
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) query.set(name, value);
  }
  const qs = query.toString();
  return `${pathname}${qs.length > 0 ? `?${qs}` : ""}${hash !== undefined ? `#${hash}` : ""}`;
}

const json = (status: number, body: unknown): CrewAnswer => ({ kind: "json", status, body });

function errorCodeOf(status: number): CrewError {
  if (status === 404) return "not-found";
  if (status === 422 || status === 400) return "invalid";
  return "conflict";
}

/** A failure, in whichever shape the caller can use. */
function failure(
  call: CrewCall,
  back: string,
  failed:
    | { kind: "refused"; status: number; code: string; message: string; fields: Record<string, string[]> }
    | { kind: "unavailable" }
    | FormError,
): CrewAnswer {
  if (failed.kind === "unavailable") {
    return call.json
      ? json(502, { error: { code: "unavailable", message: CREW_ERRORS.unavailable } })
      : { kind: "redirect", to: withQuery(back, { error: "unavailable" }) };
  }
  const status = failed.kind === "invalid" ? 422 : failed.status;
  const fields = failed.fields;
  const code = failed.kind === "invalid" ? "validation_failed" : failed.code;
  const message = failed.kind === "invalid" ? CREW_ERRORS.invalid : failed.message;
  if (call.json) return json(status, { error: { code, message, fields } });
  // The form path cannot carry sentences in an address; it carries WHICH
  // fields, and the page that redraws the form says why (the builder runs
  // the same `validatePostBlocks` core does).
  return {
    kind: "redirect",
    to: withQuery(back, { error: errorCodeOf(status), fields: Object.keys(fields).join(",") }),
  };
}

/** Steps 1 and 3: a token, then the ids. */
async function crewFor(
  call: CrewCall,
  back: string,
): Promise<{ ok: true; token: string; ids: CrewIds } | { ok: false; answer: CrewAnswer }> {
  if (!call.token) return { ok: false, answer: { kind: "signin", returnTo: back } };
  const lookup = await resolveCrew(call.token, call.slug, call.fetchImpl);
  if (lookup.kind === "unauthorized") return { ok: false, answer: { kind: "signin", returnTo: back } };
  if (lookup.kind === "unavailable") return { ok: false, answer: failure(call, back, { kind: "unavailable" }) };
  if (lookup.kind === "not-crew") {
    return {
      ok: false,
      answer: failure(call, back, { kind: "refused", status: 404, code: "not_found", message: "Not found", fields: {} }),
    };
  }
  return { ok: true, token: call.token, ids: { org: lookup.crew.org, profile: lookup.crew.profile } };
}

/** Step 5 for a result that is not `ok`. */
function notOk<T>(call: CrewCall, back: string, result: Exclude<CrewResult<T>, { kind: "ok" }>): CrewAnswer {
  if (result.kind === "unauthorized") return { kind: "signin", returnTo: back };
  return failure(call, back, result);
}

// ─── posts ─────────────────────────────────────────────────────────────────

async function runPostAct(
  token: string,
  ids: CrewIds,
  act: PostAct,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<{ post: CrewProductPost } | { removed: boolean }>> {
  switch (act.intent) {
    case "create":
      return createCrewPost(token, ids, { kind: act.kind, blocks: act.blocks }, fetchImpl);
    case "save":
      return updateCrewPost(token, ids, act.postId, act.blocks, fetchImpl);
    case "remove":
      return removeCrewPost(token, ids, act.postId, fetchImpl);
    case "publish": {
      let postId = act.postId;
      if (postId === null) {
        // Post pressed before anything was saved: the draft is written, then
        // published. If the publish is refused the draft stays, and the
        // answer names it so the builder carries on from there.
        const created = await createCrewPost(token, ids, { kind: act.kind!, blocks: act.blocks ?? [] }, fetchImpl);
        if (created.kind !== "ok") return created;
        postId = created.data.post.id;
        const published = await publishCrewPost(
          token,
          ids,
          postId,
          { milestoneId: act.milestoneId, roleOpeningId: act.roleOpeningId },
          fetchImpl,
        );
        return published.kind === "refused"
          ? { ...published, fields: { ...published.fields, draft: [postId] } }
          : published;
      }
      return publishCrewPost(
        token,
        ids,
        postId,
        {
          ...(act.blocks !== null ? { blocks: act.blocks } : {}),
          milestoneId: act.milestoneId,
          roleOpeningId: act.roleOpeningId,
        },
        fetchImpl,
      );
    }
  }
}

const POST_NOTICE: Record<PostAct["intent"], CrewNotice> = {
  create: "draft",
  save: "saved",
  publish: "posted",
  remove: "removed",
};

/**
 * `POST /{slug}/manage/posts` — create, save, publish or remove a post.
 *
 * A form returns (303) to `return_to`, else: the builder for a draft
 * (`/{slug}/new?draft=…`), the post's page once posted, the product's page
 * once removed. The query carries `notice` and `post` (the post's id).
 * An enhanced caller gets `{data: {post}}` or `{data: {removed: true}}`.
 */
export async function handlePostWrite(call: CrewCall): Promise<CrewAnswer> {
  const home = `/${call.slug}`;
  const back = returnTarget(call.fields, home);
  if (!call.token) return { kind: "signin", returnTo: back };
  const act = readPostAct(call.fields);
  if ("kind" in act && act.kind === "invalid") return failure(call, back, act);
  const crew = await crewFor(call, back);
  if (!crew.ok) return crew.answer;
  const postAct = act as PostAct;
  const result = await runPostAct(crew.token, crew.ids, postAct, call.fetchImpl);
  if (result.kind !== "ok") {
    // A publish that wrote its draft and was then refused: the form goes back
    // to the builder ON that draft, so nothing typed is lost.
    const draft = result.kind === "refused" ? result.fields.draft?.[0] : undefined;
    return notOk(call, draft ? withQuery(returnTarget(call.fields, composePostPagePath(call.slug)), { draft }) : back, result);
  }
  if (call.json) return json(200, { data: result.data });
  const notice = POST_NOTICE[postAct.intent];
  if ("removed" in result.data) return { kind: "redirect", to: withQuery(back, { notice }) };
  const post = result.data.post;
  const fallback =
    postAct.intent === "publish"
      ? productPostPagePath(call.slug, post.id)
      : withQuery(composePostPagePath(call.slug), { draft: post.id });
  return { kind: "redirect", to: withQuery(returnTarget(call.fields, fallback), { notice, post: post.id }) };
}

/** `GET /{slug}/manage/posts` — the product's posts, drafts included. */
export async function handlePostsRead(call: CrewCall): Promise<CrewAnswer> {
  return crewRead(call, (token, ids) => listCrewPosts(token, ids, call.fetchImpl));
}

// ─── milestones ────────────────────────────────────────────────────────────

type MilestoneData =
  | { milestone: CrewMilestone; stage: ProductStage; offeredPost?: CrewProductPost | null }
  | { milestones: CrewMilestone[]; stage: ProductStage }
  | { deleted: boolean; stage: ProductStage };

function runMilestoneAct(
  token: string,
  ids: CrewIds,
  act: MilestoneAct,
  fetchImpl?: CrewFetch,
): Promise<CrewResult<MilestoneData>> {
  switch (act.intent) {
    case "create":
      return createCrewMilestone(token, ids, act.body, fetchImpl);
    case "update":
      return updateCrewMilestone(token, ids, act.milestoneId, act.body, fetchImpl);
    case "reorder":
      return reorderCrewMilestones(token, ids, act.order, fetchImpl);
    case "delete":
      return deleteCrewMilestone(token, ids, act.milestoneId, fetchImpl);
    case "ship":
      return setCrewMilestoneShipped(token, ids, act.milestoneId, true, fetchImpl);
    case "unship":
      return setCrewMilestoneShipped(token, ids, act.milestoneId, false, fetchImpl);
  }
}

const MILESTONE_NOTICE: Record<MilestoneAct["intent"], CrewNotice> = {
  create: "milestone-added",
  update: "milestone-saved",
  reorder: "reordered",
  delete: "milestone-removed",
  ship: "shipped",
  unship: "unshipped",
};

/**
 * `POST /{slug}/manage/milestones` — create, update, reorder, delete, ship
 * or un-ship a milestone.
 *
 * A form returns (303) to `return_to`, else the product's page, with
 * `notice`; shipping also carries `offered` — the id of the draft Feature
 * shipped post core prepared — when there is one. An enhanced caller gets
 * core's own data (`{milestone, stage, offeredPost}` and so on).
 */
export async function handleMilestoneWrite(call: CrewCall): Promise<CrewAnswer> {
  const back = returnTarget(call.fields, `/${call.slug}`);
  if (!call.token) return { kind: "signin", returnTo: back };
  const act = readMilestoneAct(call.fields);
  if ("kind" in act) return failure(call, back, act);
  const crew = await crewFor(call, back);
  if (!crew.ok) return crew.answer;
  const result = await runMilestoneAct(crew.token, crew.ids, act, call.fetchImpl);
  if (result.kind !== "ok") return notOk(call, back, result);
  if (call.json) return json(200, { data: result.data });
  const offered = "offeredPost" in result.data ? (result.data.offeredPost?.id ?? null) : null;
  return { kind: "redirect", to: withQuery(back, { notice: MILESTONE_NOTICE[act.intent], offered }) };
}

/** `GET /{slug}/manage/milestones` — the milestones with their ids, and the stage. */
export async function handleMilestonesRead(call: CrewCall): Promise<CrewAnswer> {
  return crewRead(call, (token, ids) => listCrewMilestones(token, ids, call.fetchImpl));
}

// ─── seats ─────────────────────────────────────────────────────────────────

const SEAT_NOTICE: Record<SeatAct["intent"], CrewNotice> = {
  create: "seat-added",
  update: "seat-saved",
  delete: "seat-removed",
};

/**
 * `POST /{slug}/manage/seats` — open, edit (close, reopen) or remove a seat.
 *
 * A seat is a role opening; the routes are core's own role-opening routes,
 * addressed with the ids the crew check returned. A form returns (303) to
 * `return_to`, else the product's Crew tab, with `notice`; opening a seat
 * also carries `offered` — the id of the draft Help wanted post core
 * prepared — when there is one. An enhanced caller gets core's own data
 * (`{roleOpening, offeredPostId}` or `{deleted}`).
 */
export async function handleSeatWrite(call: CrewCall): Promise<CrewAnswer> {
  const back = returnTarget(call.fields, `/${call.slug}/crew`);
  if (!call.token) return { kind: "signin", returnTo: back };
  const act = readSeatAct(call.fields);
  if ("kind" in act) return failure(call, back, act);
  const crew = await crewFor(call, back);
  if (!crew.ok) return crew.answer;
  const result =
    act.intent === "create"
      ? await createCrewSeat(crew.token, crew.ids, act.body, call.fetchImpl)
      : act.intent === "update"
        ? await updateCrewSeat(crew.token, crew.ids, act.openingId, act.body, call.fetchImpl)
        : await deleteCrewSeat(crew.token, crew.ids, act.openingId, call.fetchImpl);
  if (result.kind !== "ok") return notOk(call, back, result);
  if (call.json) return json(200, { data: result.data });
  const offered = "offeredPostId" in result.data ? result.data.offeredPostId : null;
  return { kind: "redirect", to: withQuery(back, { notice: SEAT_NOTICE[act.intent], offered }) };
}

// ─── the listing's own fields, and needs-you ───────────────────────────────

/**
 * `POST /{slug}/manage/profile` — `tryUrl`, `tagline`, `pitch`, `slug`.
 *
 * A form returns (303) to `return_to`, else the product's page — at its NEW
 * address when the name changed — with `notice=profile-saved`.
 */
export async function handleProfileWrite(call: CrewCall): Promise<CrewAnswer> {
  const home = `/${call.slug}`;
  const back = returnTarget(call.fields, home);
  if (!call.token) return { kind: "signin", returnTo: back };
  const patch = readProfilePatch(call.fields);
  if ("kind" in patch) return failure(call, back, patch);
  const crew = await crewFor(call, back);
  if (!crew.ok) return crew.answer;
  const result = await updateCrewProfile(crew.token, crew.ids, patch, call.fetchImpl);
  if (result.kind !== "ok") return notOk(call, back, result);
  const slug = typeof result.data.profile?.slug === "string" ? result.data.profile.slug : call.slug;
  if (call.json) {
    return json(200, { data: { profile: { slug, tryUrl: result.data.profile?.tryUrl ?? null } } });
  }
  // A renamed product's old address is gone: a `return_to` that pointed at
  // it would land on a 404, so the rename goes to the new page instead.
  const to = slug !== call.slug ? `/${slug}` : back;
  return { kind: "redirect", to: withQuery(to, { notice: "profile-saved" }) };
}

/**
 * `POST /{slug}/manage/stage` — move the product one stage (SC-2). The step's
 * rule is core's (the contract's `validateStageChange`); a refusal comes
 * back with its field errors, which the Change stage popup draws under each
 * field. A form returns (303) to `return_to`, else the product's page, with
 * `notice=stage-moved`; an enhanced caller gets core's own data
 * (`{stage, milestone, posted}`).
 */
export async function handleStageWrite(call: CrewCall): Promise<CrewAnswer> {
  const back = returnTarget(call.fields, `/${call.slug}`);
  if (!call.token) return { kind: "signin", returnTo: back };
  const change = readStageChange(call.fields);
  if ("kind" in change) return failure(call, back, change);
  const crew = await crewFor(call, back);
  if (!crew.ok) return crew.answer;
  const result = await changeCrewStage(crew.token, crew.ids, change, call.fetchImpl);
  if (result.kind !== "ok") return notOk(call, back, result);
  if (call.json) return json(200, { data: result.data });
  return { kind: "redirect", to: withQuery(back, { notice: "stage-moved" }) };
}

/** `GET /{slug}/manage/needs-you` — pending seat requests and drafts. */
export async function handleNeedsYouRead(call: CrewCall): Promise<CrewAnswer> {
  return crewRead<{ needsYou: CrewNeedsYou }>(call, (token, ids) => fetchNeedsYou(token, ids, call.fetchImpl));
}

/**
 * A crew-only read, always JSON: `401` signed out (empty body, so a `fetch`
 * cannot mistake a sign-in page for an answer), `404` not on the crew,
 * `502` when the service failed, `200 {data}` otherwise.
 */
async function crewRead<T>(
  call: CrewCall,
  read: (token: string, ids: CrewIds) => Promise<CrewResult<T>>,
): Promise<CrewAnswer> {
  const asJson: CrewCall = { ...call, json: true };
  if (!call.token) return json(401, null);
  const crew = await crewFor(asJson, `/${call.slug}`);
  if (!crew.ok) return crew.answer.kind === "signin" ? json(401, null) : crew.answer;
  const result = await read(crew.token, crew.ids);
  if (result.kind === "unauthorized") return json(401, null);
  if (result.kind !== "ok") return failure(asJson, `/${call.slug}`, result);
  return json(200, { data: result.data });
}
