// XP4 — the accessibility lane.
//
// "KEYBOARD AND SCREEN-READER WALKED, NOT AUDITED BY A LINTER ALONE" is the
// milestone's own wording, and it is a statement about where the check runs.
// A linter reads JSX and can tell you an `<img>` has no `alt`. It cannot tell
// you that the account menu's trigger never gets focus back when the menu
// closes, that a control renders 38px tall under this app's 14px root, or that
// a tab's `aria-controls` points at an id the panel does not actually have —
// all of which are properties of a rendered document, and all of which are
// what a person using this estate with a keyboard or a screen reader runs
// into first.
//
// So this drives a real browser over the real routes, and every assertion is
// about what the accessibility tree and the layout actually say.
//
// TWO CLASSES OF CHECK:
//
//   THE SWEEP    runs on every route: landmarks, the heading outline, names on
//                every focusable thing, no interactive element nested inside
//                another, no positive tabindex, alt text, form labelling, and
//                a visible focus indicator.
//
//   THE NAMED    the five surfaces XP4 lists by name — the product row's three
//   CONTROLS     click targets, the product page's outline, the account menu,
//                the composer and the facet checkboxes — each walked with the
//                keyboard.
//
// WHAT THIS DOES NOT CLAIM. It is not an audit and does not replace one: no
// automated pass can tell you whether a label is the RIGHT word, whether a
// reading order makes sense, or whether an interaction is understandable. It
// pins the mechanical properties so that the human pass has somewhere to
// start, and so that what a human pass fixed stays fixed.

import { chromium } from "playwright";

import { ROUTES, SAMPLE_SLUG, SAMPLE_THREAD } from "./fixture.mjs";

/**
 * Minimum target size for a control in the SHELL, in CSS px, AT THIS WIDTH.
 *
 * 24, not 44, and the difference is the viewport rather than a softer
 * standard. WCAG 2.2's Target Size (Minimum) is 24×24 and applies to a
 * pointer of any kind; the 44px figure is the finger-first rule, and it
 * belongs to the phone width — where the route walk (`walk.mjs`) applies it.
 * Holding a 1280px desktop header to 44px would fail the estate's whole
 * navigation for being 34px tall with a mouse pointing at it, which is not a
 * defect and would teach the next person to ignore this lane.
 *
 * Scoped to chrome either way: a link inside a paragraph has the sentence as
 * its target, and a minimum-size rule there is the wrong rule.
 */
export const TAP_MIN = 24;

const failures = [];
function check(name, ok, detail) {
  console.log(`[a11y] ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

/**
 * Everything the sweep needs, computed in the page.
 *
 * ONE `evaluate` RATHER THAN TWENTY, because each round trip is a
 * serialisation boundary and a place for a selector to go stale; and because
 * the accessible-name computation below has to be defined once and applied
 * identically everywhere, or two checks end up disagreeing about whether a
 * control is named.
 */
export async function sweepPage(page) {
  return page.evaluate((TAP_MIN) => {
    const describe = (el) => {
      const cls =
        typeof el.className === "string"
          ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".")
          : "";
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}${
        text ? ` «${text}»` : ""
      }`;
    };

    /**
     * The accessible name, near enough.
     *
     * Not the full accname algorithm — that is a specification, not a
     * function — but the branches that decide whether a control HAS a name at
     * all, in the order the algorithm takes them. Anything this returns empty
     * is announced by a screen reader as its role and nothing else ("button",
     * "link"), which is the defect being looked for.
     */
    const accName = (el) => {
      const labelledby = el.getAttribute("aria-labelledby");
      if (labelledby) {
        const parts = labelledby
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
        if (parts) return parts;
      }
      const label = el.getAttribute("aria-label");
      if (label && label.trim()) return label.trim();
      if (el.id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
      }
      const wrapping = el.closest("label");
      if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
      const alt = el.querySelector?.("img[alt]")?.getAttribute("alt");
      if (alt && alt.trim()) return alt.trim();
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) return text;
      const title = el.getAttribute("title");
      return title?.trim() ?? "";
    };

    const FOCUSABLE =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none";
    };

    const controls = [...document.querySelectorAll(FOCUSABLE)].filter(visible);

    // ── Names ──
    const unnamed = controls
      .filter((el) => !el.hasAttribute("aria-hidden") && accName(el).length === 0)
      .map(describe);

    // ── Nested interactives ──
    //
    // A button inside a link is two targets in one box: a keyboard user tabs
    // to both and cannot tell which one is under the cursor, and a screen
    // reader announces a link containing a button, which is not a thing.
    // routes.test.ts records this as a bug this estate has already shipped
    // once, which is why it is measured rather than assumed.
    const nested = controls
      .filter((el) => {
        const parent = el.parentElement?.closest(FOCUSABLE);
        return parent && parent !== el && visible(parent);
      })
      .map((el) => `${describe(el)} inside ${describe(el.parentElement.closest(FOCUSABLE))}`);

    // ── Positive tabindex ──
    //
    // Any value above 0 lifts an element out of document order and in front of
    // everything else on the page, for every subsequent tab stop. It is never
    // the right answer on a document like this.
    const positiveTabindex = [...document.querySelectorAll("[tabindex]")]
      .filter((el) => Number(el.getAttribute("tabindex")) > 0)
      .map((el) => `${describe(el)} tabindex=${el.getAttribute("tabindex")}`);

    // ── Images ──
    const images = [...document.querySelectorAll("img")]
      .filter((el) => !el.hasAttribute("alt") && el.getAttribute("aria-hidden") !== "true")
      .map(describe);

    // ── Form controls ──
    const fields = [...document.querySelectorAll("input:not([type=hidden]), textarea, select")]
      .filter(visible)
      .filter((el) => accName(el).length === 0)
      .map(describe);

    // ── Headings ──
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(visible)
      .map((el) => ({ level: Number(el.tagName[1]), text: (el.textContent ?? "").trim().slice(0, 50) }));
    const h1s = headings.filter((h) => h.level === 1);
    const skips = [];
    for (let i = 1; i < headings.length; i++) {
      if (headings[i].level - headings[i - 1].level > 1) {
        skips.push(`h${headings[i - 1].level} → h${headings[i].level} at “${headings[i].text}”`);
      }
    }

    // ── Landmarks ──
    const mains = [...document.querySelectorAll("main, [role=main]")].filter(visible);
    const navs = [...document.querySelectorAll("nav, [role=navigation]")].filter(visible);
    // Two navigations with no names are two identical entries in a screen
    // reader's landmark list.
    const unnamedNavs = navs.length > 1 ? navs.filter((n) => accName(n).length === 0).map(describe) : [];

    // ── Chrome tap targets ──
    const header = document.querySelector("header");
    const small = header
      ? [...header.querySelectorAll(FOCUSABLE)]
          .filter(visible)
          .filter((el) => Math.ceil(Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)) < TAP_MIN)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return `${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`;
          })
      : [];

    // ── The document itself ──
    const lang = document.documentElement.getAttribute("lang") ?? "";

    // ── A skip link ──
    //
    // The shell puts a top panel, a breadcrumb, a section nav and a search
    // field ahead of the content on every route. Without a way past them, a
    // keyboard user tabs through the same dozen controls on every page they
    // open.
    const first = controls[0];
    const skipHref = first?.getAttribute("href") ?? "";
    const skipLink = /^#./.test(skipHref) ? accName(first) : null;
    // A skip link that points at nothing is worse than none: it takes the
    // first tab stop and does not move focus.
    const skipTargetExists = skipLink ? !!document.getElementById(skipHref.slice(1)) : false;

    return {
      unnamed,
      nested,
      positiveTabindex,
      images,
      fields,
      h1Count: h1s.length,
      h1: h1s[0]?.text ?? null,
      skips,
      mains: mains.length,
      navs: navs.length,
      unnamedNavs,
      small,
      lang,
      skipLink,
      skipHref,
      skipTargetExists,
      controlCount: controls.length,
    };
  }, TAP_MIN);
}

