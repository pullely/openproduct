// What a link to this site looks like somewhere else (openproduct-worldclass RE0).
//
// The audit's P1·08, narrowed by triage: *"No `og:image` on any route —
// `openGraph` is set on five and carries no `images` anywhere."* A shared
// openproduct link unfurled as a `summary` card: a 1:1 grey thumbnail beside
// two lines of text, next to a Product Hunt link carrying a 1200×630 hero.
//
// The card is drawn by satori inside the worker, which is not a browser: it
// does not know `oklch()`, it does not read the stylesheet, and it does not
// reflow off the canvas. Every one of those is a way for a card to go wrong
// silently in somebody else's timeline, and each has a suite below.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BOARD_MEANING } from "@openproduct/contracts";

import {
  OG_HEIGHT,
  OG_SUBTITLE_MAX,
  OG_TITLE_MAX,
  OG_TOKENS,
  OG_WIDTH,
  cardMeta,
  dayCopy,
  firstSentence,
  makerCopy,
  ogLine,
  ogPalette,
  oklchToHex,
  productCopy,
  ogWeekLine,
  siteCopy,
  topicCopy,
  LIST_CARD_KEYS,
  isListCardKey,
  listCopy,
  listOpenGraph
} from "@openproduct-web/app/ui/og";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const CSS = readFileSync(resolve(__dirname, "../../../web/src/styles/globals.css"), "utf-8");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");

/** A file's code, with its comments removed — the same guard `routes.test.ts`
 *  uses, and for the same reason: a NEGATIVE assertion must not be tripped by
 *  a comment explaining why the thing it forbids is absent. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * sRGB → OKLCH, written here and NOT imported from the code under test.
 *
 * An independent inverse is what turns "the converter agrees with itself"
 * into "the converter agrees with the maths a browser runs". It is used twice
 * below: once to hold `oklchToHex` to the stylesheet's stored triples exactly,
 * and once to prove that an out-of-gamut colour comes back at the hue it went
 * in at.
 */
