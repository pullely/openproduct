import type { MediaThumbnail } from "@openproduct/contracts";

import { thumbnailSource } from "../feed/thumbnail";
import { publicApiBase } from "../public-api";

import { LogoTile, TILE_52_BELOW_SM, tileBox, type TileSize } from "./logo-tile";

/**
 * A product's tile: its logo, or its monogram (openproduct-worldclass MD3;
 * the logo since openproduct-studio OSD2 — it was the hero, cropped).
 *
 * ONE COMPONENT DRAWS A PRODUCT'S FACE (openproduct-studio OSD-5, OSD3).
 * Every surface that draws a product's tile — the feed, the hero card, the
 * product bar, the board, the leaderboard, collections, search, a maker's
 * rows, saved, the studio list — draws this, at any size on `LogoTile`'s
 * ladder, with the ladder's own box and radius (`tileBox`), so a product has
 * one face and gaining a logo moves nothing.
 *
 * ONE DECISION, MADE HERE. A listing with a logo shows it at the tile's size;
 * a listing without one keeps the monogram, unchanged — and is not penalised
 * anywhere for it (MD-3): nothing that orders a row reads this field, which
 * the core tests assert directly. The monogram's dotted ring says "stand-in";
 * a real picture needs no such ring, so the frame is a plain one.
 *
 * A SERVER COMPONENT, like the rows it sits in. `publicApiBase()` is the same
 * origin the document was read from, so the picture's bytes come from the
 * gateway, not a third party.
 */
export function ProductTile({
  slug,
  thumbnail,
  size = 52,
  className = "",
  phoneSize,
}: {
  slug: string;
  thumbnail: MediaThumbnail | null;
  size?: TileSize;
  /** The ladder step below `sm`, where it differs (the build tile's 52). */
  phoneSize?: 52;
  /**
   * The tile's own frame (openproduct-studio OSD3): the product hero rings
   * its tile in the card colour with a shadow. Given, it REPLACES the logo's
   * default hairline rather than stacking on it — two border colours on one
   * box resolve by stylesheet order, which is not a decision. The monogram
   * takes it as `LogoTile` always has.
   */
  className?: string;
}) {
  const phone = phoneSize === 52 ? TILE_52_BELOW_SM : "";
  if (!thumbnail) return <LogoTile slug={slug} size={size} className={`${className} ${phone}`.trim()} />;
  const source = thumbnailSource(thumbnail, publicApiBase(), size);
  return (
    // CONTAIN, NOT COVER, on the card's own colour: a logo is near square by
    // rule (OSD-3), not exactly, and a mark cropped at its edges is a
    // different mark. A transparent logo sits on the card it would sit on.
    <span
      aria-hidden="true"
      className={`block shrink-0 overflow-hidden bg-card ${tileBox(size)} ${className || "border border-border"} ${phone}`}
    >
      <img
        src={source.src}
        width={source.width}
        height={source.height}
        alt={source.alt}
        loading="lazy"
        decoding="async"
        className="block h-full w-full object-contain"
      />
    </span>
  );
}
