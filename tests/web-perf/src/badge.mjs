// CS4 — the badge under load (openproduct-consumers).
//
// RE4 shipped the badge "rate-limited and dimension-locked" and recorded that
// its load test "needs a lane this repository does not have." This is the
// lane. It is the one address strangers hotlink — GitHub's image proxy
// fetches it on behalf of anybody reading any README that pasted it — so
// the properties worth a burst are the ones a burst could break: the box
// (a badge that reflows its container is a badge a maintainer removes), the
// headers that make the SVG safe to serve on the apex, the bytes being the
// same for every requester (I6, and what lets any proxy cache it), and the
// two addresses answering the same.
//
// WHAT THIS LANE CAN AND CANNOT EXERCISE. It runs against the build and the
// fixture, which stands in for the gateway: the badge route's read reaches
// the fixture, not a limiter, so CS1's 429 is NOT in this loop and the lane
// says so as a note rather than asserting a refusal it cannot provoke. The
// rate-limit half of RE4's sentence needs a deployed environment — and the
// status record says what it found when it looked at how the badge's read
// would meet that limiter.
//
// THE BURST: fifty addresses (every fixture listing at both addresses, and
// two that do not exist), four rounds, twenty-five in flight at a time —
// two hundred requests. Every served SVG is checked for the locked box;
// every repeat for identical bytes; every header for what RE4 promised.

import { CARDS } from "./fixture.mjs";

/** RE4's fixed height, and the cache-control the route sets (contracts/badge.ts). */
const BADGE_HEIGHT = 20;
const BADGE_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

const ROUNDS = 4;
const CONCURRENCY = 25;

function addresses() {
  const slugs = CARDS.map((c) => c.slug);
  return [
    ...slugs.map((slug) => `/badge/${slug}`),
    ...slugs.map((slug) => `/badge/${slug}.svg`),
    "/badge/not-a-listing",
    "/badge/also-missing.svg",
  ];
}

async function fetchOne(base, path) {
  const startedAt = performance.now();
  const res = await fetch(base + path, { headers: { accept: "image/svg+xml,image/*;q=0.8,*/*;q=0.5" } });
  const body = await res.text();
  return {
    path,
    status: res.status,
    ms: performance.now() - startedAt,
    contentType: res.headers.get("content-type"),
    cacheControl: res.headers.get("cache-control"),
    nosniff: res.headers.get("x-content-type-options"),
    csp: res.headers.get("content-security-policy"),
    body,
  };
}

async function burst(base, paths) {
  const out = [];
  for (let i = 0; i < paths.length; i += CONCURRENCY) {
    const slice = paths.slice(i, i + CONCURRENCY);
    out.push(...(await Promise.all(slice.map((p) => fetchOne(base, p)))));
  }
  return out;
}

