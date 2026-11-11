// The migration plane's guards (openproduct-independence OX5c).
//
// LADDER INTEGRITY — every manifest entry's file exists here and hashes to its
// recorded checksum: the runner refuses drift, so CI should too.
//
// Two more claims lived here, and both left at the repository cut
// (openproduct-standalone OPN1):
//   - LOCK SYNC: infra/db-migrate/migrations.lock mirrored this manifest so
//     that adding a migration scheduled the Postgres `openproduct-db-migrate`
//     component. That component never deploys from this repository (design
//     §2, "Retired"); the D1 path, stack-tectonic's `db-migrate`, arrives in
//     OPN2 with its own change-detection rule (design §3.5).
//   - TWIN SYNC against the platform manifest (migrations-twin-sync.test.ts),
//     retired with its @saas/db-migrations devDependency.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { manifest } from "./manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "migrations");

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
