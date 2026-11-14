import {
  COLLECTIONS_MEANING,
  DIRECTORY_ELIGIBILITY_NOTE,
  FEED_DESCRIPTION,
  FORUM_MEANING,
  FORUM_TITLE,
  LEADERBOARD_MEANING,
  PRICING_MEANING,
  PRICING_TITLE,
  SEARCH_SCOPE_NOTE,
  STACKS_MEANING,
  STACKS_TITLE,
  logoOf,
  mediaPath,
  parseMediaRef,
  type MediaFact,
} from "@openproduct/contracts";
import { hueFor, initialsOf } from "../feed/tile";

/**
 * What a link to this site looks like somewhere else, as pure functions
 * (openproduct-worldclass RE0).
 *
 * SEPARATE FROM THE CARDS, for the reason `feed/tile.ts` and `ui/time.ts`
 * already state about themselves: the web test lane is module-level and has
 * no JSX, so a rule that lives inside a `.tsx` is a rule no test in this
 * repository can hold. Everything a card DECIDES lives here; the `.tsx` files
 * only lay it out.
 *
 * ─── WHY THERE IS A COLOUR CONVERTER IN THIS FILE ─────────────────────────
 *
 * The whole palette is OKLCH (OL1 moved 164 values into it), and the card is
 * drawn by satori, which does not know what `oklch()` is. A card that quietly
 * dropped the colour would render the site's logo tiles in black on white and
 * nobody would notice until it was in somebody's timeline.
 *
 * So the conversion is explicit, it is here, and it is tested against known
 * values rather than trusted. It is the same maths the browser runs — Björn
 * Ottosson's OKLab matrices — and it is only needed because a social card is
 * the one surface the site renders without a browser.
 */

/**
 * The card's dimensions. `summary_large_image` wants 1.91:1 and every
 * consumer crops to it; 1200×630 is that ratio and the size every unfurler
 * has been tuned against for a decade.
 */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * How long a card may be held.
 *
 * NOT `immutable`, which is what `ImageResponse` sets by default. The cards
 * carry a product's name and its maker's sentence about it, and those change
 * — a card cached for a year would keep serving a tagline the maker rewrote
 * in March. An hour at the edge is the same order as every other public read
 * on this site, and the consumers that matter (Slack, Twitter, Discord) hold
 * their own copy far longer than that anyway, which is the reason nothing on
 * a card is a number — see `cardIsDurable` below.
 */
export const OG_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

