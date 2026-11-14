import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { breadcrumbJsonLd, catalogueMomentCopy, cataloguePagePath, frontPageEligible } from "@openproduct/contracts";

import { PRODUCT_GRID, ProductCard } from "../../feed/product-card";
import { PRODUCTS_MORE_LABEL, productsShownLine } from "../../feed/products";
import { fetchDirectoryPage, publicApexOrigin } from "../../public-api";
import { BOARD_PAGE, BTN_SOFT, EMPTY_NOTE, FOCUS, PAGE_TITLE } from "../../ui/design";
import { JsonLd } from "../../ui/json-ld";
import { AppLink } from "../../ui/link";

/**
 * The catalogue, continued (openproduct-scale OS1).
 *
 * `/products/{cursor}` is the page after the Products page's first, and the
 * page after that, and so on: one document at one address, in the published
 * (default) order, reachable by a plain link. A PATH rather than `?cursor=`,
 * because this app prerenders and revalidates a path the way it does
 * `/launches/{day}` and cannot do that for a query string.
 *
 * THE PRODUCTS PAGE'S OWN CARDS AND FOOT (openproduct-redesign OPR1): the
 * board's grid, the count of what is shown, and *Show more* — here a plain
 * link to the page after, because this document IS the no-JavaScript and
 * crawler's path (`feed/product-list.tsx` reads the same pages in place).
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
    title: "Products — continued",
    description: "Every listed product, in the published order, one page at a time.",
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
  // below it is withheld here as on the first page.
  const shown = page.projects.filter(frontPageEligible);
  const moment = catalogueMomentCopy(page.computedAt);

  return (
    <main className={BOARD_PAGE}>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: "Products", path: "/products" },
            { name: "Products — continued", path: cataloguePagePath(cursor) },
          ],
          publicApexOrigin(),
        )}
      />
      <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1.5 max-sm:px-[2px]">
        <h1 className={PAGE_TITLE}>Products</h1>
        <p className="m-0 font-mono text-label uppercase tracking-[0.1em] text-muted-foreground">
          Continued
          {/* OS5 — the catalogue's moment, as on the first page. */}
          {moment !== null ? (
            <>
              {" · "}
              <time dateTime={page.computedAt ?? undefined} data-catalogue-moment>
                {moment}
              </time>
            </>
          ) : null}
        </p>
      </div>

      <section aria-labelledby="catalogue-page" className="flex min-w-0 flex-col gap-[18px] max-sm:gap-[10px]">
        <h2 id="catalogue-page" className="sr-only">
          Products, continued
        </h2>
        {shown.length > 0 ? (
          <ul className={PRODUCT_GRID} data-product-cards>
            {shown.map((card) => (
              <ProductCard key={card.slug} card={card} returnTo={cataloguePagePath(cursor)} />
            ))}
          </ul>
        ) : (
          <p className={EMPTY_NOTE}>Nothing on this page.</p>
        )}
        <nav aria-label="Product pages" className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 pt-1 max-sm:px-[2px] max-sm:pt-0">
          <span className="font-mono text-label uppercase tracking-[0.1em] text-muted-foreground max-sm:text-mono-label">
            {productsShownLine(shown.length, null)}
          </span>
          <span className="flex flex-wrap items-center gap-[6px]">
            <AppLink href="/products" className={`${BTN_SOFT} ${FOCUS}`}>
              First page
            </AppLink>
            {page.next !== null ? (
              <AppLink href={cataloguePagePath(page.next)} className={`${BTN_SOFT} ${FOCUS}`} data-catalogue-next>
                {PRODUCTS_MORE_LABEL}
              </AppLink>
            ) : null}
          </span>
        </nav>
      </section>
    </main>
  );
}
