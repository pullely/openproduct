// The second ramp (openproduct-worldclass FR0).
//
// The audit's P1·09: *"Zero `prefers-color-scheme: dark` rules."* Confirmed,
// and cheap for the reason OL1 gave when it moved 164 values out of hex: in
// OKLCH, lightness is a coordinate. A dark theme is a second set of values on
// the same tokens (WC-8) rather than a second stylesheet.
//
// THE VALUES ARE THE REDESIGN'S NOW (openproduct-redesign OPR1). The light
// ramp is the boards' palette and the dark one is derived from it; what this
// suite holds is unchanged — every token in both ramps, every colour one sRGB
// can hold, every text pair measured — and it gained the four kind families
// (amber, idea, version, seat), whose inks are text and are measured as text.
//
// EVERYTHING BELOW IS ABOUT THE STYLESHEET AS DATA, because that is what it
// is: 103 tokens whose values decide every surface on the site, and whose
// mistakes are invisible until somebody with a dark laptop opens the page. A
// missing token does not throw; it renders one element in the other ramp's
// colour and looks like a design choice.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { oklchToHex, srgbHolds } from "@openproduct-web/app/ui/og";
import { tileColours } from "@openproduct-web/app/feed/tile";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(__dirname, "../../../web");
const CSS = readFileSync(resolve(WEB, "src/styles/globals.css"), "utf-8");

/** The text of a rule, by its selector. */
function block(selector: string): string {
  const at = CSS.indexOf(selector + " {");
  if (at === -1) throw new Error(`${selector} is not in globals.css`);
  const open = CSS.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === "{") depth += 1;
    else if (CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  throw new Error(`${selector} is not closed`);
}

/** `--x: <numbers>;` declarations, as a map. Two numbers or three: the tile's
 *  pair is a lightness and chroma whose hue comes from the slug. */
function numeric(source: string): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const m of source.matchAll(/(--[\w-]+):\s*([\d.]+(?:\s+[\d.]+){1,2});/g)) {
    out[m[1]!] = m[2]!.split(/\s+/).map(Number);
  }
  return out;
}

/** `--x: var(--dk-x);` aliases, as a map. */
function aliases(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/(--[\w-]+):\s*var\((--[\w-]+)\);/g)) out[m[1]!] = m[2]!;
  return out;
}

const ROOT = numeric(block(":root"));
const LIGHT = Object.fromEntries(Object.entries(ROOT).filter(([k]) => !k.startsWith("--dk-")));
const DARK = Object.fromEntries(
  Object.entries(ROOT)
    .filter(([k]) => k.startsWith("--dk-"))
    .map(([k, v]) => [`--${k.slice(5)}`, v]),
);
const EXPLICIT = block(':root[data-theme="dark"]');
const PREFERRED = block(':root[data-theme="system"]');

