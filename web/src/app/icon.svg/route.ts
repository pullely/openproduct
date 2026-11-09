/**
 * openproduct's own browser-tab mark (launch polish, from the Chrome review).
 *
 * Until now the public host's tab wore the ORUNBASE console favicon — the one
 * mark whose comment says it must match orunbase.com's tab. A separate
 * product deserves its own: an open ring (a product with room in it) with the
 * house bronze as the accent. Served from inside the route group so teardown
 * stays a directory delete; the layout's `icons` metadata points here, and
 * the path is host-agnostic (`/openproduct/…` is canonical on both hosts).
 */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="openproduct">
  <rect width="48" height="48" rx="10" fill="#171717"/>
  <circle cx="23" cy="25" r="11" fill="none" stroke="#FAFAFA" stroke-width="3.5"/>
  <circle cx="34" cy="13" r="4.5" fill="#C08B2D"/>
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
