// The migration plane's guards (openproduct-independence OX5c).
//
// Two claims, each of which failing means a real production hazard:
//
//   1. LOCK SYNC — apps/openproduct/infra/db-migrate/migrations.lock mirrors
//      this manifest, or a new migration silently never schedules the
//      plan/apply (the exact failure the platform's lock exists to prevent).
//   2. LADDER INTEGRITY — every manifest entry's file exists here and hashes
//      to its recorded checksum: the runner refuses drift, so CI should too.
//
// (A third claim — TWIN SYNC against the platform manifest — lives in
// migrations-twin-sync.test.ts, its own file BECAUSE it dies at the repo
// cut: the cut deletes that one file and the @saas/db-migrations devDependency with
// it, and nothing here moves.)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { manifest } from "./manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "migrations");
const LOCK_PATH = resolve(__dirname, "../../../infra/db-migrate/migrations.lock");

describe("the migrations lock mirrors the manifest", () => {
  it("lists exactly the manifest's ids, in order", () => {
    const lock = readFileSync(LOCK_PATH, "utf-8")
      .split("\n")
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(lock).toEqual(manifest.migrations.map((m) => m.id));
  });
});

describe("the ladder's integrity", () => {
  it("every entry's file exists and hashes to its recorded checksum", () => {
    for (const entry of manifest.migrations) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, entry.path), "utf-8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      expect(`${entry.id}: ${checksum}`).toBe(`${entry.id}: ${entry.checksum}`);
    }
  });

  it("starts with the control baseline and stays in ladder order", () => {
    const ids = manifest.migrations.map((m) => m.id);
    expect(ids[0]).toBe("000_control_baseline");
    expect(ids.slice(1).every((id) => id.includes("openproduct"))).toBe(true);
  });
});
