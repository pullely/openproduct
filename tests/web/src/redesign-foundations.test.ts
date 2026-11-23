// The site's foundations: openproduct-redesign OPR1 set them, and
// openproduct-left-rail LR1 (design §1 to §3) replaced the palette, the
// faces, the card's skin, the page's ground and the logo. The type ladder
// and the pill controls are still OPR1's.
//
// OPR1 changed what every page INHERITS — the palette, the three faces, the
// type ladder, the card's skin, the logo, the page's ground — before any page
// was rebuilt against its board. Those are the values a later milestone can
// move by accident without a single page-level guard noticing: a hex nudged in
// the stylesheet, a sixth font file, a shadow back on a card. So they are
// pinned here, once, as the design writes them.
//
// SOURCE PINS, like the rest of this suite. The contrast of each pair is
// measured in `dark-ramp.test.ts`; this file holds that the VALUES are the
// design's and that the names components reach for resolve.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { oklchToHex } from "@openproduct-web/app/ui/og";
import * as design from "@openproduct-web/app/ui/design";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(__dirname, "../../../web");
const PERF = resolve(__dirname, "../../web-perf/src");
const read = (file: string) => readFileSync(resolve(WEB, file), "utf-8");
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CSS = read("src/styles/globals.css");
const TAILWIND = read("tailwind.config.mjs");
const LAYOUT = read("src/app/layout.tsx");

/** The first `:root { … }` block: where both ramps' values live. */
const ROOT = (() => {
  const open = CSS.indexOf("{", CSS.indexOf(":root {"));
  let depth = 0;
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === "{") depth += 1;
    else if (CSS[i] === "}" && (depth -= 1) === 0) return CSS.slice(open + 1, i);
  }
  throw new Error(":root is not closed");
})();

/** A token's light value, as the `#RRGGBB` a browser paints. */
function hex(token: string): string {
  const m = new RegExp(`\\n\\s*--${token}:\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+);`).exec(ROOT);
  if (!m) throw new Error(`--${token} is not in :root`);
  return oklchToHex(Number(m[1]), Number(m[2]), Number(m[3])).toUpperCase();
}

