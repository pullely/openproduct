// The D1 side of the differential suite (openproduct-standalone OPN).
//
// LOCAL D1 IS REAL WORKERD SQLITE. `miniflare` starts the same `workerd`
// binary `wrangler dev` runs, and `getD1Database` hands back the binding a
// Worker would get — the D1 API, its authorizer (no `sqlite_version()`, no
// REGEXP, no `now()`), its 100-parameter and 100 KB-statement limits. It is
// not better-sqlite3 and not pglite. What it is NOT is remote D1: no network,
// no replication, and it does not enforce the 2 MB value or 50 MB result
// ceilings (both verified — PROOF.md).
//
// THE MIRROR. A differential test seeds Postgres through the real Postgres
// repository (publish, observe, write a metric — the writes this slice does
// not port), then copies the SOURCE tables the slice reads (profiles,
// role_openings, metrics, product_media) into D1 under the translation rules
// — timestamps to the one ISO format, JSONB to its JSON text, booleans to
// 0/1 — and calls the same slice method on both. The DERIVED tables
// (catalog_cards, catalog_state, search_index*) are never mirrored: each
// engine computes its own, and the suite compares them.

import { Miniflare, convertV4MiniflareOptions } from "miniflare";

import type { SqlExecutor } from "../executor.js";

import type { D1Binding } from "./binding.js";
import { createD1Executor, type D1RoundObserver, type D1SqlExecutor, type D1Statement } from "./executor.js";
import { SLICE_TABLES_CHILDREN_FIRST, sliceSchemaStatements } from "./schema.js";
import { chunkJsonArrays } from "./slice-repository.js";

export interface LocalD1 {
  readonly binding: D1Binding;
  readonly sql: D1SqlExecutor;
  /** Rounds and statements since the last `resetCounts()` (the observer's view). */
  readonly counts: { rounds: number; statements: number; sqlMs: number };
  resetCounts(): void;
  dispose(): Promise<void>;
}

/** Start a workerd with one empty in-memory D1 database bound as `DB`. */
export async function startLocalD1(): Promise<LocalD1> {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('d1-slice'); } }",
      d1Databases: { DB: "openproduct-d1-slice" },
    }),
  );
  const binding = (await mf.getD1Database("DB")) as unknown as D1Binding;
  const counts = { rounds: 0, statements: 0, sqlMs: 0 };
  const observer: D1RoundObserver = {
    onRound(_kind, statements, _ms, sqlMs) {
      counts.rounds += 1;
      counts.statements += statements;
      counts.sqlMs += sqlMs;
    },
  };
  return {
    binding,
    sql: createD1Executor(binding, observer),
    counts,
    resetCounts() {
      counts.rounds = 0;
      counts.statements = 0;
      counts.sqlMs = 0;
    },
    async dispose() {
      await mf.dispose();
    },
  };
}

/** Drop the slice's tables and apply the schema again — every test starts from the migration. */
export async function resetSliceSchema(sql: D1SqlExecutor): Promise<void> {
  await sql.batch([
    ...SLICE_TABLES_CHILDREN_FIRST.map((table) => ({ text: `DROP TABLE IF EXISTS ${table}` })),
    ...sliceSchemaStatements().map((text) => ({ text })),
  ]);
}

// ---------------------------------------------------------------------------
// The mirror: Postgres source tables → D1, under the translation rules
// ---------------------------------------------------------------------------

interface MirroredTable {
  readonly table: string;
  readonly columns: readonly string[];
  /** JSONB columns: read as `::text` so the exact JSON text crosses. */
  readonly json?: readonly string[];
  /** Upserted by `id` (profiles: other tables reference it, so it is never deleted wholesale). */
  readonly upsert?: boolean;
}

export const MIRRORED_TABLES: readonly MirroredTable[] = [
  {
    table: "profiles",
    upsert: true,
    json: ["stack", "stack_canonical", "components", "link_grant", "repo_topics"],
    columns: [
      "id", "org_id", "project_id", "slug", "visibility", "tagline", "pitch_body", "pitch_digest",
      "repo_url", "live_url", "stack", "repo_visibility", "repo_licence", "repo_checked_at",
      "reviewed_at", "reviewed_by", "published_at", "created_by", "updated_by", "created_at",
      "updated_at", "components", "link_grant", "category", "hosting", "stack_canonical",
      "indexable", "moderation_state", "moderated_at", "moderation_act_id", "repo_name",
      "repo_description", "repo_topics", "repo_language", "repo_pushed_at", "repo_open_issues",
      "install_line", "clean_votes", "pricing",
    ],
  },
  {
    table: "role_openings",
    columns: [
      "id", "profile_id", "title", "description", "commitment", "status", "join_link_ref",
      "sort_order", "created_at", "updated_at",
    ],
  },
  {
    table: "metrics",
    columns: ["id", "profile_id", "metric", "window_key", "value", "source", "observed_at", "created_at"],
  },
  {
    table: "product_media",
    columns: [
      "id", "profile_id", "kind", "storage_ref", "alt_text", "width", "height", "position",
      "observed_at", "created_at",
    ],
  },
];

/** A Postgres value as the D1 schema stores it. */
function translated(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export interface MirrorReport {
  readonly rows: Record<string, number>;
  readonly statements: number;
}

/**
 * Copy the slice's source tables from Postgres into D1, atomically (one
 * batch), every bulk value one JSON parameter under the ceiling.
 */
export async function mirrorPgIntoD1(
  pg: SqlExecutor,
  d1: D1SqlExecutor,
  maxParamBytes = 900_000,
): Promise<MirrorReport> {
  const statements: D1Statement[] = [];
  const rows: Record<string, number> = {};
  const deletes: D1Statement[] = [];
  const inserts: D1Statement[] = [];
  for (const spec of MIRRORED_TABLES) {
    const select = spec.columns
      .map((c) => (spec.json?.includes(c) ? `${c}::text AS ${c}` : c))
      .join(", ");
    const res = await pg.execute(`SELECT ${select} FROM openproduct.${spec.table}`);
    rows[spec.table] = res.rows.length;
    const objects = res.rows.map((row) =>
      Object.fromEntries(spec.columns.map((c) => [c, translated(row[c])])),
    );
    const extract = spec.columns.map((c) => `json_extract(value, '$.${c}')`).join(", ");
    const insert = (chunk: string): D1Statement => ({
      text: `INSERT INTO ${spec.table} (${spec.columns.join(", ")})
             SELECT ${extract} FROM json_each($1) WHERE true
             ${spec.upsert ? `ON CONFLICT (id) DO UPDATE SET ${spec.columns.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}` : ""}`,
      params: [chunk],
    });
    const chunks = chunkJsonArrays(objects, maxParamBytes, `${spec.table} row`);
    if (spec.upsert) {
      // Upsert, then drop what Postgres no longer has (its dependents cascade, as on Postgres).
      statements.push(...chunks.map(insert));
      const ids = JSON.stringify(objects.map((o) => o.id));
      statements.push({ text: `DELETE FROM ${spec.table} WHERE id NOT IN (SELECT value FROM json_each($1))`, params: [ids] });
    } else {
      deletes.push({ text: `DELETE FROM ${spec.table}` });
      inserts.push(...chunks.map(insert));
    }
  }
  statements.push(...deletes, ...inserts);
  await d1.batch(statements);
  return { rows, statements: statements.length };
}
