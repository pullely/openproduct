// The commons shell's guards (openproduct-commons XP0).
//
// The web test lane is module-level, so these are assertions about the shell's
// DATA and about the SOURCE of the components that render it — which is the
// right level for what XP0 actually promises. Three of the four properties
// below are program invariants, not shell details:
//
//   I6  every public route renders byte-identically signed-in and signed-out
//   XP-1 one accent colour, one meaning
//   XP-5 a person's name is a link or plain text, never a dead link
//
// openproduct-redesign OPR1 rebuilt the chrome to the boards, and these
// guards were rewritten to hold the new one: three sections at three
// addresses, the phone's four tabs, a footer that holds every section that
// left the bar, the search box in its own island, and the 40px controls.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCOUNT_MENU_ITEMS,
  ACTIVITY_PATH,
  COUNT_PLACEHOLDER,
  FOOTER_LINKS,
  PHONE_TABS,
  SEARCH_PLACEHOLDER,
  SECTIONS,
  initialsOf,
  resolveCrumb,
  signInHref,
} from "@openproduct-web/app/shell/shell";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const STYLES = resolve(__dirname, "../../../web/src/styles/globals.css");

/** Does this app serve a page (or a route handler) at this path? */
function served(path: string): boolean {
  const dir = path === "/" ? APP_DIR : resolve(APP_DIR, path.slice(1));
  return ["page.tsx", "route.ts", "(index)/page.tsx"].some((file) => existsSync(resolve(dir, file)));
}

