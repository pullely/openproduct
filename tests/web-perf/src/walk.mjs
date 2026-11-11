// XP4 — the close-out route walk.
//
// THE MV9 DISCIPLINE, which is a way of looking rather than a checklist: open
// every route at both ends of the viewport and write down what got
// TRUNCATED, what got DROPPED, and what got DRAWN TOO SMALL. Those three
// verbs cover almost everything a responsive layout gets wrong, and none of
// them shows up in a unit test or in a screenshot somebody scrolled past.
//
// THIS IS A REPORT, NOT A GATE. It exits 0 unless it crashes, and it prints
// markdown meant to be read and then acted on — the gating lanes are
// `budgets.mjs` and `a11y.mjs`, and anything this walk finds that is worth
// enforcing forever belongs in one of those instead. A walk that failed CI
// would either be a second, weaker a11y lane or a wall of noise nobody reads;
// its value is that a person looks at the output once, at the end of an epic,
// and closes what it found.
//
// WHAT IT CAN AND CANNOT SEE. Public routes are walked with the fixture
// behind them, so they carry real content. The STUDIO routes are walked
// SIGNED OUT: the fixture answers openproduct's public reads and not its
// maintainer ones, so a signed-in studio would render its error state and the
// walk would be measuring that. Signed out is a real state with a real
// layout — it is what an unauthenticated visitor who follows a studio link
// actually gets — and the report says which of the two it looked at rather
// than implying it covered both.

import { chromium } from "playwright";

import { ROUTES } from "./fixture.mjs";

/** The two ends. 390 is the design's stated small end (XP-4); 1280 is a
 *  laptop, and the width every other lane here measures at. */
const WIDTHS = [
  { label: "390 (phone)", width: 390, height: 844, mobile: true, tapMin: 44 },
  { label: "1280 (laptop)", width: 1280, height: 900, mobile: false, tapMin: 24 },
];

/** Body text below this is a legibility defect rather than a type choice. */
const MIN_TEXT_PX = 12;

/** The maintainer surfaces. Walked signed out — see the note above. */
const STUDIO_ROUTES = [
  "/studio",
  "/studio/appeals",
  "/studio/reports",
  "/studio/collections",
  "/studio/link",
  "/me",
  "/me/saved",
  "/me/applications",
  // NF0 — the inbox. Signed out like the rest of this list, and for the same
  // reason: the fixture answers openproduct's public reads and not a person's
  // own, so a "signed in" walk here would be measuring an error state.
  "/me/notifications",
];

