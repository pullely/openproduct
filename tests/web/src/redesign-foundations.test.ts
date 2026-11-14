// The redesign's foundations (openproduct-redesign OPR1, design.md §3).
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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

describe("the palette is the boards'", () => {
  // design.md §3's table, token by token. The stylesheet stores OKLCH triples;
  // what is pinned is the hex each one paints, because the hex is what the
  // design names.
  it.each([
    ["background", "#F6F4EE"], // page
    ["card", "#FFFFFF"],
    ["popover", "#FFFFFF"],
    ["foreground", "#141413"], // ink
    ["copy", "#2B2A27"], // text
    ["muted-foreground", "#6B6A66"], // muted
    ["faint", "#6B6A66"], // the redesign has one muted
    ["primary", "#141413"], // the primary button is ink on any page
    ["primary-foreground", "#FAF9F5"],
    ["secondary", "#F0EEE6"], // sunken
    ["muted", "#F7F5EF"], // the lighter well
    ["sunken", "#F0EEE6"],
    ["well", "#F7F5EF"],
    ["link", "#8A6420"], // a link is amber, at its text-safe value
    ["success", "#2F7A4E"],
    ["destructive", "#8E3B27"], // danger, as a word
    ["run-failed", "#B4533C"], // danger, as a mark
    ["brand-amber", "#B8862F"],
    ["endorse", "#B8862F"], // the accent is the amber
    ["endorse-soft", "#F3E7CC"],
    ["amber", "#B8862F"],
    ["amber-ink", "#8A6420"],
    ["amber-soft", "#F3E7CC"],
    ["idea", "#5B3F86"],
    ["idea-deep", "#2A1F3D"],
    ["idea-soft", "#ECE6F3"],
    ["idea-wash", "#F4F0F8"],
    ["version", "#3A4A75"],
    ["version-soft", "#E6E9F2"],
    ["seat", "#2F6F73"],
    ["seat-ink", "#1F5357"],
    ["seat-soft", "#DDEDEC"],
    ["seat-wash", "#F0F7F6"],
  ])("--%s paints %s", (token, expected) => {
    expect(hex(token)).toBe(expected);
  });

  it("writes the hairline as 6% of ink already laid on its surface", () => {
    // rgba(20,20,19,0.06) over the page and over a white card. A border token
    // is an opaque triple here, so the alpha is composited in the value.
    const over = (bg: [number, number, number]) =>
      "#" +
      [20, 20, 19]
        .map((ink, i) => Math.round(ink * 0.06 + bg[i]! * 0.94))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    expect(hex("border")).toBe(over([246, 244, 238]));
    expect(hex("line-soft")).toBe(over([246, 244, 238]));
    expect(hex("line")).toBe(over([255, 255, 255]));
  });

  it("makes the header's panel a light bar under ink, not a dark one", () => {
    // The redesign's header is rgba(255,255,255,0.62) with a blur. The token
    // is the white; the 0.62 belongs to the bar's own class.
    expect(hex("panel")).toBe("#FFFFFF");
    expect(hex("panel-foreground")).toBe("#141413");
    expect(hex("panel-muted")).toBe("#6B6A66");
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

describe("three faces, five files, self-hosted", () => {
  const FONTS_DIR = resolve(WEB, "src/fonts");
  const FILES = [
    "hanken-grotesk-latin-wght.woff2",
    "ibm-plex-mono-latin-400.woff2",
    "ibm-plex-mono-latin-500.woff2",
    "lora-latin-400-italic.woff2",
    "lora-latin-400.woff2",
  ];
  const woff2 = readdirSync(FONTS_DIR).filter((f) => f.endsWith(".woff2")).sort();
  const bytes = woff2.reduce((sum, f) => sum + statSync(resolve(FONTS_DIR, f)).size, 0);

  it("ships exactly the redesign's five files, and nothing left over from before", () => {
    expect(woff2).toEqual(FILES);
    expect(readdirSync(FONTS_DIR).filter((f) => /geist|newsreader/i.test(f))).toEqual([]);
  });

  it("carries each family's licence beside it", () => {
    for (const licence of ["hanken-grotesk.OFL.txt", "lora.OFL.txt", "ibm-plex-mono.OFL.txt"]) {
      expect(existsSync(resolve(FONTS_DIR, licence))).toBe(true);
    }
  });

  it("weighs 98,664 bytes, and the font budget is that plus thin headroom", () => {
    expect(bytes).toBe(98_664);
    const budget = /const FONTS = \{ bytes: ([\d_]+), files: (\d+) \};/.exec(
      readFileSync(resolve(PERF, "budgets.mjs"), "utf-8"),
    );
    expect(budget).not.toBeNull();
    const [limit, files] = [Number(budget![1]!.replace(/_/g, "")), Number(budget![2])];
    expect(files).toBe(FILES.length);
    // Deterministic bytes, so the headroom stays under a tenth: a loose budget
    // on a stable number is a budget that admits a face.
    expect(limit).toBeGreaterThanOrEqual(bytes);
    expect(limit - bytes).toBeLessThan(bytes * 0.1);
  });

  it("says the same in the fonts README", () => {
    const readme = read("src/fonts/README.md");
    for (const file of FILES) expect(readme).toContain(`\`${file}\``);
    expect(readme).toContain("98,664");
  });

  it("loads every one of them from the layout with next/font/local, and nothing else", () => {
    const layout = code(LAYOUT);
    expect(layout).toContain('import localFont from "next/font/local";');
    expect(layout).not.toMatch(/next\/font\/google/);
    const loaded = Array.from(layout.matchAll(/"\.\.\/fonts\/([\w.-]+\.woff2)"/g), (m) => m[1]!).sort();
    expect(loaded).toEqual(FILES);
    // `swap` on all three; weights stop at 600.
    expect(layout.match(/display: "swap"/g)?.length).toBe(3);
    expect(layout).toContain('weight: "400 600"');
    expect(layout).not.toMatch(/weight: "[^"]*[7-9]00/);
    expect(layout).toContain("className={`${hanken.variable} ${lora.variable} ${plexMono.variable}`}");
  });

  it("lands them on the three stacks the stylesheet and Tailwind read", () => {
    expect(CSS).toContain('--font-sans: var(--font-hanken, "Hanken Grotesk"),');
    expect(CSS).toContain('--font-serif: var(--font-lora, "Lora"),');
    expect(CSS).toContain('--font-mono: var(--font-plex-mono, "IBM Plex Mono"),');
    expect(TAILWIND).toContain('sans: ["var(--font-sans)", "system-ui", "sans-serif"]');
    expect(TAILWIND).toContain('serif: ["var(--font-serif)", "Georgia", "serif"]');
    expect(TAILWIND).toContain('mono: ["var(--font-mono)", "ui-monospace", "monospace"]');
    expect(code(CSS)).not.toMatch(/geist|newsreader/i);
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

  it("draws the page title in Lora 400 at 40px, 28 on a phone", () => {
    expect(design.PAGE_TITLE).toContain("font-serif");
    expect(design.PAGE_TITLE).toContain("font-normal");
    expect(design.PAGE_TITLE).toContain("text-display");
    expect(design.PAGE_TITLE).toContain("max-sm:text-title");
    expect(design.EYEBROW).toBe("font-mono text-mono-label uppercase text-muted-foreground");
  });
});

describe("flat cards, pill controls", () => {
  it("draws a card as white at a 16px radius with no border and no shadow", () => {
    expect(design.CARD).toBe("overflow-hidden rounded-[16px] bg-card");
    expect(design.PANEL).toBe("rounded-[16px] bg-card p-6");
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
    for (const name of ["BTN_PRIMARY", "BTN_OUTLINE", "BTN_QUIET", "BTN_SMALL", "BTN_COMPACT", "CHIP_BTN", "BADGE_ACCENT", "BADGE_WANTED"] as const) {
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
  it("is a soft amber glow at the top over a faint dot grid, from tokens", () => {
    const ground = /\n {2}body \{\n {4}background-image:([\s\S]*?)\n {2}\}/.exec(CSS)?.[1] ?? "";
    expect(ground).toContain("radial-gradient(1100px 460px at 50% -72px, oklch(var(--page-glow) / 0.18), transparent 62%)");
    expect(ground).toContain("radial-gradient(oklch(var(--page-dot) / 0.07) 1px, transparent 1.2px)");
    expect(ground).toMatch(/background-size:\s*auto,\s*22px 22px;/);
    expect(hex("page-glow")).toBe("#B8862F");
    expect(hex("page-dot")).toBe("#141413");
  });

  it("has a dark equivalent by value, not by a second rule", () => {
    // The dark scopes are aliases only (`dark-ramp.test.ts`), so the ground
    // follows the ramp: a dimmer glow, and dots lighter than the page.
    const dk = (token: string) =>
      new RegExp(`--dk-${token}:\\s*([\\d.]+)\\s+[\\d.]+\\s+[\\d.]+;`).exec(ROOT)?.[1];
    expect(Number(dk("page-glow"))).toBeLessThan(0.6539);
    expect(Number(dk("page-dot"))).toBeGreaterThan(Number(dk("background")));
    expect(CSS.match(/background-image:\s*radial-gradient\(1100px/g)?.length).toBe(1);
  });

  it("tells the browser's chrome the page colour", () => {
    expect(code(LAYOUT)).toContain('themeColor: "#f6f4ee"');
  });
});

describe("the logo is a P whose head is an o", () => {
  it("draws an ink stem and an amber ring inline, 2.6 wide with round caps", () => {
    const mark = code(read("src/app/shell/logomark.tsx"));
    expect(mark).toContain('viewBox="0 0 24 24"');
    expect(mark).toContain('fill="none"');
    expect(mark).toContain('strokeLinecap="round"');
    expect(mark).toContain("stroke = 2.6");
    // The stem follows the text colour, so it is ink on light and light on dark.
    expect(mark).toContain('<path d="M8 3.5V21" stroke="currentColor" />');
    // The ring is the accent, which is the amber.
    expect(mark).toContain('<circle cx="14" cy="9.5" r="6" className="stroke-endorse" />');
    expect(mark).not.toMatch(/\bfill-/);
    // Nothing re-weights it at a call site.
    for (const file of ["src/app/shell/top-panel.tsx", "src/app/shell/auth-modal.tsx"]) {
      expect(code(read(file))).not.toMatch(/<Logomark[^>]*stroke=/);
    }
  });

  it("wears the same mark in the browser tab", () => {
    const icon = code(read("src/app/icon.svg/route.ts"));
    expect(icon).toContain('viewBox="0 0 24 24"');
    expect(icon).toContain('stroke-width="2.6"');
    expect(icon).toContain('stroke-linecap="round"');
    expect(icon).toContain('d="M8 3.5V21"');
    expect(icon).toContain('<circle cx="14" cy="9.5" r="6" stroke="#B8862F"/>');
    expect(icon).toContain(".stem{stroke:#141413}");
    expect(icon).toContain("@media (prefers-color-scheme:dark)");
    expect(code(LAYOUT)).toContain('icons: { icon: "/icon.svg" }');
  });
});
