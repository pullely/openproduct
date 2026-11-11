// The signal plane's contract (openproduct-commons SN0).
//
// Three things live here, and all three are product decisions rather than
// schema: which metrics exist, how fresh each has to be, and what happens
// when one goes stale. Keeping them out of the migration means changing a
// freshness window is a review, not a database change.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE (SN-1, OPC-C):
//
//   an unobserved metric renders a DASH, never a zero.
//
// `0 commits this week` says the project is dead. An unmeasured project has
// said nothing. Every function below preserves that distinction, and the one
// that would be easiest to get wrong — `renderableValue` — returns null
// rather than 0 for every non-fresh state, deliberately.

import type { SignalSource } from "./provenance.js";

// ---------------------------------------------------------------------------
// What can be observed, by whom
// ---------------------------------------------------------------------------

export const METRIC_WINDOWS = ["7d", "30d", "all"] as const;
export type MetricWindow = (typeof METRIC_WINDOWS)[number];

export const METRICS = [
  "merges",
  "commits",
  "contributors_active",
  "tests_passing",
  "last_touched",
  "reviews",
  "endorsements",
  "openings_open",
  "roster_confirmed",
] as const;
export type MetricName = (typeof METRICS)[number];

/**
 * Which tiers can see which metric.
 *
 * This is OPC-C as data. A declared public repository can be read for commits
 * and last-touched without an App; it cannot be read for CI results, so
 * `tests_passing` names only `linked_repo` — and a declared-repo listing
 * therefore has no tests figure at all rather than a zero one.
 */
export const METRIC_SOURCES: Record<MetricName, readonly SignalSource[]> = {
  merges: ["linked_repo", "declared_repo"],
  commits: ["linked_repo", "declared_repo"],
  contributors_active: ["linked_repo", "declared_repo"],
  // CI is the tier-1 line. We cannot see a declared repository's checks.
  tests_passing: ["linked_repo"],
  last_touched: ["linked_repo", "declared_repo"],
  reviews: ["linked_repo"],
  // Endorsements and openings are openproduct's OWN facts, not observations
  // of anything external — they are counted here so the read path has one
  // shape, and `operator` is the honest source for "we computed it".
  endorsements: ["operator"],
  openings_open: ["operator"],
  roster_confirmed: ["operator"],
};

export function metricObservableBy(metric: MetricName, source: SignalSource): boolean {
  return METRIC_SOURCES[metric].includes(source);
}

// ---------------------------------------------------------------------------
// Freshness (SN-3, OPC-7)
// ---------------------------------------------------------------------------

/**
 * How long a metric may go unrefreshed before the surface stops trusting it.
 *
 * Per-metric, because the underlying facts move at different speeds: a commit
 * count is a day's news, a licence is a month's. Past the window a value is
 * STALE and renders with its age visible; past twice the window it is
 * WITHDRAWN and does not render at all.
 */
export const FRESHNESS_WINDOW_MS: Record<MetricName, number> = {
  merges: 24 * 60 * 60 * 1000,
  commits: 24 * 60 * 60 * 1000,
  contributors_active: 7 * 24 * 60 * 60 * 1000,
  tests_passing: 7 * 24 * 60 * 60 * 1000,
  last_touched: 24 * 60 * 60 * 1000,
  reviews: 7 * 24 * 60 * 60 * 1000,
  // OB3 — recomputed on write AND re-counted on every catalogue tick, which
  // republishes a total when it moves (a vote ageing out of the week moves
  // `7d` with nobody voting) and otherwise every twelve hours. The window is
  // a day so a quiet build keeps its number: at an hour, every build nobody
  // had voted on lately printed a dash, which said our count was broken when
  // it was only unchanged.
  endorsements: 24 * 60 * 60 * 1000,
  openings_open: 60 * 60 * 1000,
  roster_confirmed: 60 * 60 * 1000,
};

/**
 * OB3 — how old an endorsement count may grow before the catalogue tick
 * republishes it unchanged: half its freshness window, so a quiet build's
 * number is always fresh and a moved one is rewritten on the tick it moves.
 */
export const ENDORSEMENT_REPUBLISH_MS = FRESHNESS_WINDOW_MS.endorsements / 2;

