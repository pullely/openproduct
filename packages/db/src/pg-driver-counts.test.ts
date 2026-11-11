// A FINDING the D1 differential surfaced, pinned (OPN D1 slice): through the
// PRODUCTION Postgres executor, the slice's write counts are always zero.
//
// `createSqlExecutor` reports `rowCount: result.length` (postgres.js), and a
// statement without RETURNING returns no rows — so `rebuildCatalogue`'s
// `written` and `removed`, and `replaceSearchIndex([])`'s cleared count, are 0
// in production whatever happened. The pglite harness reports
// `affectedRows`, so every Postgres test sees the real counts and none
// notices. This is factory RUNBOOK trap 22 in Postgres form. The D1 trial
// counted with RETURNING and matched pglite, but D1 was not adopted (OPN-3),
// so Postgres stays and so does this pin: it proves what production Postgres
// reports, through the same driver lane as search-index-driver.test.ts. When
// the Postgres side is fixed (RETURNING 1), these expectations flip.

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSqlExecutor } from "./executor.js";
import { ladder } from "./pg/global-setup.js";
import { createOpenproductRepository } from "./repository.js";
import type { OpenproductRepository } from "./types.js";

let db: PGlite;
let server: PGLiteSocketServer;
let executor: ReturnType<typeof createSqlExecutor>;
let prod: OpenproductRepository;
let harness: OpenproductRepository;

beforeAll(async () => {
  db = new PGlite();
  for (const file of ladder()) await db.exec(readFileSync(file, "utf-8"));
  server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0 });
  await server.start();
  const port = Number(server.getServerConn().split(":").pop());
  executor = createSqlExecutor(
    { connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/postgres` },
    (cs) => postgres(cs, { max: 1, fetch_types: false, prepare: true }),
  );
  prod = createOpenproductRepository(executor);
  harness = createOpenproductRepository({
    async execute(text: string, params?: unknown[]) {
      const res = await db.query(text, params ?? []);
      return { rows: (res.rows ?? []) as never[], rowCount: res.affectedRows ?? (res.rows?.length ?? 0) };
    },
  });
  await db.exec(`INSERT INTO openproduct.profiles (id, org_id, project_id, slug, visibility, created_by, reviewed_at, published_at)
                 VALUES ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111',
                         '33333333-3333-4333-8333-333333333333', 'acme-thing', 'public', 'usr_a', now(), now())`);
}, 120_000);

afterAll(async () => {
  await executor?.dispose();
  await server?.stop();
  await db?.close();
});

const input = { now: "2026-08-17T12:00:00.000Z", mergesSince: "2026-08-15T12:00:00.000Z", endorsementsSince: "2026-08-15T12:00:00.000Z" };

describe("FINDING: the production Postgres executor under-reports the slice's write counts", () => {
  it("rebuildCatalogue writes one card and reports written: 0 through postgres.js (pglite would say 1)", async () => {
    const report = await prod.rebuildCatalogue(input);
    expect(report).toEqual({ computedAt: input.now, cards: 1, written: 0, removed: 0 });
    const rows = await db.query(`SELECT count(*)::int AS n FROM openproduct.catalog_cards`);
    expect(rows.rows).toEqual([{ n: 1 }]);
    // The same write again, through the harness executor, on a cleared table: the real count.
    await db.exec(`DELETE FROM openproduct.catalog_cards`);
    expect((await harness.rebuildCatalogue(input)).written).toBe(1);
  });

  it("a delisting removes one card and reports removed: 0 through postgres.js", async () => {
    await db.exec(`UPDATE openproduct.profiles SET visibility = 'private'`);
    expect(await prod.rebuildCatalogue(input)).toEqual({ computedAt: input.now, cards: 0, written: 0, removed: 0 });
  });

  it("replaceSearchIndex([]) clears two rows and reports 0 through postgres.js", async () => {
    await db.exec(`INSERT INTO openproduct.search_index (kind, entity_id, title, terms, built_at)
                   VALUES ('product', 'a', 'a', '{a}', now()), ('product', 'b', 'b', '{b}', now())`);
    expect(await prod.replaceSearchIndex("product", [], input.now)).toBe(0);
    const left = await db.query(`SELECT count(*)::int AS n FROM openproduct.search_index`);
    expect(left.rows).toEqual([{ n: 0 }]);
  });
});
