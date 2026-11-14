// The product page's tabs (openproduct-worldclass-v2 PP2; rebuilt in
// openproduct-redesign OPR-3).
//
// PP2's answer to "no sub-nav" was an outline of anchors over one document.
// The redesign's boards draw tabs, and OPR-3 makes them real — as ADDRESSES:
// each tab is a route with its own cached document. What is pinned here:
//
//   - the product's stage picks the page (shipping or idea), and nothing else
//   - the four tabs are links to four cacheable views, never client state
//   - an anchor another page still links to is forwarded to the tab it is on
//   - `j` and `k` still walk the open tab's sections
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SECTION_ATTRIBUTE } from "@openproduct-web/app/[slug]/sections";
import {
  ANCHOR_TABS,
  PRODUCT_TABS,
  PRODUCT_TABS_LABEL,
  PRODUCT_TAB_LABELS,
  forwardedAddress,
  pageKindOf,
  productTabLinks,
  productTabPath,
  productUpdatesPagePath,
  tabForAnchor,
  updatesCursorOf,
} from "@openproduct-web/app/[slug]/tabs";
import { BINDINGS, KEYS_SHEET_NOTE, walksSections } from "@openproduct-web/app/ui/keys";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const markupOf = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = "[slug]/product-page.tsx";
const TAB_ROUTES: Record<string, string> = {
  updates: "[slug]/page.tsx",
  about: "[slug]/about/page.tsx",
  crew: "[slug]/crew/page.tsx",
  talk: "[slug]/talk/page.tsx",
};

describe("one address, two pages: the stage decides", () => {
  it("draws the idea page for an idea and the shipping page for everything else", () => {
    expect(pageKindOf("idea")).toBe("idea");
    expect(pageKindOf("shipping")).toBe("shipping");
    // A document cached before the stage existed carries none: it is the
    // page that address has always been.
    for (const absent of [undefined, null, "", "IDEA", 1]) {
      expect([absent, pageKindOf(absent)]).toEqual([absent, "shipping"]);
    }
  });

  it("reads the stage off the public product document, and off nothing about the visitor", () => {
    const page = markupOf(PAGE);
    const chooser = page.slice(page.indexOf("export async function ProductPage("), page.indexOf("function shareOf("));
    expect(chooser).toContain("const read = await fetchListing(slug);");
    expect(chooser).toContain('if (pageKindOf(profile.stage) === "idea") {');
    expect(chooser).toContain("return <IdeaPage read={read!} profile={profile} />;");
    expect(chooser).toContain("return <ShippingPage read={read!} profile={profile} tab={tab} cursor={cursor} />;");
    // Nothing else is consulted: no session, no cookie, no query.
    expect(chooser).not.toMatch(/cookies|headers|searchParams|session/i);
  });

  it("gives an idea one page: its tab addresses go to it", () => {
    const page = markupOf(PAGE);
    expect(page).toContain('if (tab !== "updates" || cursor) redirect(`/${profile.slug}`);');
    const idea = page.slice(page.indexOf("async function IdeaPage("), page.indexOf("type Catalog ="));
    expect(idea).not.toContain("<nav");
    expect(idea).not.toContain("productTabLinks");
  });

  it("still 404s what is not there and still draws a tombstone for what was removed", () => {
    const page = markupOf(PAGE);
    expect(page).toContain("return <ListingTombstone tombstone={read.tombstone} />;");
    expect(page).toContain("if (!profile) notFound();");
  });
});