/**
 * `fresh` renders as a number. `stale` renders as a number WITH its age.
 * `withdrawn` and `unobserved` render as a dash — and are two different
 * things, which is why they are two states:
 *
 *   withdrawn   we watched, and stopped being able to
 *   unobserved  we never could, because this listing's tier cannot see it
 *
 * The page says different things for each, and conflating them would tell a
 * reader that a manifest-only listing had gone dark.
 */
export const METRIC_STATES = ["fresh", "stale", "withdrawn", "unobserved"] as const;
export type MetricState = (typeof METRIC_STATES)[number];

export interface ObservedMetric {
  readonly metric: MetricName;
  readonly window: MetricWindow;
  readonly value: number;
  readonly source: SignalSource;
  /** ISO-8601. */
  readonly observedAt: string;
}

/**
 * The state machine, as a pure function of (metric, observedAt, now).
 *
 * Deliberately total: `null` in means `unobserved` out, which is what a
 * listing whose tier cannot see this metric passes. A future `observedAt` is
 * treated as fresh rather than rejected — clock skew between our ingester and
 * a repository host is real, and refusing a number because it is three
 * seconds ahead would be a worse bug than accepting it.
 */
export function metricState(
  metric: MetricName,
  observedAt: string | null,
  now: number,
  sourceWithdrawn = false,
): MetricState {
  if (observedAt === null) return "unobserved";
  if (sourceWithdrawn) return "withdrawn";
  const at = Date.parse(observedAt);
  if (Number.isNaN(at)) return "unobserved";
  const age = now - at;
  const window = FRESHNESS_WINDOW_MS[metric];
  if (age <= window) return "fresh";
  if (age <= window * 2) return "stale";
  return "withdrawn";
}

/**
 * The number a surface may render, or null.
 *
 * THE ONE FUNCTION IN THIS MODULE MOST LIKELY TO BE GOT WRONG, so it is the
 * one written to make the wrong thing impossible: every state but `fresh` and
 * `stale` returns null, and null renders as a dash. There is no code path
 * here that produces 0 from an absence.
 */
export function renderableValue(
  metric: ObservedMetric | null,
  now: number,
  sourceWithdrawn = false,
): { value: number; state: MetricState; observedAt: string } | null {
  if (metric === null) return null;
  const state = metricState(metric.metric, metric.observedAt, now, sourceWithdrawn);
  if (state === "withdrawn" || state === "unobserved") return null;
  return { value: metric.value, state, observedAt: metric.observedAt };
}

// ---------------------------------------------------------------------------
// The public activity vocabulary
// ---------------------------------------------------------------------------

/**
 * The design's seven verbs, and nothing else.
 *
 * Closed for two reasons, and the second is the one that matters: it renders
 * in a 74px mono column, AND an open vocabulary would let an ingester write
 * attacker-influenced text onto a public, crawled page.
 */
export const ACTIVITY_KINDS = [
  "merged",
  "thread",
  "joined",
  "snapshot",
  "opening",
  "answered",
  "declined",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const MAX_ACTIVITY_SUMMARY = 200;

/** One row of the public timeline, as a visitor sees it. */
export interface PublicActivityEvent {
  kind: ActivityKind;
  summary: string;
  /** The actor's authored display name, or null — which is what renders when
   *  the person has not confirmed their place on this listing (OPC-5). */
  actorName: string | null;
  /** Their handle, when they have a public profile to link to (CG1). Null
   *  means the name renders as plain text, never as a dead link (XP-5). */
  actorHandle: string | null;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Ingestion tiers
// ---------------------------------------------------------------------------

/** How often a source is polled, by how alive it has looked. SN4 tunes these;
 *  they are here so the cost of ingestion is a number someone chose. */
export const POLL_INTERVAL_MS = {
  /** Something landed in the last week. */
  active: 6 * 60 * 60 * 1000,
  /** Nothing recent, but the source still answers. */
  dormant: 7 * 24 * 60 * 60 * 1000,
} as const;

/** Consecutive failures before a source is withdrawn. Past this we stop
 *  polling AND stop rendering its metrics — the two go together, because a
 *  number whose source we have given up on is what OPC-7 exists to prevent. */
export const SOURCE_FAILURE_TOLERANCE = 8;

/** Exponential, capped: a repository that 404s forever must not cost more
 *  than one request a day. */
export function backoffMs(failureCount: number): number {
  const base = 15 * 60 * 1000;
  const capped = Math.min(failureCount, 7);
  return Math.min(base * 2 ** capped, 24 * 60 * 60 * 1000);
}
