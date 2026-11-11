// The README badge (openproduct-worldclass RE4).
//
// The audit's own words for why this exists: an embeddable badge is *"Product
// Hunt's single largest organic growth loop"*. A maker pastes one line into a
// README and every visitor to that repository sees where the product is
// listed — which is the only distribution channel in this epic that costs the
// reader nothing and the product nothing per impression.
//
// ─── IT IS THE ONE SURFACE STRANGERS WILL HOTLINK ─────────────────────────
//
// Everything else here is fetched by somebody looking at openproduct. This is
// fetched by GitHub's image proxy on behalf of anybody reading any repository
// that pasted it, forever, whether or not the product is still listed. Three
// properties follow, and all three are in the code rather than in a runbook:
//
//   NO SUBJECT      it is the same picture for every requester, so it can be
//                   cached anywhere by anyone (WC-4, I6).
//   DIMENSION-LOCKED the SVG carries explicit `width` and `height` and its
//                   text is fitted with `textLength`, so a long slug cannot
//                   make it wider than it says it is — a badge that reflows
//                   its container is a badge a maintainer removes.
//   HARD-CACHED     an hour, and the proxy in front of it caches far longer.
//                   A badge is EXPECTED to lag; that is what separates it
//                   from the social card, which is fetched once and never
//                   again.
//
// ─── AND IT NEVER PRINTS A ZERO ───────────────────────────────────────────
//
// OPC-C: a zero is a claim and a dash is "not measured". A badge has room for
// neither nuance nor a legend, so a listing with nothing counted yet says
// `listed` — which is true, useful, and not a number about somebody's product
// that they then have to explain in their own README.

import type { PublicProfile } from "./index.js";

/** The badge's box. Fixed, and asserted: see the header. */
export const BADGE_HEIGHT = 20;

/** How long a badge may be held. An hour here; GitHub's proxy holds it far
 *  longer, which is the point — a badge that had to be fresh would be a badge
 *  that could not be cached, on the one surface that is hotlinked. */
export const BADGE_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

/** The left half. Always this, so the badge is recognisable at a glance in a
 *  README that has eight of them. */
export const BADGE_LABEL = "openproduct";

/**
 * What the right half says.
 *
 * IN ORDER OF HOW DURABLE IT IS, which is the opposite of how interesting it
 * is, and deliberately so. A launch rank is settled once its day closes and
 * is true forever after — `#3 of 11` is a fact about a day, not a running
 * total. A counted upvote total moves. And a listing with neither says
 * `listed`, never `0`.
 */
export function badgeValue(profile: Pick<PublicProfile, "launch">): string {
  const launch = profile.launch;
  if (launch) return `#${launch.rank} of ${launch.of}`;
  return "listed";
}

/** XML text, escaped. A slug cannot contain `<` or `&`, and this is not a
 *  reason to interpolate one unescaped into a document served to the world. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A rough advance width per character at 11px, in the badge's own font stack.
 *
 * ROUGH IS FINE, AND THAT IS THE TRICK. Shields.io ships a font-metrics table
 * because it has to place text it cannot measure; this places its text with
 * `textLength`, which tells the renderer the exact width to fit the glyphs
 * into. So the estimate only has to be close enough that the fitting does not
 * look stretched — and being wrong by a pixel costs nothing, where being wrong
 * without `textLength` would cost the badge its box.
 *
 * 6.15 RATHER THAN A ROUNDER NUMBER, because it was measured rather than
 * guessed: the first draft used 6.6 and the rendered badge came out visibly
 * loose beside a shields.io neighbour — `textLength` had faithfully spread
 * eleven characters across the eight percent of extra room the estimate asked
 * for. The fitting cannot be wrong, which means the estimate shows up as
 * TRACKING rather than as overflow, and that is the only way to see it.
 */
const CHAR_WIDTH = 6.15;

function cellWidth(text: string): number {
  return Math.round(text.length * CHAR_WIDTH) + 16;
}

/** The badge's total width for a given value — exported so a caller can put
 *  it in an `<img width>` and a test can assert the box is closed. */
export function badgeWidth(value: string): number {
  return cellWidth(BADGE_LABEL) + cellWidth(value);
}

/**
 * The badge itself.
 *
 * ─── COLOURS ARE LITERAL, BECAUSE THIS DOCUMENT HAS NO STYLESHEET ─────────
 *
 * An SVG served as an image gets no CSS from the page embedding it and cannot
 * read `--foreground`. These are the light ramp's ink and card resolved to
 * hex, which is the right ramp: a README renders on GitHub's white by default,
 * and a badge that guessed at dark mode would be wrong half the time in a
 * place it can never correct itself.
 *
 * ─── AND IT CARRIES ITS OWN ACCESSIBLE NAME ───────────────────────────────
 *
 * `role="img"` with a `<title>`, because an `<img>` in a README gets whatever
 * alt text the maker typed and most type none. The badge says what it is even
 * when the markup around it does not.
 */
