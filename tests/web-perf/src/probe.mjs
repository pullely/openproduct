// OPP0 — the cold-render probe (openproduct-performance).
//
// A REPORT, NOT A GATE, and a SEPARATE ENTRY POINT from `run.mjs` — both for
// the same reason. `run.mjs` boots one server and one fixture and hands them to
// every lane, because the budgets and the a11y walk must measure the same
// document. This probe cannot share that server: it needs a fixture that
// SLEEPS in front of every read, it needs the build's caches evicted before it
// starts, and it needs the authenticated `/v1/openproduct/me/*` surface the
// public-only fixture does not answer. Folding it in would make every other
// lane pay for those three things.
//
// ─── WHAT IT MEASURES THAT `budgets.mjs` CANNOT ───────────────────────────
//
// XP4's budget lane measures a WARM, ANONYMOUS, CACHE-HIT document against a
// zero-latency fixture, and every budget passes. That is the right gate and
// only one point on the curve. This adds the four axes it cannot see:
//
//   COLD     the first request after the route's prerender and fetch cache are
//            evicted — a full SSR with real upstream reads. In production
//            every isolate that has not yet rendered a route pays this,
//            because `open-next.config.ts` binds the dummy incremental cache.
//   LATENCY  the same render with a configurable RTT in front of every read,
//            so the cost decomposes into "our render" and "the chain", and so
//            the fan-out shape is visible: one round trip or N.
//   NAV      how long a click takes. The public surface is plain `<a href>`,
//            so today this is a full document load and the number says so.
//   SIGNED   the same routes with a session. I6 guarantees the ANONYMOUS
//            render is byte-identical and says nothing about what the overlay
//            does to the page when it lands.
//
// ─── FOUR WAYS THIS PROBE PRODUCED A FAST NUMBER ABOUT NOTHING ────────────
//
// Each of these is a real bug this file had, and each was green:
//
//   1. THE FETCH CACHE. `readPublic` sets `next: { revalidate: 60 }`, so
//      `next build` persists every public read under `.next/cache/fetch-cache`
//      and a "cold" render serves from disk having made no request at all. A
//      45ms latency injection measured as a 0ms effect, three runs running.
//      `evict()` below removes it, and `upstreamOnFirstView` is the assertion
//      that would catch it coming back.
//   2. THE READINESS PROBE. Polling `/` until the server answers makes the
//      front page's cold number the readiness loop's — it read 13ms at a 45ms
//      upstream, which cannot happen for a page that makes three reads.
//      Readiness now polls an address no route claims.
//   3. STACKED OBSERVERS. `addInitScript` registers on the CONTEXT. Calling it
//      per iteration while reusing the context stacks a set per run and
//      multiplies every ADDITIVE metric — CLS and TBT read ~3x high while LCP
//      (last write wins) looked fine. One fresh context per run.
//   4. THE INLINED BUILD VAR. `NEXT_PUBLIC_*` is baked at build time, so a
//      probe on a port the build does not know about points the bundle at a
//      dead socket; `readPublic` turns that into `null` and the pages render
//      fallbacks. Fast, wrong, and passing any check that only looks for the
//      word `openproduct`. The port here is derived the same way `serve.mjs`
//      derives it, and the read counts are what prove it.
//
// THE READ COUNT IS THE GUARD. Every route reports the upstream requests its
// first view caused. A number without one is a number about nothing.
//
// IT CAN BE OFF BY ONE, in the direction `budgets.mjs` already documents: a
// read issued while rendering can land after the response has been written,
// and is then charged to the NEXT row. So `rd` is a magnitude check — "did
// this route read at all, and roughly how many times" — and not an exact
// count. The assertion that matters is `rd == 0` on a route that must read.
//
// AND IN `all` THE VITALS LANE MEASURES WARM DOCUMENTS, because the server
// lane ran first and left every route in the ISR cache. That is what makes its
// `reads` column zero. Run `vitals` on its own for a cold browser pass, and
// with `PROBE_SIGNED_IN=1` for the one XP4 structurally cannot do.
//
//   node src/probe.mjs                 the server table + navigation timings
//   node src/probe.mjs vitals          browser vitals, anonymous
//   PROBE_SIGNED_IN=1 node src/probe.mjs vitals    ... and signed in
//   PROBE_LATENCY=45 node src/probe.mjs            ... with a 45ms upstream
//
// `PROBE_LATENCY` is the upstream round trip in milliseconds, applied to every
// read. 0 is the local floor; 45 is a plausible warm
// gateway -> core -> Hyperdrive -> Postgres chain; 120 is a cold one.

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { CARDS, SAMPLE_HANDLE, SAMPLE_SLUG, startGateway as startFixture } from "./fixture.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(here, "../../../web");

