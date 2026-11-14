import type { Metadata } from "next";

import { ProductsView } from "../feed/products-view";
import { DEFAULT_PRODUCT_SORT, PRODUCT_SORT_LABEL, productSortOf, productsPath } from "../feed/products";
import { publicApexOrigin } from "../public-api";

/**
 * Products (openproduct-redesign OPR1; boards `Products`, `PhoneProducts`) —
 * the address the header's second pill goes to.
 *
 * THE LIST OF PRODUCTS, IN ONE OF ITS SORTS: `/products` is today's default
 * order (Most active) and `/products?sort=newest` and `?sort=upvoted` are the
 * other two (`feed/products.ts`). The old `/builds/{order}` addresses
 * redirect here. The body is `ProductsView`, which `/` also draws for this
 * milestone.
 *
 * A QUERY STRING, SO THIS DOCUMENT IS RENDERED PER REQUEST. The design of
 * record puts the sort in `?sort=` (design.md §5), and a page that reads
 * `searchParams` is dynamic in Next: `revalidate` does not apply to it and
 * it is not prerendered — the trade `build-orders.ts` records, taken here on
 * purpose. What keeps that cheap is underneath: every read this page makes
 * is the cached public read (`PUBLIC_REVALIDATE_SECONDS`), so a request
 * costs a render and no gateway call inside the minute. `/`, which reads no
 * query string, stays one static, revalidated document.
 *
 * STILL THE SAME BYTES FOR EVERY VISITOR (I6). No session is read and no
 * actor is resolved; a visitor's own Follow state arrives after paint from
 * the overlay.
 *
 * AN UNKNOWN SORT IS THE DEFAULT LIST, and its canonical address says so:
 * `?sort=anything-else` renders `/products` and names `/products` as
 * canonical, so a mistyped link is not a second copy of the page.
 */
interface PageProps {
  searchParams: Promise<{ sort?: string | string[] }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sort = productSortOf((await searchParams).sort);
  const origin = publicApexOrigin();
  return {
    title: sort === DEFAULT_PRODUCT_SORT ? "Products" : `Products — ${PRODUCT_SORT_LABEL[sort].toLowerCase()}`,
    description: "Products built in the open: what each one is, what moved this week, and the seats it has open.",
    ...(origin ? { alternates: { canonical: `${origin}${productsPath(sort)}` } } : {}),
  };
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const sort = productSortOf((await searchParams).sort);
  return <ProductsView sort={sort} returnTo={productsPath(sort)} retryHref={productsPath(sort)} />;
}
