import type { Metadata } from "next";
import { EmptyState } from "../../ui/empty-state";
import { notFound } from "next/navigation";

import {
  COLLECTIONS_MEANING,
  COLLECTION_EMPTY_NOTE,
  COLLECTION_EMPTY_WHY,
  COLLECTION_PROVENANCE_NOTE,
  TOPIC_FACET,
  breadcrumbJsonLd,
  collectionPageJsonLd,
  collectionSummary,
  labelOf,
  topicPath,
  visibleCount,
  type CollectionItem,
} from "@openproduct/contracts";

import { fetchCollection, publicApexOrigin } from "../../public-api";
import { JsonLd } from "../../ui/json-ld";
import { ProductTile } from "../../ui/product-tile";
import { ReportControl } from "../../ui/report-control";

import { AppLink } from "../../ui/link";
import { initialsOf } from "../../feed/tile";
import { BADGE_SEAT, CARD, PAGE, PAGE_TITLE, TILE } from "../../ui/design";

/**
 * `/collections/<slug>` (openproduct-commons LC4).
 *
 * THE FEED VIEW, NOT A NEW LAYOUT. A collection is a set of products, and a
 * reader who has learned to read a feed row should not have to learn a
 * second row here: the design draws a collection as the feed view with a
 * page header and one group, and this page is that. What a collection ADDS
 * is the curator's note under each row — the thing a filtered list cannot
 * have.
 *
 * THE ROW IS DRAWN HERE rather than by `FeedRow`, because an item is a
 * profile CARD and not a launch: it has no board day, no rank and no count,
 * so the rank column and the vote box are omitted rather than faked at zero
 * (OPC-C). The measurements are the design's collection row — a 44px tile,
 * the name 15/500, the tagline 13.5 in `--muted`, `14px 18px` of padding —
 * in a 12px card, every row under a `--line` rule.
 *
 * NO SORT CONTROL, AND THAT IS THE POINT. This is the only surface on the
 * estate without one. Offering "sort by most active" over somebody's curation
 * destroys the thing it is: a collection the reader can re-rank is the
 * directory with fewer rows, and the eight-in-this-order claim is gone.
 *
 * AN ITEM WHOSE LISTING STOPPED BEING PUBLIC IS SIMPLY ABSENT. The API drops
 * it, the count is computed from what is shown, and the page never 404s
 * because one of eight went away.
 */
export const revalidate = 60;

/** The design's way back to the index: 13.5px in `--muted`, `--fg` on hover. */
const BACK = "inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground";

/** XP4 — without this the `revalidate` above is accepted and ignored, and the
 *  route is served `no-store` to everybody. See the long note on the same
 *  function in `app/[slug]/page.tsx`; `[]` prerenders nothing and lets the ISR
 *  cache do the work from the first request onward. */
export async function generateStaticParams() {
  return [];
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await fetchCollection(slug);
  if (!collection) return { title: "Collection" };
  return {
    title: collection.title,
    description: collection.blurb ?? COLLECTION_PROVENANCE_NOTE,
    alternates: { canonical: `/collections/${collection.slug}` },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = await fetchCollection(slug);
  // A collection that is not published, or whose curator stopped resolving,
  // is a 404 — and the two are deliberately indistinguishable from outside.
  if (!collection) notFound();

  const count = visibleCount(collection);
  const origin = publicApexOrigin();

  return (
    <main className={PAGE}>
      {/* RE1 — the trail, for a crawler arriving here from a search result
          with no idea that `/collections` exists. */}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: "Collections", path: "/collections" },
            { name: collection.title, path: `/collections/${collection.slug}` },
          ],
          origin,
        )}
      />
      {/* A collection IS a list of listings, in the curator's own order —
          and `numberOfItems` is the length of the array rendered below,
          which is the same `visibleCount` the heading prints rather than a
          stored total (WC-7). */}
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: collection.title,
            description: collection.blurb ?? COLLECTIONS_MEANING,
            path: `/collections/${collection.slug}`,
            paths: collection.items.map((item) => `/${item.card.slug}`),
          },
          origin,
        )}
      />
      {/* The design's way back: one quiet link above the title. */}
      <AppLink href="/collections" className={`tap-h ${BACK}`}>
        ← All collections
      </AppLink>
      {/* The design's page header: the title, the blurb in 16px `--copy`,
          and under them the signature line — the curator's mark, "Curated
          by" and the handle as a LINK. It is the whole of what makes a
          collection publishable (LC-4), and the read never returns one
          whose curator stopped resolving (XP-5). */}
      <header>
        <h1 className={`mt-[18px] ${PAGE_TITLE}`}>{collection.title}</h1>
        {collection.blurb ? (
          <p className="m-0 mt-2.5 max-w-[70ch] text-[16px] leading-[1.55] text-copy">
            {collection.blurb}
          </p>
        ) : null}
        <div className="mt-3.5 flex items-center gap-2 text-[13px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[10px] text-copy"
          >
            {initialsOf(collection.curatorHandle)}
          </span>
          <span>
            Curated by{" "}
            <AppLink
              href={`/@${collection.curatorHandle}`}
              className="text-link underline underline-offset-[3px]"
            >
              @{collection.curatorHandle}
            </AppLink>{" "}
            · {collectionSummary(count)}
          </span>
        </div>
      </header>

      <div className="mt-8 min-w-0">
        {count === 0 ? (
          <EmptyState className={`px-6 py-8 ${TILE}`} says={COLLECTION_EMPTY_NOTE} why={COLLECTION_EMPTY_WHY} />
        ) : (
          // PRODUCTS, not launches: an item is a listing the curator chose,
          // whether or not it ever launched — and in the order they added
          // them, which is the one order this page has (no sort control, by
          // design; see the note at the top of the file).
          <section aria-label="What the curator chose">
            <ol className={`m-0 list-none p-0 ${CARD}`}>
              {collection.items.map((item) => (
                <Row key={item.card.slug} item={item} />
              ))}
            </ol>
          </section>
        )}
      </div>

      <ReportControl
        subjectKind="collection"
        subjectRef={collection.slug}
        returnTo={`/collections/${collection.slug}`}
      />
    </main>
  );
}