function toOklch(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    chroma: Math.hypot(A, B),
    hue: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

describe("the converter, against the stylesheet's own recorded hexes", () => {
  // OL1 moved 164 colours from hex to OKLCH and WROTE THE ORIGINAL HEX BESIDE
  // EACH ONE, and OPR1 kept the habit when it re-derived the palette from the
  // redesign's hexes. The annotations in `globals.css` are therefore a
  // ground-truth corpus this repository already owns: ninety-six
  // independently-derived (L C H) → #rrggbb pairs that nothing in `ui/og.ts`
  // had any hand in producing.
  //
  // AN ANNOTATION IS A TRAILING COMMENT, ON THE TOKEN'S OWN LINE, and the
  // `[^\S\n]*` is what says so. `\s*` there matched newlines, so a token with
  // no annotation of its own was paired with the first hex in whatever BLOCK
  // COMMENT happened to follow it — which is a corpus a neighbour can hijack.
  // FR5 tripped it by opening the note above `--destructive` with the hex it
  // was moving to: `--accent-foreground`, four lines up and annotated with
  // nothing, silently acquired `#BF433D` and joined the drift list below.
  const PAIRS = [
    ...CSS.matchAll(/(--[\w-]+):\s*([\d.]+)\s+([\d.]+)\s+([\d.]+);[^\S\n]*\/\*\s*(#[0-9A-Fa-f]{6})/g),
  ].map((m) => ({
    token: m[1]!,
    oklch: [Number(m[2]), Number(m[3]), Number(m[4])] as const,
    hex: m[5]!.toLowerCase(),
  }));

  const channels = (hex: string) =>
    [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

  it("found the corpus, so a stylesheet that lost its annotations fails here", () => {
    // The light ramp annotates its hexes and, since OPR1, so do the dark
    // ramp's kind tokens: ninety-six pairs.
    expect(PAIRS.length).toBeGreaterThan(90);
  });

  it("round-trips every stored triple through an independent inverse", () => {
    // THE EXACT CHECK. `oklchToHex` and `toOklch` were written from the same
    // published matrices but in opposite directions, so agreement between them
    // is agreement with the maths rather than with itself.
    //
    // MEASURED IN OKLab, NOT IN OKLCH, and the difference is not pedantry. The
    // round trip passes through 8-bit sRGB, which quantises; near white a
    // single byte step is worth a few thousandths in this space. In POLAR
    // coordinates that same step is an enormous swing in hue and a large
    // fraction of the chroma when the chroma is 0.023 — `--info-border` looked
    // like a two-degree error and is one byte. Cartesian ΔE says what actually
    // changed, and across all forty-five the worst is 0.0017.
    const off = PAIRS.filter((pair) => {
      const [l, c, h] = pair.oklch;
      const radians = (h * Math.PI) / 180;
      const back = toOklch(oklchToHex(l, c, h));
      const backRadians = (back.hue * Math.PI) / 180;
      return (
        Math.hypot(
          back.lightness - l,
          back.chroma * Math.cos(backRadians) - c * Math.cos(radians),
          back.chroma * Math.sin(backRadians) - c * Math.sin(radians),
        ) > 0.003
      );
    }).map((pair) => `oklch(${pair.oklch.join(" ")})`);
    expect(off).toEqual([]);
  });

  it("lands on the hex each token was converted FROM — every one of them", () => {
    // ─── THE ANNOTATION IS A CHECK NOW, NOT A MEMORY ──────────────────────
    //
    // Until openproduct-redesign OPR1 nine annotations did not reproduce, by
    // up to seven on 255: OL1's conversion had been lossy on them, each
    // comment was the pre-conversion original rather than a check on the
    // result, and the nine were pinned here as a list so a tenth could not
    // join silently.
    //
    // OPR1 re-derived the palette from the redesign's hexes, each triple
    // computed from the hex written beside it, and the last of the nine
    // (`--tier-bronze`, which the redesign does not restyle) was recomputed
    // from its own annotation. So the list is EMPTY, and it is still a list
    // rather than a tolerance: a triple that drifts from its hex — a value
    // nudged without its comment, a comment copied from another token — is a
    // new fact about the palette and shows up here by name.
    const off = (limit: number) =>
      PAIRS.filter((pair) => {
        const got = channels(oklchToHex(...pair.oklch));
        return channels(pair.hex).some((want, at) => Math.abs(got[at]! - want) > limit);
      }).map((pair) => pair.token);

    // Within one on 255: the triples are stored to four decimals, which is
    // finer than a byte, so only rounding at a byte boundary is left.
    expect(off(1)).toEqual([]);
    // And nothing anywhere is grossly wrong — a swapped matrix row or a
    // missing gamma step would move every colour by tens, not by sevens.
    expect(off(8)).toEqual([]);
  });

  it("puts the ends of the ramp exactly where they belong", () => {
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
  });
});

describe("out-of-gamut colours lose chroma, not hue", () => {
  // The tile fill is `oklch(0.93 0.1 h)` for an unbounded set of hues, and a
  // good part of that circle is outside sRGB. The obvious fix — clamp each
  // channel to 0…1 — ROTATES THE HUE, because clipping one channel and not
  // the others is a different colour rather than a duller one. A generated
  // tile whose whole job is that two products look different cannot afford
  // that, so the converter reduces chroma until the colour fits.
  //
  // The check is an INDEPENDENT INVERSE written here, rather than a second
  // call into the code under test.
  it("keeps the hue of every tile fill on the whole circle", () => {
    const drifted = [];
    for (let hue = 0; hue < 360; hue += 1) {
      const back = toOklch(oklchToHex(0.93, 0.1, hue));
      const drift = Math.min(Math.abs(back.hue - hue), 360 - Math.abs(back.hue - hue));
      if (drift >= 2) drifted.push(`${hue}° came back as ${back.hue.toFixed(1)}°`);
    }
    expect(drifted).toEqual([]);
  });

  it("reduces chroma only where it has to, and never raises it", () => {
    let reduced = 0;
    const raised = [];
    for (let hue = 0; hue < 360; hue += 1) {
      const back = toOklch(oklchToHex(0.93, 0.1, hue));
      if (back.chroma > 0.105) raised.push(`${hue}° → ${back.chroma.toFixed(3)}`);
      if (back.chroma < 0.095) reduced += 1;
    }
    expect(raised).toEqual([]);
    // If NOTHING were ever reduced the gamut branch would be dead code and
    // this suite would be asserting nothing; if EVERYTHING were, the
    // converter would be broken. Both are real regressions and both fail.
    expect(reduced).toBeGreaterThan(0);
    expect(reduced).toBeLessThan(360);
  });

  it("emits a well-formed hex for every hue, at both tile lightnesses", () => {
    for (let hue = 0; hue < 360; hue += 7) {
      expect(oklchToHex(0.93, 0.1, hue)).toMatch(/^#[0-9a-f]{6}$/);
      expect(oklchToHex(0.42, 0.12, hue)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("the card's palette cannot drift from the site's", () => {
  // A card is rendered without a cascade: there is no `var(--background)`
  // here and no stylesheet to read, so the tokens are copied into `ui/og.ts`.
  // Copies rot. This is what stops this one rotting silently.
  const rootBlock = CSS.slice(CSS.indexOf(":root"), CSS.indexOf("@media"));

  it("matches globals.css token for token", () => {
    const fromCss: Record<string, number[] | null> = {};
    const fromCard: Record<string, number[] | null> = {};
    for (const [name, triple] of Object.entries(OG_TOKENS)) {
      const declared = new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+);`).exec(rootBlock);
      fromCss[name] = declared
        ? [Number(declared[1]), Number(declared[2]), Number(declared[3])]
        : null;
      fromCard[name] = [...triple];
    }
    expect(fromCard).toEqual(fromCss);
  });

  it("hands the renderer hexes, because satori has never heard of oklch", () => {
    for (const value of Object.values(ogPalette())) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("never lets an oklch() string reach the card", () => {
    expect(withoutComments(read("og/card.tsx"))).not.toMatch(/oklch\(/);
  });
});

describe("the card stays inside satori's CSS, which is smaller than CSS", () => {
  // EVERY RULE HERE WAS LEARNED FROM A 500, NOT FROM A BUILD FAILURE. Satori
  // validates its style objects at RENDER time, inside the worker, at the
  // moment somebody pastes a link — `next build` is perfectly happy with a
  // card that cannot draw. These are the two constraints this card touches.
  const CARD = read("og/card.tsx");

  it("uses only the two border styles satori implements", () => {
    // `Invalid value for CSS property "borderStyle". Allowed values: "solid" |
    // "dashed"`. VC4's ring on the site is DOTTED; the card's is dashed, and
    // at 132px in an unfurl the two are indistinguishable.
    const styles = [...CARD.matchAll(/border[^:]*:\s*`?\d+px\s+([a-z]+)/g)].map((m) => m[1]!);
    expect(styles.length).toBeGreaterThan(0);
    expect(styles.filter((style) => style !== "solid" && style !== "dashed")).toEqual([]);
  });

  it("makes every box an explicit flex container", () => {
    // Satori has no block layout: an element with more than one child and no
    // `display: flex` throws. Rather than reason about which boxes currently
    // have two children — a property the next edit changes — every box in this
    // file declares it.
    const boxes = [...CARD.matchAll(/<div\n?\s*style=\{\{([\s\S]*?)\}\}/g)].map((m) => m[1]!);
    expect(boxes.length).toBeGreaterThan(4);
    expect(boxes.filter((box) => !box.includes('display: "flex"'))).toEqual([]);
  });
});

describe("a line is bounded here, because satori will not reflow it", () => {
  it("leaves a line that fits exactly as it was written", () => {
    expect(ogLine("A tiny CLI", 40)).toBe("A tiny CLI");
  });

  it("collapses the whitespace a maker pasted in", () => {
    expect(ogLine("  two   words\nhere ", 40)).toBe("two words here");
  });

  it("cuts on a word boundary and says that it cut", () => {
    const cut = ogLine("observability for people who do not enjoy dashboards", 30);
    expect(cut.length).toBeLessThanOrEqual(30);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/\s…$/);
    expect("observability for people who do not enjoy dashboards").toContain(cut.slice(0, -1));
  });

  it("still cuts when there is no word boundary to cut on", () => {
    const cut = ogLine("a".repeat(200), 20);
    expect(cut.length).toBe(20);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("firstSentence", () => {
  it("takes the claim and leaves the footnotes", () => {
    expect(firstSentence(BOARD_MEANING)).toBe(
      "Launches from this day, ordered by the endorsements they received during it.",
    );
  });

  it("returns the whole thing when there is only one", () => {
    expect(firstSentence("No full stop here")).toBe("No full stop here");
  });
});

describe("nothing on a card is a number, and that is the point", () => {
  // A social card is fetched ONCE, by an unfurler, and held in its cache for
  // as long as it likes with no way for this site to correct it. A count on
  // it is a claim that cannot be revised — and a listing whose card was cut
  // in its first minute would carry "0 upvotes" behind every share of it
  // forever, which is the most damaging possible reading of a number that
  // simply had not been counted yet (OPC-C, OPC-7).
  // OB7 — ONE EXCEPTION, ON THE OBJECTION'S OWN TERMS: a build's card may
  // carry its week (`ogWeekLine`), DATED and NEVER ZERO, which answers both
  // halves of the rule above — the date is staleness rendered in the only
  // form a cached image can hold, and a zero or an unobserved figure is left
  // off. The product route reads the two metrics only to hand them to that
  // one function; every other card source stays number-free.
  const CARD_SOURCES = ["og/card.tsx", ...ogRoutes()].filter((file) => file !== "og/product/[slug]/route.tsx");

  it.each(CARD_SOURCES)("%s renders no count, rank or score", (file) => {
    expect(withoutComments(read(file))).not.toMatch(
      /endorsement|upvote|\brank\b|\bscore\b|\bcount\b|products\b/i,
    );
  });

  it("the product card's one number is its dated week, through ogWeekLine only", () => {
    const route = withoutComments(read("og/product/[slug]/route.tsx"));
    expect(route).toContain('ogWeekLine(metric("merges.7d"), metric("endorsements.7d"))');
    expect(route).not.toMatch(/\brank\b|\bscore\b|\bcount\b/);
    const at = "2026-10-14T09:00:00.000Z";
    expect(ogWeekLine({ value: 12, observedAt: at }, { value: 5, observedAt: at })).toBe("12 changes · 5 upvotes this week · 14 Oct");
    expect(ogWeekLine({ value: 1, observedAt: at }, null)).toBe("1 change this week · 14 Oct");
    // Never a zero, never an unobserved figure: with neither, no line at all.
    expect(ogWeekLine({ value: 0, observedAt: at }, { value: 3, observedAt: at })).toBe("3 upvotes this week · 14 Oct");
    expect(ogWeekLine({ value: 0, observedAt: at }, { value: 0, observedAt: at })).toBeNull();
    expect(ogWeekLine(null, null)).toBeNull();
  });

  it("carries no number a reader could mistake for a measurement", () => {
    // THE ONLY NUMBER IN THE COPY IS THE MONOGRAM'S HUE, which is a colour
    // rather than a claim: it is derived from the slug, it never changes, and
    // it never reaches the card as text. Structural rather than textual,
    // because a tagline is allowed to contain a digit and a launch date is
    // made of them — what is forbidden is a FIELD that holds a count.
    const copy = productCopy("my-product", "A tiny CLI");
    const numbers = Object.entries(copy).filter(([, value]) => typeof value === "number");
    expect(numbers).toEqual([]);
    // PP4 — `mark` is a string or null, never a number: the dated podium
    // place, which is a fact about a day and not a count.
    // openproduct-studio OSD3 — `logo` is a URL or null, never a number.
    // OB7 — `week` is a dated string or null, never a number.
    expect(Object.keys(copy).sort()).toEqual(["alt", "kind", "logo", "mark", "monogram", "subtitle", "title", "week"]);
    expect(copy.week).toBeNull();
    expect(copy.logo).toBeNull();
    expect(Object.keys(copy.monogram!).sort()).toEqual(["hue", "initials"]);
  });

  it("says the durable thing instead", () => {
    expect(read("og/card.tsx")).toContain("Observed, not claimed");
  });
});

describe("the four kinds, plus the one everything falls back to", () => {
  it("names a product by its slug and quotes the maker's own sentence", () => {
    const copy = productCopy("my-product", "A tiny CLI for reading logs");
    expect(copy.kind).toBe("product");
    expect(copy.title).toBe("my-product");
    expect(copy.subtitle).toBe("A tiny CLI for reading logs");
    expect(copy.monogram).toEqual({ initials: "MP", hue: expect.any(Number) });
  });

  it("gives a listing with no tagline no second line, rather than an empty one", () => {
    expect(productCopy("my-product", null).subtitle).toBeNull();
  });

  it("puts the handle first on a maker card, because the handle is the address", () => {
    // I3: a platform display name never carries platform authority onto a
    // public page, and `/@handle` is what a reader will type.
    const copy = makerCopy("ada", "Ada L");
    expect(copy.title).toBe("@ada");
    expect(copy.subtitle).toBe("Ada L");
    expect(makerCopy("ada", null).subtitle).toBeNull();
  });

  it("gives a day no monogram, because a day has no logo", () => {
    const copy = dayCopy("7 September 2026", BOARD_MEANING);
    expect(copy.monogram).toBeNull();
    expect(copy.title).toBe("7 September 2026");
  });

  it("gives a topic the vocabulary's own description, never its own", () => {
    const copy = topicCopy("devtools", "Developer tools", "Things developers install.");
    expect(copy.subtitle).toBe("Things developers install.");
  });

  it("bounds every line of every kind", () => {
    const long = "x".repeat(400);
    for (const copy of [
      productCopy(long, long),
      topicCopy(long, long, long),
      makerCopy(long, long),
      dayCopy(long, long),
      siteCopy(long),
    ]) {
      expect(copy.title.length).toBeLessThanOrEqual(OG_TITLE_MAX);
      expect(copy.subtitle?.length ?? 0).toBeLessThanOrEqual(OG_SUBTITLE_MAX);
    }
  });

  it("always says what the picture is", () => {
    for (const copy of [
      productCopy("my-product", "A tiny CLI"),
      topicCopy("devtools", "Developer tools", "Things developers install."),
      makerCopy("ada", null),
      dayCopy("7 September 2026", BOARD_MEANING),
      siteCopy("Products built in the open."),
    ]) {
      expect(copy.alt.length).toBeGreaterThan(3);
    }
  });
});

describe("QE1 — the list routes' cards", () => {
  it("is a registry: nine keys, each the page's own heading and sentence", () => {
    expect(LIST_CARD_KEYS).toEqual([
      "leaderboard",
      "topics",
      "people",
      "digest",
      "collections",
      "search",
      "stack",
      "pricing",
      "threads",
    ]);
    expect(isListCardKey("leaderboard")).toBe(true);
    expect(isListCardKey("__proto__")).toBe(false);
    expect(isListCardKey("anything")).toBe(false);
  });

  it("gives a list no monogram and no number, and says what the picture is", () => {
    for (const key of LIST_CARD_KEYS) {
      const copy = listCopy(key);
      expect([key, copy.kind]).toEqual([key, "list"]);
      expect([key, copy.monogram]).toEqual([key, null]);
      expect(copy.title.length).toBeLessThanOrEqual(OG_TITLE_MAX);
      expect((copy.subtitle ?? "").length).toBeLessThanOrEqual(OG_SUBTITLE_MAX);
      expect(copy.alt).toContain("on openproduct");
      expect(/\d/.test(copy.title)).toBe(false);
    }
  });

  it("spreads a whole openGraph block on a real origin and nothing on a preview", () => {
    expect(listOpenGraph(null, "topics")).toEqual({});
    const block = listOpenGraph("https://openproduct.live", "topics");
    expect(block.openGraph?.images[0]?.url).toBe("https://openproduct.live/og/list/topics");
    expect(block.twitter?.card).toBe("summary_large_image");
  });
});

describe("a card is advertised only where the deployment knows its own address", () => {
  it("advertises nothing on a preview host", () => {
    // The same gate `alternates.canonical` sits behind, for the same reason:
    // `og:image` must be absolute, a preview host does not know its public
    // origin at build time, and a card advertised at `http://localhost:3000`
    // is a broken image in a timeline rather than a tidy text unfurl.
    expect(cardMeta(null, "/og/site", "alt")).toBeNull();
  });

  it("builds an absolute URL at the size every unfurler crops to", () => {
    const card = cardMeta("https://openproduct.live", "/og/product/my-product", "my-product");
    expect(card!.images[0]!.url).toBe("https://openproduct.live/og/product/my-product");
    expect(card!.images[0]!.width).toBe(OG_WIDTH);
    expect(card!.images[0]!.height).toBe(OG_HEIGHT);
    expect(OG_WIDTH / OG_HEIGHT).toBeCloseTo(1.91, 1);
  });

  it("asks for the large card, which is the whole finding", () => {
    // `summary` — what the site advertised by omission — crops to a 1:1
    // thumbnail beside the text, and the audit found it doing exactly that.
    expect(cardMeta("https://openproduct.live", "/og/site", "alt")!.twitter.card).toBe(
      "summary_large_image",
    );
  });
});

/** Every card route on disk, relative to `src/app`. */
function ogRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(resolve(APP_DIR, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) walk(`${dir}/${entry.name}`, `${prefix}/${entry.name}`);
      else if (entry.name === "route.tsx") out.push(`${dir}/${entry.name}`);
    }
  };
  walk("og", "/og");
  return out.sort();
}

describe("every card route is a public document and nothing else", () => {
  const ROUTES = ogRoutes();

  it("ships one per kind, and the census is the list rather than a memory", () => {
    expect(ROUTES).toEqual([
      "og/day/[day]/route.tsx",
      // QE1 — the list routes' card, one route for nine keyed sentences.
      "og/list/[key]/route.tsx",
      "og/maker/[handle]/route.tsx",
      "og/product/[slug]/route.tsx",
      "og/site/route.tsx",
      "og/topic/[topic]/route.tsx",
    ]);
  });

  it.each(ROUTES)("%s declares how long it may be held", (file) => {
    // XP4's rule, and it applies to a route handler for the reason it applies
    // to a page: without a declaration the handler is served `no-store`, and
    // a card regenerated per request spends satori's CPU on every unfurl.
    const source = read(file);
    expect(/export const revalidate = \d+;/.test(source) || source.includes('dynamic = "force-static"')).toBe(true);
  });

  it.each(ROUTES)("%s resolves no actor (WC-4, I6)", (file) => {
    // The property this epic is least allowed to lose. A card personalised to
    // the sharer would make every share of one listing a separate object, and
    // would cost the edge cache that the performance dimension is built on.
    const code = withoutComments(read(file));
    expect(code).not.toMatch(/cookies\(|headers\(|session|Authorization|subject/i);
  });

  it("404s a card exactly where its page 404s", () => {
    for (const file of ROUTES.filter((r) => r.includes("["))) {
      expect(withoutComments(read(file))).toContain('status: 404');
    }
  });
});

describe("every advertised card has a route behind it", () => {
  // The failure this catches is a rename: a page keeps advertising
  // `/og/product/…` after the directory becomes `/og/listing/…`, and the only
  // symptom is a broken image on a surface nobody on the team ever unfurls.
  const PAGES = [
    "page.tsx",
    "[slug]/page.tsx",
    "topics/[topic]/page.tsx",
    "launches/[day]/page.tsx",
    "people/[handle]/maker-view.tsx",
  ];

  it.each(PAGES)("%s points at a card that exists", (file) => {
    const paths = [...read(file).matchAll(/["`]\/og\/([a-z]+)/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((kind) => !existsSync(resolve(APP_DIR, "og", kind)))).toEqual([]);
  });

  it("advertises one card for all three maker tabs", () => {
    // Three near-identical pictures differing only in a word nobody reads at
    // unfurl size, each a separate object for every cache between here and a
    // timeline, is worse than one card that names the person.
    const source = read("people/[handle]/maker-view.tsx");
    expect([...source.matchAll(/\/og\/maker\//g)].length).toBe(1);
  });
});
