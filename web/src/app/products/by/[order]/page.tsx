import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductsView } from "../../../feed/products-view";
import { PRODUCT_ORDER_SEGMENTS, PRODUCT_SORT_LABEL, productSortOfSegment, productsPath } from "../../../feed/products";
import { publicApexOrigin } from "../../../public-api";

/**
 * Products, in one of the other orders (openproduct-redesign OPR1; boards
 * `Products`, `PhoneProducts`).
 *
 * `/products/by/newest`, `/products/by/upvoted` — ONE BODY, TWO ADDRESSES,
 * the pattern `/builds/{order}` had (OB4) and the leaderboard before it
 * (UV2): an order is a path segment because a page that reads its query
 * string goes out `no-store`, and each of these is one cacheable document
 * (OPC-1, design.md §4). `/products` is Most active, and these are views of
 * the same list under the same control (`feed/sort-control.tsx`).
 *
 * CANONICAL TO ITSELF. A sorted list is a page of its own — different cards
 * first, its own title — so it names its own address, and the sitemap lists
 * it.
 *
 * `by` IS A STATIC SEGMENT BESIDE `/products/[cursor]`. Next matches the
 * static one first, and the two shapes cannot collide anyway: a cursor is
 * ONE segment and never the word `by` (`PRODUCTS_ORDER_SEGMENT` in
 * `feed/products.ts` says why), an order is two.
 *
 * THE SAME BYTES FOR EVERY VISITOR (I6), as `/products`.
 */
export const revalidate = 60;

/**
 * XP4 — the orders are prerendered so the route is registered for ISR at all
 * (see the note on the same function in `app/[slug]/page.tsx`).
 *
 * `dynamicParams` STAYS AT ITS DEFAULT. Set to `false`, Next serves only what
 * the build prerendered — and this worker's incremental cache is the Workers
 * Cache API (`open-next.config.ts`), which starts every deploy empty, so the
 * old `/builds/{order}` pages answered 404 in production when it was tried.
 * Left true, the first request in a data centre renders the order and the
 * cache keeps it; a segment that is not an order still 404s, from
 * `notFound()` below.
 */
export function generateStaticParams() {
  return PRODUCT_ORDER_SEGMENTS.map((order) => ({ order }));
}

export async function generateMetadata({ params }: { params: Promise<{ order: string }> }): Promise<Metadata> {
  const sort = productSortOfSegment((await params).order);
  if (sort === null) return {};
  const origin = publicApexOrigin();
  return {
    title: `Products — ${PRODUCT_SORT_LABEL[sort].toLowerCase()}`,
    description: "Products built in the open: what each one is, what moved this week, and the seats it has open.",
    ...(origin ? { alternates: { canonical: `${origin}${productsPath(sort)}` } } : {}),
  };
}

export default async function ProductsInOrderPage({ params }: { params: Promise<{ order: string }> }) {
  const sort = productSortOfSegment((await params).order);
  // An order that was never published has no page, and the default order's
  // one address is `/products`. No Suspense boundary sits above this call
  // (the rule `[slug]/page.tsx` records), so the status is the status.
  if (sort === null) notFound();
  return <ProductsView sort={sort} returnTo={productsPath(sort)} retryHref={productsPath(sort)} />;
}
