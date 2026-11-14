import type { Metadata } from "next";

import {
  collectionPageJsonLd,
  SEARCH_LAUNCH_LIMIT,
  SEARCH_PROMPT,
  SEARCH_SCOPE_NOTE,
  searchTitle,
  type SearchTopicHit,
} from "@openproduct/contracts";

import { RESULT_CARD, SEARCH_COLUMN } from "./frame";
import { PersonRow } from "./person-row";
import { ProductFollow } from "./product-follow";
import { SearchField } from "./search-field";
import { SearchView } from "./search-view";
import {
  SEARCH_UNAVAILABLE,
  highlightParts,
  resultTotal,
  totalLabel,
  type SearchCounts,
  type SearchPerson,
} from "./segments";

import { fetchSearch, publicApexOrigin, type SearchDocument } from "../public-api";
import { EYEBROW, FOCUS, PAGE_TITLE } from "../ui/design";
import { JsonLd } from "../ui/json-ld";
import { listOpenGraph } from "../ui/og";
import { ProductTile } from "../ui/product-tile";

import { AppLink } from "../ui/link";

/**
 * `/search?q=` — the results page (openproduct-launch SR0; rebuilt to boards
 * `Search` and `PhoneSearch` in openproduct-redesign OPR1).
 *
 * ─── IT IS CRAWLABLE AND IT IS NOT CACHED, AND THOSE ARE DIFFERENT ──────
 *
 * SR0's done-when asks only for the first. A page that reads `searchParams` is
 * DYNAMIC in Next 15 — a `revalidate` beside it is accepted and silently
 * ignored, which is precisely the defect XP4's route census exists to catch,
 * and six routes shipped that way once. So this page declares none. It renders
 * on the server, returns 200 with its content and its metadata, and a crawler
 * reads it perfectly well.
 *
 * What it does not do is sit in an ISR cache keyed on an unbounded query
 * space. The reads BEHIND it are cached for 60 seconds at the gateway, which
 * is where the caching belongs: one document per query, shared by everybody
 * who asks it.
 *
 * ─── NO ACTOR, SO I6 STILL HOLDS ────────────────────────────────────────
 *
 * The same query gives the same bytes to every visitor, signed in or out. This
 * page reads no cookie and no session; the overlay decorates it after paint
 * like every other public surface (a row's Follow learns its state there).
 *
 * ─── THREE CLASSES, THREE MECHANISMS ────────────────────────────────────
 *
 * Products come from the DS0 index; people from a LIVE read that applies CG2's
 * four eligibility conditions; topics from the contract's own vocabulary, with
 * no read at all. The argument for the middle one — that an index is a cached
 * answer to "is this person public", and its staleness is unbounded where a
 * live read's is the same 60 seconds as `/@handle` itself — is at the top of
 * `contracts/search-page.ts`.
 *
 * ─── THE BOARD ──────────────────────────────────────────────────────────
 *
 * The result count as a mono label over the query as the page title; a
 * segmented control, All and one segment per class, each with its count;
 * then a flat card per class — product rows (tile, name, the summary with
 * the matched words marked, Follow), person rows, topic chips. A class with
 * nothing in it is not drawn, and a query that found nothing says
 * `No matches.` once.
 *
 * WHAT THE BOARD DRAWS AND THE READ DOES NOT CARRY is left out, not faked: a
 * product's stage (stored from OPR2), a person's products (the row opens
 * them when a response has them — `person-row.tsx`), and posts, which is why
 * the fourth segment is Topics (`segments.ts`).
 *
 * ON A PHONE the page's own field leads (the header's search is a link here)
 * and the title is for a screen reader only: the field already shows the
 * query, at the top of the screen, and the board draws no second copy.
 */

interface PageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

