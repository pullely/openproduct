// The media model (openproduct-worldclass MD0, realising WC-3).
//
// There is not one image on this website. The audit read that as a missing
// column; it is a missing plane. This module is the model half — the shape a
// hero, a gallery image and a screenshot are described by, and the rules that
// shape obeys. It stores nothing and renders nothing: MD1 owns the object
// store (gated on WC-C), MD2 and MD3 own the frames.
//
// THE ONE IDEA HERE IS THAT THE KIND IS THE TRUST CLASS.
//
// Every public fact until now has been text, and OPC-2's three classes were
// carried by a label beside a value. An image carries no label — and it is
// the most persuasive artefact this product will ever render. A reader who
// would interrogate "38 commits this week" will not interrogate a screenshot,
// which makes a stale one presented as current OPC-7's failure in the medium
// a reader is least likely to question.
//
// So the split is by provenance, not by shape:
//
//   hero, gallery  AUTHORED — a maker uploaded it. Theirs, never stale, and
//                  it carries no moment because there is no moment to carry.
//   screenshot     OBSERVED — the sweep captured it (MD4). It carries the
//                  moment it was taken, always, and it is WITHDRAWN past its
//                  window rather than frozen.
//
// AND THE TYPE SYSTEM IS WHERE THAT LIVES, not a comment and not a lint rule.
// `MediaFact` is a union of two members whose value type and provenance class
// are fixed together, so "a screenshot in the hero slot" and "an authored
// image carrying an observedAt" are both compile errors. That is the same
// mechanism `provenance.ts` uses for `observed()`'s required `observedAt`,
// and it is here for the same reason: a field's trust class is part of its
// type, not a property discovered while implementing it.
//
// The migration (1820) refuses the same two rows with a CHECK constraint. The
// duplication is deliberate — the day the two share one enforcement is the
// day a refactor publishes a screenshot as somebody's hero.

import type { Fact, Provenance } from "./provenance.js";

// ---------------------------------------------------------------------------
// The four kinds
// ---------------------------------------------------------------------------

/**
 * `logo` joined in openproduct-studio OSD2. Before it the model had no face
 * for a product, so the row tile drew a crop of the hero — a 16:9 marketing
 * image squeezed into 52px, which read as a broken logo on every row.
 */
