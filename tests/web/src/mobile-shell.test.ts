// The 375px shell (openproduct-worldclass FR1).
//
// The audit's P0·05, reproduced here before anything moved: at 375×812 the
// `header` measured **147px** — eighteen percent of the viewport — across
// three wrapped rows, and the section nav inside it scrolled, `scrollWidth
// 426` against `clientWidth 347`, with **People off the right edge and no
// affordance saying so**.
//
// THE ROW WAS NOT TOO FULL; IT WAS ALLOWED TO GROW. `flex-wrap` with a
// `min-height` means a bar that gets taller every time something inside it
// does, and at 375px everything inside it did. The fix is that the bar may no
// longer wrap at any width, which forces the question the wrapping was
// avoiding: what leaves the row. The five sections leave it, for the bottom of
// the screen; the wordmark leaves it; and the width they give back goes to the
// search field, which had collapsed to a 38px glyph.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SECTIONS } from "@openproduct-web/app/shell/shell";
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
  // within an epic. Both navs read `SECTIONS`, and both light the cell
  // `sectionFor` names.
  it.each(["shell/top-panel.tsx", "shell/section-bar.tsx"])("%s reads the shared list", (file) => {
    expect(code(file)).toMatch(/import \{[^}]*SECTIONS[^}]*\} from "\.\/shell"/);
    expect(code(file)).toContain('from "./section-for"');
  });

  it.each(["shell/top-panel.tsx", "shell/section-bar.tsx"])(
    "%s defines no sections of its own",
    (file) => {
      for (const label of SECTIONS.map((s) => s.label)) {
        expect(code(file)).not.toContain(`"${label}"`);
      }
    },
  );

  it("renders every section in the bar, including the ones that are not live yet", () => {
    // XP0's convention, and XP4's rule that no section may be dropped on a
    // phone. The bar maps the list rather than filtering it.
    expect(code("shell/section-bar.tsx")).toContain("SECTIONS.map");
    expect(code("shell/section-bar.tsx")).not.toContain("liveSections");
  });

  it("shows exactly one of the two at any width", () => {
    // The header's pills are `max-sm:hidden`; the bar is `sm:hidden`. Both
    // carry `aria-label="Sections"`, which is correct precisely because only
    // one is ever displayed — `display: none` keeps the other out of the
    // accessibility tree, so there is one Sections landmark, not two.
    expect(read("shell/top-panel.tsx")).toMatch(/aria-label="Sections"[\s\S]{0,900}?max-sm:hidden/);
    expect(read("shell/section-bar.tsx")).toMatch(/aria-label="Sections"[\s\S]{0,900}?sm:hidden/);
  });
});

describe("sectionFor — which cell is lit", () => {
  // Testable for the first time: it lived inside `top-panel.tsx`, and the web
  // test lane is module-level with no JSX, so a rule inside a `.tsx` is a rule
  // no test in this repository can hold. FR1 needed it in two components
  // anyway.
  it("lights Launches for the root and for every view of a launch", () => {
    expect(sectionFor("/")).toBe("launches");
    expect(sectionFor("/launches/2026-09-07")).toBe("launches");
    // A product's own page is a view of the launches, which is where the
    // reader came from and where the back link goes.
    expect(sectionFor("/my-product")).toBe("launches");
  });

  it("lights People for a person, at the address a reader actually sees", () => {
    // `/@ada` is rewritten to `/people/ada` at the router; the bar reads the
    // address bar, so the sigil is what it has to match.
    expect(sectionFor("/@ada")).toBe("people");
    expect(sectionFor("/people")).toBe("people");
  });

  it("lights the section that owns the path", () => {
    expect(sectionFor("/topics")).toBe("topics");
    expect(sectionFor("/topics/devtools")).toBe("topics");
  });

  it("lights nothing on the routes that left the bar, and never mistakes them for a product", () => {
    // OB1 — collections and the leaderboard are routes, not sections. Without
    // the reserved heads they would fall through to "a product's page" and
    // light Builds.
    expect(sectionFor("/collections/picks")).toBe("");
    expect(sectionFor("/leaderboard/month")).toBe("");
  });

  it("lights nothing on a path no section owns", () => {
    for (const path of ["/me", "/studio", "/digest", "/docs", "/submit", "/search"]) {
      expect(sectionFor(path)).toBe("");
    }
  });

  it("lights nothing on the sign-in door or a share route (openproduct-calm-pages CP1)", () => {
    // `/signin` fell through to "a product's page" and lit Builds.
    for (const path of ["/signin", "/badge/ackstack", "/og/site", "/comment"]) {
      expect([path, sectionFor(path)]).toEqual([path, ""]);
    }
  });

  it("ignores a query string, because a filter does not change the section", () => {
    expect(sectionFor("/topics?sort=new")).toBe("topics");
  });
});