describe("the section nav", () => {
  it("is the redesign's three destinations, at their three addresses", () => {
    // design.md §2 rule 4, locked by the owner: the navigation is Feed,
    // Products, Help wanted. The bar this replaced read Builds, Open roles,
    // Topics, People; Topics and People are in the footer now (below).
    expect(SECTIONS.map((s) => [s.label, s.href])).toEqual([
      ["Feed", "/"],
      ["Products", "/products"],
      ["Help wanted", "/help-wanted"],
    ]);
    // No People directory in the navigation — the owner's rule.
    expect(SECTIONS.some((s) => s.href.startsWith("/people") || s.href.startsWith("/topics"))).toBe(false);
    // Every destination wears one glyph, and no two share one.
    const icons = PHONE_TABS.map((t) => t.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("has no dead link: every destination in the chrome is a page this app serves", () => {
    // The rule that used to be "a planned section explains itself". Nothing
    // is planned now, so the rule is the plain one: a link in the chrome
    // resolves. This is what made `/products`, `/help-wanted` and
    // `/activity` pages in the same change that put them in the bar.
    for (const href of [...SECTIONS.map((s) => s.href), ...PHONE_TABS.map((t) => t.href), ACTIVITY_PATH]) {
      expect([href, served(href)]).toEqual([href, true]);
    }
  });

  it("gives a phone four tabs: the three sections and Activity, Help wanted as 'Seats'", () => {
    expect(PHONE_TABS.map((t) => [t.label, t.href])).toEqual([
      ["Feed", "/"],
      ["Products", "/products"],
      ["Seats", "/help-wanted"],
      ["Activity", "/activity"],
    ]);
    // Derived from the sections rather than written twice: same ids, same
    // addresses, in the same order.
    expect(PHONE_TABS.slice(0, SECTIONS.length).map((t) => [t.id, t.href])).toEqual(
      SECTIONS.map((s) => [s.id, s.href]),
    );
  });

  it("the search is LIVE, and lives in its own island", () => {
    const panel = readFileSync(resolve(APP_DIR, "shell/top-panel.tsx"), "utf-8");
    // The search box is a separate client component, so the header itself
    // stays what it was — the nav is not personal and must not be dragged
    // into a component that fetches.
    expect(panel).toContain("<HeaderSearch />");
    expect(panel).not.toMatch(/<input/);
    // ONE search: the palette's export is gone rather than kept beside the
    // box as a second way to do the same thing.
    expect(panel).not.toContain("CommandPalette");
    expect(readFileSync(resolve(APP_DIR, "shell/palette.tsx"), "utf-8")).not.toContain("CommandPalette");
    // The placeholder names the two classes the card answers.
    expect(SEARCH_PLACEHOLDER).toBe("Search products and people");
  });

  it("the header's own rhythm is in absolute pixels, not rems", () => {
    // `globals.css` typesets html below 16px, so every rem-based Tailwind
    // size renders small — an `h-10` control is not the 40px the board
    // draws. The MX1 lesson, applied to the shell.
    const panel = readFileSync(resolve(APP_DIR, "shell/top-panel.tsx"), "utf-8");
    // A FIXED height since FR1, not a minimum: a bar with a floor under it
    // grows whenever something inside it does. 60px is the board's 40px
    // controls in its 10px of padding.
    expect(panel).toContain("h-[60px]");
    expect(panel).not.toContain("min-h-[60px]");
    // The pills are the board's 36px.
    expect(panel).toContain("h-[36px]");
    expect(panel).not.toMatch(/className="[^"]*\bh-(?:9|10|14)\b/);
    const chip = readFileSync(resolve(APP_DIR, "shell/account-chip.tsx"), "utf-8");
    expect(chip).toContain("h-[40px] w-[40px]");
    expect(chip).not.toMatch(/className="[^"]*\bh-(?:8|10)\b/);
  });

  it("is a sticky frosted bar in the page's column, flat: no border, no shadow", () => {
    const panel = markupOf("shell/top-panel.tsx");
    const header = panel.match(/<header className="([^"]*)"/)?.[1] ?? "";
    expect(header).toContain("sticky top-0");
    expect(header).toContain("bg-panel/[0.62]");
    expect(header).toMatch(/backdrop-blur-\[16px\]/);
    expect(header).toMatch(/backdrop-saturate-/);
    // design.md §2 rule 11.
    expect(header).not.toMatch(/\bborder(?:-|\b)|\bshadow/);
    // The page's own column: 1180px, 24px gutters.
    expect(panel).toMatch(/max-w-\[1180px\][^"]*\bpx-6\b/);
  });

  it("lights at most one destination: one `aria-current`, from one function", () => {
    const panel = markupOf("shell/top-panel.tsx");
    // The pills and the bell both ask `sectionFor`, which names one
    // destination or none — so two of them cannot be current at once.
    expect(panel).toContain("const activeSection = sectionFor(pathname)");
    expect(panel).toContain('aria-current={current ? "page" : undefined}');
    expect(panel).toContain('<NotificationBell current={activeSection === "activity"} />');
    expect((panel.match(/aria-current=/g) ?? []).length).toBe(1);
    // The current pill is ink with the light ink on it.
    expect(panel).toMatch(/current\s*\?\s*"bg-foreground font-semibold text-background"/);
  });
});

describe("the footer holds what left the bar", () => {
  it("links every section that has no board, and each one is a route that exists", () => {
    const hrefs = FOOTER_LINKS.map((l) => l.href);
    // Topics and People were in the header until OPR1; the rest were here
    // or reachable only through the bar. Nothing was removed from the site.
    for (const href of [
      "/topics",
      "/people",
      "/stack",
      "/pricing",
      "/collections",
      "/threads",
      "/digest",
      "/docs",
      "/transparency",
      "/submit",
    ]) {
      expect(hrefs).toContain(href);
    }
    for (const link of FOOTER_LINKS) {
      const path = link.plain ? link.href.replace(/\/[^/]+$/, "") : link.href;
      expect([link.href, link.plain ? existsSync(resolve(APP_DIR, link.href.slice(1))) || served(path) : served(path)]).toEqual([
        link.href,
        true,
      ]);
    }
    // No duplicates, and no link back into the bar's own three.
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.filter((href) => SECTIONS.some((s) => s.href === href))).toEqual([]);
  });

  it("renders the list rather than a second copy of it, and keeps the theme control", () => {
    const footer = markupOf("shell/site-footer.tsx");
    expect(footer).toContain("FOOTER_LINKS.map");
    expect(footer).toContain("<ThemeToggle />");
    for (const link of FOOTER_LINKS) expect(footer).not.toContain(`"${link.href}"`);
  });
});

describe("the breadcrumb", () => {
  it("labels every route the product has, and falls back to the identifier", () => {
    expect(resolveCrumb("/")).toBe("Discover");
    expect(resolveCrumb("/people")).toBe("People");
    expect(resolveCrumb("/launches")).toBe("Launches");
    expect(resolveCrumb("/collections")).toBe("Collections");
    expect(resolveCrumb("/docs/formulas")).toBe("Docs");
    // SB0 moved the page to `/submit`; `/create` still redirects there, and
    // both resolve to the same crumb so the hop does not flicker.
    expect(resolveCrumb("/submit")).toBe("New build");
    expect(resolveCrumb("/create")).toBe("New build");
    expect(resolveCrumb("/me/saved")).toBe("Your home");
    expect(resolveCrumb("/studio/org/profile")).toBe("Studio");
    // A listing, and — from CG1 — a handle. Both are already the label.
    expect(resolveCrumb("/kettleworks")).toBe("kettleworks");
    expect(resolveCrumb("/@ada")).toBe("@ada");
  });

  it("never renders a raw path or an empty label", () => {
    for (const path of ["/", "/a/b/c/d", "/x?y=1", "//", "/kettleworks/"]) {
      const crumb = resolveCrumb(path);
      expect(crumb.length).toBeGreaterThan(0);
      expect(crumb).not.toContain("/");
      expect(crumb).not.toContain("?");
    }
  });
});

describe("the account menu", () => {
  it("every destination it offers exists today", () => {
    // The "You" section: what the visitor HOLDS here, counted, and the way
    // to the digest control. The profile itself is not in this list any
    // more — the chip renders it in its own Profile section, beside the
    // public page CG1 gave it an address for.
    expect(ACCOUNT_MENU_ITEMS.map((i) => i.href)).toEqual([
      "/studio",
      "/me/saved",
      "/me/applications",
      // NF0 — the inbox, in the same menu because it is the same question
      // (what is mine on this surface). Its address is `/activity` since
      // OPR1, the same one the header's bell goes to.
      "/activity",
      "/me#digest",
    ]);
    // A subscription is not a number: the digest row carries no count.
    expect(ACCOUNT_MENU_ITEMS.find((i) => i.id === "digest")?.countKey).toBeUndefined();
    // The inbox's IS one, and it is the only count here that means "waiting
    // for you" rather than "held by you".
    expect(ACCOUNT_MENU_ITEMS.find((i) => i.id === "notifications")?.countKey).toBe("unread");
  });

  it("the chip's own Profile section links the form and the public page", () => {
    const chip = readFileSync(resolve(APP_DIR, "shell/account-chip.tsx"), "utf-8");
    expect(chip).toContain('href="/me"');
    // The public address is the overlay's answer, never a default: `/@` is
    // only ever built from a handle the overlay returned.
    expect(chip).toContain("`/@${handle}`");
    expect(chip).toContain("openproduct.live/@${handle}");
  });

  it("no count is invented before the overlay exists — the placeholder is not zero", () => {
    // A zero is a claim. An unread overlay has not made one, which is the same
    // rule SN applies to an unobserved metric.
    expect(COUNT_PLACEHOLDER).not.toBe("0");
    expect(COUNT_PLACEHOLDER).toBe("—");
    const chip = readFileSync(resolve(APP_DIR, "shell/account-chip.tsx"), "utf-8");
    expect(chip).toContain("COUNT_PLACEHOLDER");
    expect(chip).not.toMatch(/\?\?\s*0\b/);
  });

  it("nothing between the chip and the header clips the menu it drops", () => {
    // The menu is absolutely positioned below the bar, and the search card
    // drops out of the same row. An ancestor with `overflow: hidden` (or
    // `auto`, or `scroll`) clips a positioned descendant in both axes, and
    // the row that holds the chip once had exactly that — so the menu opened
    // and rendered into nothing.
    const panel = readFileSync(resolve(APP_DIR, "shell/top-panel.tsx"), "utf-8");
    // Only what is APPLIED: the class attributes, not the comments that
    // explain them.
    const classes = Array.from(panel.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g), (m) => m[1] ?? m[2]!).join(" ");
    // Nothing in the bar may clip, on any element and in either axis. The
    // old bar had one sideways scroller (its nav); the new one has none,
    // because three pills fit at every width the header is shown.
    expect(classes).not.toMatch(/\boverflow-/);
    const nav = panel.slice(panel.indexOf("<nav"), panel.indexOf("</nav>"));
    expect(nav).not.toContain("<AccountChip");
    expect(panel.indexOf("<AccountChip")).toBeGreaterThan(panel.indexOf("</nav>"));
  });

  it("keeps every item it had, and carries the theme control", () => {
    const chip = readFileSync(resolve(APP_DIR, "shell/account-chip.tsx"), "utf-8");
    // The restyle removed nothing: identity, Profile, You, the platform and
    // the way out are all still there.
    for (const piece of [
      'label="Profile"',
      'label="You"',
      "Your profile",
      "Public page",
      "ACCOUNT_MENU_ITEMS.map",
      "Your workspace on Orunbase",
      'href="/auth/signout"',
      "<ThemeToggle />",
    ]) {
      expect(chip).toContain(piece);
    }
  });

  it("names exactly one external destination, and it is the platform", () => {
    const chip = readFileSync(resolve(APP_DIR, "shell/account-chip.tsx"), "utf-8");
    expect(chip).toContain("consoleOrigin");
    expect(chip).toContain("Your workspace on Orunbase");
  });
});

