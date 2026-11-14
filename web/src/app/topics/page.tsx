import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { collectionPageJsonLd, followerLine, topicPath } from "@openproduct/contracts";

import { fetchTopics, publicApexOrigin, type TopicsDocument } from "../public-api";
import { JsonLd } from "../ui/json-ld";
import { TOPICS_DESCRIPTION, listOpenGraph } from "../ui/og";
import { FollowButton } from "../ui/follow-button";
import { EMPTY_NOTE, FOCUS, PAGE, PAGE_TITLE, TILE } from "../ui/design";

import { AppLink } from "../ui/link";

/**
 * `/topics` (openproduct-launch TP0) — every topic a live listing has chosen.
 *
 * A TOPIC IS A CT1 CATEGORY VALUE. The prototype gives each product a typed
 * list of topics; this estate canonicalises exactly one category per listing
 * from a published vocabulary, and inventing a second free-text taxonomy
 * beside it is the thing CT1 exists to prevent. The long argument is at the
 * top of `contracts/topics.ts`.
 *
 * A VALUE NOBODY HAS CHOSEN GETS NO CARD, and therefore no page. The
 * vocabulary has more values than the catalogue has listings, and a grid of
 * topics that lead to empty pages is a grid of broken links — the same
 * argument DS1 made for offering only present values in the facet rail.
 *
 * ONE READ, and it is the directory's own, so the number on a card and the
 * number beside that value in the rail cannot disagree.
 *
 * THE CARD IS THE REDESIGN'S FLAT TILE (OPR1): a 260px-minimum grid at gap
 * 14, each card the shared `TILE` holding the name at the card-title size
 * (18/600), one meta line in 13 and the Follow control at the foot. The topic page is the
 * card's one destination — there is no directory to cross-link any more.
 */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Topics",
  description: TOPICS_DESCRIPTION,
  ...(publicApexOrigin()
    ? { alternates: { canonical: `${publicApexOrigin()}/topics` } }
    : {}),
  // QE1 — the index's own card.
  ...listOpenGraph(publicApexOrigin(), "topics"),
};

export default async function TopicsPage() {
  const doc = await fetchTopics();
  // Null means the topics could not be read at all — not that nothing is
  // categorised. An empty room and a locked door look nothing alike to a
  // visitor (the OD5 finding, kept).
  if (doc === null) notFound();

  return (
    <main className={PAGE}>
      {/* QE1 — the list, as structured data: every topic the page lists. */}
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: "Topics",
            description: TOPICS_DESCRIPTION,
            path: "/topics",
            paths: doc.topics.map((topic) => topicPath(topic.value)),
          },
          publicApexOrigin(),
        )}
      />
      <h1 className={PAGE_TITLE}>Topics</h1>

      {doc.topics.length === 0 ? (
        <p className={`mt-8 ${EMPTY_NOTE}`}>
          No listed product has chosen a category yet.
        </p>
      ) : (
        <Cards doc={doc} />
      )}
    </main>
  );
}

/** The design's `repeat(auto-fill, minmax(250px, 1fr))` grid at gap 12. */
function Cards({ doc }: { doc: TopicsDocument }) {
  return (
    <ul className="m-0 mt-[48px] grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[14px] p-0 max-sm:mt-8">
      {doc.topics.map((topic) => (
        <li
          key={topic.value}
          className={`flex flex-col gap-3 p-6 ${TILE}`}
        >
          <AppLink
            href={topicPath(topic.value)}
            className={`tap self-start font-sans text-card-title font-semibold tracking-[-0.01em] text-foreground ${FOCUS}`}
          >
            {topic.label}
          </AppLink>
          {/* PRODUCTS, NOT LAUNCHES. LC0 made a launch a separate act from a
              publish so the two could be counted apart, and a card reading
              "12 launches" over a topic where four listings never launched
              would be counting one thing and naming another.

              THE FOLLOWER COUNT SITS HERE, on the design's one meta line, so
              the button below draws itself alone. Rendered AT ZERO: something
              observes a follow, so a zero has been counted and found empty
              rather than being a claim nobody could make (OPC-C). */}
          <span className="text-[13px] text-muted-foreground">
            {topic.products} {topic.products === 1 ? "product" : "products"} ·{" "}
            {followerLine(topic.followers)}
          </span>
          {/* FL0 — the control TP0 left out. `mt-auto` is the design's
              `margin-top: auto`: the button sits at the foot of every card
              whatever the name's line count. */}
          <div className="mt-auto flex">
            <FollowButton
              kind="topic"
              value={topic.value}
              followers={topic.followers}
              returnTo="/topics"
              size="card"
              countHidden
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
