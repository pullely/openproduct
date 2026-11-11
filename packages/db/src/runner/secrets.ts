// The runner's database identity, from the ENVIRONMENT (openproduct-standalone
// design §11). infra/supabase publishes its project ref to the environment's
// workspace secrets after apply, and infra/db-migrate declares
// SUPABASE_PROJECT_REF in its secretEnv, so orun resolves it into the job env.
// No Secrets Manager, no AWS SDK (lumen's runner made the same move).
//
// The project ref is all the runner needs: it applies migrations through the
// Supabase Management API (supabase-api-adapter.ts), authenticated by
// SUPABASE_ACCESS_TOKEN, never over a direct Postgres connection.

/** The Supabase project ref from SUPABASE_PROJECT_REF. Throws when it is unset
 * or blank, so a missing wiring fails the apply loudly. */
export function loadProjectRef(env: NodeJS.ProcessEnv = process.env): string {
  const value = env["SUPABASE_PROJECT_REF"]?.trim();
  if (!value) {
    throw new Error(
      "SUPABASE_PROJECT_REF is not set — declare it in infra/db-migrate's secretEnv (published by openproduct-supabase)",
    );
  }
  return value;
}