/** The box an SVG declares: width/height attributes, the viewBox, the background rect. */
function boxOf(svg) {
  const width = /<svg[^>]*\swidth="(\d+)"/.exec(svg)?.[1] ?? null;
  const height = /<svg[^>]*\sheight="(\d+)"/.exec(svg)?.[1] ?? null;
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const rect = /<rect width="(\d+)" height="(\d+)"/.exec(svg);
  return {
    width: width === null ? null : Number(width),
    height: height === null ? null : Number(height),
    viewBox: viewBox ? [Number(viewBox[1]), Number(viewBox[2])] : null,
    rect: rect ? [Number(rect[1]), Number(rect[2])] : null,
    fitted: /textLength="/.test(svg),
    script: /<script/i.test(svg),
  };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

export async function runBadge(base) {
  console.log(`web-badge: base=${base} addresses=${addresses().length} rounds=${ROUNDS} concurrency=${CONCURRENCY}`);
  let failures = 0;
  const check = (name, ok, detail) => {
    if (!ok) failures += 1;
    console.log(`[badge] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const paths = addresses();
  const rounds = [];
  const wall = [];
  for (let r = 0; r < ROUNDS; r += 1) {
    const startedAt = performance.now();
    rounds.push(await burst(base, paths));
    wall.push(Math.round(performance.now() - startedAt));
  }
  const all = rounds.flat();
  const latencies = all.map((r) => r.ms);
  const histogram = {};
  for (const r of all) histogram[r.status] = (histogram[r.status] ?? 0) + 1;
  console.log(
    `[badge] NOTE  ${all.length} requests · rounds ${wall.map((w) => `${w} ms`).join(" / ")} · latency p50 ${Math.round(percentile(latencies, 0.5))} ms · p95 ${Math.round(percentile(latencies, 0.95))} ms · max ${Math.round(Math.max(...latencies))} ms · statuses ${JSON.stringify(histogram)}`,
  );
  console.log(
    "[badge] NOTE  the limiter is not in this loop: the badge's read reaches the fixture, not the gateway, so CS1's 429 cannot be provoked here — the rate-limit half of RE4's sentence needs a deployed environment (recorded in the consumers epic's status)",
  );

  // ── the statuses ──
  const listed = all.filter((r) => !r.path.includes("missing") && !r.path.includes("not-a-listing"));
  const missing = all.filter((r) => r.path.includes("missing") || r.path.includes("not-a-listing"));
  check(
    `every listed address answers 200 in every round, and the two that do not exist answer 404 — ${listed.length} + ${missing.length}`,
    listed.every((r) => r.status === 200) && missing.every((r) => r.status === 404),
    JSON.stringify(histogram),
  );
  check("no request was refused or failed — no 429, no 5xx (the limiter is not here; a 5xx would be ours)", all.every((r) => r.status < 429), JSON.stringify(histogram));

  // ── the box ──
  const served = listed.filter((r) => r.status === 200);
  const boxes = served.map((r) => ({ path: r.path, ...boxOf(r.body) }));
  const locked = boxes.every(
    (b) =>
      b.height === BADGE_HEIGHT &&
      b.width !== null &&
      b.width > 0 &&
      b.viewBox !== null &&
      b.viewBox[0] === b.width &&
      b.viewBox[1] === BADGE_HEIGHT &&
      b.rect !== null &&
      b.rect[0] === b.width &&
      b.rect[1] === BADGE_HEIGHT &&
      b.fitted &&
      !b.script,
  );
  const widths = [...new Set(boxes.map((b) => b.width))].sort((a, b) => a - b);
  check(
    `every served SVG is the locked box: height ${BADGE_HEIGHT}, width = viewBox = rect, text fitted with textLength, no script — ${served.length} SVGs`,
    locked,
    `widths ${JSON.stringify(widths)} · first offender ${JSON.stringify(boxes.find((b) => !(b.height === BADGE_HEIGHT && b.viewBox && b.viewBox[0] === b.width)) ?? null)}`,
  );
  // A badge says `listed` or `#n of m`: a handful of widths over the whole corpus, never one per request.
  check("the widths are a vocabulary, not a measurement — at most four distinct over fifty addresses", widths.length >= 1 && widths.length <= 4, JSON.stringify(widths));

  // ── the headers ──
  const headersRight = served.every(
    (r) =>
      (r.contentType ?? "").startsWith("image/svg+xml") &&
      r.cacheControl === BADGE_CACHE_CONTROL &&
      r.nosniff === "nosniff" &&
      /default-src 'none'/.test(r.csp ?? "") &&
      /sandbox/.test(r.csp ?? ""),
  );
  check(
    "every served SVG carries RE4's headers: image/svg+xml, the hour of cache, nosniff, a sandboxed CSP",
    headersRight,
    JSON.stringify({ contentType: served[0]?.contentType, cacheControl: served[0]?.cacheControl, nosniff: served[0]?.nosniff, csp: served[0]?.csp }),
  );

  // ── the bytes ──
  const byPath = new Map();
  for (const r of served) {
    const set = byPath.get(r.path) ?? new Set();
    set.add(r.body);
    byPath.set(r.path, set);
  }
  const drift = [...byPath.entries()].filter(([, set]) => set.size !== 1).map(([p]) => p);
  check(`the repeats are byte-identical: one body per address across ${ROUNDS} rounds (I6 — what lets any proxy cache it)`, drift.length === 0, drift.length ? `drift on ${drift.slice(0, 3).join(", ")}` : `${byPath.size} addresses`);
  const pairsAgree = CARDS.every((c) => {
    const bare = byPath.get(`/badge/${c.slug}`);
    const ext = byPath.get(`/badge/${c.slug}.svg`);
    return bare && ext && [...bare][0] === [...ext][0];
  });
  check("both addresses answer the same bytes — `/badge/<slug>` and `/badge/<slug>.svg`", pairsAgree);

  console.log(failures === 0 ? "web-badge: ALL CHECKS PASS" : `web-badge: ${failures} FAILED`);
  return failures === 0 ? 0 : 1;
}
