// What a machine reads off a listing page (openproduct-commons DS4).
//
// A SECOND MACHINE-READABLE SURFACE, and the reason that is defensible: CT2's
// API is for somebody who wants the catalog, and this is for a crawler that
// already has one page in front of it. They must never DISAGREE, so this is
// built from the same public projection the page renders and nothing else —
// no second read, no field the page does not show.
//
// THE RULE THAT MATTERS MOST HERE IS A PROHIBITION. Structured data is the
// one place in this product where inventing a number is nearly free and
// immediately rewarded: `aggregateRating` with a made-up count buys stars in
// a search result, and nobody who sees them can check. So there is no rating
// in this document, there is no `interactionStatistic`, and when EN2 ships a
// real endorsement total there will still be no rating — an endorsement is
// not a review, a person who endorsed did not score anything out of five, and
// dressing one up as the other would be a lie told in a format designed to be
// believed without being read. `NO_RATING_NOTE` says so where a future author
// will be standing when they consider adding one.
//
// EVERY VALUE HERE IS EITHER IDENTITY OR SOMEBODY'S OWN WORDS. Nothing
// derived, nothing observed, nothing counted. That is not a coincidence: a
// derived value owes a reader the formula that produced it (OPC-4), and JSON
// -LD has nowhere to put one.

import type { PublicProfile } from "./index.js";
import { logoOf } from "./media.js";
import { mediaPath } from "./media-serving.js";

/**
 * Why this document carries no rating, and never will.
 *
 * Exported so a test can assert the note exists rather than asserting the
 * absence of a field somebody could add tomorrow — an absence is only a rule
 * if the reason is written down beside it.
 */
export const NO_RATING_NOTE =
  "openproduct publishes no ratings. An endorsement is a person putting their name to a product, not a score, and there is nothing here to average.";

/** SPDX ids resolve to a canonical licence page. */
function licenceUrl(spdx: string): string {
  return `https://spdx.org/licenses/${encodeURIComponent(spdx)}.html`;
}

/**
 * The JSON-LD for one listing.
 *
 * `SoftwareSourceCode` rather than `SoftwareApplication`: what this directory
 * lists is a product whose source is public and whose door is open, and the
 * type that says so is the one about code. A listing with no repository is
 * still valid — `codeRepository` is simply absent, which is the honest shape
 * for "they have not linked one".
 *
 * `origin` may be null when no public apex is configured, in which case every
 * URL is omitted rather than emitted relative: a relative `@id` in a document
 * whose whole purpose is to be consumed away from the page is worse than no
 * `@id` at all.
 */
export function listingJsonLd(
  profile: PublicProfile,
  origin: string | null,
  /**
   * openproduct-studio OSD3 — the absolute origin media is served from (the
   * public API's), for `image`. Null or absent means no `image`, by the same
   * rule as `url`: a relative address in a document read away from the page
   * resolves against whoever quoted it.
   */
  mediaBase: string | null = null,
): Record<string, unknown> {
  const url = origin ? `${origin}/${profile.slug}` : null;
  // THE MAKER'S OWN LOGO, as the original — identity, like every other value
  // here, and the maker's choice rather than anything derived. Never the hero
  // or the capture: `image` on a SoftwareSourceCode is what a result shows
  // beside the name, which is the tile's job (openproduct-studio OSD-4).
  const logo = logoOf(profile.media);
  const image = logo && mediaBase ? `${mediaBase.replace(/\/+$/, "")}${mediaPath(logo.value.ref)}` : null;
  const authors = profile.maintainers
    // A NAME OR NOTHING. The page renders "A maintainer" where nobody has
    // written a name, which is right for a reader — but emitting that string
    // as a `Person.name` would put a placeholder into a machine-readable
    // record of who made something, and a machine has no way to tell it is
    // one. Somebody who has not named themselves is simply not named here.
    .map((m) => ({ name: m.displayName?.trim(), handle: m.handle }))
    .filter((m): m is { name: string; handle: string | null } => Boolean(m.name?.length))
    .map((m) => ({
      "@type": "Person",
      name: m.name,
      // CG4 — XP-5's machine-readable half. A `url` is emitted only when the
      // handle resolves to a page, which is the same biconditional the page
      // renders on; a `Person.url` pointing at a 404 is a dead link that no
      // reader will ever see and every crawler will.
      //
      // ORIGIN-GATED TOO: this document is consumed away from the page, so a
      // relative `/@ada` would resolve against whatever host quoted it. No
      // origin configured means no url, exactly as the listing's own `@id`.
      ...(m.handle && origin ? { url: `${origin}/@${m.handle}` } : {}),
    }));

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: profile.slug,
    ...(url ? { url, "@id": url } : {}),
    ...(profile.tagline ? { description: profile.tagline } : {}),
    ...(image ? { image } : {}),
    // Observed at publish (OD-F) and rendered on the page as such. In this
    // document it is a bare value, which is exactly why nothing DERIVED may
    // follow it here: a licence is a fact about a repository that anyone can
    // check against the repository, and a ranking is not.
    ...(profile.licence ? { license: licenceUrl(profile.licence) } : {}),
    ...(profile.repoUrl ? { codeRepository: profile.repoUrl } : {}),
    ...(profile.liveUrl ? { installUrl: profile.liveUrl } : {}),
    // The maintainer's own words for what it is built with.
    ...(profile.stack.length > 0 ? { programmingLanguage: profile.stack } : {}),
    ...(profile.category ? { applicationCategory: profile.category } : {}),
    ...(profile.publishedAt ? { datePublished: profile.publishedAt } : {}),
    ...(authors.length > 0 ? { author: authors } : {}),
    // NO `aggregateRating`. NO `interactionStatistic`. See the module header
    // and `NO_RATING_NOTE`; this comment is here because this object literal
    // is where somebody would add one.
  };
}

