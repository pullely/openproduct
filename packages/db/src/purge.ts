// The workspace purge, product-side (openproduct-independence OX6a).
//
// VENDORED and SPECIALIZED from the platform's `packages/db/src/
// workspace-purge.ts` + `workspace-purge-endpoint.ts`: the batching SQL, the
// guards (kill switch before body parse, literal `confirm`, required
// lifecycleRequestId), and the receipt shape are byte-for-byte the
// platform's — the S7 orchestrator parses this receipt and must not be able
// to tell the seam from a binding. What is specialized is exactly the
// registry: openproduct's OWN rows, nothing else's.
//
// The registry here mirrors the platform registry's `openproduct` block
// verbatim (two rows — the six other tables cascade from `profiles` via FK,
// and `contributors` is subject-keyed by design: a contributor's exit is
// DELETE /me, not a workspace purge). Until the OX-E cutover retires the
// platform half, BOTH sides can serve this purge over the same schema; after
// it, this file is the only purge path for these tables.

import type { SqlExecutor } from "./executor.js";

/** Rows deleted per statement. Matches the platform's `PURGE_BATCH_SIZE`. */
export const PURGE_BATCH_SIZE = 1000;
/** Statements per table per call — the per-call work cap. */
export const PURGE_MAX_BATCHES = 5;

/** One purgeable table. The platform entry shape, minus the archive-detach
 *  and cryptoshred fields no openproduct table carries. */
export interface PurgeEntry {
  schema: "openproduct";
  table: string;
  orgColumn: "org_id";
  class: "purge";
}

/**
 * openproduct's purge rows — the platform registry's `openproduct` block,
 * kept in its exact shape. `profiles` deletion cascades to applications,
 * listing_maintainers, published_maintainers, role_openings and
 * saved_products via their FKs; `audit_log` is FK-free BY DESIGN (an audit
 * row survives the listing it describes), so the purge names it directly.
 */
export const OPENPRODUCT_PURGE_REGISTRY: readonly PurgeEntry[] = [
  { schema: "openproduct", table: "profiles", orgColumn: "org_id", class: "purge" },
  { schema: "openproduct", table: "audit_log", orgColumn: "org_id", class: "purge" },
];

/** The one context this product purges. Kept as a list so the endpoint's
 *  unknown-context refusal stays the platform's exact behaviour. */
const PURGE_CONTEXT_ORDER = ["openproduct"] as const;

export interface PurgeTableOutcome {
  /** `schema.table`. */
  table: string;
  rowsDeleted: number;
  /** False when the per-call cap was reached and rows may remain. */
  drained: boolean;
}

export interface PurgeOutcome {
  context: string;
  tables: PurgeTableOutcome[];
  rowsDeleted: number;
  /** True when every table is empty for this workspace. */
  done: boolean;
  /** DEK generations cryptoshredded. Always 0 here — openproduct holds no
   *  secret ciphertext — but the key stays: the receipt shape is the seam. */
  shredded: number;
}

/** Per-call work caps. Overridable so tests can shrink them. */
export interface PurgeLimits {
  batchSize?: number;
  maxBatches?: number;
}

/** Delete up to `maxBatches × batchSize` rows from one table. The SQL is the
 *  platform's exactly: ctid batching (no primary-key assumption), RETURNING
 *  (a driver-independent count — this number reaches a deletion
 *  certificate). */
async function purgeTable(
  sql: SqlExecutor,
  entry: PurgeEntry,
  orgId: string,
  limits: Required<PurgeLimits>,
): Promise<PurgeTableOutcome> {
  let rowsDeleted = 0;
  let drained = false;

  for (let batch = 0; batch < limits.maxBatches; batch++) {
    const result = await sql.execute<{ deleted: number }>(
      `DELETE FROM ${entry.schema}.${entry.table}
        WHERE ctid = ANY (
          ARRAY(SELECT ctid FROM ${entry.schema}.${entry.table}
                 WHERE ${entry.orgColumn} = $1
                 LIMIT $2)
        )
      RETURNING 1 AS deleted`,
      [orgId, limits.batchSize],
    );
    rowsDeleted += result.rows.length;
    if (result.rows.length < limits.batchSize) {
      // A short batch means the table ran out of rows, not that the cap hit.
      drained = true;
      break;
    }
  }

  return { table: `${entry.schema}.${entry.table}`, rowsDeleted, drained };
}

/**
 * Purge openproduct's rows for one workspace. Bounded and resumable (the
 * orchestrator drives a long purge across ticks via `done: false`), and safe
 * to call twice — every statement is keyed to the workspace and filtered on
 * rows that still exist.
 */
export async function purgeContext(
  sql: SqlExecutor,
  context: string,
  orgId: string,
  limits: PurgeLimits = {},
): Promise<PurgeOutcome> {
  const caps = {
    batchSize: limits.batchSize ?? PURGE_BATCH_SIZE,
    maxBatches: limits.maxBatches ?? PURGE_MAX_BATCHES,
  };
  const tables: PurgeTableOutcome[] = [];
  let rowsDeleted = 0;

  // The platform's `purgeOrderForContext` sorts same-rank entries by table
  // name; both rows here are plain purges, so sorted order IS its order —
  // kept so the receipt's `tables` array is indistinguishable across the cut.
  const ordered = [...OPENPRODUCT_PURGE_REGISTRY].sort((a, b) => a.table.localeCompare(b.table));
  for (const entry of ordered) {
    const outcome = await purgeTable(sql, entry, orgId, caps);
    tables.push(outcome);
    rowsDeleted += outcome.rowsDeleted;
  }

  return {
    context,
    tables,
    rowsDeleted,
    done: tables.every((t) => t.drained),
    shredded: 0,
  };
}

