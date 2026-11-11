// The defence sweep (openproduct-commons TS4).
//
// WHAT THIS DOES: runs four detectors over what is already on the estate,
// raises a flag per finding into TS3's queue, and applies the two
// consequences automation is allowed. It removes nothing, and there is no
// branch here that could — `FlagConsequence` has no member that deletes and
// `flags_consequence_check` refuses one at the database.
//
// NOT PUBLIC, AND NOT A READ. Same plane as EN3's integrity sweep and DS0's
// index rebuild, for the same reason: it walks the catalog, and a read that
// writes is a write amplifier somebody discovers by holding down refresh.
//
// ─── THE ORDER OF THE TWO WRITES, AGAIN ──────────────────────────────────
//
// The per-request executor is non-transactional. TS3 established the rule for
// moderation: the LEDGER row goes first, then the state change, because the
// two failure windows are not symmetric. This sweep inherits it exactly —
// `flags` row first, then `moderation_acts`, then `indexable` — so the
// failure modes are:
//
//   flag written, act and state not  →  a queue row a human will read, about
//                                       a listing nothing happened to. Visible,
//                                       harmless, self-correcting on the next
//                                       sweep.
//   state written, nothing else      →  a listing silently de-indexed with no
//                                       record of why and nothing to appeal.
//                                       TS-4 says every act is appealable;
//                                       this state makes that false.
//
// So the recoverable failure is the one taken, and every de-index this sweep
// performs has a `moderation_acts` row with `actor_id = 'automatic'` behind
// it — which 1330's CHECK explicitly permits for `deindex` and for nothing
// else.
//
// ─── WHY THE FOUR DETECTORS SHARE ONE SWEEP ──────────────────────────────
//
// Not for efficiency. They share a sweep because they share a FLOOR and a
// queue, and four crons with four floors is four ways for the estate's
// automated judgement to be half-running without anybody noticing. One
// response body says what all four did, which is the thing an operator
// actually needs to see.

import {
  BOARD_ELIGIBILITY_AGE_MS,
  COHORT_MATURITY_MS,
  COHORT_INTEGRITY_REASON,
  FLAG_CONSEQUENCE,
  FLAG_RECURS,
  INTEGRITY_WINDOW_MS,
  assessCohorts,
  assessFiller,
  boardEligible,
  brigadeEvidence,
  brigadeFlagged,
  cohortEvidence,
  fillerEvidence,
  type CohortObservation,
  type FlagKind,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { errorResponse, successResponse } from "../http.js";
import { generateId, type Uuid } from "../ids.js";

export interface DefenceHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listPitchesForDefence"
    | "listActsForCohorts"
    | "listLaunchEndorsements"
    | "listRingDiscountedProfiles"
    | "raiseFlag"
    | "setListingIndexable"
    | "appendModerationAct"
    | "discountCohort"
    | "getDefenceSweptAt"
    | "markDefenceSwept"
    | "appendAudit"
  >;
  now?: () => number;
  generateId?: () => Uuid;
}

/**
 * How many pitches one sweep reads.
 *
 * Bounded for EN3's reason: a sweep that times out flags nothing at all,
 * which is the defence silently switching itself off — worse than a sweep
 * that reads less. When the read truncates, the response SAYS SO.
 */
export const DEFENCE_MAX_PITCHES = 5_000;
export const DEFENCE_MAX_ACTS = 50_000;

/**
 * The floor. Six hours, not EN3's one.
 *
 * The slowest thing this sweep can notice is a cohort, and a cohort is not
 * assessed until it has been quiet for three days. Running hourly would read
 * the whole catalog's pitches seventy-two times to discover the same thing at
 * the end of it. A separate floor from EN3's is the reason 1480 has its own
 * row rather than a column on `integrity_sweep_state`.
 */
export const DEFENCE_FLOOR_MS = 6 * 60 * 60 * 1000;

/**
 * How far back the cohort read reaches.
 *
 * Longer than the maturity delay plus the window, or a cohort would mature
 * exactly as it fell out of the read and would never be assessed at all —
 * a gap that would look, from outside, exactly like a detector that works.
 */
export const COHORT_LOOKBACK_MS = COHORT_MATURITY_MS + 14 * 24 * 60 * 60 * 1000;

/** How far back the launch board's eligibility check looks. A launch older
 *  than this has its board position settled and re-checking it would re-flag
 *  something already triaged. */
export const LAUNCH_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

const SYSTEM_ORG = "00000000-0000-0000-0000-000000000000" as Uuid;

