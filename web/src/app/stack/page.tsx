import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  STACKS_MEANING,
  STACKS_PATH,
  STACKS_TITLE,
  collectionPageJsonLd,
  stackPath,
  stackTally,
} from "@openproduct/contracts";

import { fetchPublicDirectory, publicApexOrigin } from "../public-api";
import { listOpenGraph } from "../ui/og";
import { JsonLd } from "../ui/json-ld";

import { AppLink } from "../ui/link";
import { EMPTY_NOTE, FOCUS, PAGE, PAGE_TITLE, TILE } from "../ui/design";

/**
 * `/stack` (openproduct-worldclass VC1) — every language a listed product is
 * built with.
 *
 * THE OTHER HALF OF THE AUDIT'S MISSING FILTERS. P1·11 asked for topic and
 * stack filters; a category has been an address since TP0 and this is the
 * language half. The long argument for why a stack page answers the DIRECTORY
 * question where a topic page answers the BOARD's is at the top of
 * `contracts/stacks.ts`, and the short version is arithmetic: there are
 * fifty-seven stack values and one week of launches.
 *
 * ONE READ, AND IT IS THE DIRECTORY'S OWN. The number on a card here and the
 * length of the list behind it are two reads of one array (**WC-7**) — a
 * count computed by one query beside a list produced by another is exactly the
 * defect that rule names.
 *
 * A VALUE NOBODY USES GETS NO CARD, and therefore no page. `/topics` states
 * the same rule and DS1 stated it first: a grid of values that lead to empty
 * pages is a grid of broken links with numbers beside them.
 *
 * NO FOLLOW CONTROL, and the absence is the point. FL0's follows have two
 * kinds — a topic and a maker — and a stack is neither. Adding a third would
 * be a notification plane decision (what does a Rust follower get told
 * about?), and this milestone is a filter, not a subscription.
 */
export const revalidate = 600;

/** XP4 — without this the `revalidate` above is accepted and ignored, and the
 *  route is served `no-store` to everybody. */
export async function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  title: STACKS_TITLE,
  description: STACKS_MEANING,
  ...(publicApexOrigin()
    ? { alternates: { canonical: `${publicApexOrigin()}/stack` } }
    : {}),
  // QE1 — the index's own card.
  ...listOpenGraph(publicApexOrigin(), "stack"),
};

export default async function StacksPage() {
  const cards = await fetchPublicDirectory();
  // Null means the directory could not be read at all — not that nothing is
  // built with anything. An empty room and a locked door look nothing alike
  // to a visitor (the OD5 finding, kept).
  if (cards === null) notFound();

  const tally = stackTally(cards);
  const origin = publicApexOrigin();

  return (
    <main className={PAGE}>
      {/* RE1's own helper, not a second one. `numberOfItems` is `paths.length`
          in there — the list's own length rather than a number passed beside
          it — which is what stops the count and the list disagreeing (WC-7),
          and is exactly the property this page is built around anyway.

          NO BREADCRUMB. `/stack` is one rung deep and `breadcrumbJsonLd`
          refuses a trail of one; the value pages below carry the two-rung
          trail instead. */}
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: STACKS_TITLE,
            description: STACKS_MEANING,
            path: STACKS_PATH,
            paths: tally.map((entry) => stackPath(entry.value)),
          },
          origin,
        )}
      />
      <h1 className={PAGE_TITLE}>{STACKS_TITLE}</h1>
      {/* OPC-4 — what this list IS, where the list begins. */}

      {tally.length === 0 ? (
        // VC0's rule: the fact first, in one sentence, and never a card
        // standing empty under a heading.
        <p className={`mt-8 ${EMPTY_NOTE}`}>
          Nothing here yet.
        </p>
      ) : (
        <ul className="m-0 mt-[48px] grid list-none grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-[14px] p-0 max-sm:mt-8">
          {tally.map((entry) => (
            <li
              key={entry.value}
              className={`flex flex-col gap-[10px] p-6 ${TILE}`}
            >
              <AppLink
                href={stackPath(entry.value)}
                className={`tap self-start font-sans text-card-title font-semibold tracking-[-0.01em] text-foreground ${FOCUS}`}
              >
                {entry.label}
              </AppLink>
              {/* PRODUCTS, not "listings" and not "uses": the thing counted is
                  a product, once, however many of its own spellings fold to
                  this value. */}
              <span className="text-[13px] text-muted-foreground">
                {entry.products} {entry.products === 1 ? "product" : "products"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
