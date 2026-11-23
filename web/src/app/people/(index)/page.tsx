import type { Metadata } from "next";

import {
  collectionPageJsonLd,
  DIRECTORY_ELIGIBILITY_NOTE,
} from "@openproduct/contracts";

import { fetchContributorsDirectory, fetchPublicDirectory, publicApexOrigin } from "../../public-api";
import { JsonLd } from "../../ui/json-ld";
import { LIST_CARDS, listOpenGraph } from "../../ui/og";
import { EMPTY_NOTE, PAGE, PAGE_HEAD, PAGE_TITLE } from "../../ui/design";
import { PeopleList } from "../people-list";

/**
 * The people directory (openproduct-commons XP1, filled by CG2; drawn as the
 * console design's People screen).
 *
 * WHAT THE PAGE COMMITS TO. "Everyone here maintains or contributes to a
 * listed product" is not copy — it is CG-2, `[decided]` in the reference
 * design, and the eligibility rule that makes this surface self-limiting. A
 * public profile directory open to anyone who can sign in is a spam
 * directory within a month; one bounded by "you are on a product somebody
 * published" cannot be, because the bound costs an attacker a listing a
 * person has to publish and anyone can report.
 *
 * The bound lives in the repository's WHERE clause, not in a filter here. A
 * filter would mean the ineligible rows were fetched, and a row fetched is a
 * row one refactor away from being rendered.
 *
 * NOBODY IS RANKED. The order is when each profile became public, newest
 * first. Any order that scored people would be a ranking of PEOPLE, which
 * this product does not do and has nowhere to publish a formula for (OPC-4)
 * — and "most active contributor" is a leaderboard, which is a different
 * product with different incentives.
 *
 * ONE CACHEABLE DOCUMENT, like every other public route (OPC-1). No actor is
 * resolved, so a signed-in visitor and a crawler get the same bytes (I6).
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "People building in the open",
  description: DIRECTORY_ELIGIBILITY_NOTE,
  ...(publicApexOrigin() ? { alternates: { canonical: `${publicApexOrigin()}/people` } } : {}),
  // QE1 — the index's own card. The block used to declare `openGraph`
  // without an image, which is how a page loses the root layout's default
  // card and unfurls as bare text: Next replaces the object whole.
  ...listOpenGraph(publicApexOrigin(), "people"),
};

export default async function ContributorsPage() {
  // AG3 — TWO READS, CONCURRENTLY, because this page now shows two sides. The
  // catalogue is the same document every other surface filters; a failed
  // directory read still leaves the asking half, and vice versa, which is the
  // treatment the feed gives its own two.
  const [contributors, cards] = await Promise.all([
    fetchContributorsDirectory(),
    fetchPublicDirectory(),
  ]);
  // PE3 — a listing's category, for the topic filter: the directory the page
  // already reads, keyed by slug. The people document carries slugs only.
  const topicOf: Record<string, string | null> = Object.fromEntries(
    (cards ?? []).map((card) => [card.slug, card.category]),
  );

  return (
    <main className={PAGE}>
      {/* QE1 — the list, as structured data: every person the page lists. */}
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: LIST_CARDS.people.title,
            description: LIST_CARDS.people.description,
            path: "/people",
            paths: (contributors ?? []).map((person) => `/@${person.handle}`),
          },
          publicApexOrigin(),
        )}
      />
      {/* The design's page header: the sans title and, when the list cannot
          say its own count, a muted line beneath it. */}
      <header className={PAGE_HEAD}>
        <div>
          <h1 className={PAGE_TITLE}>People building in the open</h1>
        </div>
      </header>
      {/* CG-2 and OPC-5, in the visitor's words. The design gives the two
          sentences no line of their own, so they are here for a screen
          reader and in the page's description — and the rule they state is
          enforced in the read, not by being printed. */}

      <div className="mt-6 min-w-0">
        {contributors === null ? (
          // THE READ FAILED. Not "nobody is here" — an empty room and a locked
          // door look nothing alike to a visitor, and this page should not have
          // to guess (the OD5 finding, kept).
          <p className={EMPTY_NOTE}>
            Couldn&rsquo;t load the directory just now. It is worth another try in a moment.
          </p>
        ) : contributors.length === 0 ? (
          // AND THIS IS THE HONEST EMPTY. We read a complete record and found
          // nobody — which on a young estate is a true and unembarrassing thing
          // to say, and it comes with the reason rather than a shrug.
          <p className={EMPTY_NOTE}>
            Nobody has published a profile yet. A profile appears here once somebody who maintains
            a listed product chooses to make theirs public.
          </p>
        ) : (
          <PeopleList people={contributors} topicOf={topicOf} />
        )}
      </div>
    </main>
  );
}
