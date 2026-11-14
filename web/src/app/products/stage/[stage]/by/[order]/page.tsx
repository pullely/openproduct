import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductsView } from "../../../../../feed/products-view";
import {
  PRODUCT_ORDER_SEGMENTS,
  PRODUCT_SORT_LABEL,
  PRODUCT_STAGE_FILTER_LABEL,
  PRODUCT_STAGE_SEGMENTS,
  productSortOfSegment,
  productStageOfSegment,
  productsPath,
} from "../../../../../feed/products";
import { publicApexOrigin } from "../../../../../public-api";

/**
 * Products at one stage, in one of the other orders (openproduct-redesign
 * OPR-3): `/products/stage/<stage>/by/<order>`.
 *
 * THE TWO PATH SCHEMES COMPOSE: the stage first, then the order, each the
 * same segment it is on its own. Two stages by two orders is four addresses,
 * all prerendered, each one static document (I6, design.md §4).
 */
export const revalidate = 60;

export function generateStaticParams() {
  return PRODUCT_STAGE_SEGMENTS.flatMap((stage) => PRODUCT_ORDER_SEGMENTS.map((order) => ({ stage, order })));
}

type Params = Promise<{ stage: string; order: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { stage: stageSegment, order } = await params;
  const stage = productStageOfSegment(stageSegment);
  const sort = productSortOfSegment(order);
  if (stage === null || sort === null) return {};
  const origin = publicApexOrigin();
  return {
    title: `Products — ${PRODUCT_STAGE_FILTER_LABEL[stage].toLowerCase()}, ${PRODUCT_SORT_LABEL[sort].toLowerCase()}`,
    description: "Products built in the open, by stage: the ones that are shipping, and the ideas that are not built yet.",
    ...(origin ? { alternates: { canonical: `${origin}${productsPath(sort, stage)}` } } : {}),
  };
}

export default async function ProductsAtStageInOrderPage({ params }: { params: Params }) {
  const { stage: stageSegment, order } = await params;
  const stage = productStageOfSegment(stageSegment);
  const sort = productSortOfSegment(order);
  if (stage === null || sort === null) notFound();
  const path = productsPath(sort, stage);
  return <ProductsView sort={sort} stage={stage} returnTo={path} retryHref={path} />;
}
