// The D1 slice schema, as statements (openproduct-standalone OPN).
//
// `wrangler d1 migrations apply` splits a migration file itself. Tests apply
// the SAME file through the binding, split by `./statements.ts` (D1's own
// `exec()` splits on newlines and cannot run a multi-line CREATE TABLE). This
// module reads the file from disk, so it is node-only; the splitter is not.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { D1SqlExecutor } from "./executor.js";
import { splitSqlStatements } from "./statements.js";

export { SLICE_TABLES_CHILDREN_FIRST, splitSqlStatements } from "./statements.js";

const here = dirname(fileURLToPath(import.meta.url));

/** The slice migrations, in order. */
export const D1_SLICE_MIGRATIONS: readonly string[] = [resolve(here, "migrations/0001_slice.sql")];

/** Every statement of every slice migration, in order. */
export function sliceSchemaStatements(): string[] {
  return D1_SLICE_MIGRATIONS.flatMap((file) => splitSqlStatements(readFileSync(file, "utf-8")));
}

/** Apply the slice schema to an empty database, atomically (one batch). */
export async function applySliceSchema(sql: D1SqlExecutor): Promise<number> {
  const statements = sliceSchemaStatements();
  await sql.batch(statements.map((text) => ({ text })));
  return statements.length;
}
