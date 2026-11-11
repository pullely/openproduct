// Every interactive target, measured (openproduct-worldclass FR2).
//
// THE DONE-WHEN ASKS FOR AN AUTOMATED PASS OVER THE RENDERED ROUTES, and this
// is it. It is a script rather than a `*.test.ts` because it needs a browser:
// target size is a property of the rendered box, and the box depends on the
// stylesheet, the viewport and the font — none of which a module-level test
// lane can see. This repository has no browser lane, so the pass is run by
// hand and its output is pasted into IMPLEMENTATION-STATUS beside the
// milestone it verifies. Wiring it into CI is a lane, not a milestone.
//
//   1. build and serve the app
//        cd apps/openproduct/web
//        pnpm exec next build && pnpm exec next start -p 3010
//   2. run the pass
//        node apps/openproduct/tests/web/tools/target-size.mjs / /my-product /docs
//
// It needs `playwright-core` and a Chromium; on a machine with neither, the
// numbers in IMPLEMENTATION-STATUS are what it printed when FR2 shipped.
//
// ─── WHAT COUNTS, AND WHAT THE EXCEPTIONS ARE ─────────────────────────────
//
// WCAG 2.5.5 asks for 44×44 and carves out two cases, and both are applied
// here mechanically rather than by an allowlist somebody has to maintain:
//
//   INLINE  a link "in a sentence or block of text". Computed `display:
//           inline` IS that test — an inline-level box sits in a line of text
//           by construction, and every standalone control in this design is
//           given a block, flex or grid display by the class that makes it
//           look like a control.
//   HIDDEN  anything inside `.sr-only`, which is a 1×1 clip until focused.
//
// An earlier draft also required an inline link to have a text-node sibling
// with words in it. That turned out to depend on the DATA — one footnote link
// lost its second clause on a listing with no observed count — and a
// target-size rule that changes with the contents of the page is not a rule.

import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://127.0.0.1:3016";
const routes = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const all = new Map();
for (const route of routes) {
  const res = await page.goto(base + route, { waitUntil: "networkidle", timeout: 45000 }).catch(() => null);
  if (!res) { console.log("ERR", route); continue; }
  const rows = await page.evaluate(() => {
    const out = [];
    // WCAG 2.5.5's own exceptions, applied mechanically rather than by an
    // allowlist somebody has to maintain:
    //   INLINE   a link inside a sentence or block of text. Computed
    //            `display: inline` AND a text-node sibling with words in it.
    //   HIDDEN   `sr-only`, which is a 1×1 clip until it is focused.
    // COMPUTED `display: inline` IS THE TEST, and it is the mechanical
    // reading of the exception rather than a loose one: an inline-level link
    // sits in a line of text by construction — that is what inline means —
    // and every standalone control in this design is given a block, flex or
    // grid display by the class that makes it look like a control. The
    // earlier draft also required a text-node sibling, which turned out to
    // depend on the DATA: one footnote link lost its second clause when the
    // listing had no observed count, and a target-size rule that changes with
    // the contents of the page is not a rule.
    const inline = (el) => getComputedStyle(el).display === "inline";
    // A STRETCHED LINK IS AS BIG AS WHAT IT STRETCHES OVER. `after:absolute
    // after:inset-0` makes the whole row the target, and the anchor's own
    // rect says nothing about that — so where a link carries such an
    // `::after`, the box measured is the pseudo-element's containing block,
    // which is the nearest positioned ancestor. Without this the pattern that
    // gives a reader a 76px row would be reported as a 20px failure.
    const targetRect = (el) => {
      const after = getComputedStyle(el, "::after");
      const stretched =
        after.position === "absolute" &&
        ["top", "right", "bottom", "left"].every((side) => after[side] === "0px");
      if (!stretched) return el.getBoundingClientRect();
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (getComputedStyle(node).position !== "static") return node.getBoundingClientRect();
      }
      return el.getBoundingClientRect();
    };
    for (const el of document.querySelectorAll("a,button,input,select,textarea,summary,[role=button],[role=link]")) {
      const r = targetRect(el);
      if (r.width === 0 || r.height === 0) continue;
      if (r.height >= 44 && r.width >= 44) continue;
      if (el.closest(".sr-only")) continue;
      if (inline(el)) continue;
      const cls = (el.getAttribute("class") || "").split(/\s+/).slice(0, 4).join(" ");
      out.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30),
        w: Math.round(r.width), h: Math.round(r.height),
        cls,
      });
    }
    return out;
  });
  for (const r of rows) {
    const key = `${r.tag}|${r.cls}|${r.h}`;
    if (!all.has(key)) all.set(key, { ...r, routes: new Set(), n: 0 });
    const e = all.get(key); e.routes.add(route); e.n += 1;
  }
  console.log(`${route}  ${rows.length} under 44`);
}
console.log("\n=== distinct offenders, most frequent first ===");
for (const e of [...all.values()].sort((a, b) => b.n - a.n)) {
  console.log(`${String(e.n).padStart(3)}×  ${e.tag} ${e.w}×${e.h}  "${e.text}"  [${e.cls}]  ${[...e.routes].slice(0,3).join(",")}`);
}
await browser.close();
