// `/pricing` and `/pricing/{value}` (openproduct-worldclass-v2 PP3).
//
// The filter is an address, and the address is a path: the front page is one
// cached document that reads no `searchParams`, and the product's other facet
// filters are paths. What is pinned here is what the web layer owns — the two
// pages are built the way the stack pages are, the listing's chip links to
// the filter and says whose word the value is, and the studio offers the
// vocabulary as a select.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PRICING_PROVENANCE_NOTE, pricingPath } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const INDEX = "pricing/page.tsx";
const VALUE = "pricing/[value]/page.tsx";

describe("the two pages are addresses, not queries", () => {
  it("neither reads searchParams, cookies or a session (WC-4, I6)", () => {
    for (const file of [INDEX, VALUE]) {
      expect([file, /searchParams|cookies\(|headers\(|decodeSession/.test(code(file))]).toEqual([
        file,
        false,
      ]);
    }
    // And the front page did not grow a query-string filter instead.
    expect(code("page.tsx")).not.toMatch(/searchParams/);
  });

  it("both declare `revalidate` AND `generateStaticParams`", () => {
    for (const file of [INDEX, VALUE]) {
      expect([file, /export const revalidate = \d+/.test(read(file))]).toEqual([file, true]);
      expect([file, read(file).includes("generateStaticParams")]).toEqual([file, true]);
    }
  });

  it("the value page gates on the vocabulary, filters with the contract, and links the order's sentence", () => {
    const src = code(VALUE);
    expect(src).toContain("pricingLabel(value)");
    expect(src).toContain("if (label === null) notFound();");
    expect(src).toContain("cardsWithPricing(cards, value)");
    expect(src).toContain(".sort(byMostActive)");
  });

  it("the index tallies with the contract and links each value's page", () => {
    const src = code(INDEX);
    expect(src).toContain("pricingTally(cards)");
    expect(src).toContain("pricingPath(entry.value)");
    expect(pricingPath("free")).toBe("/pricing/free");
  });
});

describe("the chip on a listing", () => {
  it("renders only when answered, links to the filter, and says whose word it is on hover", () => {
    const page = code("[slug]/page.tsx");
    expect(page).toMatch(/\{profile\.pricing \? \(\s*<Fact\s+label="Pricing"/);
    expect(page).toContain("href={pricingPath(profile.pricing)}");
    expect(page).toContain("title={PRICING_PROVENANCE_NOTE}");
    expect(PRICING_PROVENANCE_NOTE).toMatch(/Not a price this directory charges or checks/);
  });
});

describe("the studio", () => {
  it("offers pricing as the third select, from the same vocabulary, and the action carries it", () => {
    const form = code("studio/[org]/[profile]/topics/page.tsx");
    expect(form).toContain('["pricing", "Pricing"]');
    expect(form).toContain("defaultValue={profile[facetId] ?? \"\"}");
    const route = code("studio/[org]/[profile]/actions/route.ts");
    expect(route).toContain('pricing: textOrNull(form?.get("pricing"))');
  });
});
