// Reach on every route (openproduct-worldclass-v2 QE1).
//
// The audit found `og:image` on the home, a listing, a person and a topic —
// and absent on the leaderboard, the topics index, people, the digest,
// collections and search. RE0 had built the card and the routes; what was
// missing was the wiring, page by page, and nothing held it. So this suite
// enumerates the public routes the way the census does and asserts, on each,
// a card (its own, or the root layout's default) and a list's structured
// data where the page is a list. The branded `<title>` is RE2's, held by
// `title-brand.test.ts` over the same enumeration.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function pages(dir = APP_DIR, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (entry === "page.tsx") out.push(relative(APP_DIR, full));
  }
  return out;
}

/** The census's own definition: a public page declares a `revalidate`. */
const PUBLIC = pages().filter((file) => /export const revalidate = \d+;/.test(read(file)));

describe("a card on every public route", () => {
  it("the root layout advertises the site card as the default", () => {
    const layout = code("layout.tsx");
    expect(layout).toContain('cardMeta(publicApexOrigin(), "/og/site", SITE_CARD_ALT)');
    expect(layout).toContain("images: SITE_CARD.images");
  });

  it.each(PUBLIC)("%s either brings its own card or leaves the default alone", (file) => {
    // Next replaces a parent's `openGraph` object whole, so a page that
    // declares one without `images` has thrown the default away — which is
    // exactly how six routes came to unfurl as bare text.
    const src = code(file);
    const declares = /\bopenGraph:/.test(src);
    const brings = /images: card\.images|listOpenGraph\(|cardMeta\(/.test(src);
    expect([file, declares && !brings]).toEqual([file, false]);
  });

  it.each([
    ["topics/page.tsx", "topics"],
    ["people/(index)/page.tsx", "people"],
    ["digest/page.tsx", "digest"],
    ["collections/page.tsx", "collections"],
    ["search/page.tsx", "search"],
    ["stack/page.tsx", "stack"],
    ["pricing/page.tsx", "pricing"],
  ])("%s carries its own list card (%s)", (file, key) => {
    expect(code(file)).toContain(`listOpenGraph(`);
    expect(code(file)).toContain(`"${key}")`);
  });

  it("the forum carries its own card, not the site's", () => {
    expect(code("threads/forum-view.tsx")).toContain('listCardMeta(origin, "threads")');
    expect(code("threads/forum-view.tsx")).not.toContain("/og/site");
  });

  it("the list card route is static, enumerated, and refuses an unknown key", () => {
    const route = code("og/list/[key]/route.tsx");
    expect(route).toContain('export const dynamic = "force-static"');
    expect(route).toContain("LIST_CARD_KEYS.map((key) => ({ key }))");
    expect(route).toContain("if (!isListCardKey(key)) return new Response");
  });
});

describe("structured data on every list route", () => {
  it.each([
    "topics/page.tsx",
    "people/(index)/page.tsx",
    "digest/page.tsx",
    "collections/page.tsx",
    "search/page.tsx",
    "stack/page.tsx",
    "pricing/page.tsx",
    "threads/forum-view.tsx",
    "launches/[day]/page.tsx",
    "collections/[slug]/page.tsx",
    "topics/[topic]/page.tsx",
  ])("%s emits a CollectionPage", (file) => {
    expect(code(file)).toContain("collectionPageJsonLd(");
  });
});

describe("the sitemap reaches the boards and the forum", () => {
  const sitemap = code("sitemap.xml/route.ts");

  it("lists every day that holds a board, from the archive read", () => {
    expect(sitemap).toContain("fetchBoardDays()");
    expect(sitemap).toContain("path: `launches/${entry.day}`");
  });

  it("lists the list's other orders, and none of the addresses that redirect (OB7, OPR1)", () => {
    // The leaderboard folded into the Upvoted order and redirects there. The
    // Roles order moved to the Help wanted section's own address at
    // openproduct-redesign OPR1, so it is listed THERE, and Products has an
    // address of its own. A sitemap names where a page lives, never an
    // address that redirects.
    expect(sitemap).toContain(
      'BUILD_ORDER_SEGMENTS.filter((order) => order !== "roles").map((order) => ({ path: `builds/${order}`, lastmod: null }))',
    );
    expect(sitemap).toContain('{ path: "help-wanted", lastmod: null }');
    expect(sitemap).toContain('{ path: "products", lastmod: null }');
    expect(sitemap).not.toContain('{ path: "leaderboard", lastmod: null }');
  });

  it("lists the forum, its orders and its categories, and every listing's forum", () => {
    expect(sitemap).toContain('{ path: "threads", lastmod: null }');
    expect(sitemap).toContain("forumCategories().flatMap(");
    expect(sitemap).toContain("path: `${project.slug}/forum`");
  });
});
