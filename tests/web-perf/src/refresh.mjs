// The refresh lane: does `router.refresh()` land, every time?
//
// ─── THE DEFECT ───────────────────────────────────────────────────────────
//
// On the studio's listing overview the FIRST refresh after a page load
// usually applied and the ones after it usually did not. The RSC request went
// out every time and came back 200 with the new render in it (a payload read
// "3 of 8 in the gallery" while the page still said 1), and the DOM kept the
// old tree. `router.replace(<same url>)` did the same. A tab click showed
// fresh data. `live-save.tsx` had been routing around it since OPP15 ("its
// answer was dropped twice in eight").
//
// ─── THE CAUSE, MEASURED ──────────────────────────────────────────────────
//
// It was not the strip's prefetches or the `loading.tsx` boundaries (with
// both removed around the overview, 7 of 8 were still dropped). It was not
// the shell's client islands either. Nor was it the React RC in
// `package.json`: the App Router never loads that. It renders with the React
// that Next vendors, which for 15.5.18 (and still 15.5.26) is
// `19.2.0-canary-0bdb9206-20250818`.
//
// Each dropped refresh left its transition lane on the root as
// `pending = suspended = warm = entangled` with `pinged = 0`. The lane was
// parked, and the scheduler skips a warm suspended lane until it is pinged.
// The ping had already come and gone. It was lost in `pingSuspendedRoot`.
// In production, Flight's lazy chunks resolve SYNCHRONOUSLY inside `.then()`,
// so a chunk the render initialises can ping the root while the root is still
// rendering. If that render has already decided to suspend (exit status 4),
// that React ran `0 === (executionContext & RenderContext) &&
// prepareFreshStack(root, 0)`. Inside the render the condition is false, so
// the ping was not recorded in `workInProgressRootPingedLanes` either.
// `markRootSuspended` then parked the lane as warm, and nothing woke it again.
//
// React fixed this upstream by recording the ping. The React that
// `next@16.3.x` vendors has that line; `patches/next@15.5.18.patch` backported
// it while this app was on 15.5.18, and was deleted when the app moved to
// `next@16.4.2` (`19.3.0-canary-278794d7-20261002`, which has it too).
//
// ─── WHAT THIS LANE HOLDS ─────────────────────────────────────────────────
//
// Change the listing behind the page through the fixture gateway, ask the
// router to re-render, and require the change on screen. Do it again, many
// times in one page load. One round would not prove anything: the first
// refresh usually landed even with the bug. Before the patch this measured
// 0 to 2 of 10 landing; with it, 10 of 10.
//
// It asks through `window.next.router`, the router's own handle. That is the
// same `router.refresh()` that `live-save.tsx` and every studio act call,
// without a form in the way whose own behaviour would also be under test.
//
// NOT `router.replace(<same url>)`, though it showed the same symptom before
// the patch. Its misses after the patch are a different thing, and they are
// by design. `replace` is a navigation, and `next.config.mjs` keeps a dynamic
// render in the client router cache for 30 s (OSD5's `staleTimes`), so a
// second same-URL replace inside that window gets the render the first one
// fetched. Measured: 1 of 10 landed, with nothing parked on the root. A save
// that must show its result calls `refresh()`, which empties that cache.

import { chromium } from "playwright";

import { STUDIO_ORG, STUDIO_PROFILE, sessionCookie } from "./fixture.mjs";

/** Consecutive refreshes in one page load. With the old landing rate of
 *  about one in four, ten passing by luck is about one in a million. */
const ROUNDS = Number(process.env.XP4_REFRESH_ROUNDS ?? 10);
/** How long a round may take to show its change. A local re-render lands in
 *  well under 200 ms and a dropped one never does, so this only needs to
 *  cover a loaded CI runner. */
const LAND_MS = 5000;

/** Which round's row the media card is drawing, as a number, or null when it
 *  draws none. Each round's row has its own alt text, so every round expects
 *  something the page has never shown. (A count that toggled between two
 *  values let a page stuck on an old render "pass" every other round. The
 *  first draft of this lane did exactly that: 5 of 10, median 4 ms.) */
const readRound = (page) =>
  page.evaluate(() => {
    const text = document.querySelector("#media")?.textContent ?? "";
    const m = /refresh-(\d+)/.exec(text);
    return m ? Number(m[1]) : null;
  });

