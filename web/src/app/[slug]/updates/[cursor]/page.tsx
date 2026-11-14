import type { Metadata } from "next";

import { ProductPage, productMetadata } from "../../product-page";
import { updatesCursorOf } from "../../tabs";

/**
 * `/{slug}/updates/{cursor}` — a later page of a product's updates
 * (openproduct-redesign OPR-3). The cursor is the previous page's `next`, in
 * the PATH: a page that read `?cursor=` would be rendered per request and
 * could not be cached. Not indexed — the first page is the product's address.
 */
export const revalidate = 60;

/** See `../../page.tsx`: without this the route is dynamic and uncacheable. */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string; cursor: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return { ...(await productMetadata(slug, "updates")), robots: { index: false, follow: true } };
}

export default async function ProductUpdatesPage({ params }: PageProps) {
  const { slug, cursor } = await params;
  return <ProductPage slug={slug} tab="updates" cursor={updatesCursorOf(cursor)} />;
}
