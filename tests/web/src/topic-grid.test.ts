// The topic page's comparison grid (openproduct-worldclass AG2).
//
// The columns and the cells are pinned in `packages/contracts`. What is pinned
// here is what the PAGE owes them:
//
//   - the grid and the list are two views of ONE array (WC-7)
//   - every column carries its provenance class, and the class links to where
//     it is explained
//   - the product's name is the row's IDENTITY, not a column with a class
//   - the scroller takes no tab stop, because every row opens with a link

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PROVENANCE_HREF, TOPIC_GRID_COLUMNS } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PAGE = "topics/[topic]/page.tsx";

describe("the grid and the list are two views of one array (WC-7)", () => {
  it("renders both from `doc.entries`, and reads nothing else", () => {
    // A grid built from a second read could hold different products, or a
    // different number of them, from the list directly above it.
    const src = code(PAGE);
    expect(src.match(/doc\.entries\.map\(/g)?.length).toBe(3);
    expect(src).not.toMatch(/fetchTopicGrid|fetchCompare/);
    // HB4 added a directory read to the PAGE for the section under the grid;
    // the grid itself still reads nothing but `doc.entries`. The section is
    // bounded by its own `aria-labelledby`, so the check is on that span.
    const grid = src.slice(src.indexOf('aria-labelledby="compare"'), src.indexOf("{directory !== null"));
    expect(grid.length).toBeGreaterThan(0);
    expect(grid).not.toMatch(/directory|cards\b/);
  });

  it("counts the rows it is about to render, and nothing else", () => {
    expect(code(PAGE)).toContain("doc.entries.length");
  });

  it("draws no grid when there is nothing to compare", () => {
    // A table with a header and no rows is furniture claiming to be content —
    // the same rule the sidebar's panels follow.
    expect(code(PAGE)).toContain("{doc.entries.length > 0 ? (");
  });
});

describe("every column says which class it is, and where that is explained", () => {
  const src = code(PAGE);

  it("renders the class from the column, never typed on the page", () => {
    expect(src).toContain("{column.provenance}");
    for (const column of TOPIC_GRID_COLUMNS) {
      // Neither the label nor the class is retyped here.
      expect([column.id, src.includes(`"${column.label}"`)]).toEqual([column.id, false]);
    }
  });

  it("links the class to the section that defines it", () => {
    expect(src).toContain("href={PROVENANCE_HREF}");
    expect(PROVENANCE_HREF).toBe("/docs#provenance");
  });

  it("and that section actually has that address", () => {
    // AG0's finding at the scale of a section: an explanation nothing can link
    // to is an explanation nobody reaches.
    expect(code("docs/page.tsx")).toContain('id="provenance"');
  });

  it("carries the field's own sentence, not just the class name", () => {
    expect(src).toContain("title={column.note}");
  });
});

describe("the product is the row's identity, not a column", () => {
  const src = code(PAGE);

  it("renders it as a row header", () => {
    expect(src).toContain('<th scope="row"');
  });

  it("gives it no provenance label", () => {
    // Wrapping an identifier in provenance would say something false — that
    // somebody observed or computed which listing this is. `CatalogCard`
    // leaves `slug` unwrapped for the same reason.
    const rowHeader = src.slice(src.indexOf('<th scope="row"'), src.indexOf("</th>", src.indexOf('<th scope="row"')));
    expect(rowHeader).not.toContain("provenance");
  });

  it("is a link, so the grid is a way in rather than a dead end", () => {
    expect(src).toContain("href={`/${entry.slug}`}");
  });
});

describe("the scroller takes no tab stop, because its rows are links", () => {
  it("is a named region with no tabIndex", () => {
    // The rule AG1 pinned one milestone earlier, applied the first time it
    // came up again: a scroll region takes a tab stop only while nothing
    // inside it has one. Every row here opens with a link.
    const src = code(PAGE);
    const region = src.slice(src.indexOf('role="region"'));
    const untilTable = region.slice(0, region.indexOf("<table"));
    expect(untilTable).toContain("aria-label={TOPIC_GRID_HEADING}");
    expect(untilTable).not.toContain("tabIndex");
  });
});
