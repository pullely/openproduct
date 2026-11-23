import { ImageResponse } from "next/og";

/**
 * The logo as a PNG (openproduct-left-rail LR6), for the places a browser or
 * a phone will not take an SVG: `/favicon.ico`, the home-screen icon and the
 * web manifest's icons.
 *
 * THE SAME THREE SHAPES AS `logomark.tsx` AND `/icon.svg`, in the same
 * 24-unit box: the near-black tile, the white ring (centre 11.5, 12.5;
 * radius 4.6; 2.4 wide) and the amber dot (centre 16.8, 7.2; radius 2.3).
 * Drawn with boxes rather than an `<svg>`, which the image renderer lays out
 * exactly.
 *
 * `rounded` is the tile's own 6-unit corner. A home-screen icon is square:
 * the phone cuts its own corner, and a rounded one inside it shows the
 * page's colour at the edges.
 */
export function markImage(size: number, rounded = true): ImageResponse {
  const u = size / 24;
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: size, height: size, background: "#17150F", borderRadius: rounded ? 6 * u : 0 }}>
        <div
          style={{
            position: "absolute",
            left: (11.5 - 5.8) * u,
            top: (12.5 - 5.8) * u,
            width: 11.6 * u,
            height: 11.6 * u,
            borderRadius: 5.8 * u,
            border: `${2.4 * u}px solid #FFFFFF`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: (16.8 - 2.3) * u,
            top: (7.2 - 2.3) * u,
            width: 4.6 * u,
            height: 4.6 * u,
            borderRadius: 2.3 * u,
            background: "#C9952F",
          }}
        />
      </div>
    ),
    {
      width: size,
      height: size,
      // A day, like `/icon.svg`: the default is a year and immutable, and a
      // mark that changes should not take a year to reach a browser.
      headers: { "cache-control": "public, max-age=86400" },
    },
  );
}
