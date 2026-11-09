// The public record (openproduct-commons TS5).
//
// ONE READ, SIX QUERIES, NO ARGUMENTS. Every figure comes from a table this
// estate writes to before it acts, and nothing here computes a judgement —
// the arithmetic that turns counts into rates lives in the contract, where a
// test can pin it, and the page renders what this returns.
//
// PUBLIC AND ANONYMOUS, like every other read on the OD3 path. It resolves no
// actor, nothing about who is asking enters the answer, and the bytes are
// identical for a signed-in reader and a signed-out one (I6). That is not
// incidental to a transparency report: a page whose numbers could differ by
// who is looking is not one anybody can quote.
//
// CACHED FOR AN HOUR, deliberately longer than the sixty seconds the
// directory uses. The directory's freshness is a product property — a listing
// published a minute ago should appear — while these are quarterly-scale
// aggregates over ninety days, and a number that moves between two refreshes
// invites reading noise as a trend.

import {
  TRANSPARENCY_WINDOW_DAYS,
  transparencySince,
  type ActCount,
  type AppealCount,
  type DiscountCount,
  type FlagCount,
  type ReportCount,
  type TransparencyReport,
} from "@openproduct/contracts";
import type { OpenproductRepository } from "@openproduct/db";

import type { Env } from "../env.js";
import { successResponse } from "../http.js";

export interface TransparencyHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "countModerationActsSince"
    | "countReportsSince"
    | "countAppealsSince"
    | "countAppealReversalsSince"
    | "integrityDisclosure"
    | "flagDisclosure"
  >;
  now?: () => number;
}

/** An hour. See the header. */
const CACHE_SECONDS = 3600;

export async function handleTransparency(
  _env: Env,
  requestId: string,
  deps: TransparencyHandlerDeps,
): Promise<Response> {
  const now = deps.now?.() ?? Date.now();
  const since = transparencySince(now);

  // SIX READS IN PARALLEL, and they are allowed to be inconsistent with each
  // other by milliseconds. They are ninety-day aggregates; a report filed
  // between the second query and the fifth changes no figure anybody would
  // notice, and wrapping them in a transaction to prevent that would cost a
  // held connection on the estate's most cacheable page.
  const [acts, reports, appeals, reversals, discounts, flags] = await Promise.all([
    deps.repo.countModerationActsSince(since),
    deps.repo.countReportsSince(since),
    deps.repo.countAppealsSince(since),
    deps.repo.countAppealReversalsSince(since),
    deps.repo.integrityDisclosure(since),
    deps.repo.flagDisclosure(since),
  ]);

  const report: TransparencyReport = {
    since,
    until: new Date(now).toISOString(),
    // The casts are narrowing a `string` from SQL to the closed vocabulary
    // its own CHECK already enforces. The database is the authority on which
    // values can exist; re-validating here would be a second list to keep in
    // step, and a value that failed it would have nowhere to go but silently
    // out of a published total.
    acts: acts as ActCount[],
    reports: reports as ReportCount[],
    appeals: appeals as AppealCount[],
    appealsReversed: reversals,
    discounts: discounts as DiscountCount[],
    flags: flags as FlagCount[],
  };

  // `public, max-age=N` EXACTLY. The gateway honours a downstream cache
  // directive only in that shape and otherwise applies its own sixty seconds
  // — deliberately, so no downstream can make a public read uncacheable by
  // sending `no-store`. An `s-maxage` appended here would not be honoured; it
  // would be silently discarded and this page would quietly cache for a
  // minute, which is the kind of drift nobody notices until the figures
  // wobble between two refreshes.
  return successResponse(
    { transparency: report, windowDays: TRANSPARENCY_WINDOW_DAYS },
    requestId,
    200,
    { "cache-control": `public, max-age=${CACHE_SECONDS}` },
  );
}