async function inspect(page, screenWidth, tapMin, minTextPx) {
  return page.evaluate(
    ({ screenWidth, tapMin, minTextPx }) => {
      const EPS = 1;
      const describe = (el) => {
        const cls =
          typeof el.className === "string"
            ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".")
            : "";
        const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 44);
        return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${text ? ` «${text}»` : ""}`;
      };
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      };

      // ── DROPPED ──
      //
      // What a reader can reach here. Compared between the two widths by the
      // caller: a destination present at one width and absent at the other
      // has either been deliberately moved into a menu or silently lost, and
      // the difference is a decision somebody should have made on purpose.
      const reachable = [...document.querySelectorAll("a[href]")]
        .filter(visible)
        .map((a) => a.getAttribute("href"))
        .filter((h) => h && !h.startsWith("http"));

      // ── TRUNCATED ──
      //
      // Only where the page ASKED for an ellipsis and the text then did not
      // fit. An element clipped without `text-overflow` is a different bug
      // (it is the sideways-scroll one below); an ellipsis that never
      // triggers is not a finding at all.
      const truncated = [];
      for (const el of document.querySelectorAll("*")) {
        if (!visible(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.textOverflow !== "ellipsis") continue;
        if (el.scrollWidth <= el.clientWidth + EPS) continue;
        truncated.push(`${describe(el)} needs ${el.scrollWidth}px in ${el.clientWidth}px`);
        if (truncated.length >= 8) break;
      }

      // ── TOO SMALL: text ──
      const smallText = [];
      const seenText = new Set();
      for (const el of document.querySelectorAll("p, li, span, td, dd, dt, small, label, figcaption")) {
        if (!visible(el)) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
        if (!own) continue;
        const size = Number.parseFloat(getComputedStyle(el).fontSize);
        if (!(size < minTextPx)) continue;
        const key = `${Math.round(size)}:${describe(el)}`;
        if (seenText.has(key)) continue;
        seenText.add(key);
        smallText.push(`${size}px ${describe(el)}`);
        if (smallText.length >= 6) break;
      }

      // ── TOO SMALL: targets ──
      //
      // Chrome only. In prose the target is the sentence, and a minimum-size
      // rule there would flag every inline link in the estate's own writing.
      const chrome = [document.querySelector("header"), document.querySelector('nav[aria-label="Primary"]')].filter(Boolean);
      const smallTargets = [];
      const seenTargets = new Set();
      for (const root of chrome) {
        for (const el of root.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]), select, summary')) {
          if (seenTargets.has(el) || !visible(el)) continue;
          seenTargets.add(el);
          const r = el.getBoundingClientRect();
          if (Math.ceil(Math.min(r.width, r.height)) >= tapMin) continue;
          smallTargets.push(`${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      }

      // ── SIDEWAYS ──
      //
      // An element wider than the screen is fine under a scroller — that is
      // how a wide table is supposed to be spelled — and a defect without
      // one. Report the deepest overflowing box rather than the widest: the
      // widest is usually a bar dutifully filling a viewport something else
      // already widened, and the deepest is the address of the cause.
      const scrolls = (el) => {
        for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
        }
        return false;
      };
      const causes = [];
      for (const el of document.body.querySelectorAll("*")) {
        if (el.scrollWidth <= el.clientWidth + EPS || el.clientWidth === 0) continue;
        if (getComputedStyle(el).overflowX !== "visible") continue;
        if ([...el.children].some((c) => c.scrollWidth > c.clientWidth + EPS)) continue;
        if (scrolls(el)) continue;
        causes.push(`${describe(el)} needs ${el.scrollWidth}px in ${el.clientWidth}px`);
        if (causes.length >= 4) break;
      }
      const sideways =
        document.documentElement.scrollWidth > screenWidth + EPS
          ? { over: document.documentElement.scrollWidth - screenWidth, causes }
          : null;

      // ── Did it render at all ──
      const shell = /Something went wrong|Application error|404/i.test(
        document.body.innerText.slice(0, 400),
      );
      const h1 = document.querySelector("h1")?.textContent?.trim().slice(0, 60) ?? null;

      return { reachable, truncated, smallText, smallTargets, sideways, shell, h1 };
    },
    { screenWidth, tapMin, minTextPx },
  );
}

