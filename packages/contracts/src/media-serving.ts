// Media storage and serving — the contract half (openproduct-worldclass MD1).
//
// MD0 made `ref` opaque and said MD1 would resolve it. This is the resolution:
// what a reference looks like, where it is served from, which derivative
// widths exist, and the ceilings the upload path enforces — the numbers a
// page, the OpenAPI document and the gateway all cite from ONE place.
//
// ─── CONTENT-ADDRESSED, AND THAT IS THE WHOLE CACHE STORY ────────────────
//
// A reference is the SHA-256 of the bytes plus the format the bytes were
// sniffed as. Two consequences, both deliberate:
//
//   1. A served asset is immutable by construction. The same reference can
//      never resolve to different bytes, so the gateway sends
//      `cache-control: public, max-age=31536000, immutable` and the edge
//      holds it for a year. That is OPC-1's "one cacheable document" applied
//      to the medium that would otherwise spend WC-5's budget on every view.
//   2. Two makers uploading the same file share one object. Deleting a row
//      therefore does NOT delete the object — the bytes may be somebody
//      else's hero. Orphan collection is a retention concern (OS3), not an
//      upload-path one.
//
// ─── THREE WIDTHS, ONE FORMAT, EXPLICIT DIMENSIONS ───────────────────────
//
// WC-5's rule for the media plane, as numbers. Derivatives are generated at
// upload (WC-C — reads outnumber uploads by orders of magnitude, and deriving
// on read puts image work on the request path the budget measures) and only
// at widths BELOW the original's: nothing here upscales, because an upscaled
// derivative is a bigger file that carries no more picture.
//
// A derivative's height is computed from the original's stored dimensions,
// which is why 1820 stores them: a page lays out `<img width height>` for
// every width without probing a single file, and CLS stays at the 0.0000 OPP
// measured.
//
// ─── WHAT A DERIVATIVE'S ABSENCE MEANS ───────────────────────────────────
//
// Image Resizing is a zone feature. Where the zone does not have it, or where
// a resize failed, the gateway serves THE ORIGINAL at a derivative's address
// rather than a 404. A missing derivative costs bytes; a broken image costs
// the reader the picture. The page may therefore reference every width
// `derivativeWidths` names without knowing which ones exist.

/** The widths a derivative is generated at, ascending. */
/**
 * MD3 ADDED 160, and the reason is arithmetic. A feed row draws the hero at
 * 52 CSS pixels; at a device ratio of 2 the browser wants ~104, and the
 * smallest width MD1 offered was 400 — four times the pixels, ~15 KB a
 * row, ~360 KB for a front page of twenty-four, against WC-5's ≤400 KB of
 * assets for the whole page. 160 is the thumbnail's width: a few KB a row.
 */
export const MEDIA_WIDTHS = [160, 400, 800, 1600] as const;
/** The width a row's tile asks for (MD3). The smallest, by construction. */
export const MEDIA_THUMBNAIL_WIDTH: MediaWidth = 160;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** The one derivative format. */
export const MEDIA_DERIVATIVE_FORMAT = "webp";

/**
 * The formats an upload may arrive in, keyed by the extension a reference
 * carries. SVG is refused absolutely (it is a document with a script
 * surface, not a picture); GIF is refused for now (an animated hero is a
 * budget nobody agreed to). AVIF can join once Image Resizing is confirmed
 * on the zone; the sniff would need its ISOBMFF walk.
 */
export const MEDIA_FORMATS = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
} as const;
export type MediaFormat = keyof typeof MEDIA_FORMATS;

/** The ceilings, enforced at the gateway BEFORE the body is read where they
 *  can be, and on the buffered bytes where they cannot. */
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_MIN_WIDTH = 400;
export const MEDIA_MIN_HEIGHT = 200;
export const MEDIA_MAX_SIDE = 8192;
/**
 * A LOGO'S SHAPE (openproduct-studio OSD-3). The 400×200 floor is a hero's —
 * a banner — and it refuses every ordinary logo. A logo is at least 128 on a
 * side and near square: between 4:5 and 5:4, so a mark with a little padding
 * on one axis passes and a wordmark banner does not. A tile draws it
 * `object-contain`, so what passes is never cropped.
 */
export const LOGO_MIN_SIDE = 128;
export const LOGO_MAX_RATIO = 1.25;

/**
 * Whether an image's dimensions fit its kind — the one rule both the gateway
 * (on the sniffed bytes) and core (on the row) apply, so the two cannot
 * disagree about what a logo is. `null` when it fits.
 */