// openproduct-left-rail LR1 (design §1) replaced the boards' warm palette with
// graphite: neutral greys, no accent hue, and a card told by its border.
describe("the palette is graphite", () => {
  // design §1 rules 2 and 6, token by token. The stylesheet stores OKLCH
  // triples; what is pinned is the hex each one paints, because the hex is
  // what the design names.
  it.each([
    ["background", "#FFFFFF"], // page
    ["card", "#FFFFFF"], // the same colour as the page: the border is its edge
    ["popover", "#FFFFFF"],
    ["foreground", "#1F2328"], // text
    ["copy", "#1F2328"],
    ["muted-foreground", "#59636E"], // muted
    ["faint", "#59636E"], // one muted
    ["primary", "#1F2328"], // the primary button is text-coloured
    ["primary-foreground", "#FFFFFF"],
    ["secondary", "#EAEEF2"], // the stronger fill: the selected state
    ["muted", "#F6F8FA"], // the subtle fill
    ["accent", "#F6F8FA"], // row and nav hover
    ["sunken", "#F6F8FA"],
    ["well", "#F6F8FA"],
    ["border", "#D1D9E0"],
    ["line-soft", "#D1D9E0"],
    ["link", "#1F2328"], // a link is text-coloured and underlined, not a hue
    ["endorse", "#1F2328"], // the accent is retired: the mark is text-coloured
    ["endorse-ink", "#1F2328"],
    ["endorse-soft", "#EAEEF2"],
    ["amber-soft", "#EAEEF2"],
    ["success", "#2F7A4E"], // green stays, for success only
    ["destructive", "#8E3B27"], // red stays, for danger only
    ["run-failed", "#B4533C"],
  ])("--%s paints %s", (token, expected) => {
    expect(hex(token)).toBe(expected);
  });

  it("paints no kind colour, in either ramp (design §1 rule 5)", () => {
    // Amber, lavender, slate and teal are retired. Their tokens keep their
    // names, because call sites read them, and carry no chroma to speak of.
    const hued = Array.from(
      ROOT.matchAll(/\n\s*(--(?:dk-)?(?:amber|brand-amber|idea|version|seat|warning|info|agent|endorse|link)[\w-]*):\s*[\d.]+\s+([\d.]+)\s+[\d.]+;/g),
      (m) => [m[1]!, Number(m[2])] as const,
    ).filter(([, chroma]) => chroma > 0.03);
    expect(hued).toEqual([]);
  });

  it("makes the header's panel white under the text colour", () => {
    expect(hex("panel")).toBe("#FFFFFF");
    expect(hex("panel-foreground")).toBe("#1F2328");
    expect(hex("panel-muted")).toBe("#59636E");
  });

  it("gives every new kind a Tailwind name that takes an opacity", () => {
    // Without `<alpha-value>` a utility with an opacity modifier is not
    // emitted at all — the failure is silent (see the config's own note).
    const entries: Array<[string, string]> = [
      ["amber", "DEFAULT"], ["amber", "ink"], ["amber", "soft"],
      ["idea", "DEFAULT"], ["idea", "deep"], ["idea", "soft"], ["idea", "wash"],
      ["version", "DEFAULT"], ["version", "soft"],
      ["seat", "DEFAULT"], ["seat", "ink"], ["seat", "soft"], ["seat", "wash"],
    ];
    for (const [family, member] of entries) {
      const token = member === "DEFAULT" ? family : `${family}-${member}`;
      const block = new RegExp(`\\n\\s*${family}: \\{([^}]*)\\}`).exec(TAILWIND)?.[1] ?? "";
      expect(block).toContain(`${member}: "oklch(var(--${token}) / <alpha-value>)"`);
    }
    expect(TAILWIND).toContain('sunken: "oklch(var(--sunken) / <alpha-value>)"');
    expect(TAILWIND).toContain('well: "oklch(var(--well) / <alpha-value>)"');
    // And no colour in the config is without it.
    const colours = TAILWIND.slice(TAILWIND.indexOf("colors: {"), TAILWIND.indexOf("borderRadius: {"));
    const bare = Array.from(code(colours).matchAll(/"oklch\(var\(--[\w-]+\)[^"]*"/g), (m) => m[0]).filter(
      (value) => !value.includes("/ <alpha-value>)"),
    );
    expect(bare).toEqual([]);
  });
});

