// AG3 — open to one more project, in the web layer (openproduct-worldclass).
//
// Two thirds of AG3 was already shipping. What is pinned here is the third —
// the two sides on one page with no edge between them — and the defect that
// finding it turned up: the pill was written out as a string literal on each
// surface that draws it, so the same tick was described twice, independently,
// and neither copy said whose claim it was.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { OPEN_TO_PROJECT_LABEL } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MAKER_HEADER = "people/[handle]/maker-view.tsx";
const MAKER = "people/[handle]/page.tsx";
const DIRECTORY = "people/(index)/page.tsx";
const LIST = "people/people-list.tsx";

describe("one tick, described once (OPC-2)", () => {
  it("renders the pill in the header, where the design puts it", () => {
    // Beside the counters, in `MakerView` — one component behind all three of
    // a maker's tabs, so the pill cannot appear on `/@ada` and vanish on
    // `/@ada/comments`.
    const src = code(MAKER_HEADER);
    expect(src).toContain("person.openToProject ? (");
    expect(src).toContain("<OpenPill");
  });

  it("draws nothing when they have not ticked it", () => {
    // Nobody is advertised as looking for work without having said so.
    expect(code(MAKER_HEADER)).toMatch(/person\.openToProject \? \([\s\S]{0,400}\) : null/);
  });

  it("does not say it twice on one page", () => {
    // The first draft of this milestone added a second pill further down
    // `page.tsx`, on the theory that the maker's page did not have one. It
    // did — in the header that page renders. Two pills for one tick is the
    // drift this milestone closes, wearing a fix.
    expect(code(MAKER)).not.toContain("OpenPill");
  });

  it("takes the words from the contract on every surface that draws it", () => {
    // A literal in one file is how the two came apart in the first place.
    for (const file of [MAKER_HEADER, LIST]) {
      expect([file, code(file).includes("OPEN_TO_PROJECT_LABEL")]).toEqual([file, true]);
      expect([file, code(file).includes(`"${OPEN_TO_PROJECT_LABEL}"`)]).toEqual([file, false]);
    }
  });

  it("carries whose claim it is, on every one of them", () => {
    // OPC-2: the pill says somebody is open; the sentence says they ticked it
    // themselves and that nothing observes availability. Before AG3 neither
    // copy carried it, so the page asserted a fact about a person where a
    // person had stated one about themselves.
    for (const file of [MAKER_HEADER, LIST]) {
      expect([file, code(file).includes("OPEN_TO_PROJECT_NOTE")]).toEqual([file, true]);
    }
  });
});

// openproduct-left-rail LR6: the owner asked for a calmer People page, and the
// "Listings asking for people" section left it — the builds asking for people
// are the Help wanted section, in the rail on every page. OPC-5's rule still
// holds, and holds more simply: the page draws one side only.
describe("the People page is people only (LR6; OPC-5)", () => {
  const src = code(DIRECTORY);

  it("draws no asking section and no count of one", () => {
    expect(src).not.toMatch(/listingsAsking|askingPreview|ASKING_HEADING|asking\.length/);
    expect(src).not.toContain("#people-wanted");
    expect(src).not.toContain("with a role open");
  });

  it("still reads the catalogue beside the directory, for the topic filter", () => {
    expect(src).toMatch(/Promise\.all\(\[\s*fetchContributorsDirectory\(\),\s*fetchPublicDirectory\(\),?\s*\]\)/);
    expect(src).toContain("(cards ?? []).map((card) => [card.slug, card.category])");
  });

  it("draws no line between a person and a listing", () => {
    expect(src).not.toMatch(/match|suggest|recommend|couldWorkOn|fitFor/i);
  });

  it("says the count to a screen reader only", () => {
    // The line that read "1 person · 0 open to one more project" is not
    // drawn; a filter's effect is still announced.
    expect(code(LIST)).toMatch(/<p className="sr-only" aria-live="polite">\s*\{peopleCountLine\(visible\.length, openCount, state\)\}/);
  });
});
