// The floor is visible (openproduct-worldclass-v2 HB0, WC2-6): a filtered
// count confesses the filter, with the excluded number and an address.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FEED_FLOOR_HREF, buildsMeta, catalogueBelowFloor, feedCatalogueMeta } from "@openproduct/contracts";

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
    const page = code("page.tsx");
    // OB4 — the list and the withheld count are two reads of one array.
    expect(page).toContain('orderBuilds(cards, "most-active")');
    expect(page).toContain("buildsBelowFloor(cards)");
    expect(page).toContain("belowFloor={belowFloor}");
  });

  it("renders the count through the contract's line and links the arrow to the floor's paragraph", () => {
    // The line is the contract's (`buildsMeta`), drawn by the list.
    expect(code("feed/builds.tsx")).toContain("buildsMeta(order, builds.length, belowFloor, total)");
    expect(buildsMeta("most-active", 3, 2)).toBe("3 builds · most active first · 2 more below the floor");
  });

  it("renders the heading when the catalogue is empty but the floor is holding something", () => {
    // OB4 — the list card always renders, so the line that names the floor
    // is there even when nothing clears it.
    const feed = code("feed/builds.tsx");
    expect(feed).toContain("builds.length > 0 ? (");
    expect(feed).toContain("BUILD_ORDER_EMPTY[order]");
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