describe("every colour token is defined in both ramps", () => {
  // FR0's done-when, stated as the thing that actually goes wrong: one token
  // left behind renders one element in the light ramp's colour on a dark page,
  // and it looks deliberate.
  it("names the same tokens in the light values and the dark ones", () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it("has a real number of them, so an empty parse cannot pass", () => {
    expect(Object.keys(LIGHT).length).toBeGreaterThan(100);
  });

  it("switches every one of them in both dark scopes", () => {
    for (const scope of [EXPLICIT, PREFERRED]) {
      const map = aliases(scope);
      expect(Object.keys(map).sort()).toEqual(Object.keys(LIGHT).sort());
      // And each alias points at the dark value of the SAME token — a
      // transposition here would be a page where the border is the ink.
      expect(Object.entries(map).filter(([k, v]) => v !== `--dk${k.slice(1)}`)).toEqual([]);
    }
  });

  it("keeps the two dark scopes identical, because they are the same theme", () => {
    // Two scopes exist only because CSS gives no way to write one selector
    // that means "explicitly dark, or preferring dark and not explicitly
    // light". They must never say different things.
    const strip = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(strip(PREFERRED)).toBe(strip(EXPLICIT));
  });

  it("carries no value in either dark scope — only aliases", () => {
    // The hundred and three numbers live once, in `:root`. A literal here would be a
    // second copy free to drift from the first.
    for (const scope of [EXPLICIT, PREFERRED]) {
      expect(Object.keys(numeric(scope))).toEqual([]);
    }
  });

  it("tells the browser which ramp it is in, so the UA's own surfaces follow", () => {
    // A page whose tokens are dark and whose scrollbar is white is the detail
    // that makes a dark theme read as unfinished.
    expect(block(":root")).toMatch(/color-scheme:\s*light;/);
    for (const scope of [EXPLICIT, PREFERRED]) expect(scope).toMatch(/color-scheme:\s*dark;/);
  });

  it("follows a dark operating system only when the reader chose System", () => {
    // Light is the default: with nothing stored the page is light on every
    // device, and the media query answers only an explicit `system` choice.
    expect(CSS).toContain('@media (prefers-color-scheme: dark)');
    expect(CSS).toContain(':root[data-theme="system"]');
    expect(CSS).not.toContain(':root:not([data-theme="light"])');
  });
});

describe("the accent family still redefines nothing outside itself", () => {
  // OL9's claim about the design, and WC-8's condition on this milestone: four
  // accents × two ramps, and a block that had to restate a border or an ink
  // would be evidence the claim was false.
  it.each(["ember", "moss", "plum"])("%s touches the endorse family only", (accent) => {
    const declared = Object.keys(numeric(block(`:root[data-accent="${accent}"]`)));
    expect(declared.filter((t) => !/^--(dk-)?endorse(-|$)/.test(t))).toEqual([]);
    expect(declared.length).toBe(8);
  });

  it("needs no dark×accent matrix at all", () => {
    // The neat part: `--dk-endorse` is resolved per accent on `:root` by the
    // same cascade the light values use, so the dark scopes never mention an
    // accent. A `[data-theme="dark"][data-accent=…]` selector appearing here
    // would mean the cascade had been given up on.
    expect(CSS).not.toMatch(/\[data-theme="dark"\]\[data-accent/);
  });
});

describe("every colour this stylesheet names is one sRGB can hold", () => {
  // FOUND BY WRITING THIS TEST, and it is the finding of the milestone: six of
  // the light ramp's own values were outside sRGB, all in the accent family,
  // including the default `--endorse` — the ▲, the logo's ring, the unread badge. A
  // browser gamut-maps them, so the stylesheet was naming colours it never
  // painted. They are written at the chroma sRGB can hold now, which changes
  // no pixel and makes the file true.
  // `srgbHolds` rather than a round trip through `oklchToHex`: that converter
  // reduces chroma until a colour fits and returns the fitted hex, so an
  // out-of-gamut value and its own clamped form produce the SAME output. A
  // round-trip check would therefore have passed for every colour ever
  // written, which is the shape of test that looks thorough and asserts
  // nothing.

  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ])("%s ramp", (_name, ramp) => {
    const out: string[] = [];
    for (const [token, value] of Object.entries(ramp)) {
      const hues = value.length === 3 ? [value[2]!] : Array.from({ length: 72 }, (_, i) => i * 5);
      for (const hue of hues) if (!srgbHolds(value[0]!, value[1]!, hue)) out.push(`${token} @ ${hue}`);
    }
    expect(out).toEqual([]);
  });
});

