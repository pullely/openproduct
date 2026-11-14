// Products as cards, with *Show more* (openproduct-redesign OPR1; it was
// "builds as tiles, endlessly", openproduct-calm CL2).
//
// What is pinned: every list of products draws the ONE card — the Products
// board's (`feed/product-card.tsx`), under its old name where a page has not
// been rebuilt yet; the Products view is one column with no margin until the
// stage filter arrives (OPR2); the sort is a pill track of links, with no
// accent; and the list continues from the same paged address a crawler
// follows, as a link that reads in place when pressed.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRODUCTS_MORE_FAILED,
  PRODUCTS_MORE_LABEL,
  PRODUCTS_MORE_LOADING,
  matchesProductQuery,
  noProductsMatch,
  productsCountLine,
  productsShownLine,
} from "@openproduct-web/app/feed/products";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("every list of products draws the one card", () => {
  it.each(["feed/product-list.tsx", "products/[cursor]/page.tsx"])("%s draws ProductCard in the board's grid", (file) => {
    const source = code(file);
    expect(source).toContain("<ProductCard ");
    expect(source).toContain("<ul className={PRODUCT_GRID} data-product-cards>");
    expect(source).not.toContain("CardRow");
  });

  it.each(["topics/[topic]/page.tsx", "stack/[value]/page.tsx", "pricing/[value]/page.tsx"])(
    "%s draws the same card, under its own name",
    (file) => {
      const source = code(file);
      expect(source).toContain('import { ProductCard } from "../../feed/product-card";');
      expect(source).toContain("<ProductCard ");
      expect(source).not.toContain("BuildTile");
      expect(source).not.toContain("CardRow");
    },
  );

  it("the old row, the old list and the old tile's name are gone: one card, one name", () => {
    // `feed/build-tile.tsx` re-exported the card as `BuildTile` while the
    // topic, stack and pricing lists still imported the old name. They
    // import `ProductCard` now, so the alias has no reader and is gone.
    for (const file of ["feed/card-row.tsx", "feed/builds.tsx", "feed/more-builds.tsx", "feed/build-tile.tsx"]) {
      expect([file, existsSync(resolve(APP_DIR, file))]).toEqual([file, false]);
    }
  });

  it("the grid is the board's: columns of at least 250px, 18px apart; one column on a phone", () => {
    expect(code("feed/product-card.tsx")).toContain(
      '"m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-[18px] p-0 max-sm:grid-cols-1 max-sm:gap-[10px]"',
    );
  });

  it("the card is flat: the card colour at a 16px radius, no border and no shadow", () => {
    const card = code("feed/product-card.tsx");
    expect(card).toContain('className="flex min-w-0 list-none flex-col overflow-hidden rounded-[16px] bg-card"');
    expect(card).not.toMatch(/border-border|(?:^|\s)shadow/);
  });
});

describe("the Products view is one column, on the board's frame", () => {
  it.each(["page.tsx", "products/page.tsx", "feed/products-view.tsx", "help-wanted/page.tsx"])("%s draws no margin", (file) => {
    const source = code(file);
    expect(source).not.toContain("<Sidebar");
    expect(source).not.toContain("TWO_COL");
    expect(source).not.toContain("fetchSidebar");
  });

  it.each(["feed/products-view.tsx", "products/[cursor]/page.tsx", "help-wanted/page.tsx"])("%s is the board's page column", (file) => {
    expect(code(file)).toContain("<main className={BOARD_PAGE}>");
  });

  it("leaves a named place for the stage filter (OPR2) beside the list", () => {
    expect(code("feed/products-view.tsx")).toMatch(/<div data-products-body>\s*<ProductList/);
    expect(code("help-wanted/page.tsx")).toContain("<div data-seats-body>");
  });
});

describe("the sort is a pill track of links", () => {
  const control = code("feed/sort-control.tsx");

  it("is a track in the ink's 6%, the current sort on the card colour — never the accent (CL-R8)", () => {
    expect(control).toContain('className="flex shrink-0 gap-[2px] rounded-full bg-foreground/[0.06] p-1 max-sm:hidden"');
    expect(control).toContain('"bg-card font-semibold text-foreground"');
    expect(control).not.toMatch(/endorse/);
  });

  it("on a phone it is a pill beside the title that names the sort and opens the same track", () => {
    expect(control).toContain('<details data-product-sort-menu className="group sm:hidden">');
    expect(control).toContain("aria-label={`Sort: ${PRODUCT_SORT_LABEL[current]}`}");
    // The summary is lifted into the title's row, which is the positioned box.
    expect(control).toMatch(/<summary[\s\S]*?absolute right-0 top-0/);
    expect(code("feed/products-view.tsx")).toContain('<div className="relative" data-products-head>');
  });
});

