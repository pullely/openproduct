// QE0 — the budget, on the wire (openproduct-worldclass-v2).
//
// WHAT THIS LANE MEASURES THAT `budgets.mjs` DOES NOT. XP4's budgets hold the
// JS bytes, the gzipped document, CLS, the fonts and the server reads — each a
// number a regression moves and a busy runner cannot. None of them is the
// number a visitor pays: WC-5 promised "400 KB of assets" and never became an
// assertion, RS4 measured 6 KB because it measured HTML, and the 9 September
// audit (W·15) found ~200 KB on the wire, 35 requests, four prefetched
// documents nobody asked for and one third-party script — on an estate whose
// status file said third-party requests were zero.
//
// So this lane measures THE WHOLE PAGE AS THE BROWSER FETCHED IT, at both
// viewports, on the three archetypes the audit measured, and holds it to the
// numbers WC2-8 wrote down BEFORE the images land:
//
//   ≤ 250 KB compressed transfer     everything the page pulled, gzipped
//   ≤ 30 requests                    the document and every subresource
//   0 third-party hosts              a public page that reaches another origin
//                                    tells that origin who is reading (I3)
//
// A budget written after MD adds images is a budget written to fit them;
// this one is written to fit today's page with a margin, and the status entry
// records the margin so the next person can see what an image costs.
//
// COMPRESSED THE WAY THE EDGE COMPRESSES. Production answers `content-encoding:
// br` on the document and on every chunk (checked on 10 September); `next
// start` gzips. Measured as served, this lane read 251 KB for a listing whose
// production transfer the audit put near 200 KB — the gzip/brotli gap, not
// the page — and a gate that fails on the harness's encoding rather than the
// visitor's is a gate somebody will loosen. So every same-origin body is
// fetched once more and brotli-compressed HERE, at quality 5 (Cloudflare
// compresses on the fly at a similar level; the audit's numbers are the
// calibration), and that sum is what the budget holds. The gzipped bytes the
// server actually sent are printed beside it, so the two encodings can be
// compared on every run. The decoded total is printed too, because a chunk
// that compresses well is still a chunk the main thread has to parse.
//
// THE WINDOW IS THE SAME AS THE BUDGET LANE'S: navigation, `load`, then a
// fixed 2.5 s — long enough for hydration and for any viewport prefetch to
// fire, which is the point. A lane that stopped at `load` would never see the
// four documents the audit counted, because Next fetches them in idle time
// after the page has painted.
//
// THE TWO RUNTIME CHUNKS, BY NAME (WC2-8). The audit found two 169 KB chunks
// on every route — React/Next's runtime and the app router — and the decision
// asks that they be accounted for rather than merely counted. So the lane
// prints the largest scripts on the desktop home as a note: a third chunk
// that size is a new dependency, and the name is how somebody finds it.

import { brotliCompressSync, constants } from "node:zlib";

import { chromium } from "playwright";

import { CARDS, SAMPLE_SLUG } from "./fixture.mjs";

