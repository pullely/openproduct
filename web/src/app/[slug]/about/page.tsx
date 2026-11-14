import type { Metadata } from "next";

import { ProductPage, productMetadata } from "../product-page";

/**
 * `/{slug}/about` — a shipping product's About tab, as a cached document of
 * its own (openproduct-redesign OPR-3; `../tabs.ts`). An idea product has no
 * tabs, and this address goes to its one page.
 */
export const revalidate = 60;

/** See `../page.tsx`: without this the route is dynamic and uncacheable. */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return productMetadata(slug, "about");
}

export default async function ProductAboutPage({ params }: PageProps) {
  const { slug } = await params;
  return <ProductPage slug={slug} tab="about" />;
}
