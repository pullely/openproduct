// The three sentences (openproduct-operations OO0).
//
// THE SLOs, AS PROSE A READER COULD CHECK, before anything measures them.
// Three, transcribed rather than invented: each is a promise the product
// already keeps by construction, stated with the number that defines it and
// the constant that number comes from — so a test can hold the sentence to
// the code, and the page cannot drift from either.
//
// ─── OO-2: WRITTEN BEFORE THE FIRST ALERT ────────────────────────────────
//
// An alert with no sentence behind it pages somebody about a threshold
// nobody agreed to. These are the sentences; OO1's reader and OO3's deploy
// check measure them; OO2's vocabulary is what a log line has to say for a
// query to find the moments they were broken. The query is COMMITTED BESIDE
// THE SENTENCE (`query` below), so the promise and the search for its
// breaches are reviewed together.

import { SWEEP_CRON } from "./sweep-schedule.js";
import { SWEEP_STALE_AFTER_SECONDS } from "./sweep-health.js";

/**
 * How often the inward half of the sweep runs, in minutes, read off its cron.
 * `*\/10 * * * *` is ten; a schedule that is not "every N minutes" has no
 * single interval and this says so by throwing, which the test would catch.
 */
export function materialisationIntervalMinutes(): number {
  const match = /^\*\/(\d+) \* \* \* \*$/.exec(SWEEP_CRON.materialisation);
  if (!match) throw new Error(`materialisation cron is not every-N-minutes: ${SWEEP_CRON.materialisation}`);
  return Number(match[1]);
}

/**
 * OPP5's promise: an anonymous front-page read is a colo cache hit nine
 * times in ten. OPP5 made the document plane cacheable and saw `HIT` in
 * production; it did not count a ratio. This is the ratio it promised, and
 * OO1's reader is what counts it.
 */
export const CACHE_HIT_TARGET = 0.9;

export type SloId = "search-freshness" | "count-freshness" | "cache-hit";

export interface Slo {
  readonly id: SloId;
  /** The promise, in one sentence, with its numbers as digits. */
  readonly sentence: string;
  /** The numbers the sentence carries, each with the constant it is read from. */
  readonly thresholds: ReadonlyArray<{ readonly value: number; readonly unit: string; readonly constant: string }>;
  /**
   * Where a breach is found. A Workers Logs query over the vocabulary
   * (`log-vocabulary.ts`) for the two the sweep's own lines can answer; the
   * cache ratio is not a log line — it is Cloudflare's cache analytics for
   * the apex, which OO1's reader counts — and the entry says so rather than
   * inventing a query that would return nothing.
   */
  readonly query: { readonly source: "workers-logs" | "cache-analytics"; readonly text: string };
}

const searchStaleMinutes = SWEEP_STALE_AFTER_SECONDS.searchIndex / 60;
const integrityStaleHours = SWEEP_STALE_AFTER_SECONDS.integrity / 3600;

export const SLOS: readonly Slo[] = [
  {
    id: "search-freshness",
    sentence: `A published listing is in search within ${materialisationIntervalMinutes()} minutes — one materialisation interval — and the search index is reported unhealthy on /health after ${searchStaleMinutes} minutes.`,
    thresholds: [
      { value: materialisationIntervalMinutes(), unit: "minutes", constant: "SWEEP_CRON.materialisation" },
      { value: searchStaleMinutes, unit: "minutes", constant: "SWEEP_STALE_AFTER_SECONDS.searchIndex" },
    ],
    query: { source: "workers-logs", text: 'msg = "sweep_phase_failed" AND phase = "search_rebuild"' },
  },
  {
    id: "count-freshness",
    sentence: `Every count on the front page is younger than ${integrityStaleHours} hours — three integrity intervals — or the integrity phase is reported unhealthy on /health.`,
    thresholds: [{ value: integrityStaleHours, unit: "hours", constant: "SWEEP_STALE_AFTER_SECONDS.integrity" }],
    query: { source: "workers-logs", text: 'msg = "sweep_phase_failed" AND phase = "integrity"' },
  },
  {
    id: "cache-hit",
    sentence: `An anonymous front-page read is a colo cache hit ${CACHE_HIT_TARGET * 10} times in 10.`,
    thresholds: [{ value: CACHE_HIT_TARGET, unit: "ratio", constant: "CACHE_HIT_TARGET" }],
    query: {
      source: "cache-analytics",
      text: "cf-cache-status = HIT over requests to the apex `/` with no cookie, as a share of all such requests, over the last hour",
    },
  },
];

/** The heading the page gives the three. */
export const SLO_HEADING = "What we promise";
export const SLO_INTRO =
  "Three sentences, each one a reader of the product could check, written before anything alerts on them. The number in each is read from the constant beside it, so the sentence cannot drift from the code.";
