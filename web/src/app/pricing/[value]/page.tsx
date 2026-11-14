import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PRICING_PATH,
  PRICING_TITLE,
  breadcrumbJsonLd,
  byMostActive,
  cardsWithPricing,
  collectionPageJsonLd,
  pricingLabel,
  pricingMeaning,
  pricingPath,
} from "@openproduct/contracts";

import { ProductCard } from "../../feed/product-card";
import { fetchPublicDirectory, publicApexOrigin } from "../../public-api";
import { JsonLd } from "../../ui/json-ld";
import { AppLink } from "../../ui/link";
import { CRUMBS, EMPTY_NOTE, LINK_QUIET, PAGE, PAGE_TITLE } from "../../ui/design";

/**
 * `/pricing/{value}` (openproduct-worldclass-v2 PP3) — the directory,
 * filtered to one pricing answer.
 *
 * THE FILTER IS AN ADDRESS, and it is a path rather than `/?pricing=free`
 * because the front page is one cached document that reads no
 * `searchParams` (WC-4, I6), and because this product's other two facet
 * filters — `/topics/{value}`, `/stack/{value}` — are paths. Same shape,
 * same rules: a value the vocabulary does not have is a 404; a value nothing
 * uses is a page with a sentence, because "nobody said so" is an answer a
 * 404 cannot give; the order is the directory's own and its sentence is
 * linked under the list (OPC-4).
 *
 * WHAT THE PAGE DOES NOT CLAIM. The heading is the maintainers' description
 * of what using the product costs. It is not a price this estate charges,
 * collects or checks, and `pricingMeaning` says so where the list begins.
 */
export const revalidate = 600;

/** XP4 — without this the `revalidate` above is accepted and ignored. */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ value: string }>;
}): Promise<Metadata> {
  const { value } = await params;
  const label = pricingLabel(decodeURIComponent(value));
  if (label === null) return { title: PRICING_TITLE };
  const origin = publicApexOrigin();
  return {
    title: `${label} · ${PRICING_TITLE}`,
    description: pricingMeaning(label),
    ...(origin
      ? { alternates: { canonical: `${origin}${pricingPath(decodeURIComponent(value))}` } }
      : {}),
  };
}

export default async function PricingValuePage({
  params,
}: {
  params: Promise<{ value: string }>;
}) {
  const { value: raw } = await params;
  const value = decodeURIComponent(raw);
  const label = pricingLabel(value);
  if (label === null) notFound();

  const cards = await fetchPublicDirectory();
  if (cards === null) notFound();

  // ONE READ, TWO USES: the list here and the count on `/pricing` are the
  // same filter over the same array (WC-7).
  const products = [...cardsWithPricing(cards, value)].sort(byMostActive);
  const origin = publicApexOrigin();
  const path = pricingPath(value);

  return (
    <main className={PAGE}>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: PRICING_TITLE, path: PRICING_PATH },
            { name: label, path },
          ],
          origin,
        )}
      />
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: `${label} · ${PRICING_TITLE}`,
            description: pricingMeaning(label),
            path,
            paths: products.map((card) => `/${card.slug}`),
          },
          origin,
        )}
      />

      {/* The design's breadcrumb: the index underlined, then this value in
          `--fg`. The same two rungs the JSON-LD trail above carries. */}
      <nav aria-label="Breadcrumb" className={CRUMBS}>
        <AppLink className={`tap ${LINK_QUIET}`} href={PRICING_PATH}>
          {PRICING_TITLE}
        </AppLink>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{label}</span>
      </nav>
      <h1 className={`mt-4 ${PAGE_TITLE}`}>{label}</h1>
      {/* OPC-4 — what this list is, said where the list begins. */}

      {products.length === 0 ? (
        <p className={`mt-8 ${EMPTY_NOTE}`}>
          Nothing here yet.
        </p>
      ) : (
        <>
          <ul className="m-0 mt-8 grid list-none gap-[14px] p-0">
            {products.map((card) => (
              <ProductCard key={card.slug} card={card} returnTo={path} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