/** The SAME port `serve.mjs` uses, and the gateway derived from it the same
 *  way — because the build this probe measures baked that address in. */
const WEB_PORT = Number(process.env.XP4_PORT ?? 3187);
const GW_PORT = WEB_PORT + 1;

const LATENCY = Number(process.env.PROBE_LATENCY ?? 0);
const SIGNED_IN = process.env.PROBE_SIGNED_IN === "1";

// ─── the authenticated half of the fixture ───────────────────────────────
//
// XP4's fixture answers the public plane and nothing else, which is right for
// a lane that measures public documents. `/me` and `/studio` are the surfaces
// with NO cache anywhere — `force-dynamic`, `no-store`, every visit a full
// render — so a probe that skipped them would skip the half of the product
// that can never get faster on its own.
const ME = {
  subjectId: "sub_000000000000000000000001",
  contributor: {
    subjectId: "sub_000000000000000000000001",
    handle: SAMPLE_HANDLE,
    displayName: "Ada Lovelace",
    bio: "Building things in the open.",
    profilePublic: true,
    hasStanding: true,
    openToProject: true,
    links: { repo: "https://github.com/example/product", site: null },
  },
};

function authedAnswer(pathname) {
  const M = "/v1/openproduct";
  if (pathname === `${M}/me`) return ME;
  if (pathname === `${M}/me/digest`) return { subscription: { state: "subscribed" } };
  if (pathname === `${M}/me/applications`) return { applications: [] };
  if (pathname === `${M}/me/saved`) return { projects: CARDS.slice(0, 12) };
  if (pathname === `${M}/me/collections`) return { collections: [] };
  if (pathname === `${M}/me/appeals`) return { appeals: [] };
  if (pathname === `${M}/me/notifications`) {
    return {
      items: Array.from({ length: 20 }, (_, i) => ({
        id: `inb_${String(i).padStart(2, "0")}`,
        kind: "reply",
        title: `Someone replied to you (${i})`,
        slug: CARDS[i % CARDS.length].slug,
        readAt: i < 3 ? null : "2026-05-19T09:00:00.000Z",
        createdAt: "2026-05-19T09:00:00.000Z",
      })),
      unread: 3,
    };
  }
  if (pathname === `${M}/me/listings`) {
    return {
      listings: CARDS.slice(0, 5).map((c) => ({
        slug: c.slug,
        orgId: "org_000000000000000000000001",
        profileId: "prf_000000000000000000000001",
        tagline: c.tagline,
        visibility: "public",
        moderationState: "listed",
      })),
    };
  }
  // The WRITES an act performs. Answered, not counted: the acts lane is
  // about whether the browser reloads, not about what core does with the row.
  if (
    pathname.startsWith(`${M}/me/endorsements/`) ||
    pathname.startsWith(`${M}/me/follows/`) ||
    pathname.startsWith(`${M}/me/post-votes/`) ||
    pathname === `${M}/me/saved` ||
    pathname.startsWith(`${M}/me/saved/`)
  ) {
    return { ok: true };
  }
  if (pathname.startsWith(`${M}/me/overlay`)) {
    return {
      overlay: {
        saved: CARDS.slice(0, 5).map((c) => c.slug),
        endorsed: CARDS.slice(0, 3).map((c) => c.slug),
        savedCount: 5,
        requests: 1,
        listings: 5,
        handle: SAMPLE_HANDLE,
        profilePublic: true,
        follows: [],
        postVotes: [],
        unread: 3,
      },
    };
  }
  return undefined;
}

/** The fixture, wrapped: a sleep in front of every read, the authenticated
 *  surface added, and every request recorded so a route can be asked what it
 *  actually cost rather than believed. */
