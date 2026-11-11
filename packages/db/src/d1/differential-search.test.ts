// replaceSearchIndex, searchCandidates, getSearchIndexState and
// markSearchIndexDirty, Postgres vs local D1 (OPN D1 slice).
//
// PORTED CASES, each with its own assertions kept and run through the
// differential (`./differential.ts`):
//
//   src/pg/home-overlay-search.test.ts            "the search index (openproduct-commons DS0)" (6 cases)
//   src/search-index-driver.test.ts               "the index rebuild through postgres.js …" (4 slice cases)
//   src/search-index-prod-shape.test.ts           "the index against prod's own shape (RS5a)" (3 cases)
//   src/pg/media-snapshots-catalogue.test.ts      LI0 "a failure is recorded beside the floor…" (the
//                                                 replaceSearchIndex([]) step only — the ledger is not the slice)
//
// NOT PORTED, with the reason: home-overlay-search's "the index is marked
// stale by the WRITE" (3 cases) — they exercise publishProfile /
// unpublishProfile, which call `touchIndex()`; the listing writes are not in
// this slice. `touchIndex`'s own SQL (the slice's one `now()`) IS ported, as
// `touchSearchIndex`, and tested below against Postgres's statement.

import { buildProductIndex } from "@openproduct/contracts";
import { describe, expect, it } from "vitest";

import type { SearchIndexRow } from "../types.js";
import { NOW, repo, sql, usePgEngine } from "../pg/harness.js";

import { expectSameSearchTables, useDifferential } from "./differential.js";
import { createD1SliceRepository } from "./slice-repository.js";

usePgEngine();
const diff = useDifferential();

const DOC = (id: string, title = id, terms = [id], summary: string | null = null): SearchIndexRow => ({
  kind: "product",
  entityId: id,
  title,
  summary,
  terms,
  facets: { stack: ["typescript"] },
});

describe("ported: the search index (openproduct-commons DS0)", () => {
  it("the replace is WHOLESALE — what leaves the document leaves the index", async () => {
    await diff.replace("product", [DOC("acme-thing"), DOC("beta-thing")], NOW);
    expect((await diff.candidates(["acme-thing", "beta-thing"], 10)).map((r) => r.entityId).sort()).toEqual(["acme-thing", "beta-thing"]);
    await diff.replace("product", [DOC("acme-thing")], NOW);
    expect((await diff.candidates(["acme-thing", "beta-thing"], 10)).map((r) => r.entityId)).toEqual(["acme-thing"]);
  });

  it("an empty document clears the kind — and only that kind", async () => {
    await diff.replace("product", [DOC("acme-thing")], NOW);
    await diff.replace("person", [DOC("ada")], NOW);
    await diff.replace("product", [], NOW);
    expect(await diff.candidates(["acme-thing"], 10)).toEqual([]);
    expect((await diff.candidates(["ada"], 10)).map((r) => r.entityId)).toEqual(["ada"]);
  });

  it("narrows by term OVERLAP and carries the facets back", async () => {
    await diff.replace(
      "product",
      [
        DOC("acme-thing", "acme-thing", ["acme", "thing", "queue"], "A job queue"),
        DOC("beta-thing", "beta-thing", ["beta", "thing", "mail"], "Email"),
      ],
      NOW,
    );
    expect((await diff.candidates(["queue"], 10)).map((r) => r.entityId)).toEqual(["acme-thing"]);
    expect((await diff.candidates(["thing"], 10)).map((r) => r.entityId).sort()).toEqual(["acme-thing", "beta-thing"]);
    expect(await diff.candidates(["nothing-like-this"], 10)).toEqual([]);
    expect(await diff.candidates([], 10)).toEqual([]);
    const [row] = await diff.candidates(["queue"], 10);
    expect(row!.facets).toEqual({ stack: ["typescript"] });
    expect(row!.summary).toBe("A job queue");
  });

  it("refuses a row with no terms — it could never match, so it is not storable", async () => {
    await diff.bothRefuse(
      () => repo.replaceSearchIndex("product", [DOC("acme-thing", "acme-thing", [])], NOW),
      () => diff.d1.replaceSearchIndex("product", [DOC("acme-thing", "acme-thing", [])], NOW),
    );
  });

  it("a rebuild clears dirty; a write sets it and keeps the FIRST dirtying instant", async () => {
    // Seeded dirty by the migration on both (the instants differ — each is
    // its own migration's `now()` — so only the shape is compared here).
    const seededPg = await repo.getSearchIndexState();
    const seededD1 = await diff.d1.getSearchIndexState();
    for (const seeded of [seededPg, seededD1]) {
      expect(seeded.builtAt).toBeNull();
      expect(seeded.dirtyAt).not.toBeNull();
    }
    await diff.replace("product", [DOC("acme-thing")], NOW);
    const built = await diff.state();
    expect(built.builtAt).not.toBeNull();
    expect(built.dirtyAt).toBeNull();
    const first = "2026-08-17T12:05:00.000Z";
    const later = "2026-08-17T12:09:00.000Z";
    await diff.dirty(first);
    await diff.dirty(later);
    expect(Date.parse((await diff.state()).dirtyAt!)).toBe(Date.parse(first));
  });

  it("there can only ever be one state row", async () => {
    await diff.bothRefuse(
      () => sql.execute(`INSERT INTO openproduct.search_index_state (singleton) VALUES (TRUE)`),
      () => diff.local.sql.execute(`INSERT INTO search_index_state (singleton) VALUES (1)`),
    );
    await diff.bothRefuse(
      () => sql.execute(`INSERT INTO openproduct.search_index_state (singleton) VALUES (FALSE)`),
      () => diff.local.sql.execute(`INSERT INTO search_index_state (singleton) VALUES (0)`),
    );
  });
});

