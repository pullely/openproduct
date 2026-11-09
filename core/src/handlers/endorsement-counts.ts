// The public endorsement total (openproduct-commons EN2).
//
// EN-3's RULE, MADE CONCRETE: the count is a RECOMPUTED METRIC, never a
// counter column. A counter cannot be restated without erasing history, and
// it drifts the first time a write path forgets to touch it — which is the
// first time somebody adds a write path. A count over the append-only log,
// written into SN0's metrics store, can be restated as often as EN3's sweep
// needs to and stays auditable because the log it came from is still there.
//
// WRITTEN FROM EXACTLY TWO PLACES, and both are here:
//
//   the act          endorse and withdraw recompute the one listing they
//                    touched, so the number a person just moved is right on
//                    the next read rather than at the next sweep
//   the restatement  EN3's sweep recomputes every listing whose discount
//                    changed, because a total that ignores the integrity
//                    model until an hour later is a total the model does not
//                    actually defend
//
// One function, called from both, so the two cannot disagree about what a
// total means (which is the same reason `countsTowardTotal` is one function).
//
// WHY THE METRICS STORE RATHER THAN A DEDICATED SHAPE. SN0 planned for this:
// `endorsements` is in the metric vocabulary with `operator` as its source —
// "we computed it" said honestly — and a one-hour freshness window whose
// comment reads "recomputed on write, so a stale one means the recompute
// itself is broken". Riding that store means the total arrives on every
// surface through the SAME read as every other number, carrying the moment it
// was true (I9), and a broken recompute shows up as a dash rather than as a
// silently frozen figure.

import { cleanVoteMark } from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import { generateId, type Uuid } from "../ids.js";

/** The two windows a listing's endorsements are published in. */
export const ENDORSEMENT_METRIC = "endorsements";
/** `total`, not `all`, so the METRIC KEY IS THE FORMULA ID: `endorsements.total`
 *  is both what the wire calls this number and what `/docs/formulas` calls the
 *  rule behind it. One string, so a reader following the id from the API lands
 *  on the sentence, and a test can check the mapping without a lookup table
 *  somebody has to keep in step. */
export const ENDORSEMENT_TOTAL_WINDOW = "total";
export const ENDORSEMENT_RECENT_WINDOW = "7d";

export type CountsRepo = Pick<
  OpenproductRepository,
  "countEndorsements" | "writeMetric" | "setCleanVotes"
>;

/**
 * Recompute and publish one listing's endorsement figures.
 *
 * `observedAt` IS THE MOMENT WE COUNTED, not the moment of the endorsement
 * that triggered it. That distinction is the whole of I9 on this metric: the
 * page renders "as of", and "as of" has to mean when the number was true,
 * which for a derived figure is when it was derived.
 *
 * BOTH WINDOWS ARE ALWAYS WRITTEN, including when they are zero. This is the
 * one place in the program where a zero is published, and EN0 wrote down why:
 * an unobserved METRIC means nobody looked, but an endorsement total of zero
 * means we looked at a complete record — the endorsements table, all of it —
 * and found nothing. "No one has endorsed this yet" is true and useful.
 * Absence here would be a coyness that helps nobody.
 *
 * NEVER THROWS INTO THE CALLER'S PATH. A failed recompute must not fail the
 * endorsement: the act is the thing the person did, the number is our
 * bookkeeping, and losing a click because a metrics insert had a bad minute
 * is the wrong trade. A stale total is visible (the freshness window turns it
 * into a dash within the hour) and the next sweep fixes it.
 */
export async function publishEndorsementCounts(
  repo: CountsRepo,
  profileId: Uuid,
  now: number,
  newId: () => Uuid = generateId,
): Promise<boolean> {
  const at = new Date(now).toISOString();
  try {
    const counts = await repo.countEndorsements(profileId, at);
    for (const [window, value] of [
      [ENDORSEMENT_TOTAL_WINDOW, counts.total],
      [ENDORSEMENT_RECENT_WINDOW, counts.recent],
    ] as const) {
      await repo.writeMetric({
        id: newId(),
        profileId,
        metric: ENDORSEMENT_METRIC,
        window,
        value,
        // `operator` is the honest source for "we computed it" — SN0's own
        // word for a fact that is openproduct's rather than an observation of
        // anything external.
        source: "operator",
        observedAt: at,
      });
    }
    // PV3 — THE MARK, BESIDE THE TOTALS AND FROM THE SAME TWO NUMBERS.
    //
    // Here rather than in a sweep phase of its own for the reason the totals
    // are here: this function already holds `counted` and `discounted`, and
    // two paths computing the same ratio is two paths that can disagree about
    // a mark and a number a reader sees side by side.
    //
    // The RATIO IS COMPUTED AND THE COUNT IS DROPPED. `counts.discounted`
    // reaches this line and no further: what is written is a boolean, and
    // there is no column, projection or metric it could travel in (EN3's
    // fifth decision, PV3's done-when).
    await repo.setCleanVotes(
      profileId,
      cleanVoteMark({ counted: counts.total, discounted: counts.discounted }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Recompute a set of listings, for EN3's restatement.
 *
 * Sequential rather than concurrent: a sweep that restated a thousand
 * listings would open a thousand simultaneous writes against one connection,
 * and the sweep has no deadline a person is waiting on. One failure does not
 * stop the rest — a half-recomputed set is strictly better than an
 * un-recomputed one, and the count returned says how much landed.
 */
export async function publishEndorsementCountsFor(
  repo: CountsRepo,
  profileIds: readonly string[],
  now: number,
  newId: () => Uuid = generateId,
): Promise<number> {
  let published = 0;
  for (const profileId of profileIds) {
    if (await publishEndorsementCounts(repo, profileId as Uuid, now, newId)) published += 1;
  }
  return published;
}
