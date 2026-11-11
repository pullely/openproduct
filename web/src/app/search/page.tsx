import type { Metadata } from "next";

import {
  collectionPageJsonLd,
  MAKER_MATCH_LABELS,
  SEARCH_EMPTY,
  SEARCH_HEADINGS,
  SEARCH_LAUNCH_LIMIT,
  SEARCH_NOTHING,
  SEARCH_PROMPT,
  SEARCH_SCOPE_NOTE,
  searchFoundNothing,
  searchTitle,
  type SearchMakerHit,
  type SearchTopicHit,
} from "@openproduct/contracts";

import { initialsOf } from "../feed/tile";
import { fetchSearch, publicApexOrigin, type SearchDocument } from "../public-api";
import { CARD, H2, HEAD_META, PAGE, PAGE_HEAD, PAGE_SUBTITLE, PAGE_TITLE } from "../ui/design";
import { JsonLd } from "../ui/json-ld";
import { listOpenGraph } from "../ui/og";
import { ProductTile } from "../ui/product-tile";

import { AppLink } from "../ui/link";

/**
 * `/search?q=` — one page, three sections (openproduct-launch SR0).
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
 * like every other public surface.
 *
 * ─── THREE SECTIONS, THREE MECHANISMS ───────────────────────────────────
 *
 * Products come from the DS0 index; people from a LIVE read that applies CG2's
 * four eligibility conditions; topics from the contract's own vocabulary, with
 * no read at all. The argument for the middle one — that an index is a cached
 * answer to "is this person public", and its staleness is unbounded where a
 * live read's is the same 60 seconds as `/@handle` itself — is at the top of
 * `contracts/search-page.ts`.
 *
 * ─── THE DESIGN'S SEARCH VIEW ───────────────────────────────────────────
 *
 * The page title (the counts as a subtitle), the field, then three groups —
 * a 16px heading with its meta, over a card of rows: the feed row for the
 * launches, the person row for the makers, chips for the topics. A search
 * hit is not a `FeedEntry` — the index carries no rank, no count and no
 * topics — so the launch rows draw the feed row's geometry inline and leave
 * the rank and the vote box out rather than printing a number nobody
 * measured (OPC-C).
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
  const launches = doc ? doc.results.slice(0, SEARCH_LAUNCH_LIMIT) : [];

  return (
    <main className={PAGE}>
      {/* QE1 — the results, as structured data, when there are any. The bare
          address is a form, and a form is not a list. */}
      {doc && doc.results.length > 0 ? (
        <JsonLd
          data={collectionPageJsonLd(
            {
              name: searchTitle(q),
              description: SEARCH_SCOPE_NOTE,
              path: `/search?q=${encodeURIComponent(q)}`,
              paths: doc.results.map((hit) => `/${hit.entityId}`),
            },
            publicApexOrigin(),
          )}
        />
      ) : null}
      <header className={PAGE_HEAD}>
        <div>
          <h1 className={PAGE_TITLE}>
            {q.length === 0 ? "Search" : <>Results for &ldquo;{q}&rdquo;</>}
          </h1>
          {/* The subtitle counts what the page found, class by class, and
              only the three classes it actually searches. Without a query it
              carries the published scope instead. */}
          {q.length === 0 || doc === null ? null : (
            <p className={PAGE_SUBTITLE}>{countLine(launches.length, doc)}</p>
          )}
        </div>
      </header>

      <form action="/search" method="get" className="mt-5">
        <label className="sr-only" htmlFor="q">
          Search products, people and topics
        </label>
        {/* A REAL FORM WITH A REAL GET, so the page works with no JavaScript
            at all and the result is a URL somebody can share and reload. The
            ⌘K palette is the fast path, not the only one. */}
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={SEARCH_PROMPT}
          maxLength={120}
          // The bar's own search pill, grown (openproduct-calm CL5).
          className="box-border h-[52px] w-full rounded-full border border-transparent bg-card px-6 text-[16px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:border-endorse focus:ring-[3px] focus:ring-endorse-soft"
        />
      </form>

      <div className="mt-5 min-w-0">
        {q.length === 0 ? null : doc === null ? (
          // OD5 — a failed read and an empty result look nothing alike.
          // Printing "nothing matched" over a search that could not run would
          // send somebody away believing the commons is empty.
          <p
            className="m-0 rounded-[12px] border border-dashed border-border px-5 py-10 text-center text-[15px] text-muted-foreground"
            role="status"
          >
            Search is unavailable right now. Nothing is wrong with your query — try again in a
            moment.
          </p>
        ) : searchFoundNothing({
            query: doc.query,
            launches: [],
            makers: doc.makers,
            topics: doc.topics,
          }) && doc.results.length === 0 ? (
          // ONE SENTENCE, NOT THREE EMPTY SECTIONS. Three headings each saying
          // "no results" tells a reader nothing about which of the three to
          // try differently.
          <p className="m-0 rounded-[12px] border border-dashed border-border px-5 py-10 text-center text-[15px] text-muted-foreground">
            {SEARCH_NOTHING}
          </p>
        ) : (
          <>
            {/* EVERY SECTION THAT HAS SOMETHING RENDERS; one that does not
                says its OWN sentence rather than a shared one, because the
                three absences mean different things (OPC-C). A section is
                omitted only when the whole page found nothing, above. */}
            <section aria-label={SEARCH_HEADINGS.launches} className="mb-7">
              {/* OPC-4 — the order is an editorial position, and the group's
                  meta names it; the published formula is in the note at the
                  foot of the page. */}
              <GroupHeader heading={SEARCH_HEADINGS.launches} meta="ranked by relevance" />
              {launches.length === 0 ? (
                <p className="m-0 mt-1 rounded-[20px] border border-dashed border-border px-6 py-12 text-center text-[15px] text-muted-foreground">
                  {SEARCH_EMPTY.launches}
                </p>
              ) : (
                <ul className="m-0 grid list-none gap-[14px] p-0">
                  {launches.map((hit) => (
                    <LaunchRow key={hit.entityId} hit={hit} />
                  ))}
                </ul>
              )}
            </section>

            <section aria-label={SEARCH_HEADINGS.makers} className="mb-7">
              <GroupHeader heading={SEARCH_HEADINGS.makers} />
              {doc.makers.length === 0 ? (
                <p className="m-0 py-3 text-[14.5px] text-muted-foreground">{SEARCH_EMPTY.makers}</p>
              ) : (
                <ul className={`m-0 list-none p-0 ${CARD}`}>
                  {doc.makers.map((maker) => (
                    <MakerRow key={maker.handle} maker={maker} />
                  ))}
                </ul>
              )}
            </section>

            <section aria-label={SEARCH_HEADINGS.topics}>
              <GroupHeader heading={SEARCH_HEADINGS.topics} />
              {doc.topics.length === 0 ? (
                <p className="m-0 py-3 text-[14.5px] text-muted-foreground">{SEARCH_EMPTY.topics}</p>
              ) : (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0 pt-1">
                  {doc.topics.map((topic) => (
                    <TopicChip key={topic.value} topic={topic} />
                  ))}
                </ul>
              )}
            </section>

            {/* OPC-4 — "relevance" sounds like a technical detail, which is
                exactly why it needs saying out loud on the page that applies
                it. */}
          </>
        )}
      </div>
    </main>
  );
}

