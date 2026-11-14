// The floor is visible (openproduct-worldclass-v2 HB0, WC2-6): a filtered
// count confesses the filter, with the excluded number and an address.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FEED_FLOOR_HREF, buildsMeta, catalogueBelowFloor, feedCatalogueMeta } from "@openproduct/contracts";
import { productsCountLine } from "@openproduct-web/app/feed/products";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("the front page says how many listings the floor is holding back", () => {
  it("reads both numbers from the one directory array the page already holds (WC-7)", () => {
    // OPR1 — the list and the withheld count are two reads of one array, in
    // the view both `/` and `/products` draw.
    const view = code("feed/products-view.tsx");
    expect(view).toContain("orderBuilds(directory.projects, sort)");
    expect(view).toContain("buildsBelowFloor(directory.projects)");
    expect(view).toContain("orderBuilds(all, sort)");
    expect(view).toContain("buildsBelowFloor(all)");
  });

  it("renders the count through one line, beside the title, with the withheld number in it", () => {
    // Was the contract's `buildsMeta` beside the sort tabs; the board puts
    // the count beside the title, and the line still confesses the floor.
    expect(code("feed/products-view.tsx")).toContain("{productsCountLine(products.count, products.belowFloor)}");
    expect(productsCountLine(3, 2)).toBe("3 products · 2 more below the floor");
    expect(productsCountLine(3, 0)).toBe("3 products");
    // The contract's own line is unchanged for whoever still draws it.
    expect(buildsMeta("most-active", 3, 2)).toBe("3 builds · most active first · 2 more below the floor");
  });

  it("renders the title's line when the catalogue is empty but the floor is holding something", () => {
    // The head always renders once the read succeeds, so the line that names
    // the floor is there even when nothing clears it — over the list's own
    // empty sentence.
    const view = code("feed/products-view.tsx");
    expect(view).not.toMatch(/products\.cards\.length > 0 \?/);
    expect(productsCountLine(0, 4)).toBe("0 products · 4 more below the floor");
    expect(code("feed/product-list.tsx")).toContain("{searching ? noProductsMatch(query) : PRODUCTS_EMPTY}");
  });

  it("the arrow lands on a paragraph that names the floor's fields", () => {
    const docs = code("docs/page.tsx");
    expect(FEED_FLOOR_HREF).toBe("/docs#floor");
    expect(docs).toContain('id="floor"');
    expect(docs).toContain("FLOOR_FIELDS.map(");
  });

  it("the line and the count agree by construction", () => {
    expect(feedCatalogueMeta(1, 4)).toBe("1 product on the front page · 4 more below the floor");
    expect(typeof catalogueBelowFloor).toBe("function");
  });
});