describe("sign-in targets", () => {
  it("points at openproduct's OWN door, not at the first step of the handshake", () => {
    // THE BUG. `/auth/start` builds an authorize URL and redirects to
    // Orunbase; it is not a sign-in page and never was. Every act that needed
    // a session sent people there, so pressing `Post` under a comment put an
    // Orunbase consent card on the screen with no openproduct account offered
    // and nothing said about why you had left. `/signin` is the door, and
    // Orunbase is a control on it.
    expect(signInHref("/me/saved")).toBe("/signin?return_to=%2Fme%2Fsaved");
    expect(signInHref("/me/saved")).not.toContain("/auth/start");
  });

  it("returns to where the journey started, and never loops through /auth", () => {
    expect(signInHref(null)).toBe("/signin");
    expect(signInHref("/")).toBe("/signin");
    expect(signInHref("/auth/start")).toBe("/signin");
    expect(signInHref("/auth/callback?code=x")).toBe("/signin");
    // Nor through the door itself, which is the loop this route introduces.
    expect(signInHref("/signin")).toBe("/signin");
    expect(signInHref("/signin?return_to=%2Fme")).toBe("/signin");
    expect(signInHref("/kettleworks?tab=components")).toBe(
      "/signin?return_to=%2Fkettleworks%3Ftab%3Dcomponents",
    );
  });
});

