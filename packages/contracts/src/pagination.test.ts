// The cursor (openproduct-scale OS1).

import { describe, expect, it } from "vitest";

import {
  CATALOG_PAGE_KEYS,
  catalogueMomentCopy,
  FORMULAS,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  CATALOGUE_NEXT_LABEL,
  buildOpenApiDocument,
  byMostActive,
  cataloguePageMeta,
  cataloguePagePath,
  catalogueCursorOf,
  decodeCursor,
  encodeCursor,
  feedCatalogueMeta,
  pageSize,
  type PublicProfileCard,
} from "./index.js";

const card = (slug: string, publishedAt: string | null, merges: number | null): PublicProfileCard =>
  ({
    slug,
    publishedAt,
    metrics: merges === null ? [] : [{ key: "merges.7d", value: merges, observedAt: "2026-09-09T00:00:00.000Z", state: "fresh" }],
  }) as unknown as PublicProfileCard;

describe("the cursor", () => {
  it("round-trips the three keys, opaque on the wire", () => {
    const cursor = { activity: 13012, publishedAt: "2026-08-01T00:00:00.000Z", slug: "acme-thing" };
    const text = encodeCursor(cursor);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(text).not.toContain("acme-thing");
    expect(decodeCursor(text)).toEqual(cursor);
    const unknown = { activity: null, publishedAt: null, slug: "zzz" };
    expect(decodeCursor(encodeCursor(unknown))).toEqual(unknown);
  });

  it("refuses what is not exactly three keys of the right shapes", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "not base64!",
      encodeCursor({ activity: 1.5 as never, publishedAt: null, slug: "a" }),
      encodeCursor({ activity: -1, publishedAt: null, slug: "a" }),
      btoa(JSON.stringify([1, "2026-01-01", "a", "extra"])),
      btoa(JSON.stringify(["1", null, "a"])),
      btoa(JSON.stringify([1, "yesterday", "a"])),
      btoa(JSON.stringify([1, null, "not a slug!"])),
      btoa(JSON.stringify({ merges: 1 })),
      btoa("{"),
      "x".repeat(600),
    ]) {
      expect([String(bad).slice(0, 20), decodeCursor(bad)]).toEqual([String(bad).slice(0, 20), null]);
    }
  });

  it("is a card's own position — the keys the ordering read on it", () => {
    // OB3 — the folded key: (7 + 1) × (0 upvotes + 1) × 1000 + 7 changes.
    expect(catalogueCursorOf(card("a", "2026-08-01T00:00:00.000Z", 7))).toEqual({
      activity: 8007,
      publishedAt: "2026-08-01T00:00:00.000Z",
      slug: "a",
    });
    expect(catalogueCursorOf(card("b", null, null))).toEqual({ activity: null, publishedAt: null, slug: "b" });
  });
});

describe("the page size", () => {
  it("defaults, bounds, and never trusts a stranger's number", () => {
    expect(pageSize(null)).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSize("")).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSize("abc")).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSize("-5")).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSize("0")).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSize("25")).toBe(25);
    expect(pageSize("100000")).toBe(PAGE_SIZE_MAX);
    expect(PAGE_SIZE_MAX).toBe(200);
  });

  it("names the page's keys, and `next` is one of them — and since OS5 the page carries its moment", () => {
    expect([...CATALOG_PAGE_KEYS]).toEqual(["products", "next", "total", "computedAt"]);
  });
});

describe("OS-C — the tiebreak is published, in the sentence and in the comparator", () => {
  it("orders two listings with equal activity and equal instant by address, by code unit", () => {
    const a = card("aardvark-tool", "2026-08-01T00:00:00.000Z", 3);
    const z = card("zebra-tool", "2026-08-01T00:00:00.000Z", 3);
    expect([z, a].sort(byMostActive).map((c) => c.slug)).toEqual(["aardvark-tool", "zebra-tool"]);
    const an = card("aardvark-tool", "2026-08-01T00:00:00.000Z", null);
    const zn = card("zebra-tool", "2026-08-01T00:00:00.000Z", null);
    expect([zn, an].sort(byMostActive).map((c) => c.slug)).toEqual(["aardvark-tool", "zebra-tool"]);
    // Hyphen before a letter, as in `COLLATE "C"`.
    const h = card("acme-thing", "2026-08-01T00:00:00.000Z", null);
    const l = card("acmething", "2026-08-01T00:00:00.000Z", null);
    expect([l, h].sort(byMostActive).map((c) => c.slug)).toEqual(["acme-thing", "acmething"]);
  });

  it("says so in the published sentence", () => {
    expect(FORMULAS["sort.most-active"].sentence).toContain("ordered by their address, so a page boundary falls in one place");
  });
});

describe("the catalogue heading's line, with a total", () => {
  it("says 'first N of total' only when there is more than the page", () => {
    expect(feedCatalogueMeta(100, 0, 1204)).toBe("first 100 of 1,204 products · most active first");
    expect(feedCatalogueMeta(12, 0, 12)).toBe("12 products · most active first");
    expect(feedCatalogueMeta(12, 0, null)).toBe("12 products · most active first");
    expect(feedCatalogueMeta(96, 4, 100)).toBe("96 products on the front page · 4 more below the floor");
    expect(feedCatalogueMeta(96, 4, 1204)).toBe("first 96 of 1,204 on the front page · 4 more below the floor");
  });
});

describe("the page on the website, and on the wire", () => {
  it("lives at a path of its own, with the cursor escaped", () => {
    expect(cataloguePagePath("abc-_x")).toBe("/products/abc-_x");
    expect(cataloguePagePath("a/b")).toBe("/products/a%2Fb");
    expect(CATALOGUE_NEXT_LABEL).toBe("More builds");
    expect(cataloguePageMeta(100, 1204)).toBe("100 builds on this page · 1,204 in all · most active first");
    expect(cataloguePageMeta(1, null)).toBe("1 build on this page · most active first");
  });

  it("is documented: the catalogue's parameters and its `next`", () => {
    const doc = buildOpenApiDocument("https://api.test") as {
      paths: Record<string, { get: { parameters?: Array<{ name: string }>; responses: Record<string, { content: Record<string, { schema: { properties: { data: { properties: Record<string, unknown>; required?: string[] } } } }> }> } }>;
    };
    const products = doc.paths["/v1/products"]!.get;
    expect((products.parameters ?? []).map((p) => p.name).sort()).toEqual(["cursor", "limit"]);
    const data = products.responses["200"]!.content["application/json"]!.schema.properties.data;
    expect(Object.keys(data.properties).sort()).toEqual([...CATALOG_PAGE_KEYS].sort());
    expect(data.required?.sort()).toEqual([...CATALOG_PAGE_KEYS].sort());
  });
});

describe("OS5 — the page carries its moment", () => {
  it("says the moment as a UTC clock time, and says nothing on the live join", () => {
    expect(catalogueMomentCopy("2026-09-10T12:40:00.000Z")).toBe("as of 12:40 UTC");
    expect(catalogueMomentCopy("2026-09-10T00:05:30.000Z")).toBe("as of 00:05 UTC");
    expect(catalogueMomentCopy(null)).toBeNull();
    expect(catalogueMomentCopy("not a moment")).toBeNull();
  });
});