export function mediaShapeRefusal(
  kind: string,
  width: number,
  height: number,
): "too_small" | "too_large" | "logo_too_small" | "logo_not_square" | null {
  if (width > MEDIA_MAX_SIDE || height > MEDIA_MAX_SIDE) return "too_large";
  if (kind === "logo") {
    if (width < LOGO_MIN_SIDE || height < LOGO_MIN_SIDE) return "logo_too_small";
    const ratio = width / height;
    if (ratio > LOGO_MAX_RATIO || ratio < 1 / LOGO_MAX_RATIO) return "logo_not_square";
    return null;
  }
  if (width < MEDIA_MIN_WIDTH || height < MEDIA_MIN_HEIGHT) return "too_small";
  return null;
}

/** Alt text is required (MD0) and bounded: it is an accessible NAME. */
export const MEDIA_ALT_MAX = 300;

/**
 * A reference: 64 lowercase hex of SHA-256, a dot, a format.
 *
 * Strict on purpose — this string becomes a URL segment and an R2 key, and
 * a reference that could carry a slash or a dot-dot is a reference that can
 * name somebody else's object.
 */
export const MEDIA_REF_RE = /^([0-9a-f]{64})\.(png|jpg|webp)$/;

export interface ParsedRef {
  readonly hash: string;
  readonly format: MediaFormat;
}

export function parseMediaRef(ref: string): ParsedRef | null {
  const m = MEDIA_REF_RE.exec(ref);
  if (!m) return null;
  return { hash: m[1]!, format: m[2] as MediaFormat };
}

/**
 * The public path an asset is served at — the original, or one derivative.
 *
 * A PATH, NOT A URL. The web layer prefixes the API origin it already knows
 * (`NEXT_PUBLIC_OPENPRODUCT_API_URL`); the gateway matches the same path.
 * One function, two readers, so the address cannot be spelled two ways.
 */
export function mediaPath(ref: string, width?: MediaWidth): string {
  const parsed = parseMediaRef(ref);
  if (!parsed) throw new Error(`Not a media reference: ${ref}`);
  if (width === undefined) return `/v1/media/${ref}`;
  return `/v1/media/${parsed.hash}/w${width}.${MEDIA_DERIVATIVE_FORMAT}`;
}

/** The widths a page may ask for: every standard width BELOW the original's.
 *  Nothing upscales. An asset narrower than the smallest width has none. */
export function derivativeWidths(asset: { readonly width: number }): MediaWidth[] {
  return MEDIA_WIDTHS.filter((w) => w < asset.width);
}

/** A derivative's height, from the ORIGINAL's stored dimensions. Rounded, never
 *  zero — a one-pixel-high strip is still laid out at one pixel. */
export function derivativeHeight(
  asset: { readonly width: number; readonly height: number },
  width: number,
): number {
  return Math.max(1, Math.round((asset.height * width) / asset.width));
}

/**
 * A `srcset` for one asset, from the widths that exist for it plus the
 * original. The page picks; the browser chooses.
 */
export function mediaSrcSet(asset: { readonly ref: string; readonly width: number }): string {
  const parts = derivativeWidths(asset).map((w) => `${mediaPath(asset.ref, w)} ${w}w`);
  parts.push(`${mediaPath(asset.ref)} ${asset.width}w`);
  return parts.join(", ");
}

/** What the upload path refuses, and the words it uses. Named here so the
 *  gateway and its tests agree on the code AND the sentence. */
export const MEDIA_REFUSALS = {
  length_required: "The upload must declare its length.",
  payload_too_large: `An image is at most ${Math.round(MEDIA_MAX_BYTES / 1024 / 1024)} MB.`,
  unsupported_media_type: "Only PNG, JPEG and WebP images are accepted. The bytes decide, not the header.",
  too_small: `An image is at least ${MEDIA_MIN_WIDTH}×${MEDIA_MIN_HEIGHT} pixels.`,
  too_large: `An image is at most ${MEDIA_MAX_SIDE} pixels on a side.`,
  logo_too_small: `A logo is at least ${LOGO_MIN_SIDE}×${LOGO_MIN_SIDE} pixels.`,
  logo_not_square: "A logo is square, or close to it — between 4:5 and 5:4.",
  storage_unavailable: "Media storage is not available in this environment.",
} as const;
export type MediaRefusal = keyof typeof MEDIA_REFUSALS;