/**
 * TAB TO THIS CONTROL FROM THE TOP OF THE DOCUMENT, and say whether a person
 * doing that can SEE where they landed.
 *
 * Two properties in one walk, because they are the same walk:
 *
 *   REACHABLE  the control is a real tab stop, arrived at by pressing Tab
 *              from the start of the document — not by a script calling
 *              `.focus()`, which reaches things a keyboard cannot.
 *   VISIBLE    something about how it is drawn changes when it has focus.
 *              `outline: none` with nothing put back is the commonest way a
 *              keyboard user loses their place, and it is completely invisible
 *              to anybody testing with a mouse.
 *
 * IT HAS TO BE A REAL TAB PRESS, and this is the part that took a wrong turn
 * first: an element focused by script does not match `:focus-visible`, because
 * the browser reserves that for focus a person can be assumed to be looking
 * for. So a script-driven `.focus()` reads every `:focus-visible` ring in the
 * document as absent and reports a page-wide defect that is not there. The
 * keyboard is not a detail of how this is measured; it is what is being
 * measured.
 *
 * The comparison is over four properties rather than a pattern match on
 * `outline`: the app may indicate focus however it likes, as long as it
 * indicates it.
 *
 * `selector` MUST NAME ONE ELEMENT, and that is the caller's job. This walks
 * to whatever matches and reports it under the caller's name, so a selector
 * that matches four controls returns a PASS for a control the run never
 * touched — see the list in "Named control 7", where `[aria-expanded]` is on
 * four things and `[aria-pressed]` on two.
 */
async function keyboardReach(page, selector, maxTabs = 250) {
  const snap = async () =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return [cs.outline, cs.outlineOffset, cs.boxShadow, cs.borderColor, cs.backgroundColor].join("|");
    }, selector);

  // PARK FOCUS ON THE DOCUMENT FIRST, and take the unfocused snapshot only
  // once it is parked. Two reasons, and the first one produced a false PASS
  // before it was fixed: an earlier check in this file may have left focus ON
  // the very control being measured, so a snapshot taken first would be the
  // FOCUSED style and the comparison would run backwards. And `blur()` alone
  // does not move Chromium's sequential-navigation starting point — the next
  // Tab resumes from wherever focus last was, mid-document — so the walk would
  // report "reached in 1 tab" for a control forty stops down.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();
    document.body.removeAttribute("tabindex");
  });

  const before = await snap();
  if (before === null) return { ok: false, why: "no such element" };

  for (let i = 1; i <= maxTabs; i++) {
    await page.keyboard.press("Tab");
    const here = await page.evaluate((sel) => document.activeElement?.matches?.(sel) ?? false, selector);
    if (!here) continue;
    const after = await snap();
    return {
      ok: before !== after,
      tabs: i,
      why:
        before === after
          ? `reached in ${i} tab(s), but nothing about it changes on focus (${before})`
          : `reached in ${i} tab(s), focus changes it to ${after}`,
    };
  }
  return { ok: false, why: `not reachable by keyboard within ${maxTabs} tab presses` };
}

