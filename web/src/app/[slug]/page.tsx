import type { Metadata } from "next";

import { ProductPage, productMetadata } from "./product-page";

/**
 * A product's own address (openproduct-redesign OPR-3): the SHIPPING page on
 * its Updates tab, or the IDEA page — whichever the product's stage says
 * (`product-page.tsx`). The other tabs are the routes beside this one
 * (`about/`, `crew/`, `talk/`, `updates/[cursor]/`); see `tabs.ts`.
 */
export const revalidate = 60;

/**
 * WHAT MAKES `revalidate` ABOVE ACTUALLY DO ANYTHING (openproduct-commons XP4).
 *
 * A dynamic segment is only entered in the prerender manifest — the registry
 * the ISR cache is keyed from — when it declares this function. Without it,
 * Next 15 resolves the route as fully dynamic: `revalidate` is accepted,
 * ignored, and every response goes out
 * `Cache-Control: private, no-cache, no-store, must-revalidate`.
 *
 * Returning `[]` prerenders nothing at build (the slugs are not knowable
 * then), and `dynamicParams` defaults to true, so the first request for a slug
 * renders it and every request inside the window is served from the cache.
 */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return productMetadata(slug, "updates");
}

export default async function OpenproductProfilePage({ params }: PageProps) {
  const { slug } = await params;
  return <ProductPage slug={slug} tab="updates" />;
}
