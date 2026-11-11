// The listing page's outline (openproduct-worldclass-v2 PP2).
//
// The audit's W·10: *"Product page: no follow, no follower count, no sub-nav
// …"*. The design's answer is anchors, not routes — one cacheable document
// with an outline — and what is pinned here is that the outline is ONE list:
// the nav renders it, the keyboard layer walks it, and every anchor it emits
// lands on a section the page actually renders.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DIFF_HEADING } from "@openproduct/contracts";

import {
  SECTION_ATTRIBUTE,
  SECTION_NAV_LABEL,
  listingSections,
} from "@openproduct-web/app/[slug]/sections";
import { BINDINGS, KEYS_SHEET_NOTE, walksSections } from "@openproduct-web/app/ui/keys";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the outline is the page's own headings, in the page's own order", () => {
  it("lists six sections at most — the optional ones only when the page renders them", () => {
    expect(listingSections({ changes: true, launches: true, makers: true }).map((s) => s.id)).toEqual([
      "about",
      "changed",
      "launches",
      "makers",
      "discussion",
      "alternatives",
    ]);
    expect(listingSections({ changes: false, launches: false, makers: true }).map((s) => s.id)).toEqual([
      "about",
      "makers",
      "discussion",
      "alternatives",
    ]);
    // openproduct-calm-pages CP2 (CP-R3) — with nobody listed, Makers folds
    // into the page's *Not yet* line and leaves the outline.
    expect(listingSections({ changes: false, launches: false, makers: false }).map((s) => s.id)).toEqual([
      "about",
      "discussion",
      "alternatives",
    ]);
    // PP5 — a listing that has launched but has no baseline yet.
    expect(listingSections({ changes: false, launches: true, makers: true }).map((s) => s.id)).toEqual([
      "about",
      "launches",
      "makers",
      "discussion",
      "alternatives",
    ]);
  });

  it("labels the Changes entry with the contract's own heading, so the nav and the section say one word", () => {
    const changed = listingSections({ changes: true, launches: false, makers: true }).find((s) => s.id === "changed");
    expect(changed?.label).toBe(DIFF_HEADING);
  });

  it("every anchor resolves: each id is a section element the page renders, wearing the traversal attribute", () => {
    // `changed` lives in changes.tsx; the rest in page.tsx. A section that
    // is in the outline and not on the page is a broken anchor; a section
    // that is on the page with the attribute and not in the outline is a
    // place `j` visits that the nav does not name.
    const page = markupOf("[slug]/page.tsx");
    const changes = markupOf("[slug]/changes.tsx");
    for (const { id } of listingSections({ changes: true, launches: true, makers: true })) {
      const source = id === "changed" ? changes : page;
      const open = new RegExp(`<section[^>]*\\bid="${id}"[^>]*>`, "s");
      expect(source).toMatch(open);
      // The attribute is spread as `[SECTION_ATTRIBUTE]: true`; the element
      // and its `aria-labelledby` sit in one opening tag.
      const tag = source.match(open)![0];
      expect(tag).toMatch(/\[SECTION_ATTRIBUTE\]: true/);
      expect(tag).toMatch(new RegExp(`aria-labelledby="${id}-heading"`));
      // The heading takes focus without joining the Tab order.
      expect(source).toMatch(new RegExp(`id="${id}-heading"[^>]*tabIndex=\\{-1\\}`, "s"));
    }
    const spreads = page.match(/\[SECTION_ATTRIBUTE\]: true/g) ?? [];
    expect(spreads.length + (changes.match(/\[SECTION_ATTRIBUTE\]: true/g) ?? []).length).toBe(
      listingSections({ changes: true, launches: true, makers: true }).length,
    );
  });

  it("renders the nav from the outline, as a labelled landmark of plain anchors, not a <select>", () => {
    const page = markupOf("[slug]/page.tsx");
    expect(page).toMatch(/<nav\s+aria-label=\{SECTION_NAV_LABEL\}/);
    expect(page).toMatch(/sections\.map\(\(section\) =>/);
    expect(page).toMatch(/href=\{`#\$\{section\.id\}`\}/);
    // CP-R3 — *What changed* and *Makers* are in the outline only when their
    // panel has something in it.
    expect(page).toMatch(
      /listingSections\(\{\s*changes: profile\.changes !== null && profile\.changes\.length > 0,\s*launches: profile\.launches\.length > 0,\s*makers: profile\.maintainers\.length > 0,\s*\}\)/,
    );
    // A select that navigates on change is a change of context on input
    // (WCAG 3.2.2); the outline is links.
    expect(page).not.toMatch(/<select/);
    expect(SECTION_NAV_LABEL).toBe("On this page");
    expect(SECTION_ATTRIBUTE).toBe("data-keysection");
  });
});

describe("j and k walk the outline on a one-row page", () => {
  it("walks sections only where there is at most one row and at least one section", () => {
    expect(walksSections(1, 5)).toBe(true);
    expect(walksSections(0, 4)).toBe(true);
    // A feed of one launch with no sections keeps row traversal.
    expect(walksSections(1, 0)).toBe(false);
    // Rows win where both exist, so a feed that grows headings keeps `j`.
    expect(walksSections(2, 5)).toBe(false);
  });

  it("the layer reads the same attribute the page writes, and the sheet says so", () => {
    const layer = markupOf("shell/keyboard-layer.tsx");
    expect(layer).toMatch(/SECTION_ATTRIBUTE/);
    expect(layer).toMatch(/walksSections\(/);
    expect(layer).toMatch(/querySelector<HTMLElement>\("h2, h3"\)/);
    const j = BINDINGS.find((b) => b.shows === "j");
    const k = BINDINGS.find((b) => b.shows === "k");
    expect(j?.does).toMatch(/section/);
    expect(k?.does).toMatch(/section/);
    expect(KEYS_SHEET_NOTE).toMatch(/on a listing, j and k walk its sections/);
  });
});