describe("initials", () => {
  it("takes at most two, and never renders an empty avatar", () => {
    expect(initialsOf("Ada Fenwick")).toBe("AF");
    expect(initialsOf("Nadia")).toBe("N");
    expect(initialsOf("Joon-ho Bae Extra")).toBe("JB");
    expect(initialsOf(null)).toBe("··");
    expect(initialsOf("   ")).toBe("··");
  });
});

/**
 * A file's MARKUP — its comments removed.
 *
 * THE ACCENT GUARDS BELOW READ CODE, NOT PROSE, and the distinction is the one
 * UV0's copy guard had to learn: the comment above a decision names the thing
 * the decision rejected. TP0 wrote `// NOT hover:text-endorse-ink, because
 * XP-1 reserves the accent` above a link that deliberately does not spend it,
 * and the guard reported the file as spending it — a comment explaining why
 * the accent is NOT used is the opposite of using it.
 */
function markupOf(file: string): string {
  return readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("XP-1 — one accent colour, one meaning", () => {
  it("the endorsement gold is defined once per theme and is the only reserved accent", () => {
    const css = readFileSync(STYLES, "utf-8");
    // Two values because one of them is TEXT: the mark may sit at the glyph
    // contrast the design draws, a gold *word* may not.
    expect(css).toContain("--endorse:");
    expect(css).toContain("--endorse-ink:");
    // OL1 widened the accent from a pair to a family of four: the fill, the
    // ink, the soft wash and the line. All four must exist in both themes —
    // a token whose only definition sits in one theme renders one theme's ink
    // on the other's ground.
    expect(css).toContain("--endorse-soft:");
    expect(css).toContain("--endorse-line:");
    // TWO THEMES SINCE FR0, AND STILL NOT A SECOND STYLESHEET. This assertion
    // used to read "one theme … there is no `.dark` block for a token to be
    // missing from", which was true when the site had one ramp and is the
    // wrong claim now. What it was really guarding — that a token cannot be
    // defined in one theme and missing from the other — is guarded properly
    // in `dark-ramp.test.ts`, over all 103 of them rather than over `--panel`.
    //
    // What survives here is the SHAPE: dark is a second set of values on the
    // same tokens (WC-8), so there is still no theme class and no component
    // that knows which ramp it is in.
    expect(css).not.toMatch(/^\s*\.dark\b/m);
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("@media (prefers-color-scheme: dark)");

    // One base definition (`:root`) plus one per non-default hue — that is the
    // light value. Amber is the default (openproduct-redesign OPR1; it was
    // ocean) and lives in `:root`, so three hue
    // blocks and four definitions in all. FR0's dark counterparts are
    // `--dk-endorse*`, which this pattern deliberately does not match: the
    // point of the count is that the LIGHT value is defined once per hue.
    const counts = Object.fromEntries(
      ["--endorse", "--endorse-ink", "--endorse-soft", "--endorse-line"].map((token) => [
        token,
        css.match(new RegExp(`(?<!-)-${token.slice(1)}:\\s*[\\d.]`, "g"))?.length ?? 0,
      ]),
    );
    expect(counts).toEqual({
      "--endorse": 4,
      "--endorse-ink": 4,
      "--endorse-soft": 4,
      "--endorse-line": 4,
    });

    // THE DESIGN'S OWN CLAIM ABOUT ITSELF, as a test: an accent block
    // redefines the accent family and NOTHING else. If swapping the hue also
    // had to restate a border or an ink, the claim that the accent is
    // swappable "without redrawing anything" would be false — and this is
    // the assertion that would catch it becoming false.
    const blocks = Array.from(
      css.matchAll(/\[data-accent="(?:ember|moss|plum)"\]\s*\{([^}]*)\}/g),
      (m) => m[1]!,
    );
    expect(blocks.length).toBe(3);
    for (const block of blocks) {
      // FR0 added the dark four alongside the light four. The claim is
      // unchanged and now covers both ramps: an accent block redefines the
      // accent family and NOTHING else, in either.
      const declared = Array.from(block.matchAll(/(--[a-z-]+)\s*:/g), (m) => m[1]!).sort();
      expect(declared).toEqual([
        "--dk-endorse",
        "--dk-endorse-ink",
        "--dk-endorse-line",
        "--dk-endorse-soft",
        "--endorse",
        "--endorse-ink",
        "--endorse-line",
        "--endorse-soft",
      ]);
    }
  });

  it("the shell spends the accent where the design does, and nowhere else", () => {
    // MATCHES THE TOKEN'S USE, NOT THE WORD: the utilities that paint with
    // the accent, and the raw custom property behind them. The chrome wears
    // the accent in exactly two places — the logomark's ring and the unread
    // dot (one component, worn by the bell and by the phone's Activity tab)
    // — and the bar itself never reaches for it. The signed-in avatar wore
    // the accent's soft wash until openproduct-calm CL1 (CL-R8): a disc in
    // the upvote's colour beside every upvote box on the page said two
    // things with one colour, so it is a neutral disc.
    const SPENDS_GOLD =
      /(?:\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|shadow|accent|caret|decoration)-endorse\b)|--endorse/g;
    expect((markupOf("shell/top-panel.tsx").match(SPENDS_GOLD) ?? []).length).toBe(0);
    expect((markupOf("shell/logomark.tsx").match(SPENDS_GOLD) ?? []).length).toBe(1);
    expect((markupOf("shell/section-bar.tsx").match(SPENDS_GOLD) ?? []).length).toBe(0);
    // The avatar: a neutral white disc, in the signed-in branch.
    const chip = markupOf("shell/account-chip.tsx");
    expect(chip).toContain("rounded-full bg-card font-mono text-[13px] font-medium text-foreground");
    expect((chip.match(SPENDS_GOLD) ?? []).length).toBe(0);
    // The dot: the accent's fill, once, and only when something is unread —
    // on the bell and on the phone's tab alike.
    const bell = markupOf("shell/notification-bell.tsx");
    expect((bell.match(SPENDS_GOLD) ?? []).length).toBe(1);
    expect(bell).toMatch(/unread > 0 \? <UnreadDot/);
    expect(markupOf("shell/section-bar.tsx")).toMatch(/marked \? <UnreadDot/);
    // The search box and its card spend none of it: the door out is a
    // link, and a link wears the link token (`amber-ink`), not the
    // endorsement's.
    expect((markupOf("shell/palette.tsx").match(SPENDS_GOLD) ?? []).length).toBe(0);
    expect((markupOf("shell/palette-panel.tsx").match(SPENDS_GOLD) ?? []).length).toBe(0);
    expect(markupOf("shell/palette-panel.tsx")).toContain("text-amber-ink");
  });

  it("a save is not an endorsement, and does not borrow its colour (OPC-3)", () => {
    // OPC-3 in a test. A save is private and an endorsement is public; they
    // are two objects, and the first symptom of them being quietly merged
    // back into one would be the reserved gold appearing on a saved thing.
    const SPENDS_GOLD =
      /(?:\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|shadow|accent|caret|decoration)-endorse\b)|--endorse/g;
    expect(markupOf("ui/save-control.tsx").match(SPENDS_GOLD)).toBeNull();
    // The product page spends it on the `#1 today` pill and nowhere else —
    // the same meaning the feed row spends it on. The vote box beside it is
    // a shared component and is held to its own rule below.
    const product = markupOf("[slug]/page.tsx");
    expect(product.match(SPENDS_GOLD)?.length).toBe(3);
    expect(product).toMatch(/border-endorse-line bg-endorse-soft[^"]*text-endorse-ink/);
  });

  it("EN1 — the vote box is the one place the accent is SPENT, and it says why", () => {
    // The other half of the rule above. Every previous assertion in this
    // block is a prohibition; without this one the whole set is satisfied by
    // a product where the reserved accent appears nowhere at all, and a
    // colour reserved for a meaning that never renders is not reserved, it
    // is unused.
    const SPENDS_GOLD =
      /(?:\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|shadow|accent|caret|decoration)-endorse\b)|--endorse/g;
    const control = markupOf("ui/vote-box.tsx");
    expect((control.match(SPENDS_GOLD) ?? []).length).toBeGreaterThan(0);

    // THE BOX IS WHAT CHANGES, as the design draws it: at rest the card on a
    // hairline in `--fg`, mark and number alike; once voted, the accent's
    // soft wash inside its line, in its ink. The mark takes the box's colour
    // in both states — it is never painted on its own.
    expect(control).toMatch(/voted\s*\n?\s*\?\s*"border-endorse-line bg-endorse-soft text-endorse-ink"/);
    expect(control).toMatch(/:\s*"border-border bg-card text-foreground/);
    expect(control).not.toMatch(/aria-hidden="true"[^>]*text-endorse/);
  });
});