/**
 * WC2-8's three numbers. Moving any of them is a recorded decision.
 *
 * ─── 250 KB → 276 KB, RECORDED 2026-10-22 (NEXT 16) ────────────────────────
 *
 * Next.js 15 left its two-year support window and `@opennextjs/cloudflare`
 * stopped building it, so the app moved to 16.4.2. Its runtime is bigger, and
 * nothing else is: measured on full builds of the same commit, brotli as
 * this lane compresses,
 *
 *                     next 15.5.18   next 16.4.2   rise
 *   / (home)          231,665        258,141       +26,476
 *   /product-00       245,795        272,320       +26,525
 *   /builds/upvoted   232,780        259,287       +26,507
 *
 * The rise is the two runtime chunks this lane names: the app router (the
 * segment cache, the back/forward cache, view transitions — 16's only
 * router) and the React Next vendors (19.2.0-canary → 19.3.0-canary). The
 * app's own chunks got slightly smaller. The budget is the old value plus the
 * largest rise, rounded up to the KB: every archetype keeps its margin, the
 * listing's 10 KB included. Requests and third-party hosts did not move.
 *
 * ─── 276 KB HELD THROUGH THE REDESIGN, MEASURED 2026-11-14 (OPR1) ─────────
 *
 * The redesign (openproduct-redesign OPR1) replaced Geist, Newsreader and
 * Geist Mono with Hanken Grotesk, Lora and IBM Plex Mono. Its first commit
 * moved this budget to 300 KB BY ARITHMETIC, before the lane had run: five
 * font files where there were three, +23,764 bytes on every page. Measured,
 * that amendment was not needed and it was taken back out:
 *
 *   - Lora's italic is not preloaded any more (`web/src/app/layout.tsx`): no
 *     walked page draws it, so a page fetches four files, 75,924 bytes,
 *     where it fetched three, 74,900 — a rise of 1,024, not 23,764;
 *   - the rest of the rise is the redesign's own markup and script.
 *
 *                             next 16 (above)   OPR1, measured   rise
 *   / (home)                  258,141           261,811          +3,670
 *   /product-00               272,320           276,145          +3,825
 *   /products?sort=upvoted    259,287           262,461          +3,174
 *     (was /builds/upvoted)
 *
 * Every archetype is under 276 KB (282,624 B): the listing, the heaviest,
 * keeps 6,479 bytes. So the number WC2-8 holds did not move, and there is no
 * amendment for the redesign in the decision file.
 *
 * REQUESTS, MEASURED: 26 on the home and on Products at both widths; 30 on
 * the listing at desktop and 29 on a phone. The listing is AT the limit of
 * 30 — the fourth font file is the request that put it there — so the next
 * request that page adds is a recorded decision, not a rounding.
 */
export const WIRE = { bytes: 276 * 1024, requests: 30, thirdPartyHosts: 0 };

/** The audit's two viewports (audit-reference.md). */
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900, isMobile: false, hasTouch: false },
  { name: "phone", width: 375, height: 812, isMobile: true, hasTouch: true },
];

/** The three archetypes W·15 measured: the home, a listing, the leaderboard. */
const ROUTES = [
  { path: "/", name: "home", expect: SAMPLE_SLUG },
  { path: `/${SAMPLE_SLUG}`, name: "listing", expect: "Frontend contributor" },
  // OB7 (#1875) — the leaderboard is the Upvoted order; OPR1 — and that
  // order is the Products page's `?sort=upvoted`.
  { path: "/products?sort=upvoted", name: "upvoted", expect: CARDS[0].slug },
];

/** How long after `load` the lane keeps counting. The budget lane's value. */
const SETTLE_MS = 2_500;

/** The edge's encoding, at a quality an edge can afford on the fly. */
const BROTLI_QUALITY = 5;
const brotli = (body) =>
  brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } }).length;

