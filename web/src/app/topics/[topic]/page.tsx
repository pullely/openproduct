import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PROVENANCE_HREF,
  TOPICS_PATH,
  TOPIC_GRID_COLUMNS,
  TOPIC_GRID_HEADING,
  TOPIC_DIRECTORY_HEADING,
  breadcrumbJsonLd,
  byMostActive,
  cardsInTopic,
  collectionPageJsonLd,
  isFirstToday,
  topicDirectoryMeta,
  topicGridRow,
  topicPath,
  type FeedEntry,
} from "@openproduct/contracts";

import { BuildTile } from "../../feed/build-tile";
import { FeedRow } from "../../feed/feed-row";
import { AppLink } from "../../ui/link";
import { fetchPublicDirectory, fetchTopic, publicApexOrigin } from "../../public-api";
import {
  CARD,
  H2,
  HEAD_META,
  PAGE,
  PAGE_HEAD,
  PAGE_TITLE,
} from "../../ui/design";
import { FollowButton } from "../../ui/follow-button";
import { JsonLd } from "../../ui/json-ld";
import { cardMeta, topicCopy } from "../../ui/og";

/**
 * `/topics/{value}` (openproduct-launch TP0) — one topic.
 *
 * THE BOARD FILTERED: what LAUNCHED in this topic recently, in the order the
 * board put it in, read daily. OL2's premise applied to one topic. This is
 * the feed view with a page header — the design's `hasPageHeader` block above
 * one feed group — and nothing here is drawn a second way.
 *
 * A TOPIC NOBODY HAS CHOSEN IS A 404, not an empty page. Core decides that
 * from the same index the grid at `/topics` is built from, so "has a card" and
 * "has a page" are one answer.
 *
 * NOTHING HERE DECIDES AN ORDER (OL-2a). Core hands back entries carrying the
 * board's own rank, ordered by day and then by that rank — which is what the
 * feed does within a group, and for the same reason: pooling days would put a
 * quiet Tuesday's winner above a busy Thursday's runner-up and imply a
 * comparison the board never made.
 *
 * THE FOLLOW BUTTON IS THE DESIGN'S (FL0). Its count is public and its state
 * is not: `followers` comes from this page's cached document and is the same
 * number for everybody, while whether YOU follow it arrives after paint from
 * the XP2 overlay and is in nobody else's HTML. Nobody, including the topic's
 * own readers, can turn the count back into a list.
 */
export const revalidate = 600;

/** The design's way back to the index: 13.5px in `--muted`, `--fg` on hover. */
const BACK = "inline-flex items-center gap-1.5 text-[13.5px] text-muted-foreground hover:text-foreground";

/** A section's head, OUTSIDE its card: the heading and its meta on one
 *  baseline, 10px above the card. */
const SECTION_HEAD = "flex flex-wrap items-baseline gap-x-[10px] gap-y-1 pb-[10px]";

/** A list card with no head of its own: the rows' `--line` rules draw every
 *  divider, and the first row's rule stands in for the card's top edge. */
/** One column of tiles (openproduct-calm CL5): the launch rows are tiles. */
const LIST_TILES = "m-0 grid list-none gap-[14px] p-0";

/** The grid's column head: 12.5px/500 in `--muted`, the design's table head. */
const GRID_TH = "px-5 py-3 text-left text-[12.5px] font-medium text-muted-foreground";

/** The note under a list: 12.5px in `--muted`, 8px below. */

/** XP4 — without this the `revalidate` above is accepted and ignored, and the
 *  route is served `no-store` to everybody. `[]` prerenders nothing and lets
 *  the ISR cache do the work from the first request onward. */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}): Promise<Metadata> {
  const { topic: value } = await params;
  const doc = await fetchTopic(value);
  if (doc === null) return { title: "Topics" };
  const origin = publicApexOrigin();
  // RE0 — the topic's card, gated on the canonical origin like the canonical
  // itself. See `cardMeta`.
  const card = cardMeta(
    origin,
    `/og/topic/${encodeURIComponent(doc.value)}`,
    topicCopy(doc.value, doc.label, doc.description).alt,
  );
  return {
    title: doc.label,
    description: doc.description,
    ...(origin ? { alternates: { canonical: `${origin}/topics/${doc.value}` } } : {}),
    ...(card
      ? {
          openGraph: { title: doc.label, description: doc.description, type: "website", images: card.images },
          twitter: card.twitter,
        }
      : {}),
  };
}

