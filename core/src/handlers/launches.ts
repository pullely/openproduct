// Scheduling a launch (openproduct-commons LC0).
//
// THREE MAINTAINER ACTS AND ONE SWEEP, and the shape worth noticing is that
// there is no `launch` act. A launch fires because its MOMENT ARRIVED, not
// because somebody pressed a button — which is not a simplification, it is
// the point. A manual fire would make the scheduled moment decorative, and
// would order LC-2's board by who happened to be awake.
//
// EVERY REFUSAL CARRIES ITS SENTENCE. `checkLaunchable` in the contract
// answers one question for the handler, the studio and the tests alike, and
// that shared answer is what stops "the form let me do it and the API said
// no" — the failure mode a client-side copy of a server rule produces every
// time.
//
// THE CHECK IS ADVISORY AND THE DATABASE IS AUTHORITATIVE. Two unique indexes
// (one scheduled launch per listing, one launch per version) hold the rules
// even under a race that beats the read. What the check buys is not safety
// but EXPLANATION: a constraint violation is a 500 with a Postgres error in
// it, and a maintainer deserves the sentence instead.

import {
  STUDIO_LAUNCH_KEYS,
  checkLaunchable,
  launchAct,
  mayLaunchAct,
  parseLaunchPolicy,
  parseVersionLabel,
  type StudioLaunch,
} from "@openproduct/contracts";
import type { LaunchRecord } from "@openproduct/db";
import type { OpenproductRepository } from "@openproduct/db";

import type { ActorContext } from "../authorize.js";
import { listingActionAllowed, parseOperators } from "../authorize.js";
import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";
import { fanOut, type InboxWriter } from "./inbox.js";
import { generateId, launchPublicId, type Uuid } from "../ids.js";

export interface LaunchHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "launchEligibility"
    | "scheduleLaunch"
    | "rescheduleLaunch"
    | "cancelLaunch"
    | "getLaunch"
    | "listLaunchesForProfile"
    | "fireDueLaunches"
    // NF0 — who to tell when a launch goes live in a topic they follow.
    | "listTopicFollowers"
    | "listListingFollowers"
    | "writeNotification"
    | "getListingRole"
  >;
  now?: () => number;
  generateId?: () => Uuid;
}

/**
 * A launch is a `publish`-class act: owner or maintainer, never an operator
 * acting alone.
 *
 * REUSING OX4'S TABLE RATHER THAN WRITING A FOURTH RULE. An operator can
 * review a listing — that is the curation gate — and reviewing is not
 * announcing. Letting the allowlist schedule somebody else's launch would
 * make the estate a publisher of other people's products, which is exactly
 * the authority OPC-6 says this platform does not hold.
 */
async function mayLaunch(
  env: Env,
  actor: ActorContext,
  profileId: Uuid,
  deps: LaunchHandlerDeps,
): Promise<boolean> {
  const operator = parseOperators(env.OPENPRODUCT_OPERATORS).has(actor.subjectId);
  const role = await deps.repo.getListingRole(profileId, actor.subjectId);
  return listingActionAllowed("publish", role, operator);
}

/**
 * The studio's projection, assembled FIELD BY FIELD from the pinned key set
 * (OD3), never spread from the record.
 *
 * The id is the PUBLIC one. A raw row id in a URL is indistinguishable from
 * any other raw UUID, so a mistyped path would resolve as somebody else's
 * object rather than as "not found" — and `scheduledBy`, which the record
 * carries and this does not, is a subject id that has no business on a screen
 * (I3).
 */
function studioLaunchOf(row: LaunchRecord): StudioLaunch {
  void STUDIO_LAUNCH_KEYS;
  return {
    id: launchPublicId(row.id),
    state: row.state,
    versionLabel: row.versionLabel,
    scheduledFor: row.scheduledFor,
    launchedAt: row.launchedAt,
    cancelledAt: row.cancelledAt,
    missedAt: row.missedAt,
  };
}

/** The refusal every unauthorized path gives. 404, not 403 (see authorize.ts):
 *  "not yours" and "not there" are one answer. */
function hidden(requestId: string): Response {
  return errorResponse("not_found", "Not found", 404, requestId);
}

