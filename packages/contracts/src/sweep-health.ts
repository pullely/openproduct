/**
 * The sweep's liveness, assessed (openproduct-worldclass RS1; widened by
 * openproduct-worldclass-v2 LI0).
 *
 * `/health` on the gateway had three checks that asked whether something was
 * CONFIGURED — a binding, a secret — and all three answered `true` throughout
 * the whole period the product was broken. This is the check that can only be
 * answered by asking what actually RAN: for each materialisation phase, when
 * it last did its work, and — since LI0 — whether it has been failing since.
 *
 * WHY A PHASE'S FAILURE IS A FIELD HERE AND NOT ONLY A LOG LINE (WC2-1). RS5
 * chose a structured `console.warn` per failure because the column was a
 * migration and the defect was live. Two days later the defect was still
 * live, the line had fired some three hundred times, and the only readers
 * were people with a Cloudflare dashboard open — which excludes the
 * repository, its CI, this document, and the epic diagnosing it. A liveness
 * read that can say `never_run` but not `failed: <reason>` names the symptom
 * and hides the cause.
 *
 * WHAT `lastError` IS ALLOWED TO CARRY: the bounded reason the gateway logs —
 * phase, code, message, status — and nothing tenant-shaped. A sweep failure
 * is about our machinery; a slug, a subject or a repository in this field
 * would be something to leak on a public health read.
 *
 * FIVE PHASES, NOT THREE. The board cut (LC3) and the digest cut (LC5) kept no
 * singleton because their OUTPUT is derived per day and per week, and RS1
 * left them out for that reason. That is true of the output, not the phase:
 * the phase ran or did not, failed or did not, and WC2-1 needs a row to write
 * to. Their thresholds are the index's — they run on every tick.
 */

/*
 * AND A SIXTH, FROM OS2 (openproduct-scale). PV4's snapshot phase shipped
 * without a floor and therefore without durable state, and this document's
 * own rule — a phase is listed only if it keeps a row to read — excluded it,
 * correctly. OS2 gave it the floor every skippable phase has
 * (`snapshot_sweep_state`, 1895), and that row is exactly the state this
 * document reads; it carries LI0's two error columns from birth, so the
 * ledger writes to it like the other five. The rule that kept it out is
 * unchanged. It is the phase that arrives, not the bar.
 */
export const SWEEP_PHASES = [
  // OS5 — the catalogue, first: it is what the front page and the API read,
  // and the search index is built from it in the same tick.
  "catalogue",
  "searchIndex",
  "integrity",
  "defence",
  "board",
  "digest",
  "snapshots",
] as const;
export type SweepPhase = (typeof SWEEP_PHASES)[number];

export function isSweepPhase(value: unknown): value is SweepPhase {
  return typeof value === "string" && (SWEEP_PHASES as readonly string[]).includes(value);
}

/**
 * Three times each phase's own interval. The index is rebuilt on RS0's
 * ten-minute cron and has a 60 s floor; integrity's floor is an hour; the
 * defence sweep's is six hours; the board and digest cuts run on every tick.
 */
export const SWEEP_STALE_AFTER_SECONDS: Record<SweepPhase, number> = {
  // OS5 — rebuilt on every materialisation tick, so three ticks: a catalogue
  // half an hour old is a sweep that has stopped, and the page renders the
  // moment it was computed either way.
  catalogue: 30 * 60,
  searchIndex: 30 * 60,
  integrity: 3 * 60 * 60,
  defence: 18 * 60 * 60,
  board: 30 * 60,
  digest: 30 * 60,
  // OS2's floor is one day, so three: a baseline three days late is a wider
  // diff window, not a wrong answer, and two missed days in a row is the alarm.
  snapshots: 3 * 24 * 60 * 60,
};

/** `failed` outranks the other two: a phase that has never run BECAUSE it
 *  fails on every tick is a different fact from one nobody has asked to run. */
export type SweepUnhealthyReason = "never_run" | "stale" | "failed";

/** One phase's durable state — what its singleton row says. */
export interface SweepPhaseState {
  /** When the phase last did its work. The index's `built_at`, the others' `swept_at`. */
  readonly lastRunAt: string | null;
  /** Why the last run failed, bounded; `null` once a run succeeds. */
  readonly lastError: string | null;
  /** When `lastError` was recorded. */
  readonly lastErrorAt: string | null;
}

export const NEVER_RUN: SweepPhaseState = Object.freeze({
  lastRunAt: null,
  lastError: null,
  lastErrorAt: null,
});

export function sweepPhaseState(
  lastRunAt: string | null,
  lastError: string | null = null,
  lastErrorAt: string | null = null,
): SweepPhaseState {
  return { lastRunAt, lastError, lastErrorAt };
}

/** What the gateway tells core after a sweep: per phase, did it do its job. */
export interface SweepOutcome {
  readonly phase: SweepPhase;
  readonly ok: boolean;
  /** Present iff `ok` is false. The same bounded string the log line carries. */
  readonly reason: string | null;
}

