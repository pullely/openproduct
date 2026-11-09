import { fetchPublicProfile, publicApiBase } from "../../../public-api";
import { ogResponse } from "../../card";
import { cardMark } from "@openproduct/contracts";

import { ogLogoUrl, ogWeekLine, productCopy } from "../../../ui/og";

/**
 * A listing's card (openproduct-worldclass RE0).
 *
 * ONE HOUR, PER ISOLATE. This deployment binds no incremental cache — the
 * OpenNext config says so and says why — so `revalidate` memoises within a
 * worker isolate and nothing more. The freshness contract a consumer actually
 * sees is the response's own `cache-control`, set in `og/card.tsx`.
 */
export const revalidate = 3600;

/** XP4's rule, and it applies to a route handler for the same reason it
 *  applies to a page: without it the `revalidate` above is accepted and
 *  ignored, and the route is served `no-store`. */
export async function generateStaticParams() {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const profile = await fetchPublicProfile(slug);
  // 404 EXACTLY WHERE THE PAGE 404s, from the same read. `fetchPublicProfile`
  // returns null for a listing that is not there AND for a read that failed,
  // and `[slug]/page.tsx` calls `notFound()` on both — so the card and the
  // page agree about what exists, which is the only answer that cannot
  // produce a link whose preview and destination disagree.
  if (profile === null) return new Response("not found", { status: 404 });
  // PP4 — the dated podium mark, from the placement the read already carries.
  // openproduct-studio OSD3 — the maker's logo in the tile's place, when it
  // is one satori can decode (`ogLogoUrl`); otherwise the monogram.
  // OB7 — this week's changes and upvotes, dated and never zero
  // (`ogWeekLine` says why that is the only way a number reaches a card).
  const metric = (key: string) => profile.metrics.find((m) => m.key === key) ?? null;
  return ogResponse(
    productCopy(
      profile.slug,
      profile.tagline,
      cardMark(profile.launch),
      await logoData(ogLogoUrl(profile.media, publicApiBase())),
      ogWeekLine(metric("merges.7d"), metric("endorsements.7d")),
    ),
  );
}

/**
 * The logo's bytes, inlined — or null, and the card keeps its monogram
 * (openproduct-studio OSD3).
 *
 * FETCHED HERE RATHER THAN BY SATORI. Satori fetches an `<img src>` itself,
 * and a fetch that fails inside the render is a 500 on the card at the moment
 * somebody pastes a link. Read first, a failed or slow read is a monogram.
 */
async function logoData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !/^image\/(png|jpeg)\b/.test(type)) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:${type.split(";")[0]};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
