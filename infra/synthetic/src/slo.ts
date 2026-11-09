// From what the walk saw to a verdict on each promise (OO1).
//
// TWO FAILURE MODES THAT NEED DIFFERENT PEOPLE. The plan's sentence: "the
// sweep did not run (/health degraded — an operations problem) and the sweep
// ran and the page disagrees (/health healthy, search empty — a product
// defect). Each is its own alert line." That distinction is made HERE and
// nowhere else; the state keeps the mode, the alert carries it, the runbook
// has a page for each.
//
// The cache promise is not judged here: one cycle is one sample, and a ratio
// needs a window. `state.ts` keeps the window and judges from it.

import { materialisationIntervalMinutes, type SloId } from "@openproduct/contracts";

import type { CacheSample, Verdict } from "./state.js";
import type { Observation } from "./walk.js";

/** A listing published this recently may honestly not be in search yet: one
 *  interval, plus the same again as grace for a rebuild that started before
 *  the publish landed. */
export function searchGraceMs(): number {
  return 2 * materialisationIntervalMinutes() * 60_000;
}

export interface Judgement {
  readonly verdicts: readonly Verdict[];
  readonly cacheSample: CacheSample | null;
  readonly frontReachable: boolean;
}

function unreachable(slo: SloId): Verdict {
  return { slo, holding: false, mode: "unreachable" };
}

export function judge(obs: Observation, now: Date): Judgement {
  const verdicts: Verdict[] = [];

  if (!obs.health.reachable || obs.health.phases === null) {
    // The gateway did not answer, or answered that it could not ask core.
    // Every sweep promise is unknown; "unreachable" comes first and the
    // others wait — a stale-index alert on top of an outage is noise.
    verdicts.push(unreachable("search-freshness"), unreachable("count-freshness"));
  } else {
    const phases = obs.health.phases;

    // ── search-freshness ──
    const index = phases.searchIndex;
    if (!index || !index.healthy) {
      verdicts.push({ slo: "search-freshness", holding: false, mode: "sweep_not_run" });
    } else if (obs.seeded.slug !== null && obs.search.reachable === false) {
      verdicts.push(unreachable("search-freshness"));
    } else {
      const publishedAt = Date.parse(obs.seeded.publishedAt ?? "");
      const oldEnough = Number.isFinite(publishedAt) && now.getTime() - publishedAt > searchGraceMs();
      const disagrees = obs.seeded.slug !== null && oldEnough && obs.search.found === false;
      verdicts.push(
        disagrees
          ? { slo: "search-freshness", holding: false, mode: "page_disagrees" }
          : { slo: "search-freshness", holding: true, mode: null },
      );
    }

    // ── count-freshness ──
    const integrity = phases.integrity;
    verdicts.push(
      !integrity || !integrity.healthy
        ? { slo: "count-freshness", holding: false, mode: "sweep_not_run" }
        : { slo: "count-freshness", holding: true, mode: null },
    );
  }

  // ── the cache sample ──
  const frontReachable = obs.front.reachable && obs.front.status === 200;
  const cacheSample: CacheSample | null = frontReachable ? (obs.front.cacheStatus === "HIT" ? "HIT" : "MISS") : null;

  return { verdicts, cacheSample, frontReachable };
}
