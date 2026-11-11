// XP4's orchestrator: build the website over the fixture, boot it, run the
// lanes, tear everything down. Exit code = the verdict.
//
// Both lanes run against ONE build and ONE server, in one browser session, on
// purpose: they measure the same document, and a second build would let the
// budget lane and the a11y lane disagree about which bytes they were talking
// about.
//
//   node src/run.mjs            both lanes (what CI runs)
//   node src/run.mjs budgets    the budgets only
//   node src/run.mjs wire       QE0's budget on the wire: bytes, requests, hosts
//   node src/run.mjs a11y       the accessibility walk only
//   node src/run.mjs axe        the axe pass, both ramps and both widths
//   node src/run.mjs targets    QE3's 44px floor on every route at phone width
//   node src/run.mjs snapshots  QE4's geometry and colour snapshots (XP4_UPDATE_SNAPSHOTS=1 records)
//   node src/run.mjs walk       the two-width route walk (a report, not a gate)
//   node src/run.mjs refresh    N consecutive router.refresh()/replace() calls must each land

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { serveWebsite } from "./serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// THE BROWSER, in the cheapest order that always works.
//
//   XP4_CHROMIUM        an explicit binary, which is how a sandbox that ships
//                       a pinned Chromium avoids downloading a second copy of
//                       a browser already on its disk
//   already installed   ask Playwright where its own browser is and look
//                       — a download that is a no-op still costs a minute
//   otherwise           fetch it, which is the CI path
async function browserIsUsable() {
  try {
    const b = await chromium.launch({
      ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
    });
    await b.close();
    return true;
  } catch {
    return false;
  }
}

// LAUNCHING IS THE PROBE, not `existsSync(executablePath())`. That path is
// resolved from `PLAYWRIGHT_BROWSERS_PATH`, and turbo runs tasks with a strict
// environment — so under `turbo run test` the variable was absent, the check
// looked in a directory nobody uses, and the lane went off to download a
// browser that was already on the disk. (`turbo.json` beside this file now
// passes that variable through; the probe is what makes it not matter.)
if (!(await browserIsUsable())) {
  const install = spawnSync("pnpm", ["exec", "playwright", "install", "chromium"], {
    cwd: resolve(here, ".."),
    stdio: "inherit",
  });
  if (install.status !== 0 || !(await browserIsUsable())) {
    console.error("web-perf: no usable chromium; set XP4_CHROMIUM to a browser binary");
    process.exit(1);
  }
}

const lane = process.argv[2] ?? "all";
const PORT = Number(process.env.XP4_PORT ?? 3187);

const { base, gateway, stop } = await serveWebsite({ port: PORT });

let code = 0;
try {
  if (lane === "all" || lane === "budgets") {
    const { runBudgets } = await import("./budgets.mjs");
    code = (await runBudgets(base, gateway)) || code;
  }
  // QE0 — the budget on the wire. A GATE beside the budgets rather than
  // inside them: the budgets hold what a regression moves (JS bytes, the
  // document, reads); this holds what a visitor pays (every byte, every
  // request, every host), at both viewports.
  if (lane === "all" || lane === "wire") {
    const { runWire } = await import("./wire.mjs");
    code = (await runWire(base, gateway)) || code;
  }
  if (lane === "all" || lane === "a11y") {
    const { runA11y } = await import("./a11y.mjs");
    code = (await runA11y(base)) || code;
  }
  // FR5 — the axe pass, both ramps, both widths. A GATE, beside the walk
  // above rather than inside it: the two lanes check different things (this
  // one is a hundred rules somebody else wrote; that one is the properties
  // this program decided it cares about), and a failure should say which.
  // QE3 — targets at phone width, as a gate: FR2's 44px floor, measured on
  // every route, with FR2's own exemptions (a word in a sentence, a row that
  // is the target) written down rather than remembered.
  if (lane === "all" || lane === "targets") {
    const { runTargets } = await import("./targets.mjs");
    code = (await runTargets(base)) || code;
  }
  if (lane === "all" || lane === "axe") {
    const { runAxe } = await import("./axe.mjs");
    code = (await runAxe(base)) || code;
  }
  // The flicker lane (session-hint). IN `all` and a GATE, unlike the walk and
  // the pixel report below: its checks are pass/fail facts about what a
  // browser paints, not a table for somebody to read.
  if (lane === "all" || lane === "chrome") {
    const { runChrome } = await import("./chrome.mjs");
    code = (await runChrome(base)) || code;
  }
  // CS4 — the badge under load. A GATE: two hundred requests over fifty
  // badge addresses, and every served SVG must be the locked box with RE4's
  // headers and the same bytes as its repeats. The limiter is not in this
  // loop (the fixture stands in for the gateway) and the lane says so.
  if (lane === "all" || lane === "badge") {
    const { runBadge } = await import("./badge.mjs");
    code = (await runBadge(base)) || code;
  }
  // IN1 — the studio walk, and the first lane here that signs in. A GATE: its
  // checks are facts about what a save does (which step it returns to, which
  // fields it leaves alone), and getting either wrong loses a maintainer's
  // work silently.
  if (lane === "all" || lane === "studio") {
    const { runStudio } = await import("./studio.mjs");
    code = (await runStudio(base)) || code;
  }
  // openproduct-studio OSD8 — what a studio tab click costs, signed in, at a
  // real-shaped round trip. A GATE on the warm cycle; see studio-timing.mjs.
  if (lane === "all" || lane === "studio-timing") {
    const { runStudioTiming } = await import("./studio-timing.mjs");
    code = (await runStudioTiming(base, gateway)) || code;
  }
  // The refresh lane. A GATE: a refresh whose answer arrives and is never
  // drawn leaves a maintainer looking at the listing as it was before their
  // save, and nothing on screen says so. `refresh.mjs` has the cause and why
  // it takes many rounds, not one, to see it.
  if (lane === "all" || lane === "refresh") {
    const { runRefresh } = await import("./refresh.mjs");
    code = (await runRefresh(base, gateway)) || code;
  }
  // QE4 — snapshots of geometry and colour against committed baselines. A
  // GATE: a one-pixel shift on the section bar fails it, by design.
  if (lane === "all" || lane === "authed") {
    const { runAuthed } = await import("./authed.mjs");
    code = (await runAuthed(base)) || code;
  }
  if (lane === "all" || lane === "snapshots") {
    const { runSnapshots } = await import("./snapshots.mjs");
    code = (await runSnapshots(base)) || code;
  }
  if (lane === "walk") {
    const { runWalk } = await import("./walk.mjs");
    code = (await runWalk(base)) || code;
  }
  // OL9 — the pixel lane. A REPORT like the walk, not a gate, and out of
  // `all` for the same reason: its output is a table for a person to read,
  // and a token that moved deliberately is not a build failure.
  if (lane === "pixel") {
    const { runPixel } = await import("./pixel.mjs");
    code = (await runPixel(base)) || code;
  }
} catch (err) {
  console.error("web-perf: the suite crashed:", err);
  code = 1;
} finally {
  await stop();
}

process.exit(code);