describe("the header may not grow", () => {
  /** The bar's own row — the element whose height the audit measured. */
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
    // SCOPED TO THE ROW, not to the file. `max-sm:min-h-[44px]` appears
    // several times in this component and is the opposite kind of rule —
    // OL9's 44px tap targets, which this milestone wants more of. What must
    // not come back is a MIN height on the row itself.
    expect(row()).toContain("flex-nowrap");
    expect(row()).not.toMatch(/flex-wrap|min-h-/);
  });

  it("is 56px on a phone, hairline included", () => {
    // ON THE HEADER, NOT THE ROW, and `box-border` with it. The bar carries a
    // 1px bottom border; a 56px row inside it measures 57 from the outside,
    // and 57 is not "≤56px at 375px". The height goes on the element the
    // measurement is taken from.
    const header = /<header className="([^"]*)"/.exec(read("shell/top-panel.tsx"))?.[1] ?? "";
    expect(header).toContain("max-sm:h-[56px]");
    expect(header).toContain("max-sm:box-border");
    // 80px above `sm` since CL1 (60px from OL1 to CL1).
    expect(row()).toContain("h-[80px]");
    expect(row()).toContain("max-sm:h-full");
  });

  it("gives the reclaimed width to the search field", () => {
    // The field collapsed to a 38px glyph below `lg` because the pills were
    // competing for the row. On a phone the pills have gone; a search field a
    // person can read their query in beats a button they have to guess at,
    // and search is the dimension the audit scored 1/10.
    const palette = code("shell/palette.tsx");
    expect(palette).toContain("max-sm:flex");
    expect(palette).toContain("max-sm:hidden");
    expect(palette).toContain("max-sm:flex-1");
  });

  it("keeps every destination reachable, including the CTA", () => {
    // `Open a build` (OB1) becomes a plus at 375px rather than leaving the
    // shell. `aria-label` carries the whole act, so the destination is named
    // for anyone reading it another way.
    const bar = read("shell/top-panel.tsx");
    expect(bar).toContain('aria-label="Open a build"');
    expect(bar).toContain('href="/submit"');
  });
});

describe("the bar reserves its own height", () => {
  it("pushes the page above it rather than sitting on top of the last row", () => {
    // `section-bar.tsx` is `fixed`, so it takes no space in the document and
    // would otherwise cover the last product on the launches page and the
    // comment box on a listing. The reserve is on `body`, so the site footer
    // clears it too — a footer under an opaque fixed bar just looks shorter
    // than it is, which is the half of this that is easy to miss.
    const css = readFileSync(resolve(APP, "../styles/globals.css"), "utf-8");
    expect(css).toMatch(/@media \(max-width: 639\.98px\) \{\s*body \{\s*padding-bottom: var\(--tabbar-reserve\);/);
  });

  it("reads the token rather than restating its arithmetic", () => {
    // `--tabbar-reserve`'s own note: two files spelling the same expression is
    // how they drift apart.
    const css = readFileSync(resolve(APP, "../styles/globals.css"), "utf-8");
    expect(css.match(/safe-area-inset-bottom\) \+ 4\.5rem/g)?.length).toBe(1);
  });
});

describe("the bar is chrome, and chrome spends no accent (XP-1)", () => {
  it("reaches for the endorsement colour nowhere", () => {
    // One accent, one meaning: the gold is an endorsement and the shell never
    // borrows it. The lit cell is `--secondary` under `--foreground`, which is
    // the same pill the header uses at wider widths — one language, two
    // positions.
    expect(code("shell/section-bar.tsx")).not.toMatch(/-endorse\b|--endorse/);
    expect(code("shell/section-bar.tsx")).toContain("bg-secondary");
  });

  it("resolves no actor (I6)", () => {
    expect(code("shell/section-bar.tsx")).not.toMatch(/cookies\(|headers\(|session|subject|fetch\(/i);
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

  it("is reachable from every page, including the two that carry their own footer", () => {
    // A preference reachable on most pages is a preference a reader hunts
    // for. `site-footer.tsx` steps aside on a product page and a person page,
    // so both of those carry the control themselves.
    for (const file of ["shell/site-footer.tsx", "[slug]/page.tsx", "people/[handle]/page.tsx"]) {
      expect(code(file)).toContain("<ThemeToggle");
    }
  });
});
