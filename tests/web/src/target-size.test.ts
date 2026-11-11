// Forty-four pixels, where the pointer is a finger (openproduct-worldclass FR2).
//
// The audit's P0·05 ends with *"several links 14–22px tall against the 44px
// minimum"*, and a census over twelve routes at 375px found between eight and
// forty-four targets under it on every one of them.
//
// THE MEASUREMENT LIVES IN A BROWSER AND CANNOT LIVE HERE. Target size is a
// property of the rendered box, and the box depends on the stylesheet, the
// viewport and the font — none of which this lane can see. `tools/target-size
// .mjs` is the pass the milestone's done-when asks for; what THIS file holds
// is the machinery that pass measures, so a regression fails in CI rather
// than the next time somebody remembers to open a phone.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(__dirname, "../../../web");
const CSS = readFileSync(resolve(WEB, "src/styles/globals.css"), "utf-8");
const read = (file: string) => readFileSync(resolve(WEB, "src/app", file), "utf-8");

/** The `@media (max-width: 639.98px)` block that carries FR2's floor. */
const floorBlock = (() => {
  const at = CSS.indexOf("FORTY-FOUR PIXELS");
  if (at === -1) throw new Error("FR2's rule is not in globals.css");
  const open = CSS.indexOf("@media", at);
  let depth = 0;
  for (let i = CSS.indexOf("{", open); i < CSS.length; i += 1) {
    if (CSS[i] === "{") depth += 1;
    else if (CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(open, i + 1);
    }
  }
  throw new Error("FR2's media query is not closed");
})();

describe("one rule, not two hundred class names", () => {
  it("puts the floor on the control elements themselves", () => {
    // This is not a design decision per control — it is a property of the
    // pointer. Every button, summary, select, input and textarea on this site
    // is something a person aims at and presses; none of them is prose. Two
    // hundred call sites would each have to remember the floor, and each be a
    // place to forget it.
    for (const element of ["button", "summary", "select", "textarea", '[role="button"]']) {
      expect(floorBlock).toContain(element);
    }
    expect(floorBlock).toContain('input:not([type="hidden"])');
  });

  it("uses min-height, which is what makes it work without touching a component", () => {
    // An element with `height: 36px` and `min-height: 44px` is used at 44 —
    // min-height clamps height, so every `h-[36px]` in the design survives
    // above `sm` and is lifted below it.
    expect(floorBlock).toMatch(/min-height:\s*44px/);
    expect(floorBlock).toMatch(/min-width:\s*44px/);
  });

  it("applies only where the pointer is a finger", () => {
    expect(floorBlock.startsWith("@media (max-width: 639.98px)")).toBe(true);
  });

  it("does NOT put the floor on every anchor", () => {
    // `a` is the one element that is both a control and a word: a footer's
    // row of destinations and a word in the middle of a sentence are the same
    // tag, and only the call site knows which. Forcing 44px on an inline link
    // would put a 44px line box in the middle of a paragraph — the fix would
    // be worse than the finding, and WCAG 2.5.5 exempts it for that reason.
    expect(floorBlock).not.toMatch(/^\s*a,/m);
    expect(floorBlock).not.toMatch(/^\s*a\s*\{/m);
  });

  it("gives a call site a way to say 'this one is a control'", () => {
    expect(floorBlock).toMatch(/\.tap\s*\{/);
    expect(floorBlock).toMatch(/\.tap-h\s*\{/);
  });
});

describe("the row is the target, not the twenty pixels of its title", () => {
  // A 44px floor on a row title would have made every row 24px taller for a
  // target still smaller than the row it sits in. The title's `::after` is
  // stretched over the whole `<li>` instead, so the 76px row is what a finger
  // presses.
  it.each(["feed/row-shell.tsx", "feed/build-tile.tsx"])("%s stretches the title", (file) => {
    const source = read(file);
    expect(source).toContain("after:absolute after:inset-0");
    // `relative` on the `<li>` is what the stretch is measured against.
    // Attribute-order-agnostic: FR4 put `data-keyrow` in front of it.
    expect(source).toMatch(/<li[^>]*className="relative /);
  });

  it.each(["feed/row-shell.tsx", "feed/build-tile.tsx"])(
    "%s keeps the controls above the stretch",
    (file) => {
      // Without `z-10` the vote box, the comment box and the topic links stop
      // being their own controls and every press on them opens the listing.
      expect(read(file).match(/relative z-10/g)?.length).toBeGreaterThanOrEqual(2);
    },
  );

  it.each(["feed/row-shell.tsx", "feed/build-tile.tsx"])(
    "%s stops linking the tagline to the place the title already goes",
    (file) => {
      // Two links with two different accessible names to one destination, in
      // one row. Once the title covers the row the second is under the
      // stretch and unreachable anyway; a paragraph is what it always was.
      const source = read(file);
      expect(source).toMatch(/tagline \? \(\s*<p className="m-0 mt-\[(?:2|10)px\]/);
      expect(source).not.toMatch(/<AppLink href=\{href\} className="mt-\[2px\]/);
    },
  );
});

describe("the standalone links that had to be told", () => {
  // Each of these was measured under 44px by the pass and is a destination
  // rather than a word in a sentence: a footer's row, a row of formula ids,
  // an avatar, a range pill, a card's title.
  it.each([
    // Five since AG0: the API's own front door joined the four.
    // OB1 — six: Collections left the bar and is linked from here.
    // CL2 — seven: Stacks, the door the front page's margin used to be.
    ["shell/site-footer.tsx", 7],
    // CL2 — the build tile's category link and the strip's formula caption
    // (the margin, which carried seven of these, left the front page).
    ["feed/build-tile.tsx", 1],
    ["feed/builds.tsx", 1],
    // Three since AG0: the route rows are links now, and the one that carries
    // the floor is the anchor inside the table cell.
    // QE3 — five: the two standalone route links under the API section, told.
    // OO4 — seven: the runbook link beside the checks and the changelog.
    // openproduct-calm-pages CP4 — eight: the summary that opens the full
    // list of formulas.
    ["docs/page.tsx", 8],
    ["docs/formulas/page.tsx", 2],
    // OO4 — three: every phase row's "What to do when this is stale →".
    // Redesign — two: the breadcrumb gave way to the docs tab strip, which
    // lives in `docs/docs-nav.tsx` and carries the floor there.
    ["docs/checks/page.tsx", 2],
    ["digest/page.tsx", 2],
  ])("%s carries the floor on %i of them", (file, count) => {
    expect(read(file).match(/\btap(-h)?\b/g)?.length).toBe(count);
  });

  it.each([
    "shell/top-panel.tsx",
    "topics/page.tsx",
    "collections/page.tsx",
    "submit/page.tsx",
    "[slug]/page.tsx",
  ])("%s carries it too", (file) => {
    expect(read(file)).toMatch(/\btap(-h)?\b|max-sm:min-w-\[44px\]/);
  });
});