describe("the tabs are links to cacheable views", () => {
  it("is four tabs, in the board's order and words", () => {
    expect([...PRODUCT_TABS]).toEqual(["updates", "about", "crew", "talk"]);
    expect(PRODUCT_TABS.map((tab) => PRODUCT_TAB_LABELS[tab])).toEqual(["Updates", "About", "Crew", "Talk"]);
    expect(PRODUCT_TABS_LABEL).toBe("Product sections");
  });

  it("gives every tab an address of its own, Updates being the product's", () => {
    expect(PRODUCT_TABS.map((tab) => productTabPath("ackstack", tab))).toEqual([
      "/ackstack",
      "/ackstack/about",
      "/ackstack/crew",
      "/ackstack/talk",
    ]);
    const links = productTabLinks("ackstack", "crew");
    expect(links.map((link) => link.href)).toEqual(["/ackstack", "/ackstack/about", "/ackstack/crew", "/ackstack/talk"]);
    expect(links.filter((link) => link.current).map((link) => link.tab)).toEqual(["crew"]);
  });

  it("has a route file behind every address, each a cached document that reads no query", () => {
    for (const tab of PRODUCT_TABS) {
      const file = TAB_ROUTES[tab]!;
      expect([file, existsSync(resolve(APP, file))]).toEqual([file, true]);
      const source = markupOf(file);
      expect([file, source.includes("export const revalidate = 60;")]).toEqual([file, true]);
      // Without `generateStaticParams` a dynamic segment is rendered per
      // request and goes out `no-store` (XP4).
      expect([file, /export async function generateStaticParams\(\) \{\s*return \[\];\s*\}/.test(source)]).toEqual([file, true]);
      expect([file, source.includes(`<ProductPage slug={slug} tab="${tab}" />`)]).toEqual([file, true]);
      expect([file, source.includes(`productMetadata(slug, "${tab}")`)]).toEqual([file, true]);
      expect([file, /searchParams|cookies\(|headers\(|"use client"/.test(source)]).toEqual([file, false]);
    }
  });

  it("pages the updates by address too: the cursor is in the path", () => {
    expect(productUpdatesPagePath("ackstack", "abc=")).toBe("/ackstack/updates/abc%3D");
    const route = markupOf("[slug]/updates/[cursor]/page.tsx");
    expect(route).toContain("export const revalidate = 60;");
    expect(route).toContain('<ProductPage slug={slug} tab="updates" cursor={updatesCursorOf(cursor)} />');
    expect(updatesCursorOf("abc%3D")).toBe("abc=");
    // A segment that does not decode is passed as it came.
    expect(updatesCursorOf("%E0%A4%A")).toBe("%E0%A4%A");
    expect(route).not.toContain("searchParams");
    // A later page is not a second copy of the product for a crawler.
    expect(route).toContain("robots: { index: false, follow: true }");
    const page = markupOf(PAGE);
    expect(page).toContain("fetchProductPosts(slug, cursor)");
    expect(page).toContain("href={productUpdatesPagePath(slug, posts.next)}");
    expect(page).not.toMatch(/[?&]cursor=/);
  });

  it("draws the row as a labelled landmark of links, the open one marked — no buttons, no state", () => {
    const page = markupOf(PAGE);
    const nav = page.slice(page.indexOf("<nav aria-label={PRODUCT_TABS_LABEL}"), page.indexOf("</nav>", page.indexOf("<nav aria-label={PRODUCT_TABS_LABEL}")));
    expect(nav.length).toBeGreaterThan(0);
    expect(nav).toContain("{productTabLinks(slug, tab).map((link) => (");
    expect(nav).toMatch(/<AppLink\s+href=\{link\.href\}\s+aria-current=\{link\.current \? "page" : undefined\}/);
    expect(nav).toContain("link.current ? SECTION_PILL_ON : SECTION_PILL_OFF");
    expect(nav).not.toMatch(/<button|aria-pressed|onClick|role="tab"/);
    // A select that navigates on change is a change of context on input
    // (WCAG 3.2.2); the tabs are links.
    expect(page).not.toMatch(/<select/);
    // The page keeps no state at all: it is a server component.
    expect(page).not.toMatch(/useState|"use client"/);
  });

  it("reads for a tab only what that tab draws", () => {
    const page = markupOf(PAGE);
    expect(page).toContain('tab === "updates" ? fetchProductPosts(slug, cursor) : Promise.resolve(null),');
    expect(page).toContain('tab === "talk" ? fetchDiscussion(slug) : Promise.resolve(null),');
    for (const tab of PRODUCT_TABS) {
      expect([tab, page.includes(`{tab === "${tab}" ? `)]).toEqual([tab, true]);
    }
  });

  it("gives each tab its own title and canonical, and the product's own address the listing's", () => {
    const page = markupOf(PAGE);
    expect(page).toContain(
      "title: root ? listingTitle(profile.slug, profile.tagline) : `${PRODUCT_TAB_LABELS[tab]} · ${profile.slug}`,",
    );
    expect(page).toContain("canonical: `${apex}${productTabPath(profile.slug, tab)}`");
  });
});

describe("an anchor other pages still link to lands on the tab that has it", () => {
  it("knows which tab owns each of the old page's anchors", () => {
    expect(tabForAnchor("#discussion")).toBe("talk");
    expect(tabForAnchor("discussion")).toBe("talk");
    expect(tabForAnchor("#comment-abc")).toBe("talk");
    expect(tabForAnchor("#people-wanted")).toBe("crew");
    expect(tabForAnchor("#changed")).toBe("about");
    expect(tabForAnchor("#launches")).toBe("about");
    expect(tabForAnchor("#post")).toBe("updates");
    // The side column is on every tab: its anchors are forwarded nowhere.
    for (const everywhere of ["#crew", "#alternatives", "#components", "#health", "#nope"]) {
      expect([everywhere, tabForAnchor(everywhere)]).toEqual([everywhere, null]);
    }
    expect(Object.values(ANCHOR_TABS).every((tab) => (PRODUCT_TABS as readonly string[]).includes(tab))).toBe(true);
  });

  it("forwards with the query kept, and stays put when the anchor is already here", () => {
    // A comment's return: `/{slug}?commented=ok#discussion`.
    expect(forwardedAddress("ackstack", "updates", "?commented=ok", "#discussion")).toBe(
      "/ackstack/talk?commented=ok#discussion",
    );
    expect(forwardedAddress("ackstack", "updates", "", "#people-wanted")).toBe("/ackstack/crew#people-wanted");
    expect(forwardedAddress("ackstack", "talk", "", "#post")).toBe("/ackstack#post");
    expect(forwardedAddress("ackstack", "talk", "", "#discussion")).toBeNull();
    expect(forwardedAddress("ackstack", "updates", "", "")).toBeNull();
    expect(forwardedAddress("ackstack", "updates", "", "#crew")).toBeNull();
  });

  it("every forwarded anchor is an id the page it lands on draws", () => {
    const page = markupOf(PAGE);
    const changes = markupOf("[slug]/changes.tsx");
    const newPost = markupOf("[slug]/maker/new-post.tsx");
    // `comment-…` ids are the conversation's own; `talk` and `seats` are
    // spellings kept for the boards' own anchors.
    for (const id of Object.keys(ANCHOR_TABS).filter((id) => id !== "seats" && id !== "talk")) {
      const source = id === "changed" ? changes : id === "post" ? newPost : page;
      expect([id, new RegExp(`\\bid="${id}"`).test(source)]).toEqual([id, true]);
    }
  });

  it("does it in the browser, once, and only on the shipping page — a fragment never reaches the server", () => {
    const forward = markupOf("[slug]/anchor-forward.tsx");
    expect(forward).toContain('"use client"');
    expect(forward).toContain("const to = forwardedAddress(slug, tab, search, hash);");
    expect(forward).toContain("if (to) router.replace(to);");
    // An element with that id on this page wins.
    expect(forward).toContain("document.getElementById(decodeURIComponent(hash.slice(1)))");
    expect(forward).toContain("return null;");
    const page = markupOf(PAGE);
    expect(page.split("<AnchorForward").length - 1).toBe(1);
  });
});

describe("every card with a heading is a section the keys can reach", () => {
  it("wears the traversal attribute on a section with a labelled, focusable heading", () => {
    const page = markupOf(PAGE);
    const changes = markupOf("[slug]/changes.tsx");
    for (const id of ["about", "milestones", "details", "launches", "discussion", "people-wanted", "crew", "alternatives"]) {
      const open = new RegExp(`<section[^>]*\\bid="${id}"[^>]*>`, "s");
      expect([id, open.test(page)]).toEqual([id, true]);
      const tag = page.match(open)![0];
      expect([id, /\[SECTION_ATTRIBUTE\]: true/.test(tag)]).toEqual([id, true]);
      expect([id, /aria-labelledby="[a-z-]+-heading"/.test(tag)]).toEqual([id, true]);
    }
    expect(changes).toMatch(/<section[^>]*\bid="changed"[^>]*>/s);
    // The heading takes focus without joining the Tab order.
    expect(page).toContain("<h2 id={id} tabIndex={-1} className={`${SIDE_TITLE} outline-none`}>");
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
