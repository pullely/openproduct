import { BADGE_CACHE_CONTROL, badgeSvg, badgeValue } from "@openproduct/contracts";

import { fetchPublicProfile } from "../../public-api";

/**
 * The README badge (openproduct-worldclass RE4).
 *
 * ─── THE ONE ADDRESS ON THIS SITE THAT STRANGERS WILL HOTLINK ─────────────
 *
 * Every other public route is fetched by somebody looking at openproduct.
 * This one is fetched by GitHub's image proxy on behalf of anybody reading
 * any repository that pasted it, indefinitely, whether or not that reader has
 * ever heard of this product. Everything about the response is chosen for
 * that: no subject, a fixed box, an hour of cache here and far longer in the
 * proxy, and a content type nothing is allowed to sniff past.
 *
 * `contracts/src/badge.ts` decides what it says and draws it; this decides
 * how it is served.
 */
export const revalidate = 3600;

/** XP4's rule — without it the `revalidate` above is accepted and ignored and
 *  the route is served `no-store`, which on the one hotlinked address would
 *  mean re-rendering per reader of somebody else's README. */
export async function generateStaticParams() {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  // BOTH ADDRESSES WORK. `/badge/my-product` is the canonical one and what
  // `badgeMarkdown` emits; `/badge/my-product.svg` is what somebody will type
  // from memory, because every other badge service on the internet ends in an
  // extension. Answering one and 404ing the other would be a broken image in
  // a README, discovered by the maker weeks later if at all.
  const name = slug.endsWith(".svg") ? slug.slice(0, -4) : slug;
  const profile = await fetchPublicProfile(name);
  // 404 EXACTLY WHERE THE PAGE 404s, from the same read — a badge that
  // outlives its listing should break visibly rather than keep asserting a
  // product is listed here after it stopped being.
  if (profile === null) return new Response("not found", { status: 404 });

  return new Response(badgeSvg(badgeValue(profile)), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": BADGE_CACHE_CONTROL,
      // AN SVG IS A DOCUMENT, and a document served from this origin that a
      // browser is allowed to sniff into something executable is a
      // cross-site-scripting vector on the apex. This one contains no script
      // and never will; these two headers are what make that a property of
      // the RESPONSE rather than a property of the code that produced it.
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
