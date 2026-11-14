import type { Metadata } from "next";

import { FEED_PAGE_SUBTITLE } from "@openproduct/contracts";

import { publicApexOrigin } from "../public-api";

/**
 * Products (openproduct-redesign OPR1) — the address the header's second
 * pill goes to.
 *
 * THE SAME LIST `/` DRAWS TODAY, AT ITS OWN ADDRESS. `/products` redirected
 * to `/` since the faceted directory was retired; the redesign makes
 * Products a section of its own (board `Products`) and turns `/` into the
 * feed of posts (OPR2). Until the Products page is rebuilt to its board,
 * this address renders the front page's component unchanged, so the nav has
 * no dead link and no second copy of the list exists to drift.
 *
 * Static and cacheable exactly as `/` is: the same one read, the same bytes
 * for every visitor (I6). The page after this one is `/products/{cursor}`,
 * as it always was.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Products",
  description: FEED_PAGE_SUBTITLE,
  ...(publicApexOrigin() ? { alternates: { canonical: `${publicApexOrigin()}/products` } } : {}),
};

export { default } from "../page";
