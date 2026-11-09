// Snapshots, diffed in CI (openproduct-worldclass-v2 QE4).
//
// GEOMETRY AND COLOUR, NOT PIXELS. A screenshot diff is the obvious shape for
// "a one-pixel shift on the section bar fails the lane", and it is the shape
// that fails for reasons nobody can fix: font hinting differs between the
// runner that recorded the baseline and the one comparing against it, an
// antialiased edge moves under a different GPU, and the lane goes red on a
// Tuesday for a page nobody touched. The pixel lane beside this one already
// decided that a token which moved deliberately is a question for a person,
// not a build failure — and a screenshot cannot tell the two apart.
//
// So this records what a screenshot is a picture OF: the boxes of the named
// elements the shell and the page are made from — the top panel, the section
// bar, the page's title, the first row, the main column, the footer's theme
// control — rounded to the CSS pixel, and the computed colours of the ground
// and the chrome. Those are properties of the layout the browser computed
// from our own stylesheet and our own self-hosted fonts, in a Chromium whose
// version Playwright pins, and they are the same on every machine that runs
// this. A one-pixel shift on the section bar changes its box and fails the
// lane, which is the done-when, literally. A bumped token changes a colour
// and fails the lane too, with the token's name in the line.
//
// THE BASELINES ARE COMMITTED, one JSON file per route, viewport and ramp,
// under `snapshots/`. A deliberate change re-records them with
// `XP4_UPDATE_SNAPSHOTS=1` and the diff of those files is the review: a
// reviewer reads "the section bar's top moved from 756 to 812" rather than
// squinting at two PNGs. Baselines that are missing fail the lane rather
// than being recorded silently — the first run of a new route is a decision.
//
// WHAT IS NOT RECORDED, ON PURPOSE. Nothing whose value depends on content
// height or on the clock: the footer's `top` (it follows the page's length),
// a row's text (a relative time rots), the document's scroll height. Those
// would fail the lane on a quiet week for the fixture's calendar moving, and
// a lane that fails on the calendar teaches people to re-record without
// reading.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { SAMPLE_DAY, SAMPLE_HANDLE, SAMPLE_SLUG, SAMPLE_TOPIC } from "./fixture.mjs";
import { newRampContext } from "./ramp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(here, "../snapshots");

/** The eight routes this epic touched, per the plan. */
export const ROUTES = [
  { key: "home", path: "/" },
  { key: "listing", path: `/${SAMPLE_SLUG}` },
  // OB7 (#1875) — the leaderboard is the Upvoted order now.
  { key: "upvoted", path: "/builds/upvoted" },
  { key: "topic", path: `/topics/${SAMPLE_TOPIC}` },
  { key: "maker", path: `/people/${SAMPLE_HANDLE}` },
  { key: "day", path: `/launches/${SAMPLE_DAY}` },
  { key: "forum", path: "/threads" },
  { key: "listing-forum", path: `/${SAMPLE_SLUG}/forum` },
];

const VIEWPORTS = [
  { id: "desktop", viewport: { width: 1280, height: 900 } },
  { id: "phone", viewport: { width: 375, height: 812 } },
];
const RAMPS = [
  { id: "light", colorScheme: "light" },
  { id: "dark", colorScheme: "dark" },
];

const failures = [];
function check(name, ok, detail) {
  console.log(`[snapshot] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

/** Runs in the page. Boxes to the CSS pixel; colours as the browser computed them. */
function record() {
  // An element the stylesheet hides at this width (the section bar above
  // `sm`) is not part of this layout: null, not a zero box.
  const shown = (el) => el && getComputedStyle(el).display !== "none";
  const box = (el, keys) => {
    if (!shown(el)) return null;
    const r = el.getBoundingClientRect();
    const all = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
    return Object.fromEntries(keys.map((k) => [k, all[k]]));
  };
  const colour = (el, prop) => (shown(el) ? getComputedStyle(el)[prop] : null);
  const header = document.querySelector("header");
  const sectionBar = [...document.querySelectorAll("nav")].find((n) => getComputedStyle(n).position === "fixed") ?? null;
  const main = document.querySelector("main");
  const h1 = document.querySelector("h1");
  const row = document.querySelector("[data-keyrow]");
  const footer = document.querySelector("footer");
  const theme = footer ? footer.querySelector("button") : null;
  const FULL = ["top", "left", "width", "height"];
  const SIZE = ["left", "width", "height"];
  return {
    header: box(header, FULL),
    sectionBar: box(sectionBar, FULL),
    main: box(main, ["top", "left", "width"]),
    h1: box(h1, FULL),
    firstRow: box(row, SIZE),
    footer: box(footer, SIZE),
    themeControl: box(theme, ["width", "height"]),
    colours: {
      body: colour(document.body, "backgroundColor"),
      text: colour(document.body, "color"),
      header: colour(header, "backgroundColor"),
      h1: colour(h1, "color"),
    },
  };
}

function diff(expected, actual, path = "") {
  const out = [];
  const keys = new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})]);
  for (const key of keys) {
    const a = expected?.[key];
    const b = actual?.[key];
    const at = path ? `${path}.${key}` : key;
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object") out.push(...diff(a, b, at));
    else if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${at}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  }
  return out;
}

export async function runSnapshots(base) {
  const update = process.env.XP4_UPDATE_SNAPSHOTS === "1";
  console.log(`web-snapshots: base=${base} baselines=${DIR}${update ? " (RECORDING)" : ""}`);
  mkdirSync(DIR, { recursive: true });
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });
  try {
    for (const width of VIEWPORTS) {
      for (const ramp of RAMPS) {
        const context = await newRampContext(browser, { viewport: width.viewport, colorScheme: ramp.colorScheme });
        const page = await context.newPage();
        for (const route of ROUTES) {
          await page.goto(base + route.path, { waitUntil: "load" });
          // Fonts and hydration have landed by now; a fixed wait rather than
          // a heuristic, for the reason the budget lane gives.
          await page.waitForTimeout(600);
          const actual = await page.evaluate(record);
          const file = resolve(DIR, `${route.key}.${width.id}.${ramp.id}.json`);
          const name = `${route.path} @ ${width.id}/${ramp.id}`;
          if (update) {
            writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
            check(name, true, "recorded");
            continue;
          }
          if (!existsSync(file)) {
            check(name, false, `no baseline at ${file.split("/web-perf/").pop()} — record one with XP4_UPDATE_SNAPSHOTS=1 and commit it`);
            continue;
          }
          const expected = JSON.parse(readFileSync(file, "utf-8"));
          const changes = diff(expected, actual);
          check(name, changes.length === 0, changes.length ? changes.join("; ") : "matches the baseline");
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(
    failures.length === 0
      ? "web-snapshots: EVERY SNAPSHOT MATCHES ITS BASELINE"
      : `web-snapshots: ${failures.length} FAILED → ${failures.join(" | ")}`,
  );
  return failures.length === 0 ? 0 : 1;
}
