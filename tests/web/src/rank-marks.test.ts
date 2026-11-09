// Rank marks on the listing page and the share card (openproduct-worldclass-v2 PP4).
//
// The rule lives in the contract (`marks.ts`, tested there). What is pinned
// here is what the web layer owns: the page renders marks only through
// `rankMarks` and never a hand-written badge; each pill links the board it
// came from; the share card carries only `cardMark`'s dated form.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { productCopy } from "@openproduct-web/app/ui/og";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the page", () => {
  it("renders marks from the contract, never a literal badge", () => {
    const page = code("[slug]/page.tsx");
    expect(page).toContain("const marks = rankMarks(profile.launch, dayOf(now));");
    expect(page).toMatch(/\{marks\.map\(\(mark\) => \(/);
    expect(page).toContain("href={mark.href}");
    expect(page).toContain("title={mark.title}");
    expect(page).toContain("formulaHref(mark.formula)");
    // The old hand-written pill is gone; a badge the contract did not derive
    // is a badge somebody conferred.
    expect(page).not.toMatch(/>\s*#1 today\s*</);
    expect(page).not.toMatch(/firstToday/);
  });

  it("hands the share card's alt the same dated mark the card draws", () => {
    const page = code("[slug]/page.tsx");
    expect(page).toContain("productCopy(profile.slug, profile.tagline, cardMark(profile.launch))");
  });
});

describe("the share card", () => {
  it("carries the mark as a string or nothing, and draws it only when present", () => {
    expect(productCopy("my-product", "A tiny CLI").mark).toBeNull();
    const marked = productCopy("my-product", "A tiny CLI", "#1 on 9 Sept");
    expect(marked.mark).toBe("#1 on 9 Sept");
    expect(marked.alt).toBe("my-product — A tiny CLI · #1 on 9 Sept");
    const card = code("og/card.tsx");
    expect(card).toMatch(/\{copy\.mark \? \(/);
    const route = code("og/product/[slug]/route.tsx");
    expect(route).toContain("cardMark(profile.launch)");
  });
});
