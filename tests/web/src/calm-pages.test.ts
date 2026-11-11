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
  it.each(["feed/row-shell.tsx", "launches/board.tsx", "search/page.tsx"])("%s draws its item as a tile", (file) => {
    const source = code(file);
    expect(source).toContain(TILE);
    expect(source).toContain("size={72} phoneSize={52}");
    // No row rule between items: the tiles stand apart.
    expect(source).not.toMatch(/<li[^>]*className="relative flex[^"]*border-t border-line/);
  });

  it.each([
    ["launches/board.tsx", '<ol className="m-0 mt-8 grid list-none gap-[14px] p-0">'],
    ["topics/[topic]/page.tsx", 'const LIST_TILES = "m-0 grid list-none gap-[14px] p-0";'],
    ["search/page.tsx", '<ul className="m-0 grid list-none gap-[14px] p-0">'],
  ])("%s stacks them 14px apart", (file, container) => {
    expect(code(file)).toContain(container);
  });

  it("names never hover into the accent (CL-R8)", () => {
    for (const file of ["feed/row-shell.tsx", "search/page.tsx", "feed/build-tile.tsx"]) {
      expect([file, code(file).includes("hover:text-endorse-ink")]).toEqual([file, false]);
    }
  });
});

describe("a build is a build in the words too", () => {
  it("the 404 says build and sends a reader to Open builds, in a neutral button", () => {
    const page = code("not-found.tsx");
    expect(page).toContain("No build lives at this address");
    expect(page).toContain("Back to Open builds");
    expect(page).not.toContain("the launches");
    expect(page).not.toContain("bg-endorse-ink");
  });

  it("collections group builds, and the empty state opens one", () => {
    const page = code("collections/page.tsx");
    expect(page).toContain("Builds grouped by the people who use them.");
    expect(page).toContain("Open a build →");
    expect(page).not.toContain("List a product");
  });

  it("a topic follow still says launches, because it notifies on launches (NF0)", () => {
    expect(code("topics/page.tsx")).toContain("Follow a topic to get its launches in your notifications.");
  });
});
