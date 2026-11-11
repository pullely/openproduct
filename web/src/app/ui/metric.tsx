// Rendering an observed number (openproduct-commons SN2, realising I9).
//
// One component, because the rule has one shape wherever it applies: a value
// may be shown only beside the moment it was true, and a value nobody has
// observed is a dash rather than a zero.
//
// The wire already enforces half of this — `PublicMetric[]` carries only
// what may be rendered, so a withdrawn or unobserved metric never arrives.
// What is left for the surface is the part a projection cannot do: SAYING
// how old the number is, in words a reader understands, and marking a stale
// one visibly rather than letting it pass as current.

import type { PublicMetric } from "@openproduct/contracts";
import { absoluteOf, agoOf, fromEpochSeconds } from "./time";

import { DASH } from "./bits";

/** Metrics arrive as a list; every surface wants them by key. */
export function metricsByKey(metrics: PublicMetric[]): Map<string, PublicMetric> {
  return new Map(metrics.map((m) => [m.key, m]));
}

/**
 * The value, and when it was true.
 *
 * `metric` being undefined is the common case for most listings and renders
 * the dash — which is why this takes the metric rather than the number: a
 * caller cannot forget the absent branch, because there is no number to pass.
 */
export function MetricValue({
  metric,
  suffix,
}: {
  metric: PublicMetric | undefined;
  suffix?: string;
}) {
  if (!metric) {
    return <span className="text-muted-foreground">{DASH}</span>;
  }
  return (
    <span
      className={metric.state === "stale" ? "text-muted-foreground" : "text-foreground"}
      // THE TOOLTIP CARRIES THE ABSOLUTE, ALWAYS (VC6). It used to repeat
      // `agoOf` — so a reader who hovered a relative time to find out exactly
      // when got the same relative time back, and the exact moment was
      // available nowhere on the page. "Relative on the face, absolute
      // underneath" is the whole convention, and this attribute is the
      // "underneath".
      title={`Observed ${absoluteOf(metric.observedAt)}${
        metric.state === "stale" ? " — older than we would like, and shown as such" : ""
      }`}
    >
      <span className="tabular-nums">{metric.value.toLocaleString("en-GB")}</span>
      {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}

/**
 * The line beneath a stat: what the number counts, and when it was read.
 *
 * Required, not optional. A number with no unit and no moment beneath it is
 * exactly what OPC-7 exists to stop us printing, so the note is a parameter
 * this component cannot be called without.
 */
export function MetricNote({
  metric,
  now,
  unit,
}: {
  metric: PublicMetric | undefined;
  now: number;
  unit: string;
}) {
  if (!metric) return <>{unit}</>;
  return (
    <>
      {unit} · observed {agoOf(metric.observedAt, now)}
      {metric.state === "stale" ? " (stale)" : ""}
    </>
  );
}

/** Re-exported so VC6's move of these into `time.ts` changes no call site. */
export { absoluteOf, agoOf, fromEpochSeconds };
