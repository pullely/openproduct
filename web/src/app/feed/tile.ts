/**
 * The logo tile, as pure functions (openproduct-launch OL2).
 *
 * SEPARATE FROM THE ROW, and not for tidiness: the web test lane is
 * module-level and has no JSX, so a rule that lives inside a `.tsx` is a rule
 * no test in this repository can hold. These decide what a listing's tile
 * says and what colour it is, which is exactly the kind of thing worth
 * pinning — so they live where a test can reach them.
 *
 * `ui/logo-tile.tsx` is the one component that draws them, at every size the
 * design uses.
 */

/**
 * At most two letters, from the slug's own words.
 *
 * NEVER EMPTY. A blank tile is a rendering bug that looks like missing data,
 * and a listing with a punctuation-only slug is a case the database permits
 * even if nobody has made one.
 */
export function initialsOf(slug: string): string {
  const words = slug.split(/[-_.\s]+/).filter((word) => word.length > 0);
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * A stable hue from a slug, in the oklch space the whole palette is drawn in.
 *
 * DERIVED, NOT RANDOM. A listing carries no logo — there is no upload path
 * anywhere in openproduct (R7) — so the tile is initials on a generated fill,
 * and the same product has to get the same tile on every surface and on every
 * render. A colour that moved between two reads of one cached document is the
 * kind of detail that makes a page look broken without anybody being able to
 * say why.
 *
 * THE DESIGN'S OWN HASH — `h = (h * 31 + code) % 360` over the id's
 * characters — so a slug the prototype drew lands on the very hue it drew it
 * in. Pure, cheap, and a test can state what it will return.
 */
export function hueFor(slug: string): number {
  let hue = 0;
  for (let index = 0; index < slug.length; index += 1) {
    hue = (hue * 31 + slug.charCodeAt(index)) % 360;
  }
  return hue;
}

/**
 * How much colour a tile carries (openproduct-worldclass VC4, corrected by FR0).
 *
 * IT WAS 0.045, AND THAT IS MEASURABLY TOO LITTLE. The 7 Sep audit found the
 * two live listings reading as "two identical MP tiles in two pastel washes"
 * and diagnosed a generator deriving hue from the initials. **That diagnosis
 * is wrong** — `hueFor` has always hashed the whole slug, and `my-product`
 * and `my-project` land 70° apart (294 and 224). The observation was right
 * anyway, and the reason is chroma rather than hue.
 *
 * ─── VC4 RAISED THE CHROMA AND IT CHANGED ALMOST NOTHING ──────────────────
 *
 * VC4 took this constant from 0.045 to 0.10 and recorded the pair moving from
 * ΔE 5.2 to 11.5. **Both numbers were computed as if sRGB could hold the
 * chroma they name, and at the fill's lightness it cannot.** The tile was
 * `oklch(0.93 C h)`, and 0.93 is very close to white: the sRGB gamut is
 * narrow up there, and 255 of the 360 hues could not reach 0.10 at all. A
 * browser gamut-maps what it cannot paint, so the two tiles the audit looked
 * at were painted at chroma 0.0371 and 0.0461 both before and after:
 *
 *     painted ΔE before VC4 (L 0.93, asked for 0.045)   4.75
 *     painted ΔE after  VC4 (L 0.93, asked for 0.10)    4.83
 *
 * Eight hundredths. The ring VC4 added is real and is doing its job; the
 * colour half of that milestone did not happen, and nothing said so because
 * the measurement was taken on the authored value rather than the painted one.
 *
 * ─── SO THE FIX IS LIGHTNESS, NOT CHROMA ─────────────────────────────────
 *
 * FR0 moved the fill to `oklch(0.8 0.099 h)`, where **0.099 is inside sRGB at
 * every hue on the circle** — the authored value and the painted value are
 * the same number for the first time — and the audit's pair measures **11.36**,
 * which is what VC4 meant to deliver. The tile is a deeper pastel than the
 * design's original wash; that is the direction the audit asked for.
 *
 * AND IT STILL CANNOT BE FIXED BY CHROMA IN GENERAL, which remains the more
 * useful thing to write down. Two slugs can hash 10° apart, and at 10° the
 * pair measures 1.7 at any chroma a tile of this lightness can carry. **Hue
 * over an unbounded slug space is not an identifier and never will be.** A
 * tile's job is to look deliberate rather than broken; telling two products
 * apart is what the letters do, and what MD's real images will do properly.
 *
 * THE VALUE ALSO LIVES IN A TOKEN NOW. `--tile-fill` is what a browser reads
 * and the dark ramp gives it its own pair; this constant is the LIGHT ramp's
 * chroma and is what `tileDistance` measures. `dark-ramp.test.ts` holds the
 * two together, and holds every value in the stylesheet inside sRGB so that
 * the class of mistake above cannot be made again silently.
 */
const TILE_CHROMA = 0.099;

/**
 * The tile's fill and ink for a slug — the design's `logoBg` / `logoFg`.
 *
 * THE HUE IS THE SLUG'S; THE LIGHTNESS IS THE RAMP'S (openproduct-worldclass
 * FR0). Only the hue is derived here. `--tile-fill` and `--tile-ink` carry the
 * lightness and chroma pair, and the dark ramp redefines both — so a tile is
 * a pale square with dark letters on a pale page and a deep square with light
 * letters on a dark one, in the same hue, from the same HTML.
 *
 * It had to be this way round rather than a second function: the tile is on
 * every feed row, and a fixed 0.93 fill is the brightest thing on the page in
 * a dark theme — twelve of them down a column is a lightbox. Deciding it in
 * the component would have meant reading the theme during a server render,
 * which is a second render of a page I6 requires to be one. The hue goes in
 * the markup, the ramp answers in CSS, and the bytes are identical either way.
 */
export function tileColours(slug: string): { background: string; color: string } {
  const hue = hueFor(slug);
  return {
    background: `oklch(var(--tile-fill) ${hue})`,
    color: `oklch(var(--tile-ink) ${hue})`,
  };
}

/**
 * The perceptual distance between two slugs' tiles, in OKLab ×100.
 *
 * Exported so the claim above is a test rather than a comment. Lightness and
 * chroma are shared by construction, so the whole distance is the chord
 * between two hues on one circle.
 */
export function tileDistance(a: string, b: string): number {
  const toLab = (slug: string) => {
    const radians = (hueFor(slug) * Math.PI) / 180;
    return [TILE_CHROMA * Math.cos(radians), TILE_CHROMA * Math.sin(radians)] as const;
  };
  const [a1, b1] = toLab(a);
  const [a2, b2] = toLab(b);
  return 100 * Math.hypot(a1 - a2, b1 - b2);
}