const authored = <T,>(value: T) => ({ value, provenance: { class: "authored", by: "maintainer" } });
const derived = <T,>(value: T) => ({
  value,
  provenance: { class: "derived", formula: "facet.count", inputs: ["stack"], computedAt: "2026-09-09T18:51:26.108Z" },
});
/** Prod's catalogue on 9 Sep 2026 (search-index-driver.test.ts), verbatim. */
const PROD_CARDS_9_SEP = [
  { slug: "one-project", tagline: authored("This is a new project that make happy baby"), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "portfolio2", tagline: authored(null), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "a-new-one", tagline: authored("This is a new product"), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "my-product", tagline: authored("This is a new product"), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "my-project", tagline: authored("This is a test Project"), stackCanonical: derived([] as string[]), category: authored("dev-tools"), hosting: authored("self-hosted"), pricing: authored("free"), licence: authored(null) },
] as unknown as Parameters<typeof buildProductIndex>[0];
/** Prod's catalogue on 7 Sep 2026 (search-index-prod-shape.test.ts), verbatim. */
const PROD_CARDS_7_SEP = [
  { slug: "a-new-one", tagline: authored("This is a new product"), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "my-product", tagline: authored("This is a new product"), stackCanonical: derived([] as string[]), category: authored(null), hosting: authored(null), pricing: authored(null), licence: authored(null) },
  { slug: "my-project", tagline: authored("This is a test Project"), stackCanonical: derived([] as string[]), category: authored("dev-tools"), hosting: authored("self-hosted"), pricing: authored(null), licence: authored(null) },
] as unknown as Parameters<typeof buildProductIndex>[0];

describe("ported: the index rebuild through the driver (LI1) — the slice's four cases", () => {
  it("the empty branch — stage's path — writes the build instant", async () => {
    expect(await diff.replace("product", [], "2026-09-09T19:00:00.000Z")).toBe(0);
    expect(await diff.state()).toEqual({ builtAt: "2026-09-09T19:00:00.000Z", dirtyAt: null });
  });

  it("the non-empty branch — prod's path — writes every listing", async () => {
    const docs = buildProductIndex(PROD_CARDS_9_SEP);
    expect(docs.length).toBeGreaterThanOrEqual(4);
    expect(await diff.replace("product", docs, "2026-09-09T19:00:00.000Z")).toBe(docs.length);
    expect(await diff.state()).toEqual({ builtAt: "2026-09-09T19:00:00.000Z", dirtyAt: null });
    const rows = await diff.local.sql.execute<{ entity_id: string }>(`SELECT entity_id FROM search_index ORDER BY entity_id`);
    expect(rows.rows.map((r) => r.entity_id)).toEqual(docs.map((d) => d.entityId).sort());
  });

  it("a second rebuild replaces rather than duplicates, and de-indexes what the document no longer carries", async () => {
    const docs = buildProductIndex(PROD_CARDS_9_SEP);
    await diff.replace("product", docs, "2026-09-09T19:00:00.000Z");
    const fewer = docs.filter((d) => d.entityId !== "my-product");
    await diff.replace("product", fewer, "2026-09-09T19:10:00.000Z");
    const rows = await diff.local.sql.execute<{ entity_id: string }>(`SELECT entity_id FROM search_index`);
    expect(rows.rows.map((r) => r.entity_id).sort()).toEqual(fewer.map((d) => d.entityId).sort());
  });

  it("the candidate read finds a listing by its own name, and terms come back as an array", async () => {
    await diff.replace("product", buildProductIndex(PROD_CARDS_9_SEP), "2026-09-09T19:00:00.000Z");
    const hits = await diff.candidates(["my", "project"], 10);
    expect(hits.map((h) => h.entityId)).toContain("my-project");
    expect(Array.isArray(hits[0]!.terms)).toBe(true);
    expect(hits[0]!.terms.length).toBeGreaterThan(0);
  });
});

