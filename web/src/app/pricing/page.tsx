import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PRICING_MEANING,
  PRICING_PATH,
  PRICING_TITLE,
  collectionPageJsonLd,
  pricingPath,
  pricingTally,
} from "@openproduct/contracts";

import { fetchPublicDirectory, publicApexOrigin } from "../public-api";
import { listOpenGraph } from "../ui/og";
import { JsonLd } from "../ui/json-ld";
import { FOCUS, PAGE, PAGE_TITLE, TILE } from "../ui/design";
import { AppLink } from "../ui/link";

/**
 * `/pricing` (openproduct-worldclass-v2 PP3) — the four answers, each with
 * how many listed products gave it.
 *
 * BUILT THE WAY `/stack` IS BUILT, and for the same reason: the filter is a
 * path, the document is the same bytes for every reader (WC-4, I6), and the
 * count under each answer is the length of the list the answer's page
 * renders (WC-7). Nothing here reads `searchParams` or a session.
 *
 * EVERY VALUE IS LISTED, chosen or not. A topic with nothing in it cannot be
 * reached, because a category's absence means nobody chose it; a pricing
 * answer nobody has given yet is still one of the four honest answers, and a
 * reader deciding what to filter by should see the whole vocabulary.
 */
export const revalidate = 600;

/** XP4 — without this the `revalidate` above is accepted and ignored. */
export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  title: PRICING_TITLE,
  description: PRICING_MEANING,
  ...(publicApexOrigin()
    ? { alternates: { canonical: `${publicApexOrigin()}${PRICING_PATH}` } }
    : {}),
  // QE1 — the index's own card.
  ...listOpenGraph(publicApexOrigin(), "pricing"),
};

export default async function PricingPage() {
  const cards = await fetchPublicDirectory();
  // Null means the directory could not be read — not that nothing costs
  // anything. An empty room and a locked door look nothing alike.
  if (cards === null) notFound();

  const tally = pricingTally(cards);
  const origin = publicApexOrigin();

  return (
    <main className={PAGE}>
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: PRICING_TITLE,
            description: PRICING_MEANING,
            path: PRICING_PATH,
            paths: tally.map((entry) => pricingPath(entry.value)),
          },
          origin,
        )}
      />
      <h1 className={PAGE_TITLE}>
        {PRICING_TITLE}
      </h1>
      {/* OPC-4 — what this list IS, where the list begins. */}

      <ul className="m-0 mt-[48px] grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-[14px] p-0 max-sm:mt-8">
        {tally.map((entry) => (
          <li
            key={entry.value}
            className={`flex flex-col gap-[10px] p-6 ${TILE}`}
          >
            <AppLink
              href={pricingPath(entry.value)}
              className={`tap self-start font-sans text-card-title font-semibold tracking-[-0.01em] text-foreground ${FOCUS}`}
            >
              {entry.label}
            </AppLink>
            <span className="text-[13px] text-muted-foreground">
              {entry.products} {entry.products === 1 ? "product" : "products"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
