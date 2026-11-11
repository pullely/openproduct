// The openproduct context's workspace purge (saas-workspace-deletion WD4c).
//
// `openproduct.profiles`.
//
// Everything that makes this safe is the shared factory: the kill switch, the
// explicit confirmation, the required lifecycle request id, deny-by-default on
// the context name, and the lazy connection that makes a refused request cost
// nothing. All this file supplies is what is genuinely local — which context,
// which binding, which env flag, and this worker's own response helpers.

import type { Env } from "../env.js";
import { createSqlExecutor } from "@openproduct/db/executor";
import { createWorkspacePurgeHandler } from "@openproduct/db/purge";
import { errorResponse, successResponse } from "../http.js";

/**
 * Whether this deployment may actually destroy data.
 *
 * Exact string match on `"true"`, mirroring `STATE_GC_COLLECT_ENABLED`. Absent,
 * empty, `"1"`, `"TRUE"` — all off. For an irreversible action the only
 * acceptable ambiguity is none.
 */
export function purgeEnabled(env: Pick<Env, "WORKSPACE_PURGE_ENABLED">): boolean {
  return env.WORKSPACE_PURGE_ENABLED === "true";
}

export const handleOpenproductWorkspacePurge = createWorkspacePurgeHandler<Env, Response, Hyperdrive>({
  context: "openproduct",
  getDb: (env) => env.PLATFORM_DB,
  isEnabled: purgeEnabled,
  createExecutor: (db) => createSqlExecutor(db),
  ok: successResponse,
  fail: errorResponse,
});
