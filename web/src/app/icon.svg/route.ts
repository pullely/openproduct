/**
 * openproduct's own browser-tab mark.
 *
 * The redesign's logo (openproduct-redesign OPR1, design.md §3): a "P" whose
 * head is an "o" — an ink stem and an amber ring, the same two strokes
 * `shell/logomark.tsx` draws in the header (viewBox 0 0 24 24, stroke 2.6,
 * round caps, no fill).
 *
 * A tab strip is light in one browser and dark in the next, and a favicon
 * cannot read `currentColor` from the page, so the stem answers the BROWSER's
 * scheme itself: ink (#141413) by default and the dark ramp's light ink under
 * `prefers-color-scheme: dark`. No plate behind it — the mark is the logo,
 * not a tile. The layout's `icons` metadata points here.
 */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="openproduct" fill="none" stroke-width="2.6" stroke-linecap="round">
  <style>.stem{stroke:#141413}@media (prefers-color-scheme:dark){.stem{stroke:#EFEEEB}}</style>
  <path class="stem" d="M8 3.5V21"/>
  <circle cx="14" cy="9.5" r="6" stroke="#B8862F"/>
</svg>
`;

export function GET(): Response {
  return new Response(MARK, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=86400",
    },
  });
}