/** `N products · N makers · N topics` — the design's subtitle, counting only
 *  what this page shows. The first noun is "products": a result row is a
 *  listing, whether or not it ever launched (PL0). */
function countLine(launches: number, doc: SearchDocument): string {
  const makers = doc.makers.length;
  const topics = doc.topics.length;
  return `${launches} ${launches === 1 ? "product" : "products"} · ${makers} ${
    makers === 1 ? "maker" : "makers"
  } · ${topics} ${topics === 1 ? "topic" : "topics"}`;
}

/** The design's group head: the 16px heading and, beside it, a word about
 *  the order — 10px above the card. */
function GroupHeader({ heading, meta }: { heading: string; meta?: string }) {
  return (
    <div className="flex items-baseline gap-2.5 pb-2.5">
      <h2 className={H2}>{heading}</h2>
      {meta ? <span className={HEAD_META}>{meta}</span> : null}
    </div>
  );
}

/**
 * A launch hit at the feed row's geometry (`feed/row-shell.tsx`), minus what
 * the index does not carry: no rank, no vote box, no topics line. Two links
 * rather than one row-wide anchor, for the same reason the feed row is built
 * that way — an anchor inside an anchor is invalid HTML — and the title's
 * stretch makes the row the target (FR2).
 */
function LaunchRow({ hit }: { hit: SearchDocument["results"][number] }) {
  const href = `/${hit.entityId}`;
  return (
    <li
      data-keyrow
      className="relative flex list-none items-center gap-[22px] rounded-[20px] border border-border bg-card px-8 py-6 transition-colors hover:border-border-strong max-sm:gap-4 max-sm:px-5 max-sm:py-5"
    >
      <AppLink
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="shrink-0 rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ProductTile slug={hit.entityId} thumbnail={hit.thumbnail} size={72} phoneSize={52} />
      </AppLink>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <AppLink
            href={href}
            className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground after:absolute after:inset-0 after:content-[''] hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:text-[19px]"
          >
            {hit.title}
          </AppLink>
        </div>
        {/* Not a link: it goes where the title goes, and the title covers
            the row. */}
        {hit.summary ? (
          <p className="m-0 mt-2 line-clamp-2 text-[16px] leading-[1.5] text-copy max-sm:text-[15px]">{hit.summary}</p>
        ) : null}
      </div>
    </li>
  );
}

/** The design's maker result: a 44px round mark, the name, and a muted line
 *  beneath it — which here says WHY they are in the list. A list of people
 *  with no reason beside them leaves a reader wondering what we matched on,
 *  and "their bio" is a very different answer from "their handle". */
function MakerRow({ maker }: { maker: SearchMakerHit }) {
  const name = maker.displayName ?? `@${maker.handle}`;
  return (
    <li className="border-t border-line first:border-t-0">
      <AppLink
        href={`/@${maker.handle}`}
        className="flex items-center gap-4 px-5 py-[14px] no-underline transition-colors hover:bg-accent max-sm:gap-3 max-sm:px-4"
      >
        <span
          aria-hidden="true"
          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[13px] text-copy"
        >
          {initialsOf(name)}
        </span>
        <span className="grid min-w-0 gap-[2px]">
          <span className="text-[15.5px] font-semibold text-foreground">{name}</span>
          <span className="text-[13.5px] text-muted-foreground">
            @{maker.handle} · matched their {MAKER_MATCH_LABELS[maker.matched]}
          </span>
        </span>
      </AppLink>
    </li>
  );
}

/** A topic chip, linking to the topic's own page. The design draws a count
 *  beside the name; the search document carries none, so none is drawn. */
function TopicChip({ topic }: { topic: SearchTopicHit }) {
  return (
    <li>
      <AppLink
        href={topic.href}
        className="inline-flex h-[32px] items-center rounded-full bg-secondary px-[13px] text-[14px] text-foreground no-underline transition-colors hover:bg-border"
      >
        {topic.label}
      </AppLink>
    </li>
  );
}
