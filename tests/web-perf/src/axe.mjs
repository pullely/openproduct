// The axe pass, over every route, in both ramps (openproduct-worldclass FR5).
//
// `a11y.mjs` beside this file walks the estate with hand-written checks: names
// on every control, one `main`, no nested interactives, a visible focus ring,
// the five named surfaces driven by keyboard. Those are the properties this
// program decided it cares about, written down as assertions, and they are not
// what axe does.
//
// WHAT AXE ADDS IS THE PART A HAND-WRITTEN LANE CANNOT HAVE: about a hundred
// rules somebody else thought of. The one that matters most here is
// `color-contrast`, and it is the reason this file exists at all — **FR0
// shipped a whole second colour ramp**, and until now every accessibility
// check in this repository ran in exactly one of them. A dark ramp is a
// hundred and sixty-odd values that no test has ever read a contrast figure
// from.
//
// ─── WHY THE TAGS STOP AT CONFORMANCE ────────────────────────────────────
//
// `best-practice` is excluded, deliberately. Those rules are axe's opinions —
// good ones, mostly — and a GATE that fails on an opinion is a gate people
// learn to route around. What is here is WCAG 2.0/2.1/2.2 A and AA: the set
// this estate has already committed to, and the set somebody can be held to
// without an argument about whether the rule is right.
//
// ─── AND WHY IT RUNS AT TWO WIDTHS ───────────────────────────────────────
//
// `SectionBar` — the phone's bottom navigation — is `sm:hidden`. At 1280 it is
// not in the document, so a desktop-only pass says nothing about it at all.
// The phone width is also where FR2's 44px targets and FR1's shell live, so
// the second pass is not a duplicate: it is a different document.

import { createRequire } from "node:module";
import { chromium } from "playwright";

import { ROUTES } from "./fixture.mjs";
import { newRampContext } from "./ramp.mjs";

const require = createRequire(import.meta.url);
/** axe ships as one file meant to be injected; this is that file's path on
 *  disk. Declared as a dependency of THIS package rather than reached for
 *  through a hoisted transitive copy, which would work until it did not. */
const AXE_PATH = require.resolve("axe-core/axe.min.js");

/** WCAG A and AA, three versions. See the header for what is left out. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * The two ramps and the two widths, named so the output reads.
 *
 * Light is the default a reader gets before touching anything; dark is the
 * ramp a reader who picked Dark gets, selected the same way (`ramp.mjs`).
 */
const RAMPS = [
  { id: "light", colorScheme: "light" },
  { id: "dark", colorScheme: "dark" },
];
const WIDTHS = [
  { id: "desktop", viewport: { width: 1280, height: 900 } },
  { id: "phone", viewport: { width: 375, height: 812 } },
];

