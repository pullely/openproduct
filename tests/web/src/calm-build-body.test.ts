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
  it("the section card is the flat card with the board's room (OPR1)", () => {
    // openproduct-redesign: white at a 16px radius, no border, no shadow,
    // `20px 22px` inside and 14px on a phone — one string, in `ui/design.ts`,
    // and the page's sections add only the room an anchored heading needs
    // under the site's header.
    expect(code("ui/design.ts")).toContain(
      'export const BOARD_CARD = "rounded-[16px] bg-card px-[22px] py-5 max-sm:p-[14px]";',
    );
    expect(code("[slug]/sections.ts")).toContain("export const SECTION_CARD = `${BOARD_CARD} scroll-mt-[80px]`;");
    expect(code("[slug]/sections.ts")).not.toMatch(/\bborder\b|shadow/);
  });

  it("every section heads at the card title's 18px (OPR1)", () => {
    expect(code("ui/design.ts")).toContain(
      'export const BOARD_CARD_TITLE = "m-0 text-card-title font-semibold tracking-[-0.015em] text-foreground";',
    );
    for (const file of ["[slug]/page.tsx", "[slug]/changes.tsx", "[slug]/forum/page.tsx"]) {
      const source = code(file);
      expect([file, source.includes("BOARD_CARD_TITLE")]).toEqual([file, true]);
      // Neither of the old headings: the 20px one, or the card head's 16px.
      expect([file, source.includes("H2_SECTION")]).toEqual([file, false]);
      expect([file, /className=\{`?\$?\{?H2\}/.test(source)]).toEqual([file, false]);
    }
  });
});

describe("a section earns its panel (CP-R3)", () => {
  const page = code("[slug]/page.tsx");

  it("Built with and Crew render a card only when there is something in it", () => {
    // OPR1 — the components are Built with pills and the makers are the Crew
    // card, both in the side column; each still earns its card.
    expect(page).toMatch(/\{builtWith\.length > 0 \? \(\s*<section className=\{SIDE_CARD\} id="components"/);
    expect(page).toMatch(
      /\{profile\.maintainers\.length > 0 \|\| openRoles\.length > 0 \? \(\s*<section\s+id="crew"/,
    );
    // The old `#makers` address still lands on the people.
    expect(page).toMatch(/\{profile\.maintainers\.length > 0 \? \(\s*<ul id="makers"/);
    expect(page).not.toContain("No components published.");
    expect(page).not.toContain("No makers listed yet.");
    expect(page).not.toContain("Stack not stated.");
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
  it("the About pitch is the board's 15px body in at most 68ch (OPR1)", () => {
    // The shared `PROSE` (16.5px) still serves the pages with no board; a
    // product's pitch sits in a card at the redesign's body size.
    expect(code("[slug]/sections.ts")).toContain(
      'export const SECTION_PROSE = "max-w-[68ch] text-[15px] leading-[1.6] text-copy";',
    );
    expect(code("[slug]/page.tsx")).toContain("className={`m-0 mt-3 whitespace-pre-wrap ${SECTION_PROSE}`}");
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
