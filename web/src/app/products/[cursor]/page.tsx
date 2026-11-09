import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  CATALOGUE_NEXT_LABEL,
  FEED_CATALOGUE_HEADING,
  breadcrumbJsonLd,
  cataloguePageMeta,
  catalogueMomentCopy,
  cataloguePagePath,
  frontPageEligible,
} from "@openproduct/contracts";

import { BuildTile } from "../../feed/build-tile";
import { fetchDirectoryPage, publicApexOrigin } from "../../public-api";
import { JsonLd } from "../../ui/json-ld";
import { AppLink } from "../../ui/link";
import { LINK_QUIET, PAGE, PAGE_HEAD, PAGE_SUBTITLE, PAGE_TITLE } from "../../ui/design";

/**
 * The catalogue, continued (openproduct-scale OS1).
 *
 * `/products/{cursor}` is the page after the front page's product list,
 * and the page after that, and so on: one document at one address, in the
 * published order, reachable by a plain link. A PATH rather than `/?cursor=`,
 * because this app prerenders and revalidates a path the way it does
 * `/launches/{day}` and cannot do that for a query string; and `/products`
 * itself stays the front page, as it always redirected.
 *
 * The cursor is opaque here as everywhere: this page hands it to the
 * directory and renders what comes back. It decodes nothing, because a page
 * that understood cursors would be a second copy of the ordering (OS-1).
 */
export const revalidate = 60;

/** XP4 — without this the `revalidate` above is accepted and ignored. */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ cursor: string }> }): Promise<Metadata> {
  const { cursor } = await params;
  return {
    title: `${FEED_CATALOGUE_HEADING} — continued`,
    description: "Every published listing, in the published order, one page at a time.",
    alternates: { canonical: cataloguePagePath(cursor) },
  };
}

export default async function CataloguePage({ params }: { params: Promise<{ cursor: string }> }) {
  const { cursor } = await params;
  const page = await fetchDirectoryPage(cursor);
  // A cursor the directory did not issue is refused (422), and a refused
  // address is a 404 — the same answer `/{slug}` gives an unknown listing,
  // and NOT a soft 200 with a panel in it, which a crawler would index and
  // the edge would cache. No Suspense boundary sits above this call (the
  // rule `[slug]/page.tsx` records), so the status is the status.
  if (page === null) notFound();

  // The floor governs the catalogue wherever it is rendered (IN3): a listing
  // below it is withheld here as on the front page.
  const shown = page.projects.filter(frontPageEligible);

  return (
    <main className={PAGE}>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: FEED_CATALOGUE_HEADING, path: "/" },
            { name: `${FEED_CATALOGUE_HEADING} — continued`, path: cataloguePagePath(cursor) },
          ],
          publicApexOrigin(),
        )}
      />
      <div className={PAGE_HEAD}>
        <div>
          <h1 className={PAGE_TITLE}>{FEED_CATALOGUE_HEADING}</h1>
          <p className={PAGE_SUBTITLE}>
            {cataloguePageMeta(shown.length, page.total)}
            {/* OS5 — the catalogue's moment, as on the front page. */}
            {catalogueMomentCopy(page.computedAt) !== null ? (
              <>
                {" · "}
                <time dateTime={page.computedAt ?? undefined} data-catalogue-moment>
                  {catalogueMomentCopy(page.computedAt)}
                </time>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <section aria-labelledby="catalogue-page" className="mt-5">
        <h2 id="catalogue-page" className="sr-only">
          {FEED_CATALOGUE_HEADING}, continued
        </h2>
        {shown.length > 0 ? (
          <ul className="m-0 grid list-none gap-[14px] p-0">
            {shown.map((card) => (
              <BuildTile key={card.slug} card={card} />
            ))}
          </ul>
        ) : (
          <p className="m-0 rounded-[12px] border border-dashed border-border px-5 py-10 text-center text-[15px] text-muted-foreground">
            Nothing on this page.
          </p>
        )}
        <nav aria-label="Catalogue pages" className="mt-6 flex flex-wrap items-center gap-6 text-[14px] text-copy">
          <AppLink href="/" className={`tap ${LINK_QUIET}`}>
            ← The front page
          </AppLink>
          {page.next !== null ? (
            <AppLink
              href={cataloguePagePath(page.next)}
              className={`tap font-medium ${LINK_QUIET}`}
              data-catalogue-next
            >
              {CATALOGUE_NEXT_LABEL} →
            </AppLink>
          ) : null}
        </nav>
      </section>
    </main>
  );
}
