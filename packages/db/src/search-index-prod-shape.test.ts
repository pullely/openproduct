// The shape prod actually has (openproduct-worldclass RS5a).
//
// WHY THIS EXISTS. On 7 Sep the sweep fired on prod for the first time and
// the search index did not build, while `integrity` and `defence` did — and
// stage's index built fine minutes earlier off the same code and schema. Same
// code, different data, so the data was the obvious suspect.
//
// It is not. This test is that investigation, kept: prod's three listings,
// copied verbatim from what `GET /v1/products` served, driven through the
// real `buildProductIndex` into a real engine with the real migrations. They
// build, they write, and they are findable.
//
// The shape is worth guarding on its own merits, because it is the shape a
// BRAND NEW listing has and the one every fixture in this file forgets:
// **no licence, no category, no hosting, an empty stack — and therefore an
// empty `facets` object.** Two of the three produce `facets: {}`, which is the
// case a hand-written fixture never thinks to write.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { buildProductIndex } from "@openproduct/contracts";

import type { SqlExecutor } from "./executor.js";
import { manifest } from "./manifest.js";
import { createOpenproductRepository } from "./repository.js";
import type { OpenproductRepository } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = manifest.migrations
  .filter((m) => m.context === "openproduct")
  .map((m) => resolve(__dirname, "migrations", m.path));

/** An `authored` field, in the provenance envelope the catalog document uses. */
const authored = <T,>(value: T) => ({ value, provenance: { class: "authored", by: "maintainer" } });
/** A `derived` field, likewise. */
const derived = <T,>(value: T) => ({
  value,
  provenance: { class: "derived", formula: "facet.count", inputs: ["stack"], computedAt: "2026-09-07T06:10:38.305Z" },
});

/**
 * Prod's catalogue on 7 Sep 2026, as `GET /v1/products` served it.
 *
 * Only the fields `buildProductIndex` reads are kept — the point is the shape,
 * and a copy of every field would rot against a projection this does not test.
 */
const PROD_CARDS = [
  {
    slug: "a-new-one",
    tagline: authored("This is a new product"),
    stackCanonical: derived([] as string[]),
    category: authored(null),
    hosting: authored(null),
    pricing: authored(null),
    licence: authored(null),
  },
  {
    slug: "my-product",
    tagline: authored("This is a new product"),
    stackCanonical: derived([] as string[]),
    category: authored(null),
    hosting: authored(null),
    pricing: authored(null),
    licence: authored(null),
  },
  {
    slug: "my-project",
    tagline: authored("This is a test Project"),
    stackCanonical: derived([] as string[]),
    category: authored("dev-tools"),
    hosting: authored("self-hosted"),
    pricing: authored(null),
    licence: authored(null),
  },
] as unknown as Parameters<typeof buildProductIndex>[0];

let db: PGlite;
let sql: SqlExecutor;
let repo: OpenproductRepository;

beforeEach(async () => {
  db = new PGlite();
  sql = {
    async execute(text: string, params?: unknown[]) {
      const res = await db.query(text, params ?? []);
      return {
        rows: (res.rows ?? []) as never[],
        rowCount: res.affectedRows ?? (res.rows?.length ?? 0),
      };
    },
  };
  for (const m of MIGRATIONS) await db.exec(readFileSync(m, "utf-8"));
  repo = createOpenproductRepository(sql);
});

describe("openproduct — the index against prod's own shape (RS5a)", () => {
  it("indexes a listing whose every facet is absent", async () => {
    const docs = buildProductIndex(PROD_CARDS);
    expect(docs).toHaveLength(3);
    // The case a hand-written fixture never writes.
    expect(docs.filter((d) => Object.keys(d.facets).length === 0)).toHaveLength(2);
    // The single character is dropped by the tokeniser, and the rest survive:
    // a listing that tokenised to nothing would be DROPPED, not written empty.
    expect(docs[0]!.terms).toEqual(["is", "new", "one", "product", "this"]);
  });

  it("writes all three and records the build", async () => {
    const built = "2026-09-07T06:45:00.000Z";
    const written = await repo.replaceSearchIndex("product", buildProductIndex(PROD_CARDS), built);
    expect(written).toBe(3);
    expect(await repo.getSearchIndexState()).toEqual({ builtAt: built, dirtyAt: null });
  });

  it("finds them again, which is the whole point", async () => {
    await repo.replaceSearchIndex(
      "product",
      buildProductIndex(PROD_CARDS),
      "2026-09-07T06:45:00.000Z",
    );
    // `my-product` is what the audit searched for and got nothing.
    const hits = await repo.searchCandidates(["my", "product"], 10);
    expect(hits.map((h) => h.entityId).sort()).toEqual(["a-new-one", "my-product", "my-project"]);
  });
});
