import type { Env } from "../env.js";
import { successResponse } from "../http.js";

/**
 * The one unconditional route. The surface is always-on (the launch-flag
 * mechanism was retired once prod began serving openproduct directly), so
 * health reports deployment facts only.
 */
export function handleHealth(env: Env, requestId: string): Response {
  return successResponse(
    {
      status: "ok",
      service: "openproduct-worker",
      environment: env.ENVIRONMENT ?? "local",
      timestamp: new Date().toISOString(),
      checks: {
        database: { configured: !!env.PLATFORM_DB },
        // The membership binding left at OX5; what health can report now is
        // whether the seam secret this worker VERIFIES grants with is set.
        seam: { configured: !!(env.LISTING_SEAM_SECRET ?? "").trim() },
      },
    },
    requestId,
  );
}