// openproduct-left-rail LR1 (design §2): the system typeface. The four faces
// and six files OPR1 and UF2 shipped are gone, and no page fetches a font.
describe("the system typeface, no webfont", () => {
  it("ships no font file and declares none", () => {
    const fonts = resolve(WEB, "src/fonts");
    expect(existsSync(fonts) ? readdirSync(fonts) : []).toEqual([]);
    const layout = code(LAYOUT);
    expect(layout).not.toMatch(/next\/font/);
    expect(layout).not.toMatch(/\.woff2?/);
    expect(code(CSS)).not.toMatch(/@font-face|\.woff2?/);
  });

  it("holds the font budget at nothing", () => {
    const lane = readFileSync(resolve(PERF, "budgets.mjs"), "utf-8");
    expect(lane).toContain("const FONTS = { bytes: 0, files: 0 };");
    expect(lane).toContain("const FONTS_WITH_ITALIC = { bytes: 0, files: 0 };");
  });

  it("what every page's bundle draws with is six class strings, in a file of their own (OPR-3)", () => {
    // `design.ts` holds every shared class string, and a bundler keeps a
    // module whole: a client component that imports one of them carries all
    // the ones any client component anywhere uses. The files below are in
    // EVERY page's bundle (the root layout's client piece, the error
    // boundary's panel, the feed's list and the reaction control every page
    // prefetches for the header's "Feed" link), so they import the small
    // file — measured by the wire lane at about a kilobyte per copy.
    const core = read("src/app/ui/design-core.ts");
    expect([...core.matchAll(/^export const (\w+) =/gm)].map((m) => m[1]).sort()).toEqual([
      "BTN_OUTLINE",
      "BTN_PRIMARY",
      "BTN_SOFT",
      "FOCUS",
      "PAGE_NARROW",
      "PAGE_TITLE",
    ]);
    expect(code(core)).not.toMatch(/^import /m);
    for (const file of ["src/app/auth-notice.tsx", "src/app/ui/failure.tsx", "src/app/feed/feed-posts.tsx", "src/app/posts/reaction-control.tsx"]) {
      const source = code(read(file));
      expect([file, /from "[./a-z]*\/design-core"/.test(source)]).toEqual([file, true]);
      expect([file, /from "[./a-z]*\/design"/.test(source)]).toEqual([file, false]);
    }
    // There is still one place to import a class string from.
    expect(code(read("src/app/ui/design.ts"))).toContain(
      'export { BTN_OUTLINE, BTN_PRIMARY, BTN_SOFT, FOCUS, PAGE_NARROW, PAGE_TITLE } from "./design-core";',
    );
    for (const name of ["BTN_OUTLINE", "BTN_PRIMARY", "BTN_SOFT", "FOCUS", "PAGE_NARROW", "PAGE_TITLE"]) {
      expect([name, (design as Record<string, unknown>)[name]]).toEqual([name, (core.match(new RegExp(`export const ${name} =\\s*"([^"]*)"`)) ?? [])[1]]);
    }
  });

  it("lands every face on the system stacks", () => {
    expect(CSS).toContain('--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans",');
    expect(CSS).toContain("--font-mono: ui-monospace, SFMono-Regular,");
    // The serif and the bar's face are retired: their names resolve to the
    // UI face, so a call site that still says `font-serif` draws in it.
    expect(CSS).toContain("--font-serif: var(--font-sans);");
    expect(CSS).toContain("--font-serif-italic: var(--font-sans);");
    expect(CSS).toContain("--font-bar: var(--font-sans);");
    expect(TAILWIND).toContain('sans: ["var(--font-sans)", "system-ui", "sans-serif"]');
    expect(TAILWIND).toContain('mono: ["var(--font-mono)", "ui-monospace", "monospace"]');
    expect(code(CSS)).not.toMatch(/hanken|lora|plex|geist|newsreader/i);
  });

  it("reaches no third-party host for a font", () => {
    expect(code(LAYOUT)).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(code(CSS)).not.toMatch(/@import|fonts\.(googleapis|gstatic)\.com/);
  });
});

