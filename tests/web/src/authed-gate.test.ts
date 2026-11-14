// The authenticated walk is a gate, and it walks every signed-in page
// (openproduct-verification OV4).
//
// The worldclass epic carried "the studio's authenticated routes are still
// not walked" from FR3 to its close. This pins the lane that closes it: it
// runs in `all`, it signs in the way the studio walk does, it holds the
// signed-in half to the public lane's own sweep and tag set, and — the part
// that keeps it true — every `page.tsx` under `me/` and `studio/` is in its
// route list, so a signed-in page added later cannot stay unwalked.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const PERF = resolve(__dirname, "../../web-perf/src");
const read = (file: string) => readFileSync(file, "utf-8");

/** Every `page.tsx` under a directory, as the app path it answers at. */
function pagesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "page.tsx") out.push("/" + relative(APP, dirname(full)).replace(/\\/g, "/"));
    }
  };
  walk(dir);
  return out.sort();
}

describe("OV4 — the authenticated walk is a gate", () => {
  it("runs in `all`, signs in the way the studio walk does, and holds the signed-in half to the public lane's rules", () => {
    expect(read(resolve(PERF, "run.mjs"))).toContain('if (lane === "all" || lane === "authed")');
    const lane = read(resolve(PERF, "authed.mjs"));
    expect(lane).toContain('import { AUTHED_ROUTES, sessionCookie } from "./fixture.mjs";');
    expect(lane).toContain('import { TAP_MIN, sweepPage } from "./a11y.mjs";');
    expect(lane).toContain('["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]');
    expect(lane).toContain('{ id: "desktop/light", viewport: { width: 1280, height: 900 }, colorScheme: "light" }');
    expect(lane).toContain('{ id: "phone/dark", viewport: { width: 375, height: 812 }, colorScheme: "dark" }');
    // One cookie for both signed-in lanes — minted in the fixture, not copied.
    expect(read(resolve(PERF, "studio.mjs"))).toContain("sessionCookie } from \"./fixture.mjs\"");
    expect(read(resolve(PERF, "studio.mjs"))).not.toContain("function sessionCookie(");
  });

  it("walks every signed-in page the app has — a page added under /me, /studio or /activity must join the list", () => {
    const fixture = read(resolve(PERF, "fixture.mjs"));
    const block = fixture.slice(fixture.indexOf("export const AUTHED_ROUTES = ["), fixture.indexOf("];", fixture.indexOf("export const AUTHED_ROUTES = [")));
    const listed = [...block.matchAll(/\{ path: (?:"([^"]+)"|`([^`]+)`)/g)]
      .map((m) => m[1] ?? m[2] ?? "")
      .map((p) => p.replace("${STUDIO_ORG}", "[org]").replace("${STUDIO_PROFILE}", "[profile]"));
    // `/activity` is the inbox: a signed-in page that left `/me` for an
    // address of its own at openproduct-redesign OPR1, and is still walked.
    const pages = [
      ...pagesUnder(resolve(APP, "me")),
      ...pagesUnder(resolve(APP, "studio")),
      ...pagesUnder(resolve(APP, "activity")),
    ];
    expect(pages).toContain("/activity");
    // OPR1 — the settings page is new, and joined the list with the change
    // that added it; the two old addresses under `/me` are still pages.
    expect(pages).toContain("/me/settings");
    expect(pages).toContain("/me/saved");
    expect(pages).toContain("/me/applications");
    expect(pages.length).toBeGreaterThanOrEqual(16);
    const unwalked = pages.filter((p) => !listed.includes(p));
    expect(unwalked).toEqual([]);
    // And nothing listed that is not a page.
    const phantom = listed.filter((p) => !existsSync(resolve(APP, `.${p}/page.tsx`)));
    expect(phantom).toEqual([]);
  });

  it("checks the door as well as the rooms: signed out, the addresses keep the visitor's return address", () => {
    const lane = read(resolve(PERF, "authed.mjs"));
    // `/me/settings` since openproduct-redesign OPR1: the saved list became a
    // section of `/me`, and its old address returns a signed-out visitor to
    // the section, not to itself — so it is no longer a door of its own.
    expect(lane).toContain('for (const path of ["/me", "/me/settings", "/me/export", "/studio", "/studio/reports"])');
    expect(lane).toContain('landed.pathname === "/signin" && returnTo === path');
    expect(lane).toContain("the gate rendered as a page");
  });
});