describe("ported: the index against prod's own shape (RS5a)", () => {
  it("indexes a listing whose every facet is absent (engine-free — the documents both engines are given)", () => {
    const docs = buildProductIndex(PROD_CARDS_7_SEP);
    expect(docs).toHaveLength(3);
    expect(docs.filter((d) => Object.keys(d.facets).length === 0)).toHaveLength(2);
    expect(docs[0]!.terms).toEqual(["is", "new", "one", "product", "this"]);
  });

  it("writes all three and records the build", async () => {
    const built = "2026-09-07T06:45:00.000Z";
    expect(await diff.replace("product", buildProductIndex(PROD_CARDS_7_SEP), built)).toBe(3);
    expect(await diff.state()).toEqual({ builtAt: built, dirtyAt: null });
  });

  it("finds them again, which is the whole point", async () => {
    await diff.replace("product", buildProductIndex(PROD_CARDS_7_SEP), "2026-09-07T06:45:00.000Z");
    const hits = await diff.candidates(["my", "product"], 10);
    expect(hits.map((h) => h.entityId).sort()).toEqual(["a-new-one", "my-product", "my-project"]);
  });
});

describe("ported (partial): LI0 — the build the ledger reads", () => {
  it("an empty rebuild stamps the floor the searchIndex phase reports", async () => {
    await diff.replace("product", [], "2026-08-17T12:20:00.000Z");
    expect((await diff.state()).builtAt).toBe("2026-08-17T12:20:00.000Z");
  });
});

// ─── edge cases ────────────────────────────────────────────────────────────

const CATEGORIES = ["developer-tools", "productivity", "infrastructure", "design"];
const LANGUAGES = ["typescript", "go", "rust", "python"];
const HOSTINGS = ["self-host", "cloud", "both"];
/** The corpus's search_index rows (scale/corpus.ts), as documents. */
function corpusDocs(n: number): SearchIndexRow[] {
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    const id = `product-${String(k).padStart(5, "0")}`;
    return {
      kind: "listing",
      entityId: id,
      title: id,
      summary: `A dull, deterministic product for measuring page weight (#${k}).`,
      terms: ["product", String(k).padStart(5, "0"), CATEGORIES[k % 4]!, LANGUAGES[k % 4]!, "dull", "deterministic"],
      facets: { category: [CATEGORIES[k % 4]!], hosting: [HOSTINGS[k % 3]!] },
    };
  });
}

