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

import { ASKING_HEADING, ASKING_NOTE, OPEN_TO_PROJECT_LABEL } from "@openproduct/contracts";

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

describe("two sides, and no edge between them (OPC-5)", () => {
  const src = code(DIRECTORY);

  it("shows what is asking, from the catalogue the page reads", () => {
    expect(src).toContain("listingsAsking(cards ?? [])");
    expect(src).toContain("ASKING_HEADING");
  });

  it("reads both sides concurrently, and neither takes the other down", () => {
    // A failed directory read leaves the asking half standing, and the other
    // way round — the treatment the feed gives its own two documents.
    expect(src).toMatch(/Promise\.all\(\[\s*fetchContributorsDirectory\(\),\s*fetchPublicDirectory\(\),?\s*\]\)/);
  });

  it("draws no line between a person and a listing", () => {
    // The obvious reading of "matched" is exactly what OPC-5 exists to
    // prevent: an edge rendered without both sides is a claim about a
    // relationship neither of them made, and a "suggested match" is that claim
    // with a hedge on it.
    expect(src).not.toMatch(/match|suggest|recommend|couldWorkOn|fitFor/i);
  });

  it("says so on the page rather than leaving it to be inferred", () => {
    expect(ASKING_NOTE).toContain("not pairs");
  });

  it("gives the section a heading that promises nothing", () => {
    expect(ASKING_HEADING).toBe("Listings asking for people");
  });

  it("counts what it is about to render", () => {
    // WC-7: the number and the list are ONE ARRAY. The subtitle reads
    // `asking.length` and the section below maps `asking` — there is no second
    // query that could drift from the first and print a count nobody can
    // reconcile against the rows beneath it. Since openproduct-calm CL4 the
    // rows are a preview of the same array (`askingPreview`) and the link
    // beside the count carries the whole of it to the Roles order.
    expect(src).toContain(
      '{asking.length} {asking.length === 1 ? "listing" : "listings"} with a role open',
    );
    expect(src).toContain("{askingPreview(asking).map((listing) => (");
    expect(src).toContain("{askingAllLabel(asking.length)} →");
    expect(src).toContain('href={buildOrderPath("roles")}');
  });

  it("draws nothing when nobody is asking", () => {
    expect(src).toContain("{asking.length > 0 ? (");
  });

  it("sends a reader to the listing's own roles, not to a form", () => {
    // The page's job ends at "these two exist". What happens next happens on
    // the listing, where the maintainers wrote what they want.
    expect(src).toContain("#people-wanted");
  });
});
