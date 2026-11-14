// The leaderboard folded into the Upvoted order (openproduct-open-builds OB7).
//
// UV2 built a leaderboard: launches ranked by the upvotes each day's board
// had published, over a week, a month or a year. Open builds (D5) folds it
// into the front page's Upvoted order — the builds by their counted upvotes,
// one sentence at /docs/formulas — and its addresses arrive there.
//
// What is pinned here:
//
//   - every leaderboard address redirects to `/products/by/upvoted` FROM THE
//     EDGE, never from a route module (SB0: a module whose body is one
//     redirect prerenders as a 200 with an empty body)
//   - no leaderboard route module is left to render
//   - the sitemap names the orders, not the leaderboard's ranges
//   - the day's own board survives at `/launches/<day>`, with its month strip

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { productsPath } from "@openproduct-web/app/feed/products";
import { SECTIONS } from "@openproduct-web/app/shell/shell";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("the leaderboard is the Upvoted order now", () => {
  it("redirects every address it had to the Upvoted sort, from the edge, in one hop", () => {
    // It was `/builds/upvoted` until openproduct-redesign OPR1 made the
    // order a sort of the Products page; that address redirects too, and a
    // redirect to a redirect is two round trips for one answer.
    const config = readFileSync(resolve(APP_DIR, "../../next.config.mjs"), "utf-8");
    expect(productsPath("upvoted")).toBe("/products/by/upvoted");
    expect(config).toContain('{ source: "/leaderboard", destination: "/products/by/upvoted", permanent: true }');
    expect(config).toContain('{ source: "/leaderboard/:range", destination: "/products/by/upvoted", permanent: true }');
    expect(config).not.toContain('destination: "/builds/upvoted"');
  });

  it("leaves no route module behind to render", () => {
    for (const file of ["leaderboard/page.tsx", "leaderboard/[range]/page.tsx", "leaderboard/view.tsx", "leaderboard/table.tsx"]) {
      expect([file, existsSync(resolve(APP_DIR, file))]).toEqual([file, false]);
    }
  });

  it("is not a section, and its head stays reserved so it never reads as a product", () => {
    expect(SECTIONS.map((s) => s.id)).not.toContain("leaderboard");
    expect(read("shell/section-for.ts")).toContain('"leaderboard",');
  });

  it("the sitemap names where the lists live, and none of the addresses that redirect", () => {
    const sitemap = markupOf("sitemap.xml/route.ts");
    expect(sitemap).not.toMatch(/path: "leaderboard/);
    // OPR1 — every order under `/builds/` redirects now (the sorts to the
    // Products page, Roles to Help wanted), so none of them is listed; the
    // two pages they arrive at are.
    expect(sitemap).not.toMatch(/builds\//);
    expect(sitemap).not.toContain("BUILD_ORDER_SEGMENTS");
    expect(sitemap).toContain('{ path: "products", lastmod: null }');
    expect(sitemap).toContain('{ path: "help-wanted", lastmod: null }');
  });
});

describe("the day's own board survives", () => {
  it("carries a day-of-month strip whose days link to their own boards", () => {
    const page = markupOf("launches/[day]/page.tsx");
    expect(page).toContain("monthStrip(parsed.day, now)");
    expect(page).toContain("href={`/launches/${d.id}`}");
    expect(page).toContain('aria-current="page"');
    expect(page).toContain('aria-label="Days this month"');
  });
});
