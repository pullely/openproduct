// The signed-in pages (openproduct-calm-pages CP5; your own pages rebuilt to
// the boards `Me`, `Activity` and `Settings` by openproduct-redesign OPR1).
//
// What is pinned: your pages are ONE page with a switcher between its
// sections — links, each an address — where a strip of tabs between three
// pages used to be; the lists on them are the boards' flat cards, with no
// rule between items; an unread notification keeps the amber's soft fill;
// the pages stand in the boards' columns; and the studio's listings and
// /submit keep the calm frame until their own boards land.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("one switcher on your page (CP-R2, board `Me`)", () => {
  it("the sections are links in one nav, the current one marked — never chips with client state", () => {
    const nav = code("me/nav.tsx");
    expect(nav).toContain('aria-label="Your sections"');
    expect(nav).toContain("href={meSectionHref(section.key)}");
    expect(nav).toContain('{ "aria-current": "page" as const }');
    // A section is an address a server render answers: no script switches it.
    expect(nav).not.toContain('"use client"');
    expect(nav).not.toMatch(/useState|onClick|aria-pressed/);
    // The strip of tabs between three pages is gone, with the pages.
    expect(nav).not.toMatch(/\bTAB(_ON|_OFF)?\b|export function MeNav\b/);
  });

  it("the pages stand in the boards' columns, and /submit keeps the calm frame", () => {
    // `Me` is the 1180px board page; `Activity` 760px; `Settings` 1080px.
    expect(code("me/page.tsx")).toContain("<main className={BOARD_PAGE}>");
    expect(code("me/nav.tsx")).toMatch(/export const ACTIVITY_MAIN =\s*"[^"]*max-w-\[760px\][^"]*pt-9/);
    expect(code("me/nav.tsx")).toMatch(/export const SETTINGS_MAIN =\s*"[^"]*max-w-\[1080px\][^"]*pt-8/);
    expect(code("submit/page.tsx")).toContain("pb-[104px] pt-[80px]");
  });
});

describe("every signed-in list is tiles (CP-R6)", () => {
  it.each([
    // OPR1 — the boards' flat card: 16px round, white on the page, no border.
    ["activity/page.tsx", "data-activity-rows", "rounded-[16px] bg-card p-1.5"],
    ["me/sections.tsx", "data-me-products", "rounded-[16px] bg-card p-[18px]"],
    ["me/sections.tsx", "data-me-saved", "rounded-[16px] bg-card p-[18px]"],
    ["me/sections.tsx", "data-me-seats", "rounded-[16px] bg-card px-[26px] py-4"],
    // The studio's listings wear the shared flat tile (`TILE`, ui/design.ts).
    ["studio/page.tsx", "data-studio-tiles", "px-6 py-5 max-sm:px-4 max-sm:py-4 ${TILE}"],
  ])("%s %s", (file, list, tile) => {
    const source = code(file);
    expect(source).toContain(list);
    expect(source).toContain(tile);
    // No row rule between items: the tiles stand apart.
    expect(source).not.toMatch(/<li[^>]*className="[^"]*border-t border-line[^"]*first:border-t-0/);
  });

  it("an unread notification keeps the amber's soft fill — its one other meaning", () => {
    // The board's faint tint under an unread row: the amber tint, thinned.
    expect(code("activity/page.tsx")).toContain('item.unread ? "bg-amber-soft/[0.35]" : ""');
  });

  it("the studio's panels take the tile's radius", () => {
    // OPR1 — the shared flat panel, not a card spelled inline; and no studio
    // file spells the old bordered tile at all.
    const frame = code("studio/frame.tsx");
    expect(frame).toContain("export const RAIL_PANEL = PANEL;");
    expect(frame).toContain("<div className={`max-w-[70ch] ${PANEL}`}>");
    expect(frame).not.toMatch(/rounded-\[(12|20)px\]|border border-border bg-card/);
  });
});
