#!/usr/bin/env node
// openproduct's migration runner CLI (openproduct-independence OX5c).
//
// A thin twin of the platform's `packages/db-migrations/src/runner/cli.ts`, run by
// stack-tectonic's db-migrate composition (whose `buildFilter` parameter
// builds this package instead of @saas/db). The generic machinery — the
// runner loop, the checksum discipline, the Supabase adapter — is VENDORED
// beside it (see runner/types.ts), so the built CLI is self-contained: no
// cross-package import survives into dist, which is what lets
// `node dist/runner/cli.js` run. What is local is exactly what should be:
// THIS manifest, THIS migrations dir, and THIS database's project ref, read
// from SUPABASE_PROJECT_REF (published by infra/supabase, design §11).

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runMigrations } from "./runner.js";
import { loadProjectRef } from "./secrets.js";
import { SupabaseApiAdapter } from "./supabase-api-adapter.js";
import type { MigrationAdapter, RunMode } from "./types.js";

import { manifest } from "../manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../migrations");

const SUPABASE_ACCESS_TOKEN = process.env["SUPABASE_ACCESS_TOKEN"];

function usage(): never {
  process.stderr.write(
    `Usage: openproduct-db-migrate <plan|apply> --env <stage|prod>\n` +
      `\n` +
      `Modes:\n` +
      `  plan   — verify checksums and report pending migrations (offline)\n` +
      `  apply  — apply pending migrations to the openproduct database\n` +
      `\n` +
      `Environment:\n` +
      `  SUPABASE_ACCESS_TOKEN    Supabase management API token (required for apply)\n` +
      `  SUPABASE_PROJECT_REF     Supabase project ref (required for apply; from orun secrets)\n` +
      `  MIGRATION_ENV            fallback for --env\n`,
  );
  process.exit(1);
}

function parseArgs(argv: string[]): { mode: RunMode; env: string } {
  const args = argv.slice(2);
  const mode = args[0] as RunMode | undefined;
  if (mode !== "plan" && mode !== "apply") usage();

  let env: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--env" && args[i + 1]) env = args[++i];
  }
  env ??= process.env["MIGRATION_ENV"];
  if (!env || !["stage", "prod"].includes(env)) {
    process.stderr.write("Error: --env must be 'stage' or 'prod'\n");
    process.exit(1);
  }
  return { mode, env };
}

async function resolveAdapter(mode: RunMode, env: string): Promise<MigrationAdapter | null> {
  if (mode === "plan") return null;
  if (!SUPABASE_ACCESS_TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required for apply mode");
  }
  const projectRef = loadProjectRef();
  process.stderr.write(`Applying to the ${env} project from SUPABASE_PROJECT_REF (orun secrets)\n`);
  return new SupabaseApiAdapter(projectRef, SUPABASE_ACCESS_TOKEN);
}

async function main(): Promise<void> {
  const { mode, env } = parseArgs(process.argv);
  process.stderr.write(`openproduct-db-migrate: mode=${mode} env=${env}\n`);

  const adapter = await resolveAdapter(mode, env);
  const result = await runMigrations(manifest, {
    mode,
    migrationsDir: MIGRATIONS_DIR,
    adapter,
  });

  process.stderr.write(
    `${mode}: applied=${result.applied.length} skipped=${result.skipped.length}\n`,
  );
  for (const id of result.applied) process.stderr.write(`  ${mode === "plan" ? "pending" : "applied"}: ${id}\n`);
  if (result.failed) {
    process.stderr.write(`FAILED at ${result.failed.id}: ${result.failed.error}\n`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`openproduct-db-migrate: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
