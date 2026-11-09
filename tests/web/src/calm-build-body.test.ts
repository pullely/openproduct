// The build page body (openproduct-calm-pages CP2).
//
// What is pinned: the reading column's sections take the tile's radius and
// room and head at 20px (CP-R4); a section with nothing in it takes no panel
// and is named once on the page's *Not yet* line, keeping its anchor (CP-R3);
// the maker's own words run at a reading measure (CP-R5); and the build's
// forum page takes the same section shape.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("sections a reader can find (CP-R4)", () => {
  it("the section card has the tile's radius and room", () => {
    expect(code("[slug]/sections.ts")).toContain(
      '"rounded-[20px] border border-border bg-card px-8 py-7 scroll-mt-[72px] max-sm:px-5 max-sm:py-5 sm:scroll-mt-[116px]"',
    );
  });

  it("every section heads at 20px", () => {
    expect(code("ui/design.ts")).toMatch(/export const H2_SECTION = "m-0 text-\[20px\] font-semibold/);
    for (const file of ["[slug]/page.tsx", "[slug]/changes.tsx", "[slug]/forum/page.tsx"]) {
      const source = code(file);
      expect([file, source.includes("H2_SECTION")]).toEqual([file, true]);
      expect([file, /className=\{`?\$?\{?H2\}/.test(source)]).toEqual([file, false]);
    }
  });
});

describe("a section earns its panel (CP-R3)", () => {
  const page = code("[slug]/page.tsx");

  it("components and makers render a panel only when there is something in it", () => {
    expect(page).toMatch(/\{components\.length > 0 \? \(\s*<section className=\{SECTION_CARD\} id="components"/);
    expect(page).toMatch(/\{profile\.maintainers\.length > 0 \? \(\s*<section\s+className=\{SECTION_CARD\}\s+id="makers"/);
    expect(page).not.toContain("No components published.");
    expect(page).not.toContain("No makers listed yet.");
  });

  it("nothing changed folds too; no earlier snapshot is still absent", () => {
    expect(code("[slug]/changes.tsx")).toContain("if (changes === null || changes.length === 0) return null;");
    expect(page).toMatch(/profile\.changes !== null && profile\.changes\.length === 0\s*\?\s*\[\{ id: "changed"/);
  });

  it("the empty ones are named once, each keeping its anchor", () => {
    expect(page).toContain("data-not-yet");
    expect(page).toContain("Not yet on {profile.slug}:");
    expect(page).toMatch(/<span key=\{item\.id\} id=\{item\.id\}/);
    for (const id of ["changed", "components", "makers"]) {
      expect(page).toContain(`{ id: "${id}", label:`);
    }
  });
});

describe("the maker's words have a measure (CP-R5)", () => {
  it("the About pitch is 16.5px/1.7 in at most 68ch", () => {
    expect(code("ui/design.ts")).toContain(
      'export const PROSE = "max-w-[68ch] text-[16.5px] leading-[1.7] text-copy max-sm:text-[15.5px]";',
    );
    expect(code("[slug]/page.tsx")).toContain("className={`m-0 mt-4 whitespace-pre-wrap ${PROSE}`}");
  });
});

describe("the build's forum page", () => {
  const forum = code("[slug]/forum/page.tsx");

  it("draws its comments in the section card", () => {
    expect(forum).toContain('<section aria-labelledby="forum-comments" className={SECTION_CARD}>');
  });

  it("says no threads once, rather than in a panel", () => {
    expect(forum).toContain("No threads about {profile.slug} yet.");
    expect(forum).not.toMatch(/border-t border-line px-5 py-6[^"]*">\s*No threads yet\./);
  });
});