describe("the type ladder is the redesign's", () => {
  const ladder = TAILWIND.slice(TAILWIND.indexOf("fontSize: {"), TAILWIND.indexOf("fontWeight: {"));
  const size = (name: string) => new RegExp(`\\n\\s*"?${name}"?: \\["([\\d.]+)px"`).exec(ladder)?.[1];

  it("has the design's sizes under their own names", () => {
    expect(size("mono-label")).toBe("10.5");
    expect(size("label")).toBe("11");
    expect(size("card-title")).toBe("18");
    expect(size("display")).toBe("40");
    expect(size("nozoom")).toBe("16"); // inputs, and the no-zoom floor
    expect(ladder).toContain('"mono-label": ["10.5px", { lineHeight: "1.3", letterSpacing: "0.12em" }]');
  });

  it("still resolves every name a component uses, each to the nearest design size", () => {
    expect(
      Object.fromEntries(
        ["xs", "dense", "sm", "mid", "base", "lg", "xl", "nozoom", "title", "2xl", "numeral"].map((n) => [n, size(n)]),
      ),
    ).toEqual({
      xs: "11",
      dense: "13",
      sm: "13",
      mid: "13",
      base: "15",
      lg: "15",
      xl: "16",
      nozoom: "16",
      title: "28",
      "2xl": "28",
      numeral: "28",
    });
  });

  it("holds no size the design does not have", () => {
    const sizes = Array.from(ladder.matchAll(/\["([\d.]+)px"/g), (m) => Number(m[1]));
    expect([...new Set(sizes)].sort((a, b) => a - b)).toEqual([10.5, 11, 13, 15, 16, 18, 28, 40]);
  });

  it("stops at 600", () => {
    const weights = TAILWIND.slice(TAILWIND.indexOf("fontWeight: {"), TAILWIND.indexOf("extend: {"));
    expect(Array.from(code(weights).matchAll(/"(\d{3})"/g), (m) => Number(m[1])).every((w) => w <= 600)).toBe(true);
    expect(code(CSS)).not.toMatch(/font-weight:\s*(?:[7-9]00|bold)/);
  });

  it("sets the body at 15px and leaves the root where the rem reservations need it", () => {
    expect(CSS).toMatch(/\n {2}body \{\n {4}font-size: 15px;\n {2}\}/);
    expect(CSS).toMatch(/html,\n {2}body \{[^}]*font-size: 14px;/);
  });

  it("draws the page title in the UI face at 26px/600, 22 on a phone (LR1)", () => {
    expect(design.PAGE_TITLE).toBe("m-0 text-[26px] font-semibold leading-[1.25] text-foreground max-sm:text-[22px]");
    expect(design.PAGE_TITLE).not.toContain("font-serif");
    // The small label: 12px/600, not monospace, not uppercase, not tracked.
    expect(design.EYEBROW).toBe("text-[12px] font-semibold text-muted-foreground");
  });
});

describe("bordered cards, pill controls", () => {
  it("draws a card at a 16px radius with a 1px border and no shadow (LR1)", () => {
    // The page and the card are the same colour, so the border is the edge.
    expect(design.CARD).toBe("overflow-hidden rounded-[16px] border border-border bg-card");
    expect(design.PANEL).toBe("rounded-[16px] border border-border bg-card p-6");
    for (const name of ["TILE", "TILE_LINK", "EMPTY_NOTE", "BOARD_CARD", "SIDE_CARD", "SEGMENTS"] as const) {
      expect([name, design[name].includes("border border-border")]).toEqual([name, true]);
    }
    expect(CSS).toMatch(/--radius: 16px;/);
  });

  it("casts no drop shadow from any shared class", () => {
    const shared = Object.entries(design).filter(([, value]) => typeof value === "string") as Array<[string, string]>;
    // A `shadow` utility, with or without a variant — not `transition-shadow`,
    // which animates the focus ring.
    const casts = /(?:^|\s)(?:[\w-]+:)*shadow(?:-[\w[\]-]+)?(?=\s|$)/;
    expect(shared.filter(([, value]) => casts.test(value)).map(([name]) => name)).toEqual([]);
    // The two named shadows are hairline rings now: no offset, no blur.
    const shadows = TAILWIND.slice(TAILWIND.indexOf("boxShadow: {"), TAILWIND.indexOf("fontFamily: {"));
    const values = Array.from(code(shadows).matchAll(/(\w+): "([^"]+)"/g), (m) => [m[1]!, m[2]!]);
    expect(values.map(([name]) => name)).toEqual(["panel", "menu"]);
    for (const [, value] of values) expect(value).toMatch(/^0 0 0 1px /);
    // And the stylesheet's card recipes carry none.
    for (const selector of ["[data-card]", "[data-card]:hover", "[data-tile]", "[data-tile]:hover", ".cat-tile", ".cat-tile:hover", ".cat-card", ".cat-card:hover"]) {
      const at = CSS.indexOf(`\n  ${selector} {`);
      expect(at).toBeGreaterThan(-1);
      expect(CSS.slice(at, CSS.indexOf("}", at))).not.toContain("box-shadow");
    }
  });

  it("makes every button and chip a pill, and the primary one ink", () => {
    for (const name of ["BTN_PRIMARY", "BTN_OUTLINE", "BTN_QUIET", "BTN_SMALL", "BTN_SOFT", "BTN_INK", "BTN_SEAT", "CHIP_BTN", "BADGE_SEAT"] as const) {
      expect(design[name]).toContain("rounded-full");
    }
    expect(design.BTN_PRIMARY).toContain("bg-primary");
    expect(design.BTN_PRIMARY).toContain("text-primary-foreground");
    // 40px buttons, 44px fields at the input size.
    for (const name of ["BTN_PRIMARY", "BTN_OUTLINE", "BTN_QUIET"] as const) expect(design[name]).toContain("h-[40px]");
    expect(design.FIELD).toContain("h-[44px]");
    expect(design.FIELD).toContain("text-nozoom");
    expect(design.TEXTAREA).toContain("text-nozoom");
  });
});

describe("the page's ground", () => {
  // openproduct-left-rail LR1 (design §1 rule 8): flat. No glow, no dot grid.
  it("is the page colour and nothing painted over it", () => {
    expect(code(CSS)).not.toMatch(/\n {2}body \{[^}]*background-image/);
    expect(code(CSS)).not.toMatch(/radial-gradient\(1100px/);
    expect(code(CSS)).not.toMatch(/oklch\(var\(--page-(?:glow|dot)\)/);
  });

  it("tells the browser's chrome the page colour", () => {
    expect(code(LAYOUT)).toContain('themeColor: "#ffffff"');
  });
});

describe("the logo is the ring tile", () => {
  // openproduct-left-rail LR1 (design §3): a near-black rounded tile, a white
  // ring, and an amber dot at the ring's top right.
  it("draws the tile, the ring and the dot inline", () => {
    const mark = code(read("src/app/shell/logomark.tsx"));
    expect(mark).toContain('viewBox="0 0 24 24"');
    expect(mark).toContain('<rect x="0.5" y="0.5" width="23" height="23" rx="6" fill="#17150F" className="stroke-border" strokeWidth="1" />');
    expect(mark).toContain('<circle cx="11.5" cy="12.5" r="4.6" stroke="#FFFFFF" strokeWidth={stroke} />');
    expect(mark).toContain('<circle cx="16.8" cy="7.2" r="2.3" fill="#C9952F" />');
    expect(mark).toContain("stroke = 2.4");
    // Nothing re-weights it at a call site.
    for (const file of ["src/app/shell/top-panel.tsx", "src/app/shell/auth-modal.tsx"]) {
      expect(code(read(file))).not.toMatch(/<Logomark[^>]*stroke=/);
    }
  });

  it("wears the same mark in the browser tab", () => {
    const icon = code(read("src/app/icon.svg/route.ts"));
    expect(icon).toContain('viewBox="0 0 24 24"');
    expect(icon).toContain('<rect width="24" height="24" rx="6" fill="#17150F"/>');
    expect(icon).toContain('<circle cx="11.5" cy="12.5" r="4.6" stroke="#FFFFFF" stroke-width="2.4"/>');
    expect(icon).toContain('<circle cx="16.8" cy="7.2" r="2.3" fill="#C9952F"/>');
    expect(code(LAYOUT)).toContain('{ url: "/icon.svg", type: "image/svg+xml" },');
  });

  it("wears it at every address a browser or a phone asks for one (LR6)", () => {
    // A PNG of the same three shapes, in the same 24-unit box, for the
    // places that will not take an SVG.
    const png = code(read("src/app/shell/mark-image.tsx"));
    expect(png).toContain('background: "#17150F"');
    expect(png).toContain("border: `${2.4 * u}px solid #FFFFFF`");
    expect(png).toContain('background: "#C9952F"');
    expect(png).toContain("left: (11.5 - 5.8) * u,");
    expect(png).toContain("left: (16.8 - 2.3) * u,");
    const routes: Array<[string, string]> = [
      ["favicon.ico", "markImage(48)"],
      ["apple-icon.png", "markImage(180, false)"],
      ["icon-192.png", "markImage(192)"],
      ["icon-512.png", "markImage(512)"],
    ];
    for (const [route, call] of routes) {
      const source = code(read(`src/app/${route}/route.tsx`));
      expect([route, source.includes(call)]).toEqual([route, true]);
      expect([route, source.includes('export const dynamic = "force-static";')]).toEqual([route, true]);
    }
    const layout = code(LAYOUT);
    expect(layout).toContain('{ url: "/favicon.ico", sizes: "48x48", type: "image/png" },');
    expect(layout).toContain('apple: "/apple-icon.png",');
    expect(layout).toContain('manifest: "/manifest.webmanifest",');
    const manifest = code(read("src/app/manifest.webmanifest/route.ts"));
    for (const src of ["/icon.svg", "/icon-192.png", "/icon-512.png"]) expect(manifest).toContain(`src: "${src}"`);
    expect(manifest).toContain('theme_color: "#ffffff"');
  });
});