/** POST — schedule one. */
export async function handleScheduleLaunch(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  profileId: Uuid,
  deps: LaunchHandlerDeps,
): Promise<Response> {
  if (!(await mayLaunch(env, actor, profileId, deps))) return hidden(requestId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError(requestId, { body: ["Must be a valid JSON object"] });
  }
  const input = (body ?? {}) as { versionLabel?: unknown; scheduledFor?: unknown };

  const version = parseVersionLabel(input.versionLabel);
  if (!version.ok) return validationError(requestId, { versionLabel: [version.says] });

  const scheduledFor =
    typeof input.scheduledFor === "string" ? Date.parse(input.scheduledFor) : Number.NaN;
  if (!Number.isFinite(scheduledFor)) {
    return validationError(requestId, { scheduledFor: ["A moment is required"] });
  }

  const now = deps.now?.() ?? Date.now();
  const eligibility = await deps.repo.launchEligibility(profileId);
  // A listing the authorization step accepted but the eligibility read cannot
  // find has been deleted between the two. Same answer as never having
  // existed.
  if (!eligibility.profileId) return hidden(requestId);

  const verdict = checkLaunchable({
    isPublished: eligibility.isPublished,
    scheduledFor,
    now,
    versionLabel: version.label,
    consumedVersions: eligibility.consumedVersions,
    lastLaunchedAt: eligibility.lastLaunchedAt ? Date.parse(eligibility.lastLaunchedAt) : null,
    hasScheduled: eligibility.hasScheduled,
    policy: parseLaunchPolicy(env.OPENPRODUCT_LAUNCH_POLICY),
  });
  if (!verdict.ok) {
    // 409, not 422: the request is well-formed and the WORLD refuses it. The
    // reason is a stable token a studio can branch on and the sentence is what
    // it renders — a caller that cannot act on a refusal has been told nothing
    // (OD6's rule, and this is the same shape).
    return errorResponse("conflict", verdict.says, 409, requestId, { reason: verdict.reason });
  }

  const launch = await deps.repo.scheduleLaunch({
    id: (deps.generateId ?? generateId)(),
    profileId,
    versionLabel: version.label,
    scheduledFor: new Date(scheduledFor).toISOString(),
    scheduledBy: actor.subjectId,
  });
  return successResponse({ launch: studioLaunchOf(launch) }, requestId, 200);
}

