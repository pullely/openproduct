/**
 * What each sweep phase is, in one sentence a visitor can read
 * (openproduct-worldclass-v2 LI3).
 *
 * `/docs/checks` is the page that says what runs on openproduct without a
 * person. Until LI3 it named the four detectors and said nothing about the
 * materialisation phases that compute everything a visitor reads — the
 * index, the counts, the flags, the board, the digest and, since OS2, the
 * daily snapshots. A product that publishes its moderation record can
 * publish its cron: this is the copy, and `/health`'s document is the values.
 *
 * The copy lives in the contract rather than the page so the sentence beside
 * a phase on the public page and the phase's name in the health document
 * cannot drift apart: `SWEEP_PHASES` is the key of both.
 */
import type { ScreenshotBudget } from "./media-capture.js";
import {
  SWEEP_STALE_AFTER_SECONDS,
  type IngestionBudget,
  type SweepPhase,
  type SweepPhaseHealth,
} from "./sweep-health.js";

export interface SweepPhaseCopy {
  /** The name a person reads. */
  readonly title: string;
  /** What the phase computes, and for whom. One sentence. */
  readonly does: string;
  /** How often it is asked to run. Prose, not a cron expression. */
  readonly cadence: string;
}

export const SWEEP_PHASE_COPY: Record<SweepPhase, SweepPhaseCopy> = {
  catalogue: {
    title: "The catalogue",
    does: "Writes the one table the front page and the API read — every listed product with its latest observations and its pictures, in the published order — so a page is one indexed read rather than a join over everything. Not a cache: the page says when it was computed.",
    cadence: "Every ten minutes, after the upvote integrity pass and before the search index is built from it.",
  },
  searchIndex: {
    title: "Search index",
    does: "Rebuilds what the search box can find, from the same catalogue document the API serves — so search can never return a listing the catalogue would not.",
    cadence: "Every ten minutes, when a listing has changed since the last build.",
  },
  integrity: {
    title: "Upvote integrity",
    does: "Reads the week's upvotes for the patterns the published checks describe and sets the discount every count on the site shows.",
    cadence: "Hourly.",
  },
  defence: {
    title: "Automatic checks",
    does: "Runs the four detectors above and raises a flag for a person to read. It removes nothing.",
    cadence: "Every six hours.",
  },
  board: {
    title: "The day's board",
    does: "Ranks the day's launches by their discounted upvotes and writes the numbers the leaderboard and the home page show.",
    cadence: "Every ten minutes; a day's numbers close shortly after midnight UTC.",
  },
  digest: {
    title: "The weekly digest",
    does: "Cuts the week's page and queues the email for anyone who asked for it.",
    cadence: "Every ten minutes, doing work once a week.",
  },
  // OS2 — the sixth phase, which joined the health document when it gained
  // the durable floor the document requires.
  snapshots: {
    title: "Daily snapshots",
    does: "Records each public listing's shape once a day, so a listing page can say what changed since last week rather than only what is true now.",
    cadence: "Every ten minutes, doing work once a day — the first tick after midnight UTC.",
  },
};

/** How long a phase may go without running before the page calls it stale — prose from the same table `/health` reads. */
export function sweepStaleAfterCopy(phase: SweepPhase): string {
  const seconds = SWEEP_STALE_AFTER_SECONDS[phase];
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(seconds / 60)} minutes`;
}

export type SweepPhaseStanding = "running" | "stale" | "never_run" | "failed";

/**
 * One word for the page: what this phase's row should say about itself. The
 * page renders the times; this decides the sentence. `failed` outranks
 * everything, as it does in the health document.
 */
export function sweepPhaseStanding(health: SweepPhaseHealth): SweepPhaseStanding {
  if (health.reason === "failed") return "failed";
  if (health.reason === "never_run") return "never_run";
  if (health.reason === "stale") return "stale";
  return "running";
}

/** The sentence beside a phase, without a time in it — the page supplies that. */
export const SWEEP_STANDING_COPY: Record<SweepPhaseStanding, string> = {
  running: "Last ran",
  stale: "Stale — last ran",
  never_run: "Has never run",
  failed: "Failing — last failed",
};

/** What the page says when the gateway could not be asked at all. */
export const SWEEP_UNREACHABLE_COPY =
  "The gateway could not be read when this page was rendered, so nothing here is claimed. The page is rebuilt within a minute.";

/** The outward phase, which keeps no health row (RS2: opt-in per environment) and is described by its budget instead (LI4). */
export const INGESTION_COPY: SweepPhaseCopy = {
  title: "Repository observation",
  does: "Reads each listed repository for the week's merges and its last push — the numbers the observed row shows — and nothing a person typed.",
  cadence: "Hourly, at twenty-three past.",
};

/** The budget as one sentence: the cap, and whether the token that lifts GitHub's ceiling has been delivered. */
export function ingestionBudgetCopy(budget: IngestionBudget): string {
  const cap = `Up to ${budget.maxSourcesPerRun} repositories a run`;
  return budget.authenticated
    ? `${cap}, authenticated to GitHub.`
    : `${cap}, unauthenticated — GitHub allows ${budget.unauthenticatedReadsPerHour} reads an hour without a token, so the cap is what keeps a run inside it.`;
}

/**
 * MD4 — the other outward phase. Like repository observation it keeps no
 * health row (it is ingestion, opt-in per environment), so it is described
 * by its budget: the cap, the two windows, and whether this environment
 * captures at all.
 */
export const SCREENSHOT_COPY: SweepPhaseCopy = {
  title: "Screenshot capture",
  does: "Visits each listed product's own address in a browser and keeps a dated picture of it, shown in the observed frame and withdrawn past its window rather than frozen.",
  cadence: "With repository observation, hourly.",
};

/** The budget as one sentence — or, where nothing is configured, the honest
 *  absence: no capture is made, none is shown, and none is claimed. */
export function screenshotBudgetCopy(budget: ScreenshotBudget): string {
  const numbers = `Up to ${budget.maxPerRun} captures a run, each retaken after ${budget.refreshAfterDays} days and withdrawn from the page after ${budget.withdrawnAfterDays}.`;
  return budget.configured
    ? numbers
    : `Not configured in this environment: no address is visited, no capture is shown, and no listing is marked as missing one. ${numbers}`;
}
