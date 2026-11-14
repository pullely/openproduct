// The phone's shell (openproduct-worldclass FR1; rebuilt to the boards at
// openproduct-redesign OPR1, board `PhoneFeed`).
//
// FR1's finding still holds and is why this shell exists: at 375px a header
// that carries the sections either wraps into three rows (147px, eighteen
// percent of the viewport) or scrolls a destination off the right edge with
// nothing saying so. So the bar may not wrap at any width, and what does not
// fit gets a home: on a phone the sections are the bottom tab bar, and the
// top bar is a mark, a search field and the profile control.
//
// What OPR1 changed is the shape, and these guards hold the new one: four
// tabs (Feed, Products, Seats, Activity) of at least 54px on a white bar
// with 16px corners, inset from the edges and clear of the home indicator;
// a 44px search field that is a link to `/search`; a 44px profile control.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FOOTER_LINKS, PHONE_TABS, SECTIONS } from "@openproduct-web/app/shell/shell";
import { sectionFor } from "@openproduct-web/app/shell/section-for";
import { THEME_CHOICES, THEME_STORAGE_KEY, applyTheme } from "@openproduct-web/app/ui/theme";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP, file), "utf-8");
const code = (file: string) =>
  read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("one nav, in two positions", () => {
  // The failure this prevents is the obvious one: a second list of sections
  // written into the bottom bar, correct on the day and three sections behind
  // within an epic. The header reads `SECTIONS`; the phone's bar reads
  // `PHONE_TABS`, which `shell.ts` derives from `SECTIONS`; and both light
  // the cell `sectionFor` names.
  it("both read the shared list, and both ask the same function where they are", () => {
    expect(code("shell/top-panel.tsx")).toMatch(/import \{[^}]*SECTIONS[^}]*\} from "\.\/shell"/);
    expect(code("shell/section-bar.tsx")).toMatch(/import \{[^}]*PHONE_TABS[^}]*\} from "\.\/shell"/);
    expect(code("shell/shell.ts")).toMatch(/PHONE_TABS[^=]*=\s*\[\s*\.\.\.SECTIONS\.map/);
    for (const file of ["shell/top-panel.tsx", "shell/section-bar.tsx"]) {
      expect(code(file)).toContain('from "./section-for"');
    }
  });

  it.each(["shell/top-panel.tsx", "shell/section-bar.tsx"])(
    "%s defines no sections of its own",
    (file) => {
      for (const label of [...SECTIONS.map((s) => s.label), ...PHONE_TABS.map((t) => t.label)]) {
        expect(code(file)).not.toContain(`"${label}"`);
      }
      for (const href of PHONE_TABS.map((t) => t.href).filter((href) => href !== "/")) {
        expect(code(file)).not.toContain(`"${href}"`);
      }
    },
  );

  it("renders every tab in the bar: the list is mapped, never filtered", () => {
    // XP4's rule that no section may be dropped on a phone.
    expect(code("shell/section-bar.tsx")).toContain("PHONE_TABS.map");
    expect(code("shell/section-bar.tsx")).not.toMatch(/PHONE_TABS\.(?:filter|slice)/);
    expect(code("shell/top-panel.tsx")).toContain("SECTIONS.map");
  });

  it("shows exactly one of the two at any width", () => {
    // The header's pills are `max-sm:hidden`; the bar is `sm:hidden`. Both
    // carry `aria-label="Main"`, which is correct precisely because only one
    // is ever displayed — `display: none` keeps the other out of the
    // accessibility tree, so there is one Main landmark, not two.
    expect(read("shell/top-panel.tsx")).toMatch(/aria-label="Main" className="[^"]*max-sm:hidden/);
    expect(code("shell/section-bar.tsx")).toMatch(/aria-label="Main"\s+className="[^"]*sm:hidden/);
  });
});