async function startGateway() {
  const inner = await startFixture(0);
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname + url.search);
    if (LATENCY > 0) await sleep(LATENCY);
    const authed = authedAnswer(url.pathname);
    if (authed !== undefined) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ data: authed, meta: { requestId: "req_probe", cursor: null } }));
      return;
    }
    const upstream = await fetch(`${inner.url}${url.pathname}${url.search}`, {
      headers: { accept: "application/json" },
    });
    const body = await upstream.text();
    res.writeHead(upstream.status, {
      "content-type": "application/json",
      "cache-control": upstream.headers.get("cache-control") ?? "no-store",
    });
    res.end(body);
  });
  await new Promise((ok) => server.listen(GW_PORT, "127.0.0.1", ok));
  return {
    url: `http://127.0.0.1:${GW_PORT}`,
    requests,
    close: async () => {
      server.close();
      await inner.close();
    },
  };
}

/** Every route whose prerender must go before a cold number means anything.
 *  Build-time prerendered paths, as `next build` writes them. */
const EVICT = [
  "index",
  SAMPLE_SLUG,
  "people",
  `people/${SAMPLE_HANDLE}`,
  `people/${SAMPLE_HANDLE}/upvoted`,
  `people/${SAMPLE_HANDLE}/comments`,
  "topics",
  "topics/developer-tools",
  "builds/upvoted",
  "builds/newest",
  "launches/2026-05-20",
  "collections",
  "collections/worth-a-look",
  "digest",
  "digest/2026-w21",
  "threads/thr_000000000000000000000001",
  "transparency",
  "docs",
  "docs/formulas",
  "docs/checks",
  "docs/api",
  "submit",
];

function evict() {
  // THE FETCH CACHE FIRST, and it is the one that matters — see the header.
  fs.rmSync(`${WEB_DIR}/.next/cache/fetch-cache`, { recursive: true, force: true });
  for (const name of EVICT) {
    for (const ext of [".html", ".rsc", ".meta"]) {
      try {
        fs.unlinkSync(`${WEB_DIR}/.next/server/app/${name}${ext}`);
      } catch {
        // A route that was not prerendered has nothing to evict.
      }
    }
  }
}