export const MEDIA_KINDS = ["logo", "hero", "gallery", "screenshot"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** The kinds a maker uploads. Their own work, in their own words. */
export const AUTHORED_MEDIA_KINDS = ["logo", "hero", "gallery"] as const;
export type AuthoredMediaKind = (typeof AUTHORED_MEDIA_KINDS)[number];

/** The kinds something measured. One, today, and the union exists so that
 *  adding a second is an edit here rather than a widened `if`. */
export const OBSERVED_MEDIA_KINDS = ["screenshot"] as const;
export type ObservedMediaKind = (typeof OBSERVED_MEDIA_KINDS)[number];

/**
 * How many gallery images a listing may publish.
 *
 * A ceiling rather than a page size: the gallery is one carousel a reader
 * scrolls through, and the number exists so a listing cannot become an image
 * host. The database enforces it too (1820's trigger), for the reason DQ1
 * wrote down — a future write path that forgets is still a write path.
 */
export const GALLERY_MAX = 8;

/**
 * How long an observed screenshot stands before it is withdrawn.
 *
 * THE SAME THIRTY DAYS AS A REPOSITORY SIGNAL (`observed.ts`), and matching
 * on purpose rather than by accident: both answer "when does a reader stop
 * being entitled to believe this", and two different windows would mean a
 * listing whose licence has been withdrawn still shows a screenshot from the
 * same dead check. If a screenshot ever needs its own window, it gets its own
 * constant and a sentence saying why images rot at a different rate than
 * facts do.
 */
export const SCREENSHOT_STALE_AFTER_DAYS = 30;

// ---------------------------------------------------------------------------
// The asset
// ---------------------------------------------------------------------------

/**
 * One image, as every consumer reads it.
 *
 * `ref` IS OPAQUE. It is not a URL and nothing here treats it as one: MD1
 * decides what a reference resolves to once WC-C is answered, and a model
 * shaped around a store nobody has chosen would be a guess wearing a type.
 *
 * `width` and `height` ARE NOT OPTIONAL, and that is a performance decision
 * rather than a completeness one. openproduct's CLS is 0.0000 and MD is how
 * that gets spent; an image with unknown dimensions is the classic way to
 * lose it. A renderer cannot omit what it cannot fail to have.
 */
export interface MediaAsset {
  readonly id: string;
  readonly kind: MediaKind;
  /** Opaque. MD1 resolves it; nothing before MD1 may parse it. */
  readonly ref: string;
  /**
   * The accessible name. Required, never blank — see `mediaViolations`.
   *
   * NULLABLE ALT WAS THE OBVIOUS SHAPE AND IS REFUSED. A nullable field makes
   * "no alt text" a state the model has, and a state the model has is a state
   * that ships: the first decorative hero with no alt would make the whole
   * plane invisible to a screen reader and pass every test we own.
   */
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  /** Order within the kind. Always 0 for the kinds there is only one of. */
  readonly position: number;
}

export type AuthoredAsset = MediaAsset & { readonly kind: AuthoredMediaKind };
export type ObservedAsset = MediaAsset & { readonly kind: ObservedMediaKind };

/** A maker's own image. `provenance.class` is fixed to `authored` BY THE
 *  TYPE, so an authored asset cannot be given a moment it never had. */
export interface AuthoredMediaFact {
  readonly value: AuthoredAsset;
  readonly provenance: Extract<Provenance, { class: "authored" }>;
}

/** A capture. `provenance.class` is fixed to `observed`, which is what makes
 *  `observedAt` unforgettable — `provenance.ts`'s constructor requires it. */
export interface ObservedMediaFact {
  readonly value: ObservedAsset;
  readonly provenance: Extract<Provenance, { class: "observed" }>;
}

/**
 * One media row on the wire.
 *
 * A UNION, NOT `Fact<MediaAsset>`. The wider type would let a screenshot be
 * authored and a hero be observed, and both are exactly the mistake WC-3
 * exists to prevent. Both members are assignable to `Fact<MediaAsset>`, so a
 * consumer that only wants the value still reads one shape.
 */
export type MediaFact = AuthoredMediaFact | ObservedMediaFact;

/** Structural proof the union stays a `Fact` — a compile-time assertion, so
 *  widening one and not the other is caught here rather than at a call site. */
const _isFact: (m: MediaFact) => Fact<MediaAsset> = (m) => m;
void _isFact;

// ---------------------------------------------------------------------------
// The only two ways to build one
// ---------------------------------------------------------------------------

/**
 * A maker's image. Always `authored`, always by the maintainer — a
 * contributor does not upload to somebody else's listing, and the day one can
 * this gains an argument rather than a cast.
 */
export function authoredMedia(asset: AuthoredAsset): AuthoredMediaFact {
  return { value: asset, provenance: { class: "authored", by: "maintainer" } };
}

/**
 * A capture of the listing's own live address.
 *
 * THE SOURCE IS `declared_url`, and picking it was the modelling question
 * this milestone actually had to answer. The four sources that existed all
 * describe a REPOSITORY read: `linked_repo` promises the platform's GitHub
 * App, `declared_repo` a public repository URL a maintainer typed, `manifest`
 * a component manifest, `operator` a person. A screenshot of a running site
 * is none of those, and reaching for the nearest one would have been exactly
 * the overstatement PV0 found and corrected in the catalog — the API claiming
 * a stronger observation than it had, one plane over.
 */
export function observedScreenshot(asset: ObservedAsset, observedAt: string): ObservedMediaFact {
  return {
    value: asset,
    provenance: { class: "observed", source: "declared_url", observedAt },
  };
}

// ---------------------------------------------------------------------------
// Reading a listing's media
// ---------------------------------------------------------------------------

/** The hero, or null. A screenshot can never be returned here: the type of
 *  the thing being searched for says so. */
export function heroOf(media: readonly MediaFact[]): AuthoredMediaFact | null {
  return media.find((m): m is AuthoredMediaFact => m.value.kind === "hero") ?? null;
}

/** The logo, or null (openproduct-studio OSD2). */
export function logoOf(media: readonly MediaFact[]): AuthoredMediaFact | null {
  return media.find((m): m is AuthoredMediaFact => m.value.kind === "logo") ?? null;
}

/**
 * What a TILE draws: the logo's asset, and nothing else about it.
 *
 * THE LOGO, NEVER THE HERO (openproduct-studio OSD-4). MD3 drew the hero
 * here, cropped square at 52px, and a crop of a screenshot is not a face —
 * it read as a logo that failed to load, on every row of the front page.
 * `null` when the listing has no logo, and the tile keeps its monogram: no
 * other image is promoted, because the tile is the product's face and a
 * maker who chose no logo chose no face.
 *
 * A DERIVATIVE where one exists: the row renders this through the smallest
 * standard width (`MEDIA_THUMBNAIL_WIDTH`), so twenty-four rows cost
 * twenty-four small files (WC-5).
 *
 * THE ALT IS THE LOGO'S, carried so a consumer that renders the thumbnail
 * as more than decoration has the maker's words; the row itself draws it
 * beside the name and marks it decorative, as the monogram is.
 */
export interface MediaThumbnail {
  readonly ref: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export function thumbnailOf(media: readonly MediaFact[]): MediaThumbnail | null {
  const logo = logoOf(media);
  if (!logo) return null;
  const { ref, alt, width, height } = logo.value;
  return { ref, alt, width, height };
}

/** The gallery, in the maker's order. */
export function galleryOf(media: readonly MediaFact[]): AuthoredMediaFact[] {
  return media
    .filter((m): m is AuthoredMediaFact => m.value.kind === "gallery")
    .sort((a, b) => a.value.position - b.value.position);
}

/** The capture, or null. */
export function screenshotOf(media: readonly MediaFact[]): ObservedMediaFact | null {
  return media.find((m): m is ObservedMediaFact => m.value.kind === "screenshot") ?? null;
}

/**
 * Whether a capture has aged out of its window.
 *
 * WITHDRAWN, NOT FROZEN (OPC-7). A screenshot past its window is not shown as
 * a current picture of anything — the frame says the reading stands
 * withdrawn, exactly as a stale repository signal does. Deliberately the same
 * arithmetic as `observed.ts`'s `signalWithdrawn`, kept here rather than
 * imported so that changing one window does not silently change the other.
 */
export function screenshotWithdrawn(observedAt: string, now: Date): boolean {
  const at = Date.parse(observedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at > SCREENSHOT_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// What a type cannot say
// ---------------------------------------------------------------------------

/**
 * The rules the type system cannot hold, in one place.
 *
 * The union above makes a mis-classed row unconstructible. It cannot count:
 * "at most one hero", "at most eight gallery images", "no two images in the
 * same slot" and "alt text is not blank" are all statements about a SET, and
 * a type describes one member. The database refuses each of them too (1820);
 * this is the same list, where a handler can check it before writing and a
 * test can prove it without an engine.
 *
 * Returns the violations rather than throwing: MD1's upload path wants to
 * tell a maker what is wrong with their gallery, not fail on the first thing.
 */
export function mediaViolations(media: readonly MediaFact[]): string[] {
  const out: string[] = [];
  const logos = media.filter((m) => m.value.kind === "logo");
  const heroes = media.filter((m) => m.value.kind === "hero");
  const shots = media.filter((m) => m.value.kind === "screenshot");
  const gallery = media.filter((m) => m.value.kind === "gallery");

  if (logos.length > 1) out.push(`A listing has at most one logo; found ${logos.length}`);
  if (heroes.length > 1) out.push(`A listing has at most one hero; found ${heroes.length}`);
  if (shots.length > 1) out.push(`A listing has at most one screenshot; found ${shots.length}`);
  if (gallery.length > GALLERY_MAX) {
    out.push(`A gallery holds at most ${GALLERY_MAX} images; found ${gallery.length}`);
  }

  const slots = new Set<string>();
  for (const m of media) {
    const { kind, position, alt, width, height } = m.value;
    // Blank, not just empty: whitespace is what a form posts when somebody
    // tabs past the field, and it reads as present to every naive check.
    if (alt.trim().length === 0) out.push(`${kind} media must carry alt text`);
    if (width <= 0 || height <= 0) out.push(`${kind} media must carry positive dimensions`);
    if (position < 0) out.push(`${kind} media cannot sit at a negative position`);
    if (kind !== "gallery" && position !== 0) {
      out.push(`${kind} media sits at position 0; there is only one of it`);
    }
    const slot = `${kind}:${position}`;
    if (slots.has(slot)) out.push(`Two ${kind} images claim position ${position}`);
    slots.add(slot);
  }
  return out;
}

/**
 * The alt text a capture carries.
 *
 * GENERATED, AND IT SAYS SO. A screenshot's accessible name is not a
 * description of the product — nothing here has read the picture — it is a
 * statement of what the image IS: an automated capture of an address, taken
 * on a date. A reader using a screen reader gets the same sentence the frame
 * gives a reader using their eyes, which is the whole of WC-3 for somebody
 * who cannot see the hairline border.
 */
export function screenshotAlt(name: string, observedAt: string): string {
  const day = observedAt.slice(0, 10);
  return `An automated screenshot of ${name}, captured on ${day}. Not a picture chosen by its makers.`;
}
