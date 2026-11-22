/**
 * openproduct's own browser-tab mark.
 *
 * The logo (openproduct-left-rail LR1, design §3): a near-black rounded
 * tile, a white ring and an amber dot at the ring's top right — the same
 * three shapes `shell/logomark.tsx` draws in the header (viewBox 0 0 24 24).
 *
 * The tile is its own ground, so the mark reads on a light tab strip and a
 * dark one without answering the browser's scheme. The layout's `icons`
 * metadata points here.
 */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="openproduct" fill="none">
  <rect width="24" height="24" rx="6" fill="#17150F"/>
  <circle cx="11.5" cy="12.5" r="4.6" stroke="#FFFFFF" stroke-width="2.4"/>
  <circle cx="16.8" cy="7.2" r="2.3" fill="#C9952F"/>
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