/** The longest reason a phase may record. Matches the log line's bound. */
export const SWEEP_REASON_MAX_LENGTH = 200;

export interface SweepPhaseHealth {
  readonly phase: SweepPhase;
  readonly lastRunAt: string | null;
  readonly ageSeconds: number | null;
  readonly staleAfterSeconds: number;
  readonly healthy: boolean;
  readonly reason: SweepUnhealthyReason | null;
  /** The recorded failure, when it is CURRENT — newer than the last run. */
  readonly error: string | null;
  readonly errorAt: string | null;
}

function parseInstant(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * An error is current when nothing has succeeded since it was recorded. A
 * successful run clears the column, so this is belt and braces: a row with
 * both an error and a later run reads as healthy, never as failed.
 */
function currentError(state: SweepPhaseState): { error: string; errorAt: string | null } | null {
  if (state.lastError === null) return null;
  const ranAt = parseInstant(state.lastRunAt);
  const erredAt = parseInstant(state.lastErrorAt);
  if (ranAt !== null && erredAt !== null && erredAt < ranAt) return null;
  return { error: state.lastError, errorAt: state.lastErrorAt };
}

export function sweepPhaseHealth(
  phase: SweepPhase,
  state: SweepPhaseState,
  now: Date = new Date(),
): SweepPhaseHealth {
  const staleAfterSeconds = SWEEP_STALE_AFTER_SECONDS[phase];
  const failure = currentError(state);
  const parsed = parseInstant(state.lastRunAt);

  // Never run, or a timestamp we cannot read, or one from the future — none of
  // these is "healthy", and the two malformed cases are reported as never run
  // rather than invented into an age.
  const ageSeconds =
    parsed === null ? null : Math.floor((now.getTime() - parsed) / 1000);
  const neverRan = ageSeconds === null || ageSeconds < 0;

  if (failure !== null) {
    return {
      phase,
      lastRunAt: neverRan ? null : state.lastRunAt,
      ageSeconds: neverRan ? null : ageSeconds,
      staleAfterSeconds,
      healthy: false,
      reason: "failed",
      error: failure.error,
      errorAt: failure.errorAt,
    };
  }

  if (neverRan) {
    return {
      phase,
      lastRunAt: null,
      ageSeconds: null,
      staleAfterSeconds,
      healthy: false,
      reason: "never_run",
      error: null,
      errorAt: null,
    };
  }

  const healthy = ageSeconds <= staleAfterSeconds;
  return {
    phase,
    lastRunAt: state.lastRunAt,
    ageSeconds,
    staleAfterSeconds,
    healthy,
    reason: healthy ? null : "stale",
    error: null,
    errorAt: null,
  };
}

/** What core's `GET /internal/openproduct/sweep/state` returns: one state per phase. */
export type SweepStateDocument = Readonly<Record<SweepPhase, SweepPhaseState>>;

export interface SweepHealth {
  readonly reachable: boolean;
  readonly healthy: boolean;
  readonly phases: readonly SweepPhaseHealth[];
}

/**
 * `null` is "we could not ask" — a third answer, distinct from "it never
 * ran", so unreachable core never masquerades as a phase that has not fired.
 */
export function sweepHealth(
  state: SweepStateDocument | null,
  now: Date = new Date(),
): SweepHealth {
  if (state === null) {
    return { reachable: false, healthy: false, phases: [] };
  }
  const phases = SWEEP_PHASES.map((phase) =>
    sweepPhaseHealth(phase, state[phase] ?? NEVER_RUN, now),
  );
  return { reachable: true, healthy: phases.every((p) => p.healthy), phases };
}

/**
 * The ingestion budget, as a number on the page (openproduct-worldclass-v2 LI4).
 *
 * Repository observation is the one sweep phase that reaches outward, and it
 * is capped at `INGESTION_MAX_SOURCES_PER_RUN` because unauthenticated GitHub
 * allows sixty reads an hour. A `GITHUB_TOKEN` on the gateway lifts that
 * ceiling by two orders of magnitude and is a secret to deliver rather than a
 * decision to take — so whether it has been delivered is reported, as a
 * boolean, never as the value.
 */
export const INGESTION_MAX_SOURCES_PER_RUN = 25;
export const GITHUB_UNAUTHENTICATED_READS_PER_HOUR = 60;

export interface IngestionBudget {
  /** Whether the gateway holds a GitHub token. The presence, never the value. */
  readonly authenticated: boolean;
  readonly maxSourcesPerRun: number;
  readonly unauthenticatedReadsPerHour: number;
}

export function ingestionBudget(token: string | undefined): IngestionBudget {
  return {
    authenticated: (token ?? "").trim().length > 0,
    maxSourcesPerRun: INGESTION_MAX_SOURCES_PER_RUN,
    unauthenticatedReadsPerHour: GITHUB_UNAUTHENTICATED_READS_PER_HOUR,
  };
}
