import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  STACKS_PATH,
  STACKS_TITLE,
  breadcrumbJsonLd,
  byMostActive,
  cardsWithStack,
  collectionPageJsonLd,
  stackLabel,
  stackMeaning,
  stackPath,
} from "@openproduct/contracts";

import { BuildTile } from "../../feed/build-tile";
import { fetchPublicDirectory, publicApexOrigin } from "../../public-api";
import { JsonLd } from "../../ui/json-ld";

import { AppLink } from "../../ui/link";
import { CRUMBS, LINK_QUIET, PAGE, PAGE_TITLE } from "../../ui/design";

/**
 * `/stack/{value}` (openproduct-worldclass VC1) — the directory, filtered to
 * one language.
 *
 * NOT THE BOARD FILTERED, and `contracts/stacks.ts` carries the argument: a
 * category earns a board because there are a dozen of them and a week of
 * launches spreads across them; there are fifty-seven stack values, and a
 * board filtered to Erlang is empty most weeks. The question anybody actually
 * asks about a language is *who is building with this*, which is a directory
 * question, and the sentence under the title says so rather than leaving a
 * reader to infer which list they are looking at.
 *
 * A VALUE THE VOCABULARY DOES NOT HAVE IS A 404, not a page titled after
 * whatever was typed into the path. `stackLabel` is the gate, and it is the
 * same published vocabulary the count and the rail read.
 *
 * A VALUE NOTHING USES IS A PAGE, not a 404 — and that is the one place this
 * differs from `/topics/{value}`. A topic with nothing in it cannot be reached
 * (no card, no page), because a category is assigned and its absence means
 * nobody chose it. A stack value's absence is ambiguous: nobody uses it, OR
 * nobody has said so, and CT1's canonicalisation only sees what maintainers
 * wrote. `STACK_EMPTY_NOTE` says exactly that, which a 404 could not.
 *
 * THE ORDER IS PUBLISHED (OPC-4). `byMostActive` is the directory's own
 * default, its sentence is at `/docs/formulas#sort-most-active`, and the link
 * is under the list — this page does not sort anything a second way.
 *
 * NOTHING HERE READS `searchParams` OR A SESSION (WC-4, I6). The filter is the
 * path; the document is the same bytes for every reader; `revalidate` works
 * because the route is not dynamic.
 */
export const revalidate = 600;

/** XP4 — without this the `revalidate` above is accepted and ignored. `[]`
 *  prerenders nothing and lets the ISR cache do the work from the first
 *  request onward. */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ value: string }>;
}): Promise<Metadata> {
  const { value } = await params;
  const label = stackLabel(decodeURIComponent(value));
  if (label === null) return { title: STACKS_TITLE };
  const origin = publicApexOrigin();
  return {
    title: `Built with ${label}`,
    description: stackMeaning(label),
    ...(origin
      ? { alternates: { canonical: `${origin}${stackPath(decodeURIComponent(value))}` } }
      : {}),
  };
}

export default async function StackPage({ params }: { params: Promise<{ value: string }> }) {
  const { value: raw } = await params;
  const value = decodeURIComponent(raw);
  const label = stackLabel(value);
  if (label === null) notFound();

  const cards = await fetchPublicDirectory();
  if (cards === null) notFound();

  // ONE READ, TWO USES: the list here and the count in the rail are the same
  // array (WC-7).
  const products = [...cardsWithStack(cards, value)].sort(byMostActive);
  const origin = publicApexOrigin();
  const path = stackPath(value);

  return (
    <main className={PAGE}>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: STACKS_TITLE, path: STACKS_PATH },
            { name: label, path },
          ],
          origin,
        )}
      />
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: `Built with ${label}`,
            description: stackMeaning(label),
            path,
            paths: products.map((card) => `/${card.slug}`),
          },
          origin,
        )}
      />

      {/* The design's breadcrumb: the index underlined, then this value in
          `--fg`. The same two rungs the JSON-LD trail above carries. */}
      <nav aria-label="Breadcrumb" className={CRUMBS}>
        <AppLink className={`tap ${LINK_QUIET}`} href={STACKS_PATH}>
          {STACKS_TITLE}
        </AppLink>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{label}</span>
      </nav>
      <h1 className={`mt-4 ${PAGE_TITLE}`}>{label}</h1>
      {/* OPC-4 — what this list is, and which of the two lists it is, said
          where the list begins. */}

      {products.length === 0 ? (
        <p className="m-0 mt-[26px] rounded-[12px] border border-dashed border-border px-5 py-10 text-center text-[15px] leading-[1.6] text-muted-foreground">
          Nothing here yet.
        </p>
      ) : (
        <>
          <ul className="m-0 mt-8 grid list-none gap-[14px] p-0">
            {products.map((card) => (
              <BuildTile key={card.slug} card={card} returnTo={path} />
            ))}
          </ul>
          {/* The order's own sentence, at its own address — the same 12.5px
              note every list on this estate carries. */}
        </>
      )}
    </main>
  );
}
