// The authenticated walk is a gate, and it walks every signed-in page
// (openproduct-verification OV4).
//
// The worldclass epic carried "the studio's authenticated routes are still
// not walked" from FR3 to its close. This pins the lane that closes it: it
// runs in `all`, it signs in the way the studio walk does, it holds the
// signed-in half to the public lane's own sweep and tag set, and — the part
// that keeps it true — every `page.tsx` under `me/` and `studio/` is in its
// route list, so a signed-in page added later cannot stay unwalked. Since
// openproduct-redesign OPR-3 that includes the post builder, the one
// signed-in page that lives under a product's own address (`/{slug}/new`).

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
      .map((p) => p.replace("${STUDIO_ORG}", "[org]").replace("${STUDIO_PROFILE}", "[profile]"))
      // OPR-3 — the post builder is walked on the product the walker is on
      // the crew of; the page it is a view of is `[slug]/new`.
      .map((p) => p.replace("${CREW_SLUG}", "[slug]").replace("${SAMPLE_DRAFT_POST}", "ppo"));
    // A section of `/me` is walked at its own address (`/me?section=saved`);
    // the PAGE it is a view of is the path before the query.
    const listedPages = [...new Set(listed.map((p) => p.split("?")[0] ?? p))];
    // `/activity` is the inbox: a signed-in page that left `/me` for an
    // address of its own at openproduct-redesign OPR1, and is still walked.
    const pages = [
      ...pagesUnder(resolve(APP, "me")),
      ...pagesUnder(resolve(APP, "studio")),
      ...pagesUnder(resolve(APP, "activity")),
      // OPR-3 — crew-only, per-request: a signed-in page like the others.
      ...pagesUnder(resolve(APP, "[slug]/new")),
    ];
    expect(pages).toContain("/[slug]/new");
    // OPR-3 — `/studio` is not a page any more: the list of your listings is
    // "Your products" on `/me`, and the address is a redirect (`MOVED`).
    expect(pages).not.toContain("/studio");
    expect(existsSync(resolve(APP, "studio/route.ts"))).toBe(true);
    expect(fixture).toContain('{ from: "/studio", to: "/me", status: 308 }');
    expect(listed).toContain("/me?section=following");
    expect(listed).toContain("/me?section=drafts");
    expect(pages).toContain("/activity");
    // OPR1 — the settings page is new, and joined the list with the change
    // that added it. The two old addresses under `/me` are redirects now
    // (`MOVED` holds their status); what is walked is the two SECTIONS they
    // arrive at, each at its own address.
    expect(pages).toContain("/me/settings");
    expect(pages).not.toContain("/me/saved");
    expect(pages).not.toContain("/me/applications");
    expect(listed).toContain("/me?section=saved");
    expect(listed).toContain("/me?section=seats");
    expect(pages.length).toBeGreaterThanOrEqual(14);
    const unwalked = pages.filter((p) => !listedPages.includes(p));
    expect(unwalked).toEqual([]);
    // And nothing listed that is not a page.
    const phantom = listedPages.filter((p) => !existsSync(resolve(APP, `.${p}/page.tsx`)));
    expect(phantom).toEqual([]);
  });

  it("checks the door as well as the rooms: signed out, the addresses keep the visitor's return address", () => {
    const lane = read(resolve(PERF, "authed.mjs"));
    // `/me/settings` since openproduct-redesign OPR1: the saved list became a
    // section of `/me`, and its old address returns a signed-out visitor to
    // the section, not to itself — so it is no longer a door of its own.
    // OPR-3 — `/studio` left the doors (it is a 308 to `/me`, so signed out
    // it arrives at `/me`'s door); the post builder, crew-only, joined them.
    expect(lane).toContain('for (const path of ["/me", "/me/settings", "/me/export", "/studio/reports", `/${CREW_SLUG}/new`])');
    expect(lane).toContain('landed.pathname === "/signin" && returnTo === path');
    expect(lane).toContain("the gate rendered as a page");
  });
});
