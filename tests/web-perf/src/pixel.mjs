// The pixel lane (openproduct-launch OL9).
//
// ─── WHAT OL9 ASKED FOR, AND WHAT THE ARCHIVE CAN ACTUALLY ANSWER ────────
//
// OL9's first bullet asks for "a lane that loads the archived prototype and
// the built site at the same viewport and compares computed geometry and
// colour for a named element list per view".
//
// THE ARCHIVED PROTOTYPE CANNOT BE LOADED. `Openproduct_Launch.dc.html` is a
// self-unpacking bundle whose boot script fetches React from unpkg at runtime:
//
//   [dc] failed to load React or boot:
//   Error: failed to load https://unpkg.com/react@18.3.1/umd/react.production.min.js
//
// Without it the framework never boots — templates stay as literal
// `{{ authTitle }}`, no custom property resolves, and the document renders in
// Times New Roman. Measured, not assumed: the probe is in the milestone's
// write-up. Chromium is blocked from that CDN in this sandbox and in CI, and
// the fix would be vendoring React into the repository purely to boot an
// archive — a dependency added to run a lane rather than to ship a product.
//
// AND EVEN BOOTED IT WOULD NOT ANSWER THE QUESTION. The prototype carries its
// own invented data and the built site carries the fixture's. Comparing
// geometry between them would compare how many products each has, and the lane
// would be red for a reason nobody could fix.
//
// ─── SO THIS COMPARES THE DESIGN SYSTEM, WHICH IS THE PART THAT TRANSFERS ─
//
// The prototype's tokens are STATIC — a `[data-accent]` block of custom
// properties in the archived HTML, readable with no browser, no React and no
// network. The built site's are COMPUTED, read from a real page in a real
// browser, which is stronger than parsing our own stylesheet: it resolves
// whatever actually applies, including an override somewhere else.
//
// Between them sits a NAMED MAPPING, and that mapping is OL-9's decision made
// checkable. OL-9 says: "the tokens change in place; the token *names* do not.
// Renaming them to the prototype's `--fg` / `--muted` / `--border` would be a
// rename across forty files that buys nothing. The values move; the names
// stay."
//
// So a lane that compared names would fail on a decision that was made on
// purpose, and a lane that compared nothing would catch the drift that
// matters. This compares VALUES ACROSS THE RENAME — which is exactly the
// invariant OL-9 states and nothing else was checking.
//
// A REPORT, NOT A GATE, like the close-out walk beside it. It exits 0 unless
// it crashes. The numbers it prints are the design's own, and a mismatch is a
// question for a person rather than a build failure: a token may have moved
// deliberately, and the lane cannot know which.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "playwright";

/**
 * The archive, read as text — never executed. It is the launch design's
 * artboard (openproduct-launch OL-9), committed in sourceplane/orun-cloud at
 * `specs/epics/openproduct-launch/design/Openproduct_Launch.artboard.html`,
 * and it did not come along at the repository cut (openproduct-standalone
 * OPN1): this repository reads nothing above its own root. Point
 * OPENPRODUCT_LAUNCH_ARTBOARD at a copy to run the lane; without one it says
 * so and compares nothing, which is what a report-only lane may do.
 */
const ARTBOARD = process.env.OPENPRODUCT_LAUNCH_ARTBOARD
  ? resolve(process.env.OPENPRODUCT_LAUNCH_ARTBOARD)
  : null;

/**
 * THE MAPPING, AND IT IS THE WHOLE ARGUMENT.
 *
 * Left: the prototype's name. Right: ours. Where they differ, OL-9 said so and
 * said why — `--fg` is `--foreground` because forty files already read the
 * longer name.
 *
 * A token in neither list is a token nobody is holding to the design, so the
 * lane prints what it did not compare rather than quietly covering a subset.
 */
const TOKENS = [
  // Where the names differ, our own stylesheet says which is which — the
  // crosswalk below is read off the comments in `globals.css`, not guessed:
  // "the active nav pill — the design's --chip", "nav hover — the design's
  // --hover", "Primary is Northwind ink".
  ["--bg", "--background"],
  ["--card", "--card"],
  ["--fg", "--foreground"],
  ["--copy", "--copy"],
  ["--muted", "--muted-foreground"],
  ["--faint", "--faint"],
  ["--border", "--border"],
  ["--line", "--line"],
  ["--hover", "--accent"],
  ["--chip", "--secondary"],
  ["--ink", "--primary"],
  ["--ink-fg", "--primary-foreground"],
  ["--success", "--success"],
  ["--success-soft", "--success-soft"],
];

/** The three faces OL-9 replaced the system stack with, and where each is
 *  supposed to speak. Compared as COMPUTED font-family on a real element,
 *  because a variable that is declared and never applied is the failure this
 *  catches. */
const FACES = [
  { role: "body", selector: "body", expect: "Geist" },
  { role: "display", selector: "h1", expect: "Newsreader" },
];

/** `oklch(0.985 0.004 80)` and `0.985 0.004 80` are the same colour written
 *  two ways: the prototype wraps, and our tokens are bare triples wrapped at
 *  use. Compare the numbers. */