/**
 * The trail above a page (openproduct-worldclass RE1).
 *
 * ─── WHY A CRAWLER GETS ONE AND A READER MOSTLY DOES NOT ──────────────────
 *
 * This site draws breadcrumbs on two surfaces and no more, because its
 * hierarchy is one level deep nearly everywhere and a trail with one rung is
 * furniture. A crawler's problem is the opposite one: it arrives at
 * `/topics/devtools` from a search result with no idea that `/topics` exists,
 * and a `BreadcrumbList` is the only way this page can say so in a form the
 * result page will use.
 *
 * ─── IDENTITY ONLY, LIKE EVERY OTHER VALUE IN THIS FILE ───────────────────
 *
 * A name and an address per rung. Nothing derived, nothing counted, nothing
 * observed — the module header's rule, and a trail is the easiest place to
 * forget it because "3 products" would fit so neatly in a rung's name.
 *
 * ORIGIN-GATED, for the reason `listingJsonLd` gives: a relative `item` in a
 * document whose whole purpose is to be consumed away from the page resolves
 * against whatever host quoted it. `null` is the honest answer on a preview
 * deployment that does not know its own public address.
 */
export function breadcrumbJsonLd(
  trail: readonly { readonly name: string; readonly path: string }[],
  origin: string | null,
): Record<string, unknown> | null {
  if (!origin || trail.length < 2) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((rung, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: rung.name,
      item: `${origin}${rung.path}`,
    })),
  };
}

/**
 * A page that is a list of other pages (openproduct-worldclass RE1).
 *
 * `CollectionPage` with an `ItemList` inside it, for the topic pages and the
 * leaderboard — surfaces whose whole content is an ordered set of listings.
 *
 * ─── `numberOfItems` IS THE ONE COUNT IN THIS FILE, AND IT CANNOT LIE ─────
 *
 * Every other value here is identity or somebody's own words, because a
 * derived value owes a reader the formula that produced it (OPC-4) and JSON-LD
 * has nowhere to put one. A list's length is the exception that proves it: it
 * is not derived from anything, it IS the list, and it is computed from the
 * same array the page renders — `paths.length`, not a number passed in beside
 * them. **WC-7** in the machine-readable layer: a counter that could disagree
 * with its list is a counter that eventually does, and the way to make that
 * impossible is to give it nothing else to count.
 *
 * ─── AND STILL NO RATING ──────────────────────────────────────────────────
 *
 * A leaderboard is the single most tempting place on this site to emit
 * `aggregateRating` — it is literally a ranked list with numbers beside it.
 * The numbers are endorsements, an endorsement is not a review, and nothing
 * here is out of five. See `NO_RATING_NOTE`.
 */
export function collectionPageJsonLd(
  page: {
    readonly name: string;
    readonly description: string;
    readonly path: string;
    /** The listings the page renders, in the order it renders them. */
    readonly paths: readonly string[];
  },
  origin: string | null,
): Record<string, unknown> | null {
  if (!origin) return null;
  const url = `${origin}${page.path}`;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    url,
    name: page.name,
    description: page.description,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.paths.length,
      itemListElement: page.paths.map((path, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${origin}${path}`,
      })),
    },
    // NO `aggregateRating`. NO `interactionStatistic`. NO `ratingValue`.
    // This literal is where somebody would add one to a leaderboard.
  };
}

/**
 * The field names this product will not emit, in any document, ever.
 *
 * A LIST RATHER THAN A SENTENCE, so `structured-data.test.ts` can walk every
 * builder's output against it instead of testing the one type that existed
 * when the rule was written. RE1 added two types; the rule had to grow a way
 * of covering types that do not exist yet, and this is it.
 */
export const FORBIDDEN_JSONLD_FIELDS = [
  "aggregateRating",
  "ratingValue",
  "ratingCount",
  "reviewCount",
  "bestRating",
  "worstRating",
  "review",
  "interactionStatistic",
] as const;