function queryOf(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  // Bounded before it is echoed anywhere. A query is rendered in the heading
  // and in the title, and an unbounded one is a page whose <title> is a
  // paragraph.
  return value.trim().slice(0, 120);
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const q = queryOf((await searchParams).q);
  const apex = publicApexOrigin();
  return {
    title: searchTitle(q),
    description: SEARCH_SCOPE_NOTE,
    // NOINDEX ON A QUERY, INDEXABLE WITHOUT ONE. Crawlable is not the same as
    // worth indexing: a search result page for every string anybody ever
    // linked is thin content by any measure, and Google has said so for
    // fifteen years. The bare `/search` is a real page and may be indexed.
    robots: q.length === 0 ? undefined : { index: false, follow: true },
    ...(apex && q.length === 0 ? { alternates: { canonical: `${apex}/search` } } : {}),
    // QE1 — the page's own card, query or no query: a shared search is a
    // shared address, and it unfurls as what it is.
    ...listOpenGraph(apex, "search"),
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const q = queryOf((await searchParams).q);
  // ONE READ, and only when there is something to ask. An empty query does not
  // touch the network: core answers an empty query with nothing anyway.
  const doc = q.length === 0 ? null : await fetchSearch(q);
  const products = doc ? doc.results.slice(0, SEARCH_LAUNCH_LIMIT) : [];
  const people: readonly SearchPerson[] = doc ? doc.makers : [];
  const topics = doc ? doc.topics : [];
  const counts: SearchCounts = {
    products: products.length,
    people: people.length,
    topics: topics.length,
  };
  // Where a row's Follow returns after sign-in: this page, query and all.
  const here = `/search?q=${encodeURIComponent(q)}`;

  return (
    <main className={SEARCH_COLUMN}>
      {/* QE1 — the results, as structured data, when there are any. The bare
          address is a form, and a form is not a list. */}
      {doc && doc.results.length > 0 ? (
        <JsonLd
          data={collectionPageJsonLd(
            {
              name: searchTitle(q),
              description: SEARCH_SCOPE_NOTE,
              path: here,
              paths: doc.results.map((hit) => `/${hit.entityId}`),
            },
            publicApexOrigin(),
          )}
        />
      ) : null}

      {/* The phone's field: a real GET form, focused when nothing is asked
          yet. Not displayed from `sm` up, where the header has the field. */}
      <SearchField query={q} label={SEARCH_PROMPT} focusOnArrival={q.length === 0} maxLength={120} />

      {/* The count over the query. On a phone the field above already shows
          the query, so the pair is kept for a screen reader and not drawn. */}
      <div className="flex flex-col gap-[6px] max-sm:sr-only">
        {doc ? <span className={EYEBROW}>{totalLabel(resultTotal(counts))}</span> : null}
        <h1 className={`${PAGE_TITLE} [overflow-wrap:anywhere]`}>
          {q.length === 0 ? "Search" : <>&ldquo;{q}&rdquo;</>}
        </h1>
      </div>

      {q.length === 0 ? null : doc === null ? (
        // OD5 — a failed read and an empty result look nothing alike.
        // Printing "No matches" over a search that could not run would send
        // somebody away believing the commons is empty.
        <p
          role="status"
          className="m-0 rounded-[16px] bg-card p-8 text-center text-[15px] text-muted-foreground max-sm:px-[14px] max-sm:py-6"
        >
          {SEARCH_UNAVAILABLE}
        </p>
      ) : (
        <SearchView
          counts={counts}
          products={
            <ul className={RESULT_CARD}>
              {products.map((hit) => (
                <ProductRow key={hit.entityId} hit={hit} query={q} returnTo={here} />
              ))}
            </ul>
          }
          people={
            <ul className={RESULT_CARD}>
              {people.map((person) => (
                <PersonRow key={person.handle} person={person} />
              ))}
            </ul>
          }
          topics={
            <ul className="m-0 flex list-none flex-wrap gap-2 rounded-[16px] bg-card p-4 max-sm:p-3">
              {topics.map((topic) => (
                <TopicChip key={topic.value} topic={topic} />
              ))}
            </ul>
          }
        />
      )}
    </main>
  );
}

/**
 * A product in the results: its tile, its name, its summary with the matched
 * words marked, and Follow — which follows the product (design.md §2 rule 3).
 *
 * NO STAGE BESIDE THE NAME. The board prints `Shipping` or `Idea` there; a
 * product has no stored stage until OPR2 adds `profiles.stage`, and the index
 * returns none, so the row says nothing rather than guessing.
 *
 * THE NAME'S LINK COVERS THE ROW (FR2) — one anchor, stretched, rather than
 * a row-wide anchor with a button inside it, which is invalid HTML. The tile
 * goes where the name goes and is therefore out of the tab order; Follow
 * sits above the stretch.
 */
function ProductRow({
  hit,
  query,
  returnTo,
}: {
  hit: SearchDocument["results"][number];
  query: string;
  returnTo: string;
}) {
  const href = `/${hit.entityId}`;
  return (
    <li
      data-keyrow
      className="relative flex list-none items-center gap-[14px] border-t border-line px-[10px] py-3 first:border-t-0 max-sm:gap-3 max-sm:px-0 max-sm:py-[10px]"
    >
      <AppLink href={href} tabIndex={-1} aria-hidden="true" className="shrink-0">
        <ProductTile slug={hit.entityId} thumbnail={hit.thumbnail} size={44} />
      </AppLink>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <AppLink
          href={href}
          className={`self-start text-[15px] font-semibold text-foreground no-underline after:absolute after:inset-0 after:content-[''] ${FOCUS}`}
        >
          {hit.title}
        </AppLink>
        {hit.summary ? (
          <p className="m-0 truncate text-[13px] text-muted-foreground max-sm:line-clamp-2 max-sm:whitespace-normal max-sm:leading-[1.4]">
            {highlightParts(hit.summary, query).map((part, index) =>
              part.hit ? (
                // The board's highlight: the amber tint under ink, 4px corners.
                <mark key={index} className="rounded-[4px] bg-amber-soft px-[2px] text-foreground">
                  {part.text}
                </mark>
              ) : (
                part.text
              ),
            )}
          </p>
        ) : null}
      </div>
      <ProductFollow slug={hit.entityId} name={hit.title} returnTo={returnTo} />
    </li>
  );
}

/** A topic, linking to the topic's own page: a pill on the 6% ink wash, 40px
 *  (44px on a phone). No count beside it — the search document carries none. */
function TopicChip({ topic }: { topic: SearchTopicHit }) {
  return (
    <li className="list-none">
      <AppLink
        href={topic.href}
        className={`inline-flex min-h-[40px] items-center rounded-full bg-foreground/[0.06] px-4 text-[13px] font-semibold text-foreground no-underline max-sm:min-h-[44px] ${FOCUS}`}
      >
        {topic.label}
      </AppLink>
    </li>
  );
}
