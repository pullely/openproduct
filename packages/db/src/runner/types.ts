// VENDORED from packages/db-migrations/src/runner/types.ts (openproduct-independence
// OX5c) — the migration runner comes along whole so the built CLI is
// self-contained (no cross-package import survives into dist), which is also
// the OX6 repo-cut shape. The manifest entry types are vendored with it.

export interface MigrationEntry {
  id: string;
  context: string;
  path: string;
  checksum: string;
  description: string;
}

export interface MigrationManifest {
  version: number;
  migrations: MigrationEntry[];
}


export interface AppliedMigration {
  id: string;
  context: string;
  checksum: string;
  applied_at: string;
}

export interface MigrationAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  acquireAdvisoryLock(lockId: number): Promise<boolean>;
  releaseAdvisoryLock(lockId: number): Promise<void>;
  getAppliedMigrations(): Promise<AppliedMigration[]>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  executeSql(sql: string): Promise<void>;
  recordMigration(entry: MigrationEntry): Promise<void>;
}

export type RunMode = "plan" | "apply";

export interface RunnerConfig {
  mode: RunMode;
  migrationsDir: string;
  adapter: MigrationAdapter | null;
}

export interface MigrationPlan {
  alreadyApplied: string[];
  pending: MigrationEntry[];
  checksumMismatches: Array<{ id: string; expected: string; actual: string }>;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  failed: { id: string; error: string } | null;
}
