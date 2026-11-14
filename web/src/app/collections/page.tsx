import type { Metadata } from "next";
import { EmptyState } from "../ui/empty-state";

import {
  collectionPageJsonLd,
  COLLECTIONS_EMPTY_NOTE,
  COLLECTIONS_MEANING,
  collectionSummary,
} from "@openproduct/contracts";

import { initialsOf } from "../feed/tile";
import { fetchCollections, publicApexOrigin } from "../public-api";
import { JsonLd } from "../ui/json-ld";
import { LIST_CARDS, listOpenGraph } from "../ui/og";
import { FailurePanel } from "../ui/failure";

import { AppLink } from "../ui/link";
import { FOCUS, PAGE, PAGE_SUBTITLE, PAGE_TITLE, TILE, TILE_LINK } from "../ui/design";

/**
 * `/collections` (openproduct-commons LC4).
 *
 * THE DESIGN'S CARD GRID: a 330px-minimum grid at gap 14, each card one
 * anchor into the collection — the title in sans 18/600, the blurb under
 * it, and at the foot the curator's round mark beside their handle and the
 * count. The whole card is the link, so the curator's handle is text here
 * and a link on the collection's own page; an anchor inside an anchor is
 * invalid HTML that browsers repair by splitting the outer one.
 *
 * THE INDEX CARD CARRIES NO MEMBER SLUGS, so the design's row of logo tiles
 * is omitted rather than drawn from a guess — `CollectionCard` is a count, a
 * title, a blurb and a signature, and the tiles would need a second read.
 *
 * EVERY CARD NAMES ITS CURATOR. Not decoration — it is the whole of what
 * makes a collection publishable (LC-4).
 *
 * A FAILED READ IS NOT AN EMPTY INDEX. The two look identical if you let them
 * (the OD5 finding).
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Collections",
  description: COLLECTIONS_MEANING,
  // QE1 — the index's own card.
  ...listOpenGraph(publicApexOrigin(), "collections"),
};

export default async function CollectionsPage() {
  const collections = await fetchCollections();

  if (collections === null) {
    return (
      <FailurePanel
        kind="unavailable"
        what="Collections could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: "/collections" },
          { label: "Browse the directory", href: "/" },
        ]}
      />
    );
  }

  return (
    <main className={PAGE}>
      {/* QE1 — the list, as structured data: every collection the page lists. */}
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: LIST_CARDS.collections.title,
            description: LIST_CARDS.collections.description,
            path: "/collections",
            paths: collections.map((collection) => `/collections/${collection.slug}`),
          },
          publicApexOrigin(),
        )}
      />
      <h1 className={PAGE_TITLE}>Collections</h1>
      <p className={PAGE_SUBTITLE}>Builds grouped by the people who use them.</p>

      {collections.length === 0 ? (
        <EmptyState
          className={`mt-8 px-6 py-10 ${TILE}`}
          says={COLLECTIONS_EMPTY_NOTE}
          // VC0's "one action". The old copy ended "build in the open, and you
          // can publish one", which describes an action without offering one —
          // the reader has to go and find the door themselves.
          action={<AppLink href="/submit" className="tap">Open a build →</AppLink>}
        />
      ) : (
        <ul className="m-0 mt-[48px] grid list-none grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-[14px] p-0 max-sm:mt-8 max-sm:grid-cols-1">
          {collections.map((collection) => (
            <li key={collection.slug} className="flex">
              <AppLink
                href={`/collections/${collection.slug}`}
                className={`flex w-full flex-col gap-[14px] p-6 no-underline ${TILE_LINK} ${FOCUS}`}
              >
                <div>
                  <div className="font-sans text-card-title font-semibold tracking-[-0.01em] text-foreground">
                    {collection.title}
                  </div>
                  {collection.blurb ? (
                    <p className="m-0 mt-1.5 text-[15px] leading-[1.5] text-copy">
                      {collection.blurb}
                    </p>
                  ) : null}
                </div>

                {/* THE SIGNATURE, at the foot of every card: the curator's
                    mark, their handle and what the collection shows. The
                    count is what is PUBLIC, never what is held — see
                    `collectionSummary`. The read does not return a
                    collection whose curator stopped resolving, so the
                    handle can never be a dead one (XP-5). */}
                <div className="mt-auto flex items-center gap-2 text-[13px] text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[9.5px] text-copy"
                  >
                    {initialsOf(collection.curatorHandle)}
                  </span>
                  <span>
                    @{collection.curatorHandle} · {collectionSummary(collection.count)}
                  </span>
                </div>
              </AppLink>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
