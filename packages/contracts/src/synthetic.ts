// The synthetic reader of /health, as a contract (openproduct-operations OO1).
//
// `/health` was a document nobody fetched. OO1 is the worker that fetches it
// — on its own schedule, in its own worker (OO-1), as an anonymous visitor
// (OO-4) — and this file is what that worker and the pages it points at agree
// on: the cadence, the window the cache ratio is counted over, the two
// failure modes an alert must tell apart, the runbook anchor every alert
// line carries (OO-3), and the sentence it carries it in.
//
// WHY THE ANCHORS LIVE HERE. OO-D: a runbook is a long comment, and the way a
// comment stays true is that something walks it. The alert line names an
// anchor from THIS list; OO4's page renders THIS list; a test holds the two
// together. An anchor that vanished from the page would vanish from here,
// and the alert that named it would fail to build.

import { materialisationIntervalMinutes, type SloId } from "./slo.js";
import { SWEEP_PHASES, SWEEP_STALE_AFTER_SECONDS, type SweepPhase } from "./sweep-health.js";

/** Every five minutes — OO1's cadence, stated once. */
export const SYNTHETIC_CRON = "*/5 * * * *";
export const SYNTHETIC_INTERVAL_MINUTES = 5;

/**
 * The cache ratio is a share over the last hour (the SLO's own query says
 * so), which at one sample a cycle is twelve samples; the verdict is withheld
 * until half of them exist, so the first twenty-five minutes after a deploy
 * say "not yet" rather than "breached" on one cold read.
 */
export const CACHE_SAMPLE_WINDOW = 12;
export const CACHE_SAMPLE_MINIMUM = 6;

/**
 * OO3 — every deploy verifies itself. When `/health` starts answering with a
 * new version, the synthetic expects every PER-TICK phase to have run after
 * the version's upload within one materialisation interval plus this grace:
 * the tick after the deploy may be the one the deploy interrupted.
 */
export const DEPLOY_VERIFY_GRACE_MINUTES = 5;

/** How long after a deploy's upload the per-tick phases must all have run. */
export function deployVerifyWindowMs(): number {
  return (materialisationIntervalMinutes() + DEPLOY_VERIFY_GRACE_MINUTES) * 60_000;
}

/**
 * The phases that run on every materialisation tick — the ones a deploy can
 * be held to within one interval. Derived from the staleness table rather
 * than listed: a phase counted stale after three intervals is a phase that
 * runs every interval; the hourly, six-hourly and daily ones are not owed a
 * run inside ten minutes and are excused, deliberately, from OO3's check.
 */
export function perTickPhases(): readonly SweepPhase[] {
  const threeTicks = 3 * materialisationIntervalMinutes() * 60;
  return SWEEP_PHASES.filter((phase) => SWEEP_STALE_AFTER_SECONDS[phase] <= threeTicks);
}

/** Why a deploy went unverified — the word the line and the alert carry. */
export type DeployUnverifiedReason = "phases_stale" | "walk_failed";

/**
 * How a promise can be failing — and these need DIFFERENT PEOPLE, which is
 * why they are separate lines rather than one "degraded":
 *
 *   sweep_not_run    /health says the phase is stale, failed or never ran.
 *                    An operations problem: the schedule, the worker, core.
 *   page_disagrees   /health says the phase is healthy and the page does not
 *                    agree — search is empty for a listing published more
 *                    than an interval ago. A product defect: the index built
 *                    and left something out.
 *   cache_cold       the front page is answered by the worker rather than
 *                    the cache more than one time in ten. A configuration
 *                    or traffic-shape question, never an outage.
 *   unreachable      the product could not be asked at all — the request
 *                    failed or answered a 5xx. Before any of the above.
 */
export type FailureMode = "sweep_not_run" | "page_disagrees" | "cache_cold" | "unreachable";

export const FAILURE_MODES: readonly FailureMode[] = ["sweep_not_run", "page_disagrees", "cache_cold", "unreachable"];

export type SloState = "breached" | "recovered";

/** One page of the runbook (OO4 renders it; OO1's alert points at it). */
export interface RunbookEntry {
  /** The fragment on `/docs/runbook`. */
  readonly anchor: string;
  readonly slo: SloId;
  readonly mode: FailureMode;
  readonly title: string;
  /** What a visitor sees while this is true — the thing to go and look at. */
  readonly visitorSees: string;
  /** The internal route that re-fires the phase, where one exists. Core's
   *  paths, reached through the gateway's sweep; `null` where there is
   *  nothing to fire. */
  readonly refire: string | null;
  /** What "recovered" looks like — so the recovery line means one thing. */
  readonly recovered: string;
}