/** PATCH — move a scheduled or missed one. */
export async function handleRescheduleLaunch(
  env: Env,
  request: Request,
  requestId: string,
  actor: ActorContext,
  profileId: Uuid,
  launchId: Uuid,
  deps: LaunchHandlerDeps,
): Promise<Response> {
  if (!(await mayLaunch(env, actor, profileId, deps))) return hidden(requestId);

  const existing = await deps.repo.getLaunch(launchId);
  // THE LAUNCH MUST BELONG TO THE LISTING IN THE PATH. Without this, a
  // maintainer of listing A could move listing B's launch by putting B's id in
  // the body — the authorization above checked A.
  if (!existing || existing.profileId !== profileId) return hidden(requestId);
  if (!mayLaunchAct("reschedule", existing.state)) {
    return errorResponse("conflict", launchAct("reschedule").refusal, 409, requestId, {
      reason: "wrong-state",
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError(requestId, { body: ["Must be a valid JSON object"] });
  }
  const scheduledFor =
    typeof (body as { scheduledFor?: unknown })?.scheduledFor === "string"
      ? Date.parse((body as { scheduledFor: string }).scheduledFor)
      : Number.NaN;
  if (!Number.isFinite(scheduledFor)) {
    return validationError(requestId, { scheduledFor: ["A moment is required"] });
  }

  const now = deps.now?.() ?? Date.now();
  const eligibility = await deps.repo.launchEligibility(profileId);
  const verdict = checkLaunchable({
    isPublished: eligibility.isPublished,
    scheduledFor,
    now,
    // ITS OWN VERSION IS NOT A CONFLICT WITH ITSELF. Moving a launch keeps its
    // label, so the label it already holds is filtered out before the check —
    // otherwise every reschedule would refuse as a duplicate of the thing
    // being rescheduled.
    versionLabel: existing.versionLabel,
    consumedVersions: eligibility.consumedVersions.filter((v) => v !== existing.versionLabel),
    lastLaunchedAt: eligibility.lastLaunchedAt ? Date.parse(eligibility.lastLaunchedAt) : null,
    // Nor is it a conflict with the scheduled launch that IS it.
    hasScheduled: eligibility.hasScheduled && existing.state !== "scheduled",
    policy: parseLaunchPolicy(env.OPENPRODUCT_LAUNCH_POLICY),
  });
  if (!verdict.ok) {
    return errorResponse("conflict", verdict.says, 409, requestId, { reason: verdict.reason });
  }

  const moved = await deps.repo.rescheduleLaunch(
    launchId,
    new Date(scheduledFor).toISOString(),
  );
  // Null means it fired between the check and the write. The state filter is
  // in the UPDATE's WHERE clause precisely so that race lands here rather than
  // rewriting a public record.
  if (!moved) {
    return errorResponse("conflict", launchAct("reschedule").refusal, 409, requestId, {
      reason: "wrong-state",
    });
  }
  return successResponse({ launch: studioLaunchOf(moved) }, requestId, 200);
}

/** DELETE — call one off. */
export async function handleCancelLaunch(
  env: Env,
  requestId: string,
  actor: ActorContext,
  profileId: Uuid,
  launchId: Uuid,
  deps: LaunchHandlerDeps,
): Promise<Response> {
  if (!(await mayLaunch(env, actor, profileId, deps))) return hidden(requestId);
  const existing = await deps.repo.getLaunch(launchId);
  if (!existing || existing.profileId !== profileId) return hidden(requestId);

  const at = new Date(deps.now?.() ?? Date.now()).toISOString();
  const cancelled = await deps.repo.cancelLaunch(launchId, actor.subjectId, at);
  if (!cancelled) {
    return errorResponse("conflict", launchAct("cancel").refusal, 409, requestId, {
      reason: "wrong-state",
    });
  }
  return successResponse({ launch: studioLaunchOf(cancelled) }, requestId, 200);
}

/** GET — everything this listing has scheduled, launched, missed or called off. */
export async function handleListLaunches(
  env: Env,
  requestId: string,
  actor: ActorContext,
  profileId: Uuid,
  deps: LaunchHandlerDeps,
): Promise<Response> {
  if (!(await mayLaunch(env, actor, profileId, deps))) return hidden(requestId);
  const launches = await deps.repo.listLaunchesForProfile(profileId);
  // The eligibility comes back WITH the list, so the studio can render the
  // form's refusal before somebody fills it in rather than after they submit.
  const eligibility = await deps.repo.launchEligibility(profileId);
  return successResponse(
    {
      launches: launches.map(studioLaunchOf),
      // The listing's own name, so the studio's crumbs can say which listing
      // this is. Echoing an opaque id back at the person who maintains it is
      // the surface admitting it did not bother to look the name up.
      slug: eligibility.slug,
      eligibility: {
        isPublished: eligibility.isPublished,
        hasScheduled: eligibility.hasScheduled,
        lastLaunchedAt: eligibility.lastLaunchedAt,
        consumedVersions: eligibility.consumedVersions,
      },
      // THE POLICY THIS API ACTUALLY ENFORCES, not the compiled-in default.
      // The cooldown is per-environment configuration, so a studio rendering
      // the default would state a rule the API does not hold anybody to — and
      // a maker reading "180 days" against a 90-day deployment has been told
      // something false by the surface that is supposed to explain the rules.
      policy: parseLaunchPolicy(env.OPENPRODUCT_LAUNCH_POLICY),
    },
    requestId,
    200,
  );
}

/**
 * The sweep's tick: fire what is due.
 *
 * NO FLOOR, unlike EN3's integrity sweep. That one reads a week of
 * endorsements and would burn a rolling window sixty times an hour on a
 * one-minute cron; this one touches an indexed partial scan of rows whose
 * moment has passed, which on a quiet estate matches nothing. And a floor here
 * would be a floor on how late a launch can be, which is the one thing a maker
 * chose a moment for.
 */
/**
 * NF0 — tell a topic's followers that something launched in it.
 *
 * THE TOPIC IS THE TARGET AND THE LAUNCH IS THE EVENT. Somebody following six
 * topics gets one row per launch, not one per topic per launch, and a re-run
 * of the sweep writes nothing.
 *
 * THE FOLLOWERS OF A TOPIC ARE READABLE; THE FOLLOWERS OF A PERSON ARE NOT.
 * `listTopicFollowers` has the kind as a literal in its SQL rather than as a
 * parameter, so this fan-out cannot be pointed at people — which is FL0's
 * promise kept by the shape of the query rather than by this call site
 * remembering.
 *
 * SWALLOWS EVERYTHING.
 */
async function notifyTopic(
  deps: LaunchHandlerDeps,
  slug: string,
  topic: string,
): Promise<void> {
  try {
    const followers = await deps.repo.listTopicFollowers(topic, 5000);
    if (followers.length === 0) return;
    await fanOut(deps as unknown as InboxWriter, {
      kind: "launch.topic",
      subjectIds: followers,
      // NOBODY DID THIS TO THEM. A launch is an act by its maintainers, and
      // the sentence names the topic rather than a person.
      actorHandle: null,
      targetKind: "topic",
      targetRef: topic,
      eventRef: `${slug}:${topic}`,
    });
  } catch {
    // Deliberately swallowed — see the note above.
  }
}

/**
 * PP1 — tell the people who follow THIS listing that it launched. The same
 * shape as the topic fan-out, one kind over, and the same failure posture: a
 * launch going live is the thing that had to happen; announcing it is not
 * allowed to undo it.
 */
async function notifyListing(deps: LaunchHandlerDeps, slug: string): Promise<void> {
  try {
    const followers = await deps.repo.listListingFollowers(slug, 5000);
    if (followers.length === 0) return;
    await fanOut(deps as unknown as InboxWriter, {
      kind: "launch.listing",
      subjectIds: followers,
      actorHandle: null,
      targetKind: "listing",
      targetRef: slug,
      eventRef: `${slug}:listing`,
    });
  } catch {
    // Announced or not, the launch is live.
  }
}

export async function handleFireDueLaunches(
  _env: Env,
  requestId: string,
  deps: LaunchHandlerDeps,
): Promise<Response> {
  const now = new Date(deps.now?.() ?? Date.now()).toISOString();
  const fired = await deps.repo.fireDueLaunches(now);

  // NF0 — tell the people who follow each launch's topic. AFTER the launches
  // are live and never before: whether we managed to announce one is a
  // separate question from whether it went out, and a notifier that could
  // fail the sweep would make launching less reliable than not having one.
  for (const launch of fired.fired) {
    await notifyListing(deps, launch.slug);
    if (!launch.topic) continue;
    await notifyTopic(deps, launch.slug, launch.topic);
  }

  return successResponse({ fired: { live: fired.live, missed: fired.missed } }, requestId, 200);
}