/** The root's lane bitmasks, printed on a failure so whoever reads it knows
 *  at once whether it is this defect (`pending` = `suspended` = `warm`,
 *  `pinged` 0) or a different one (all zero: nothing parked). */
const rootLanes = (page) =>
  page.evaluate(() => {
    const key = Object.keys(document).find((k) => k.startsWith("__reactContainer$"));
    const root = key ? document[key]?.stateNode : null;
    if (!root) return null;
    const b = (n) => (typeof n === "number" ? n.toString(2) : null);
    return {
      pending: b(root.pendingLanes),
      suspended: b(root.suspendedLanes),
      pinged: b(root.pingedLanes),
      warm: b(root.warmLanes),
    };
  });

export async function runRefresh(base, gateway) {
  const failures = [];
  const check = (name, ok, detail) => {
    console.log(`[refresh] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures.push(name);
  };

  const media = `${gateway.url}/v1/organizations/${STUDIO_ORG}/openproduct/profiles/${STUDIO_PROFILE}/media`;
  const auth = { authorization: "Bearer tok_walk" };
  const rows = async () => (await (await fetch(media, { headers: auth })).json()).data?.media ?? [];
  const ours = async () => (await rows()).filter((m) => /^refresh-\d+$/.test(m.value.alt));
  const add = async (n) => {
    const res = await fetch(`${media}?kind=gallery&alt=refresh-${n}&position=${n}`, {
      method: "POST",
      headers: auth,
      body: "x",
    });
    if (!res.ok) throw new Error(`refresh lane: the fixture refused an upload (${res.status})`);
  };
  const removeOurs = async () => {
    for (const row of await ours()) {
      await fetch(`${media}/${row.value.id}`, { method: "DELETE", headers: auth });
    }
  };

  // The lane keeps one row of its own in the gallery, swaps it each round
  // and removes it at the end. Other lanes share the fixture, and the studio
  // walk counts rows.
  await removeOurs();
  await add(0);

  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addCookies(sessionCookie(base));
    const page = await context.newPage();
    // Same reason as the studio walk. The shell's section prefetches come back
    // stale-while-revalidate, and Playwright never sees Chromium's background
    // revalidations finish, so `networkidle` would never arrive.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    const listing = `${base}/studio/${STUDIO_ORG}/${STUDIO_PROFILE}`;
    const res = await page.goto(listing, { waitUntil: "networkidle" });
    await page.waitForSelector("#media", { timeout: 15000 });
    const initial = await readRound(page);
    check(
      "the overview loads and its media card draws the lane's row",
      res?.status() === 200 && initial === 0,
      `status ${res?.status()}, card draws round ${initial}`,
    );

    // No reload between rounds, even after a miss. The defect dropped the
    // refreshes that came AFTER the first one in a page load, and a reload
    // would give every round the first one's luck.
    let landed = 0;
    const took = [];
    let firstMiss = null;
    for (let i = 1; i <= ROUNDS; i++) {
      // Swap the row: the fixture now holds round i's row and no other.
      await removeOurs();
      await add(i);

      const t0 = Date.now();
      await page.evaluate(() => {
        const router = window.next?.router;
        if (!router) throw new Error("window.next.router is missing");
        router.refresh();
      });
      let seen = null;
      while (Date.now() - t0 < LAND_MS) {
        seen = await readRound(page);
        if (seen === i) break;
        await page.waitForTimeout(25);
      }
      if (seen === i) {
        landed++;
        took.push(Date.now() - t0);
      } else {
        firstMiss ??= { round: i, seen, lanes: await rootLanes(page) };
      }
    }
    took.sort((a, b) => a - b);
    const median = took.length ? took[Math.floor(took.length / 2)] : null;
    check(
      `${ROUNDS} consecutive router.refresh() calls each put the new render on screen`,
      landed === ROUNDS,
      `${landed}/${ROUNDS} landed${median !== null ? `, median ${median} ms` : ""}` +
        (firstMiss
          ? `; first miss at round ${firstMiss.round}, card still drew round ${firstMiss.seen}, root lanes ${JSON.stringify(firstMiss.lanes)}`
          : ""),
    );
  } finally {
    await browser.close();
    await removeOurs();
  }

  console.log(`[refresh] ${failures.length === 0 ? "all checks passed" : `${failures.length} failed`}`);
  return failures.length === 0 ? 0 : 1;
}
