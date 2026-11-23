/**
 * The web manifest (openproduct-left-rail LR6): the site's name, its colours
 * and its icons, for a browser that installs it or lists it.
 *
 * The icons are the logo's PNGs (`shell/mark-image.tsx`) and the SVG the tab
 * wears. The colours are the light ramp's page (#FFFFFF), as the layout's
 * `themeColor` is.
 */
const MANIFEST = {
  name: "openproduct",
  short_name: "openproduct",
  description: "Products built in the open, looking for people.",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#ffffff",
  icons: [
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
} as const;

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(JSON.stringify(MANIFEST), {
    headers: {
      "content-type": "application/manifest+json",
      "cache-control": "public, max-age=86400",
    },
  });
}