export async function runA11y(base) {
  console.log(`web-a11y: base=${base}`);
  const browser = await chromium.launch({
    ...(process.env.XP4_CHROMIUM ? { executablePath: process.env.XP4_CHROMIUM } : {}),
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    // ── The sweep, on every route the epic added ─────────────────────
    for (const route of ROUTES) {
      await page.goto(base + route.path, { waitUntil: "load" });
      await page.waitForTimeout(1200);

      // Same guard the budget lane opens with: an error page has excellent
      // accessibility and says nothing about the surface.
      const html = await page.content();
      if (!html.includes(route.expect)) {
        check(`sweep ${route.path}`, false, "did not render the surface — nothing below is about this page");
        continue;
      }

      const s = await sweepPage(page);
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
      // The shell is eleven tab stops. Without a way past it, a keyboard user
      // pays for all eleven on every route they open.
      if (!s.skipLink) problems.push("no skip link as the first tab stop");
      if (s.skipLink && !s.skipTargetExists) problems.push(`the skip link points at ${s.skipHref}, which is not on the page`);

      check(
        `sweep ${route.path}`,
        problems.length === 0,
        problems.join(" | ") ||
          `clean (${s.controlCount} controls, h1 “${s.h1}”, skip link “${s.skipLink}”)`,
      );
    }

    // Named control 1 — the directory's facet rail — left with the directory:
    // `/` is the launches and `/products` redirects to it. The numbering of
    // the controls below is kept so the lane's history still reads.

    // ── Named control 2: the product row's click targets (XP1) ───────
    //
    // STAYS AT `/`, and it is a better check there than it was. The row it
    // probes is now the FEED row (OL2) — the design's primary unit, the one
    // that repeats on the feed, a topic page, a collection and a maker's
    // tabs. If its targets ever stop being reachable, that is four surfaces
    // at once.
    {
      await page.goto(base + "/", { waitUntil: "load" });
      await page.waitForTimeout(1200);
      const rows = await page.evaluate(() => {
        const items = [...document.querySelectorAll("li")].filter((li) => li.querySelector('a[href^="/product-"]'));
        if (items.length === 0) return null;
        const row = items[0];
        const links = [...row.querySelectorAll("a[href], button")];
        const nameOf = (a) => (a.getAttribute("aria-label") ?? a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
        // A TARGET IS SOMETHING A READER CAN REACH. The tile at the row's left
        // is a second link to the product — a click target for a mouse, and
        // nothing else: `aria-hidden` takes it out of the accessibility tree
        // and `tabindex=-1` out of the tab order, so a screen reader and the
        // Tab key meet the product once, by its name. Until MD3 the tile
        // happened to carry the monogram's two letters as text, which let it
        // pass as "named" without anyone deciding it should; the hero
        // thumbnail (an `alt=""` picture, MD3) has no such accident. So the
        // probe now says what it means: every REACHABLE target is named, and
        // every hidden one is a duplicate of a reachable one, out of the tab
        // order — the same rule the sweep applies to the whole shell.
        const reachable = links.filter((a) => a.getAttribute("aria-hidden") !== "true");
        const hidden = links.filter((a) => a.getAttribute("aria-hidden") === "true");
        return {
          rows: items.length,
          targets: reachable.map((a) => ({
            tag: a.tagName.toLowerCase(),
            href: a.getAttribute("href"),
            name: nameOf(a),
          })),
          hidden: hidden.map((a) => ({
            tag: a.tagName.toLowerCase(),
            href: a.getAttribute("href"),
            tabIndex: a.tabIndex,
            duplicates: reachable.some((r) => r.getAttribute("href") === a.getAttribute("href") && nameOf(r).length > 0),
          })),
          // XP-5: a person is a link or plain text, never a dead link.
          deadLinks: [...row.querySelectorAll("a")].filter((a) => !a.getAttribute("href")).length,
        };
      });
      check("product row: rows render with reachable targets", !!rows && rows.rows > 0, rows ? `${rows.rows} rows, first has ${rows.targets.length} target(s)` : "no product rows found");
      if (rows) {
        check(
          "product row: every target carries a name",
          rows.targets.every((t) => t.name.length > 0),
          rows.targets.map((t) => `${t.tag}«${t.name}»`).join(", "),
        );
        check(
          "product row: a hidden target is a duplicate of a named one, out of the tab order (MD3)",
          rows.hidden.every((h) => h.duplicates && h.tabIndex === -1),
          rows.hidden.length
            ? rows.hidden.map((h) => `${h.tag}→${h.href} tabindex=${h.tabIndex}${h.duplicates ? "" : " NOT A DUPLICATE"}`).join(", ")
            : "none hidden",
        );
        check("product row: no anchor without an href (XP-5)", rows.deadLinks === 0, `${rows.deadLinks} dead`);
      }
    }

    // ── Named control 3: the product page's outline (OL3) ────────────
    //
    // THE TAB STRIP IS GONE. OL3 gave the product page the design's shape —
    // one column a reader scrolls, with stacked sections — so the five checks
    // that walked a `[role=tablist]` walked something that no longer exists.
    //
    // What replaces them is the property the sections have that the strip did
    // not: an OUTLINE. A tab strip hid four fifths of the page behind a
    // control, and a screen-reader user navigating by heading found one
    // heading where the page had five. These assert the five are there, that
    // each names its own section, and that nothing is hidden behind a control
    // a reader has to discover first.
    {
      await page.goto(`${base}/${SAMPLE_SLUG}`, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      const outline = await page.evaluate(() => {
        const sections = [...document.querySelectorAll("main section[aria-labelledby]")];
        const named = sections.map((el) => {
          const heading = document.getElementById(el.getAttribute("aria-labelledby") ?? "");
          return {
            id: el.id,
            heading: heading?.textContent?.trim() ?? null,
            level: heading?.tagName ?? null,
          };
        });
        return {
          count: sections.length,
          named,
          unnamed: named.filter((n) => !n.heading).length,
          // Nothing on this page may be hidden behind a control: the design
          // draws one scrolling column, and a `hidden` panel here would mean
          // the tab strip came back under another name.
          hiddenPanels: document.querySelectorAll("main [hidden]").length,
          tablists: document.querySelectorAll('[role="tablist"]').length,
        };
      });

      check(
        "product page: every section names itself with a heading",
        outline.count >= 4 && outline.unnamed === 0,
        `${outline.count} sections, ${outline.unnamed} unnamed — ${outline.named
          .map((n) => n.heading)
          .filter(Boolean)
          .join(" | ")}`,
      );
      check(
        "product page: the outline is real headings, not styled text",
        outline.named.every((n) => n.level === null || /^H[1-6]$/.test(n.level)),
        outline.named.map((n) => `${n.id}:${n.level}`).join(" "),
      );
      check(
        "product page: nothing is hidden behind a control (OL3 removed the tabs)",
        outline.hiddenPanels === 0 && outline.tablists === 0,
        `${outline.hiddenPanels} hidden, ${outline.tablists} tablists`,
      );

      // ── MD2 — the gallery, walked with the keyboard (FR5's clause) ──
      //
      // FR5 found there was no gallery to walk and handed the check to the
      // milestone that would create one. This is it: the sample listing
      // carries a hero, two gallery images and a capture. Every image has
      // its dimensions on the element (the CLS decision the model made), the
      // first gallery link is reachable by Tab and shows focus, and the
      // capture is in a different frame from the maker's pictures.
      const pictures = await page.evaluate(() => {
        const panel = document.querySelector("main [data-media-panel]");
        const imgs = panel ? [...panel.querySelectorAll("img")] : [];
        return {
          panel: panel !== null,
          images: imgs.length,
          sized: imgs.filter((i) => i.getAttribute("width") && i.getAttribute("height")).length,
          named: imgs.filter((i) => (i.getAttribute("alt") ?? "").trim().length > 0).length,
          galleryLinks: panel ? panel.querySelectorAll('ul[aria-label="Gallery"] a[href]').length : 0,
          // OPR1 — THE CAPTURE'S FRAME IS A WELL, NOT DASHES. The redesign is
          // flat and draws no borders, so the observed picture is told from
          // the maker's by standing inside a padded, filled figure with a
          // caption under it; the maker's pictures have neither. Both halves
          // are measured: the well (padding and a fill of its own) and that
          // no OTHER figure carries a caption.
          welled: panel
            ? [...panel.querySelectorAll("figure")].filter((f) => {
                const cs = getComputedStyle(f);
                return parseFloat(cs.paddingTop) > 0 && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && f.querySelector("figcaption") !== null;
              }).length
            : 0,
          captioned: panel ? [...panel.querySelectorAll("figure")].filter((f) => f.querySelector("figcaption") !== null).length : 0,
          bordered: panel
            ? [...panel.querySelectorAll("figure")].filter((f) => parseFloat(getComputedStyle(f).borderTopWidth) > 0).length
            : 0,
          captionDated: panel ? panel.querySelectorAll("figure figcaption time[datetime]").length : 0,
        };
      });
      check(
        "product page: the media panel renders the sample listing's four pictures, every one with its dimensions and a name",
        pictures.panel && pictures.images === 4 && pictures.sized === 4 && pictures.named === 4,
        JSON.stringify(pictures),
      );
      check(
        "product page: the capture stands in its own well, dated — and the maker's pictures do not; nothing is bordered",
        pictures.welled === 1 && pictures.captioned === 1 && pictures.captionDated === 1 && pictures.bordered === 0,
        `${pictures.welled} well(s), ${pictures.captioned} captioned figure(s), ${pictures.captionDated} dated caption(s), ${pictures.bordered} bordered`,
      );
      const galleryReach = await keyboardReach(page, 'main ul[aria-label="Gallery"] li:first-child a');
      check("product page: the gallery is operable by keyboard alone — its first image is reached and shows focus", galleryReach.ok, galleryReach.why);

      // And the hero's one action reaches a section by fragment, with no
      // JavaScript involved.
      const jump = await page.evaluate(() => {
        const link = [...document.querySelectorAll('main a[href^="#"]')].find((a) =>
          document.getElementById((a.getAttribute("href") ?? "#").slice(1)),
        );
        return link ? link.getAttribute("href") : null;
      });
      check(
        "product page: the hero's action reaches a section that exists",
        jump !== null,
        jump ?? "no in-page link resolves to an element",
      );
    }

    // ── OS1: the catalogue continues at a plain link ────────────────
    {
      // The fixture's directory answers twenty-four cards and a `next`; the
      // front page must draw the page after it as a LINK — a URL a reader
      // can copy and a crawler can follow, with no JavaScript in the path
      // (OS-2, OPP2) — and the page it reaches must be rows with named
      // targets, like the first. Listing 25 is two clicks from the front
      // page; listing 201 would be, at the real page size.
      await page.goto(base + "/", { waitUntil: "load" });
      await page.waitForTimeout(800);
      const link = await page.evaluate(() => {
        const a = document.querySelector("main a[data-catalogue-next]");
        return a ? { href: a.getAttribute("href"), text: (a.textContent ?? "").trim(), button: a.tagName !== "A" } : null;
      });
      // "The same heading" is the front page's own, read off the page rather
      // than spelled here: 2673c536 renamed it ("Products" → "All products",
      // `FEED_CATALOGUE_HEADING`), and a literal in this file went red without
      // either page having disagreed with the other. OB4 (#1870) made the
      // catalogue the front page itself, so its heading is the page's <h1>
      // ("Open builds") rather than a section's `#feed-catalogue`.
      const heading = await page.evaluate(() => document.querySelector("main h1")?.textContent?.trim() ?? null);
      check(
        "front page: the catalogue continues at a plain link, not a button (OS-2)",
        link !== null && /^\/products\/[^/]+$/.test(link.href ?? "") && link.text.length > 0 && !link.button,
        JSON.stringify(link),
      );
      // OS5 — the rows came from a table the sweep computed at a moment, and
      // the heading's line says the moment: a <time> with the instant, read
      // as a UTC clock time, beside the count. The fixture stamps NOW.
      const moment = await page.evaluate(() => {
        const t = document.querySelector("main [data-catalogue-moment]");
        return t ? { tag: t.tagName, datetime: t.getAttribute("datetime"), text: (t.textContent ?? "").trim() } : null;
      });
      check(
        "front page: the catalogue says when it was computed — a <time> with the instant, as a UTC clock time (OS5)",
        moment !== null && moment.tag === "TIME" && /^\d{4}-\d{2}-\d{2}T/.test(moment.datetime ?? "") && /^as of \d{2}:\d{2} UTC$/.test(moment.text),
        JSON.stringify(moment),
      );
      if (link) {
        await page.goto(base + link.href, { waitUntil: "load" });
        await page.waitForTimeout(800);
        const next = await page.evaluate(() => {
          const rows = [...document.querySelectorAll("main li")].filter((li) => li.querySelector('a[href^="/product-"]'));
          const first = rows[0];
          const targets = first ? [...first.querySelectorAll("a[href], button")].filter((a) => a.getAttribute("aria-hidden") !== "true") : [];
          return {
            title: document.title,
            rows: rows.length,
            named: targets.every((a) => ((a.getAttribute("aria-label") ?? a.textContent ?? "").trim().length > 0)),
            // OPR1 — the way back is to the list's own first page. It was
            // `/` while the front page WAS the catalogue; Products has an
            // address of its own now, and a continuation page goes back to it.
            back: document.querySelector('main a[href="/products"]') !== null,
            h1: document.querySelector("main h1")?.textContent?.trim() ?? null,
          };
        });
        check(
          "catalogue page: the next page is rows with named targets, a way back to /products, and the same heading",
          next.rows > 0 && next.named && next.back && heading !== null && next.h1 === heading,
          JSON.stringify({ ...next, frontPageHeading: heading }),
        );
        const nextMoment = await page.evaluate(() => document.querySelector("main [data-catalogue-moment]")?.textContent?.trim() ?? null);
        check(
          "catalogue page: the second page carries the same moment as the first (OS5)",
          nextMoment !== null && nextMoment === moment?.text,
          JSON.stringify({ first: moment?.text ?? null, second: nextMoment }),
        );
      }
    }

    // ── MD4: a capture past its window is WITHDRAWN, and an environment
    //    that captures nothing says so ─────────────────────────────────
    {
      // The fixture's fourth listing carries only a capture older than the
      // window (`MEDIA_FOR`'s n % 4 === 3 branch). OPC-7 says withdrawn, not
      // frozen: no frame, no picture, no caption — the page does not show a
      // reading it cannot stand behind, and it does not say "withdrawn" in
      // a frame either, because a frame with nothing in it is a claim too.
      const staleSlug = SAMPLE_SLUG.replace(/00$/, "03");
      await page.goto(`${base}/${staleSlug}`, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const withdrawn = await page.evaluate(() => ({
        panel: document.querySelector("main [data-media-panel]") !== null,
        dashed: [...document.querySelectorAll("main figure")].filter(
          (f) => getComputedStyle(f).borderStyle === "dashed",
        ).length,
        captions: document.querySelectorAll("main figure figcaption time[datetime]").length,
      }));
      check(
        "product page: a capture past its window is withdrawn — no frame, no picture, no caption (OPC-7)",
        !withdrawn.panel && withdrawn.dashed === 0 && withdrawn.captions === 0,
        JSON.stringify(withdrawn),
      );

      // And the checks page says whether this environment captures at all.
      // The corpus does not, and the honest sentence is on the page rather
      // than a row that reads as never_run.
      await page.goto(`${base}/docs/checks`, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const budget = await page.evaluate(() => {
        const article = document.querySelector('[data-sweep-phase="screenshots"]');
        const line = article?.querySelector("[data-configured]") ?? null;
        return {
          present: article !== null,
          configured: line?.getAttribute("data-configured") ?? null,
          text: (line?.textContent ?? "").trim().slice(0, 60),
        };
      });
      check(
        "published checks: the capture budget is on the page, and an environment that captures nothing says so",
        budget.present && budget.configured === "false" && /^Not configured/.test(budget.text),
        JSON.stringify(budget),
      );

      // OS5 — the catalogue is the seventh phase, and the page says so: one
      // row per phase from the contract, the catalogue's first, beside the
      // two outward phases that keep no health row.
      const phases = await page.evaluate(() =>
        [...document.querySelectorAll("main [data-sweep-phase]")].map((a) => a.getAttribute("data-sweep-phase")),
      );
      check(
        "published checks: seven phases with the catalogue first, then the two outward phases (OS5)",
        phases.length === 9 && phases[0] === "catalogue" && phases.includes("searchIndex") && phases.includes("snapshots") && phases.includes("ingestion") && phases.includes("screenshots"),
        JSON.stringify(phases),
      );

      // CS1 — the limit is published where the API's promises are: one row
      // per bucket from the contract's table, the sentence beside it, and
      // the refusal's shape (429, Retry-After) said in words on the page.
      await page.goto(`${base}/docs/api`, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const limit = await page.evaluate(() => {
        const table = document.querySelector("main table[data-rate-limits]");
        const rows = [...(table?.querySelectorAll("tbody tr[data-bucket]") ?? [])];
        return {
          declared: table?.getAttribute("data-rate-limits") ?? null,
          buckets: rows.map((r) => r.getAttribute("data-bucket")),
          cells: rows.map((r) => [...r.querySelectorAll("td")].map((td) => (td.textContent ?? "").trim())),
          sentence: (document.querySelector("main [data-rate-limit-sentence]")?.textContent ?? "").trim(),
          heading: document.querySelector("main #api-limit")?.textContent?.trim() ?? null,
        };
      });
      check(
        "API docs: the limit is on the page — three buckets from the contract, each with its number, window and key, and the sentence names the 429 and Retry-After (CS1)",
        limit.declared === "3" &&
          limit.buckets.join(",") === "anon,identity,org" &&
          limit.cells.every((cells) => cells.length === 4 && /^\d+ requests (a minute|an hour)$/.test(cells[1]) && /^(address|subject|organisation)$/.test(cells[2])) &&
          /429 with a Retry-After header/.test(limit.sentence) &&
          limit.heading === "The limit",
        JSON.stringify(limit),
      );
      // OO4 — the runbook: every anchor an alert can name is an article on
      // the page, and every phase row on /docs/checks links to its page.
      await page.goto(`${base}/docs/runbook`, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const runbook = await page.evaluate(() => {
        const ids = [...document.querySelectorAll("main article[data-runbook]")].map((a) => a.id);
        return { ids, h1: document.querySelector("main h1")?.textContent?.trim() ?? null };
      });
      const expectedAnchors = ["search-freshness-sweep-not-run", "search-freshness-page-disagrees", "count-freshness-sweep-not-run", "cache-hit-cold", "unreachable", "phase-catalogue", "phase-searchIndex", "phase-integrity", "phase-defence", "phase-board", "phase-digest", "phase-snapshots", "deploy-lags-main", "deploy-unverified"];
      check(
        "runbook: one article per degraded state, each with the anchor the alert names — five promises' pages, seven phases, the two deploy pages (OO4, OO3)",
        runbook.h1 === "Runbook" && expectedAnchors.every((id) => runbook.ids.includes(id)) && new Set(runbook.ids).size === runbook.ids.length,
        JSON.stringify(runbook),
      );
      await page.goto(`${base}/docs/checks`, { waitUntil: "load" });
      await page.waitForTimeout(800);
      const phaseLinks = await page.evaluate(() =>
        [...document.querySelectorAll("main a[data-runbook-link]")].map((a) => [a.getAttribute("data-runbook-link"), a.getAttribute("href")]),
      );
      check(
        "published checks: every phase row links to its runbook page by anchor (OO4)",
        phaseLinks.length === 7 && phaseLinks.every(([phase, href]) => href === `/docs/runbook#phase-${phase}`),
        JSON.stringify(phaseLinks),
      );
      // OO3 — which build is answering, under the heading: the fixture's
      // version, as a <time> with the upload moment and the short id.
      const build = await page.evaluate(() => {
        const p = document.querySelector("main [data-build]");
        return p ? { version: p.getAttribute("data-build"), text: (p.textContent ?? "").trim(), time: p.querySelector("time")?.getAttribute("datetime") ?? null } : null;
      });
      check(
        "published checks: the page says which build is answering — the version and when it was uploaded, read off /health (OO3)",
        build !== null && build.version === "f1x7u2e0-0000-4000-8000-00000000f1x7" && /^Deployed .* · version f1x7u2e0$/.test(build.text) && /^\d{4}-\d{2}-\d{2}T/.test(build.time ?? ""),
        JSON.stringify(build),
      );

    }

    // ── Named control 4: the order switch (OB4; was the leaderboard's UV2) ──
    //
    // OB7 (#1875) folded the leaderboard into Upvoted: /leaderboard redirects
    // to /builds/upvoted, and the ranges became the front page's four orders.
    // What this walked is unchanged: the switch must be NAVIGATION rather than
    // script, because the order is in the URL. A switch built from buttons
    // would pass the generic sweep above and leave the order unlinkable.
    {
      // openproduct-redesign OPR1 — the switch is the Products page's sort:
      // the default at `/products`, the others at `/products/by/<order>` — a
      // path, never a query string, so each order is one cacheable document.
      // `[data-product-sort]` is the track drawn from `sm` up; a phone draws
      // the same links inside a `<details>`.
      await page.goto(base + "/products/by/upvoted", { waitUntil: "load" });
      await page.waitForTimeout(1200);
      const orderNav = await page.evaluate(() => {
        const nav = document.querySelector("nav[data-product-sort]");
        if (!nav) return null;
        const links = [...nav.querySelectorAll("a")];
        return {
          count: links.length,
          hrefs: links.map((a) => new URL(a.href).pathname + new URL(a.href).search),
          current: links
            .filter((a) => a.getAttribute("aria-current") === "page")
            .map((a) => new URL(a.href).pathname + new URL(a.href).search),
          labels: links.map((a) => (a.textContent ?? "").trim()),
          buttons: nav.querySelectorAll("button").length,
        };
      });

      // The property, not a count: every control in the switch is a link to a
      // real address, none is a button, and exactly one is the page a reader
      // is on — so the next order joins without a lane to update.
      check(
        "order switch: the orders are links, not buttons",
        orderNav !== null && orderNav.count >= 2 && orderNav.buttons === 0,
        orderNav
          ? `${orderNav.count} link(s), ${orderNav.buttons} button(s) — ${orderNav.labels.join(" | ")}`
          : "no [data-product-sort] switch found",
      );
      check(
        "order switch: exactly one order is announced as current, and it is this page's",
        orderNav !== null && orderNav.current.length === 1 && orderNav.current[0] === "/products/by/upvoted",
        orderNav ? `marked aria-current=page: ${orderNav.current.join(" | ") || "none"}` : "no switch",
      );
      check(
        "order switch: every order is a real address — the default at /products, the rest at /products/by/<order>, none in a query string",
        orderNav !== null &&
          orderNav.hrefs.includes("/products") &&
          orderNav.hrefs.includes("/products/by/upvoted") &&
          orderNav.hrefs.every((h) => /^\/products(\/by\/[a-z-]+)?$/.test(h)),
        orderNav ? orderNav.hrefs.join(" | ") : "no switch",
      );

      const rows = await page.evaluate(() => {
        const list = document.querySelector("main ul:has(> li[data-keyrow])");
        if (!list) return null;
        const items = [...list.querySelectorAll(":scope > li")];
        const first = items[0];
        return {
          count: items.length,
          targets: first ? first.querySelectorAll("a, button").length : 0,
          unnamed: items
            .flatMap((li) => [...li.querySelectorAll("a, button")])
            .filter((el) => el.getAttribute("aria-hidden") !== "true")
            .filter((el) => {
              const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
              return name.length === 0;
            }).length,
          dead: [...list.querySelectorAll("a")].filter((a) => !a.getAttribute("href")).length,
        };
      });

      check(
        "upvoted row: rows render with reachable targets",
        rows !== null && rows.count > 0 && rows.targets > 0,
        rows ? `${rows.count} rows, first has ${rows.targets} target(s)` : "no list of rows in main",
      );
      check(
        "upvoted row: every target carries a name",
        rows !== null && rows.unnamed === 0,
        rows ? `${rows.unnamed} unnamed` : "no rows",
      );
      check(
        "upvoted row: no anchor without an href (XP-5)",
        rows !== null && rows.dead === 0,
        rows ? `${rows.dead} anchor(s) without an href` : "no rows",
      );
    }

    // ── Named control 5: the account menu (XP0) ──────────────────────
    {
      await page.goto(base + "/", { waitUntil: "load" });
      await page.waitForTimeout(1500);
      const menu = await page.evaluate(() => {
        // VISIBLE, NOT MERELY PRESENT — and the distinction became load-bearing
        // when the flicker fix landed. The shell now renders BOTH branches of
        // the account control into every page (that is what keeps the cached
        // HTML from varying, I6) and hides one with `display: none`. A screen
        // reader and the Tab key see only the shown branch, which is the whole
        // point; a bare `querySelector` sees both, which is how this probe
        // came to press Enter on a hidden button and report a broken menu.
        //
        // `checkVisibility` is the same test the flicker lane uses, and it is
        // the one that agrees with what a person can actually reach: the
        // hidden branch is hidden with `visibility` now (so the bar can
        // reserve its box) and `offsetParent` is non-null for that.
        const shown = (el) => el instanceof HTMLElement && el.checkVisibility({ visibilityProperty: true });
        // `aria-haspopup="menu"` AND NOT "anything with aria-expanded": the
        // search field in the same header is a combobox and carries
        // `aria-expanded` too, so the looser selector found the search box and
        // reported the account menu broken.
        const trigger = [...document.querySelectorAll('header [aria-haspopup="menu"]')].find(shown) ?? null;
        if (!trigger) return null;
        return {
          tag: trigger.tagName.toLowerCase(),
          haspopup: trigger.getAttribute("aria-haspopup"),
          expanded: trigger.getAttribute("aria-expanded"),
          name: (trigger.getAttribute("aria-label") ?? trigger.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
        };
      });

      if (!menu) {
        // Signed out, the shell shows a `Sign in` control rather than a menu
        // (XP0's own done-when). That is not a missing menu; it is the other
        // branch, and it has its own rule: no overlay request is made.
        const signIn = await page.evaluate(() => {
          // The control is a round disc with a glyph since OPR1, so its name is
          // its `aria-label`; the text is read as the fallback it used to be.
          const nameOf = (e) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim();
          const el = [...document.querySelectorAll("header a, header button")].find((e) => /sign in/i.test(nameOf(e)));
          return el ? nameOf(el) : null;
        });
        check("account menu: signed out shows a named Sign in control instead", !!signIn, signIn ?? "neither a menu trigger nor a sign-in control in the header");
      } else {
        check(
          "account menu: the trigger is a named button that states its popup and its state",
          menu.tag === "button" && !!menu.name && menu.expanded !== null,
          `${menu.tag}«${menu.name}» haspopup=${menu.haspopup} expanded=${menu.expanded}`,
        );

        // Enter opens; Escape closes AND returns focus to the trigger. The
        // second half is the one that gets forgotten, and losing focus to
        // <body> drops a keyboard user back at the top of the document.
        await page.evaluate(() => {
          document.querySelector('header [aria-haspopup="menu"]')?.focus();
        });
        await page.keyboard.press("Enter");
        await page.waitForTimeout(300);
        const opened = await page.evaluate(() => ({
          expanded: document.querySelector('header [aria-haspopup="menu"]')?.getAttribute("aria-expanded"),
          menu: !!document.querySelector('[role="menu"]'),
        }));
        check("account menu: Enter opens it", opened.expanded === "true" || opened.menu, `expanded=${opened.expanded} role=menu ${opened.menu}`);

        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        const closed = await page.evaluate(() => {
          // `="menu"`, as the lookup above: the header search is a combobox with
          // a popup of its own since OPR1, and it comes first in the header.
          const trigger = document.querySelector('header [aria-haspopup="menu"]');
          return {
            expanded: trigger?.getAttribute("aria-expanded"),
            focusReturned: document.activeElement === trigger,
            activeTag: document.activeElement?.tagName.toLowerCase(),
          };
        });
        check(
          "account menu: Escape closes it and returns focus to the trigger",
          closed.expanded !== "true" && closed.focusReturned,
          `expanded=${closed.expanded}, focus on ${closed.activeTag}`,
        );
      }
    }

    // ── Named control 6: the composer (CB1) ──────────────────────────
    {
      await page.goto(`${base}/threads/${SAMPLE_THREAD}`, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      // CV1 PUT THREE COMPOSERS ON THIS PAGE, and "the first form with a
      // textarea" stopped naming one thing the moment it did: each answerable
      // post now carries a reply box behind a `<details>`, and the first of
      // them is earlier in the document than the thread's own. Walking a
      // composer inside a CLOSED disclosure reported "not reachable by Tab",
      // which was true of that element and said nothing about the control the
      // check is for. This is FR5's own lesson — a selector must name exactly
      // one control — arriving on the surface that taught it.
      //
      // The thread's own composer is the one with no `parentPostId`: it
      // answers the thread rather than a post in it.
      const THREAD_COMPOSER = 'form:not(:has(input[name="parentPostId"]))';
      const composer = await page.evaluate((sel) => {
        const form = [...document.querySelectorAll(sel)].find((f) => f.querySelector("textarea"));
        if (!form) return null;
        const area = form.querySelector("textarea");
        const wrapping = area.closest("label");
        const named =
          area.getAttribute("aria-label") ??
          (area.id ? document.querySelector(`label[for="${CSS.escape(area.id)}"]`)?.textContent : null) ??
          wrapping?.textContent ??
          "";
        const submit = form.querySelector('button[type="submit"], input[type="submit"]');
        return {
          name: named.replace(/\s+/g, " ").trim().slice(0, 40),
          maxLength: area.getAttribute("maxlength"),
          submit: submit ? (submit.textContent ?? submit.getAttribute("value") ?? "").trim().slice(0, 30) : null,
          // The standing notice (CB-2) is part of the form, not a footnote —
          // somebody typing should hear it while they are in the field.
          noticeInForm: /public|permanent|anyone/i.test(form.textContent ?? ""),
        };
      }, THREAD_COMPOSER);
      check("composer: it exists", !!composer, composer ? "found" : "no form with a textarea on the thread page");
      if (composer) {
        check("composer: the field carries a name", composer.name.length > 0, `“${composer.name}”`);
        check("composer: the submit control carries a name", !!composer.submit, composer.submit ?? "(none)");
        check("composer: the standing notice is inside the form (CB-2)", composer.noticeInForm, composer.noticeInForm ? "present" : "the rule is elsewhere on the page, not beside the field");
        const ring = await keyboardReach(page, `${THREAD_COMPOSER} textarea`);
        check("composer: the field is reachable by Tab, and focus is visible on it", ring.ok, ring.why);

        // CV1 — the per-post composer, which is the same control behind a
        // disclosure. Closed, it holds no tab stop, which is the point of a
        // disclosure; opened, it must be as reachable and as visible as the
        // one above, or the reply affordance is a keyboard dead end.
        const perPost = 'form:has(input[name="parentPostId"])';
        const before = await page.evaluate(
          (sel) => document.querySelectorAll(`${sel} textarea`).length,
          perPost,
        );
        const closedTabStop = await page.evaluate((sel) => {
          const area = document.querySelector(`${sel} textarea`);
          if (!area) return null;
          area.focus();
          return document.activeElement === area;
        }, perPost);
        check(
          "reply disclosure: its field exists and holds no tab stop while closed (CV1)",
          before > 0 && closedTabStop === false,
          `fields=${before} focusableClosed=${closedTabStop}`,
        );

        await page.evaluate((sel) => {
          document.querySelector(`${sel} details`)?.setAttribute("open", "");
        }, "main ol");
        await page.waitForTimeout(200);
        const openRing = await keyboardReach(page, `${perPost} textarea`);
        check(
          "reply disclosure: opened, the field is reachable and focus is visible (CV1)",
          openRing.ok,
          openRing.why,
        );
      }
    }

    // ── Named control 7: the controls this epic added (FR5) ─────────
    //
    // FR5's own words: "focus visibility on the NEW controls". Every check
    // above predates this epic, and five controls have landed since — the
    // theme switch (FR0), the share panel and the badge snippet (RE3, RE4),
    // the save button and the upvote hero. A focus ring is the one thing a
    // keyboard user needs from all five, and it is also the easiest thing to
    // lose: it disappears the moment a `focus-visible:outline` is dropped
    // from a class list, silently, with the control still working perfectly
    // for everybody using a mouse.
    {
      await page.goto(base + `/${SAMPLE_SLUG}`, { waitUntil: "load" });
      await page.waitForTimeout(600);

      // EACH SELECTOR NAMES EXACTLY ONE ELEMENT, and getting there took two
      // goes. `button[aria-expanded]` matches four controls on this page — the
      // palette's two, the account chip's, and the share trigger — and
      // `button[aria-pressed]` matches the save button AND the upvote box.
      // Either would have walked to whichever the DOM lists first and reported
      // it under the name below: a PASS for a control the run never touched,
      // which is the whole failure mode this file was written to catch in the
      // product. The shell's controls all live in `<header>`, and the two acts
      // are each in a form that names the route it posts to, so both are
      // separable without a data attribute added for a test's benefit.
      // `:first-child` ON THE TWO SEGMENTED GROUPS. The theme switch is three
      // buttons (system / light / dark) and the snippet switch is two
      // (Markdown / HTML) — a group is the control, and the first cell is the
      // one a Tab reaches first. Naming the group alone matched three and two,
      // which the assertion below caught on its first run.
      const NEW_CONTROLS = [
        ["the theme switch (FR0)", '[role="group"][aria-label="Theme"] button:first-child'],
        ["the share trigger (RE3)", "main button[aria-expanded]"],
        [
          "the badge snippet's format switch (RE4)",
          '[role="group"][aria-label="Snippet format"] button:first-child',
        ],
        ["the save button (OPC-3)", 'form[action*="/me/save"] button[aria-pressed]'],
      ];
      for (const [name, selector] of NEW_CONTROLS) {
        const matches = await page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
        check(`${name}: the selector names exactly one control`, matches === 1, `${matches} match(es) ${selector}`);
        const present = matches > 0;
        check(`${name}: it is on the page`, present, present ? selector : `no ${selector}`);
        if (!present) continue;
        // BEHIND A DISCLOSURE, reach the disclosure first. 3c2b921c put the
        // badge in the design's collapsible panel ("for the maintainer rather
        // than for the reader who arrived from a search result"), and a
        // closed `<details>` holds no tab stop — that is the point of one, as
        // the reply disclosure's check above says. So a keyboard user's path
        // is: Tab to the summary, open it, Tab on to the switch; each half is
        // checked, and the switch is never walked while it is unreachable
        // for a reason that is not about it.
        const summary = await page.evaluate((sel) => {
          const details = document.querySelector(sel)?.closest("details:not([open])");
          const s = details?.querySelector(":scope > summary");
          return s?.id ? `summary#${CSS.escape(s.id)}` : null;
        }, selector);
        if (summary) {
          const door = await keyboardReach(page, summary);
          check(`${name}: its disclosure is reachable by Tab, and focus is visible on it`, door.ok, door.why);
          await page.evaluate((sel) => document.querySelector(sel)?.closest("details")?.setAttribute("open", ""), selector);
          await page.waitForTimeout(200);
        }
        const ring = await keyboardReach(page, selector);
        check(`${name}: reachable by Tab, and focus is visible on it`, ring.ok, ring.why);
      }

      // The share panel is a disclosure, and a disclosure that never says so
      // is a button a screen reader announces as a button and nothing else.
      const disclosure = await page.evaluate(() =>
        document.querySelector("main button[aria-expanded]")?.getAttribute("aria-expanded") ?? null,
      );
      check(
        "the share trigger declares its state before it is pressed",
        disclosure === "false",
        `aria-expanded=${disclosure}`,
      );
    }

    await context.close();

    // ── Named control 8: the bottom bar, on a phone (FR1/FR5) ────────
    //
    // ITS OWN CONTEXT, because it has to be. `SectionBar` is `sm:hidden`:
    // at the 1280 width every check above runs at, it is not in the document
    // at all. A check for it written into the sweep would have passed on an
    // element that was never there, which is the exact shape of the vacuous
    // test this epic has now shipped twice and caught twice.
    {
      const phone = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await phone.newPage();
      await page.goto(base + "/", { waitUntil: "load" });
      await page.waitForTimeout(600);

      const bar = await page.evaluate(() => {
        // TWO NAVS CARRY THIS NAME, and picking the first one is how this
        // check spent its first run measuring a `display: none` element and
        // reporting five cells of 0×0. The header's pills and the phone's bar
        // render the same list from the same source and are MUTUALLY
        // EXCLUSIVE by viewport (`max-sm:hidden` against `sm:hidden`), which
        // is what keeps one accessible name on two landmarks honest: at any
        // width exactly one is in the accessibility tree. That is asserted
        // below rather than assumed, because it is the whole reason the
        // duplicate name is not a defect.
        const named = [...document.querySelectorAll('nav[aria-label="Main"]')];
        const shown = named.filter((el) => el.getBoundingClientRect().height > 0);
        const nav = shown[0];
        if (!nav) return { named: named.length, shown: shown.length };
        const cells = [...nav.querySelectorAll("li")];
        const links = [...nav.querySelectorAll("a[href]")];
        const inert = [...nav.querySelectorAll('[aria-disabled="true"]')];
        const rect = (el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        };
        return {
          named: named.length,
          shown: shown.length,
          landmark: nav.getAttribute("aria-label"),
          // A list, so a screen reader can say how many there are and where
          // in the set each one is. Five words in five divs is five words.
          list: nav.querySelector("ul") !== null && cells.length > 0,
          cells: cells.length,
          links: links.length,
          // Exactly one cell may claim to be the page. `aria-current="page"`
          // is the only thing that says WHICH of five destinations you are
          // standing on; the lit pill says it to everybody else.
          current: links.filter((a) => a.getAttribute("aria-current") === "page").length,
          // Every inert cell has to say WHY it is inert, in words, not by
          // being grey. The shell's convention since XP0.
          inertNamed: inert.every((el) => /not yet available/i.test(el.textContent ?? "")),
          inertCount: inert.length,
          // FR2's rule, at the width it belongs to.
          sizes: links.map(rect),
          // It must not be reachable before the content it sits under: a
          // fixed bar that tabs FIRST puts five links between a reader and
          // the page they opened.
          // The VISIBLE bar against `main`, for the same reason as above.
          domOrder: [...document.querySelectorAll("main"), ...shown]
            .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
            .map((el) => (el.tagName === "MAIN" ? "main" : "bar")),
        };
      });

      check(
        "bottom bar: it is rendered at 375",
        !!bar && bar.cells > 0,
        bar ? `${bar.cells} cells` : "no nav[aria-label=Main]",
      );
      check(
        "bottom bar: exactly one Main landmark is in the tree at this width",
        !!bar && bar.shown === 1,
        bar ? `${bar.shown} shown of ${bar.named} named` : "none",
      );
      if (bar && bar.cells > 0) {
        // "Main" since openproduct-redesign OPR1 (boards `Products`, `PhoneFeed`);
        // it was "Sections".
        check("bottom bar: it is a named landmark", bar.landmark === "Main", bar.landmark ?? "(none)");
        check("bottom bar: it is a list, so its size is announced", bar.list, `${bar.cells} items`);
        check(
          "bottom bar: exactly one cell claims to be the current page",
          bar.current === 1,
          `${bar.current} with aria-current=page of ${bar.links} links`,
        );
        check(
          "bottom bar: every inert cell says why, in words",
          bar.inertNamed,
          `${bar.inertCount} inert`,
        );
        const undersized = bar.sizes.filter((s) => Math.min(s.w, s.h) < 44);
        check(
          "bottom bar: every cell is a 44px target (FR2)",
          undersized.length === 0,
          undersized.length ? undersized.map((s) => `${s.w}×${s.h}`).join(" ") : `${bar.sizes.length} cells, smallest ${Math.min(...bar.sizes.map((s) => Math.min(s.w, s.h)))}px`,
        );
        check(
          "bottom bar: it comes AFTER the content in the document",
          bar.domOrder.indexOf("main") < bar.domOrder.indexOf("bar"),
          bar.domOrder.join(" → "),
        );

        // ── and it is operable by keyboard alone ──
        //
        // The done-when's own words. `keyboardReach` parks focus, tabs until
        // it lands, and compares the control's computed style focused against
        // unfocused — so this asserts BOTH halves at once: that a Tab can get
        // there at all, and that a person can see when it has.
        // `.fixed` is the bottom bar's own class and the header's nav does not
        // carry it — the narrowest true statement that separates the two.
        const first = await keyboardReach(page, "nav.fixed[aria-label=\"Main\"] a[href]");
        check("bottom bar: the first cell is reachable by Tab, with a visible ring", first.ok, first.why);

        // Every cell, not just the first: a bar whose third link is
        // `tabindex="-1"` passes the check above and strands a reader in the
        // middle of the row.
        const reachable = await page.evaluate(() => {
          const links = [...document.querySelectorAll('nav.fixed[aria-label="Main"] a[href]')];
          const stranded = links.filter((a) => Number(a.getAttribute("tabindex")) < 0);
          return { total: links.length, stranded: stranded.length };
        });
        check(
          "bottom bar: no cell is removed from the tab order",
          reachable.stranded === 0,
          `${reachable.total} links, ${reachable.stranded} with a negative tabindex`,
        );
      }

      await phone.close();
    }
  } finally {
    await browser.close();
  }

  console.log(
    failures.length === 0
      ? "web-a11y: ALL CHECKS PASS"
      : `web-a11y: ${failures.length} FAILED → ${failures.join(" | ")}`,
  );
  return failures.length === 0 ? 0 : 1;
}