function triple(value) {
  // The design writes two colours as hex (`#fff`) where ours are oklch
  // triples. Both mean white; normalise rather than report a false mismatch
  // on a notation the archive happened to use.
  const hex = value.trim().toLowerCase();
  if (hex === "#fff" || hex === "#ffffff") return [1, 0, 0];
  if (hex === "#000" || hex === "#000000") return [0, 0, 0];
  const inner = /oklch\(([^)]*)\)/i.exec(value)?.[1] ?? value;
  const parts = inner
    .replace(/\//g, " ")
    .trim()
    .split(/\s+/)
    .map((n) => Number.parseFloat(n))
    .filter((n) => Number.isFinite(n));
  return parts.slice(0, 3);
}

function sameColour(a, b) {
  const [x, y] = [triple(a), triple(b)];
  if (x.length !== 3 || y.length !== 3) return false;
  // Tolerance is for the decimal a designer typed, not for drift: 0.0005 is
  // finer than any change anybody would make on purpose.
  return x.every((n, i) => Math.abs(n - y[i]) < 0.0005);
}

/** The design's tokens, parsed out of the archive. */
function designTokens() {
  if (ARTBOARD === null || !existsSync(ARTBOARD)) return null;
  const raw = readFileSync(ARTBOARD, "utf-8");
  // The prototype hangs its palette on `[data-accent]` rather than `:root`,
  // because the accent is swappable (OL-9 ships it as one build-time value).
  const start = raw.indexOf("[data-accent] {");
  if (start === -1) return null;
  const block = raw.slice(start, raw.indexOf("}", start));
  const out = new Map();
  for (const [, name, value] of block.matchAll(/(--[a-z-]+)\s*:\s*([^;]+);/g)) {
    if (!out.has(name)) out.set(name, value.trim());
  }
  return out;
}

export async function runPixel(base) {
  const design = designTokens();
  if (design === null) {
    console.log(
      ARTBOARD === null
        ? "pixel: OPENPRODUCT_LAUNCH_ARTBOARD is not set — the archived design is not in this repository, nothing compared"
        : "pixel: the archived design's token block could not be read — nothing compared",
    );
    return;
  }

  console.log(`pixel: base=${base} — design tokens read from the archive (${design.size} found)`);

  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });
  const rows = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    // ONE ROUTE IS ENOUGH FOR TOKENS, and pretending otherwise would be
    // theatre: the palette is declared once in the layout, so reading it on
    // twenty pages would be reading the same declaration twenty times. The
    // per-route work this lane's neighbours do is about CONTENT; this is about
    // the system behind all of it.
    await page.goto(`${base}/`, { waitUntil: "load" });

    const built = await page.evaluate((names) => {
      const cs = getComputedStyle(document.documentElement);
      const out = {};
      for (const name of names) out[name] = cs.getPropertyValue(name).trim();
      return out;
    }, TOKENS.map(([, ours]) => ours));

    for (const [theirs, ours] of TOKENS) {
      const want = design.get(theirs);
      const got = built[ours];
      if (!want) {
        rows.push([theirs, ours, "—", got || "(unset)", "NOT IN THE ARCHIVE"]);
        continue;
      }
      if (!got) {
        rows.push([theirs, ours, want, "(unset)", "NOT ON THE PAGE"]);
        continue;
      }
      rows.push([theirs, ours, want, got, sameColour(want, got) ? "match" : "DIFFERS"]);
    }

    const faces = await page.evaluate((list) => {
      return list.map(({ role, selector, expect }) => {
        const el = document.querySelector(selector);
        return {
          role,
          expect,
          got: el ? getComputedStyle(el).fontFamily : "(no element)",
        };
      });
    }, FACES);

    console.log("");
    console.log("| design | ours | design value | built value | |");
    console.log("|---|---|---|---|---|");
    for (const [theirs, ours, want, got, verdict] of rows) {
      console.log(`| \`${theirs}\` | \`${ours}\` | ${want} | ${got} | ${verdict} |`);
    }

    console.log("");
    console.log("| role | expected face | computed |");
    console.log("|---|---|---|");
    for (const f of faces) {
      const ok = f.got.includes(f.expect);
      console.log(`| ${f.role} | ${f.expect} | ${f.got} ${ok ? "" : "— DIFFERS"} |`);
    }

    // WHAT WAS NOT COMPARED, printed on purpose. A lane that only reports what
    // it checked lets a reader assume it checked everything.
    const compared = new Set(TOKENS.map(([theirs]) => theirs));
    const skipped = [...design.keys()].filter((k) => !compared.has(k));
    console.log("");
    console.log(
      `pixel: ${rows.filter((r) => r[4] === "match").length}/${rows.length} tokens match; ` +
        `${skipped.length} in the archive not mapped here (${skipped.join(", ")})`,
    );
    console.log(
      "pixel: the archived prototype is NOT rendered — its bundle fetches React from unpkg at " +
        "boot and that CDN is unreachable here and in CI. See the milestone write-up.",
    );
  } finally {
    await browser.close();
  }
}
