// Stack pages (openproduct-worldclass VC1) — the web layer's half.
//
// The arithmetic is pinned in `packages/contracts/src/stacks.test.ts`. What is
// pinned here is the done-when, which is a statement about ADDRESSES:
//
//   - every filter state is a path, and no page reads `searchParams`
//   - no filter reads a session, so the document is the same for everybody
//   - the rail cannot offer a value whose page would be empty
//   - the count beside a value and the list behind it are one read

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  STACKS_PATH,
  STACK_RAIL_LIMIT,
  cardsWithStack,
  railStacks,
  stackPath,
  stackTally,
  type PublicProfileCard,
} from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const INDEX = "stack/page.tsx";
const VALUE = "stack/[value]/page.tsx";

describe("a filter state is an ADDRESS, never a preference (WC-4)", () => {
  it("both pages exist, at the path the contract names", () => {
    expect(STACKS_PATH).toBe("/stack");
    expect(read(INDEX).length).toBeGreaterThan(0);
    expect(read(VALUE).length).toBeGreaterThan(0);
  });

  it("neither page reads `searchParams`", () => {
    // THE DEFECT THIS AVOIDS IS RECORDED IN THE LEADERBOARD'S OWN HEADER: a
    // page that reads `searchParams` is dynamic in Next, so its `revalidate`
    // is accepted and IGNORED and the document goes out `no-store` to every
    // visitor. A filter kept in the query would have cost every filtered view
    // the edge cache the whole estate is built on (OPC-1).
    // `code()`, not `read()`: the header of `[value]/page.tsx` says out loud
    // that it reads no `searchParams`, and a guard that read the prose would
    // fail on the sentence promising the thing it is checking for.
    for (const file of [INDEX, VALUE]) {
      expect([file, /searchParams/.test(code(file))]).toEqual([file, false]);
    }
  });

  it("neither page reads a session, a cookie or a header", () => {
    // I6 — two readers on the same address get the same bytes. A filter that
    // remembered you would be a preference, and a preference is not an
    // address.
    for (const file of [INDEX, VALUE]) {
      expect([file, /cookies\(|headers\(|op_session|SESSION_COOKIE|decodeSession/.test(code(file))]).toEqual([
        file,
        false,
      ]);
    }
  });

  it("both declare `revalidate` AND `generateStaticParams`", () => {
    // XP4's pairing: without the second the first is accepted and ignored.
    for (const file of [INDEX, VALUE]) {
      expect([file, /export const revalidate = \d+/.test(read(file))]).toEqual([file, true]);
      expect([file, read(file).includes("generateStaticParams")]).toEqual([file, true]);
    }
  });

  it("the value page builds its own address from the contract, never by hand", () => {
    const src = code(VALUE);
    expect(src).toContain("stackPath(value)");
    expect(src).not.toMatch(/`\/stack\/\$\{/);
  });
});

describe("the vocabulary is the gate", () => {
  it("a value the vocabulary does not have is a 404", () => {
    // Not a page titled after whatever was typed into the path.
    const src = code(VALUE);
    expect(src).toContain("stackLabel(value)");
    expect(src).toMatch(/if \(label === null\) notFound\(\)/);
  });

  it("a value nothing uses is a PAGE, and says why that is ambiguous", () => {
    // The one place this differs from `/topics/{value}`, and deliberately: a
    // category's absence means nobody chose it, a stack value's absence means
    // nobody uses it OR nobody has said so.
    const src = code(VALUE);
    expect(src).toContain("products.length === 0");
  });

  it("the index 404s a directory it could not read, and renders an empty one", () => {
    // The OD5 finding, kept: an empty room and a locked door look nothing
    // alike to a visitor.
    const src = code(INDEX);
    expect(src).toContain("if (cards === null) notFound()");
    expect(src).toContain("tally.length === 0");
  });
});

describe("the rail cannot offer a value whose page would be empty", () => {
  const card = (slug: string, canonical: string[]): PublicProfileCard => ({
    slug,
    tagline: null,
    stack: canonical,
    stackCanonical: canonical,
    category: null,
    hosting: null,
    pricing: null,
    licence: null,
    roleOpeningCount: 0,
    openingCommitments: [],
    hasLiveUrl: false,
    indexable: true,
    publishedAt: "2026-08-01T00:00:00Z",
    metrics: [],
    thumbnail: null,
  });

  it("every rail row leads to a page with at least one product on it", () => {
    // DS1's rule and `/topics`' after it. Asserted over the WHOLE rail rather
    // than the first row, and through the same two functions the pages call.
    const catalogue = [
      card("a", ["rust", "typescript"]),
      card("b", ["typescript"]),
      card("c", ["go"]),
      card("d", []),
    ];
    const broken = railStacks(stackTally(catalogue))
      .filter((entry) => cardsWithStack(catalogue, entry.value).length === 0)
      .map((entry) => stackPath(entry.value));
    expect(broken).toEqual([]);
  });

  it("the rail is capped in the CONTRACT, and the front page no longer draws it", () => {
    // OL-2a: a `.slice()` in a component is a decision about what a reader is
    // shown, made somewhere no test of the ordering would look. The cap stays
    // the contract's; the front page's margin, which drew the rail, left with
    // render C (openproduct-calm CL2, CL-R5).
    expect(STACK_RAIL_LIMIT).toBe(5);
    expect(code("page.tsx")).not.toContain("railStacks(");
    expect(code("page.tsx")).not.toMatch(/fetchStack|fetchStacks/);
  });
});

describe("the addresses are discoverable", () => {
  it("the sitemap carries the index and every value with a page", () => {
    const src = code("sitemap.xml/route.ts");
    expect(src).toContain('{ path: "stack", lastmod: null }');
    expect(src).toContain("stackTally(projects)");
  });

  it("and derives them from the same array the pages filter", () => {
    // "Has a page" and "is in the sitemap" are one answer by construction,
    // rather than two lists that drift.
    expect(code("sitemap.xml/route.ts")).toMatch(/stackTally\(projects\)\.map/);
  });

  it("the footer links to the index, so the whole vocabulary is one click away", () => {
    // CL2 — the margin's *Built with* panel was the door; the footer is now,
    // on every page that draws the site footer.
    expect(code("shell/site-footer.tsx")).toContain("href={STACKS_PATH}");
  });
});

describe("RE1 — both pages are described to a machine", () => {
  it("the index is a CollectionPage of addresses, built by the shared helper", () => {
    const src = code(INDEX);
    expect(src).toContain("collectionPageJsonLd(");
    // DS4 — one implementation per published sentence. A hand-rolled literal
    // here would be a second one.
    expect(src).not.toContain('"@type": "CollectionPage"');
  });

  it("the value page carries a two-rung trail and its own collection", () => {
    const src = code(VALUE);
    expect(src).toContain("breadcrumbJsonLd(");
    expect(src).toContain("collectionPageJsonLd(");
  });
});

describe("OPC-4 — the order is published, and this page does not invent one", () => {
  it("sorts by the directory's own comparator and links its sentence", () => {
    const src = code(VALUE);
    expect(src).toContain("byMostActive");
    // No second sort anywhere on the page.
    expect(src.match(/\.sort\(/g)).toEqual([".sort("]);
  });
});

describe("the route census still holds", () => {
  it("every new page declares which KIND it is", () => {
    // XP4's rule: a route cannot be added while quietly skipping the cache
    // and I6 checks. Both of these are PUBLIC — `revalidate` plus
    // `generateStaticParams` — which the census enumerates from the
    // filesystem; this asserts the files it will find are the two expected.
    const found = readdirSync(resolve(APP_DIR, "stack"), { recursive: true } as never) as string[];
    const pages = found.filter((entry) => String(entry).endsWith("page.tsx")).sort();
    expect(pages).toEqual(["[value]/page.tsx", "page.tsx"]);
    for (const page of pages) {
      const file = resolve(APP_DIR, "stack", String(page));
      expect(statSync(file).isFile()).toBe(true);
    }
  });
});
