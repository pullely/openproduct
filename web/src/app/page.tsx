import type { Metadata } from "next";

import { FEED_FAILED_LINE } from "./feed/feed-copy";
import { FeedView } from "./feed/feed-view";
import { fetchFeedPage } from "./posts/posts-api";
import { fetchDirectoryPage, publicApexOrigin } from "./public-api";
import { FailurePanel } from "./ui/failure";
import { SITE_CARD_ALT, cardMeta } from "./ui/og";

/**
 * The front page (openproduct-redesign OPR-3; boards `Feed`, `PhoneFeed`).
 *
 * `/` IS THE FEED: what products have done, newest first, each post as its
 * kind's own card (`feed/feed-view.tsx`). The list of products this address
 * drew through OPR1 is the Products page, `/products`, where it has its own
 * sorts; nothing here lists a product that has not posted.
 *
 * A SERVER COMPONENT, STATIC, TWO READS — the feed's first page and the
 * directory's first page (the right column's "Worth following" and "Open
 * seats"). OPC-1 requires one cacheable document that resolves no actor:
 * the visitor's own follows and reactions, the left column's profile card
 * and "Your products", and the Following list all arrive after paint, so the
 * anonymous and signed-in renders are byte-identical (I6). It reads no query
 * string: a later page of the feed is a path (`/feed/<cursor>`).
 *
 * NOTHING ON THIS PAGE DECIDES AN ORDER. The feed is in the order the API
 * returns it (publication, newest first), and "Worth following" is the
 * directory in its published most-active order.
 *
 * A FEED THAT COULD NOT BE READ SAYS SO. An empty room and a locked door
 * look nothing alike to a visitor (the OD5 finding): a null read is the
 * failure panel, and a feed nobody has posted to yet is the page's own empty
 * state. The directory failing costs the two side cards and nothing else.
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
  title: "Feed · openproduct",
  description: "What products built in the open have shipped, released and started: every post from a public repo and a public workspace.",
  ...(publicApexOrigin() ? { alternates: { canonical: `${publicApexOrigin()}/` } } : {}),
  openGraph: {
    title: "openproduct — products built in the open",
    description: "What products built in the open have shipped, released and started: every post from a public repo and a public workspace.",
    type: "website",
    ...(SITE_CARD ? { images: SITE_CARD.images } : {}),
  },
  ...(SITE_CARD ? { twitter: SITE_CARD.twitter } : {}),
};

export default async function OpenproductFrontPage() {
  const [page, directory] = await Promise.all([fetchFeedPage(), fetchDirectoryPage()]);
  // THE FAILURE PANEL IS A PAGE OF ITS OWN (its own `main`, its own `h1`): it
  // replaces this one rather than sitting inside it.
  if (page === null) {
    return <FailurePanel kind="unavailable" what={FEED_FAILED_LINE} actions={[{ label: "Try again", href: "/" }, { label: "Browse products", href: "/products" }]} />;
  }
  return <FeedView page={page} directory={directory?.projects ?? null} returnTo="/" />;
}
