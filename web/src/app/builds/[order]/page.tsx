import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  BUILD_ORDER_LABEL,
  BUILD_ORDER_PAGE_SIZE,
  BUILD_ORDER_SEGMENTS,
  FEED_PAGE_HEADING,
  FEED_PAGE_SUBTITLE,
  buildOrderPath,
  buildsBelowFloor,
  isBuildOrder,
  orderBuilds,
} from "@openproduct/contracts";

import { Builds } from "../../feed/builds";
import { fetchAllDirectoryProjects, publicApexOrigin } from "../../public-api";
import { FailurePanel } from "../../ui/failure";
import { PAGE, PAGE_HEAD, PAGE_SUBTITLE, PAGE_TITLE } from "../../ui/design";

/**
 * Open builds, in one of the other three orders (openproduct-open-builds OB4).
 *
 * `/builds/newest`, `/builds/upvoted`, `/builds/roles` — ONE BODY, THREE
 * ADDRESSES, the leaderboard's pattern (UV2): an order is a path segment
 * because a page that reads its query string goes out `no-store`, and each of
 * these is one cacheable document (OPC-1). `/` is Most active, and these
 * three are views of the same list under the same control.
 *
 * `/builds/roles` IS NOT SERVED FROM HERE ANY MORE: since openproduct-redesign
 * OPR1 it redirects (from the edge, `next.config.mjs`) to `/help-wanted`,
 * which renders this page's body for the Roles order. The order itself stays
 * in the contract and in this component.
 *
 * THE WHOLE CATALOGUE, THEN THE ORDER. The catalogue API pages in Most
 * active's order (OS-1), so a different order needs every listed build first:
 * `fetchAllDirectoryProjects` walks the pages (bounded, as the sitemap's walk
 * is), `orderBuilds` applies the floor and the order, and the page draws the
 * first `BUILD_ORDER_PAGE_SIZE` with a line that says "first N of M" rather
 * than going quiet about the rest.
 */
export const revalidate = 60;

/**
 * XP4 — the three orders are prerendered so the route is registered for ISR
 * at all (see the note on the same function in `app/[slug]/page.tsx`).
 *
 * `dynamicParams` STAYS AT ITS DEFAULT. Set to `false`, Next serves only what
 * the build prerendered — and this worker's incremental cache is the Workers
 * Cache API (`open-next.config.ts`), which starts every deploy empty, so all
 * three orders answered 404 in production. Left true, the first request in a
 * data centre renders the order and the cache keeps it; a segment that is not
 * an order still 404s, from `notFound()` below.
 */
export function generateStaticParams() {
  return BUILD_ORDER_SEGMENTS.map((order) => ({ order }));
}

export async function generateMetadata({ params }: { params: Promise<{ order: string }> }): Promise<Metadata> {
  const { order } = await params;
  if (!isBuildOrder(order) || order === "most-active") return {};
  const origin = publicApexOrigin();
  return {
    title: `${FEED_PAGE_HEADING} — ${BUILD_ORDER_LABEL[order].toLowerCase()}`,
    description: FEED_PAGE_SUBTITLE,
    ...(origin ? { alternates: { canonical: `${origin}${buildOrderPath(order)}` } } : {}),
  };
}

export default async function BuildsInOrderPage({ params }: { params: Promise<{ order: string }> }) {
  const { order } = await params;
  if (!isBuildOrder(order) || order === "most-active") notFound();

  const cards = await fetchAllDirectoryProjects();
  const ordered = cards === null ? [] : orderBuilds(cards, order);
  const shown = ordered.slice(0, BUILD_ORDER_PAGE_SIZE);
  const belowFloor = cards === null ? 0 : buildsBelowFloor(cards);

  // ONE COLUMN, as `/` (openproduct-calm CL2, CL-R5): the same list in another
  // order, with no margin beside it.
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
            actions={[
              { label: "Try again", href: buildOrderPath(order) },
              { label: "Most active", href: "/" },
            ]}
          />
        </div>
      ) : (
        <Builds
          order={order}
          builds={shown}
          belowFloor={belowFloor}
          total={ordered.length > shown.length ? ordered.length : null}
        />
      )}
    </main>
  );
}