export async function runWalk(base) {
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });

  const lines = [];
  const say = (s = "") => {
    lines.push(s);
    console.log(s);
  };

  try {
    const routes = [
      ...ROUTES.map((r) => ({ path: r.path, name: r.name, kind: "public" })),
      ...STUDIO_ROUTES.map((p) => ({ path: p, name: "studio/personal, signed out", kind: "studio" })),
    ];

    say("# XP4 route walk");
    say();
    say(
      `${routes.length} routes × ${WIDTHS.length} widths. Public routes carry the fixture's corpus; ` +
        "studio and `/me` routes are walked SIGNED OUT, which is the state the fixture can render honestly.",
    );
    say();

    const findings = [];
    for (const route of routes) {
      const perWidth = {};
      for (const w of WIDTHS) {
        const context = await browser.newContext({
          viewport: { width: w.width, height: w.height },
          ...(w.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
        });
        const page = await context.newPage();
        try {
          await page.goto(base + route.path, { waitUntil: "load", timeout: 30000 });
          await page.waitForTimeout(1500);
          // A SIGN-IN BOUNCE IS NOT A FAILURE TO WALK. Every studio and `/me`
          // route redirects when signed out, and a redirect that lands while
          // `evaluate` is in flight throws "Execution context was destroyed" —
          // which reads like a broken page and is a working one. Settle, then
          // look again, and record where it actually sent us.
          perWidth[w.label] = await inspect(page, w.width, w.tapMin, MIN_TEXT_PX).catch(async () => {
            await page.waitForLoadState("load").catch(() => {});
            await page.waitForTimeout(1200);
            return inspect(page, w.width, w.tapMin, MIN_TEXT_PX);
          });
          const url = new URL(page.url());
          const ours = url.origin === new URL(base).origin;
          if (!ours) {
            // The sign-in bounce leaves for the platform's authorization
            // server, which this lane has no business reaching. Say so — a
            // browser's own "cannot be reached" page has clean landmarks and
            // no truncation, and reporting it as a clean route would be the
            // OD5 mistake in report form.
            perWidth[w.label] = { leftTheSite: page.url().slice(0, 90) };
          } else if (url.pathname !== route.path) {
            perWidth[w.label].redirectedTo = url.pathname;
          }
        } catch (err) {
          perWidth[w.label] = { error: String(err).slice(0, 120) };
        }
        await context.close();
      }

      const problems = [];
      for (const w of WIDTHS) {
        const r = perWidth[w.label];
        if (!r) continue;
        if (r.error) {
          problems.push(`${w.label}: could not be walked — ${r.error}`);
          continue;
        }
        if (r.leftTheSite) {
          problems.push(`${w.label}: bounced off-site to ${r.leftTheSite} — not walkable here`);
          continue;
        }
        if (r.shell) problems.push(`${w.label}: rendered an error or 404, not the surface`);
        if (r.sideways) {
          problems.push(
            `${w.label}: **body scrolls sideways** by ${r.sideways.over}px` +
              (r.sideways.causes.length ? ` — ${r.sideways.causes.join("; ")}` : ""),
          );
        }
        for (const t of r.truncated) problems.push(`${w.label}: truncated — ${t}`);
        for (const t of r.smallText) problems.push(`${w.label}: text under ${MIN_TEXT_PX}px — ${t}`);
        for (const t of r.smallTargets) problems.push(`${w.label}: chrome target under ${w.tapMin}px — ${t}`);
      }

      // DROPPED: destinations present at one width and gone at the other.
      const [a, b] = WIDTHS.map((w) => new Set(perWidth[w.label]?.reachable ?? []));
      // Skip the diff where one side never rendered — "everything dropped" is
      // not a finding about the layout.
      if (WIDTHS.some((w) => !perWidth[w.label]?.reachable)) { a.clear(); b.clear(); }
      const lostOnPhone = [...b].filter((h) => !a.has(h));
      const lostOnDesktop = [...a].filter((h) => !b.has(h));
      if (lostOnPhone.length) problems.push(`dropped at 390: ${lostOnPhone.slice(0, 8).join(", ")}`);
      if (lostOnDesktop.length) problems.push(`dropped at 1280: ${lostOnDesktop.slice(0, 8).join(", ")}`);

      const head = perWidth[WIDTHS[1].label];
      const bounce = head?.redirectedTo ? ` → \`${head.redirectedTo}\`` : "";
      const label = `\`${route.path}\`${route.kind === "studio" ? " _(signed out)_" : ""}${bounce}`;
      if (problems.length === 0) {
        say(`- ${label} — clean at both widths${head?.h1 ? ` · h1 “${head.h1}”` : ""}`);
      } else {
        say(`- ${label} — ${problems.length} finding(s)`);
        for (const p of problems) say(`  - ${p}`);
        findings.push({ route: route.path, problems });
      }
    }

    say();
    say(
      findings.length === 0
        ? "**Nothing found.** Every route holds at both widths."
        : `**${findings.length} route(s) with findings**, ${findings.reduce((n, f) => n + f.problems.length, 0)} in total.`,
    );
  } finally {
    await browser.close();
  }

  return 0;
}