export const RUNBOOK_PATH = "/docs/runbook";

export const RUNBOOK: readonly RunbookEntry[] = [
  {
    anchor: "search-freshness-sweep-not-run",
    slo: "search-freshness",
    mode: "sweep_not_run",
    title: "The search index has not been rebuilt",
    visitorSees:
      "Search answers from an old index: a listing published since the last rebuild is not found by its own name, and /health reports the searchIndex phase as stale, failed or never run.",
    refire: "/internal/openproduct/search/rebuild",
    recovered: "/health reports searchIndex healthy with a lastRunAt inside the last thirty minutes, and the newest published listing is found by its slug.",
  },
  {
    anchor: "search-freshness-page-disagrees",
    slo: "search-freshness",
    mode: "page_disagrees",
    title: "The index is fresh and still does not answer",
    visitorSees:
      "/health says searchIndex is healthy, and a listing published more than one materialisation interval ago is not in its own search results. The rebuild ran and left it out — a product defect, not a schedule.",
    refire: null,
    recovered: "The listing is found by its slug on a plain anonymous search; nothing to re-fire, the cause is in the index's query.",
  },
  {
    anchor: "count-freshness-sweep-not-run",
    slo: "count-freshness",
    mode: "sweep_not_run",
    title: "The counts on the front page are old",
    visitorSees:
      "Every count renders, and every count is older than three integrity intervals; /health reports the integrity phase as stale, failed or never run. The dash legend on /docs/checks says what a missing count means.",
    refire: "/internal/openproduct/endorsements/integrity-sweep",
    recovered: "/health reports integrity healthy with a lastRunAt inside the last three hours.",
  },
  {
    anchor: "cache-hit-cold",
    slo: "cache-hit",
    mode: "cache_cold",
    title: "The front page is being rendered, not served",
    visitorSees:
      "Nothing — the page is correct and slower. cf-cache-status on an anonymous read of / is MISS, DYNAMIC or absent more than one time in ten over the last hour. Check that Workers Caching is enabled on openproduct-web and that the document still carries s-maxage.",
    refire: null,
    recovered: "The ratio of HIT over the synthetic's last hour of plain reads is at or above the target.",
  },
  {
    anchor: "unreachable",
    slo: "search-freshness",
    mode: "unreachable",
    title: "The product could not be asked",
    visitorSees:
      "The gateway or the site did not answer, or answered a 5xx, to an anonymous read. Every promise is unknown until it does; this line comes first and the others wait.",
    refire: null,
    recovered: "/health and / answer 200 to the synthetic's next cycle.",
  },
];

/** The anchor an alert for (slo, mode) points at. `unreachable` has one page for every promise. */
export function runbookAnchor(slo: SloId, mode: FailureMode): string {
  if (mode === "unreachable") return "unreachable";
  const entry = RUNBOOK.find((e) => e.slo === slo && e.mode === mode);
  if (!entry) throw new Error(`no runbook page for ${slo} / ${mode}`);
  return entry.anchor;
}

/**
 * The sentence an alert carries (OO-3: the runbook line, not a stack trace).
 * One line, no address, no body, nothing a stranger wrote.
 */
export function alertLine(slo: SloId, state: SloState, mode: FailureMode | null): string {
  if (state === "recovered") return `openproduct: ${slo} holds again.`;
  const because =
    mode === "sweep_not_run"
      ? "the sweep did not run"
      : mode === "page_disagrees"
        ? "the sweep ran and the page disagrees"
        : mode === "cache_cold"
          ? "the front page is rendered more than one time in ten"
          : "the product could not be asked";
  return `openproduct: ${slo} is breached — ${because}.`;
}

/** The sentence a deploy line carries (OO3): which version, and why it is not verified — or that it is now. */
export function deployAlertLine(version: string, state: SloState, reason: DeployUnverifiedReason | null): string {
  const short = version.slice(0, 8);
  if (state === "recovered") return `openproduct: deploy ${short} is verified — every per-tick phase has run since it.`;
  return reason === "walk_failed"
    ? `openproduct: deploy ${short} is not verified — one of the four things RS4 signed stopped being true.`
    : `openproduct: deploy ${short} is not verified — a per-tick phase has not run since it was uploaded.`;
}