export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic: value } = await params;
  // HB4 — TWO READS, CONCURRENT: the topic document (the month's launches,
  // in the board's order) and the directory (every listing, the same cached
  // document `/` reads). The second is what makes this a landing page: a
  // reader arriving from a search result sees the whole topic, not only the
  // thirty days somebody happened to launch in.
  const [doc, cards] = await Promise.all([fetchTopic(value), fetchPublicDirectory()]);
  if (doc === null) notFound();
  // ONE PREDICATE, TWO NUMBERS THAT ARE ONE: `cardsInTopic` is what the topic
  // index counts with, so the count on the topic card and the length of this
  // list cannot disagree (WC-7). A failed directory read is an absent
  // section, never a zero — an empty room and a locked door look nothing
  // alike.
  const directory = cards === null ? null : [...cardsInTopic(cards, doc.value)].sort(byMostActive);

  const today = dayFromId(doc.today);
  const returnTo = topicPath(doc.value);
  const origin = publicApexOrigin();

  return (
    <main className={PAGE}>
      {/* RE1 — THE TRAIL A CRAWLER CANNOT SEE. This site draws breadcrumbs on
          two surfaces and no more, because its hierarchy is one level deep
          nearly everywhere and a trail with one rung is furniture. A crawler's
          problem is the opposite: it arrives here from a search result with no
          idea that `/topics` exists, and this is the only way the page can say
          so in a form the result will use. */}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: "Topics", path: TOPICS_PATH },
            { name: doc.label, path: topicPath(doc.value) },
          ],
          origin,
        )}
      />
      {/* AND THE PAGE IS A LIST OF PAGES. `numberOfItems` is the length of the
          array rendered below and nothing else, so the machine-readable count
          cannot disagree with the human-readable one (WC-7). */}
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: doc.label,
            description: doc.description,
            path: topicPath(doc.value),
            paths: doc.entries.map((entry) => `/${entry.slug}`),
          },
          origin,
        )}
      />
      {/* The design's way back: one quiet link above the title rather than a
          breadcrumb trail, because the hierarchy here is one rung deep. */}
      <AppLink href={TOPICS_PATH} className={`tap-h ${BACK}`}>
        ← All topics
      </AppLink>
      {/* The design's page header: title and subtitle on the left, the
          Follow control bottom-aligned on the right. */}
      <header className={`mt-[18px] ${PAGE_HEAD}`}>
        <div>
          <h1 className={PAGE_TITLE}>{doc.label}</h1>
          {/* CT0's own published sentence for the facet, unedited. A topic
              page that wrote its own description would be a second
              definition of a facet whose first definition is already on
              `/docs`. */}
        </div>
        {/* FL0 — the design's Follow button, at last. TP0 left it out
            because a control that looks live and does nothing is worse than
            an absent one; there is something behind it now. */}
        <FollowButton
          kind="topic"
          value={doc.value}
          followers={doc.followers}
          returnTo={returnTo}
          size="regular"
        />
      </header>

      <div className="mt-5 min-w-0">
        {doc.entries.length === 0 ? (
          // "Nothing launched here recently" and "there is nothing here" are
          // different claims, and an empty list makes the second one
          // silently. The note is core's own sentence, in the design's
          // dashed panel.
          <p className="m-0 rounded-[12px] border border-dashed border-border px-5 py-10 text-center text-[15px] leading-[1.6] text-muted-foreground">
            {doc.emptyNote}
          </p>
        ) : (
          <section aria-label="Recent launches" className="mb-7">
            <div className={SECTION_HEAD}>
              <h2 className={H2}>Launched in the last {doc.windowDays} days</h2>
              {/* The group's meta names the order rather than implying one:
                  the board's own, newest day first — never a pooled rank. */}
            </div>
            {/* The design's list card: the rows' own `--line` rules draw the
                dividers, and the first row's rule is the card's top edge. */}
            <ul className={LIST_TILES}>
              {doc.entries.map((entry) => (
                <FeedRow
                  key={entry.launchId}
                  entry={entry as FeedEntry}
                  firstToday={isFirstToday(entry as FeedEntry, today)}
                  returnTo={returnTo}
                />
              ))}
            </ul>
          </section>
        )}

        {/* AG2 — THE GRID, and the list above stays. They answer different
            questions: the list's subject is TIME (what launched here recently,
            in the board's own order) and the grid's is COMPARISON (the same
            launches with their facts side by side). An engineer deciding
            between four things in a category is not asking which shipped on
            Tuesday.

            THE SAME ARRAY, TWICE. `doc.entries` feeds both, so the grid and
            the list cannot hold different products or a different number of
            them (WC-7).

            NO TAB STOP ON THE SCROLLER, and that is the rule AG1 pinned one
            milestone ago: a scroll region takes one only while nothing inside
            it has one. Every row here opens with a link. */}
        {doc.entries.length > 0 ? (
          <section aria-labelledby="compare" className="mb-7">
            <div className={SECTION_HEAD}>
              <h2 id="compare" className={H2}>
                {TOPIC_GRID_HEADING}
              </h2>
            </div>
            <div
              role="region"
              aria-label={TOPIC_GRID_HEADING}
              className={`${CARD} overflow-x-auto`}
            >
              <table className="w-full min-w-[560px] border-collapse text-[14px]">
                <thead>
                  <tr>
                    <th scope="col" className={GRID_TH}>
                      Product
                    </th>
                    {TOPIC_GRID_COLUMNS.map((column) => (
                      <th key={column.id} scope="col" className={GRID_TH}>
                        {column.label}{" "}
                        {/* THE LABEL IS THE POINT OF THE COLUMN. `title` carries
                            what the class means for this field, and the link
                            carries where the class itself is explained — the
                            same treatment a published formula gets. */}
                        <AppLink
                          href={PROVENANCE_HREF}
                          title={column.note}
                          className="font-normal text-faint underline decoration-border underline-offset-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {column.provenance}
                        </AppLink>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {doc.entries.map((entry) => (
                    <tr key={entry.launchId} className="border-t border-line transition-colors hover:bg-accent">
                      {/* The row's IDENTITY, not a column — which is why it is
                          a `th` and why it carries no provenance label. */}
                      <th scope="row" className="whitespace-nowrap px-5 py-3 text-left text-[14px] font-medium">
                        <AppLink
                          href={`/${entry.slug}`}
                          className="text-foreground hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {entry.slug}
                        </AppLink>
                      </th>
                      {topicGridRow(entry as FeedEntry).map((cell, at) => (
                        <td
                          key={TOPIC_GRID_COLUMNS[at]!.id}
                          className="px-5 py-3 text-[14px] text-copy"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        {/* HB4 — IN THE DIRECTORY. The month's launches above are TIME; this
            is the whole topic, in the directory's own published order. The
            heading's number is this list's length and the index's count is
            the same predicate over the same cards, so the two agree by
            construction. Absent, not zero, when the directory could not be
            read; a topic that has a page has at least one listing. */}
        {directory !== null && directory.length > 0 ? (
          <section aria-labelledby="in-directory" className="mt-7">
            <div className={SECTION_HEAD}>
              <h2 id="in-directory" className={H2}>
                {TOPIC_DIRECTORY_HEADING}
              </h2>
              <span className={HEAD_META}>{topicDirectoryMeta(directory.length)}</span>
            </div>
            {/* CL2 — the directory's builds are tiles, as on every list of
                builds (CL-R3). */}
            <ul className="m-0 grid list-none gap-[14px] p-0">
              {directory.map((card) => (
                <BuildTile key={card.slug} card={card} returnTo={returnTo} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

/** `2026-08-26` back to a day. The id came from core, which formatted it from
 *  the same code — `parseDayId` is the one that guards an address a stranger
 *  typed, and this is not that (the feed's helper, same reasoning). */
function dayFromId(id: string) {
  const [year, month, day] = id.split("-").map(Number) as [number, number, number];
  return { id, year, month, day };
}
