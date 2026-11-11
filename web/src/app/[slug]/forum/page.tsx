import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  LISTING_FORUM_THREADS_HEADING,
  LISTING_FORUM_TITLE,
  THREAD_COMPOSER_TITLE,
  breadcrumbJsonLd,
  collectionPageJsonLd,
  listingForumMeaning,
  listingForumPath,
  threadComposerHref,
} from "@openproduct/contracts";

import { Comments } from "../comments";
import { fetchDiscussion, fetchListing, publicApexOrigin } from "../../public-api";
import { JsonLd } from "../../ui/json-ld";
import { BTN_PRIMARY, CRUMBS, H2_SECTION, PAGE, PAGE_HEAD, PAGE_SUBTITLE, PAGE_TITLE } from "../../ui/design";
import { SECTION_CARD } from "../sections";
import { AppLink } from "../../ui/link";
import { ThreadTile } from "../../threads/thread-tile";

/**
 * `/{slug}/forum` — one forum per product (openproduct-worldclass-v2 FO2).
 *
 * THE SAME DOCUMENT THE LISTING PAGE READS. `fetchDiscussion(slug)` is PP0's
 * read — the launch thread with its posts, and every titled thread on the
 * listing — and this page renders all of it at an address of its own, so a
 * link to "the conversation about X" has somewhere to go that is not the
 * middle of the product page. Two pages reading one document cannot
 * disagree about which threads exist (OL-2a, applied to talk).
 *
 * NOT A SECOND IMPLEMENTATION OF THE COMMENTS. `<Comments>` is the listing
 * page's own component, box first, posts under it; the thread list is the
 * rows FO1's index draws for this listing alone.
 *
 * PUBLIC, ANONYMOUS, CACHED (OPC-1, I6): no session, no `searchParams`;
 * the visitor's own vote state arrives after paint from the overlay, as it
 * does on the listing page.
 */
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const read = await fetchListing(slug);
  if (!read?.profile) return { title: LISTING_FORUM_TITLE };
  const origin = publicApexOrigin();
  return {
    title: `${LISTING_FORUM_TITLE} · ${slug}`,
    description: listingForumMeaning(slug),
    ...(origin ? { alternates: { canonical: `${origin}${listingForumPath(slug)}` } } : {}),
  };
}

export default async function ListingForumPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Both reads are the listing page's own, and concurrent for the same
  // reason they are there: neither depends on the other.
  const [read, discussion] = await Promise.all([fetchListing(slug), fetchDiscussion(slug)]);
  const profile = read?.profile;
  // Unknown, unpublished, removed: the listing page's own 404 (a removed
  // listing has its tombstone at the listing's address, not a forum).
  if (!profile) notFound();

  const origin = publicApexOrigin();
  const path = listingForumPath(profile.slug);
  const threads = discussion?.threads ?? [];
  const now = Date.now();

  return (
    <main className={PAGE}>
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: profile.slug, path: `/${profile.slug}` },
            { name: LISTING_FORUM_TITLE, path },
          ],
          origin,
        )}
      />
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: `${LISTING_FORUM_TITLE} · ${profile.slug}`,
            description: listingForumMeaning(profile.slug),
            path,
            paths: threads.map((thread) => `/threads/${thread.id}`),
          },
          origin,
        )}
      />
      <nav className={CRUMBS} aria-label="Breadcrumb">
        <AppLink href={`/${profile.slug}`} className="tap hover:text-foreground">
          {profile.slug}
        </AppLink>
        <span aria-hidden="true" className="text-border-strong">
          /
        </span>
        <span className="text-foreground">{LISTING_FORUM_TITLE}</span>
      </nav>
      <header className={`${PAGE_HEAD} mt-3 max-w-[820px]`}>
        <div className="min-w-0">
          <h1 className={PAGE_TITLE}>
            {LISTING_FORUM_TITLE} · {profile.slug}
          </h1>
          <p className={PAGE_SUBTITLE}>{listingForumMeaning(profile.slug)}</p>
        </div>
        <AppLink
          href={threadComposerHref(profile.slug)}
          className={`tap ${BTN_PRIMARY} no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
        >
          {THREAD_COMPOSER_TITLE}
        </AppLink>
      </header>

      <div className="mt-10 grid max-w-[820px] gap-4 max-sm:mt-8">
        {/* THE LAUNCH THREAD — the listing page's own component, unchanged. */}
        <section aria-labelledby="forum-comments" className={SECTION_CARD}>
          <h2 id="forum-comments" className={H2_SECTION}>
            Comments
          </h2>
          <Comments slug={profile.slug} launch={discussion?.launch ?? null} />
        </section>

        {/* EVERY THREAD THAT TAGGED THE LISTING — FO1's list, for one listing.
            CP-R3: a panel only when there is a thread; none is one quiet
            line under the comments. */}
        {threads.length === 0 ? (
          <p data-not-yet className="m-0 px-2 text-[14px] text-muted-foreground">
            No threads about {profile.slug} yet.
          </p>
        ) : (
          <section aria-labelledby="forum-threads">
            <h2 id="forum-threads" className={`${H2_SECTION} px-2`}>
              {LISTING_FORUM_THREADS_HEADING}
            </h2>
            {/* CP3 — the same tile as /threads, without the build's name:
                every thread here is about this one. */}
            <ul className="m-0 mt-4 grid list-none gap-[14px] p-0" data-thread-tiles>
              {threads.map((thread) => (
                <ThreadTile key={thread.id} thread={thread} now={now} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
