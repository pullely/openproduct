// A counter and the list beside it (openproduct-worldclass VC2, WC-7).
//
// The audit's finding, on a real profile: **`0 launched` above `MAINTAINS · 2
// listings they run, published`**. Both numbers are correct and each already
// carried its own published sentence behind a `?`. Neither said the other
// existed, so a reader who does not already know that publishing and launching
// are separate acts (LC0) reads a page disagreeing with itself — and a
// directory whose whole pitch is that its numbers are trustworthy cannot
// afford to be read that way for the length of a scroll.
//
// WC-7 asks for two things and this file holds both:
//
//   1. every counter is computed by the SAME QUERY as the list beside it, and
//   2. where two counts legitimately differ, the difference is PUBLISHED at an
//      address and LINKED from the number, never left for the reader to infer.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { launchedVsMaintainsNote } from "@openproduct/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const code = (file: string) =>
  read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the counter comes from the list it sits on", () => {
  // THE PER-PAGE ASSERTION THE DONE-WHEN ASKS FOR, and it is a list on
  // purpose. A generic scan for "a number near a list" is a heuristic, and a
  // heuristic that passes on a page nobody checked is worse than a list
  // somebody has to extend — extending it is the moment to ask the question.
  it.each([
    // page, the expression that produces the number, the array it renders
    // HB0 — the second number is the same array read once more (WC2-6).
    // OB4 — the builds list counts the array it maps.
    ["feed/builds.tsx", "buildsMeta(order, builds.length, belowFloor, total)", "builds.map"],
    ["people/[handle]/page.tsx", "profile.maintains.length", "listings={profile.maintains}"],
    ["collections/[slug]/page.tsx", "visibleCount(", "items.map"],
  ])("%s counts what it renders", (file, counter, list) => {
    const source = code(file);
    expect(source).toContain(counter);
    expect(source).toContain(list);
  });

  it("says so when a bounded list is shorter than its count", () => {
    // A maker's tabs are capped at 50 rows because a public page whose rows
    // grow with a person's whole history gets slower every year for the people
    // who used the product most. Above the cap the counter and the list CANNOT
    // agree, so the page says which rather than letting a reader count the
    // rows and conclude the number is wrong.
    expect(code("people/[handle]/maker-rows.tsx")).toContain("makerTruncationNote");
  });
});

describe("a number that cannot agree says why", () => {
  it("renders the note only when the two counts actually differ", () => {
    // A note explaining a discrepancy that is not on the page is noise at
    // best, and at worst it teaches a reader to expect one.
    expect(launchedVsMaintainsNote(0, 2)).toMatch(/separate acts/);
    expect(launchedVsMaintainsNote(2, 2)).toBeNull();
  });

  it("has nothing left to reconcile on a maker page since OB6", () => {
    // VC2's note sat under `Maintains`, reconciling the header's `launched`
    // with the listings below it. OB6 merged the two into one Builds list,
    // and the header's first count, the tab's count and the list now read the
    // same array — so the page renders no note, because no two numbers differ.
    const page = code("people/[handle]/page.tsx");
    const view = code("people/[handle]/maker-view.tsx");
    expect(page).not.toContain("launchedVsMaintainsNote(");
    expect(page).toContain("<ListingRows listings={profile.maintains} />");
    expect(view).toContain("value={person.maintains.length}");
    expect(view).toContain("builds={person.maintains.length}");
  });
});

describe("a counter cannot ship without its published sentence", () => {
  it("requires the formula rather than accepting one", () => {
    // WHILE IT WAS OPTIONAL a counter could ship with no address behind it —
    // not because anybody wanted that, but because nothing stopped it. All six
    // call sites already passed one, so making it required cost nothing and
    // closed the hole permanently: the compiler now enforces what a test could
    // only notice.
    // SCOPED TO `StatInline`. `StatCard` keeps an optional formula on purpose
    // and says why: "not every card is derived — a card showing a fact
    // somebody TYPED has no formula, and giving it one would send a reader to
    // a rule that did not produce it". That is the same principle, applied to
    // a different question, and this assertion must not flatten the two.
    const bits = read("ui/bits.tsx");
    const inline = bits.slice(bits.indexOf("export function StatInline"));
    expect(inline).toMatch(/formula: FormulaId;/);
    expect(inline).not.toMatch(/formula\?: FormulaId;/);
  });

  it("still renders the `?` for a keyboard and a screen reader", () => {
    // The design draws no `?`, and a number without a route to its definition
    // is a number a reader has to trust. `sr-only` until focused is how both
    // are true at once (OPC-4, I7).
    const bits = read("ui/bits.tsx");
    expect(bits).toMatch(/aria-label=\{`How "\$\{label\}" is computed`\}/);
    expect(bits).toContain("sr-only ml-1");
  });

  it("is used with a formula everywhere it is used at all", () => {
    // Belt and braces against the day somebody widens the type again: the
    // call sites are checked directly rather than only through the compiler.
    const uses: string[] = [];
    let seen = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(APP, dir))) {
        const rel = dir ? `${dir}/${entry}` : entry;
        if (statSync(resolve(APP, rel)).isDirectory()) walk(rel);
        else if (entry.endsWith(".tsx")) {
          for (const m of read(rel).matchAll(/<StatInline\b[\s\S]*?\/>/g)) {
            seen += 1;
            if (!m[0].includes("formula=")) uses.push(`${rel}: ${m[0].slice(0, 60)}`);
          }
        }
      }
    };
    walk("");
    expect(uses).toEqual([]);
    // …and the walk found some, so an empty list is a pass rather than a
    // directory that moved.
    expect(seen).toBeGreaterThan(3);
  });
});
