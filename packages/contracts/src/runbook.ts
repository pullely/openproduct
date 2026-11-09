// The runbook, as a registry (openproduct-operations OO4).
//
// ONE PAGE PER DEGRADED STATE, READ FROM THE ALERT RATHER THAN FOUND BY
// SEARCH (OO-3). Three kinds of page: one per (promise, failure mode) —
// `RUNBOOK` in `synthetic.ts`, because the alert line names those anchors;
// one per sweep phase — what a visitor sees while it is stale, which route
// re-fires it, what recovered looks like; and the one page RS4 proved was
// needed, the deploy that lags `main`.
//
// WHY A REGISTRY AND NOT A MARKDOWN FILE. OO-D: the most expensive sentence
// in this estate was a comment that was right about one verb and wrong about
// the rest, and survived four epics because nobody read the file beside it.
// A runbook is a longer comment. What this shape buys is that the anchors
// are data: the alert line is built from them, `/docs/runbook` renders them,
// and a test holds the two together — an anchor that vanished from the page
// would vanish from here, and the alert that named it would fail to build.
// What the page SAYS can still go stale; that it EXISTS cannot silently stop
// being true.

import { SWEEP_PHASES, type SweepPhase } from "./sweep-health.js";
import { RUNBOOK } from "./synthetic.js";

export interface PhaseRunbook {
  /** What a visitor sees while the phase is stale — the thing to go and look at. */
  readonly visitorSees: string;
  /** Core's route the sweep calls for this phase; the manual re-fire. */
  readonly refire: string;
  /** What "recovered" looks like, so the recovery is one observation. */
  readonly recovered: string;
}

/** The fragment on `/docs/runbook` for a phase's page. */
export function phaseRunbookAnchor(phase: SweepPhase): string {
  return `phase-${phase}`;
}

export const PHASE_RUNBOOK: Record<SweepPhase, PhaseRunbook> = {
  catalogue: {
    visitorSees:
      "The front page and the catalogue API answer from the last catalogue computed, and say so: the moment under the heading (\"as of HH:MM UTC\") stops moving. A listing published since is not on the front page. /health reports catalogue stale after thirty minutes.",
    refire: "/internal/openproduct/catalogue/rebuild",
    recovered: "The moment on the front page moves again and /health reports catalogue healthy with a lastRunAt inside the last thirty minutes.",
  },
  searchIndex: {
    visitorSees:
      "Search answers from the last index built: a listing published since is not found by its own name, and the search page says nothing about why. The catalogue can be current while the index is not — they are separate phases, and the index is built from the catalogue in the same tick.",
    refire: "/internal/openproduct/search/rebuild",
    recovered: "The newest published listing is found by its slug on an anonymous search, and /health reports searchIndex healthy.",
  },
  integrity: {
    visitorSees:
      "Every count on the site is the last discount computed: an upvote cast since is counted raw until the next pass, and a listing's clean-votes mark does not move. A dash (—) on a count is a different thing — it means never measured, and the legend on /docs/checks says which is which.",
    refire: "/internal/openproduct/endorsements/integrity-sweep",
    recovered: "/health reports integrity healthy with a lastRunAt inside the last three hours, and the counts move on the next front-page read.",
  },
  defence: {
    visitorSees:
      "Nothing, by design: the detectors raise flags for a person to read and remove nothing, so a stale defence sweep is a reports queue quieter than the week deserves. /health reports it stale after eighteen hours.",
    refire: "/internal/openproduct/defence/sweep",
    recovered: "/health reports defence healthy, and the reports queue gains whatever the week held.",
  },
  board: {
    visitorSees:
      "The day's board and the leaderboard stop moving: a launch that fired today is not placed, and yesterday's numbers may not have closed. The launches strip on the front page shows the last ranking it had.",
    refire: "/internal/openproduct/launches/board-sweep",
    recovered: "The board's ranking moves and /health reports board healthy.",
  },
  digest: {
    visitorSees:
      "The digest archive says nothing launched this week, and nobody who asked for the email gets one. The page is honest about what it has and silent about what it missed.",
    refire: "/internal/openproduct/digest/queue",
    recovered: "The week's digest page exists with its launches on it, and /health reports digest healthy.",
  },
  snapshots: {
    visitorSees:
      "A listing page's \"what changed this week\" compares against a snapshot up to three days older than it should be, then says there is no earlier snapshot. Not wrong, only wider; two missed days in a row is the alarm.",
    refire: "/internal/openproduct/snapshots/sweep",
    recovered: "/health reports snapshots healthy with a lastRunAt inside the last day.",
  },
};