describe("the search within the list", () => {
  const list = code("feed/product-list.tsx");

  it("narrows the cards the page holds, by name or pitch, as the board does", () => {
    const card = { slug: "ackstack", tagline: "Send policies, collect e-acknowledgments." };
    expect(matchesProductQuery(card, "")).toBe(true);
    expect(matchesProductQuery(card, "  ACK ")).toBe(true);
    expect(matchesProductQuery(card, "policies")).toBe(true);
    expect(matchesProductQuery(card, "meter")).toBe(false);
    expect(matchesProductQuery({ slug: "x", tagline: null }, "pitch")).toBe(false);
    expect(list).toContain("held.filter((card) => matchesProductQuery(card, query))");
    expect(noProductsMatch(" meter ")).toBe("No products match “meter”.");
  });

  it("is a labelled field, 16px so a phone does not zoom, and a plain form to the site's search", () => {
    expect(list).toMatch(/<form\s+role="search"\s+action="\/search"\s+method="get"/);
    expect(list).toContain('<label htmlFor="products-search" className="sr-only">');
    expect(list).toContain('name="q"');
    expect(list).toContain('placeholder="Search products"');
    expect(list).toMatch(/className="min-w-0 flex-1 [^"]*text-\[16px\]/);
  });
});

describe("the lines that count", () => {
  it("the title's line says how many products, and confesses the floor", () => {
    expect(productsCountLine(30)).toBe("30 products");
    expect(productsCountLine(1)).toBe("1 product");
    expect(productsCountLine(3, 2)).toBe("3 products · 2 more below the floor");
    expect(productsCountLine(1200)).toBe("1,200 products");
  });

  it("the foot's line says how many of how many are shown, and only what it knows", () => {
    expect(productsShownLine(12, 30)).toBe("12 of 30 shown");
    expect(productsShownLine(30, 30)).toBe("30 shown");
    expect(productsShownLine(8, null)).toBe("8 shown");
  });
});

describe("the list continues from a link", () => {
  const more = code("feed/product-list.tsx");

  it("keeps the plain link in the server's HTML, and beside a failed read", () => {
    expect(more).toContain("href={cataloguePagePath(cursor)}");
    expect(more).toContain("data-catalogue-next");
    expect(more).toContain("{PRODUCTS_MORE_LABEL}");
    expect(PRODUCTS_MORE_LABEL).toBe("Show more");
    // After a failed read the link is a link again: the next press opens the page.
    expect(more).toContain('if (cursor === null || state === "failed" ||');
    expect(more).toContain('{state === "loading" ? PRODUCTS_MORE_LOADING : PRODUCTS_MORE_FAILED}');
    expect(PRODUCTS_MORE_FAILED.length).toBeGreaterThan(0);
  });

  it("reads when pressed, says so, and draws each product once", () => {
    // Was: an IntersectionObserver read ahead of the end (CL-R7). The board
    // ends the list on *Show more*, so the read is the reader's own press.
    expect(more).not.toContain("IntersectionObserver");
    expect(more).toContain("onClick={readMore}");
    expect(more).toContain('role="status"');
    expect(PRODUCTS_MORE_LOADING).toBe("Loading more products");
    // A listing that moved between two reads is drawn once.
    expect(more).toContain("!seen.has(card.slug)");
    // A modified click opens the page itself.
    expect(more).toContain("event.metaKey || event.ctrlKey || event.shiftKey || event.altKey");
  });

  it("only the default sort continues: the cursor is a position in that order", () => {
    const view = code("feed/products-view.tsx");
    expect(view).toMatch(/if \(sort === DEFAULT_PRODUCT_SORT\) \{[\s\S]*?next: directory\.next,/);
    expect(view).toMatch(/const all = await fetchAllDirectoryProjects\(\);[\s\S]*?next: null,/);
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
