// Product posts (openproduct-redesign OPR-3): the catalogue is the design's
// table, the validator is the one rule the builder and core share, and the
// wire shapes are pinned.

import { describe, expect, it } from "vitest";

import { ALL_THREAD_TAGS, PRODUCT_POST_THREAD_TAG, THREAD_TAGS, THREAD_TAG_LABELS } from "./discussions.js";
import { ME_OVERLAY_KEYS, ME_OVERLAY_MAX_IDS, parseOverlayOpeningIds, parseOverlayProductPostIds } from "./overlay.js";
import {
  AUTHORED_PRODUCT_POST_KINDS,
  MILESTONE_CODE_MAX,
  MILESTONE_SUMMARY_MAX,
  MILESTONE_TITLE_MAX,
  POST_BLOCK_CATALOGUE,
  POST_BLOCK_TYPES,
  PRODUCT_POST_API,
  PRODUCT_POST_ID_RE,
  PRODUCT_POST_KINDS,
  PRODUCT_POST_KIND_LABELS,
  PRODUCT_POST_REACTIONS,
  PRODUCT_POST_REACTION_COUNT_KEYS,
  PRODUCT_POST_REACTION_LABELS,
  PRODUCT_POSTS_PAGE_DEFAULT,
  PRODUCT_POSTS_PAGE_MAX,
  PUBLIC_MILESTONE_KEYS,
  PUBLIC_PRODUCT_POST_KEYS,
  composePostPagePath,
  decodeProductPostCursor,
  emptyReactionCounts,
  encodeProductPostCursor,
  isAuthoredProductPostKind,
  isProductPostKind,
  isProductPostReaction,
  isProductStage,
  milestoneCountsOf,
  parsePostBlocks,
  postBlockLines,
  postBlockSpec,
  postBlockValue,
  postBlocksPublishable,
  postUrl,
  prefilledPostBlocks,
  productPostPagePath,
  productPostThreadTitle,
  productPostsPageSize,
  publishedPostBlocks,
  validatePostBlocks,
  type ProductPostBlock,
  type ProductPostKind,
  // The barrel: the templates (the catalogue, the validator) live in
  // `product-post-blocks.ts`, the rest in `product-posts.ts`, and a consumer
  // imports both from one place.
} from "./index.js";

const row = (kind: ProductPostKind) =>
  POST_BLOCK_CATALOGUE[kind].map((b) => `${b.label}${b.required ? "*" : ""} ${b.type} ${b.limit}`);

