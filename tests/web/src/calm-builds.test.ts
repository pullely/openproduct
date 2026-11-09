// Builds as tiles, endlessly (openproduct-calm CL2).
//
// What is pinned: every list of builds draws `BuildTile` (CL-R3); the front
// page and the orders are one column with no margin (CL-R5); the sort tabs are
// a sticky strip with the order's caption (CL-R6); and the list continues on
// scroll from the same paged address a crawler follows, keeping the plain
// link (CL-R7).

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BUILD_ORDERS, BUILD_ORDER_CAPTION, MORE_BUILDS_FAILED, MORE_BUILDS_LOADING } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("every list of builds draws the tile (CL-R3)", () => {
  it.each([
    "feed/builds.tsx",
    "feed/more-builds.tsx",
    "topics/[topic]/page.tsx",
    "stack/[value]/page.tsx",
    "pricing/[value]/page.tsx",
    "products/[cursor]/page.tsx",
  ])("%s", (file) => {
    const source = code(file);
    expect(source).toContain("<BuildTile ");
    expect(source).not.toContain("CardRow");
  });

  it("the old row is gone, and the tiles stack in one column", () => {
    expect(existsSync(resolve(APP_DIR, "feed/card-row.tsx"))).toBe(false);
    expect(code("feed/builds.tsx")).toContain('className="m-0 mt-4 grid list-none gap-[14px] p-0" data-build-tiles');
  });

  it("the tile's vote box is the tile's own shape", () => {
    expect(code("feed/build-tile.tsx")).toContain('shape="tile"');
    expect(code("ui/vote-box.tsx")).toContain('"grid h-[64px] w-[60px] content-center place-items-center');
  });
});

describe("a list page has one column (CL-R5)", () => {
  it.each(["page.tsx", "builds/[order]/page.tsx"])("%s draws no margin", (file) => {
    const source = code(file);
    expect(source).not.toContain("<Sidebar");
    expect(source).not.toContain("TWO_COL");
    expect(source).not.toContain("fetchSidebar");
  });
});

describe("the tabs stay in reach (CL-R6)", () => {
  it("the strip is sticky from `sm` up, on the page's ground, and static on a phone", () => {
    const list = code("feed/builds.tsx");
    expect(list).toContain("data-builds-strip");
    expect(list).toMatch(/className="sticky top-0 z-20 [^"]*bg-background[^"]*max-sm:static/);
  });

  it("carries the order's caption, linked to its published sentence", () => {
    for (const order of BUILD_ORDERS) {
      expect(BUILD_ORDER_CAPTION[order].length).toBeGreaterThan(0);
    }
    expect(BUILD_ORDER_CAPTION["most-active"]).toBe("(changes + 1) × (upvotes + 1) · 7 days");
    const list = code("feed/builds.tsx");
    expect(list).toContain("{BUILD_ORDER_CAPTION[order]}");
    expect(list).toContain("href={formulaHref(BUILD_ORDER_FORMULA[order])}");
  });

  it("the lit tab is a foreground underline, never the accent (CL-R8)", () => {
    const control = code("feed/sort-control.tsx");
    expect(control).toContain("sm:border-foreground");
    expect(control).not.toMatch(/endorse/);
  });
});

describe("the list does not end on a button (CL-R7)", () => {
  const more = code("feed/more-builds.tsx");

  it("keeps the plain link in the server's HTML, and beside a failed read", () => {
    expect(more).toContain("href={cataloguePagePath(cursor)}");
    expect(more).toContain("data-catalogue-next");
    // Out of sight while a read is in flight, never out of the document.
    expect(more).toContain('state === "loading" ? "sr-only" : ""');
    expect(more).toContain("{MORE_BUILDS_FAILED}");
    expect(MORE_BUILDS_FAILED.length).toBeGreaterThan(0);
  });

  it("reads ahead of the end, says so, and reads each page once", () => {
    expect(more).toContain("new IntersectionObserver(");
    expect(more).toContain("observer.disconnect();");
    expect(more).toContain('role="status"');
    expect(more).toContain("{MORE_BUILDS_LOADING}");
    expect(MORE_BUILDS_LOADING).toBe("Loading more builds");
    // A listing that moved between two reads is drawn once.
    expect(more).toContain("!seen.has(card.slug)");
  });

  it("only Most active continues: the cursor is a position in that order", () => {
    expect(code("feed/builds.tsx")).toContain('order === "most-active" && next !== null ? <MoreBuilds');
  });
});

describe("/api/builds/{cursor} is the continuation page, as JSON", () => {
  const route = code("api/builds/[cursor]/route.ts");

  it("reads the same directory page, withholds what the floor withholds, and caches at the edge", () => {
    expect(route).toContain("fetchDirectoryPage(cursor)");
    expect(route).toContain("page.projects.filter(frontPageEligible)");
    expect(route).toContain("s-maxage=${CACHE_SECONDS}");
    expect(route).toMatch(/const CACHE_SECONDS = 60;/);
  });

  it("answers 404 for a page that is not there, uncached", () => {
    expect(route).toMatch(/if \(page === null\) \{[\s\S]*?status: 404/);
  });

  it("forwards nothing personal", () => {
    expect(route).not.toMatch(/cookies\(|headers\(|request\.headers|authorization/i);
  });
});
