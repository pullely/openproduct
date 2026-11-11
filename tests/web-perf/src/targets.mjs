// Targets at phone width, as a gate (openproduct-worldclass-v2 QE3).
//
// FR2 put a 44px floor on every control a finger meets and measured the
// estate by hand, telling each standalone link that fell under it. What it
// did not leave behind was the measurement as a check: `a11y.mjs` holds the
// SHELL to 24px at desktop width and says why ("the 44px figure belongs to
// the phone width — where the route walk applies it"), and the walk is a
// report. So every surface this epic added shipped unmeasured, and the
// 9 September audit found two targets under 44px on the mobile home; this
// lane, on the same corpus, found a day strip 32px wide, a launch team's
// avatars at 36px and a health checklist's rows at 18px.
//
// THE RULE IS FR2'S, WRITTEN DOWN:
//
//   - a control a finger meets is at least 44 CSS px on its smaller side;
//   - a link INSIDE A SENTENCE is a word, and the sentence is its target
//     (WCAG 2.5.8's own inline exception) — exempt;
//   - a link inside a ROW that is the target (`data-keyrow`, FR4's row) is
//     exempt for the same reason the title of a feed row is: the row is
//     what a finger lands on;
//   - a control clipped out of view until focused (the skip link) is not a
//     target a finger can meet, and is exempt.
//
// Everything else under 44px fails, with its name and size, on the route it
// is on. Nothing here is re-baselined by moving a number: a target that must
// stay small carries its reason in `EXEMPT` below, by route and name.

import { chromium } from "playwright";

import { ROUTES } from "./fixture.mjs";

/** The finger-first floor, at the width fingers use. */
export const TAP_MIN = 44;
const VIEWPORT = { width: 375, height: 812 };

/**
 * What may stay under the floor, by route and accessible name, each with the
 * reason — THE WORK QUEUE, written where the gate reads it. Nothing here is a
 * surface this epic added; each is an older one the first run of this lane
 * measured, listed rather than fixed blind, so the number cannot grow and the
 * next pass knows exactly where to go. A name that stops being small stops
 * matching, and the entry can be deleted.
 */
const EXEMPT = new Map([
  [
    "/product-00",
    new Map([
      ["AL", "the conversation's author avatar (36px), beside the name link that is the equivalent target"],
      ["Upvotes shown after the integrity discount", "PV3's formula sentence in the aside — a sentence-length link at text size"],
      ["Licence", "PV0's observed-frame labels: four formula links in a definition list, at label size"],
      ["Language", "PV0's observed-frame labels"],
      ["Last commit", "PV0's observed-frame labels"],
      ["Open issues", "PV0's observed-frame labels"],
    ]),
  ],
  ["/product-00/forum", new Map([["AL", "the conversation's author avatar, beside the name link"]])],
  [
    "/people/ada",
    new Map([
      ["People", "CG's crumb back to the index, a word on the line above the title"],
    ]),
  ],
  [
    "/people/ada/upvoted",
    new Map([
      ["People", "CG's crumb back to the index, a word on the line above the title"],
      ["@ada", "MP0's link back to the launched tab, a word on the line above the title"],
    ]),
  ],
  [
    "/people/ada/comments",
    new Map([
      ["People", "CG's crumb back to the index, a word on the line above the title"],
      ["@ada", "MP0's link back to the launched tab"],
    ]),
  ],
  // PE1 — the history pages share the person page's crumbs.
  [
    "/people/ada/history",
    new Map([
      ["People", "CG's crumb back to the index, a word on the line above the title"],
      ["@ada", "MP0's link back to the launched tab, a word on the line above the title"],
    ]),
  ],
  [
    "/people/ada/history/2026-05-01T09%3A00%3A00.000Z",
    new Map([
      ["People", "CG's crumb back to the index, a word on the line above the title"],
      ["@ada", "MP0's link back to the launched tab, a word on the line above the title"],
    ]),
  ],
  [
    "/topics/developer-tools",
    new Map([
      ["product-00", "TP0's topic header list of listings, at text size"],
      ["product-04", "TP0's topic header list of listings"],
    ]),
  ],
  ["/launches/2026-05-20", new Map([["Launches", "LC3's crumb back to the board, a word on the line above the title"]])],
  ["/digest/2026-w21", new Map([["Digest", "LC1's crumb back to the archive"]])],
]);

const failures = [];
function check(name, ok, detail) {
  console.log(`[targets] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

/** Runs in the page: every control under the floor that no rule exempts. */
function smallTargets(min) {
  const FOCUSABLE =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    // Clipped out of view (the skip link's `sr-only`): not a target a finger
    // can meet until it is focused, and then it is 44px.
    if (cs.clip === "rect(0px, 0px, 0px, 0px)" || (cs.position === "absolute" && r.width <= 1 && r.height <= 1)) return false;
    return true;
  };
  const name = (el) =>
    (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48);
  // A link is inline when its parent carries other text: the sentence is the
  // target. A `p` holding only this link is a standalone destination.
  const inline = (el) => {
    if (el.tagName !== "A") return false;
    const parent = el.parentElement;
    if (!parent) return false;
    const otherText = [...parent.childNodes]
      .filter((n) => n !== el)
      .map((n) => (n.nodeType === Node.TEXT_NODE ? n.textContent : n.textContent))
      .join("")
      .trim();
    return otherText.length > 0 && !/^(nav|ul|ol|li)$/i.test(parent.tagName) && parent.closest("nav") === null;
  };
  const inRow = (el) => el.closest("[data-keyrow]") !== null;
  // A focusable code block is reachable for the keyboard's sake (PV2's
  // install line is selectable), not a control a finger presses.
  const isText = (el) => /^(code|pre)$/i.test(el.tagName);
  return [...document.querySelectorAll(FOCUSABLE)]
    .filter(visible)
    .filter((el) => !inline(el) && !inRow(el) && !isText(el))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => Math.ceil(Math.min(r.width, r.height)) < min)
    .map(({ el, r }) => `${el.tagName.toLowerCase()}«${name(el)}» ${Math.round(r.width)}×${Math.round(r.height)}`);
}

export async function runTargets(base) {
  console.log(`web-targets: base=${base} floor=${TAP_MIN}px at ${VIEWPORT.width}px`);
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    for (const route of ROUTES) {
      await page.goto(base + route.path, { waitUntil: "load" });
      const html = await page.content();
      if (!html.includes(route.expect)) {
        check(`${route.path}`, false, "did not render the surface — nothing here is about this page");
        continue;
      }
      const small = await page.evaluate(smallTargets, TAP_MIN);
      const exempt = EXEMPT.get(route.path) ?? new Map();
      const failing = small.filter((s) => ![...exempt.keys()].some((n) => s.includes(`«${n}»`)));
      check(
        `${route.path}: every target a finger meets is ≥ ${TAP_MIN}px`,
        failing.length === 0,
        failing.length ? failing.join("; ") : `clean${small.length ? ` (${small.length} exempt by name)` : ""}`,
      );
    }
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(
    failures.length === 0
      ? "web-targets: EVERY TARGET A FINGER MEETS IS 44PX"
      : `web-targets: ${failures.length} FAILED → ${failures.join(" | ")}`,
  );
  return failures.length === 0 ? 0 : 1;
}
