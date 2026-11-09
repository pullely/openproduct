// openproduct-studio OSD8 — the studio, timed (signed in, in a real browser).
//
// The studio walk (`studio.mjs`) proves what a save DOES. This proves what a
// tab click COSTS, which is the complaint that opened the epic: "slow in tab
// switching". Three numbers per switch, over two cycles of every tab:
//
//   feedback  click → the strip marks the new tab (the persistent layout
//             answers at once; before OSD5 nothing moved until every read
//             was back)
//   content   click → the step's own card is on screen
//   reads     gateway requests the switch caused — deterministic, and the
//             number that catches a structural regression a fast laptop hides
//
// THE LATENCY IS REAL-SHAPED. The fixture answers in microseconds; production
// answers across an ocean. The lane asks the fixture for a fixed delay in
// front of every read (`/__fixture/latency`, off by default, so no other lane
// is affected) — 45ms, the upstream round trip OPP0's probe uses — and turns
// it off again when it is done.
//
// The budgets hold the SECOND cycle (warm: the chunks are loaded, the way a
// maintainer moving around their listing meets it). The first cycle is
// printed, not held.

import { chromium } from "playwright";

import { STUDIO_ORG, STUDIO_PROFILE, sessionCookie } from "./fixture.mjs";

export const STUDIO_LATENCY_MS = 45;

/** The budgets, warm, at `STUDIO_LATENCY_MS` in front of every read. */
export const STUDIO_BUDGETS = {
  /** The strip answers the click before any read comes back. */
  feedbackMs: 150,
  /** The step is on screen, pointer or revisit: one round trip plus a render. */
  contentMs: 300,
  /**
   * The step is on screen on a KEYBOARD first visit — no hover, so no
   * warm-up, so the press pays for the step's reads. 400, not 300, and the
   * hundred is React's: once a Suspense fallback is shown, React 19 holds it
   * for ~300ms before revealing content, so the skeleton that answers the
   * press at once also sets a floor under the content. Measured (OSD8): the
   * step's RSC response ends at ~67ms, the skeleton paints at ~10ms, the
   * content at ~315ms. On a production round trip longer than the throttle
   * the floor costs nothing; on a fast one it costs up to ~250ms, and buys the
   * only feedback a slow one would otherwise give. Kept, and measured.
   */
  keyboardContentMs: 400,
  /** A tab switch reads the profile and at most one document beside it. */
  readsPerSwitch: 3,
};

// "Content" is the tab's address with no loading skeleton left on screen —
// one rule for every step, and the same rule for a build that has no
// skeletons at all (the pre-OSD5 baseline, where the click simply waits).
// OB6 (#1873) took Launches out of the strip (its page stays), so it is not a
// tab to press. "People" matches "People and roles", OB6's word, and the old
// one a baseline build says.
const TABS = ["Details", "Media", "Topics and stack", "People", "Discussions", "Overview"];
// The baseline's only boundary was the studio's own ("Loading your studio").
const SKELETON = /Loading (this part of )?your (listing|studio)/;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.floor((s.length - 1) / 2)];
};