async function startWeb(gatewayUrl) {
  const env = {
    ...process.env,
    NEXT_PUBLIC_OPENPRODUCT_API_URL: gatewayUrl,
    NEXT_PUBLIC_DEPLOY_ENV: "stage",
    NEXT_PUBLIC_SITE_ORIGIN: "",
    NEXT_PUBLIC_CONSOLE_ORIGIN: "https://console.invalid",
  };
  const server = spawn("pnpm", ["exec", "next", "start", "-p", String(WEB_PORT)], {
    cwd: WEB_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // Its own process group, so the whole tree can be signalled — the same
    // reason `serve.mjs` does it, and the same EADDRINUSE if it is not.
    detached: true,
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.stderr.write(d));

  const base = `http://127.0.0.1:${WEB_PORT}`;
  // READINESS MUST NOT WARM A MEASURED ROUTE — an address no route claims.
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${base}/zzz-readiness-probe`, { signal: AbortSignal.timeout(4000) });
      if (res.status < 500) break;
    } catch {
      await sleep(500);
    }
  }
  return {
    base,
    stop: () => {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    },
  };
}

/** A session cookie the app genuinely accepts — the same shape `budgets.mjs`
 *  builds for its I6 check, for the same reason: a cookie the server discards
 *  would make every signed-in measurement a second anonymous one. */
function sessionCookie() {
  const session = {
    subjectId: "sub_000000000000000000000001",
    displayName: "Ada Lovelace",
    accessToken: "tok_fixture",
    expiresAt: Date.parse("2099-01-01T00:00:00.000Z"),
    refreshToken: "ref_fixture",
  };
  return Buffer.from(JSON.stringify(session), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (n) => Math.round(n);

/** The surfaces, grouped the way somebody navigates the product rather than
 *  the way the router lists them. */
const SURFACES = [
  ["Discover", "/", "Launch board"],
  ["Discover", `/${SAMPLE_SLUG}`, "Product listing"],
  ["Discover", "/topics", "Topics index"],
  ["Discover", "/topics/developer-tools", "One topic"],
  ["Discover", "/builds/upvoted", "Builds (upvoted)"],
  ["Discover", "/builds/newest", "Builds (newest)"],
  ["Discover", "/launches/2026-05-20", "One day's board"],
  ["Discover", "/collections", "Collections index"],
  ["Discover", "/collections/worth-a-look", "One collection"],
  ["Discover", "/digest", "Digest archive"],
  ["Discover", "/digest/2026-w21", "One week's digest"],
  ["People", "/people", "Contributors grid"],
  ["People", `/people/${SAMPLE_HANDLE}`, "Maker · launched"],
  ["People", `/people/${SAMPLE_HANDLE}/upvoted`, "Maker · upvoted"],
  ["People", `/people/${SAMPLE_HANDLE}/comments`, "Maker · comments"],
  ["Discussion", "/threads/thr_000000000000000000000001", "Thread"],
  ["Search", `/search?q=${SAMPLE_SLUG}`, "Search results"],
  ["Products", "/products/page-2", "Products, continued"],
  ["Docs", "/transparency", "Transparency report"],
  ["Docs", "/docs", "API docs"],
  ["Docs", "/docs/formulas", "Published formulas"],
  ["Docs", "/docs/checks", "Published checks"],
  ["Docs", "/docs/api", "API changelog"],
  ["Submit", "/submit", "List your product"],
  ["Account", "/me", "Your profile"],
  ["Account", "/me/saved", "Saved products"],
  ["Account", "/me/applications", "Applications"],
  ["Account", "/me/notifications", "Notifications"],
  ["Studio", "/studio", "Studio home"],
];

/** One control per act, named by what a visitor would click. */
const ACTS = [
  ["/", `form[id="vote-${SAMPLE_SLUG}"] button`, "upvote (feed row)"],
  [`/${SAMPLE_SLUG}`, 'form[id="save"] button', "save (listing)"],
  ["/topics", 'form[id^="follow-topic-"] button', "follow (topic card)"],
];

/** The hops a reader actually takes. */
const HOPS = [
  ["/", `/${SAMPLE_SLUG}`, "feed → listing"],
  ["/", "/collections", "feed → collections"],
  ["/", "/builds/upvoted", "feed → upvoted"],
  ["/", "/topics", "feed → topics"],
  [`/${SAMPLE_SLUG}`, "/", "listing → feed"],
  // The maker page is reached by its PRETTY form (`/@ada`), which the router
  // rewrites onto `/people/ada`. The pathname the browser commits is the
  // pretty one, so that is the destination this names — naming the rewritten
  // form made the hop report `—` for a link that is right there.
  ["/people", `/@${SAMPLE_HANDLE}`, "people → maker"],
];

async function head(base, path, cookie) {
  const t0 = performance.now();
  const res = await fetch(`${base}${path}`, {
    headers: { accept: "text/html", ...(cookie ? { cookie: `op_session=${cookie}` } : {}) },
    redirect: "manual",
  });
  const headerMs = performance.now() - t0;
  const body = await res.text();
  return {
    status: res.status,
    headerMs,
    bytes: Buffer.byteLength(body),
    cacheControl: res.headers.get("cache-control") ?? "",
  };
}

async function runServerTable(base, gw, cookie) {
  const rows = [];
  for (const [group, path, name] of SURFACES) {
    const authed = group === "Account" || group === "Studio";
    const c = authed ? cookie : null;
    const before = gw.requests.length;
    const cold = await head(base, path, c);
    const reads = gw.requests.length - before;
    const warms = [];
    for (let i = 0; i < 5; i++) warms.push((await head(base, path, c)).headerMs);
    rows.push({
      group,
      path,
      name,
      status: cold.status,
      coldMs: ms(cold.headerMs),
      warmMs: ms(median(warms)),
      bytes: cold.bytes,
      reads,
      cacheControl: cold.cacheControl,
    });
  }
  return rows;
}

/**
 * How long a click takes, and — the question a stopwatch cannot answer —
 * WHETHER IT IS A NAVIGATION AT ALL.
 *
 * On localhost a full document load is already cheap, so "a bit faster" and
 * "a different mechanism" look alike in milliseconds. So this plants a value
 * on `window` before the click and asks whether it survived: a marker that is
 * still there is a document that was never discarded, which is the whole claim
 * OPP1 makes and the one thing that cannot regress quietly.
 *
 * It also times TWO ways of arriving. `ui/link.tsx` sets `prefetch={false}` to
 * keep viewport prefetch from amplifying server reads — and Next still
 * prefetches on HOVER at that setting, which is prefetch on intent rather than
 * on speculation, and is measured here rather than assumed.
 */
async function runNav(browser, base, cookie) {
  const out = [];
  for (const [from, to, label] of HOPS) {
    const cold = [];
    const hovered = [];
    let soft = null;
    let reads = 0;
    for (const mode of ["cold", "cold", "cold", "hover", "hover", "hover"]) {
      const ctx = await browser.newContext();
      if (SIGNED_IN) {
        await ctx.addCookies([
          { name: "op_session", value: cookie, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false },
        ]);
      }
      const page = await ctx.newPage();
      try {
        await page.goto(`${base}${from}`, { waitUntil: "load" });
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          window.__probeNav = "planted";
        });
        // Matched by PATHNAME rather than by an href selector: the pretty
        // handle form (`/@ada`) and the route it rewrites to are the same
        // destination and a selector would see only one of them.
        const handle = await page.evaluateHandle(
          (target) =>
            [...document.querySelectorAll("a")].find((a) => {
              try {
                return new URL(a.href, location.origin).pathname === target;
              } catch {
                return false;
              }
            }) ?? null,
          to,
        );
        const el = handle.asElement();
        if (!el) break;
        await el.scrollIntoViewIfNeeded();
        if (mode === "hover") {
          await el.hover();
          await page.waitForTimeout(700);
        }
        const before = NAV_GATEWAY.requests.length;
        const t0 = performance.now();
        await el.click();
        await page.waitForURL(`**${to}`, { timeout: 10_000 });
        // One paint after the URL commits, so this is time-to-something-drawn
        // rather than time-to-history-entry.
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );
        const survived = await page.evaluate(() => window.__probeNav === "planted");
        soft = soft === null ? survived : soft && survived;
        reads = Math.max(reads, NAV_GATEWAY.requests.length - before);
        (mode === "hover" ? hovered : cold).push(performance.now() - t0);
      } catch {
        // A hop whose link is not on this page in this corpus.
      } finally {
        await ctx.close();
      }
    }
    out.push({
      label,
      soft,
      cold: cold.length ? ms(median(cold)) : null,
      hovered: hovered.length ? ms(median(hovered)) : null,
      reads,
    });
  }
  return out;
}

/** The gateway the nav lane counts reads against. Set in `main`, because
 *  `runNav` is called with the browser rather than the fixture. */
let NAV_GATEWAY = { requests: [] };


/**
 * Does an act still reload the page? (OPP2)
 *
 * The same question the nav lane asks, for the other half of the epic. Upvote,
 * save, follow and comment-vote were each a `<form method="post">` answered
 * with a `303`, so toggling one arrow cost a write, a redirect, a whole
 * document and a fresh hydration. `ui/use-toggle.ts` intercepts the submit
 * when — and only when — the overlay is `ready`, so the enhanced path is taken
 * by exactly the visitors it is correct for.
 *
 * A marker on `window` is what proves it, for the reason it proves the nav
 * lane: on localhost the reload was never slow enough for a stopwatch to
 * separate "faster" from "did not happen".
 *
 * SIGNED OUT IS ASSERTED TOO, and it asserts the OPPOSITE. A visitor whose
 * overlay is `absent` has no membership to move, so the enhancement declines
 * and the plain form posts — the page SHOULD leave, into sign-in. A lane that
 * only checked the happy path would pass just as well on a build that had
 * quietly broken the no-JS contract.
 */
async function runActs(browser, base, cookie) {
  const out = [];
  for (const [path, selector, label] of ACTS) {
    for (const signedIn of [true, false]) {
      const ctx = await browser.newContext();
      if (signedIn) {
        await ctx.addCookies([
          { name: "op_session", value: cookie, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false },
        ]);
      }
      const page = await ctx.newPage();
      let stayed = null;
      let moved = null;
      try {
        await page.goto(`${base}${path}`, { waitUntil: "load" });
        // Long enough for the overlay to land — the gate the hook checks.
        await page.waitForTimeout(900);
        const button = await page.$(selector);
        if (!button) {
          await ctx.close();
          continue;
        }
        const before = await button.innerText();
        await page.evaluate(() => {
          window.__probeAct = "planted";
        });
        await button.scrollIntoViewIfNeeded();
        await button.click();
        await page.waitForTimeout(600);
        stayed = await page
          .evaluate(() => window.__probeAct === "planted")
          .catch(() => false);
        // Only meaningful where the control draws a number.
        const after = stayed ? await button.innerText().catch(() => before) : before;
        moved = after !== before;
      } catch {
        stayed = false;
      } finally {
        await ctx.close();
      }
      out.push({ label, signedIn, stayed, moved });
    }
  }
  return out;
}

/** Registered per CONTEXT, and the context is fresh per run — see the header. */
const OBSERVE = () => {
  window.__probe = { lcp: 0, cls: 0, tbt: 0 };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__probe.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__probe.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__probe.tbt += Math.max(0, e.duration - 50);
  }).observe({ type: "longtask", buffered: true });
};

async function runVitals(browser, base, gw, cookie) {
  const out = [];
  for (const [group, path, name] of SURFACES) {
    const authed = group === "Account" || group === "Studio";
    // Anonymous cannot walk the authenticated half: `/me` redirects into
    // `/auth/start`, which redirects onward off this origin and destroys the
    // page context mid-measurement.
    if (authed && !SIGNED_IN) continue;
    const runs = [];
    let reads = null;
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext();
      if (SIGNED_IN) {
        await ctx.addCookies([
          { name: "op_session", value: cookie, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false },
        ]);
      }
      await ctx.addInitScript(OBSERVE);
      const page = await ctx.newPage();
      const before = gw.requests.length;
      await page.goto(`${base}${path}`, { waitUntil: "load" });
      // Long enough for the after-paint overlay to land and shift whatever it
      // is going to shift — the whole point of the signed-in pass.
      await page.waitForTimeout(900);
      const v = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] ?? {};
        const fcp = performance.getEntriesByName("first-contentful-paint")[0];
        return {
          ttfb: nav.responseStart ?? 0,
          fcp: fcp ? fcp.startTime : 0,
          lcp: window.__probe.lcp,
          cls: window.__probe.cls,
          tbt: window.__probe.tbt,
          load: nav.loadEventEnd ?? 0,
        };
      });
      if (i === 0) reads = gw.requests.slice(before);
      runs.push(v);
      await ctx.close();
    }
    out.push({
      group,
      path,
      name,
      ttfb: ms(median(runs.map((r) => r.ttfb))),
      fcp: ms(median(runs.map((r) => r.fcp))),
      lcp: ms(median(runs.map((r) => r.lcp))),
      cls: Number(median(runs.map((r) => r.cls)).toFixed(4)),
      tbt: ms(median(runs.map((r) => r.tbt))),
      load: ms(median(runs.map((r) => r.load))),
      reads,
    });
  }
  return out;
}

function table(rows, cols) {
  const widths = cols.map((c) => Math.max(c.head.length, ...rows.map((r) => String(c.get(r)).length)));
  const line = (cells) =>
    cells.map((v, i) => (cols[i].right ? String(v).padStart(widths[i]) : String(v).padEnd(widths[i]))).join("  ");
  console.log(line(cols.map((c) => c.head)));
  console.log(widths.map((w) => "─".repeat(w)).join("  "));
  for (const r of rows) console.log(line(cols.map((c) => c.get(r))));
}

async function main() {
  const lane = process.argv[2] ?? "server";
  evict();
  const gw = await startGateway();
  const web = await startWeb(gw.url);
  const cookie = sessionCookie();
  console.log(
    `probe: base=${web.base} upstream-latency=${LATENCY}ms signed-in=${SIGNED_IN} lane=${lane}`,
  );

  let browser;
  try {
    if (lane === "server" || lane === "all") {
      const rows = await runServerTable(web.base, gw, cookie);
      console.log("\n── server response ─────────────────────────────────────────────");
      console.log("cold = first request after eviction (a real SSR). warm = median of 5.\n");
      table(rows, [
        { head: "surface", get: (r) => r.name },
        { head: "route", get: (r) => r.path },
        { head: "st", get: (r) => r.status, right: true },
        { head: "cold", get: (r) => r.coldMs, right: true },
        { head: "warm", get: (r) => r.warmMs, right: true },
        { head: "rd", get: (r) => r.reads, right: true },
        { head: "KB", get: (r) => Math.round(r.bytes / 1024), right: true },
        { head: "cache-control", get: (r) => r.cacheControl.slice(0, 44) },
      ]);
      const silent = rows.filter((r) => r.reads === 0 && r.group !== "Docs" && r.path !== "/submit");
      if (silent.length > 0) {
        console.log(
          `\n  ⚠ ${silent.length} route(s) made NO upstream read on a cold request: ` +
            `${silent.map((r) => r.path).join(", ")}\n    A cache was not evicted, or the build points ` +
            `at the wrong gateway — the number above is about nothing.`,
        );
      }
    }

    if (lane === "vitals" || lane === "nav" || lane === "acts" || lane === "all") {
      browser = await chromium.launch({
        ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
      });
    }

    if (lane === "vitals" || lane === "all") {
      const rows = await runVitals(browser, web.base, gw, cookie);
      console.log("\n── browser vitals ──────────────────────────────────────────────");
      console.log(`median of 3, one fresh context each. signed-in=${SIGNED_IN}\n`);
      table(rows, [
        { head: "surface", get: (r) => r.name },
        { head: "route", get: (r) => r.path },
        { head: "ttfb", get: (r) => r.ttfb, right: true },
        { head: "fcp", get: (r) => r.fcp, right: true },
        { head: "lcp", get: (r) => r.lcp, right: true },
        { head: "cls", get: (r) => r.cls.toFixed(4), right: true },
        { head: "tbt", get: (r) => r.tbt, right: true },
        { head: "load", get: (r) => r.load, right: true },
        { head: "reads", get: (r) => (r.reads ? r.reads.length : "-"), right: true },
      ]);
    }

    if (lane === "acts" || lane === "all") {
      const rows = await runActs(browser, web.base, cookie);
      console.log("\n── acts (does the page still reload?) ─────────────────────────");
      console.log(
        "signed in: the enhancement runs, so the page must STAY.\n" +
          "signed out: it declines, so the form posts and the page must LEAVE.\n",
      );
      table(rows, [
        { head: "act", get: (r) => r.label },
        { head: "session", get: (r) => (r.signedIn ? "signed in" : "signed out") },
        { head: "page stayed", get: (r) => (r.stayed === null ? "—" : r.stayed ? "yes" : "no"), right: true },
        { head: "as it should", get: (r) => (r.stayed === r.signedIn ? "ok" : "WRONG"), right: true },
        { head: "label moved", get: (r) => (r.moved === null ? "—" : r.moved ? "yes" : "no"), right: true },
      ]);
      const wrong = rows.filter((r) => r.stayed !== r.signedIn);
      if (wrong.length > 0) {
        console.log(
          `\n  ⚠ ${wrong.length} act(s) behaved the wrong way round. Signed in and still ` +
            `reloading means the enhancement is not running; signed out and NOT reloading ` +
            `means the no-JS contract broke.`,
        );
      }
    }

    if (lane === "nav" || lane === "all") {
      NAV_GATEWAY = gw;
      const rows = await runNav(browser, web.base, cookie);
      console.log("\n── navigation (click → first paint of the next page) ───────────");
      console.log(
        "soft = the document was never discarded (a marker on `window` survived).\n" +
          "`—` = this corpus draws no link for that hop.\n",
      );
      table(rows, [
        { head: "hop", get: (r) => r.label },
        { head: "soft", get: (r) => (r.soft === null ? "—" : r.soft ? "yes" : "NO"), right: true },
        { head: "click", get: (r) => r.cold ?? "—", right: true },
        { head: "hover→click", get: (r) => r.hovered ?? "—", right: true },
        { head: "reads", get: (r) => r.reads, right: true },
      ]);
      const hard = rows.filter((r) => r.soft === false);
      if (hard.length > 0) {
        console.log(
          `\n  ⚠ ${hard.length} hop(s) still discard the document: ` +
            `${hard.map((r) => r.label).join(", ")}\n    A bare <a> to a same-origin page, ` +
            `where OPP1 wants ui/link.tsx's <AppLink>.`,
        );
      }
    }
  } finally {
    if (browser) await browser.close();
    web.stop();
    await gw.close();
  }
}

await main();
process.exit(0);
