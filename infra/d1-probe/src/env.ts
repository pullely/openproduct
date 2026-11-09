// The probe Worker's bindings (openproduct-standalone OPN-2).

export interface Env {
  /** The throwaway `openproduct-probe-stage` database (infra/cloudflare-d1-probe), never the product's. */
  readonly DB: D1Database;
  /** Static bearer every route requires; a runtime secret (secrets-live). Absent or short = every route 404s. */
  readonly PROBE_TOKEN?: string;
  readonly ENVIRONMENT?: string;
}
