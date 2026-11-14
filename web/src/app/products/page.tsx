import type { Metadata } from "next";

import { ProductsView } from "../feed/products-view";
import { DEFAULT_PRODUCT_SORT, productsPath } from "../feed/products";
import { publicApexOrigin } from "../public-api";

/**
 * Products (openproduct-redesign OPR1; boards `Products`, `PhoneProducts`) —
 * the address the header's second pill goes to.
 *
 * THE LIST OF PRODUCTS, IN THE DEFAULT ORDER. `/products` is today's default
 * order (Most active) and nothing else; the other two sorts are pages of
 * their own at `/products/by/newest` and `/products/by/upvoted`
 * (`by/[order]/page.tsx`, `feed/products.ts`). The old `/builds/{order}`
 * addresses redirect to those. The body is `ProductsView`, which `/` also
 * draws for this milestone.
 *
 * STATIC, AND IT READS NO QUERY STRING. For a few hours on this milestone's
 * branch the sort lived in `?sort=`, and the price was recorded here: a page
 * that reads `searchParams` is dynamic in Next, so `revalidate` did not
 * apply, nothing was prerendered and the document went out `no-store` — one
 * render per request for a page that is the same bytes for everyone. That
 * trade was taken back. The sort is a path segment, as it was under
 * `/builds/{order}` (the trade `build-orders.ts` records), so this page and
 * each sorted one is a single document the edge keeps for a minute (design.md
 * §4, OPC-1). `/products?sort=<order>` still arrives: `next.config.mjs`
 * redirects it to the path, from the edge.
 *
 * THE SAME BYTES FOR EVERY VISITOR (I6). No session is read and no actor is
 * resolved; a visitor's own Follow state arrives after paint from the
 * overlay.
 */
export const revalidate = 60;

export function generateMetadata(): Metadata {
  const origin = publicApexOrigin();
  return {
    title: "Products",
    description: "Products built in the open: what each one is, what moved this week, and the seats it has open.",
    ...(origin ? { alternates: { canonical: `${origin}${productsPath()}` } } : {}),
  };
}

export default function ProductsPage() {
  return <ProductsView sort={DEFAULT_PRODUCT_SORT} returnTo={productsPath()} retryHref={productsPath()} />;
}