/**
 * How a phase is re-fired by hand. Every route above is CORE'S, reached by
 * the gateway over its one binding on a materialisation tick; there is no
 * public door to any of them, deliberately. The manual paths are these, in
 * the order to try them.
 */
export const REFIRE_HOW = [
  "Wait one tick. Every phase runs on the next materialisation cron (every ten minutes); most stale phases are a tick that has not happened yet, and /health says when the last one did.",
  "Run the gateway's cron by hand: Cloudflare dashboard → Workers → openproduct-gateway → Triggers → the materialisation schedule → Run. That is the same code path as the schedule, with the same ledger, so /health records it.",
  "Call the route directly, from a session that holds the binding (`wrangler dev` on the gateway, or core's own `wrangler dev`): POST the route below with a request id. This bypasses the ledger for that phase, so /health will not show the run — use it to unblock, then let the next tick record.",
] as const;

/** The page RS4 proved was needed: the audit measured a deploy, and the deploy lagged main (WC-H). */
export const DEPLOY_LAG = {
  anchor: "deploy-lags-main",
  title: "The deploy lags main",
  rule: "A re-score, a verification lane, or any measurement of \"what the product does\" does not run until the branch under test is the branch that is live. Measuring a deploy that lags main under-reports the fix and somebody draws the wrong conclusion about which milestone worked (WC-H).",
  read: [
    "The deploy run: GitHub Actions on sourceplane/openproduct → the run for the merge commit → the job named `<component> · prod · Deploy`. Its revision line names the commit; a green job is a deploy that finished, and a job that has not run is a deploy that has not happened.",
    "The worker's versions: Cloudflare dashboard → Workers → the worker → Deployments. The active version's upload time is the deploy's moment; compare it with the merge commit's time.",
    "The live side itself: /health on the gateway carries `build` — the active Worker version's id and the moment it was uploaded (OO3, from the version_metadata binding) — and /docs/checks shows it under the heading. A version uploaded before the merge is a deploy that has not happened yet. It is a version, not a commit: the estate's composition uploads without a tag, so the SHA is read from the deploy job and the time compared here.",
  ],
  recovered: "The `prod · Deploy` job for the head of main is green and the version /health reports was uploaded after the merge. Then, and only then, measure.",
} as const;

/**
 * OO3 — the page the synthetic's deploy line points at: a new version
 * answered on /health and, one interval and a grace later, not every
 * per-tick phase had run after it, or one of RS4's four walks failed.
 */
export const DEPLOY_UNVERIFIED = {
  anchor: "deploy-unverified",
  title: "A deploy was not verified",
  visitorSees:
    "Possibly nothing yet — this is the line that fires BEFORE a promise breaks. /health answers with a new version, and either a phase that runs every tick has not run since that version was uploaded (the schedule did not survive the deploy: RS0's outage, caught within fifteen minutes instead of four epics), or one of the four things RS4 signed stopped being true: the signed-out upvote no longer answers 401, /signin is not openproduct's own page, the front page title lost the brand, or search stopped answering for the seeded listing.",
  refire: "/internal/openproduct/search/rebuild",
  recovered:
    "The synthetic's next cycle finds every per-tick phase with a lastRunAt after the version's upload and all four walks true, and logs deploy_verified for that version. If the phases never run: the cron did not register — `wrangler triggers deploy --env <env>` from a credentialed session, then watch /health.",
} as const;

/** Every anchor the runbook page renders — the alert's, the phases', the deploy's. */
export const RUNBOOK_ANCHORS: readonly string[] = [
  ...RUNBOOK.map((entry) => entry.anchor),
  ...SWEEP_PHASES.map((phase) => phaseRunbookAnchor(phase)),
  DEPLOY_LAG.anchor,
  DEPLOY_UNVERIFIED.anchor,
];

export const RUNBOOK_TITLE = "Runbook";
export const RUNBOOK_INTRO =
  "One page per degraded state, reached from the alert rather than found by search. Each says what a visitor sees while it is true, which route re-fires it, and what recovered looks like — so the recovery line means one thing.";