const failures = [];
function check(name, ok, detail) {
  console.log(`[axe] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

/** One violation, compressed to the line somebody has to act on. */
function summarise(v) {
  const where = v.nodes
    .slice(0, 3)
    .map((n) => {
      const target = Array.isArray(n.target) ? n.target.join(" ") : String(n.target);
      // `failureSummary` is axe's own sentence about the node; the first line
      // of it carries the measurement (the contrast ratio, the missing name).
      const why = (n.failureSummary ?? "").split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim();
      return `${target}${why ? ` [${why.slice(0, 120)}]` : ""}`;
    })
    .join(" ; ");
  const more = v.nodes.length > 3 ? ` (+${v.nodes.length - 3} more)` : "";
  return `${v.id}×${v.nodes.length}: ${where}${more}`;
}

/**
 * QE2 — THE INSTRUMENT PROVES IT CAN SEE, before it is trusted to say a page
 * is clean. A seeded violation — an image with no name, the rule every axe
 * build ships — is planted in the first route, axe is asked, and the lane
 * fails if it does not report it. A pass over a hundred rules means nothing
 * from a script that was never injected, ran against an empty document, or
 * was pinned to a tag set that no longer selects anything; each of those
 * reports "clean". The seeded node is removed before the real pass.
 */
const SEEDED_RULE = "image-alt";

async function seededViolationIsSeen(page, base, route, tags) {
  await page.goto(base + route.path, { waitUntil: "load" });
  await page.evaluate(() => {
    const img = document.createElement("img");
    img.id = "qe2-seeded-violation";
    img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
    document.body.appendChild(img);
  });
  await page.addScriptTag({ path: AXE_PATH });
  const result = await page.evaluate(
    async (t) =>
      // eslint-disable-next-line no-undef
      await window.axe.run(document, { runOnly: { type: "tag", values: t }, resultTypes: ["violations"] }),
    tags,
  );
  await page.evaluate(() => document.getElementById("qe2-seeded-violation")?.remove());
  return result.violations.some(
    (v) => v.id === SEEDED_RULE && v.nodes.some((n) => String(n.target).includes("qe2-seeded-violation")),
  );
}

export async function runAxe(base) {
  console.log(`web-axe: base=${base} axe=${AXE_PATH.split("/node_modules/").pop()}`);
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });

  try {
    {
      const context = await browser.newContext({ viewport: WIDTHS[0].viewport });
      const page = await context.newPage();
      const seen = await seededViolationIsSeen(page, base, ROUTES[0], TAGS);
      check(
        "the gate can fail: a seeded violation is reported",
        seen,
        seen ? `${SEEDED_RULE} on the seeded node` : `${SEEDED_RULE} NOT reported — the instrument is blind, nothing below is trustworthy`,
      );
      await context.close();
      if (!seen) return 1;
    }
    for (const width of WIDTHS) {
      for (const ramp of RAMPS) {
        const context = await newRampContext(browser, {
          viewport: width.viewport,
          colorScheme: ramp.colorScheme,
        });
        const page = await context.newPage();
        const lane = `${width.id}/${ramp.id}`;

        for (const route of ROUTES) {
          await page.goto(base + route.path, { waitUntil: "load" });

          // The same guard the other two lanes open with: an error page has
          // excellent accessibility and says nothing about the surface.
          const html = await page.content();
          if (!html.includes(route.expect)) {
            check(`${lane} ${route.path}`, false, "did not render the surface — nothing here is about this page");
            continue;
          }

          // A sanity check on the ramp itself, run once per lane rather than
          // per route: a dark pass that silently rendered light would report a
          // clean second ramp having measured the first one twice, which is
          // the failure this whole file exists to make impossible.
          if (route === ROUTES[0]) {
            const painted = await page.evaluate(() => {
              const bg = getComputedStyle(document.body).backgroundColor;
              // BOTH NOTATIONS, and the first draft of this check handled only
              // one. Chromium returns a computed colour in the space it was
              // authored in, and this estate authors in `oklch()` — so the
              // `rgb()` parse that looked obviously right read `oklch(0.985
              // 0.004 80)` as the numbers 0.985, 0.004 and 80, averaged them
              // to 27, and called the LIGHT ramp dark. It then "passed" the
              // dark lane for exactly the same wrong reason. A guard against
              // measuring one ramp twice that could not tell them apart.
              const n = (bg.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
              if (bg.startsWith("oklch")) return { bg, light: n[0] > 0.5 };
              const [r, g, b] = n;
              return { bg, light: (r + g + b) / 3 > 128 };
            });
            check(
              `${lane}: the ramp under test is the ${ramp.id} one`,
              painted.light === (ramp.id === "light"),
              painted.bg,
            );
          }

          await page.addScriptTag({ path: AXE_PATH });
          const result = await page.evaluate(
            async (tags) =>
              // eslint-disable-next-line no-undef
              await window.axe.run(document, {
                runOnly: { type: "tag", values: tags },
                resultTypes: ["violations"],
              }),
            TAGS,
          );

          const violations = result.violations.filter((v) => v.nodes.length > 0);
          check(
            `${lane} ${route.path}`,
            violations.length === 0,
            violations.length ? violations.map(summarise).join(" | ") : `clean (${result.passes?.length ?? "?"} rules passed)`,
          );
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    failures.length === 0
      ? "web-axe: ALL CHECKS PASS"
      : `web-axe: ${failures.length} FAILED → ${failures.slice(0, 12).join(" | ")}`,
  );
  return failures.length === 0 ? 0 : 1;
}