describe("the four tabs, as the board draws them", () => {
  const bar = () => code("shell/section-bar.tsx");
  const nav = () => /<nav[\s\S]*?className="([^"]*)"/.exec(bar())?.[1] ?? "";
  const tab = () => /className=\{`(flex min-h[^`]*)`\}/.exec(bar())?.[1] ?? "";

  it("is Feed, Products, Seats and Activity, in that order", () => {
    expect(PHONE_TABS.map((t) => t.label)).toEqual(["Feed", "Products", "Seats", "Activity"]);
    expect(PHONE_TABS.map((t) => t.href)).toEqual(["/", "/products", "/help-wanted", "/activity"]);
    expect(bar()).toContain("grid-cols-4");
  });

  it("makes every tab at least 54px tall, a glyph above an 11px word", () => {
    expect(tab()).toContain("min-h-[54px]");
    expect(tab()).toContain("flex-col");
    // 11px is the `label` step of the type ladder.
    expect(tab()).toMatch(/\btext-label\b/);
    expect(bar()).toMatch(/<SectionGlyph icon=\{tab\.icon\} className="h-\[22px\] w-\[22px\]/);
    // The word is rendered, under the glyph: a glyph is never the only name.
    expect(bar()).toMatch(/<\/span>\s*\{tab\.label\}/);
  });

  it("draws the current tab in ink at weight 600, and marks exactly one", () => {
    expect(bar()).toMatch(/current \? "font-semibold text-foreground" : "font-normal text-muted-foreground"/);
    expect(bar()).toContain('aria-current={current ? "page" : undefined}');
    expect((bar().match(/aria-current=/g) ?? []).length).toBe(1);
    expect(bar()).toContain("const current = tab.id === active");
  });

  it("is a white bar with 16px corners, inset from the edges, flat", () => {
    expect(nav()).toContain("fixed");
    expect(nav()).toContain("bg-card");
    expect(nav()).toContain("rounded-[16px]");
    expect(nav()).toContain("inset-x-[10px]");
    // design.md §2 rule 11: no border, no shadow, no blur behind it.
    expect(nav()).not.toMatch(/\bborder|\bshadow|backdrop/);
  });

  it("stands on the page's own colour, so no row shows round it as the page scrolls", () => {
    // The bar is fixed and inset; without a ground the rows of the page were
    // visible through the 10px at its sides and the 14px under it. The
    // ground is one element before the nav, hidden from the tree, and its
    // geometry is the reserve's — written beside the reserve in globals.css.
    expect(bar()).toMatch(/<div aria-hidden="true" className="tabbar-ground" \/>\s*<nav/);
    const css = readFileSync(resolve(APP, "../styles/globals.css"), "utf-8");
    const rule = css.slice(css.lastIndexOf(".tabbar-ground {"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toContain("position: fixed;");
    expect(body).toContain("height: var(--tabbar-reserve);");
    expect(body).toContain("pointer-events: none;");
    expect(body).toContain("oklch(var(--background))");
    // Off from `sm` up, where the bar is not drawn.
    expect(css).toMatch(/\.tabbar-ground \{\s*display: none;/);
  });

  it("stands clear of the home indicator", () => {
    // The safe-area inset is added to the bar's offset from the bottom, so
    // a phone with a home indicator gets the same 54px tabs lifted above it.
    expect(nav()).toContain("bottom-[calc(14px+env(safe-area-inset-bottom))]");
  });

  it("does not prefetch on sight (QE0)", () => {
    expect(bar()).toMatch(/prefetch=\{false\}/);
  });
});

describe("sectionFor — which cell is lit", () => {
  // Its own module since FR1: the web test lane is module-level with no JSX,
  // so a rule inside a `.tsx` is a rule no test in this repository can hold,
  // and two navs need the one answer.
  it("lights Feed for the root, and only the root", () => {
    expect(sectionFor("/")).toBe("feed");
    expect(sectionFor("/?x=1")).toBe("feed");
  });

  it("lights Products for the list, its pages and sorts, and a product's own page", () => {
    // Boards `Products`, `Product` and `ProductIdea` all light Products.
    expect(sectionFor("/products")).toBe("products");
    expect(sectionFor("/products/abc123")).toBe("products");
    expect(sectionFor("/products/by/upvoted")).toBe("products");
    expect(sectionFor("/products/by/newest")).toBe("products");
    expect(sectionFor("/my-product")).toBe("products");
  });

  it("lights Help wanted at its own address", () => {
    expect(sectionFor("/help-wanted")).toBe("help-wanted");
  });

  it("lights nothing under /builds/: every order there redirects, and what is left is a 404", () => {
    // The orders were views of Products and Help wanted and lit them. They
    // are `redirects()` entries now, so the bar never draws at those
    // addresses; an unknown segment draws the not-found page, which is
    // nobody's section — and must not read as a product's page.
    for (const path of ["/builds", "/builds/newest", "/builds/roles", "/builds/zzz"]) {
      expect([path, sectionFor(path)]).toEqual([path, ""]);
    }
    // …and the server renders an unmatched address under `/_not-found`, so
    // that head lights nothing either: the 404 is not a product's page.
    expect(sectionFor("/_not-found")).toBe("");
  });

  it("lights Activity — the bell and the phone's fourth tab", () => {
    expect(sectionFor("/activity")).toBe("activity");
  });

  it("returns only ids the chrome can light", () => {
    const ids = new Set(["", ...PHONE_TABS.map((t) => t.id)]);
    for (const path of ["/", "/products", "/help-wanted", "/activity", "/x", "/@ada", "/me", "/topics"]) {
      expect(ids.has(sectionFor(path))).toBe(true);
    }
  });

  it("lights nothing for a person: People is not in the navigation", () => {
    // The owner's rule (design.md §2 rule 4). `/@ada` is rewritten to
    // `/people/ada` at the router; the bar reads the address bar.
    expect(sectionFor("/@ada")).toBe("");
    expect(sectionFor("/people")).toBe("");
    expect(sectionFor("/people/ada")).toBe("");
  });

  it("lights nothing on the sections that left the bar, and never mistakes them for a product", () => {
    // Topics, stacks, pricing, collections and the leaderboard are routes,
    // not sections. Without the reserved heads they would fall through to "a
    // product's page" and light Products.
    for (const path of [
      "/topics",
      "/topics/devtools",
      "/stack",
      "/stack/typescript",
      "/pricing",
      "/collections/picks",
      "/leaderboard/month",
      "/launches/2026-09-07",
      "/threads",
    ]) {
      expect([path, sectionFor(path)]).toEqual([path, ""]);
    }
  });

  it("lights nothing on a path no section owns", () => {
    for (const path of ["/me", "/studio", "/digest", "/docs", "/submit", "/search"]) {
      expect(sectionFor(path)).toBe("");
    }
  });

  it("lights nothing on the sign-in door or a share route (openproduct-calm-pages CP1)", () => {
    // `/signin` once fell through to "a product's page" and lit the list.
    for (const path of ["/signin", "/badge/ackstack", "/og/site", "/comment"]) {
      expect([path, sectionFor(path)]).toEqual([path, ""]);
    }
  });

  it("ignores a query string, because a filter does not change the section", () => {
    expect(sectionFor("/products?sort=new")).toBe("products");
  });

  it("reserves a head for every footer link, so none of them is taken for a product", () => {
    for (const link of FOOTER_LINKS) {
      expect([link.href, sectionFor(link.href)]).toEqual([link.href, ""]);
    }
  });
});

describe("the header may not grow", () => {
  /** The bar's own row — the element whose height is the bar's. */
  const row = () => {
    const m = /<div className="(mx-auto[^"]*)"/.exec(read("shell/top-panel.tsx"));
    if (!m) throw new Error("top-panel's row is not where this test expects it");
    return m[1]!;
  };

  it("does not wrap at any width", () => {
    // THE ROOT CAUSE. `flex-wrap` plus `min-height` is a bar that grows every
    // time its contents do; three rows at 375px is what that looks like. With
    // `flex-nowrap` the row cannot grow, so anything that does not fit has to
    // be given a home — which is the decision the wrapping was postponing.
    // (The board's header wraps; this is the one place the build is stricter
    // than the board, and `top-panel.tsx` says why.)
    // SCOPED TO THE ROW, not to the file: `max-sm:min-h-[44px]` on a control
    // is the opposite kind of rule. What must not come back is a MIN height
    // on the row itself.
    expect(row()).toContain("flex-nowrap");
    expect(row()).not.toMatch(/flex-wrap|min-h-/);
  });

  it("is a fixed 60px, and 68px on a phone", () => {
    // 60px is the board's 40px controls in 10px of padding; 68px is the
    // phone board's 44px field in 12px. No hairline to account for: the bar
    // has no border.
    expect(row()).toMatch(/(?:^|\s)h-\[60px\]/);
    expect(row()).toContain("max-sm:h-[68px]");
  });

  it("on a phone, is a mark, a search field that is a link, and the profile control", () => {
    const bar = code("shell/top-panel.tsx");
    // The sections are not in the row on a phone (they are the tab bar), and
    // neither is the search box that opens a card, nor the bell.
    expect(bar).toMatch(/<nav aria-label="Main" className="[^"]*max-sm:hidden/);
    expect(code("shell/palette.tsx")).toContain("max-sm:hidden");
    expect(code("shell/notification-bell.tsx")).toContain("max-sm:hidden");
    // The search field is a LINK to the search page, 44px tall, phone only,
    // and it takes the row's slack.
    const link = /<AppLink\s+href=\{SEARCH_PATH\}\s+aria-label="Search"\s+className="([^"]*)"/.exec(bar)?.[1] ?? "";
    expect(link).toContain("min-h-[44px]");
    expect(link).toContain("flex-1");
    expect(link).toContain("sm:hidden");
    expect(link).toMatch(/text-\[16px\]/);
    // The mark goes home at a 44px target; the word is not in the row.
    expect(bar).toMatch(/aria-label="openproduct — home"[\s\S]*?max-sm:min-h-\[44px\][^"]*max-sm:min-w-\[44px\]/);
    // The profile control is 44px in both of its branches.
    const chip = code("shell/account-chip.tsx");
    expect((chip.match(/max-sm:h-\[44px\] max-sm:w-\[44px\]/g) ?? []).length).toBe(2);
  });

  it("keeps every destination reachable on a phone", () => {
    // Activity has no bell in a phone's top bar, so it is a tab; `Open a
    // build` left the bar for the footer, which every page carries.
    expect(PHONE_TABS.some((t) => t.href === "/activity")).toBe(true);
    expect(FOOTER_LINKS.some((l) => l.href === "/submit")).toBe(true);
  });
});

