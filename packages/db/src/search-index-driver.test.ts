// The index rebuild through the PRODUCTION DRIVER (openproduct-worldclass-v2 LI1).
//
// Every other test in this package binds parameters through pglite's own
// `query()`, which serialises a JavaScript array natively and never goes
// through postgres.js. Production goes through postgres.js with
// `fetch_types: false` (executor.ts), where the driver cannot type a
// parameter it is not told about — the class of defect BR4 found in
// `latestMetricsForSlugs` and RS5 named as the leading candidate for the
// search index rebuild that has never succeeded on production.
//
// This lane closes the gap: pglite behind a Postgres wire socket, and the
// SAME client `createSqlExecutor` builds — postgres.js, `fetch_types: false`,
// `prepare: true` — driving `replaceSearchIndex`'s two branches, the
// candidate read and the state reads with prod's own listing shape. What
// passes here has been through the wire the way production sends it.
//
// One deviation, named: `max: 1`. pglite is a single-connection database and
// the socket server multiplexes; a pool of five against it is a test of the
// multiplexer, not of the serialisation this lane exists to exercise.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildProductIndex } from "@openproduct/contracts";

import { createSqlExecutor } from "./executor.js";
import { manifest } from "./manifest.js";
import { createOpenproductRepository } from "./repository.js";
import { asUuid } from "./ids.js";
import type { OpenproductRepository } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = manifest.migrations
  .filter((m) => m.context === "openproduct")
  .map((m) => resolve(__dirname, "migrations", m.path));

const authored = <T,>(value: T) => ({ value, provenance: { class: "authored", by: "maintainer" } });
const derived = <T,>(value: T) => ({
  value,
  provenance: { class: "derived", formula: "facet.count", inputs: ["stack"], computedAt: "2026-09-09T18:51:26.108Z" },
});

/** Prod's catalogue on 9 Sep 2026 — five listings, one with a category, one with no tagline. */
const PROD_CARDS = [
  { slug: "one-project", tagline: authored("This is a new project that make happy baby"), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "portfolio2", tagline: authored(null), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "a-new-one", tagline: authored("This is a new product"), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "my-product", tagline: authored("This is a new product"), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "my-project", tagline: authored("This is a test Project"), stackCanonical: derived([] as string[]), category: authored("dev-tools"), hosting: authored("self-hosted"), pricing: authored("free"), licence: authored(null) },
] as unknown as Parameters<typeof buildProductIndex>[0];

let db: PGlite;
let server: PGLiteSocketServer;
let executor: ReturnType<typeof createSqlExecutor>;
let repo: OpenproductRepository;