/**
 * One item, in the feed row's idiom — see the note at the top of the file
 * for what is omitted and why. Every link in the row is a sibling: the tile,
 * the name and the tagline each go to the product, and the topic to its
 * page. The note sits under the row, outside every link, indented to the
 * text column (12px padding + 52px tile + 14px gap).
 *
 * THE ROW IS THE TARGET (FR2), as on every other list of products: the name
 * is stretched over the row with an `::after`, so what a pointer meets is the
 * row rather than an 18px line of 15px text sitting 2px above a second link
 * to the same place — which is what axe's target-size rule measured once the
 * design shrank the name. The tagline is plain text for the reason
 * `product-card.tsx` gives: under the stretch it was a second tab stop to the
 * same address that nothing could press. The topic sits above the stretch.
 */
function Row({ item }: { item: CollectionItem }) {
  const href = `/${item.card.slug}`;
  const stackLine = item.card.stack.slice(0, 2).join(" · ");
  const topicLabel = item.card.category
    ? (labelOf(TOPIC_FACET, item.card.category) ?? item.card.category)
    : null;
  return (
    <li className="list-none border-t border-line first:border-t-0">
      <div className="relative flex items-center gap-[14px] px-[18px] py-[14px] transition-colors hover:bg-accent max-sm:px-4">
        <AppLink
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className="shrink-0 rounded-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ProductTile slug={item.card.slug} thumbnail={item.card.thumbnail} size={44} />
        </AppLink>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <AppLink
              href={href}
              className="text-[15px] font-medium leading-tight text-foreground after:absolute after:inset-0 after:content-[''] hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {item.card.slug}
            </AppLink>
            {/* Observed at publish, never a maintainer's claim (OPC-7). No
                detected licence renders nothing rather than "unknown". */}
            {item.card.licence ? (
              <span className="text-[13px] tracking-[0.04em] text-muted-foreground">
                {item.card.licence}
              </span>
            ) : null}
            {/* CB2's demand line; zero is a fact, not a disappointment, so
                it is simply not rendered. */}
            {item.card.roleOpeningCount > 0 ? (
              <span className={BADGE_SEAT}>
                {item.card.roleOpeningCount} {item.card.roleOpeningCount === 1 ? "contributor" : "contributors"}{" "}
                wanted
              </span>
            ) : null}
          </div>

          {item.card.tagline ? (
            <p className="m-0 mt-[2px] text-[13px] leading-[1.45] text-muted-foreground">{item.card.tagline}</p>
          ) : null}

          {topicLabel || stackLine ? (
            <div className="relative z-10 mt-[6px] flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
              {topicLabel && item.card.category ? (
                <AppLink href={topicPath(item.card.category)} className="text-muted-foreground hover:text-foreground">
                  {topicLabel}
                </AppLink>
              ) : null}
              {topicLabel && stackLine ? <span className="text-faint">·</span> : null}
              {stackLine ? (
                <span className="font-mono text-[12px] text-muted-foreground">{stackLine}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* THE CURATOR'S NOTE — the thing a collection has that a filtered
          list does not, and the reason somebody reads one. Outside every
          anchor so it is not swallowed by a link target, and marked as
          theirs rather than ours. Indented to the text column: 18px of
          padding, the 44px tile, the 14px gap. */}
      {item.note ? (
        <blockquote className="m-0 mb-3.5 ml-[76px] mr-[18px] border-l-2 border-line pl-3.5 text-[15px] leading-[1.55] text-copy max-sm:ml-4">
          {item.note}
        </blockquote>
      ) : null}
    </li>
  );
}
