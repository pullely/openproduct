// The log vocabulary, closed (openproduct-operations OO2).
//
// RS5 pinned `SweepPhaseName` so a new phase cannot log under an unknown
// name, and PV4 hit that guard. The request path had no such list: a handler
// could `console.warn` whatever it liked, and a saved query over "the
// unhandled errors" would find the ones somebody remembered to spell that
// way. This is the list — every structured line the gateway and core emit,
// its level, and the fields it carries — and a test walks both sources and
// refuses a `console.*` line whose `msg` is not here, or a line here that
// no source emits.
//
// A LINE IS A `msg` AND ITS FIELDS. Nothing in the vocabulary carries a body,
// a message from a stranger, an address or a token: `error` is a name and a
// message from our own code, `reason` a word from a closed list, `tags` our
// own cache tags. RS5's rule, made a list.

export type LogLevel = "info" | "warn" | "error";

export interface LogKind {
  readonly level: LogLevel;
  /** What the line is for, in one sentence. */
  readonly means: string;
  /** The fields the line carries beside `level` and `msg`. */
  readonly fields: readonly string[];
}

export const LOG_MESSAGES = {
  // ── the request path ──
  request: { level: "info", means: "One core request answered: method, path, status and how long.", fields: ["method", "path", "status", "durationMs", "requestId"] },
  timing: { level: "info", means: "A sampled Server-Timing breakdown for one route (PERF14b).", fields: ["route", "requestId", "phases"] },
  unhandled: { level: "error", means: "A core handler threw past every catch; the response is a 500.", fields: ["method", "path", "requestId", "error", "stack"] },
  core_5xx: { level: "error", means: "Core answered the gateway with a 5xx.", fields: ["method", "path", "target", "status", "requestId"] },
  core_unreachable: { level: "error", means: "The gateway could not reach core over the binding.", fields: ["method", "path", "target", "requestId", "error"] },
  velocity_refused: { level: "warn", means: "A write was refused by a velocity limit (TS2).", fields: ["action", "dimension", "window", "limit", "windowSec", "subjectId", "requestId"] },
  velocity_config_rejected: { level: "warn", means: "An OPENPRODUCT_VELOCITY override did not parse and the defaults apply.", fields: ["problem"] },
  rate_limit_unavailable: { level: "warn", means: "The rate-limit Durable Object could not be asked; the request was allowed (CS1 fails open) and the in-isolate bucket stood in. At most once a minute per isolate.", fields: ["bucket", "reason"] },
  identity_unreachable: { level: "error", means: "The platform's identity read could not be reached.", fields: ["base", "error"] },
  identity_failed: { level: "error", means: "The platform's identity read answered a non-2xx.", fields: ["base", "status"] },
  // ── the sweep ──
  sweep_phase_failed: { level: "warn", means: "A sweep phase did not do the thing, and why (RS5); the status where core refused.", fields: ["phase", "reason", "status"] },
  sweep_phase_skipped: { level: "warn", means: "A sweep phase was not attempted — an opt-out, said out loud.", fields: ["phase", "reason"] },
  sweep_outcome_unrecorded: { level: "warn", means: "The run's ledger could not be handed to core; the status where core refused.", fields: ["reason", "status"] },
  capture_failed: { level: "warn", means: "One screenshot attempt failed, by one word (MD4).", fields: ["reason"] },
  search_rebuild_failed: { level: "warn", means: "The search index rebuild threw; the previous index stands (DS0).", fields: ["reason", "requestId"] },
  catalogue_rebuild_failed: { level: "warn", means: "The catalogue rebuild threw; the previous catalogue stands and the page keeps its moment (OS5).", fields: ["reason", "requestId"] },
  endorsement_recount_failed: { level: "warn", means: "The catalogue tick's endorsement re-count threw; the previous counts stand inside their freshness and the rebuild runs anyway (OB3).", fields: ["reason", "requestId"] },
  // ── the synthetic (OO1) — its own worker, the same list ──
  synthetic_cycle: { level: "info", means: "One cycle of the reader: how many of the three promises hold, the cache status of the plain front-page read, and how long the walk took.", fields: ["holding", "cacheStatus", "durationMs"] },
  slo_breached: { level: "warn", means: "A promise stopped holding. `mode` says which kind of failure (OO1's two, and the two beside them); `runbook` is the anchor the alert points at.", fields: ["slo", "mode", "runbook"] },
  slo_recovered: { level: "info", means: "A promise holds again, with the runbook anchor the breach carried.", fields: ["slo", "runbook"] },
  deploy_noticed: { level: "info", means: "/health answered with a Worker version the synthetic had not seen; the verification window opens (OO3).", fields: ["version"] },
  deploy_verified: { level: "info", means: "Every per-tick phase ran after the version's upload and RS4's four walks held; how long after the upload the last of them ran (OO3).", fields: ["version", "afterMs"] },
  deploy_unverified: { level: "warn", means: "One interval and a grace after a new version, a per-tick phase had not run since it or a walk failed (OO3). The alert carries the runbook page.", fields: ["version", "reason"] },
  alert_undeliverable: { level: "warn", means: "A flip was recorded and not sent: no channel is configured (OO-A), a maintenance window is open (OO-C), or the seam refused or could not be reached.", fields: ["slo", "reason"] },
  // ── media ──
  media_derivative_skipped: { level: "warn", means: "The zone answered a derivative request with something that was not a WebP.", fields: ["width", "status", "contentType", "requestId"] },
  media_derivative_failed: { level: "warn", means: "A derivative request threw.", fields: ["width", "reason", "requestId"] },
  // ── the cache ──
  cache_purge_failed: { level: "warn", means: "A tag purge was refused for some tags.", fields: ["tags", "errors"] },
  cache_purge_threw: { level: "warn", means: "A tag purge threw.", fields: ["tags", "error"] },
} as const satisfies Record<string, LogKind>;

export type LogMessage = keyof typeof LOG_MESSAGES;

export const LOG_MESSAGE_NAMES: readonly LogMessage[] = Object.keys(LOG_MESSAGES) as LogMessage[];

/** Whether a `msg` is one the vocabulary names. */
export function isLogMessage(msg: string): msg is LogMessage {
  return Object.prototype.hasOwnProperty.call(LOG_MESSAGES, msg);
}
