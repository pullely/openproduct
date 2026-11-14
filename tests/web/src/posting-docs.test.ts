// `/docs/posting` (openproduct-redesign OPR-3; board `Templates`).
//
// THE PAGE IS GENERATED FROM THE CATALOGUE. What is pinned here is that the
// page says, for every kind, exactly the blocks `POST_BLOCK_CATALOGUE` holds —
// their names, their order, which are required, how long each may be — and
// that it gets them by reading the catalogue, so it cannot drift from what the
// builder draws and core validates.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHORED_PRODUCT_POST_KINDS,
  POSTING_DOCS_PATH,
  POST_BLOCK_CATALOGUE,
  POST_BLOCK_TYPES,
  PRODUCT_POST_KINDS,
  PRODUCT_POST_KIND_LABELS,
} from "@openproduct/contracts";
import {
  BLOCK_TYPE_RULE,
  KIND_WHEN,
  blockRequirement,
  blockRule,
  kindIsAuthored,
  kindWho,
  postingTemplate,
  postingTemplates,
  postingTitle,
} from "@openproduct-web/app/docs/posting/posting";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the templates are the catalogue's", () => {
  it("lists every kind there is, in the contract's order, under the contract's names", () => {
    const templates = postingTemplates();
    expect(templates.map((template) => template.kind)).toEqual([...PRODUCT_POST_KINDS]);
    expect(templates.map((template) => template.label)).toEqual(PRODUCT_POST_KINDS.map((kind) => PRODUCT_POST_KIND_LABELS[kind]));
  });

  it.each([...PRODUCT_POST_KINDS])("%s: every block, in the catalogue's order, with its own requirement and limit", (kind) => {
    const template = postingTemplate(kind);
    const specs = POST_BLOCK_CATALOGUE[kind];
    expect(template.fields.map((field) => field.id)).toEqual(specs.map((spec) => spec.id));
    template.fields.forEach((field, index) => {
      const spec = specs[index]!;
      expect(field.name).toBe(spec.label);
      expect(field.required).toBe(spec.required);
      expect(field.requirement).toBe(spec.required ? "Required" : "Optional");
      // The limit printed is the limit enforced.
      expect(field.rule).toBe(`${BLOCK_TYPE_RULE[spec.type]}, up to ${spec.limit} characters`);
      expect(field.rule).toContain(String(spec.limit));
    });
  });

  it("a rule is built from the spec, so a changed limit changes the page", () => {
    expect(blockRule({ type: "line", limit: 60 })).toBe("one line, up to 60 characters");
    expect(blockRule({ type: "lines", limit: 300 })).toBe("a list, one entry per line, up to 300 characters");
    expect(blockRule({ type: "url", limit: 200 })).toBe("one http(s) address, up to 200 characters");
    expect(blockRule({ type: "text", limit: 1234 })).toBe("a short paragraph, up to 1,234 characters");
    expect(blockRequirement({ required: true })).toBe("Required");
    expect(blockRequirement({ required: false })).toBe("Optional");
    // Every type the contract has is described, and nothing else is.
    expect(Object.keys(BLOCK_TYPE_RULE).sort()).toEqual([...POST_BLOCK_TYPES].sort());
    expect(Object.keys(KIND_WHEN).sort()).toEqual([...PRODUCT_POST_KINDS].sort());
  });

  it("says which kinds are written and which are recorded, from the contract's own list", () => {
    for (const kind of PRODUCT_POST_KINDS) {
      expect(kindIsAuthored(kind)).toBe((AUTHORED_PRODUCT_POST_KINDS as readonly string[]).includes(kind));
    }
    expect(kindWho("feature")).toBe("Posted by the crew");
    expect(kindWho("demo")).toBe("Recorded, not written");
  });

  it("the title counts the kinds rather than writing the number down", () => {
    expect(postingTitle()).toBe("Five kinds of post, and nothing else");
    expect(PRODUCT_POST_KINDS).toHaveLength(5);
    expect(postingTitle(4)).toBe("Four kinds of post, and nothing else");
    expect(postingTitle(1)).toBe("One kind of post, and nothing else");
  });
});

describe("the page draws what the module read, and writes no block by hand", () => {
  const page = code("docs/posting/page.tsx");
  const moduleSource = code("docs/posting/posting.ts");

  it("renders the templates from `postingTemplates()`", () => {
    expect(page).toContain("const templates = postingTemplates();");
    expect(page).toContain("{templates.map((template) => (");
    expect(page).toContain("{template.fields.map((field) => (");
    expect(page).toContain("<h1 className={PAGE_TITLE}>{postingTitle(templates.length)}</h1>");
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(moduleSource).toContain("fields: POST_BLOCK_CATALOGUE[kind].map((spec) => ({");
    expect(moduleSource).toContain("return PRODUCT_POST_KINDS.map(postingTemplate);");
  });

  it("names no block and no limit of its own", () => {
    // Every block label and every limit on the page comes through the
    // catalogue: neither file spells one.
    const labels = new Set(Object.values(POST_BLOCK_CATALOGUE).flatMap((specs) => specs.map((spec) => spec.label)));
    for (const label of labels) {
      // A kind's name may share a word with a block ("Demo", "Feature"…), so
      // the check is for the label as a quoted or JSX-text field name.
      expect([label, new RegExp(`name: "${label}"|>${label}<`).test(page + moduleSource)]).toEqual([label, false]);
    }
    expect(page + moduleSource).not.toMatch(/up to \d+ characters|\blimit: \d+/);
    expect(page).not.toContain("POST_BLOCK_CATALOGUE");
  });

  it("is static, the same for every reader, canonical to its own address, and linked where the docs are", () => {
    expect(page).toMatch(/^export const revalidate = 60;$/m);
    expect(page).not.toMatch(/searchParams|cookies\(|headers\(|readSession|force-dynamic|"use client"/);
    expect(POSTING_DOCS_PATH).toBe("/docs/posting");
    expect(page).toContain("alternates: { canonical: `${origin}${POSTING_DOCS_PATH}` }");
    // A tab of the docs, on every docs page, and an entry in the sitemap.
    expect(code("docs/docs-nav.tsx")).toContain('{ id: "posting", label: "Posting", href: "/docs/posting" },');
    expect(page).toContain('<DocsTabs current="posting" />');
    expect(read("sitemap.xml/route.ts")).toContain('{ path: "docs/posting", lastmod: null }');
  });
});
