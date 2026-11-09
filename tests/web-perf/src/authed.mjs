// The authenticated walk (openproduct-verification OV4).
//
// The public lanes walk what anybody can see. This walks what only a signed-in
// person sees — every route under /me/** and /studio/** — the gap the
// worldclass epic carried from FR3 and closed only for IN1's five studio
// steps. Signed in the way `studio.mjs` proved: the `op_session` cookie the
// fixture gateway honours (the cookie is not the authority; the gateway is).
//
// Three things per route: it RENDERED (a string the real page carries and its
// failure panel does not), the a11y sweep the public routes get (named
// controls, one h1, a skip link, no positive tabindex, landmarks), and axe at
// desktop/light and phone/dark against the same tag set as the public lane.
// Then the door itself: signed out, the same addresses go to sign-in and back.

import { createRequire } from "node:module";
import { chromium } from "playwright";

import { AUTHED_ROUTES, sessionCookie } from "./fixture.mjs";
import { TAP_MIN, sweepPage } from "./a11y.mjs";
import { newRampContext } from "./ramp.mjs";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PASSES = [
  { id: "desktop/light", viewport: { width: 1280, height: 900 }, colorScheme: "light" },
  { id: "phone/dark", viewport: { width: 375, height: 812 }, colorScheme: "dark" },
];

const failures = [];
function check(name, ok, detail) {
  console.log(`[authed] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

function summarise(v) {
  const where = v.nodes
    .slice(0, 3)
    .map((n) => {
      const target = Array.isArray(n.target) ? n.target.join(" ") : String(n.target);
      const why = (n.failureSummary ?? "").split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim();
      return `${target}${why ? ` [${why.slice(0, 120)}]` : ""}`;
    })
    .join(" ; ");
  return `${v.id}×${v.nodes.length}: ${where}${v.nodes.length > 3 ? ` (+${v.nodes.length - 3} more)` : ""}`;
}

function problemsOf(s) {
  const problems = [];
  if (s.unnamed.length) problems.push(`unnamed controls: ${s.unnamed.join("; ")}`);
  if (s.nested.length) problems.push(`nested interactives: ${s.nested.join("; ")}`);
  if (s.positiveTabindex.length) problems.push(`positive tabindex: ${s.positiveTabindex.join("; ")}`);
  if (s.images.length) problems.push(`images with no alt: ${s.images.join("; ")}`);
  if (s.fields.length) problems.push(`unlabelled form controls: ${s.fields.join("; ")}`);
  if (s.h1Count !== 1) problems.push(`${s.h1Count} h1 (want exactly 1)`);
  if (s.skips.length) problems.push(`heading levels skip: ${s.skips.join("; ")}`);
  if (s.mains !== 1) problems.push(`${s.mains} main landmarks (want exactly 1)`);
  if (s.unnamedNavs.length) problems.push(`unnamed navigation landmarks: ${s.unnamedNavs.join("; ")}`);
  if (s.small.length) problems.push(`shell controls under ${TAP_MIN}px: ${s.small.join("; ")}`);
  if (!s.lang) problems.push("<html> has no lang");
  if (!s.skipLink) problems.push("no skip link as the first tab stop");
  if (s.skipLink && !s.skipTargetExists) problems.push(`the skip link points at ${s.skipHref}, which is not on the page`);
  return problems;
}

export async function runAuthed(base) {
  console.log(`web-authed: base=${base} routes=${AUTHED_ROUTES.length}`);
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });
  try {
    // ── signed in: rendered, swept, and clean under axe twice ──────────
    for (const pass of PASSES) {
      const context = await newRampContext(browser, { viewport: pass.viewport, colorScheme: pass.colorScheme });
      await context.addCookies(sessionCookie(base));
      const page = await context.newPage();
      for (const route of AUTHED_ROUTES) {
        const res = await page.goto(base + route.path, { waitUntil: "networkidle" });
        const status = res?.status();
        const html = await page.content();
        if (status !== 200 || !html.includes(route.expect)) {
          check(
            `${pass.id} ${route.path}: rendered`,
            false,
            `status ${status}, "${route.expect}" ${html.includes(route.expect) ? "present" : "absent"} — nothing below is about this page`,
          );
          continue;
        }
        if (pass.id === PASSES[0].id) {
          const s = await sweepPage(page);
          const problems = problemsOf(s);
          check(
            `sweep ${route.path}`,
            problems.length === 0,
            problems.join(" | ") || `clean (${s.controlCount} controls, h1 “${s.h1}”, skip link “${s.skipLink}”)`,
          );
        }
        await page.addScriptTag({ path: AXE_PATH });
        const result = await page.evaluate(
          async (t) =>
            await window.axe.run(document, { runOnly: { type: "tag", values: t }, resultTypes: ["violations"] }),
          TAGS,
        );
        check(
          `${pass.id} ${route.path}`,
          result.violations.length === 0,
          result.violations.length ? result.violations.map(summarise).join(" || ") : `clean`,
        );
      }
      await context.close();
    }

    // ── signed out: the same addresses are a door, not a page ──────────
    //
    // The pages redirect FROM THE STREAM: a `loading.tsx` sits above their
    // session read, so the status is 200 and the redirect is a script the
    // browser runs after the shell arrives (`[slug]/page.tsx` records the
    // rule the other way round). A route handler (`/me/export`) answers 303.
    // Either way the visitor ends at sign-in with their address kept — that
    // is what is checked — and the lane waits for the URL to land rather than
    // reading it at `load`, which the first run showed is before the script.
    {
      const context = await browser.newContext({ viewport: PASSES[0].viewport });
      const page = await context.newPage();
      for (const path of ["/me", "/me/saved", "/me/export", "/studio", "/studio/reports"]) {
        const res = await page.goto(base + path, { waitUntil: "load" });
        // `res` is the LAST response of the navigation: after an HTTP redirect
        // it is the sign-in page's 200, and `redirectedFrom()` says so. A page
        // that redirects from the stream answers 200 itself and nothing was
        // redirected from — the two read differently here on purpose.
        const viaHttp = res?.request().redirectedFrom() !== null;
        const firstStatus = res?.status();
        let landed = null;
        try {
          await page.waitForURL((u) => u.pathname === "/signin", { timeout: 15000 });
          landed = new URL(page.url());
        } catch {
          landed = new URL(page.url());
        }
        const returnTo = landed.searchParams.get("return_to");
        // Two conventions, both honest: the page sends the visitor to the door,
        // or renders the gate as a page with the door on it (the moderation
        // queues and collections do the second). Either keeps their address.
        const door = `/signin?return_to=${encodeURIComponent(path)}`;
        const gateOnPage =
          landed.pathname === path &&
          (await page.evaluate((href) => document.querySelector(`main a[href="${href}"]`) !== null, door));
        const redirected = landed.pathname === "/signin" && returnTo === path;
        check(
          `signed out ${path}: sign-in, and back to where they were going`,
          redirected || gateOnPage,
          redirected
            ? `${landed.pathname}?return_to=${returnTo} (${viaHttp ? "an HTTP redirect" : "redirected from the stream: the page answered 200"})`
            : gateOnPage
              ? `${firstStatus}: the gate rendered as a page, with the door to ${door} on it`
              : `${firstStatus} → ${landed.pathname}?return_to=${returnTo}, and no door on the page`,
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.log(`web-authed: ${failures.length} FAILED → ${failures.join(" | ")}`);
    return 1;
  }
  console.log("web-authed: ALL CHECKS PASS");
  return 0;
}