beforeAll(async () => {
  db = new PGlite();
  for (const m of MIGRATIONS) await db.exec(readFileSync(m, "utf-8"));
  server = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0 });
  await server.start();
  // `getServerConn()` is `host:port`, and port 0 was resolved by the OS at listen.
  const port = Number(server.getServerConn().split(":").pop());
  executor = createSqlExecutor(
    { connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/postgres` },
    (cs) => postgres(cs, { max: 1, fetch_types: false, prepare: true }),
  );
  repo = createOpenproductRepository(executor);
}, 60_000);

afterAll(async () => {
  await executor?.dispose();
  await server?.stop();
  await db?.close();
});

beforeEach(async () => {
  await db.exec(`DELETE FROM openproduct.profiles`);
  await db.exec(`DELETE FROM openproduct.search_index`);
  await db.exec(`UPDATE openproduct.search_index_state SET built_at = NULL, dirty_at = now(), last_error = NULL, last_error_at = NULL`);
});

describe("the index rebuild through postgres.js with fetch_types:false (LI1)", () => {
  it("the empty branch — stage's path — writes the build instant", async () => {
    expect(await repo.replaceSearchIndex("product", [], "2026-09-09T19:00:00.000Z")).toBe(0);
    expect(await repo.getSearchIndexState()).toEqual({ builtAt: "2026-09-09T19:00:00.000Z", dirtyAt: null });
  });

  it("the non-empty branch — prod's path, which no other lane sends through the driver — writes every listing", async () => {
    const docs = buildProductIndex(PROD_CARDS);
    expect(docs.length).toBeGreaterThanOrEqual(4);
    const written = await repo.replaceSearchIndex("product", docs, "2026-09-09T19:00:00.000Z");
    expect(written).toBe(docs.length);
    expect(await repo.getSearchIndexState()).toEqual({ builtAt: "2026-09-09T19:00:00.000Z", dirtyAt: null });
    const rows = await executor.execute<{ entity_id: string; terms: unknown }>(
      `SELECT entity_id, terms FROM openproduct.search_index ORDER BY entity_id`,
    );
    expect(rows.rows.map((r) => r.entity_id)).toEqual(docs.map((d) => d.entityId).sort());
  });

  it("a second rebuild replaces rather than duplicates, and de-indexes what the document no longer carries", async () => {
    const docs = buildProductIndex(PROD_CARDS);
    await repo.replaceSearchIndex("product", docs, "2026-09-09T19:00:00.000Z");
    const fewer = docs.filter((d) => d.entityId !== "my-product");
    await repo.replaceSearchIndex("product", fewer, "2026-09-09T19:10:00.000Z");
    const rows = await executor.execute<{ entity_id: string }>(`SELECT entity_id FROM openproduct.search_index`);
    expect(rows.rows.map((r) => r.entity_id).sort()).toEqual(fewer.map((d) => d.entityId).sort());
  });

  it("the candidate read — `terms && $1::text[]` — finds a listing by its own name", async () => {
    await repo.replaceSearchIndex("product", buildProductIndex(PROD_CARDS), "2026-09-09T19:00:00.000Z");
    const hits = await repo.searchCandidates(["my", "project"], 10);
    expect(hits.map((h) => h.entityId)).toContain("my-project");
    // The driver hands `text[]` back as a string under fetch_types:false; the
    // repository's array reader must still yield an array.
    expect(Array.isArray(hits[0]!.terms)).toBe(true);
    expect(hits[0]!.terms.length).toBeGreaterThan(0);
  });

  it("the ledger's reads and writes (LI0) go through the same wire", async () => {
    await repo.recordSweepOutcomes(
      [{ phase: "searchIndex", ok: false, reason: "internal_error: Search index rebuild failed (503)" }],
      "2026-09-09T19:00:00.000Z",
    );
    const states = await repo.getSweepPhaseStates();
    expect(states.searchIndex.lastError).toBe("internal_error: Search index rebuild failed (503)");
    expect(states.searchIndex.lastErrorAt).toBe("2026-09-09T19:00:00.000Z");
    expect(typeof states.searchIndex.lastErrorAt).toBe("string");
    await repo.recordSweepOutcomes([{ phase: "searchIndex", ok: true, reason: null }], "2026-09-09T19:10:00.000Z");
    expect((await repo.getSweepPhaseStates()).searchIndex.lastError).toBeNull();
  });
});

describe("every JSON parameter, through the same driver (LI1)", () => {
  const ORG = asUuid("11111111-1111-4111-8111-111111111111");
  const PROJECT = asUuid("33333333-3333-4333-8333-333333333333");
  const PROFILE = asUuid("44444444-4444-4444-8444-444444444444");

  it("a listing's stack is stored as a JSON array, not as a JSON string that contains one", async () => {
    await repo.createProfile({
      id: PROFILE,
      orgId: ORG,
      projectId: PROJECT,
      slug: "acme-thing",
      createdBy: "usr_0000000000000000000000000000ac70",
      tagline: "A thing, built in the open",
      stack: ["typescript", "cloudflare"],
      linkGrant: { doorRef: "door_1", grantedBy: "usr_x", grantedAt: "2026-09-09T19:00:00.000Z", workspaceVisibility: "public" },
    });
    const row = await executor.execute<{ stack: string; canonical: string; grant: string }>(
      `SELECT jsonb_typeof(stack) AS stack, jsonb_typeof(stack_canonical) AS canonical, jsonb_typeof(link_grant) AS grant
         FROM openproduct.profiles WHERE id = $1`,
      [PROFILE],
    );
    expect(row.rows[0]).toEqual({ stack: "array", canonical: "array", grant: "object" });
    const read = await repo.getProfileForOrg(ORG, PROFILE);
    expect(read?.stack).toEqual(["typescript", "cloudflare"]);
  });

  it("an update's boolean flags and JSON columns bind correctly through the driver", async () => {
    await repo.createProfile({ id: PROFILE, orgId: ORG, projectId: PROJECT, slug: "acme-thing", createdBy: "usr_a", stack: ["go"] });
    const updated = await repo.updateProfile(ORG, PROFILE, { tagline: "Changed", stack: ["rust", "wasm"], updatedBy: "usr_a" });
    expect(updated?.tagline).toBe("Changed");
    expect(updated?.stack).toEqual(["rust", "wasm"]);
    const row = await executor.execute<{ t: string }>(
      `SELECT jsonb_typeof(stack) AS t FROM openproduct.profiles WHERE id = $1`,
      [PROFILE],
    );
    expect(row.rows[0]!.t).toBe("array");
  });
});

describe("every list the driver hands back as an array literal (LI1)", () => {
  const ORG = asUuid("11111111-1111-4111-8111-111111111111");
  const PROJECT = asUuid("33333333-3333-4333-8333-333333333333");
  const PROFILE = asUuid("44444444-4444-4444-8444-444444444444");
  const ADA = "usr_0000000000000000000000000000ada0";

  it("the visitor overlay's saved and endorsed slugs are lists, not the text `{acme-thing}`", async () => {
    await repo.createProfile({ id: PROFILE, orgId: ORG, projectId: PROJECT, slug: "acme-thing", createdBy: "usr_a", stack: [] });
    await db.exec(`UPDATE openproduct.profiles SET visibility = 'public', moderation_state = 'visible', published_at = now(), reviewed_at = now(), indexable = FALSE`);
    await repo.saveProduct(ADA, PROFILE);
    const overlay = await repo.overlayFor(ADA, ["acme-thing", "other"]);
    expect(overlay.savedSlugs).toEqual(["acme-thing"]);
    expect(Array.isArray(overlay.endorsedSlugs)).toBe(true);
    expect(overlay.savedCount).toBe(1);
  });
});