describe("contrast, measured, in both ramps", () => {
  const luminance = (value: number[]) => {
    const [l, c, h] = value as [number, number, number];
    return channelsOf(oklchToHex(l, c, h))
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  };
  const channelsOf = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  /** Pairs the site actually renders: an ink and the surface under it. */
  const PAIRS: Array<[string, string]> = [
    ["--foreground", "--background"],
    ["--copy", "--background"],
    ["--muted-foreground", "--background"],
    ["--faint", "--background"],
    ["--foreground", "--card"],
    ["--muted-foreground", "--muted"],
    ["--link", "--background"],
    ["--destructive", "--background"],
    ["--success", "--background"],
    ["--info", "--background"],
    ["--warning", "--background"],
    ["--warning-strong", "--warning-soft"],
    ["--info-strong", "--info-soft"],
    ["--endorse-ink", "--endorse-soft"],
    ["--primary-foreground", "--primary"],
    ["--destructive-foreground", "--destructive"],
    ["--warning-foreground", "--warning"],
    ["--success-foreground", "--success"],
    ["--info-foreground", "--info"],
    ["--panel-foreground", "--panel"],
    ["--panel-muted", "--panel"],
    ["--border", "--background"],
    ["--border-strong", "--background"],
  ];

  /**
   * FR5 — AND THE LIGHT RAMP IS MEASURED NOW TOO.
   *
   * The relative rule below deferred it in as many words: *"an absolute floor
   * applied to every pair would fail on pairs the LIGHT ramp already fails …
   * and this milestone is not the place to relitigate the light ramp's
   * decisions."* True when FR0 wrote it. FR5 is the milestone that came back
   * for it, and it found one: `--faint` shipped a paragraph claiming 4.9:1
   * beside a value that painted 2.76:1.
   *
   * THE LIST IS THE PAIRS THE ESTATE ACTUALLY PAINTS AS TEXT, which is what
   * makes an absolute floor honest here. `--border` on the page is 1.23 and
   * always has been, because a hairline is not text; the base status hues are
   * fills and borders, and the site's status TEXT is `--*-strong` on
   * `--*-soft`, which is in the list. Membership is not a matter of opinion —
   * the test below proves the exclusions by scanning the source for the class
   * that would paint them.
   */
  const TEXT_PAIRS: Array<[string, string]> = [
    ["--foreground", "--background"],
    ["--copy", "--background"],
    ["--muted-foreground", "--background"],
    ["--faint", "--background"],
    ["--link", "--background"],
    ["--success", "--background"],
    ["--destructive", "--background"],
    ["--foreground", "--card"],
    ["--copy", "--card"],
    ["--muted-foreground", "--card"],
    ["--faint", "--card"],
    ["--muted-foreground", "--muted"],
    ["--warning-strong", "--warning-soft"],
    ["--info-strong", "--info-soft"],
    ["--endorse-ink", "--endorse-soft"],
    ["--primary-foreground", "--primary"],
    ["--destructive-foreground", "--destructive"],
    ["--success-foreground", "--success"],
    ["--info-foreground", "--info"],
    ["--panel-foreground", "--panel"],
    ["--panel-muted", "--panel"],
    // OPR1 — the redesign's wells and its four kinds. A kind's `ink` / `deep`
    // is the member that is a word, on the page, on a card and on its own
    // tint; the hue itself is a word too wherever it clears (idea, version
    // and seat do; amber does not, and is not in this list — see below).
    ["--muted-foreground", "--sunken"],
    ["--muted-foreground", "--well"],
    ["--copy", "--sunken"],
    ["--success", "--success-soft"],
    ["--amber-ink", "--background"],
    ["--amber-ink", "--card"],
    ["--idea", "--background"],
    ["--idea", "--card"],
    ["--idea", "--idea-soft"],
    ["--idea", "--idea-wash"],
    ["--idea-deep", "--idea-soft"],
    ["--version", "--background"],
    ["--version", "--card"],
    ["--version", "--version-soft"],
    ["--seat", "--background"],
    ["--seat", "--card"],
    ["--seat", "--seat-soft"],
    ["--seat-ink", "--seat-soft"],
    ["--seat-ink", "--seat-wash"],
    ["--on-accent", "--endorse"],
  ];

  it("keeps the amber a MARK: its word is the ink, and on its own tint the deeper ink", () => {
    // The one pair in the redesign's palette that does not clear AA as
    // written: #8A6420 on #F3E7CC is 4.36:1. So an amber word on the amber
    // tint takes `--endorse-ink` / `--warning-strong` (one step deeper, and
    // in TEXT_PAIRS above), `--amber-ink` is for the page and a card, and
    // `--amber` itself is a mark and not a word in the light ramp. Pinned so nobody
    // "fixes" the board's hex or pairs the two without noticing.
    expect(ratio(LIGHT["--amber-ink"]!, LIGHT["--amber-soft"]!)).toBeLessThan(4.5);
    expect(ratio(LIGHT["--amber"]!, LIGHT["--card"]!)).toBeLessThan(4.5);
    expect(ratio(LIGHT["--endorse-ink"]!, LIGHT["--amber-soft"]!)).toBeGreaterThanOrEqual(4.5);
    expect(LIGHT["--endorse-soft"]).toEqual(LIGHT["--amber-soft"]);
  });

  it("holds 4.5:1 in BOTH ramps on every pair the estate paints as text", () => {
    // 4.5 is AA for normal text, and normal is what these are: the smallest
    // of them is 11.5px. The large-text relaxation to 3.0 needs 24px, or
    // 18.66px bold, and no token here is only ever used that big.
    const under: string[] = [];
    for (const [fg, bg] of TEXT_PAIRS) {
      for (const [name, ramp] of [["light", LIGHT], ["dark", DARK]] as const) {
        const r = ratio(ramp[fg]!, ramp[bg]!);
        if (r < 4.5) under.push(`${name}: ${fg} on ${bg} = ${r.toFixed(2)}`);
      }
    }
    expect(under).toEqual([]);
  });

  it("excludes only pairs nothing paints — and proves it from the source", () => {
    // THE EXCLUSION IS THE PART THAT ROTS. A hand-written "these three are
    // fine to skip" is correct on the day it is written and wrong the first
    // time somebody types `text-info` — silently, because the pair is not in
    // the list above and nothing looks for it. So the reason is checked
    // rather than asserted: these three inks are excluded BECAUSE no class
    // anywhere paints them, and the day one does, this fails and the pair has
    // to be added (or the ink fixed).
    const source = sources(resolve(WEB, "src/app"))
      .map((file) => readFileSync(file, "utf-8"))
      .join("\n");
    const painted = ["text-info", "text-warning", "text-warning-foreground", "text-info-foreground"]
      // `text-warning-strong` contains `text-warning`; the bare token is the
      // one being ruled out, so the match has to end at the class boundary.
      .filter((cls) => new RegExp(`${cls}(?![\\w-])`).test(source));
    expect(painted).toEqual([]);
  });

  it("never lets the dark ramp be much worse than the light one", () => {
    // THE BAR IS RELATIVE ON PURPOSE. An absolute floor applied to every pair
    // would fail on pairs the LIGHT ramp already fails — `--border` on the
    // page is 1.23 and always has been, because a hairline separator is not
    // text — and this milestone is not the place to relitigate the light
    // ramp's decisions. What it must not do is make any of them worse.
    const worse = PAIRS.filter(([fg, bg]) => ratio(DARK[fg]!, DARK[bg]!) < ratio(LIGHT[fg]!, LIGHT[bg]!) * 0.8)
      .map(([fg, bg]) => `${fg} on ${bg}`);
    expect(worse).toEqual([]);
  });

  it("holds 4.5:1 on a logo tile at every hue, after the browser rounds it", () => {
    // The tile is the one text pair whose hue is not the ramp's: it is the
    // slug's, so every hue on the circle is some product's. At an ink of
    // 0.42 0.071 the worst hue (23) is 4.48 once each colour is rounded to
    // 8 bits, which is what axe reads off the page (sourceplane/orun-cloud#1882); at
    // 0.41 0.069 it is 4.66 (hue 33). Measured on the rounded hex, like
    // every pair here.
    const under: string[] = [];
    for (const [name, ramp] of [["light", LIGHT], ["dark", DARK]] as const) {
      const [fillL, fillC] = ramp["--tile-fill"] as [number, number];
      const [inkL, inkC] = ramp["--tile-ink"] as [number, number];
      for (let hue = 0; hue < 360; hue++) {
        const r = ratio([inkL, inkC, hue], [fillL, fillC, hue]);
        if (r < 4.5) under.push(`${name} @ ${hue}: ${r.toFixed(2)}`);
      }
    }
    expect(under).toEqual([]);
  });

  it("clears 4.5:1 in dark wherever the light ramp clears it", () => {
    const failed = PAIRS.filter(
      ([fg, bg]) => ratio(LIGHT[fg]!, LIGHT[bg]!) >= 4.5 && ratio(DARK[fg]!, DARK[bg]!) < 4.5,
    ).map(([fg, bg]) => `${fg} on ${bg}`);
    expect(failed).toEqual([]);
  });

  it("is in fact the more contrasty of the two on most pairs", () => {
    // Not a requirement — an observation worth pinning, because it explains
    // why the numbers above pass so comfortably. The light ramp's chromatic
    // inks were drawn to sit on a near-white page; their dark counterparts sit
    // far from a near-black one, so `--link` on the page goes from 4.87
    // to 10.98.
    const better = PAIRS.filter(([fg, bg]) => ratio(DARK[fg]!, DARK[bg]!) > ratio(LIGHT[fg]!, LIGHT[bg]!));
    expect(better.length).toBeGreaterThan(PAIRS.length / 2);
  });
});