const failures = [];
function check(name, ok, detail) {
  console.log(`[wire] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

/** Wait for the ISR entry — the budget lane's argument, verbatim: a document
 *  that streams is a different document from the cached one. */
async function warm(context, base, path, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const res = await context.request.get(base + path);
    const state = res.headers()["x-nextjs-cache"];
    if (!state || state === "HIT") return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function measure(browser, base, route, viewport, ours) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
  try {
    await warm(context, base, route.path);
    const page = await context.newPage();
    const requests = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.protocol === "data:" || url.protocol === "blob:") return;
      requests.push(url);
    });

    const response = await page.goto(base + route.path, { waitUntil: "load" });
    await page.waitForTimeout(SETTLE_MS);
    const html = await response.text();

    const sizes = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const res = performance.getEntriesByType("resource");
      const encoded = (e) => e.encodedBodySize || e.transferSize || 0;
      const decoded = (e) => e.decodedBodySize || e.encodedBodySize || 0;
      return {
        served: encoded(nav) + res.reduce((n, e) => n + encoded(e), 0),
        decoded: decoded(nav) + res.reduce((n, e) => n + decoded(e), 0),
        // Every subresource the page pulled, by address, so the edge's
        // encoding can be computed over the same set.
        urls: res.map((e) => e.name),
        largest: res
          .filter((e) => e.name.endsWith(".js"))
          .map((e) => ({ name: e.name.split("/").pop(), decoded: decoded(e) }))
          .sort((a, b) => b.decoded - a.decoded)
          .slice(0, 3),
      };
    });

    // The edge's bytes: the document as it was served, plus each subresource
    // fetched once more and compressed the way production compresses it.
    let edge = brotli(Buffer.from(html, "utf8"));
    const largest = new Map(sizes.largest.map((c) => [c.name, c]));
    for (const url of sizes.urls) {
      if (!ours.has(new URL(url).origin)) continue;
      const res = await context.request.get(url, { headers: { "accept-encoding": "identity" } });
      const body = await res.body();
      const bytes = brotli(body);
      edge += bytes;
      const name = url.split("/").pop();
      if (largest.has(name)) largest.get(name).edge = bytes;
    }

    const thirdParty = [...new Set(requests.filter((u) => !ours.has(u.origin)).map((u) => u.host))];
    await page.close();
    return {
      status: response.status(),
      rendered: html.includes(route.expect),
      requests: requests.length,
      thirdParty,
      edge,
      served: sizes.served,
      decoded: sizes.decoded,
      largest: [...largest.values()],
    };
  } finally {
    await context.close();
  }
}

/**
 * The origins that are OURS. The page's own, and the API's: production
 * serves media from `api.openproduct.live` (MD1 — the bytes have somewhere
 * to live), which is why WC2-8's observation names two hosts rather than
 * one. Here the API is the fixture gateway, on a port of its own, and a lane
 * that called it a third party would fail the first listing with a picture.
 */
export async function runWire(base, gateway) {
  const ours = new Set([new URL(base).origin, ...(gateway?.url ? [new URL(gateway.url).origin] : [])]);
  console.log(
    `web-perf/wire: base=${base} budget=${kb(WIRE.bytes)} / ${WIRE.requests} requests / ${WIRE.thirdPartyHosts} third-party hosts`,
  );
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });
  try {
    for (const route of ROUTES) {
      for (const viewport of VIEWPORTS) {
        const m = await measure(browser, base, route, viewport, ours);
        const at = `${route.path} (${route.name}) @ ${viewport.name}`;
        // THE GUARD IN FRONT OF THE BUDGET, as in every lane here: a failure
        // panel is small, fast and clears every threshold below.
        check(`rendered: ${at}`, m.status === 200 && m.rendered, `HTTP ${m.status}`);
        check(
          `${at}: transfer ≤ ${kb(WIRE.bytes)}`,
          m.edge <= WIRE.bytes,
          `${kb(m.edge)} (${m.edge} B) brotli · ${kb(m.served)} as served (gzip) · ${kb(m.decoded)} decoded`,
        );
        check(
          `${at}: requests ≤ ${WIRE.requests}`,
          m.requests <= WIRE.requests,
          `${m.requests} request(s)`,
        );
        check(
          `${at}: third-party hosts ≤ ${WIRE.thirdPartyHosts}`,
          m.thirdParty.length <= WIRE.thirdPartyHosts,
          m.thirdParty.join(", ") || "none",
        );
        if (route.path === "/" && viewport.name === "desktop") {
          for (const chunk of m.largest) {
            console.log(
              `[note] largest script on the home: ${chunk.name} — ${kb(chunk.decoded)} (${kb(chunk.edge ?? 0)} br)`,
            );
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(
    failures.length === 0
      ? "web-perf/wire: THE PAGE IS UNDER BUDGET ON THE WIRE"
      : `web-perf/wire: ${failures.length} FAILED → ${failures.join(" | ")}`,
  );
  return failures.length === 0 ? 0 : 1;
}
