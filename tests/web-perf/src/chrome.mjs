// THE ACCOUNT CONTROL, ON THE FIRST FRAME, IN A REAL BROWSER.
//
// ─── WHY THIS LANE EXISTS AT ALL ─────────────────────────────────────────
//
// Because this program has now shipped the same class of bug twice, and both
// times every test passed. SB0 shipped `/create` as a `200` with an empty
// body; R11 found every `notFound()` in the product answering `200`. The
// sentence written after the first one is the reason for this file:
//
//   "every test passed, because every test read the source or hit a local
//    server."
//
// The flicker fix is exactly the kind of change that sentence is about. Its
// correctness lives in three places that never meet in a unit test — a cookie
// set by a route handler, a script that runs before the first paint, and two
// CSS rules that resolve against a class on `<html>`. `session-hint.test.ts`
// reads all three and can be green while the page shows the wrong thing.
//
// So this drives a real Chromium against the BUILT server and asks the only
// question that matters: what is on screen before the network answers.
//
// ─── HOLDING `/auth/session` OPEN IS THE TECHNIQUE ───────────────────────
//
// The flicker was never that the wrong thing renders forever — it is that the
// wrong thing renders UNTIL a round trip completes. A test that waits for the
// page to settle measures the end state and would have passed before this
// change and after it. So three of the four cases below never fulfil that
// request at all, which freezes the page in the moment the visitor actually
// complains about.

import { chromium } from "playwright";

const failures = [];

function check(name, ok, detail) {
  console.log(`[chrome] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

/** What is displayed, what the class says, and what a keyboard can reach. */
async function paint(browser, base, { hint, sessionAnswer }) {
  const ctx = await browser.newContext();
  if (hint) await ctx.addCookies([{ name: "op_signed_in", value: "1", url: base }]);
  const page = await ctx.newPage();
  await page.route("**/auth/session", async (route) => {
    // Undefined means "never answer" — the page stays in the moment before
    // the correction, which is the whole point of the lane.
    if (sessionAnswer === undefined) return;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: sessionAnswer }),
    });
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  if (sessionAnswer !== undefined) await page.waitForTimeout(500);
  const seen = await page.evaluate(() => {
    // `checkVisibility` AND NOT `display === "none"`, because the shell hides
    // a branch with `visibility` now — it has to keep the BOX so the bar
    // reserves the wider of the two controls and the pills stop jumping on
    // hydration (globals.css says why at length). `display` alone would call
    // a `visibility: hidden` branch "shown", which is the opposite of what a
    // reader and a screen reader get. This API answers the question the lane
    // is actually asking, for both properties at once.
    const show = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return "absent";
      return el.checkVisibility({ visibilityProperty: true }) ? "shown" : "hidden";
    };
    return {
      anonymous: show('[data-auth-branch="anonymous"]'),
      signedIn: show('[data-auth-branch="signed-in"]'),
      signedInClass: document.documentElement.classList.contains("op-signed-in"),
      // Both branches are in the DOM. Only one may be REACHABLE, and both
      // `display: none` and `visibility: hidden` buy that (only `opacity: 0`
      // does not) — it is the half a screen reader and a Tab key care about.
      reachable: [...document.querySelectorAll("a,button")]
        // Same correction as `show()` above: `offsetParent` is non-null for a
        // `visibility: hidden` element, and that element is NOT reachable —
        // it is out of the tab order and out of the accessibility tree.
        .filter((el) => el.checkVisibility({ visibilityProperty: true }))
        .map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim())
        .filter((label) => /^Sign in$|^Account —/.test(label)),
    };
  });
  await ctx.close();
  return seen;
}

export async function runChrome(base) {
  console.log(`web-chrome: base=${base}`);
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });

  try {
    // ─── the default: no cookie, no answer yet ──────────────────────────
    const cold = await paint(browser, base, { hint: false });
    check(
      "signed out: the anonymous branch is what a visitor sees",
      cold.anonymous === "shown" && cold.signedIn === "hidden",
      `anon=${cold.anonymous} signedIn=${cold.signedIn}`,
    );
    check(
      "signed out: exactly one account control is reachable",
      cold.reachable.length === 1 && cold.reachable[0] === "Sign in",
      JSON.stringify(cold.reachable),
    );

    // ─── THE MILESTONE: the hint, before anything has answered ──────────
    const hinted = await paint(browser, base, { hint: true });
    check(
      "hinted: the account chip is painted BEFORE /auth/session answers",
      hinted.signedIn === "shown" && hinted.anonymous === "hidden",
      `anon=${hinted.anonymous} signedIn=${hinted.signedIn} class=${hinted.signedInClass}`,
    );
    check(
      "hinted: still exactly one account control is reachable",
      hinted.reachable.length === 1 && /^Account —/.test(hinted.reachable[0] ?? ""),
      JSON.stringify(hinted.reachable),
    );

    // ─── a stale hint is corrected, not believed ────────────────────────
    const stale = await paint(browser, base, { hint: true, sessionAnswer: { signedIn: false } });
    check(
      "stale hint: the authority wins and the chip is taken down",
      stale.anonymous === "shown" && stale.signedIn === "hidden" && !stale.signedInClass,
      `anon=${stale.anonymous} signedIn=${stale.signedIn} class=${stale.signedInClass}`,
    );

    // ─── no hint but a real session: the old path, which must still work ─
    // This is every session that predates the mechanism. They flicker once,
    // `/auth/session` writes them a hint, and they never flicker again.
    const backfill = await paint(browser, base, {
      hint: false,
      sessionAnswer: { signedIn: true, subjectId: "usr_probe", displayName: "Ada Lovelace" },
    });
    check(
      "no hint, real session: the authority still signs them in",
      backfill.signedIn === "shown" && backfill.anonymous === "hidden",
      `anon=${backfill.anonymous} signedIn=${backfill.signedIn}`,
    );
    check(
      "no hint, real session: the name from the authority is what renders",
      backfill.reachable.some((label) => label.includes("Ada Lovelace")),
      JSON.stringify(backfill.reachable),
    );
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    console.error(`web-chrome: ${failures.length} FAILED`);
    return 1;
  }
  console.log("web-chrome: ALL CHECKS PASS");
  return 0;
}