describe("the bar reserves its own height", () => {
  it("pushes the page above it rather than sitting on top of the last row", () => {
    // `section-bar.tsx` is `fixed`, so it takes no space in the document and
    // would otherwise cover the last product on a list and the comment box
    // on a listing. The reserve is on `body`, so the site footer clears it
    // too.
    const css = readFileSync(resolve(APP, "../styles/globals.css"), "utf-8");
    expect(css).toMatch(/@media \(max-width: 639\.98px\) \{\s*body \{\s*padding-bottom: var\(--tabbar-reserve\);/);
  });

  it("reserves at least what the bar covers, and writes the arithmetic once", () => {
    // `--tabbar-reserve`'s own note: two files spelling the same expression is
    // how they drift apart.
    const css = readFileSync(resolve(APP, "../styles/globals.css"), "utf-8");
    const reserve = /--tabbar-reserve: calc\(env\(safe-area-inset-bottom\) \+ (\d+)px\);/.exec(css);
    expect(reserve).not.toBeNull();
    expect(css.match(/--tabbar-reserve:/g)?.length).toBe(1);
    // What the bar covers: its offset from the bottom, its padding top and
    // bottom, and a tab — read from the bar's own classes.
    const bar = code("shell/section-bar.tsx");
    const offset = Number(/bottom-\[calc\((\d+)px\+env\(safe-area-inset-bottom\)\)\]/.exec(bar)?.[1]);
    const pad = Number(/\bpy-\[(\d+)px\]/.exec(bar)?.[1]);
    const tabHeight = Number(/min-h-\[(\d+)px\]/.exec(bar)?.[1]);
    expect(offset + 2 * pad + tabHeight).toBe(76);
    expect(Number(reserve![1])).toBeGreaterThanOrEqual(offset + 2 * pad + tabHeight);
  });
});

describe("the bar is chrome, and chrome spends no accent of its own (XP-1)", () => {
  it("reaches for the endorsement colour nowhere but the shared unread dot", () => {
    // One accent, one meaning. The lit tab is ink at weight 600, not a
    // coloured cell; the only amber the bar can show is the unread dot, which
    // is the bell's own component rather than a second drawing of it.
    expect(code("shell/section-bar.tsx")).not.toMatch(/-endorse\b|--endorse|-amber\b/);
    expect(code("shell/section-bar.tsx")).toMatch(/import \{[^}]*UnreadDot[^}]*\} from "\.\/notification-bell"/);
  });

  it("resolves no actor (I6)", () => {
    expect(code("shell/section-bar.tsx")).not.toMatch(/cookies\(|headers\(|session|subject|fetch\(/i);
  });

  it("marks unread activity only once the overlay has answered", () => {
    const bar = code("shell/section-bar.tsx");
    expect(bar).toContain('const marked = tab.id === "activity" && unread > 0');
    expect(code("shell/notification-bell.tsx")).toContain("unreadCount(useOverlay(");
  });
});

describe("which ramp, chosen by the reader (FR1, completing FR0)", () => {
  // FR0 shipped the ramp and both selectors and deliberately shipped no
  // control, because a control needs a home in the chrome and this is the
  // milestone that rebuilds the chrome.

  it("offers a way back to the operating system's answer", () => {
    // A two-way toggle is a trap: somebody who taps `dark` on a phone that
    // switches at sunset has silently opted out of that forever, and nothing
    // on the page says so. Light is the default; `system` is a real choice.
    expect([...THEME_CHOICES]).toEqual(["system", "light", "dark"]);
  });

  it("hands the default back by REMOVING the attribute, and stamps the other two", () => {
    // Light is the default, so it is the absence of the attribute; `system`
    // is stamped like `dark`, because the media query in globals.css answers
    // only `[data-theme="system"]` — the device's preference is followed
    // only when the reader asked for it.
    const calls: string[] = [];
    const root = {
      setAttribute: (n: string, v: string) => calls.push(`set ${n}=${v}`),
      removeAttribute: (n: string) => calls.push(`remove ${n}`),
    };
    applyTheme("system", root);
    applyTheme("dark", root);
    applyTheme("light", root);
    expect(calls).toEqual(["set data-theme=system", "set data-theme=dark", "remove data-theme"]);
  });

  it("remembers in localStorage, never in a cookie and never in the account", () => {
    // A cookie would vary the request and cost the edge cache the whole
    // estate is built on; the account would make a public page depend on who
    // is asking (WC-4, I6).
    expect(THEME_STORAGE_KEY).toBe("op_theme");
    const toggle = code("ui/theme-toggle.tsx");
    expect(toggle).toContain("localStorage");
    expect(toggle).not.toMatch(/document\.cookie|fetch\(|\/me\//);
  });

  it("applies before the first paint, not in an effect", () => {
    // A React effect runs after paint, so a reader who chose dark on a light
    // device would watch every page flash white before it settled. The same
    // shape `SESSION_BOOT` has held since XP0.
    const layout = code("layout.tsx");
    expect(layout).toContain("THEME_BOOT");
    expect(layout).toMatch(/THEME_BOOT = `try\{var t=localStorage\.getItem/);
    // And it validates rather than trusts: `localStorage` is writable by
    // anything on this origin, and stamping an arbitrary string into an
    // attribute the stylesheet keys on leaves the page correct but silently
    // un-themed.
    expect(layout).toMatch(/t==="dark"\|\|t==="light"\|\|t==="system"/);
  });

  it("adds no new target under 44px at mobile widths", () => {
    // FR2 is the milestone that takes every target to 44px, and a control
    // introduced by FR1 has no business adding three more to its list.
    expect(code("ui/theme-toggle.tsx")).toContain("max-sm:min-h-[44px]");
  });

  it("is reachable from every page: the site footer is on all of them, and no page draws a footer of its own", () => {
    // A preference reachable on most pages is a preference a reader hunts
    // for. `site-footer.tsx` used to step aside on a product page and a
    // person page, which each carried a footer — and the control — of their
    // own. Since OPR1 the one footer is on every page, unconditionally.
    const footer = code("shell/site-footer.tsx");
    expect(footer).toContain("<ThemeToggle />");
    expect(footer).not.toMatch(/usePathname|hasOwnFooter|return null/);
    expect(read("shell/site-footer.tsx")).not.toContain('"use client"');
    expect(code("layout.tsx")).toContain("<SiteFooter />");
    expect(code("shell/section-for.ts")).not.toContain("hasOwnFooter");
    for (const file of ["[slug]/page.tsx", "people/[handle]/page.tsx"]) {
      expect([file, /<footer\b/.test(code(file))]).toEqual([file, false]);
      expect([file, code(file).includes("<ThemeToggle")]).toEqual([file, false]);
    }
  });
});
