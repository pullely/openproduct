// IN0 — the live preview, in the web layer (openproduct-worldclass).
//
// The milestone's done-when is two clauses: typing updates the preview, and
// the preview is the same component the feed renders. The first is a browser's
// to check and the epic's entry records it. What is pinned here is the second,
// and the thing that made it hard: the feed's row ACTS, and a preview of a
// listing that does not exist must not.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const SUBMIT = "submit/page.tsx";
const PREVIEW = "submit/preview-row.tsx";
const SHELL = "feed/row-shell.tsx";
const FEED_ROW = "feed/feed-row.tsx";

describe("the preview is the row, not a drawing of it", () => {
  it("renders the same shell the feed renders", () => {
    // The done-when in one assertion. Both reach `RowShell`; neither has a
    // row of its own.
    expect(code(PREVIEW)).toContain('from "../feed/row-shell"');
    expect(code(FEED_ROW)).toContain('from "./row-shell"');
  });

  it("keeps the row's geometry in exactly one file", () => {
    // The `<li>`, the tile, the name, the badges, the tagline and the meta
    // line exist once. A second `data-keyrow` would be a second row.
    for (const file of [PREVIEW, SUBMIT, FEED_ROW]) {
      expect([file, code(file).includes("data-keyrow")]).toEqual([file, false]);
    }
    expect(code(SHELL)).toContain("data-keyrow");
  });

  it("takes its whole entry from the contract", () => {
    // `previewEntry` produces a complete FeedEntry, so this page decides
    // nothing about how a listing looks — including what is absent from it.
    expect(code(SUBMIT)).toContain("previewEntry(draft, now)");
  });
});

describe("nothing in a preview acts (IN0)", () => {
  it("never reaches the module that imports the two boxes", () => {
    // THE LOAD-BEARING ASSERTION. `feed-row.tsx` imports `VoteBox` and
    // `CommentBox` at module scope, so importing it from here would put them
    // in this page's bundle whether or not they were mounted — and one edit
    // away from being mounted.
    for (const file of [PREVIEW, SUBMIT]) {
      expect([file, code(file).includes("feed-row")]).toEqual([file, false]);
      expect([file, code(file).includes("VoteBox")]).toEqual([file, false]);
      expect([file, code(file).includes("CommentBox")]).toEqual([file, false]);
    }
  });

  it("passes the boxes as a slot, so the shell cannot choose them itself", () => {
    // A slot rather than a `preview` flag. A flag is one inverted condition
    // away from mounting a live vote box on a draft; a slot can only render
    // what its caller passed.
    expect(code(SHELL)).toContain("boxes: ReactNode");
    expect(code(SHELL)).toContain("{boxes}");
    expect(code(SHELL)).not.toContain("preview");
  });

  it("makes the row inert, because every link in it is a 404", () => {
    // The tile, the name and the topics all address a listing that does not
    // exist. `inert` is on the row and NOT on the section, so the heading
    // stays in the accessibility tree.
    const src = code(SUBMIT);
    expect(src).toMatch(/<ul\s+inert/);
    expect(src).toContain('aria-labelledby="preview-heading"');
    // The explanatory preview notes (address/absent) were cut from the page.
  });

  it("says what it cannot know rather than inventing it", () => {
    // The address is the console's to assign; the page invents no slug.
    // The explanatory preview notes (address/absent) were cut from the page.
    const src = code(SUBMIT);
    expect(src).not.toMatch(/slugify|toSlug|replace\(\/\\s\+\/g, "-"\)/);
  });

  it("holds its clock still", () => {
    // `useState(() => new Date())`, not `new Date()` per render: a preview
    // whose entry is a new object on every keystroke re-renders the row for
    // a field it does not draw.
    expect(code(SUBMIT)).toContain("React.useState(() => new Date())");
  });
});

describe("the feed did not change", () => {
  it("still passes its two live boxes", () => {
    const src = code(FEED_ROW);
    expect(src).toContain("<CommentBox slug={entry.slug}");
    expect(src).toContain("<VoteBox");
    expect(src).toContain("returnTo={returnTo}");
  });

  it("still exports the tag glyph", () => {
    // Surfaces that draw a launch's tag line import it from `feed-row`; the
    // split must not move its address out from under a file that did not
    // change.
    expect(code(FEED_ROW)).toContain('export { TagGlyph } from "./row-shell"');
    expect(code("feed/row-shell.tsx")).toContain("export function TagGlyph");
  });
});
