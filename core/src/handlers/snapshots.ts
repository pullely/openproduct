// Snapshots (openproduct-worldclass PV4; the floor from openproduct-scale OS2).
//
// One sweep phase and one shared projection. The phase writes down what every
// public listing looks like today; the projection is the single place that
// decides WHICH fields a snapshot holds, so the thing written and the thing
// diffed cannot drift apart.
//
// ─── THE FLOOR, AND WHY IT WAS MISSING ───────────────────────────────────
//
// PV4 shipped this phase without one. Every other skippable phase in the
// sweep — DS0's rebuild, EN3's integrity, TS4's defence — decides it is DUE
// before it reads anything. This one read the profile, read its openings and
// upserted one row, per listing, on every ten-minute tick: three round trips
// × N × 144 a day, to keep N rows. The primary key made that correct and the
// entry that shipped it was proud of the primary key. Nothing made it cheap.
//
// So the first thing a tick does now is ONE read of `snapshot_sweep_state`,
// and if today is already recorded the tick is over. The second thing it does,
// when today is not, is TWO reads for the whole corpus rather than two per
// listing. The write loop is unchanged; what changed is everything before it.
//
// WHAT IS GIVEN UP, AND WHY THAT IS FINE. The upsert's `DO UPDATE` was written
// so the day's row held the listing's LATEST shape — the last tick of the day
// wins. With a floor the row holds its shape at the first tick after midnight
// UTC instead. For a diff compared across a week, a day's first minutes and
// its last are the same day; `diffSnapshots` and `DIFF_NOTHING` change
// nothing. The repository comment that stated the old intent is corrected.
//
// ─── THE PROJECTION IS THE POINT ─────────────────────────────────────────
//
// `snapshotFields` is called from exactly three places — the sweep that writes
// a row, and the two reads (the page, the API) that build today's side of a
// diff — and that is the whole safety argument. Two functions producing "the
// diffable shape" would disagree the first time either was edited, and the
// symptom would be a page announcing a change nobody made.
//
// It reads `DIFFABLE_FIELDS` from the contract rather than listing keys here,
// so adding a field to the diff is one edit in one place.

import {
  DIFFABLE_FIELDS,
  type DiffableField,
  type Snapshot,
} from "@openproduct/contracts";
import type { OpenproductRepository, ProfileRecord } from "@openproduct/db";

import type { Env } from "../env.js";
import { successResponse } from "../http.js";

export interface SnapshotHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "getSnapshotSweptAt"
    | "markSnapshotSwept"
    | "listPublicProfilesForSnapshot"
    | "countOpenRoleOpeningsByProfile"
    | "recordSnapshot"
    | "latestSnapshotBefore"
  >;
  now?: () => Date;
}

/**
 * The diffable shape of one listing, from the rows a page is built from.
 *
 * `openRoles` is a COUNT of open ones rather than the roles themselves: a
 * diff line saying "Open roles: 2 → 3" is a change a reader can act on, and
 * a diff of role titles would be a changelog of somebody's hiring.
 */
export function snapshotFields(
  profile: ProfileRecord,
  openRoleCount: number,
): Partial<Record<DiffableField, unknown>> {
  const all: Record<DiffableField, unknown> = {
    tagline: profile.tagline,
    pitch: profile.pitchBody,
    installLine: profile.installLine,
    category: profile.category,
    hosting: profile.hosting,
    pricing: profile.pricing,
    stack: profile.stack,
    licence: profile.repoLicence,
    language: profile.repoLanguage,
    openRoles: openRoleCount,
  };
  // Built from the contract's list rather than returned whole, so a key that
  // stops being diffable stops being SNAPSHOTTED in the same edit.
  const out: Partial<Record<DiffableField, unknown>> = {};
  for (const field of DIFFABLE_FIELDS) out[field] = all[field];
  return out;
}

/** The UTC day a snapshot is filed under. */
export function snapshotDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/** What one tick reports. `skipped` is the floor saying so. */
export interface SnapshotSweepResult {
  readonly takenOn: string;
  readonly recorded: number;
  readonly failed: number;
  readonly skipped: boolean;
}

/**
 * Today's snapshot for every public listing — or nothing, if today is done.
 *
 * THE FLOOR FIRST. One read; if the last completed sweep was today, return.
 * This is the line OS2 exists for, and it is the first line for the same
 * reason EN3's and TS4's are: a floor checked after the work is a floor that
 * did not floor anything.
 *
 * TWO READS FOR THE CORPUS, not two per listing. Then the same write loop PV4
 * had: one failure does not stop the rest (RS5's rule for every phase), and
 * the count returned says how much landed.
 *
 * THE MARK IS WRITTEN UNLESS EVERY ATTEMPT FAILED. A few row-specific failures
 * are a few listings whose baseline this week is a day older — `latestSnapshotBefore`
 * is STRICTLY older and reads across a gap without complaint. Not marking
 * would redo every listing every ten minutes for the sake of the one that
 * cannot be recorded, which is the amplification this floor ends. But if
 * NOTHING landed, nothing is marked: the corpus-wide failure (the engine was
 * down) should be retried on the next tick, and in that case the mark itself
 * would also have failed to write.
 */
export async function handleSnapshotSweep(
  env: Env,
  requestId: string,
  deps: SnapshotHandlerDeps,
): Promise<Response> {
  const now = (deps.now ?? (() => new Date()))();
  const takenOn = snapshotDay(now);
  const takenAt = now.toISOString();
  void env;

  const sweptAt = await deps.repo.getSnapshotSweptAt();
  if (sweptAt !== null && snapshotDay(new Date(sweptAt)) === takenOn) {
    const skipped: SnapshotSweepResult = { takenOn, recorded: 0, failed: 0, skipped: true };
    return successResponse({ snapshots: skipped }, requestId);
  }

  const [profiles, openCounts] = await Promise.all([
    deps.repo.listPublicProfilesForSnapshot(),
    deps.repo.countOpenRoleOpeningsByProfile(),
  ]);

  let recorded = 0;
  let failed = 0;
  for (const profile of profiles) {
    try {
      await deps.repo.recordSnapshot(
        profile.id as never,
        takenOn,
        takenAt,
        snapshotFields(profile, openCounts.get(profile.id) ?? 0) as Record<string, unknown>,
      );
      recorded += 1;
    } catch {
      // Counted, never thrown. The sweep's own line reports the number.
      failed += 1;
    }
  }

  if (profiles.length === 0 || recorded > 0) {
    await deps.repo.markSnapshotSwept(takenAt);
  }

  const result: SnapshotSweepResult = { takenOn, recorded, failed, skipped: false };
  return successResponse({ snapshots: result }, requestId);
}

/**
 * The baseline for one listing's diff, or null.
 *
 * Returns the contract's `Snapshot` shape so the page never touches a
 * database row, and `null` for "no earlier snapshot" — which
 * `diffSnapshots` turns into no section at all rather than into a page
 * claiming everything changed.
 */
export async function snapshotBaseline(
  repo: Pick<OpenproductRepository, "latestSnapshotBefore">,
  profileId: string,
  today: string,
): Promise<Snapshot | null> {
  const row = await repo.latestSnapshotBefore(profileId, today);
  if (!row) return null;
  return { takenAt: row.takenAt, fields: row.fields as Snapshot["fields"] };
}