describe("the monogram tile follows the ramp without the component knowing", () => {
  it("puts only the hue in the markup", () => {
    // The hue is the slug's; the lightness is the ramp's. Deciding it in the
    // component would mean reading the theme during a server render, which is
    // a second render of a page I6 requires to be one.
    const style = tileColours("my-product");
    expect(style.background).toBe("oklch(var(--tile-fill) 294)");
    expect(style.color).toBe("oklch(var(--tile-ink) 294)");
  });

  it("swaps fill and ink between the ramps, so contrast is identical by construction", () => {
    // The dark tile IS the light tile with its two colours exchanged: a pale
    // square with dark letters becomes a deep square with light ones, in the
    // same hue. Nothing about legibility can differ between the ramps, because
    // it is the same pair of colours.
    expect(DARK["--tile-fill"]).toEqual(LIGHT["--tile-ink"]);
    expect(DARK["--tile-ink"]).toEqual(LIGHT["--tile-fill"]);
  });

  it("hands the OG card the light ramp's own values", () => {
    // A card has no theme: it is one picture, on one background, for every
    // viewer. So it resolves the tile itself — and if it resolved it to
    // numbers the site no longer uses, a shared link would carry a tile in a
    // colour that appears nowhere on the page it links to.
    const card = readFileSync(resolve(WEB, "src/app/og/card.tsx"), "utf-8");
    const [fillL, fillC] = LIGHT["--tile-fill"] as [number, number];
    const [inkL, inkC] = LIGHT["--tile-ink"] as [number, number];
    expect(card).toContain(`oklchToHex(${fillL}, ${fillC}, copy.monogram.hue)`);
    expect(card).toContain(`oklchToHex(${inkL}, ${inkC}, copy.monogram.hue)`);
  });

  it("keeps the scrim a scrim on a dark page", () => {
    // An `oklch(0.2 …)` dimming layer is a fine scrim over a near-white page
    // and almost nothing over a near-black one — a dialog with no scrim at
    // all. The dark value has to be DARKER than the light one, which is the
    // opposite of what every other surface does.
    expect(DARK["--scrim"]![0]).toBeLessThan(LIGHT["--scrim"]![0]!);
    expect(DARK["--scrim"]![0]).toBeLessThan(DARK["--background"]![0]!);
  });
});

describe("no component paints a colour the ramp cannot reach", () => {
  it("hardcodes none", () => {
    // A `text-white` or a `bg-[#fff]` is a colour that does not know which
    // ramp it is in, and it is invisible in review because it is correct in
    // the ramp the reviewer is looking at. Three existed before FR0: a black
    // shimmer on the skeletons, white ink on the unread badge, and the auth
    // modal's inline scrim.
    const files = sources(resolve(WEB, "src/app"));
    const bad: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const m of code.matchAll(
        /\b(?:bg|text|border|ring|from|to|via|fill|stroke|decoration|outline|shadow|divide|placeholder)-(?:white|black)\b|\[(?:#[0-9a-fA-F]{3,8}|rgba?\(|oklch\()/g,
      )) {
        bad.push(`${file.slice(WEB.length + 1)}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/** Every `.ts`/`.tsx` under a directory. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}
