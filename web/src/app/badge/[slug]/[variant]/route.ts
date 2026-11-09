import {
  BADGE_CACHE_CONTROL,
  badgeSvg,
  badgeVariantValue,
  isBadgeVariant,
  mostActiveRankOf,
} from "@openproduct/contracts";

import { fetchPublicDirectory, fetchPublicProfile } from "../../../public-api";

/**
 * The README badge's variants (openproduct-open-builds OB7):
 * `/badge/{slug}/most-active` and `/badge/{slug}/changes`.
 *
 * SERVED EXACTLY AS THE BARE BADGE IS (`../route.ts` says why at length): an
 * hour of cache, a fixed box, `nosniff` and a sandboxing CSP, and a 404 where
 * the listing's own page 404s. What differs is the right half, which the
 * contract decides (`badgeVariantValue`) from what this route can read:
 *
 *   most-active  the build's place on the front page's list, from the same
 *                catalogue document the front page orders (`mostActiveRankOf`)
 *   changes      the observed `merges.7d`
 *
 * Either falls back to *listed* when it has nothing true to say — never a
 * zero and never a dash, because a README cannot carry a footnote.
 */
export const revalidate = 3600;

/** XP4's rule, as on the bare badge: without it `revalidate` is ignored and
 *  the hotlinked address is served `no-store`. */
export async function generateStaticParams() {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; variant: string }> },
): Promise<Response> {
  const { slug, variant: raw } = await params;
  // `changes.svg` works for the reason `my-product.svg` does on the bare one.
  const variant = raw.endsWith(".svg") ? raw.slice(0, -4) : raw;
  if (!isBadgeVariant(variant) || variant === "listed") return new Response("not found", { status: 404 });

  const [profile, catalog] = await Promise.all([
    fetchPublicProfile(slug),
    variant === "most-active" ? fetchPublicDirectory() : Promise.resolve(null),
  ]);
  if (profile === null) return new Response("not found", { status: 404 });

  const merges = profile.metrics.find((m) => m.key === "merges.7d")?.value ?? null;
  const rank = catalog ? mostActiveRankOf(catalog, profile.slug) : null;
  const value = badgeVariantValue(variant, { profile, rank, merges });

  return new Response(badgeSvg(value), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": BADGE_CACHE_CONTROL,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
