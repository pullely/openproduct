import type { Metadata } from "next";

import {
  collectionPageJsonLd,
  ASKING_HEADING,
  DIRECTORY_ELIGIBILITY_NOTE,
  askingAllLabel,
  askingPreview,
  buildOrderPath,
  listingsAsking,
} from "@openproduct/contracts";

import { fetchContributorsDirectory, fetchPublicDirectory, publicApexOrigin } from "../../public-api";
import { JsonLd } from "../../ui/json-ld";
import { LIST_CARDS, listOpenGraph } from "../../ui/og";
import { CARD, H2, HEAD_META, PAGE, PAGE_HEAD, PAGE_TITLE } from "../../ui/design";
import { RoleIcon } from "../../ui/icons";
import { AppLink } from "../../ui/link";
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
  const asking = listingsAsking(cards ?? []);
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

      <div className="mt-[48px] min-w-0 max-sm:mt-8">
        {contributors === null ? (
          // THE READ FAILED. Not "nobody is here" — an empty room and a locked
          // door look nothing alike to a visitor, and this page should not have
          // to guess (the OD5 finding, kept).
          <p className="m-0 rounded-[20px] border border-dashed border-border px-6 py-12 text-center text-[15px] text-muted-foreground">
            Couldn&rsquo;t load the directory just now. It is worth another try in a moment.
          </p>
        ) : contributors.length === 0 ? (
          // AND THIS IS THE HONEST EMPTY. We read a complete record and found
          // nobody — which on a young estate is a true and unembarrassing thing
          // to say, and it comes with the reason rather than a shrug.
          <p className="m-0 rounded-[20px] border border-dashed border-border px-6 py-12 text-center text-[15px] text-muted-foreground">
            Nobody has published a profile yet. A profile appears here once somebody who maintains
            a listed product chooses to make theirs public.
          </p>
        ) : (
          <PeopleList people={contributors} topicOf={topicOf} />
        )}
      </div>

      {/* AG3 — THE OTHER SIDE, AND NO EDGE BETWEEN THEM.
          
          The obvious reading of "matched to listings with open roles" is a
          line drawn from each open maker to each listing that wants people,
          and that is exactly what OPC-5 exists to prevent. `product_people` is
          two-sided BY CONSTRUCTION because an edge rendered without both
          sides is a claim about a relationship neither of them made — and a
          "suggested match" is that claim with a hedge on it.
          
          So the page holds the two SIDES and the reader makes the connection,
          which is the only party entitled to. `ASKING_NOTE` says so out loud
          rather than leaving it to be inferred from an absence. */}
      {/* CL4 — A PREVIEW, AND THE DOOR TO THE WHOLE LIST. The page is about
          people; every build with an open role is the Roles order, one click
          away, so this shows the first few in the document's own order and
          links there (`askingPreview`, `ASKING_PREVIEW_LIMIT`). */}
      {asking.length > 0 ? (
        <section aria-labelledby="asking" className="mt-16 max-sm:mt-12">
          {/* The group head: the heading with its meta beside it. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-4">
            <div className="flex items-baseline gap-2.5">
              <h2 id="asking" className={H2}>
                {ASKING_HEADING}
              </h2>
              <span className={HEAD_META}>
                {asking.length} {asking.length === 1 ? "listing" : "listings"} with a role open
              </span>
            </div>
            <AppLink href={buildOrderPath("roles")} className="tap text-[14px] font-medium text-copy underline underline-offset-4 hover:text-foreground">
              {askingAllLabel(asking.length)} →
            </AppLink>
          </div>
          <ul className={`m-0 list-none p-0 ${CARD}`}>
            {askingPreview(asking).map((listing) => (
              <li
                key={listing.slug}
                className="relative flex items-center gap-4 border-t border-line px-7 py-[18px] transition-colors first:border-t-0 hover:bg-accent max-sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <AppLink
                    href={`/${listing.slug}#people-wanted`}
                    className="block text-[16px] font-semibold tracking-[-0.01em] text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {listing.slug}
                  </AppLink>
                  {listing.tagline ? (
                    <span className="mt-0.5 block truncate text-[14.5px] text-muted-foreground">{listing.tagline}</span>
                  ) : null}
                </span>
                {/* The count is the maintainers' own — authored, and nothing
                    observes whether a role is still needed. The seat is the
                    site's one glyph for an open role. */}
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[15px] font-medium tabular-nums text-success">
                  <RoleIcon className="h-4 w-4 shrink-0" />
                  {listing.roleOpeningCount}
                  <span className="sr-only">{listing.roleOpeningCount === 1 ? " role open" : " roles open"}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
