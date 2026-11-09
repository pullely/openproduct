import type { Metadata } from "next";

import { FEED_PAGE_HEADING, FEED_PAGE_SUBTITLE, buildsBelowFloor, orderBuilds } from "@openproduct/contracts";

import { Builds } from "./feed/builds";
import { fetchDirectoryPage, publicApexOrigin } from "./public-api";
import { FailurePanel } from "./ui/failure";
import { PAGE, PAGE_HEAD, PAGE_SUBTITLE, PAGE_TITLE } from "./ui/design";
import { SITE_CARD_ALT, cardMeta } from "./ui/og";

/**
 * Open builds (openproduct-open-builds OB4, D1) — the front page, and the
 * ONLY list.
 *
 * `/` IS THE LIST OF BUILDS IN THE MOST ACTIVE ORDER, and nothing else. The
 * week's day board left the front page with OB4: each day keeps its archive
 * at `/launches/{day}`, outside the nav. PL0 put the catalogue first and the
 * week under it; this retires the board as the product's centre rather than
 * reordering it again (R8). The other three orders are their own addresses
 * under `/builds/` (`build-orders.ts` says why they are not a query string).
 *
 * A SERVER COMPONENT, STATIC, ONE READ — the catalogue's first page. OPC-1
 * requires one cacheable document that resolves no actor; the visitor's own
 * vote state arrives after paint from the XP2 overlay (UV0), so the
 * anonymous and signed-in renders are byte-identical (I6).
 *
 * ONE COLUMN (openproduct-calm CL2, CL-R5). The margin of six panels left
 * with render C: the order's formula is the caption beside the tabs, open
 * roles are the Roles order, the stack tally lives on the topic and stack
 * pages, and the digest is in the footer. The list is the page.
 *
 * NOTHING ON THIS PAGE DECIDES AN ORDER. The catalogue arrives in the
 * published order, and `orderBuilds` (the contract) applies the floor and the
 * comparator every other surface imports.
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
  title: "Open builds · openproduct",
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

export default async function OpenproductFeedPage() {
  const directory = await fetchDirectoryPage();
  // OS1 — the catalogue read is the directory's FIRST PAGE, in the published
  // order; the page after it continues on scroll from a plain link (`next`),
  // and the line says how many there are in all (`total`).
  const cards = directory === null ? null : directory.projects;
  const builds = cards === null ? [] : orderBuilds(cards, "most-active");
  // HB0 — the same array, read once more: what the floor is keeping off.
  const belowFloor = cards === null ? 0 : buildsBelowFloor(cards);

  return (
    <main className={PAGE}>
      <div className={PAGE_HEAD}>
        <div>
          <h1 className={PAGE_TITLE}>{FEED_PAGE_HEADING}</h1>
          <p className={PAGE_SUBTITLE}>{FEED_PAGE_SUBTITLE}</p>
        </div>
      </div>

      {cards === null ? (
        <div className="mt-[48px]">
          <FailurePanel
            kind="unavailable"
            what="The builds could not be loaded. It is not something you did, and trying again in a moment usually works."
            actions={[{ label: "Try again", href: "/" }]}
          />
        </div>
      ) : (
        <Builds
          order="most-active"
          builds={builds}
          belowFloor={belowFloor}
          next={directory?.next ?? null}
          total={directory?.next != null ? (directory.total ?? null) : null}
          computedAt={directory?.computedAt ?? null}
        />
      )}
    </main>
  );
}
