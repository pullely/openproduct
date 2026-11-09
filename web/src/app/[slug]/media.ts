/**
 * The listing's media panel, decided (openproduct-worldclass MD2).
 *
 * PURE, AND SEPARATE FROM THE PAGE, for the reason `sections.ts` gives about
 * itself: the web test lane is module-level and has no JSX, so a rule inside a
 * `.tsx` is a rule no test here can hold. Everything the panel DECIDES — which
 * rows render, which are withdrawn, what an `<img>` is given — is here; the
 * component only draws it.
 *
 * ─── WHAT RENDERS, AND WHAT DOES NOT ────────────────────────────────────────
 *
 * The hero above the fold, the gallery under it in the maker's order, and the
 * automated screenshot last, in its own frame. A listing with no media renders
 * NO PANEL — not an empty frame, not a placeholder, and (MD-3) no penalty
 * anywhere: the monogram in the header is the stand-in and it says so with its
 * dotted ring. A screenshot past its window is WITHDRAWN (OPC-7): it is not
 * rendered at all, because a stale picture presented as current is the
 * failure in the medium a reader is least likely to question, and a frame
 * saying "this is old" under a picture is still a picture being looked at.
 *
 * ─── EVERY IMAGE CARRIES ITS DIMENSIONS ─────────────────────────────────────
 *
 * openproduct's CLS is 0.0000 and this panel is how that gets spent. The model
 * made `width`/`height` non-optional so a renderer cannot omit them; this
 * module hands them through on every source, derivative or original, and the
 * component puts them on the element. Nothing here can draw an `<img>` of
 * unknown size.
 *
 * ─── THE ADDRESSES ARE THE GATEWAY'S ────────────────────────────────────────
 *
 * `mediaPath` and `mediaSrcSet` in the contract spell PATHS; this module
 * prefixes the API origin the page already reads from, so the browser fetches
 * bytes from the same place the server fetched the document. Same origin as
 * every other API call: the "no third party" budget stays true.
 */

import {
  galleryOf,
  heroOf,
  mediaPath,
  mediaSrcSet,
  screenshotOf,
  screenshotWithdrawn,
  type AuthoredMediaFact,
  type MediaAsset,
  type MediaFact,
  type ObservedMediaFact,
} from "@openproduct/contracts";

/** What the panel will draw, in order. Absent things are `null` or `[]`. */
export interface MediaPanelPlan {
  readonly hero: AuthoredMediaFact | null;
  readonly gallery: readonly AuthoredMediaFact[];
  /** `null` when there is none OR when the capture is past its window. */
  readonly screenshot: ObservedMediaFact | null;
}

/** Decide the panel. `now` is the page's render moment, passed in so the
 *  rule reads no clock of its own and a test can set the day. */
export function mediaPanelOf(media: readonly MediaFact[], now: Date): MediaPanelPlan {
  const screenshot = screenshotOf(media);
  return {
    hero: heroOf(media),
    gallery: galleryOf(media),
    screenshot:
      screenshot && !screenshotWithdrawn(screenshot.provenance.observedAt, now) ? screenshot : null,
  };
}

/** Nothing to draw — the page renders no panel and no frame. */
export function mediaPanelIsEmpty(plan: MediaPanelPlan): boolean {
  return plan.hero === null && plan.gallery.length === 0 && plan.screenshot === null;
}

/**
 * The `sizes` each slot renders at, so the browser picks the smallest
 * derivative that fills it. The hero fills the main column, which is the
 * viewport minus the page gutter below `lg` and a fixed column above it;
 * the gallery's thumbnails are a fixed height, so their width follows the
 * aspect ratio — the widest a 160px-high thumbnail gets is about 300px.
 */
export const HERO_SIZES = "(min-width: 1024px) 680px, calc(100vw - 32px)";
export const GALLERY_SIZES = "300px";
export const SCREENSHOT_SIZES = HERO_SIZES;

/** What one `<img>` is given. Every field required; nothing optional. */
export interface ImageSource {
  readonly src: string;
  readonly srcSet: string;
  readonly sizes: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/** Prefix every address in a srcset with the API origin. */
function absoluteSrcSet(asset: Pick<MediaAsset, "ref" | "width">, apiBase: string): string {
  return mediaSrcSet(asset)
    .split(", ")
    .map((entry) => `${apiBase}${entry}`)
    .join(", ");
}

export function imageSourceOf(asset: MediaAsset, apiBase: string, sizes: string): ImageSource {
  const base = apiBase.replace(/\/+$/, "");
  return {
    src: `${base}${mediaPath(asset.ref)}`,
    srcSet: absoluteSrcSet(asset, base),
    sizes,
    width: asset.width,
    height: asset.height,
    alt: asset.alt,
  };
}

/** The screenshot frame's caption, from the row's own moment. The day only:
 *  a capture is dated, not timestamped, on a page a reader scrolls. */
export function screenshotCaption(observedAt: string): { readonly day: string; readonly iso: string } {
  return { day: observedAt.slice(0, 10), iso: observedAt };
}

export const GALLERY_LABEL = "Gallery";
export const SCREENSHOT_CAPTION_LEAD = "An automated screenshot of the live address, captured";
export const SCREENSHOT_CAPTION_TAIL = "Not a picture chosen by its makers.";

/**
 * The next free gallery slot — the smallest position no row holds (MD2's
 * studio step posts it). Smallest rather than `length`: a gallery of
 * positions 0, 1 and 3 has a hole at 2, and filling the hole keeps the
 * maker's order readable rather than appending a 4 behind a gap.
 */
export function nextGalleryPosition(media: readonly MediaFact[]): number {
  const taken = new Set(galleryOf(media).map((g) => g.value.position));
  let position = 0;
  while (taken.has(position)) position += 1;
  return position;
}