export async function runStudioTiming(base, gateway, { budgets = true } = {}) {
  const failures = [];
  const check = (name, ok, detail = "") => {
    console.log(`[studio-timing] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures.push(name);
  };

  await fetch(`${gateway.url}/__fixture/latency?ms=${STUDIO_LATENCY_MS}`, { method: "POST" });
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });
  const rows = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies(sessionCookie(base));
    const listing = `${base}/studio/${STUDIO_ORG}/${STUDIO_PROFILE}`;

    // One pass over every tab on `page`, pressing each the given way.
    const pass = async (page, mode, cycle) => {
      for (const tab of TABS) {
        const link = page.locator('nav[aria-label="Listing steps"] a', { hasText: tab }).first();
        if ((await link.count()) === 0) {
          // A build from before a tab existed (the baseline has no Overview
          // tab) is measured on the tabs it has; this build must have them all.
          if (budgets) check(`the strip has a "${tab}" tab`, false);
          continue;
        }
        const target = new URL((await link.getAttribute("href")) ?? "", base).pathname;
        const label = ((await link.textContent()) ?? tab).trim();
        if (mode === "keyboard") {
          // No pointer, so no hover warm-up: the press pays for the step.
          await page.mouse.move(0, 0);
          await link.focus();
        } else {
          // Pointer on the tab first, as a person's is: the hover warm-up is
          // part of what a click costs, and part of what OSD5 changed.
          await link.hover();
        }
        await page.waitForTimeout(150);
        const before = gateway.requests.length;
        const t0 = Date.now();
        if (mode === "keyboard") await page.keyboard.press("Enter");
        else await link.click();
        // Feedback: the first sign the press was heard — the strip marks the
        // tab, or the step's skeleton paints, whichever comes first.
        await page.waitForFunction(
          ({ label, skeleton }) =>
            document.querySelector('nav[aria-label="Listing steps"] [aria-current="page"]')?.textContent?.trim() ===
              label || new RegExp(skeleton).test(document.querySelector("main")?.textContent ?? ""),
          { label, skeleton: SKELETON.source },
          { timeout: 20000, polling: 5 },
        );
        const feedback = Date.now() - t0;
        await page.waitForFunction(
          ({ path, skeleton }) =>
            location.pathname === path && !new RegExp(skeleton).test(document.querySelector("main")?.textContent ?? ""),
          { path: target, skeleton: SKELETON.source },
          { timeout: 20000, polling: 5 },
        );
        const content = Date.now() - t0;
        await page.waitForLoadState("networkidle");
        const reads = gateway.requests
          .slice(before)
          .filter((r) => r.includes("/openproduct/") && !r.startsWith("/v1/media/")).length;
        rows.push({ mode, cycle, tab, feedback, content, reads });
      }
    };

    // FIRST VISITS, on a fresh page each cycle — an empty router cache, so a
    // step is fetched when it is pressed (the browser's HTTP cache keeps the
    // code chunks, as it would for a maintainer). Cycle 1 is held.
    for (const mode of ["keyboard", "pointer"]) {
      for (let cycle = 0; cycle < 2; cycle++) {
        const page = await context.newPage();
        await page.goto(listing, { waitUntil: "networkidle" });
        await page.waitForSelector('nav[aria-label="Listing steps"]', { timeout: 20000 });
        await pass(page, mode, cycle);
        // REVISITS: the same tabs again on the same page, within the router
        // cache's thirty seconds — what flicking between tabs costs.
        if (mode === "keyboard" && cycle === 1) await pass(page, "revisit", 1);
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await fetch(`${gateway.url}/__fixture/latency?ms=0`, { method: "POST" }).catch(() => {});
  }

  for (const r of rows) {
    console.log(
      `[studio-timing] ${r.mode.padEnd(8)} ${r.cycle === 0 ? "cold" : "warm"}  ${r.tab.padEnd(18)} feedback ${String(r.feedback).padStart(4)}ms  content ${String(r.content).padStart(4)}ms  reads ${r.reads}`,
    );
  }
  const summaryOf = (mode) => {
    const warm = rows.filter((r) => r.mode === mode && r.cycle === 1);
    return {
      mode,
      latencyMs: STUDIO_LATENCY_MS,
      tabs: warm.length,
      warmFeedbackMedian: median(warm.map((r) => r.feedback)),
      warmContentMedian: median(warm.map((r) => r.content)),
      warmContentMax: Math.max(...warm.map((r) => r.content)),
      maxReads: Math.max(...warm.map((r) => r.reads)),
    };
  };
  const summaries = ["keyboard", "pointer", "revisit"].map(summaryOf);
  for (const summary of summaries) console.log(`[studio-timing] summary ${JSON.stringify(summary)}`);

  if (budgets) {
    for (const summary of summaries) {
      check(
        `${summary.mode}: a warm tab switch answers the click within ${STUDIO_BUDGETS.feedbackMs}ms (median)`,
        summary.warmFeedbackMedian <= STUDIO_BUDGETS.feedbackMs,
        `${summary.warmFeedbackMedian}ms`,
      );
      const limit = summary.mode === "keyboard" ? STUDIO_BUDGETS.keyboardContentMs : STUDIO_BUDGETS.contentMs;
      check(
        `${summary.mode}: a tab switch shows its step within ${limit}ms (median, at ${STUDIO_LATENCY_MS}ms upstream)`,
        summary.warmContentMedian <= limit,
        `${summary.warmContentMedian}ms`,
      );
      check(
        `${summary.mode}: no tab switch costs more than ${STUDIO_BUDGETS.readsPerSwitch} upstream reads`,
        summary.maxReads <= STUDIO_BUDGETS.readsPerSwitch,
        `${summary.maxReads}`,
      );
    }
  }
  console.log(
    failures.length === 0
      ? "web-studio-timing: ALL CHECKS PASS"
      : `web-studio-timing: ${failures.length} FAILED → ${failures.join(" · ")}`,
  );
  return failures.length === 0 ? 0 : 1;
}