// ─── The endpoint half — the platform's `workspace-purge-endpoint.ts` ──────

/** Accepted request body. Every field is required — see the guards below. */
export interface WorkspacePurgeRequestBody {
  orgId: string;
  /** The `membership.lifecycle_requests` row this purge is discharging. */
  lifecycleRequestId: string;
  /** Literal `"purge"`. A misrouted detach body must not reach the deletes. */
  confirm: "purge";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a purge request body. Exported so the endpoint's rejection
 *  behaviour is unit-testable without a database. */
export function parseWorkspacePurgeBody(
  body: unknown,
): { ok: true; value: WorkspacePurgeRequestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const o = body as Record<string, unknown>;

  if (typeof o.orgId !== "string" || !UUID_RE.test(o.orgId)) {
    return { ok: false, error: "orgId must be a UUID" };
  }
  if (typeof o.lifecycleRequestId !== "string" || !UUID_RE.test(o.lifecycleRequestId)) {
    return { ok: false, error: "lifecycleRequestId must be a UUID" };
  }
  if (o.confirm !== "purge") {
    return { ok: false, error: "confirm must be the literal string 'purge'" };
  }

  return {
    ok: true,
    value: {
      orgId: o.orgId,
      lifecycleRequestId: o.lifecycleRequestId,
      confirm: "purge",
    },
  };
}

/** Outcome of a purge request. NOT a `Response` — the worker envelopes it
 *  with its own `successResponse`/`errorResponse`. */
export type WorkspacePurgeResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: string; message: string; status: number };

export interface WorkspacePurgeOptions {
  /** The deploy-time kill switch. When false the endpoint refuses and
   *  deletes nothing. */
  enabled: boolean;
}

/** Supplies the database handle, called only once every guard has passed —
 *  a refused request must cost nothing. */
export type PurgeExecutorFactory = () => SqlExecutor;

export interface WorkspacePurgeHandlerConfig<E, R, DB> {
  /** The bounded context this worker serves — here always `"openproduct"`. */
  context: string;
  /** The Hyperdrive binding, or undefined when the worker has none. */
  getDb: (env: E) => DB | undefined;
  /** Reads the kill switch. Conventionally `env.WORKSPACE_PURGE_ENABLED === "true"`. */
  isEnabled: (env: E) => boolean;
  /** Builds the executor. Called at most once, and only if the purge runs. */
  createExecutor: (db: DB) => SqlExecutor;
  ok: (data: Record<string, unknown>, requestId: string) => R;
  fail: (code: string, message: string, status: number, requestId: string) => R;
}

export function createWorkspacePurgeHandler<E, R, DB>(
  config: WorkspacePurgeHandlerConfig<E, R, DB>,
): (request: { json(): Promise<unknown> }, env: E, requestId: string) => Promise<R> {
  return async (request, env, requestId) => {
    const db = config.getDb(env);
    if (!db) {
      return config.fail("internal_error", "Database not configured", 503, requestId);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return config.fail("validation_failed", "Invalid JSON", 422, requestId);
    }

    let executor: SqlExecutor | undefined;
    try {
      const result = await executeWorkspacePurge(
        () => (executor ??= config.createExecutor(db)),
        config.context,
        body,
        { enabled: config.isEnabled(env) },
      );
      return result.ok
        ? config.ok(result.data, requestId)
        : config.fail(result.code, result.message, result.status, requestId);
    } finally {
      if (executor && "dispose" in executor && typeof executor.dispose === "function") {
        await (executor as { dispose(): Promise<void> }).dispose();
      }
    }
  };
}

/** Run the purge request. Bounded and idempotent, exactly as the platform's. */
export async function executeWorkspacePurge(
  getExecutor: PurgeExecutorFactory,
  context: string,
  rawBody: unknown,
  options: WorkspacePurgeOptions,
): Promise<WorkspacePurgeResult> {
  // The switch is checked BEFORE the body is parsed. A disabled deployment
  // must not become an oracle that tells a caller their request was
  // otherwise valid.
  if (!options.enabled) {
    return {
      ok: false,
      code: "purge_disabled",
      message: "Workspace purge is not enabled in this environment",
      status: 503,
    };
  }

  if (!(PURGE_CONTEXT_ORDER as readonly string[]).includes(context)) {
    return {
      ok: false,
      code: "unknown_context",
      message: `No purge is registered for context '${context}'`,
      status: 404,
    };
  }

  const parsed = parseWorkspacePurgeBody(rawBody);
  if (!parsed.ok) {
    return { ok: false, code: "validation_failed", message: parsed.error, status: 422 };
  }

  try {
    // First touch of the database in the whole call.
    const outcome = await purgeContext(getExecutor(), context, parsed.value.orgId);
    return {
      ok: true,
      data: {
        context,
        lifecycleRequestId: parsed.value.lifecycleRequestId,
        done: outcome.done,
        rowsDeleted: outcome.rowsDeleted,
        shredded: outcome.shredded,
        tables: outcome.tables,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "purge failed";
    console.error(`[${context}] workspace-purge failed`, { message });
    return { ok: false, code: "internal_error", message: "Workspace purge failed", status: 500 };
  }
}
