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
  it("the section card is the bordered card with the board's room (LR1)", () => {
    // openproduct-left-rail LR1: a 16px radius, a 1px border (the card and
    // the page are the same colour), no shadow,
    // `20px 22px` inside and 14px on a phone — one string, in `ui/design.ts`,
    // and the page's sections add only the room an anchored heading needs
    // under the site's header.
    expect(code("ui/design.ts")).toContain(
      'export const BOARD_CARD = "rounded-[16px] border border-border bg-card px-[22px] py-5 max-sm:p-[14px]";',
    );
    expect(code("[slug]/sections.ts")).toContain("export const SECTION_CARD = `${BOARD_CARD} scroll-mt-[80px]`;");
    expect(code("[slug]/sections.ts")).not.toMatch(/\bborder\b|shadow/);
  });

  it("every section heads at the card title's 18px (OPR1)", () => {
    expect(code("ui/design.ts")).toContain(
      'export const BOARD_CARD_TITLE = "m-0 text-card-title font-semibold tracking-[-0.015em] text-foreground";',
    );
    for (const file of ["[slug]/product-page.tsx", "[slug]/changes.tsx", "[slug]/forum/page.tsx"]) {
      const source = code(file);
      expect([file, source.includes("BOARD_CARD_TITLE")]).toEqual([file, true]);
      // Neither of the old headings: the 20px one, or the card head's 16px.
      expect([file, source.includes("H2_SECTION")]).toEqual([file, false]);
      expect([file, /className=\{`?\$?\{?H2\}/.test(source)]).toEqual([file, false]);
    }
  });
});

describe("a section earns its panel (CP-R3)", () => {
  const page = code("[slug]/product-page.tsx");

  it("Built with and Crew render a card only when there is something in it", () => {
    // OPR1 — the components are Built with pills and the makers are the Crew
    // card, both in the side column; each still earns its card.
    // OPR-3 — each is its own component now, and still returns nothing
    // rather than an empty card.
    expect(page).toMatch(/if \(entries\.length === 0\) return null;\s*return \(\s*<section className=\{SIDE_CARD\} id="components"/);
    expect(page).toMatch(
      /if \(maintainers\.length === 0 && openRoles\.length === 0 && !needsBuilder\) return null;\s*return \(\s*<section id="crew"/,
    );
    // The old `#makers` address still lands on the people.
    expect(page).toMatch(/if \(maintainers\.length === 0\) return null;\s*return \(\s*<ul id="makers"/);
    expect(page).not.toContain("No components published.");
    expect(page).not.toContain("No makers listed yet.");
    expect(page).not.toContain("Stack not stated.");
  });

  it("nothing changed folds too; no earlier snapshot is still absent", () => {
    expect(code("[slug]/changes.tsx")).toContain("if (changes === null || changes.length === 0) return null;");
    // OPR-3 — the About tab hands the section the document's changes and
    // adds nothing of its own when it draws nothing.
    expect(page).toContain("<Changes changes={profile.changes} now={now} />");
  });

  it("an empty tab says so once, in its own card — there is no not-yet line (OPR-3)", () => {
    // OPR1's interim page folded every empty section into one line under the
    // reading column. Each tab now holds one thing, so each says its own
    // empty state where the content would be, and the line is gone.
    expect(page).not.toContain("data-not-yet");
    expect(page).not.toContain("Not yet on");
    for (const empty of ["Nothing posted yet.", "No milestones yet.", "No seat is open right now."]) {
      expect([empty, page.split(empty).length - 1]).toEqual([empty, 1]);
    }
    // The anchors other pages link to are still on the page that has them.
    for (const id of ['id="changed"', 'id="components"', 'id="makers"']) {
      const source = id === 'id="changed"' ? code("[slug]/changes.tsx") : page;
      expect([id, source.includes(id)]).toEqual([id, true]);
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
    expect(code("[slug]/product-page.tsx")).toContain("className={`m-0 whitespace-pre-wrap ${SECTION_PROSE}`}");
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
