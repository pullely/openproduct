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
// The fourth is XP1's rule brought forward: a control that is not yet live
// says why rather than looking broken.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCOUNT_MENU_ITEMS,
  COUNT_PLACEHOLDER,
  SECTIONS,
  initialsOf,
  liveSections,
  resolveCrumb,
  signInHref,
} from "@openproduct-web/app/shell/shell";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const STYLES = resolve(__dirname, "../../../web/src/styles/globals.css");

describe("the section nav", () => {
  it("renders the launch design's destinations, and says which are live", () => {
    // THE DESIGN'S FOUR, AND PEOPLE. Products left with the directory (`/` IS
    // the launches; `/products` redirects there). People came BACK: `/people`
    // is a live page and half of what this commons is for — the products are
    // here to be joined, and the people are who you would be joining — and a
    // live destination with no way to reach it from the shell is the
    // regression XP4's keyboard walk exists to catch. Reasons in shell.ts.
    // OB1 (openproduct-open-builds D5) — BUILDS, NOT LAUNCHES. The id stays
    // `launches` because `sectionFor` and the archive key on it. Collections
    // and Leaderboard left the bar (the footer and the Upvoted order hold
    // them); Open roles joined it, planned at OB1 and live since OB4 at the
    // front page's Roles order.
    expect(SECTIONS.map((s) => s.label)).toEqual(["Builds", "Open roles", "Topics", "People"]);
    expect(liveSections().map((s) => s.id)).toEqual(["launches", "roles", "topics", "people"]);
    expect(SECTIONS.length).toBe(4);
    expect(SECTIONS.find((s) => s.id === "roles")?.href).toBe("/builds/roles");
    // NONE IS PLANNED NOW — the machinery stays for the next one.
    expect(SECTIONS.filter((s) => s.status === "planned").map((s) => s.id)).toEqual([]);
    // Every section wears one glyph, and no two share one (D6).
    const icons = SECTIONS.map((s) => s.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("every planned section names the sub-epic that delivers it and what it holds", () => {
    // The rule that keeps "not yet" from decaying into "broken": a planned
    // destination must be able to explain itself, so it cannot be added
    // without someone deciding what it is for.
    for (const section of SECTIONS) {
      if (section.status === "live") {
        expect(section.href).toBeTruthy();
        continue;
      }
      expect(section.href).toBeNull();
      // Two letters and a number: OL1's planned entries name the MILESTONE
      // that delivers them (TP0, UV2) rather than the cluster, because a
      // cluster is a plan and a milestone is a branch somebody can look up.
      expect(section.arrivesWith?.cluster).toMatch(/^[A-Z]{2}\d[a-z]?$/);
      expect((section.arrivesWith?.holds ?? "").length).toBeGreaterThan(12);
    }
  });

  it("the search affordance is LIVE at DS3, and lives in its own island", () => {
    const panel = readFileSync(resolve(APP_DIR, "shell/top-panel.tsx"), "utf-8");
    // The palette is a separate client component, so the panel itself stays
    // what it was — the crumb and the nav are not personal and must not be
    // dragged into a component that fetches.
    expect(panel).toContain("<CommandPalette />");
    expect(panel).not.toMatch(/<input/);
    // And the "not yet" is gone rather than left lying around: an unused
    // pending label is how a surface ends up claiming something is coming
    // that already came.
    expect(panel).not.toContain("SEARCH_PENDING_LABEL");
  });

  it("the panel's own rhythm is in absolute pixels, not rems", () => {
    // `globals.css` typesets html at 14px, so every rem-based Tailwind size
    // renders at 87.5% — an `h-14` panel is 49px, not the 56px the design
    // draws. The MX1 lesson, applied to the shell.
    const panel = readFileSync(resolve(APP_DIR, "shell/top-panel.tsx"), "utf-8");
    // 60px at OL1, 80px since openproduct-calm CL1 (the bar spans the window
    // and the room is part of the calm) — and a FIXED height since FR1, not a
    // minimum. The original
    // reasoning was that the nav wraps to a second row on a narrow viewport
    // and a fixed height would clip it; the audit measured what that actually
    // produced, which is three rows and 147px at 375px (P0·05). The nav does
    // not wrap any more because it is not in the bar at that width, so the
    // height can be the number the design draws instead of a floor under it.
    expect(panel).toContain("h-[80px]");
    expect(panel).not.toContain("min-h-[80px]");
    expect(panel).not.toMatch(/className="[^"]*\bh-14\b/);
    expect(panel).not.toMatch(/className="[^"]*\bmin-h-\[3\.75rem\]/);
    const chip = readFileSync(resolve(APP_DIR, "shell/account-chip.tsx"), "utf-8");
    expect(chip).toContain("h-[32px]");
    expect(chip).not.toMatch(/className="[^"]*\bh-8\b/);
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
      // (what is mine on this surface) and one badge in one place beats a
      // second affordance in the panel competing with it.
      "/me/notifications",
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
    // The menu is absolutely positioned 44px below a 56px bar. An ancestor
    // with `overflow: hidden` (or `auto`, or `scroll`) clips a positioned
    // descendant in both axes, and the row that holds the chip had exactly
    // that — so the menu opened and rendered into nothing. Sideways
    // containment for the nav is `overflow-x-clip`, which leaves the other
    // axis visible; this pins that the row never goes back.
    const panel = readFileSync(resolve(APP_DIR, "shell/top-panel.tsx"), "utf-8");
    // Only what is APPLIED: the class attributes, not the comments that
    // explain them.
    const classes = Array.from(panel.matchAll(/className="([^"]*)"/g), (m) => m[1]!).join(" ");
    // Nothing in the bar may clip in BOTH axes, on any element — that is the
    // shape of the original bug, and it does not depend on which element has
    // it.
    expect(classes).not.toMatch(/\boverflow-hidden\b/);
    expect(classes).not.toMatch(/\boverflow-(?:auto|scroll|clip)\b/);
    expect(classes).not.toMatch(/\boverflow-y-(?:hidden|auto|scroll|clip)\b/);
    // OL1 removed the intermediate row the chip used to sit inside, so the
    // only scroller left is the nav — and the chip is NOT in it. Sideways
    // containment on the nav is fine precisely because the menu does not drop
    // out of the nav; assert the structure that makes it fine, so a later
    // edit that moves the chip back inside the scroller fails here rather
    // than in a browser.
    expect(classes).toContain("overflow-x-auto");
    const nav = panel.slice(panel.indexOf("<nav"), panel.indexOf("</nav>"));
    expect(nav).not.toContain("<AccountChip");
    expect(panel.indexOf("<AccountChip")).toBeGreaterThan(panel.indexOf("</nav>"));
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
    // the accent in exactly two places — the logomark's ring and the bell's
    // unread badge — and the bar itself never reaches for it. The signed-in
    // avatar wore the accent's soft wash until openproduct-calm CL1 (CL-R8):
    // a disc in the upvote's colour beside every upvote box on the page said
    // two things with one colour, so it is a neutral disc now.
    const SPENDS_GOLD =
      /(?:\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|shadow|accent|caret|decoration)-endorse\b)|--endorse/g;
    expect((markupOf("shell/top-panel.tsx").match(SPENDS_GOLD) ?? []).length).toBe(0);
    expect((markupOf("shell/logomark.tsx").match(SPENDS_GOLD) ?? []).length).toBe(1);
    // The avatar: a neutral disc, in the signed-in branch (CL1).
    const chip = markupOf("shell/account-chip.tsx");
    expect(chip).toContain("rounded-full bg-secondary font-mono text-[13px] font-medium text-foreground");
    expect(chip).not.toContain("border-endorse-line bg-endorse-soft font-mono");
    // The badge: the accent's fill, and only when there is something unread.
    const bell = markupOf("shell/notification-bell.tsx");
    expect(bell).toMatch(/unread > 0 \? \([\s\S]*?bg-endorse\b/);
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
      "shell/account-chip.tsx",
      "shell/logomark.tsx",
      "layout.tsx",
    ]) {
      const source = readFileSync(resolve(APP_DIR, file), "utf-8");
      expect(source).not.toMatch(/cookies\(|headers\(|op_session|SESSION_COOKIE/);
    }
  });

  it("the only personal island is the account chip, and it is a client component", () => {
    const chip = readFileSync(resolve(APP_DIR, "shell/account-chip.tsx"), "utf-8");
    expect(chip.startsWith('"use client";')).toBe(true);
    const panel = readFileSync(resolve(APP_DIR, "shell/top-panel.tsx"), "utf-8");
    // The panel is a client component for `usePathname` (which resolves during
    // the server render), NOT for personalisation — it must not fetch.
    expect(panel).not.toMatch(/fetch\(/);
  });
});
