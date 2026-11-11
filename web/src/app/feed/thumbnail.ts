/**
 * The row's tile picture, decided (openproduct-worldclass MD3).
 *
 * A DERIVATIVE, NEVER THE HERO. The tile is 52 CSS pixels; the row asks for
 * the thumbnail width (160, MD3's addition to the standard widths) and for
 * nothing else — no `srcset` climbing to the original, because a front page
 * of twenty-four rows would then cost twenty-four heroes on a dense screen,
 * and WC-5 budgets the page's assets at 400 KB. Where Image Resizing is off
 * the gateway answers the thumbnail address with the original's bytes (MD1's
 * fallback), which costs more and looks the same; the address is still the
 * thumbnail's, so turning resizing on changes bytes and nothing else.
 *
 * DECORATIVE, BY THE ROW'S OWN RULE. The monogram beside a product's name is
 * `aria-hidden` — the name is the name — and a picture in the same place is
 * the same kind of thing. `alt` is empty and the maker's alt text stays on
 * the listing page, where the image is content rather than ornament.
 *
 * The width and height are the TILE'S, not the picture's: the box is fixed
 * and the picture covers it, so the browser reserves 52×52 before a byte
 * arrives and nothing shifts (CLS is still 0.0000).
 */

import { MEDIA_THUMBNAIL_WIDTH, mediaPath, type MediaThumbnail } from "@openproduct/contracts";

export const TILE_SIZE = 52;

export interface ThumbnailSource {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: "";
}

// `size` is the tile's box on `LogoTile`'s ladder (openproduct-studio OSD3:
// every surface draws the logo, from 32 to 76). The 160 derivative covers the
// 76px hero tile at 2x, so the address does not change with the size.
export function thumbnailSource(
  thumbnail: MediaThumbnail,
  apiBase: string,
  size: number = TILE_SIZE,
): ThumbnailSource {
  return {
    src: `${apiBase.replace(/\/+$/, "")}${mediaPath(thumbnail.ref, MEDIA_THUMBNAIL_WIDTH)}`,
    width: size,
    height: size,
    alt: "",
  };
}