/** sRGB gamma, forwards. */
function encodeGamma(channel: number): number {
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/** OKLab → linear sRGB, Ottosson's matrices, unclamped so gamut can be tested. */
function oklabToLinearRgb(lightness: number, a: number, b: number): [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const IN_GAMUT_EPSILON = 1e-5;

function isInGamut([r, g, b]: [number, number, number]): boolean {
  return [r, g, b].every((c) => c >= -IN_GAMUT_EPSILON && c <= 1 + IN_GAMUT_EPSILON);
}

/**
 * Can sRGB hold this colour at all?
 *
 * EXPORTED BECAUSE THE ANSWER IS NOT VISIBLE IN THE OUTPUT. `oklchToHex`
 * reduces chroma until a colour fits, and it does so silently — which is
 * right for a card and useless for a caller that wants to know whether the
 * value it authored is the value a browser will paint. FR0 asks exactly that
 * of all 82 palette tokens (`dark-ramp.test.ts`), and it found six of them
 * outside sRGB, so the question is worth being able to ask.
 */
export function srgbHolds(lightness: number, chroma: number, hue: number): boolean {
  const radians = (hue * Math.PI) / 180;
  return isInGamut(oklabToLinearRgb(lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)));
}

/**
 * `oklch(L C H)` as a `#rrggbb` satori can paint.
 *
 * OUT-OF-GAMUT COLOURS LOSE CHROMA, NOT HUE. Half the hue circle at
 * `oklch(0.93 0.1 h)` is outside sRGB, and the obvious fix — clamp each
 * channel to 0…1 — turns a lavender into a different colour entirely, because
 * clipping one channel rotates the hue. Reducing chroma until the colour fits
 * is what CSS Color 4 specifies and what a browser does, and it keeps the one
 * property a generated tile is trying to have: two products with different
 * hues still look different.
 *
 * Bisection rather than an analytic solve: the sRGB gamut boundary in OKLCH
 * has no closed form, twenty halvings land inside a thousandth of a chroma
 * step, and this runs once per card behind an hour of edge cache.
 */
export function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const radians = (hue * Math.PI) / 180;
  const at = (c: number) => oklabToLinearRgb(lightness, c * Math.cos(radians), c * Math.sin(radians));

  let usable = 0;
  let tooMuch = chroma;
  if (isInGamut(at(chroma))) {
    usable = chroma;
  } else {
    for (let step = 0; step < 20; step += 1) {
      const middle = (usable + tooMuch) / 2;
      if (isInGamut(at(middle))) usable = middle;
      else tooMuch = middle;
    }
  }

  return (
    "#" +
    at(usable)
      .map((channel) => {
        const byte = Math.round(255 * encodeGamma(Math.min(1, Math.max(0, channel))));
        return byte.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

/**
 * The tokens a card paints with, as the OKLCH triples `globals.css` stores.
 *
 * COPIED ON PURPOSE, AND HELD TO THE ORIGINAL BY A TEST. A card is rendered
 * without a browser: there is no cascade here, no `var(--background)`, and no
 * stylesheet to read. Some duplication of the palette is therefore
 * unavoidable, and the question is only whether the copy can drift silently.
 * `og-card.test.ts` parses `:root` out of `globals.css` and asserts every
 * triple below still matches the token it names, so a palette change that
 * forgets the cards fails in CI rather than in somebody's timeline.
 */
export const OG_TOKENS = {
  background: [0.967, 0.0082, 91.48],
  foreground: [0.1908, 0.002, 106.59],
  copy: [0.285, 0.0056, 91.57],
  faint: [0.5239, 0.0063, 95.17],
  border: [0.9271, 0.0081, 98.89],
  card: [1, 0, 0],
} as const;

export type OgToken = keyof typeof OG_TOKENS;

/** Every token above, converted once, as `#rrggbb`. */
export function ogPalette(): Record<OgToken, string> {
  const out = {} as Record<OgToken, string>;
  for (const [name, [l, c, h]] of Object.entries(OG_TOKENS) as [OgToken, readonly number[]][]) {
    out[name] = oklchToHex(l!, c!, h!);
  }
  return out;
}

/**
 * The four kinds of card, and the word each one puts above the name.
 *
 * The kicker is doing a real job rather than decorating: an unfurled card
 * arrives with no address visible in most clients, so "TOPIC" over
 * `Developer tools` is the difference between a reader knowing they are being
 * shown a category and assuming they are being shown a product.
 */
export const OG_KINDS = {
  product: "PRODUCT",
  topic: "TOPIC",
  maker: "MAKER",
  day: "LAUNCHES",
  site: "OPENPRODUCT",
  /** QE1 — a list route's card: the page's own heading over the site's
   *  kicker, so an unfurled `/leaderboard` says what it is a list of. */
  list: "OPENPRODUCT",
} as const;

export type OgKind = keyof typeof OG_KINDS;

/**
 * What the card says, decided here and laid out by `og/card.tsx`.
 *
 * ─── NOTHING ON A CARD IS A NUMBER, AND THAT IS A CORRECTION TO THE PLAN ──
 *
 * The implementation plan's RE0 asks for "name, tagline, **rank, upvote
 * count**". It should not, and the reason is a property of the medium rather
 * than a preference.
 *
 * A social card is not fetched by a reader. It is fetched once by Slack, or
 * Twitter, or Discord, at the moment somebody first pastes the link — and
 * then held in *their* cache, for days or months, with no revalidation this
 * site can trigger and no `Cache-Control` it will honour. The image a person
 * sees in December is the image an unfurler took in September.
 *
 * Which makes a count on a card a claim that cannot be corrected. **OPC-7**
 * asks that staleness be rendered; a card has nowhere to render it and no
 * moment at which to notice. **OPC-C** says a zero is a claim — and a listing
 * whose card was cut in its first minute would carry "0 upvotes" behind every
 * share of it forever, which is the most damaging possible reading of a
 * number that simply had not been counted yet.
 *
 * So the card carries only what does not rot: the name, the maker's own
 * sentence, the monogram, and the mark. Every one of those is stable for the
 * life of the listing, and a card that is merely out of date about a tagline
 * is a different order of wrong from one that libels a launch with a zero.
 *
 * The rank and the count are on the page the card links to, where they are
 * live, dated, and beside the legend that explains them.
 */
export interface OgCopy {
  kind: OgKind;
  /** The name, at the top of the card's own hierarchy. */
  title: string;
  /** The maker's sentence, or the vocabulary's, or none. */
  subtitle: string | null;
  /** Two letters and a hue, where the surface has a tile. */
  monogram: { initials: string; hue: number } | null;
  /**
   * openproduct-studio OSD3 — the maker's logo, as an absolute URL, drawn in
   * the tile's place when present (`ogLogoUrl` decides). Absent or null keeps
   * the monogram.
   */
  logo?: string | null;
  /** What a screen reader is told the picture is. */
  alt: string;
  /** PP4 — the dated podium mark (`#1 on 9 Sept`), or none. The only
   *  kind of mark that does not rot; see `marks.ts` for why. */
  mark: string | null;
  /** OB7 — a build's week, DATED: `12 changes · 5 upvotes this week · 14 Oct`,
   *  or none (`ogWeekLine` says when). */
  week?: string | null;
}

/**
 * A build's week on its card (openproduct-open-builds OB7), and the one place
 * a number reaches a card — on terms that answer the objection above.
 *
 * The objection is two claims: a card cannot render staleness, and a zero on
 * a card libels a listing forever. So this line CARRIES ITS DATE, which is
 * staleness rendered in the only form a cached image can hold ("as of when"
 * is OPC-7 on a medium with no clock), and it is NEVER A ZERO: a figure that
 * is unobserved or zero is left off, and with neither the line is absent.
 * "12 changes this week, 14 Oct" read in December is still true of 14 Oct.
 */
export function ogWeekLine(
  merges: { value: number; observedAt: string } | null,
  upvotes: { value: number; observedAt: string } | null,
): string | null {
  const parts: string[] = [];
  const moments: number[] = [];
  if (merges && merges.value > 0) {
    parts.push(merges.value === 1 ? "1 change" : `${merges.value} changes`);
    moments.push(Date.parse(merges.observedAt));
  }
  if (upvotes && upvotes.value > 0) {
    parts.push(upvotes.value === 1 ? "1 upvote" : `${upvotes.value} upvotes`);
    moments.push(Date.parse(upvotes.observedAt));
  }
  const at = Math.max(...moments.filter((m) => !Number.isNaN(m)));
  if (parts.length === 0 || !Number.isFinite(at)) return null;
  const day = new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${parts.join(" · ")} this week · ${day}`;
}

/**
 * A line, bounded.
 *
 * SATORI DOES NOT REFLOW OFF THE CANVAS — it will happily lay a 400-character
 * tagline out past the edge of a 1200px image and produce a card with the
 * second half of a sentence missing and no ellipsis to say so. The bound is
 * therefore here, where it is a decision, rather than in CSS where it would
 * be a hope.
 *
 * Cut on a word boundary where there is one within a reasonable distance, so
 * the card never ends mid-word — the same rule `listingTitle` follows.
 */
export function ogLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The card's own bounds, chosen against the type sizes `og/card.tsx` sets. */
export const OG_TITLE_MAX = 34;
export const OG_SUBTITLE_MAX = 96;

/** The leading sentence of a published paragraph, or the whole thing when it
 *  is one. Used where a card has room for a claim but not for its footnotes. */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const stop = flat.search(/[.!?](\s|$)/);
  return stop === -1 ? flat : flat.slice(0, stop + 1);
}

/**
 * The logo a card may draw, as an absolute URL — or null (openproduct-studio
 * OSD3).
 *
 * PNG OR JPEG ONLY. Satori decodes those two; a WebP it cannot decode is a
 * 500 on the card at the moment somebody pastes a link, so a WebP logo keeps
 * the monogram here (and only here — every page draws it). THE ORIGINAL, not
 * a derivative: derivatives are WebP (`MEDIA_DERIVATIVE_FORMAT`), for the
 * same reason.
 */
export function ogLogoUrl(media: readonly MediaFact[], apiBase: string): string | null {
  const logo = logoOf(media);
  if (!logo) return null;
  const parsed = parseMediaRef(logo.value.ref);
  if (!parsed || (parsed.format !== "png" && parsed.format !== "jpg")) return null;
  return `${apiBase.replace(/\/+$/, "")}${mediaPath(logo.value.ref)}`;
}

/** The listing card. The tile is the one the feed row already draws — the
 *  maker's logo where `ogLogoUrl` found one, else the monogram (OSD3). */
export function productCopy(
  slug: string,
  tagline: string | null,
  /** PP4 — `cardMark(profile.launch)`: the dated podium mark or null. */
  mark: string | null = null,
  /** openproduct-studio OSD3 — `ogLogoUrl(profile.media, …)`, or null. */
  logo: string | null = null,
  /** OB7 — `ogWeekLine(...)`, or null. */
  week: string | null = null,
): OgCopy {
  const base = tagline ? `${slug} — ${ogLine(tagline, OG_SUBTITLE_MAX)}` : slug;
  return {
    kind: "product",
    title: ogLine(slug, OG_TITLE_MAX),
    subtitle: tagline ? ogLine(tagline, OG_SUBTITLE_MAX) : null,
    monogram: { initials: initialsOf(slug), hue: hueFor(slug) },
    logo,
    alt: [base, mark, week].filter(Boolean).join(" · "),
    mark,
    week,
  };
}

/**
 * The topic card, and it carries the vocabulary's own sentence.
 *
 * NOT THE PRODUCT COUNT, for the reason above and one more: `products` is the
 * single most volatile field on a topic, and a card claiming "12 products"
 * over a topic that has grown to forty is the site being caught out by its
 * own cache.
 */
export function topicCopy(value: string, label: string, description: string): OgCopy {
  return {
    kind: "topic",
    title: ogLine(label, OG_TITLE_MAX),
    subtitle: ogLine(description, OG_SUBTITLE_MAX),
    monogram: { initials: initialsOf(value), hue: hueFor(value) },
    alt: `${label} on openproduct`,
    mark: null,
  };
}

/**
 * The maker card.
 *
 * THE HANDLE IS THE NAME, and the display name is the subtitle rather than
 * the other way round — `/@handle` is the address, the handle is what a
 * reader will type, and I3 keeps a platform display name off a public page
 * entirely. A maker who never authored one gets the handle alone rather than
 * an empty second line.
 */
export function makerCopy(
  handle: string,
  displayName: string | null,
  /** PE2 — `makerCardMark(doc.marks)`: the first mark earned, or null. */
  mark: string | null = null,
): OgCopy {
  const base = `@${handle} on openproduct`;
  return {
    kind: "maker",
    title: ogLine(`@${handle}`, OG_TITLE_MAX),
    subtitle: displayName ? ogLine(displayName, OG_SUBTITLE_MAX) : null,
    monogram: { initials: initialsOf(handle), hue: hueFor(handle) },
    alt: mark ? `${base} · ${mark}` : base,
    mark,
  };
}

/**
 * A day's board.
 *
 * NO TILE: a day is not a thing with a logo, and a monogram hashed from
 * `2026-09-07` would be a coloured square pretending to be an identity. The
 * kicker and the date carry it.
 */
export function dayCopy(longLabel: string, meaning: string): OgCopy {
  return {
    kind: "day",
    title: ogLine(longLabel, OG_TITLE_MAX),
    // THE FIRST SENTENCE, not the first 96 characters. `BOARD_MEANING` is a
    // paragraph that spends its second and third sentences on the integrity
    // rule; cutting it by length lands mid-clause on "Only endorsements
    // from…", which reads as a caveat with its condition missing. The first
    // sentence is complete and is the one that says what the page is.
    subtitle: ogLine(firstSentence(meaning), OG_SUBTITLE_MAX),
    monogram: null,
    alt: `Launches on ${longLabel}`,
    mark: null,
  };
}

/**
 * The site's own sentence, and it is the one already in the root layout's
 * `description`. Named here so the card and the meta tag cannot drift into
 * two different claims about what openproduct is.
 */
export const SITE_CARD_DESCRIPTION = "Products built in the open, looking for people.";

/** What the site card shows a reader who cannot see it. */
export const SITE_CARD_ALT = "openproduct — products built in the open, looking for people";

/**
 * QE1 — the list routes' cards (openproduct-worldclass-v2).
 *
 * The audit found six public list routes with no card at all — the
 * leaderboard, the topics index, people, the digest, collections and search
 * — each unfurling as bare text in a timeline while a listing beside it
 * unfurled as a picture. Each now carries a card of its own: the page's
 * heading as the title, the page's own sentence as the subtitle, no tile (a
 * list has no logo — the day card's argument), and nothing that is a number
 * (the site's rule for every card).
 *
 * A REGISTRY, NOT A PARAMETER. The card route takes a key and the copy lives
 * here, so `/og/list/<anything>` cannot be made to render an attacker's
 * sentence over the site's kicker — the same reason the topic card takes a
 * value and looks the label up.
 *
 * THE TEXT IS THE PAGE'S OWN. Where a page's heading or lede is a contract
 * constant, that constant is what the card shows; a card that said something
 * the page does not is a claim with nowhere to check it.
 */
export const TOPICS_DESCRIPTION =
  "Every category a listed product has chosen, with how many products carry it.";

export const LIST_CARDS = {
  leaderboard: { title: "Leaderboard", description: firstSentence(LEADERBOARD_MEANING) },
  topics: { title: "Topics", description: TOPICS_DESCRIPTION },
  people: { title: "People building in the open", description: firstSentence(DIRECTORY_ELIGIBILITY_NOTE) },
  digest: { title: "The digest", description: firstSentence(FEED_DESCRIPTION) },
  collections: { title: "Collections", description: firstSentence(COLLECTIONS_MEANING) },
  search: { title: "Search", description: firstSentence(SEARCH_SCOPE_NOTE) },
  stack: { title: STACKS_TITLE, description: firstSentence(STACKS_MEANING) },
  pricing: { title: PRICING_TITLE, description: firstSentence(PRICING_MEANING) },
  threads: { title: FORUM_TITLE, description: firstSentence(FORUM_MEANING) },
} as const;

export type ListCardKey = keyof typeof LIST_CARDS;

export const LIST_CARD_KEYS = Object.keys(LIST_CARDS) as readonly ListCardKey[];

export function isListCardKey(value: string): value is ListCardKey {
  return Object.prototype.hasOwnProperty.call(LIST_CARDS, value);
}

export function listCopy(key: ListCardKey): OgCopy {
  const { title, description } = LIST_CARDS[key];
  return {
    kind: "list",
    title: ogLine(title, OG_TITLE_MAX),
    subtitle: ogLine(description, OG_SUBTITLE_MAX),
    monogram: null,
    alt: `${title} on openproduct`,
    mark: null,
  };
}

/** The list card's `cardMeta`, or null on a host that knows no origin. */
export function listCardMeta(origin: string | null, key: ListCardKey) {
  return cardMeta(origin, `/og/list/${key}`, listCopy(key).alt);
}

/**
 * The whole `openGraph` + `twitter` block for a list page, ready to spread
 * into its metadata — `{}` on a preview host, so the root layout's default
 * (none there either) is what applies and nothing advertises a broken image.
 */
export function listOpenGraph(origin: string | null, key: ListCardKey) {
  const card = listCardMeta(origin, key);
  if (!card) return {};
  const { title, description } = LIST_CARDS[key];
  return {
    openGraph: { title, description, type: "website" as const, images: card.images },
    twitter: card.twitter,
  };
}

/** The card every other address falls back to. */
export function siteCopy(description: string): OgCopy {
  return {
    kind: "site",
    title: "openproduct",
    subtitle: ogLine(description, OG_SUBTITLE_MAX),
    monogram: null,
    alt: SITE_CARD_ALT,
    mark: null,
  };
}

/**
 * The `openGraph.images` / `twitter` block for a page, or `null`.
 *
 * `null` WHEN THE DEPLOYMENT HAS NO CANONICAL ORIGIN, which is the same gate
 * `alternates.canonical` already sits behind and the same reason: `og:image`
 * must be an absolute URL, a preview host does not know its own public
 * address at build time, and a card advertised at `http://localhost:3000` is
 * worse than no card at all — it is a broken image in somebody's timeline
 * instead of a tidy text unfurl.
 *
 * The card ROUTES exist on every host regardless, so a preview deploy is
 * still the place to look at one: open `/og/product/<slug>` directly.
 */
export function cardMeta(origin: string | null, cardPath: string, alt: string) {
  if (!origin) return null;
  const images = [{ url: `${origin}${cardPath}`, width: OG_WIDTH, height: OG_HEIGHT, alt }];
  // `summary_large_image` is the whole point of RE0: `summary` — which is what
  // the site advertised by omission — crops to a 1:1 thumbnail beside the
  // text, and the audit found it doing exactly that.
  return { images, twitter: { card: "summary_large_image" as const, images } };
}
