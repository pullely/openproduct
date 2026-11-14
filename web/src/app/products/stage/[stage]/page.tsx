import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductsView } from "../../../feed/products-view";
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_STAGE_FILTER_LABEL,
  PRODUCT_STAGE_SEGMENTS,
  productStageOfSegment,
  productsPath,
} from "../../../feed/products";
import { publicApexOrigin } from "../../../public-api";

/**
 * Products at one stage (openproduct-redesign OPR-3; boards `Products`,
 * `PhoneProducts`): `/products/stage/shipping`, `/products/stage/ideas`.
 *
 * THE STAGE FILTER IS AN ADDRESS, as the sort is (`by/[order]/page.tsx`
 * records why): a page that reads `?stage=` goes out `no-store`, and each of
 * these is one static document the edge keeps for a minute, the same bytes
 * for every visitor (I6, design.md §4). Both are prerendered; a segment that
 * is not a stage is a 404.
 */
export const revalidate = 60;

/** `dynamicParams` stays at its default — see `by/[order]/page.tsx`. */
export function generateStaticParams() {
  return PRODUCT_STAGE_SEGMENTS.map((stage) => ({ stage }));
}

export async function generateMetadata({ params }: { params: Promise<{ stage: string }> }): Promise<Metadata> {
  const stage = productStageOfSegment((await params).stage);
  if (stage === null) return {};
  const origin = publicApexOrigin();
  return {
    title: `Products — ${PRODUCT_STAGE_FILTER_LABEL[stage].toLowerCase()}`,
    description: "Products built in the open, by stage: the ones that are shipping, and the ideas that are not built yet.",
    ...(origin ? { alternates: { canonical: `${origin}${productsPath(DEFAULT_PRODUCT_SORT, stage)}` } } : {}),
  };
}

export default async function ProductsAtStagePage({ params }: { params: Promise<{ stage: string }> }) {
  const stage = productStageOfSegment((await params).stage);
  if (stage === null) notFound();
  const path = productsPath(DEFAULT_PRODUCT_SORT, stage);
  return <ProductsView sort={DEFAULT_PRODUCT_SORT} stage={stage} returnTo={path} retryHref={path} />;
}