describe("the block catalogue is the design's table (§6.2)", () => {
  it("holds five kinds, and four of them are authored", () => {
    expect([...PRODUCT_POST_KINDS]).toEqual(["feature", "version", "demo", "idea", "seat"]);
    expect([...AUTHORED_PRODUCT_POST_KINDS]).toEqual(["feature", "version", "idea", "seat"]);
    expect(Object.keys(POST_BLOCK_CATALOGUE).sort()).toEqual([...PRODUCT_POST_KINDS].sort());
    expect(isAuthoredProductPostKind("demo")).toBe(false);
    expect(isProductPostKind("demo")).toBe(true);
    expect(isProductPostKind("poll")).toBe(false);
  });

  it("names each kind the way the boards do", () => {
    expect(PRODUCT_POST_KIND_LABELS).toEqual({
      feature: "Feature shipped",
      version: "New version",
      demo: "Demo",
      idea: "New idea",
      seat: "Help wanted",
    });
  });

  it("Feature shipped", () => {
    expect(row("feature")).toEqual([
      "Feature* line 60",
      "What it does* text 200",
      "Try it* url 200",
      "For line 60",
      "Milestone line 20",
      "Screenshot url 200",
      "Demo url 200",
    ]);
  });

  it("New version", () => {
    expect(row("version")).toEqual([
      "Version* line 20",
      "Added* lines 300",
      "Changed lines 300",
      "Fixed lines 300",
      "Security lines 300",
      "Breaking change text 200",
    ]);
  });

  it("New idea", () => {
    expect(row("idea")).toEqual([
      "Problem* text 200",
      "Who has it* line 80",
      "Why now text 200",
      "More detail text 400",
      "Seats needed line 80",
      "Evidence url 200",
    ]);
  });

  it("Help wanted", () => {
    expect(row("seat")).toEqual([
      "Role* line 60",
      "What you'd do* text 200",
      "Time line 40",
      "In return line 80",
      "Skills line 80",
    ]);
  });

  it("Demo — two optional blocks, and nothing required", () => {
    expect(row("demo")).toEqual(["Title line 80", "Note text 200"]);
  });

  it("every block id is unique in its kind, lower-case, and of a known type", () => {
    for (const kind of PRODUCT_POST_KINDS) {
      const ids = POST_BLOCK_CATALOGUE[kind].map((b) => b.id);
      expect([kind, new Set(ids).size]).toEqual([kind, ids.length]);
      for (const spec of POST_BLOCK_CATALOGUE[kind]) {
        expect(spec.id).toMatch(/^[a-z][a-z-]*$/);
        expect(POST_BLOCK_TYPES).toContain(spec.type);
        expect(spec.limit).toBeGreaterThan(0);
        expect(spec.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("required blocks come first in every kind, so the builder's order is the card's", () => {
    for (const kind of PRODUCT_POST_KINDS) {
      const flags = POST_BLOCK_CATALOGUE[kind].map((b) => b.required);
      expect([kind, flags]).toEqual([kind, [...flags].sort((a, b) => Number(b) - Number(a))]);
    }
  });

  it("a milestone is stored under the Feature shipped post's limits, so a prefilled post always fits", () => {
    expect(MILESTONE_TITLE_MAX).toBe(postBlockSpec("feature", "feature")!.limit);
    expect(MILESTONE_SUMMARY_MAX).toBe(postBlockSpec("feature", "what")!.limit);
    expect(MILESTONE_CODE_MAX).toBe(postBlockSpec("feature", "milestone")!.limit);
  });
});

const feature: ProductPostBlock[] = [
  { block: "feature", value: "Dark mode" },
  { block: "what", value: "The whole app follows the system theme." },
  { block: "try", value: "https://example.com/app" },
];

describe("validatePostBlocks", () => {
  it("passes a post with its required blocks, in order, inside their limits", () => {
    expect(validatePostBlocks("feature", feature)).toEqual([]);
    expect(postBlocksPublishable("feature", feature)).toBe(true);
    expect(validatePostBlocks("feature", [...feature, { block: "milestone", value: "AS3" }])).toEqual([]);
  });

  it("names a block the kind does not have", () => {
    const errors = validatePostBlocks("feature", [...feature, { block: "poll", value: "x" }]);
    expect(errors.map((e) => `${e.block}:${e.code}`)).toEqual(["poll:unknown_block"]);
  });

  it("refuses a block from another kind — the catalogue is per kind", () => {
    const errors = validatePostBlocks("seat", [{ block: "feature", value: "x" }], { mode: "draft" });
    expect(errors.map((e) => e.code)).toEqual(["unknown_block"]);
  });

  it("refuses blocks out of catalogue order — a maker never reorders", () => {
    const errors = validatePostBlocks("feature", [feature[1]!, feature[0]!, feature[2]!]);
    expect(errors.map((e) => `${e.block}:${e.code}`)).toEqual(["feature:out_of_order"]);
  });

  it("refuses a block twice", () => {
    const errors = validatePostBlocks("feature", [...feature, { block: "try", value: "https://example.com/2" }]);
    expect(errors.map((e) => `${e.block}:${e.code}`)).toEqual(["try:duplicate"]);
  });

  it("refuses a value over its limit, and says the limit", () => {
    const errors = validatePostBlocks("feature", [{ block: "feature", value: "x".repeat(61) }, feature[1]!, feature[2]!]);
    expect(errors).toEqual([{ block: "feature", code: "over_limit", message: "Feature is at most 60 characters" }]);
    expect(validatePostBlocks("feature", [{ block: "feature", value: "x".repeat(60) }, feature[1]!, feature[2]!])).toEqual([]);
  });

  it("refuses a missing or empty required block — for publish", () => {
    expect(validatePostBlocks("feature", feature.slice(0, 2)).map((e) => `${e.block}:${e.code}`)).toEqual(["try:required"]);
    expect(
      validatePostBlocks("feature", [feature[0]!, { block: "what", value: "" }, feature[2]!]).map((e) => `${e.block}:${e.code}`),
    ).toEqual(["what:required"]);
    expect(validatePostBlocks("idea", []).map((e) => e.block)).toEqual(["problem", "who"]);
  });

  it("lets a draft leave required blocks empty or out, and holds it to every other rule", () => {
    expect(validatePostBlocks("feature", [], { mode: "draft" })).toEqual([]);
    expect(validatePostBlocks("feature", [{ block: "feature", value: "" }], { mode: "draft" })).toEqual([]);
    expect(
      validatePostBlocks("feature", [{ block: "what", value: "x".repeat(201) }], { mode: "draft" }).map((e) => e.code),
    ).toEqual(["over_limit"]);
    expect(validatePostBlocks("feature", [{ block: "nope", value: "" }], { mode: "draft" }).map((e) => e.code)).toEqual([
      "unknown_block",
    ]);
  });

  it("holds a line to one line and a url to http(s)", () => {
    expect(
      validatePostBlocks("feature", [{ block: "feature", value: "two\nlines" }], { mode: "draft" }).map((e) => e.code),
    ).toEqual(["invalid_value"]);
    for (const bad of ["javascript:alert(1)", "example.com", "ftp://example.com/x", "https://exa mple.com"]) {
      expect([bad, validatePostBlocks("feature", [{ block: "try", value: bad }], { mode: "draft" }).map((e) => e.code)]).toEqual([
        bad,
        ["invalid_value"],
      ]);
    }
    expect(validatePostBlocks("feature", [{ block: "try", value: "http://localhost:3000/" }], { mode: "draft" })).toEqual([]);
  });

  it("lets a text and a list hold line breaks", () => {
    expect(
      validatePostBlocks("version", [
        { block: "version", value: "1.2.0" },
        { block: "added", value: "Search\nKeyboard shortcuts" },
        { block: "breaking", value: "The config moved.\nRun the migration." },
      ]),
    ).toEqual([]);
  });

  it("an optional block left empty never stops a post", () => {
    expect(validatePostBlocks("feature", [...feature, { block: "for", value: "" }])).toEqual([]);
  });

  it("a demo post has nothing required", () => {
    expect(validatePostBlocks("demo", [])).toEqual([]);
  });
});

describe("the helpers around a post's blocks", () => {
  it("parsePostBlocks reads a list of {block, value} and nothing else", () => {
    expect(parsePostBlocks([{ block: "feature", value: "  Dark mode \r\n" }])).toEqual([{ block: "feature", value: "Dark mode" }]);
    expect(parsePostBlocks([{ block: "added", value: "a\r\nb" }])).toEqual([{ block: "added", value: "a\nb" }]);
    expect(parsePostBlocks([])).toEqual([]);
    for (const bad of [null, "x", {}, [{ block: 1, value: "x" }], [{ block: "x" }], [null], Array(40).fill({ block: "x", value: "" })]) {
      expect(parsePostBlocks(bad)).toBeNull();
    }
  });

  it("publishedPostBlocks drops empty optional blocks and normalises a url", () => {
    expect(
      publishedPostBlocks("feature", [...feature.slice(0, 2), { block: "try", value: "https://EXAMPLE.com" }, { block: "for", value: "" }]),
    ).toEqual([...feature.slice(0, 2), { block: "try", value: "https://example.com/" }]);
  });

  it("prefilledPostBlocks writes catalogue order, drops what is empty, and cuts to the limit", () => {
    const blocks = prefilledPostBlocks("seat", {
      time: "A few hours a week",
      role: `  ${"Maintainer ".repeat(10)}`,
      what: "Keep the\nlights on.",
      skills: null,
      return: "   ",
    });
    expect(blocks.map((b) => b.block)).toEqual(["role", "what", "time"]);
    expect(blocks[0]!.value.length).toBeLessThanOrEqual(60);
    expect(blocks[1]!.value).toBe("Keep the\nlights on.");
    expect(validatePostBlocks("seat", blocks)).toEqual([]);
  });

  it("prefilledPostBlocks folds a line's breaks and leaves out a url it cannot keep whole", () => {
    expect(prefilledPostBlocks("feature", { feature: "Dark\nmode", try: "not a url" })).toEqual([
      { block: "feature", value: "Dark mode" },
    ]);
    expect(prefilledPostBlocks("feature", { try: `https://example.com/${"a".repeat(300)}` })).toEqual([]);
  });

  it("reads a block's value and a list's lines", () => {
    expect(postBlockValue(feature, "try")).toBe("https://example.com/app");
    expect(postBlockValue(feature, "for")).toBeNull();
    expect(postBlockLines("Search\n\n  Shortcuts \r\n")).toEqual(["Search", "Shortcuts"]);
    expect(postUrl(" https://example.com/a ")).toBe("https://example.com/a");
    expect(postUrl("mailto:a@example.com")).toBeNull();
  });
});

describe("reactions", () => {
  it("are four, with the boards' labels", () => {
    expect([...PRODUCT_POST_REACTIONS]).toEqual(["useful", "would_use", "impressive", "curious"]);
    expect(PRODUCT_POST_REACTION_LABELS).toEqual({
      useful: "Useful",
      would_use: "I'd use this",
      impressive: "Impressive",
      curious: "Curious",
    });
    expect(isProductPostReaction("would_use")).toBe(true);
    expect(isProductPostReaction("like")).toBe(false);
  });

  it("the counts carry every reaction, zero included", () => {
    expect(emptyReactionCounts()).toEqual({ useful: 0, would_use: 0, impressive: 0, curious: 0 });
    expect(Object.keys(emptyReactionCounts()).sort()).toEqual([...PRODUCT_POST_REACTION_COUNT_KEYS]);
  });
});

describe("the wire", () => {
  it("pins a public post's and a milestone's key sets", () => {
    expect([...PUBLIC_PRODUCT_POST_KEYS]).toEqual([
      "author",
      "blocks",
      "commentCount",
      "id",
      "kind",
      "product",
      "publishedAt",
      "reactions",
      "threadId",
    ]);
    expect([...PUBLIC_MILESTONE_KEYS]).toEqual(["code", "shippedAt", "summary", "title"]);
  });

  it("counts shipped milestones of the total", () => {
    expect(milestoneCountsOf([{ shippedAt: "2026-11-01T00:00:00.000Z" }, { shippedAt: null }, { shippedAt: null }])).toEqual({
      shipped: 1,
      total: 3,
    });
    expect(milestoneCountsOf([])).toEqual({ shipped: 0, total: 0 });
  });

  it("a stage is idea, building, stage or production (SC-2); shipping is retired", () => {
    expect(isProductStage("idea")).toBe(true);
    expect(isProductStage("building")).toBe(true);
    expect(isProductStage("stage")).toBe(true);
    expect(isProductStage("production")).toBe(true);
    expect(isProductStage("shipping")).toBe(false);
    expect(isProductStage("shipped")).toBe(false);
  });

  it("a cursor round-trips, and one this API did not issue is refused", () => {
    const cursor = { publishedAt: "2026-11-14T10:00:00.000Z", id: "0d5e1f2a-1111-4222-8333-444455556666" };
    expect(decodeProductPostCursor(encodeProductPostCursor(cursor))).toEqual(cursor);
    for (const bad of [null, "", "not a cursor", "e30", encodeProductPostCursor({ publishedAt: "never", id: cursor.id }), encodeProductPostCursor({ publishedAt: cursor.publishedAt, id: "x" })]) {
      expect(decodeProductPostCursor(bad)).toBeNull();
    }
  });

  it("bounds the page size", () => {
    expect(productPostsPageSize(null)).toBe(PRODUCT_POSTS_PAGE_DEFAULT);
    expect(productPostsPageSize("0")).toBe(PRODUCT_POSTS_PAGE_DEFAULT);
    expect(productPostsPageSize("5")).toBe(5);
    expect(productPostsPageSize("5000")).toBe(PRODUCT_POSTS_PAGE_MAX);
  });

  it("builds the addresses", () => {
    const id = "ppo_0d5e1f2a111142228333444455556666";
    expect(PRODUCT_POST_ID_RE.test(id)).toBe(true);
    expect(PRODUCT_POST_API.feed()).toBe("/v1/public/openproduct/product-posts");
    expect(PRODUCT_POST_API.feed("abc")).toBe("/v1/public/openproduct/product-posts?cursor=abc");
    expect(PRODUCT_POST_API.post(id)).toBe(`/v1/public/openproduct/product-posts/${id}`);
    expect(PRODUCT_POST_API.ofProduct("acme")).toBe("/v1/public/openproduct/projects/acme/product-posts");
    expect(PRODUCT_POST_API.reaction(id)).toBe(`/v1/openproduct/me/product-post-reactions/${id}`);
    expect(PRODUCT_POST_API.following()).toBe("/v1/openproduct/me/following");
    expect(PRODUCT_POST_API.crewPosts("org_1", "opp_1")).toBe("/v1/organizations/org_1/openproduct/profiles/opp_1/product-posts");
    expect(PRODUCT_POST_API.crewPublish("org_1", "opp_1", id)).toBe(
      `/v1/organizations/org_1/openproduct/profiles/opp_1/product-posts/${id}/publish`,
    );
    expect(PRODUCT_POST_API.crewMilestoneShipped("org_1", "opp_1", "pms_1")).toBe(
      "/v1/organizations/org_1/openproduct/profiles/opp_1/milestones/pms_1/shipped",
    );
    expect(PRODUCT_POST_API.crewNeedsYou("org_1", "opp_1")).toBe("/v1/organizations/org_1/openproduct/profiles/opp_1/needs-you");
    expect(productPostPagePath("acme", id)).toBe(`/acme/posts/${id}`);
    expect(composePostPagePath("acme")).toBe("/acme/new");
    expect(composePostPagePath("acme", "seat")).toBe("/acme/new?kind=seat");
  });
});

describe("a post's comments are a thread nobody picks", () => {
  it("the tag exists, has a label, and is not one a person may choose", () => {
    expect(ALL_THREAD_TAGS).toContain(PRODUCT_POST_THREAD_TAG);
    expect(THREAD_TAGS as readonly string[]).not.toContain(PRODUCT_POST_THREAD_TAG);
    expect(THREAD_TAG_LABELS[PRODUCT_POST_THREAD_TAG]).toBe("Comments");
  });

  it("the system writes its title, inside the column's bound", () => {
    expect(productPostThreadTitle("feature", "acme")).toBe("Feature shipped on acme");
    expect(productPostThreadTitle("seat", "a".repeat(200)).length).toBeLessThanOrEqual(160);
  });
});

describe("the overlay's new questions are bounded like the old ones", () => {
  it("carries the three new keys", () => {
    for (const key of ["crew", "reactions", "requestedOpenings"]) expect(ME_OVERLAY_KEYS).toContain(key);
    expect([...ME_OVERLAY_KEYS]).toEqual([...ME_OVERLAY_KEYS].sort());
  });

  it("parses product post ids and seat ids, drops what is not one, and caps the list", () => {
    const post = "ppo_0d5e1f2a111142228333444455556666";
    const seat = "opr_0d5e1f2a111142228333444455556666";
    expect(parseOverlayProductPostIds(`${post},nope,${post}, ${seat}`)).toEqual([post]);
    expect(parseOverlayOpeningIds(`${seat},${post},x`)).toEqual([seat]);
    expect(parseOverlayProductPostIds(null)).toEqual([]);
    const many = Array.from({ length: 300 }, (_, i) => `ppo_${String(i).padStart(32, "0")}`).join(",");
    expect(parseOverlayProductPostIds(many)).toHaveLength(ME_OVERLAY_MAX_IDS);
  });
});

describe("the templates are a module of their own, so a page's shell does not carry them", () => {
  // A bundler keeps or drops a module whole. The ids, kinds, reactions and
  // addresses are read by every page; the catalogue and the validator by the
  // post builder and a card's body. While they shared a file, every page
  // downloaded the templates.
  it("the catalogue and the validator are in product-post-blocks, and the barrel exports both files", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf-8");
    const light = read("./product-posts.ts");
    const blocks = read("./product-post-blocks.ts");
    for (const name of ["POST_BLOCK_CATALOGUE", "validatePostBlocks", "parsePostBlocks", "publishedPostBlocks", "prefilledPostBlocks"]) {
      expect([name, new RegExp(`export (const|function) ${name}\\b`).test(blocks)]).toEqual([name, true]);
      expect([name, new RegExp(`export (const|function) ${name}\\b`).test(light)]).toEqual([name, false]);
    }
    // The light file takes TYPES from the templates and nothing that runs.
    expect(light).toContain('import type { ProductPostBlock } from "./product-post-blocks.js";');
    expect(light).not.toMatch(/^import \{[^}]*\} from "\.\/product-post-blocks\.js";$/m);
    const barrel = read("./index.ts");
    expect(barrel).toContain('export * from "./product-posts.js";');
    expect(barrel).toContain('export * from "./product-post-blocks.js";');
    // And the package says its modules have no side effects, which is what
    // lets a bundler leave an unused one out.
    expect(JSON.parse(read("../package.json")).sideEffects).toBe(false);
  });

  it("one number for a tagline's length and one for a seat's role, for core and the page alike", async () => {
    const contracts = await import("./index.js");
    expect(contracts.PRODUCT_TAGLINE_MAX).toBe(200);
    expect(contracts.ROLE_OPENING_TITLE_MAX).toBe(120);
  });
});
