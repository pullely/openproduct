// The two schedules, and which work each one does (openproduct-worldclass RS2).
//
// ─── THE SPLIT, AND WHY IT IS NOT TIDYING ─────────────────────────────────
//
// `runSweep` does two kinds of work that have nothing in common except a
// timer.
//
//   INGESTION reaches OUTWARD. It reads repositories over the public
//   internet, and everything careful about it is careful for that reason:
//   only `github.com/{owner}/{repo}` parsed from a maintainer-published URL,
//   host-pinned, capped at a fixed number of due sources per run, and
//   deliberately not reachable from a page view — "a page view that causes an
//   outbound fetch is a page view somebody can weaponise into one".
//
//   MATERIALISATION reaches INWARD. It rebuilds the search index, sweeps the
//   endorsement counts, fires due launches, ranks the boards, runs the
//   defence sweep and cuts the digest. Not one of those leaves the estate.
//   They are what the product SHOWS, computed from what it already has.
//
// Before RS0 they shared a schedule that did not exist, so neither ran. RS0
// gave them one, which was right and is not sufficient: on one timer the
// interval has to satisfy both, and their constraints pull opposite ways.
// Materialisation wants to be frequent — a day boundary should close within
// minutes, and the index should not lag the page that links to it.
// Ingestion wants to be rare — every run spends GitHub requests against an
// unauthenticated ceiling of sixty an hour, and the cap is twenty-five due
// sources per run at two requests each.
//
// At today's corpus of two listings, one ten-minute timer satisfies both by
// accident. At RS3's corpus it satisfies neither: six runs an hour times
// twenty-five sources is a hundred and fifty reads against a ceiling of
// sixty. That is why RS2 comes before RS3 in the plan, and why this file is
// load-bearing rather than cosmetic.
//
// ─── WHY THE MAPPING LIVES IN A CONTRACT ──────────────────────────────────
//
// A Worker's `scheduled()` handler is told WHICH cron fired
// (`ScheduledController.cron`), and that string is the only thing
// distinguishing the two kinds of run. So the expression in
// `gateway/wrangler.jsonc` and the branch in `gateway/src/index.ts` are one
// decision written in two files, and a typo in either would silently pick the
// wrong mode — which is the same class of failure as the missing block RS0
// fixed, arriving through a different door.
//
// Putting both halves here makes the pair checkable: the gateway's binding
// test asserts every committed cron is one this file names, and the mapping
// is a pure function with its own tests.

/** What one scheduled run is for. */
export const SWEEP_MODES = ["ingestion", "materialisation", "all"] as const;
export type SweepMode = (typeof SWEEP_MODES)[number];

/**
 * The committed cron expressions, one per kind of work.
 *
 * `materialisation` — every ten minutes. Frequent because it is cheap and
 * because what it computes is what a reader sees: a day boundary closes
 * within ten minutes of midnight UTC, and the search index never lags the
 * page linking into it by more than one interval. It reaches nothing outside
 * the estate, so frequency costs only our own compute.
 *
 * `ingestion` — hourly, at minute 23. Hourly because that is what the
 * unauthenticated GitHub ceiling affords: twenty-five due sources at roughly
 * two reads each is about fifty requests, against sixty an hour. Minute 23
 * rather than 0 so the two schedules only coincide once an hour instead of
 * every run, and so this product's outbound burst does not line up with every
 * other cron on the internet.
 *
 * **The honest limit, stated here because RS3 will meet it:** hourly at
 * twenty-five sources is twenty-five listings an hour. A corpus of five
 * hundred takes twenty hours to observe once. The fix is a `GITHUB_TOKEN`
 * (five thousand requests an hour rather than sixty), which is an operational
 * act rather than a code change — and it is a **prerequisite for RS3's
 * corpus**, not a nice-to-have.
 */
export const SWEEP_CRON: Record<Exclude<SweepMode, "all">, string> = {
  materialisation: "*/10 * * * *",
  ingestion: "23 * * * *",
};

/**
 * Which work a fired cron is asking for.
 *
 * **An unrecognised expression runs materialisation, never ingestion**, and
 * that default is the whole safety argument for doing this by string match.
 * A cron nobody recognises is a config change somebody made without changing
 * this file; the question is what should happen in the gap. Materialisation
 * reaches nothing outside the estate, so the worst case is that some inward
 * work runs more often than intended. Defaulting the other way would let an
 * unreviewed line of JSON start reaching out to the internet on a schedule
 * nobody chose, which is exactly the act every comment in this area exists to
 * keep deliberate.
 */
export function sweepModeForCron(cron: string | undefined): SweepMode {
  const normalised = (cron ?? "").trim().replace(/\s+/g, " ");
  if (normalised === SWEEP_CRON.ingestion) return "ingestion";
  return "materialisation";
}

/** Every expression this product commits, for the config test to check against. */
export const KNOWN_SWEEP_CRONS: readonly string[] = Object.values(SWEEP_CRON);