describe("I6 — the shell does not personalise on the server", () => {
  it("no shell module reads a header, a cookie, or the session", () => {
    for (const file of [
      "shell/shell.ts",
      "shell/top-panel.tsx",
      "shell/section-bar.tsx",
      "shell/site-footer.tsx",
      "shell/notification-bell.tsx",
      "shell/palette.tsx",
      "shell/palette-panel.tsx",
      "shell/account-chip.tsx",
      "shell/logomark.tsx",
      "layout.tsx",
    ]) {
      const source = readFileSync(resolve(APP_DIR, file), "utf-8");
      expect(source).not.toMatch(/cookies\(|headers\(|op_session|SESSION_COOKIE/);
    }
  });

  it("the personal islands are client components, and the header itself fetches nothing", () => {
    for (const file of ["shell/account-chip.tsx", "shell/notification-bell.tsx", "shell/section-bar.tsx"]) {
      expect(readFileSync(resolve(APP_DIR, file), "utf-8").startsWith('"use client";')).toBe(true);
    }
    const panel = readFileSync(resolve(APP_DIR, "shell/top-panel.tsx"), "utf-8");
    // The panel is a client component for `usePathname` (which resolves during
    // the server render), NOT for personalisation — it must not fetch.
    expect(panel).not.toMatch(/fetch\(/);
  });

  it("nothing personal is in the server-rendered chrome", () => {
    // What a signed-in visitor sees that a stranger does not — a name,
    // initials, a handle, counts, the unread dot — is state the islands
    // hold, and every piece of it starts EMPTY, so the server render (and
    // the first client render) is the anonymous one for everybody.
    const chip = markupOf("shell/account-chip.tsx");
    // The name starts null and is set only inside the effect that reads
    // `/auth/session`; an effect does not run on the server.
    expect(chip).toMatch(/useState<string \| null>\(null\)/);
    expect(chip).toMatch(/React\.useEffect\(\(\) => \{[\s\S]*?fetch\("\/auth\/session"/);
    // The menu, which holds everything personal, is not rendered until it is
    // opened — and it starts closed.
    expect(chip).toMatch(/const \[open, setOpen\] = React\.useState\(false\)/);
    expect(chip).toMatch(/\{open \? \(\s*<div\s+role="menu"/);
    // Both branches are in the document for everyone; CSS shows one.
    expect(chip).toContain('data-auth-branch="anonymous"');
    expect(chip).toContain('data-auth-branch="signed-in"');
    // The unread dot is drawn only above zero, and the count is zero until
    // the signed-in overlay answers, after paint.
    const bell = markupOf("shell/notification-bell.tsx");
    expect(bell).toContain("unreadCount(useOverlay(");
    expect(bell).toMatch(/unread > 0 \? <UnreadDot/);
    // The search card is not rendered until somebody types.
    expect(markupOf("shell/palette.tsx")).toMatch(/\{open \? \(\s*<PalettePanel/);
    expect(markupOf("shell/palette.tsx")).toMatch(/useState\(""\)/);
  });
});
