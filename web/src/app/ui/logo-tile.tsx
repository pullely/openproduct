import { initialsOf, tileColours } from "../feed/tile";

/**
 * A product's logo tile — the slug's initials on a fill derived from the
 * slug — at every size the design draws it.
 *
 *   52  the feed row (radius 14, IBM Plex Mono 16px/500)
 *   76  the product hero (radius 20, 24px/500)
 *   72  the studio editor's hero (radius 16, 22px/500)
 *   44  a collection card's row (radius 13, 13px)
 *   40  a leaderboard row (radius 11, 12.5px)
 *   36  the sidebar's featured collection (radius 10, 11.5px)
 *   32  similar launches (radius 9, 11.5px)
 *
 * ONE COMPONENT rather than a tile per surface, because a product must get
 * the same tile everywhere: same letters, same hue, and a geometry that
 * scales on one ladder rather than six eyeballed ones.
 */
export type TileSize = 32 | 36 | 40 | 44 | 52 | 72 | 76;

/**
 * The ladder's box and radius at each size — shared with `ProductTile`
 * (openproduct-studio OSD3), so a logo and a monogram at the same size are
 * the same box and the same corner, and a product that gains a logo does not
 * move by a pixel.
 */
export function tileBox(size: TileSize): string {
  return size === 76
    ? "h-[76px] w-[76px] rounded-[20px]"
    : size === 72
      ? "h-[72px] w-[72px] rounded-[16px]"
      : size === 52
        ? "h-[52px] w-[52px] rounded-[14px]"
        : size === 44
          ? "h-[44px] w-[44px] rounded-[13px]"
          : size === 40
            ? "h-[40px] w-[40px] rounded-[11px]"
            : size === 36
              ? "h-[36px] w-[36px] rounded-[10px]"
              : "h-[32px] w-[32px] rounded-[9px]";
}

/**
 * The ladder's 52px step, applied below `sm` only (openproduct-calm CL2): the
 * build tile's face is 72px on a wide screen and 52px on a phone, where the
 * tagline takes the full width under it. Literal, so Tailwind sees every
 * class.
 */
export const TILE_52_BELOW_SM = "max-sm:h-[52px] max-sm:w-[52px] max-sm:rounded-[14px] max-sm:text-[16px]";

function tileType(size: TileSize): string {
  return size === 76
    ? "text-[24px] font-medium"
    : size === 72
      ? "text-[22px] font-medium"
      : size === 52
        ? "text-[16px] font-medium"
        : size === 44
          ? "text-[13px]"
          : size === 40
            ? "text-[12.5px]"
            : "text-[11.5px]";
}

export function LogoTile({
  slug,
  size = 52,
  className = "",
}: {
  slug: string;
  size?: TileSize;
  className?: string;
}) {
  const shape = `${tileBox(size)} ${tileType(size)}`;
  return (
    <span
      aria-hidden="true"
      // THE DOTTED RING SAYS "PLACEHOLDER" (openproduct-worldclass VC4).
      //
      // A flat pastel square with two letters reads as a logo that failed to
      // load — the audit's words for it were that every listing "looks
      // identical in weight". The ring is the audit's own proposed fix: it
      // echoes the openproduct mark, and it makes the tile legibly a
      // STAND-IN rather than a broken image, which is a different and more
      // honest thing for it to be.
      //
      // `inset` rather than a border, so the ring does not change the tile's
      // box on any of the six sizes — every one of those geometries is
      // measured from the design and none of them has a spare pixel.
      className={`relative grid shrink-0 place-items-center font-mono ${shape} ${className}`}
      style={tileColours(slug)}
    >
      <span className="relative">{initialsOf(slug)}</span>
    </span>
  );
}
