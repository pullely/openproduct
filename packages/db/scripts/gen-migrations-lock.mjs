// Generates apps/openproduct/infra/db-migrate/migrations.lock from
// openproduct's OWN migration manifest (openproduct-independence OX5c) —
// the same planner-visibility trick the platform's generator documents:
// orun's --changed planner keys the openproduct-db-migrate component off ITS
// directory, so a new migration must change a file there to schedule the
// plan/apply. Regenerate + commit after adding a migration:
//   pnpm --filter @openproduct/db gen:migrations-lock
// Enforced by apps/openproduct/packages/db/src/migrations-lock.test.ts.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "../src/manifest.ts");
const lockPath = resolve(here, "../../../infra/db-migrate/migrations.lock");

export function migrationIds() {
  const src = readFileSync(manifestPath, "utf8");
  return [...src.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
}

const HEADER = `# AUTO-GENERATED — do not edit by hand.
#
# Mirrors the migration ids in apps/openproduct/packages/db/src/manifest.ts so
# that adding a migration changes a file inside this component's directory —
# orun's --changed planner keys openproduct-db-migrate off THIS directory.
# Regenerate with: pnpm --filter @openproduct/db gen:migrations-lock
# Enforced by apps/openproduct/packages/db/src/migrations-lock.test.ts.
`;

export function renderLock() {
  return HEADER + migrationIds().join("\n") + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const next = renderLock();
  const prev = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : "";
  if (prev === next) {
    console.log("migrations.lock already up to date");
  } else {
    writeFileSync(lockPath, next);
    console.log(`wrote ${lockPath} (${migrationIds().length} migrations)`);
  }
}
