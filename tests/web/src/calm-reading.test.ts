// The reading pages (openproduct-calm-pages CP4).
//
// What is pinned: the docs read at a measure under 20px headings, the long
// overview beside a contents rail, its full list of formulas one click away;
// transparency leads with its figures as tile figures and keeps each
// section's reasons in one `<details>` while every commitment stays visible
// (CP-R5); and the digest's weeks are tiles (CP-R6).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the docs read at a measure (CP-R4, CP-R5)", () => {
  const shapes = code("docs/docs-nav.tsx");

  it("sections are 68ch, head at 20px and run at 16.5px/1.7", () => {
    expect(shapes).toContain('export const DOC_SECTIONS = "mt-12 grid max-w-[68ch] grid-cols-[minmax(0,1fr)] gap-14";');
    expect(shapes).toMatch(/export const DOC_H2 =\s*"[^"]*text-\[20px\] font-semibold/);
    expect(shapes).toContain('export const DOC_BODY = "m-0 mt-3 text-[16.5px] leading-[1.7]');
  });

  it("the overview has a sticky contents rail naming its own headings", () => {
    const overview = code("docs/page.tsx");
    expect(shapes).toContain('className="sticky top-6 mt-12 hidden self-start lg:block" data-docs-contents');
    expect(overview).toContain("<DocsContents sections={OVERVIEW_SECTIONS} />");
    for (const id of ["api", "agent", "provenance", "formulas", "facets", "floor", "launching", "digest", "limits", "qualifies"]) {
      expect([id, overview.includes(`<section id="${id}">`) && overview.includes(`{ id: "${id}", label:`)]).toEqual([id, true]);
    }
  });

  it("the overview's full list of formulas is one click away, still in the document", () => {
    const overview = code("docs/page.tsx");
    expect(overview).toContain('<details className="group mt-4" data-docs-formulas>');
    expect(overview).toContain("Every formula, one sentence each ({formulas.length})");
    expect(overview).toContain("{formula.sentence}");
  });
});

describe("transparency: figures first, reasons one click away (CP-R5)", () => {
  const page = code("transparency/page.tsx");

  it("the headline figures are the tile's: a faint label over a 30px number", () => {
    expect(page).toContain("data-transparency-figures");
    expect(page).toMatch(/<dt className="text-\[13px\] leading-\[1\.45\] text-faint">\{label\}<\/dt>/);
    expect(page).toContain("text-[30px] font-medium");
  });

  it("each section's reasons fold into one details; sections head at 20px", () => {
    expect(page).toMatch(/function Why\(/);
    expect(page).toContain('<details className="group mt-4 max-w-[68ch]">');
    expect(page.match(/summary: "/g)?.length).toBe(4);
    expect(page).toContain("H2_SECTION");
    expect(page).not.toMatch(/className=\{H2\}/);
  });

  it("every commitment stays on the page, unfolded", () => {
    // What the page will not publish, that no check can remove anything,
    // that a discounted upvote can be restored, and that nothing is broken
    // down by listing or person: said in the open, not behind a click.
    expect(page).toContain("<h2 className={H2_SECTION}>What this page will not do</h2>");
    expect(page).toContain("None of them can remove anything.");
    expect(page).toContain("A discounted upvote is still");
    expect(page).toContain("never\n        by listing or by person.");
    expect(page).toContain("{TRANSPARENCY_ZERO_NOTE}");
  });

  it("an empty section says none once", () => {
    expect(page).not.toContain("Nobody reported anything in this window.");
    expect(page).not.toContain("No checks raised anything in this window.");
  });
});

describe("the digest's weeks are tiles (CP-R6)", () => {
  it("draws each week in the tile's card, 14px apart", () => {
    const digest = code("digest/page.tsx");
    expect(digest).toContain('"block rounded-[20px] border border-border bg-card px-8 py-6');
    expect(digest).toContain('<ul className="m-0 mt-5 grid list-none gap-[14px] p-0" data-digest-weeks>');
  });
});
