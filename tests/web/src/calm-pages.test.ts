// Everything else (openproduct-calm CL5).
//
// What is pinned: every list on the estate is one column of the same rounded
// tile — the launch rows, the day's board and the search results took the
// build tile's shape (CL-R3) — and the pages that still spoke of launches as
// the product's noun say build where they mean one. Where a page names a
// launch because the thing really is a launch (a topic follow notifies on
// launches, NF0), the word stays.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const TILE = "rounded-[20px] border border-border bg-card px-8 py-6";

describe("every list is one column of tiles (CL-R3)", () => {
  // OPR1 — the day board has no board of its own: it takes the shared flat
  // tile (`TILE_LINK` from `ui/design.ts`) rather than a card spelled inline.
  it("launches/board.tsx draws its item as the shared flat tile (OPR1)", () => {
    const source = code("launches/board.tsx");
    expect(source).toMatch(/className=\{`relative flex list-none items-center [^`]*\$\{TILE_LINK\}`\}/);
    expect(source).not.toMatch(/rounded-\[20px\]|border border-border bg-card/);
    expect(source).toContain("size={72} phoneSize={52}");
    expect(source).not.toMatch(/<li[^>]*className="relative flex[^"]*border-t border-line/);
  });

  it.each(["feed/row-shell.tsx"])("%s draws its item as a tile", (file) => {
    const source = code(file);
    expect(source).toContain(TILE);
    expect(source).toContain("size={72} phoneSize={52}");
    // No row rule between items: the tiles stand apart.
    expect(source).not.toMatch(/<li[^>]*className="relative flex[^"]*border-t border-line/);
  });

  it.each([
    ["launches/board.tsx", '<ol className="m-0 mt-8 grid list-none gap-[14px] p-0">'],
    ["topics/[topic]/page.tsx", 'const LIST_TILES = "m-0 grid list-none gap-[14px] p-0";'],
  ])("%s stacks them 14px apart", (file, container) => {
    expect(code(file)).toContain(container);
  });

  it("search results are rows in one flat card, as board `Search` draws them (OPR1)", () => {
    // Was: each result its own 72px tile, 14px apart (CL-R3). The board puts
    // a class's results in ONE flat card — 16px radius, no border — as rows
    // on a hairline, with the product's tile at the ladder's 44px step.
    const frame = code("search/frame.ts");
    expect(frame).toMatch(/export const RESULT_CARD = "[^"]*rounded-\[16px\] bg-card[^"]*"/);
    expect(frame).not.toMatch(/border-border|shadow/);
    const source = code("search/page.tsx");
    expect(source).toContain("<ul className={RESULT_CARD}>");
    expect(source).toContain("size={44}");
    expect(source).toMatch(/<li\s+data-keyrow\s+className="relative flex[^"]*border-t border-line[^"]*first:border-t-0/);
    expect(source).not.toContain("rounded-[20px] border border-border");
  });

  it("names never hover into the accent (CL-R8)", () => {
    for (const file of ["feed/row-shell.tsx", "search/page.tsx", "feed/product-card.tsx"]) {
      expect([file, code(file).includes("hover:text-endorse-ink")]).toEqual([file, false]);
    }
  });
});

describe("a build is a build in the words too", () => {
  it("the 404 is one title and one way back, in the ink button (OPR1)", () => {
    // Was: "No build lives at this address", a paragraph, and two buttons
    // (Open builds, Search). The redesign says product, the header carries
    // search on every page, and a page gets one `h1` and one action.
    const page = code("not-found.tsx");
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(page).toContain("<h1 className={PAGE_TITLE}>No product lives at this address</h1>");
    expect(page.match(/<Link\b/g)).toHaveLength(1);
    expect(page).toMatch(/<Link href="\/" className=\{BTN_BACK\}>\s*Back to the feed\s*<\/Link>/);
    expect(page).not.toMatch(/<p\b|<button\b/);
    expect(page).toMatch(/const BTN_BACK =\s*"[^"]*min-h-\[40px\][^"]*bg-primary[^"]*max-sm:min-h-\[44px\]/);
    expect(page).not.toContain("the launches");
    expect(page).not.toContain("bg-endorse-ink");
  });

  it("collections group builds, and the empty state opens one", () => {
    const page = code("collections/page.tsx");
    expect(page).toContain("Builds grouped by the people who use them.");
    expect(page).toContain("Open a build →");
    expect(page).not.toContain("List a product");
  });

  // OPR1 — the owner's rule: no explainer under a control. The index used to
  // carry a sentence describing the Follow button; the button stays, alone.
  it("the topics index offers the follow with no sentence explaining it (OPR1)", () => {
    const topics = code("topics/page.tsx");
    expect(topics).toContain('<FollowButton');
    expect(topics).toContain('kind="topic"');
    expect(topics).not.toContain("PAGE_SUBTITLE");
    expect(topics).not.toContain("in your notifications");
  });
});
