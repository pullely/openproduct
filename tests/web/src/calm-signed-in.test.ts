// The signed-in pages (openproduct-calm-pages CP5).
//
// What is pinned: your pages are views of you, so the nav between them is
// the underline strip, not chips (CP-R2); notifications, saved builds,
// applications and the studio's listings are tiles (CP-R6); and the /me
// column, the studio's panels and /submit take the calm frame.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("one kind of tab on your pages (CP-R2)", () => {
  it("the Me nav is the underline strip", () => {
    const nav = code("me/nav.tsx");
    expect(nav).toContain('className="flex flex-wrap items-center gap-x-6 border-b border-line"');
    expect(nav).toContain("${key === active ? TAB_ON : TAB_OFF}");
    expect(nav).not.toMatch(/CHIP_(BTN|ON|OFF)/);
  });

  it("the column has the calm frame's room", () => {
    expect(code("me/nav.tsx")).toMatch(/export const ME_MAIN =\s*"[^"]*pt-\[80px\]/);
    expect(code("submit/page.tsx")).toContain("pb-[104px] pt-[80px]");
  });
});

describe("every signed-in list is tiles (CP-R6)", () => {
  it.each([
    ["me/notifications/page.tsx", "data-notification-tiles", "rounded-[16px] border border-border px-6 py-4"],
    ["me/saved/page.tsx", "data-saved-tiles", "rounded-[20px] border border-border bg-card px-7 py-5"],
    ["me/applications/page.tsx", "data-application-tiles", "rounded-[20px] border border-border bg-card px-7 py-5"],
    ["studio/page.tsx", "data-studio-tiles", "rounded-[20px] border border-border bg-card px-7 py-5"],
  ])("%s", (file, list, tile) => {
    const source = code(file);
    expect(source).toContain(list);
    expect(source).toContain(tile);
    // No row rule between items: the tiles stand apart.
    expect(source).not.toMatch(/<li[^>]*className="[^"]*border-t border-line[^"]*first:border-t-0/);
  });

  it("an unread notification keeps the accent's soft fill — its one other meaning", () => {
    expect(code("me/notifications/page.tsx")).toContain('item.unread ? "bg-endorse-soft" : "bg-card"');
  });

  it("the studio's panels take the tile's radius", () => {
    expect(code("studio/frame.tsx")).toContain(
      'export const RAIL_PANEL = "rounded-[20px] border border-border bg-card px-6 pb-5 pt-5";',
    );
  });
});