export function badgeSvg(value: string): string {
  const left = cellWidth(BADGE_LABEL);
  const right = cellWidth(value);
  const width = left + right;
  const title = `${BADGE_LABEL} — ${value}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BADGE_HEIGHT}"`,
    ` viewBox="0 0 ${width} ${BADGE_HEIGHT}" role="img" aria-label="${esc(title)}">`,
    `<title>${esc(title)}</title>`,
    `<rect width="${width}" height="${BADGE_HEIGHT}" rx="4" fill="#252422"/>`,
    `<path fill="#fbfaf8" d="M${left} 0h${right - 4}a4 4 0 0 1 4 4v${BADGE_HEIGHT - 8}a4 4 0 0 1-4 4H${left}z"/>`,
    `<g font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="11">`,
    `<text x="8" y="14" fill="#fbfaf8" textLength="${left - 16}" lengthAdjust="spacingAndGlyphs">${esc(BADGE_LABEL)}</text>`,
    `<text x="${left + 8}" y="14" fill="#252422" textLength="${right - 16}" lengthAdjust="spacingAndGlyphs">${esc(value)}</text>`,
    `</g></svg>`,
  ].join("");
}

/**
 * The line a maker pastes.
 *
 * MARKDOWN, WITH THE LINK, because a badge that is not a link is a picture of
 * a claim. `null` without a canonical origin, for the reason every other
 * absolute URL in this product is gated: a snippet copied off a preview host
 * would put that host in somebody's README permanently.
 */
export function badgeMarkdown(origin: string | null, slug: string, variant: BadgeVariant = "listed"): string | null {
  if (!origin) return null;
  return `[![${BADGE_LABEL}](${origin}${badgeVariantPath(slug, variant)})](${origin}/${slug})`;
}

/** The same thing for a README that is not Markdown. */
export function badgeHtml(
  origin: string | null,
  slug: string,
  value: string,
  variant: BadgeVariant = "listed",
): string | null {
  if (!origin) return null;
  return `<a href="${origin}/${slug}"><img src="${origin}${badgeVariantPath(slug, variant)}" alt="${esc(BADGE_LABEL)}" width="${badgeWidth(value)}" height="${BADGE_HEIGHT}"></a>`;
}

// ─── OB7 — the build's own numbers, as badge variants ───
//
// A build in the open has two facts worth putting in a README beside
// *listed*: where it stands on Most active, and how much landed this week.
// Each is a VARIANT AT ITS OWN PATH (`/badge/{slug}/most-active`,
// `/badge/{slug}/changes`), never a query string: this is the one address
// strangers hotlink, and a route that reads its query is served `no-store`
// to every reader of somebody else's README. The bare `/badge/{slug}` keeps
// saying what it always said, so no README already pasted changes under it.
//
// NEVER A ZERO, NEVER A DASH. A badge cannot carry a footnote, and "0
// changes this week" in a README is the most damaging reading of a number we
// may simply not have read. A variant with nothing true to say falls back to
// *listed*, which is always true of a badge that renders at all.

export const BADGE_VARIANTS = ["listed", "most-active", "changes"] as const;
export type BadgeVariant = (typeof BADGE_VARIANTS)[number];

/** What the snippet's chooser calls each. */
export const BADGE_VARIANT_LABEL: Record<BadgeVariant, string> = {
  listed: "Listed",
  "most-active": "Most active",
  changes: "Changes",
};

export function isBadgeVariant(value: unknown): value is BadgeVariant {
  return typeof value === "string" && (BADGE_VARIANTS as readonly string[]).includes(value);
}

/** Where a variant lives. */
export function badgeVariantPath(slug: string, variant: BadgeVariant): string {
  return variant === "listed" ? `/badge/${slug}` : `/badge/${slug}/${variant}`;
}

/**
 * A variant's right half, from what is known. `rank` is the build's place on
 * Most active (`mostActiveRankOf`), `merges` its observed `merges.7d`; either
 * null is "not known", and the variant says *listed* rather than guess.
 */
export function badgeVariantValue(
  variant: BadgeVariant,
  facts: { profile: Pick<PublicProfile, "launch">; rank: number | null; merges: number | null },
): string {
  if (variant === "most-active" && facts.rank !== null) return `most active #${facts.rank}`;
  if (variant === "changes" && facts.merges !== null && facts.merges > 0) {
    return facts.merges === 1 ? "1 change this week" : `${facts.merges} changes this week`;
  }
  if (variant === "listed") return badgeValue(facts.profile);
  return "listed";
}