describe("edge cases, differential", () => {
  it("replaces 5,000 documents in more than one chunk, cold and again unchanged, then de-indexes one", async () => {
    const docs = corpusDocs(5_000);
    expect(await diff.replace("listing", docs, "2026-09-09T12:00:00.000Z")).toBe(5_000);
    const inserts = diff.statements.filter((s) => s.text.trimStart().startsWith("INSERT INTO search_index (kind"));
    expect(inserts.length).toBeGreaterThan(1);
    for (const s of inserts) expect(Buffer.byteLength(String(s.params![1]), "utf8")).toBeLessThanOrEqual(900_000);
    expect(await diff.replace("listing", docs, "2026-09-09T12:10:00.000Z")).toBe(5_000);
    expect(await diff.replace("listing", docs.filter((d) => d.entityId !== "product-00060"), "2026-09-09T12:20:00.000Z")).toBe(4_999);
    expect(await diff.candidates(["00060"], 50)).toEqual([]);
    expect((await diff.candidates(["00061"], 50)).map((r) => r.entityId)).toEqual(["product-00061"]);
    // A common term truncates at the limit on both; a multi-term query is OR.
    expect(await diff.candidates(["product"], 50)).toHaveLength(50);
    expect((await diff.candidates(["00001", "00002", "nope"], 50)).map((r) => r.entityId).sort()).toEqual(["product-00001", "product-00002"]);
  }, 120_000);

  it("forces the many-chunk path with a small ceiling and lands the same index", async () => {
    const docs = corpusDocs(300);
    const recorded: string[] = [];
    const small = createD1SliceRepository(
      {
        execute: (text, params) => diff.local.sql.execute(text, params),
        batch: async (list) => {
          recorded.push(...list.map((s) => s.text));
          return diff.local.sql.batch(list);
        },
      },
      { maxParamBytes: 2_000 },
    );
    expect(await repo.replaceSearchIndex("listing", docs, NOW)).toBe(300);
    expect(await small.replaceSearchIndex("listing", docs, NOW)).toBe(300);
    expect(recorded.filter((t) => t.trimStart().startsWith("INSERT INTO search_index (kind")).length).toBeGreaterThan(40);
    await expectSameSearchTables(sql, diff.local);
    expect(await diff.candidates(["00150"], 10)).toHaveLength(1);
  }, 60_000);

  it("indexes and finds unicode and emoji titles and terms, exactly (no folding on either engine)", async () => {
    const docs: SearchIndexRow[] = [
      { kind: "product", entityId: "café-tool", title: "Café ☕ tool", summary: "Ünïcödé — 東京", terms: ["café", "☕", "東京", "rocket-🚀"], facets: { stack: ["déno"] } },
      { kind: "product", entityId: "cafe-tool", title: "Cafe tool", summary: null, terms: ["cafe", "tool"], facets: {} },
    ];
    await diff.replace("product", docs, NOW);
    expect((await diff.candidates(["café"], 10)).map((r) => r.entityId)).toEqual(["café-tool"]);
    expect((await diff.candidates(["🚀"], 10)).map((r) => r.entityId)).toEqual([]);
    expect((await diff.candidates(["rocket-🚀"], 10)).map((r) => r.title)).toEqual(["Café ☕ tool"]);
    expect(await diff.candidates(["Cafe"], 10)).toEqual([]);
    expect((await diff.candidates(["cafe", "cafe", "東京"], 10)).map((r) => r.entityId).sort()).toEqual(["cafe-tool", "café-tool"]);
  });

  it("refuses a duplicate document on both engines", async () => {
    await diff.bothRefuse(
      () => repo.replaceSearchIndex("product", [DOC("a"), DOC("a")], NOW),
      () => diff.d1.replaceSearchIndex("product", [DOC("a"), DOC("a")], NOW),
    );
  });

  it("refuses a NUL character on both engines (Postgres cannot store one; SQLite would truncate it)", async () => {
    await diff.bothRefuse(
      () => repo.replaceSearchIndex("product", [DOC("a", "a\u0000b")], NOW),
      () => diff.d1.replaceSearchIndex("product", [DOC("a", "a\u0000b")], NOW),
    );
  });

  it("DIVERGES ON FAILURE, by design: a refused rebuild leaves D1's index untouched, and Postgres's half-deleted", async () => {
    await diff.replace("product", [DOC("keep-a"), DOC("keep-b")], NOW);
    const bad = [DOC("new-c"), DOC("new-d", "new-d", [])];
    await diff.bothRefuse(
      () => repo.replaceSearchIndex("product", bad, NOW),
      () => diff.d1.replaceSearchIndex("product", bad, NOW),
    );
    // Postgres ran its DELETE as its own autocommit before the INSERT failed.
    const pgLeft = await sql.execute<{ entity_id: string }>(`SELECT entity_id FROM openproduct.search_index ORDER BY entity_id`);
    expect(pgLeft.rows.map((r) => r.entity_id)).toEqual([]);
    // D1 ran one batch: all of it or none of it.
    const d1Left = await diff.local.sql.execute<{ entity_id: string }>(`SELECT entity_id FROM search_index ORDER BY entity_id`);
    expect(d1Left.rows.map((r) => r.entity_id)).toEqual(["keep-a", "keep-b"]);
    expect((await diff.d1.searchCandidates(["keep-a"], 10)).map((r) => r.entityId)).toEqual(["keep-a"]);
  });

  it("touchSearchIndex is touchIndex: the database's clock, the FIRST instant kept", async () => {
    await diff.replace("product", [DOC("a")], NOW);
    await sql.execute(`UPDATE openproduct.search_index_state SET dirty_at = COALESCE(dirty_at, now())`);
    await diff.d1.touchSearchIndex();
    const pgState = await repo.getSearchIndexState();
    const d1State = await diff.d1.getSearchIndexState();
    for (const s of [pgState, d1State]) {
      expect(s.dirtyAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      expect(Math.abs(Date.parse(s.dirtyAt!) - Date.now())).toBeLessThan(60_000);
    }
    await diff.d1.touchSearchIndex();
    expect((await diff.d1.getSearchIndexState()).dirtyAt).toBe(d1State.dirtyAt);
    await diff.dirty("2020-01-01T00:00:00.000Z");
    expect((await diff.d1.getSearchIndexState()).dirtyAt).toBe(d1State.dirtyAt);
  });

  it("normalises the instants it is handed: a build stamped '…Z' without milliseconds reads back in the one format", async () => {
    await diff.replace("product", [DOC("a")], "2026-08-17T12:00:00Z");
    expect(await diff.state()).toEqual({ builtAt: "2026-08-17T12:00:00.000Z", dirtyAt: null });
    await diff.dirty("2026-08-17T14:00:00+02:00");
    expect((await diff.state()).dirtyAt).toBe("2026-08-17T12:00:00.000Z");
  });
});
