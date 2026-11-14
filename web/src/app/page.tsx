import type { Metadata } from "next";

import { ProductsView } from "./feed/products-view";
import { DEFAULT_PRODUCT_SORT } from "./feed/products";
import { publicApexOrigin } from "./public-api";
import { SITE_CARD_ALT, cardMeta } from "./ui/og";

/**
 * The front page (openproduct-redesign OPR1).
 *
 * `/` IS THE LIST OF PRODUCTS IN THE DEFAULT ORDER, AND SAYS SO. The redesign
 * makes `/` the feed of posts (board `Feed`), and a post does not exist until
 * OPR2 — so for this milestone the front page keeps listing products, drawn
 * as the Products page draws them (`feed/products-view.tsx`: the board's
 * cards, the search-within-list field, the sort, *Show more*), under the
 * title **Products**. Nothing on it claims to be a feed: no post, no
 * composer, no "Feed" heading. The header's Feed pill lights here because
 * this is the address the feed will have.
 *
 * WHAT KEEPS IT DISTINCT FROM `/products`: the address and its canonical
 * (`/`, as it has always declared), the brand in the title, and the site's
 * share card. The list is the same list; the sort's links go to
 * `/products?sort=…`, where a sort is an address.
 *
 * A SERVER COMPONENT, STATIC, ONE READ — the catalogue's first page. OPC-1
 * requires one cacheable document that resolves no actor; the visitor's own
 * Follow state arrives after paint from the XP2 overlay, so the anonymous
 * and signed-in renders are byte-identical (I6). It reads no query string,
 * which is why it stays static while `/products` (which reads `?sort=`) is
 * rendered per request.
 *
 * NOTHING ON THIS PAGE DECIDES AN ORDER. `ProductsView` reads the catalogue
 * in the published order and `orderBuilds` (the contract) applies the floor
 * and the comparator every other surface imports.
 *
 * A CATALOGUE THAT COULD NOT BE READ SAYS SO. An empty room and a locked door
 * look nothing alike to a visitor (the OD5 finding): a null read is the
 * failure panel, and an empty catalogue is the list's own empty line.
 */
export const revalidate = 60;

/** RE0 — the site card, advertised only where the deployment has a canonical
 *  origin to build an absolute URL from. `cardMeta` says why. */
const SITE_CARD = cardMeta(publicApexOrigin(), "/og/site", SITE_CARD_ALT);

export const metadata: Metadata = {
  // THE ONE TITLE THE TEMPLATE CANNOT REACH (openproduct-worldclass RE2).
  //
  // `layout.tsx` sets `template: "%s · openproduct"`, and it works everywhere
  // — `/my-product` serves `my-product · openproduct`. It does NOT apply to
  // the segment that declares it, and the root page IS that segment, so this
  // title shipped as the bare word `Launches`: the front page of the product,
  // in a browser tab and in every bookmark, naming neither the product nor
  // what it is.
  //
  // So the brand is written here rather than inherited. Not `{ absolute }`,
  // which would be the same trap one level down for whoever edits this next —
  // a plain string that already reads correctly is what the template would
  // have produced, and `title-brand.test.ts` asserts exactly one brand in it.
  title: "Products · openproduct",
  description: "Products built in the open: every build a public repo and a public workspace, ordered by work and interest.",
  ...(publicApexOrigin() ? { alternates: { canonical: `${publicApexOrigin()}/` } } : {}),
  openGraph: {
    title: "openproduct — products built in the open",
    description: "Products built in the open: every build a public repo and a public workspace, ordered by work and interest.",
    type: "website",
    ...(SITE_CARD ? { images: SITE_CARD.images } : {}),
  },
  ...(SITE_CARD ? { twitter: SITE_CARD.twitter } : {}),
};

export default function OpenproductFrontPage() {
  return <ProductsView sort={DEFAULT_PRODUCT_SORT} returnTo="/" retryHref="/" />;
}
