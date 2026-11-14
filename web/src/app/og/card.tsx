import { ImageResponse } from "next/og";

import {
  OG_CACHE_CONTROL,
  OG_HEIGHT,
  OG_KINDS,
  OG_WIDTH,
  oklchToHex,
  ogPalette,
  type OgCopy,
} from "../ui/og";

/**
 * The card itself (openproduct-worldclass RE0).
 *
 * ─── DRAWN BY SATORI, WHICH IS NOT A BROWSER ──────────────────────────────
 *
 * `next/og` lays this tree out with satori and rasterises it with resvg, both
 * as WebAssembly inside the worker — @opennextjs/cloudflare detects the
 * library and swaps Next's Node build for the edge one at bundle time, so
 * this needs no `runtime = "edge"` and no new binding (OPX-4).
 *
 * Three things follow from it being satori rather than a browser, and each
 * has bitten somebody:
 *
 *   NO `oklch()`. The whole palette is OKLCH and satori understands none of
 *   it. `ui/og.ts` converts, and a test holds the conversion to the tokens.
 *
 *   NO IMPLICIT BLOCK LAYOUT. Any element with more than one child must say
 *   `display: flex`, or satori throws at render time — in production, on a
 *   card nobody is watching. Every container below is explicit.
 *
 *   NO TAILWIND. These are inline styles because the class names on the rest
 *   of the site resolve through a stylesheet that does not exist here.
 *
 * ─── AND IT IS THE SAME PICTURE FOR EVERYBODY (WC-4) ──────────────────────
 *
 * The card reads a slug from the address and a document from the public API.
 * It resolves no actor, reads no cookie and takes no header. That is what
 * lets it be cached at the edge, and it is the property this epic is least
 * allowed to lose: a card personalised to the sharer would make every share
 * of a listing a separate object.
 */
export function ogResponse(copy: OgCopy): ImageResponse {
  const c = ogPalette();
  // THE LIGHT RAMP'S TILE, RESOLVED HERE. The site reads `--tile-fill` and
  // `--tile-ink` so the tile can follow the theme (FR0); a card has no theme
  // — it is one picture, on one background, for every viewer — so it takes the
  // light ramp's values and `dark-ramp.test.ts` holds these two lines to them.
  const tile = copy.monogram
    ? {
        background: oklchToHex(0.8, 0.099, copy.monogram.hue),
        color: oklchToHex(0.41, 0.069, copy.monogram.hue),
      }
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: c.background,
          padding: 68,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          {copy.logo ? (
            // openproduct-studio OSD3 — THE MAKER'S LOGO in the tile's box,
            // contained on white like the site's tile draws it on the card
            // colour: a mark cropped at its edges is a different mark. No
            // ring — the ring says "stand-in", and this is the real thing.
            // `ogLogoUrl` admitted only PNG or JPEG, which satori decodes.
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 132,
                height: 132,
                borderRadius: 34,
                marginBottom: 44,
                overflow: "hidden",
                // OPR1 — the card token, flat: white on the page colour is
                // the tile's whole edge, as on the site (no border).
                background: c.card,
              }}
            >
              <img src={copy.logo} width={128} height={128} alt="" style={{ objectFit: "contain" }} />
            </div>
          ) : tile && copy.monogram ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 132,
                height: 132,
                borderRadius: 34,
                marginBottom: 44,
                background: tile.background,
              }}
            >
              {/* VC4's RING, INSET, which is how the site draws it at all six
                  of its sizes: a flat pastel square with two letters reads as
                  a logo that failed to load, and a ring inside the fill makes
                  the tile legibly a STAND-IN instead.

                  A NESTED BOX RATHER THAN AN ABSOLUTE ONE. `logo-tile.tsx`
                  insets its ring with `position: absolute; inset: 3px`, which
                  is the right answer in a browser and the wrong one here —
                  satori's absolute positioning is the corner of its layout
                  engine most likely to fail at RENDER time, which on this
                  surface means a 500 on the card at the moment somebody
                  pastes a link. A centred child of a fixed-size flex parent
                  lands in the same place using only what satori does well.

                  DASHED RATHER THAN DOTTED, AND NOT BY CHOICE: satori
                  implements two border styles and throws on the rest —
                  `Allowed values: "solid" | "dashed"`. At 132px in an unfurl
                  the two are indistinguishable. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 120,
                  height: 120,
                  borderRadius: 28,
                  border: `3px dashed ${tile.color}`,
                  color: tile.color,
                  fontSize: 52,
                }}
              >
                {copy.monogram.initials}
              </div>
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 24,
              letterSpacing: 4,
              color: c.faint,
              marginBottom: 18,
            }}
          >
            {OG_KINDS[copy.kind]}
            {/* PP4 — the dated podium mark, and only that kind: a mark that
                rots ("#1 today") never reaches a card that is cached for an
                hour and shared for a year. Derived from a board row, never
                conferred. */}
            {copy.mark ? (
              <div
                style={{
                  display: "flex",
                  marginLeft: 22,
                  padding: "4px 14px",
                  borderRadius: 999,
                  border: `2px solid ${c.faint}`,
                  color: c.copy,
                  letterSpacing: 0,
                  fontSize: 22,
                }}
              >
                {copy.mark}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", fontSize: 76, color: c.foreground, lineHeight: 1.1 }}>
            {copy.title}
          </div>
          {copy.subtitle ? (
            <div
              style={{
                display: "flex",
                fontSize: 34,
                color: c.copy,
                marginTop: 22,
                lineHeight: 1.35,
              }}
            >
              {copy.subtitle}
            </div>
          ) : null}
          {/* OB7 — the build's week, dated (`ogWeekLine`); absent when there
              is nothing above zero to say. */}
          {copy.week ? (
            <div style={{ display: "flex", fontSize: 26, color: c.faint, marginTop: 20 }}>{copy.week}</div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${c.border}`,
            paddingTop: 28,
            fontSize: 26,
            color: c.faint,
          }}
        >
          <div style={{ display: "flex", color: c.foreground }}>openproduct</div>
          {/* The site's own claim, and the only sentence on the card that is
              an argument rather than a label. It is durable: it is true of
              every listing on every day, which is exactly the bar a card
              cached in somebody else's timeline has to clear. */}
          <div style={{ display: "flex" }}>Observed, not claimed</div>
        </div>
      </div>
    ),
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      headers: {
        // NOT `ImageResponse`'s DEFAULT, which is `immutable, max-age=31536000`
        // — a year, for a picture that carries a maker's editable sentence.
        // See OG_CACHE_CONTROL.
        "cache-control": OG_CACHE_CONTROL,
      },
    },
  );
}