/** The one act automation may take on a listing, and the sentence recorded
 *  against it. Written once, here, so every de-index this estate performs
 *  reads the same in the ledger. */
const DEINDEX_REASON =
  "Automatic (openproduct-commons TS4): the pitch is long enough to assess and contains no " +
  "specific detail. The listing remains published and readable at its address; only crawler " +
  "amplification is withheld until somebody looks.";

interface SweepTally {
  raised: number;
  deindexed: number;
  discounted: number;
}

export async function handleDefenceSweep(
  _env: Env,
  request: Request,
  requestId: string,
  deps: DefenceHandlerDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse("unsupported", "Method not allowed", 405, requestId);
  }

  const now = deps.now?.() ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const newId = deps.generateId ?? generateId;
  const force = new URL(request.url).searchParams.get("force") === "1";

  // THE FLOOR BEFORE THE EXPENSIVE READ, as EN3 does. Checking after would
  // mean the not-due path still walked the whole catalog.
  const sweptAt = await deps.repo.getDefenceSweptAt();
  if (!force && sweptAt !== null && now - Date.parse(sweptAt) < DEFENCE_FLOOR_MS) {
    return successResponse({ swept: null, reason: "not_due", sweptAt }, requestId, 200);
  }

  const tally: SweepTally = { raised: 0, deindexed: 0, discounted: 0 };

  /**
   * Raise a flag and, only if it was genuinely new, take its consequence.
   *
   * THE GUARD IS THE POINT. `raiseFlag` returns null when a flag for this
   * (thing, kind) is already open, and acting anyway would re-append a ledger
   * row every six hours for one finding — turning TS5's transparency numbers
   * into a report on how often the cron ran.
   */
  const raise = async (
    kind: FlagKind,
    subjectKind: string,
    subjectRef: string,
    evidence: string,
  ): Promise<boolean> => {
    const flag = await deps.repo.raiseFlag({
      id: newId(),
      kind,
      subjectKind,
      subjectRef,
      evidence,
      consequence: FLAG_CONSEQUENCE[kind],
      at: nowIso,
      // Kinds whose evidence is frozen history are raised ONCE, dismissals
      // included: the accounts in a cohort have already gone quiet and the
      // launch has already happened, so re-raising would put the same
      // question back in front of a person who has answered it, every six
      // hours, forever.
      once: !FLAG_RECURS[kind],
    });
    if (flag === null) return false;
    tally.raised += 1;
    return true;
  };

  // ─── 1. filler ──────────────────────────────────────────────────────────
  const pitches = await deps.repo.listPitchesForDefence(DEFENCE_MAX_PITCHES);
  const pitchesTruncated = pitches.length >= DEFENCE_MAX_PITCHES;
  for (const pitch of pitches) {
    // The tagline is joined to the body because a placeholder lives in the
    // tagline as often as in the body, and the two are one piece of writing
    // to the reader looking at the page.
    const assessment = assessFiller(`${pitch.tagline ?? ""}\n\n${pitch.pitchBody ?? ""}`);
    if (!assessment.flagged) continue;
    if (!(await raise("filler", "listing", pitch.slug, fillerEvidence(assessment)))) continue;

    // LEDGER FIRST, THEN THE STATE. See the header: the recoverable failure
    // is a recorded act we did not carry out, not an unrecorded act we did.
    await deps.repo.appendModerationAct({
      id: newId(),
      subjectKind: "listing",
      subjectRef: pitch.slug,
      act: "deindex",
      actorId: "automatic",
      reason: DEINDEX_REASON,
      reportId: null,
      occurredAt: nowIso,
    });
    if (await deps.repo.setListingIndexable(pitch.profileId as Uuid, false)) tally.deindexed += 1;
  }

  // ─── 2. cohorts ─────────────────────────────────────────────────────────
  const acts = await deps.repo.listActsForCohorts(
    new Date(now - COHORT_LOOKBACK_MS).toISOString(),
    DEFENCE_MAX_ACTS,
  );
  const actsTruncated = acts.length >= DEFENCE_MAX_ACTS;
  const observations: CohortObservation[] = acts.map((row) => ({
    subjectId: row.subjectId,
    targetRef: row.targetRef,
    actedAt: Date.parse(row.actedAt),
    subjectFirstSeenAt: Date.parse(row.subjectFirstSeenAt),
  }));
  const cohorts = assessCohorts(observations, now);

  for (const cohort of cohorts) {
    if (!(await raise("cohort", "listing", cohort.targetRef, cohortEvidence(cohort)))) continue;
    // A COHORT IS DISCOUNTED AS A UNIT — EN3's third decision, which is about
    // rings and is exactly as true here: half a cohort discounted is a cohort
    // that still works.
    //
    // `discountCohort` RATHER THAN `restateIntegrity`, and the choice is
    // load-bearing. That method replaces the reason on conflict, which is
    // right for EN3 — its assessor re-decides its whole window every run —
    // and wrong here: an endorsement already discounted as part of a ring
    // would be rewritten to `cohort`, EN3 would rewrite it back an hour
    // later, and TS5's published counts would oscillate between two sweeps
    // describing one endorsement two ways. This one never overwrites, and it
    // reverses nothing: a cohort that turns out to be real is undone by a
    // human, through the flag raised beside it.
    tally.discounted += await deps.repo.discountCohort({
      profileId: cohort.targetRef,
      subjectIds: cohort.subjectIds,
      reason: COHORT_INTEGRITY_REASON,
      decidedBy: "automatic",
      at: nowIso,
    });
  }

  // ─── 3. rings, surfaced to a human ──────────────────────────────────────
  //
  // EN3 has been discounting these since it shipped and telling nobody. A
  // discount is a number moving; a ring is a thing somebody should probably
  // look at, and TS4 is where the second half arrives.
  const rings = await deps.repo.listRingDiscountedProfiles(
    new Date(now - INTEGRITY_WINDOW_MS).toISOString(),
  );
  for (const ring of rings) {
    await raise(
      "ring",
      "listing",
      ring.slug,
      `${ring.discounted} endorsements on this listing are currently discounted as part of a group ` +
        `whose endorsing overlaps almost completely. They remain recorded and a review can restore them.`,
    );
  }

  // ─── 4. the launch board's eligibility, observed ────────────────────────
  //
  // NOTHING IS DONE HERE. The board already ranks only what existed before
  // the launch, so the attack was answered structurally; this loop exists so
  // a person can SEE that it happened. `brigade` is the one flag kind whose
  // consequence is `queue-only`, and it is queue-only because a launch shared
  // in a newsletter produces the same numbers.
  const launches = await deps.repo.listLaunchEndorsements(
    new Date(now - LAUNCH_LOOKBACK_MS).toISOString(),
  );
  for (const launch of launches) {
    const eligibility = boardEligible(
      Date.parse(launch.launchedAt),
      launch.endorsements.map((e) => ({
        subjectId: e.subjectId,
        subjectFirstSeenAt: Date.parse(e.subjectFirstSeenAt),
      })),
    );
    if (!brigadeFlagged(eligibility)) continue;
    await raise("brigade", "launch", launch.launchId, brigadeEvidence(eligibility));
  }

  // ONE AUDIT ROW WHEN SOMETHING HAPPENED, and none when nothing did — EN3's
  // rule, for its reason: a trail where most rows say "no change" is a trail
  // nobody reads, and the ones that matter are the ones that moved something.
  if (tally.raised > 0 || tally.deindexed > 0 || tally.discounted > 0) {
    await deps.repo.appendAudit({
      id: newId(),
      orgId: SYSTEM_ORG,
      profileId: null,
      actorType: "system",
      actorId: "defence-sweep",
      type: "openproduct.defence_swept",
      description:
        `Raised ${tally.raised} flag(s), de-indexed ${tally.deindexed} listing(s) and ` +
        `discounted ${tally.discounted} endorsement(s).`,
      payload: {
        // COUNTS, NEVER SUBJECTS. A per-person integrity record in an audit
        // log is still a per-person integrity record (EN-4), and this sweep
        // handles more of them than any other.
        pitches: pitches.length,
        pitchesTruncated,
        acts: acts.length,
        actsTruncated,
        cohorts: cohorts.length,
        rings: rings.length,
        launches: launches.length,
        ...tally,
      },
      requestId,
      occurredAt: nowIso,
    });
  }

  // MARKED AFTER THE WORK LANDED, never before: a sweep that crashed halfway
  // must be due again, and recording the attempt would silently skip a cycle
  // for every failure.
  await deps.repo.markDefenceSwept(nowIso);

  return successResponse(
    {
      swept: {
        pitches: pitches.length,
        pitchesTruncated,
        acts: acts.length,
        actsTruncated,
        cohorts: cohorts.length,
        rings: rings.length,
        launches: launches.length,
        ...tally,
        // Published in the response so an operator reading it can tell
        // "nothing found" from "nothing could be found yet".
        cohortMaturityMs: COHORT_MATURITY_MS,
        boardEligibilityAgeMs: BOARD_ELIGIBILITY_AGE_MS,
      },
    },
    requestId,
    200,
  );
}
