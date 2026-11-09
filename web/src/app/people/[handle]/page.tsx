import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  CONTRIBUTES_TO_NOTE,
  PROFILE_PROVENANCE_NOTE,
  PROFILE_STAT_FORMULAS,
  breadcrumbJsonLd,
  type PublicProfileListing,
} from "@openproduct/contracts";

import { publicApexOrigin } from "../../public-api";
import { StatInline } from "../../ui/bits";
import { CRUMBS, H2, HEAD_META, PAGE } from "../../ui/design";
import { ProductTile } from "../../ui/product-tile";
import { ReportControl } from "../../ui/report-control";
import { JsonLd } from "../../ui/json-ld";
import { ThemeToggle } from "../../ui/theme-toggle";
import { CopyLink } from "./copy-link";
import { MakerView, loadMaker, makerMetadata } from "./maker-view";

import { AppLink } from "../../ui/link";

/**
 * A contributor's public page (openproduct-commons CG1).
 *
 * ROUTED AS `/people/{handle}` AND SERVED AT `/@{handle}`. The design's short
 * link is `openproduct.live/@ada` and that is the canonical URL — but a Next
 * App Router directory whose name begins with `@` is a parallel-route slot,
 * not a path segment, so the pretty form is a rewrite (next.config.mjs) onto
 * this route. `/@ada` is what a person hands out; this is where it lands.
 *
 * FOUR REASONS TO 404, AND ONE ANSWER FOR ALL OF THEM: no such handle, a
 * released one, a contributor who never opted in, and one whose standing
 * lapsed. Distinguishing them would make this page an oracle for "does this
 * person have an account here", which is a question nobody is entitled to ask
 * of a stranger. The API answers identically for the same reason.
 *
 * THE FOOTER IS THE MOST IMPORTANT SENTENCE ON THE PAGE, and it is only true
 * because of the shape of the table behind it: every word here was typed by
 * the person whose name is on it, on this surface. Nothing is copied from an
 * Orunbase account (CG-4).
 */
export const revalidate = 60;

/** XP4 — without this the `revalidate` above is accepted and ignored, and the
 *  route is served `no-store` to everybody. See the long note on the same
 *  function in `app/[slug]/page.tsx`; `[]` prerenders nothing and lets the ISR
 *  cache do the work from the first request onward. */
export async function generateStaticParams() {
  return [];
}


interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  return makerMetadata(await loadMaker(handle, "launched"), "launched");
}

export default async function ContributorProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const doc = await loadMaker(handle, "launched");
  if (doc === null) notFound();

  const profile = doc.contributor;
  const apex = publicApexOrigin();
  const shortLink = `${apex ? apex.replace(/^https?:\/\//, "") : "openproduct.live"}/@${profile.handle}`;

  return (
    <>
      <main className={PAGE}>
        {/* RE1 — the trail. `/people` is a live index and a crawler landing
            on a profile from a search result has no way to know it exists. */}
        <JsonLd
          data={breadcrumbJsonLd(
            [
              { name: "People", path: "/people" },
              { name: `@${profile.handle}`, path: `/@${profile.handle}` },
            ],
            apex,
          )}
        />
        {/* The directory is not in the design's nav any more, and this is
            how it stays reachable from the page most people arrive on: the
            design's `← People`, 13.5px in `--muted`. */}
        <nav aria-label="Breadcrumb" className={CRUMBS}>
          <AppLink href="/people" className="tap inline-flex items-center gap-1.5 hover:text-foreground">
            <span aria-hidden="true">←</span> People
          </AppLink>
        </nav>

        {/* MP0 — the design's header, its three counts and its tabs. One
            component, three addresses: `/@ada`, `/@ada/upvoted` and
            `/@ada/comments` share this body so the header cannot drift
            between them.

            THE AUTHORED LINKS RIDE IN THE HERO, under the marks, where the
            design keeps a person's links: they are facts about where else to
            find this person, drawn beside the facts about them here.

            AG3 LOOKED AT PUTTING THE OPEN PILL HERE AND DID NOT: `MakerView`
            already draws it in the header, beside the counters, which is
            where the design has it and where a reader looking for it looks.
            A second one lower down would have been the same claim twice on
            one page, and the drift this milestone exists to close. */}
        {/* OB6 — THE BUILDS TAB IS ONE LIST: every listing they run, where
            *Launched* (a launch site's noun) and the *Maintains* section under
            it were two lists of mostly the same products. The header's first
            count and the tab's count read the same array this list renders
            (WC-7), so VC2's "two numbers that differ" note has nothing left
            to reconcile and went with the second list. */}
        <MakerView
          doc={doc}
          now={Date.parse(doc.observedAt)}
          builds={
            profile.maintains.length === 0 ? (
              <p className="m-0 mt-6 rounded-[20px] border border-dashed border-border px-6 py-12 text-center text-[15px] text-muted-foreground">
                No published builds right now.
              </p>
            ) : (
              <div className="mt-6 max-w-[900px]">
                <ListingRows listings={profile.maintains} />
              </div>
            )
          }
          links={
            <>
              <CopyLink value={`https://${shortLink}`} label={shortLink} />
              {profile.githubUrl || profile.siteUrl ? (
                <span className="ml-1.5 flex flex-wrap gap-[18px] text-[14px] text-muted-foreground">
                  {profile.githubUrl ? (
                    <a
                      href={profile.githubUrl}
                      rel="noreferrer noopener nofollow"
                      className="tap-h inline-flex items-center hover:text-foreground"
                    >
                      {hostOf(profile.githubUrl)} ↗
                    </a>
                  ) : null}
                  {profile.siteUrl ? (
                    <a
                      href={profile.siteUrl}
                      rel="noreferrer noopener nofollow"
                      className="tap-h inline-flex items-center hover:text-foreground"
                    >
                      {hostOf(profile.siteUrl)} ↗
                    </a>
                  ) : null}
                </span>
              ) : null}
            </>
          }
        />

        {/* CG4 — THE SECOND HALF OF THE GRAPH, and it renders only when there is
            something in it. An empty "Contributes to · nothing" on every profile
            would print an absence as a finding about a person, which is exactly
            what OPC-C forbids.

            RETIRED PLACES ARE HERE. Somebody who left a product still did the
            work; a profile that erased them on the way out would make leaving
            cost something, which is the pressure CG3's unilateral retire exists
            to remove. */}
        {profile.contributesToListings.length > 0 ? (
          <section aria-label="Contributes to" className="mt-9 max-w-[860px]">
            <div className="flex items-baseline gap-2.5 pb-2.5">
              <h2 className={H2}>Contributes to</h2>
              <span className={HEAD_META}>
                <StatInline
                  value={profile.contributesTo}
                  label="confirmed a place on, ever"
                  formula={PROFILE_STAT_FORMULAS.contributesTo}
                />
              </span>
            </div>
            <ListingRows listings={profile.contributesToListings} />
            <p className="sr-only">{CONTRIBUTES_TO_NOTE}</p>
          </section>
        ) : null}
      </main>

      {/* THE SENTENCE — OPC-2 and OPC-5 in one line, and the reason CG can
          build a social graph on the most exposed surface in the estate
          without inheriting the platform's identity model. The design's
          footer prints its short form; the whole of it rides as the title and
          reaches a screen reader in full. Beside it, the report door (TS3):
          last, quietest, opened by intent. */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1180px] flex-wrap items-baseline gap-5 px-7 pb-9 pt-[22px] text-[13px] text-muted-foreground max-sm:px-4">
        <span title={PROFILE_PROVENANCE_NOTE}>
          Profile authored on openproduct
          <span className="sr-only"> — {PROFILE_PROVENANCE_NOTE}</span>
        </span>
        <ReportControl subjectKind="profile" subjectRef={profile.handle} returnTo={`/@${profile.handle}`} bare />
        {/* FR1 — this page carries its own footer instead of the site's, so
            it carries the theme control too. A preference reachable on most
            pages is a preference a reader has to hunt for. */}
        <ThemeToggle className="ml-auto" />
        </div>
      </footer>
    </>
  );
}

/**
 * The two listing sections, which are the same shape: a column of tiles
 * (openproduct-calm CL4) with the facts a profile listing carries — the
 * face, the name and the tagline — and nothing drawn where it carries none.
 * ONE anchor per tile, wrapping the whole of it.
 *
 * Extracted the moment there were two of them rather than after they drifted.
 * Both render a slug that IS a link to a page that exists — the read is gated
 * on `visibility = 'public'` on both sides, so XP-5 holds by construction here
 * rather than by remembering.
 */
function ListingRows({ listings }: { listings: readonly PublicProfileListing[] }) {
  // CL4 — A BUILD IS A TILE here too (CL-R3): the build tile's left half — the
  // face, the name, the tagline in two lines — because a maker's listing
  // carries no figures, and this page adds no read to fetch them.
  return (
    <ul className="m-0 grid list-none gap-[14px] p-0">
      {listings.map((listing) => (
        // A KEYBOARD ROW (QE3). OB6 made this the Builds tab, the maker page's
        // default, where `MakerRows` used to be; without the attribute j and
        // k found no row on it (openproduct#1882). A tile is still a row.
        <li key={listing.slug} data-keyrow className="list-none">
          <AppLink
            href={`/${listing.slug}`}
            className="flex min-w-0 items-start gap-[22px] rounded-[20px] border border-border bg-card px-8 py-6 no-underline transition-colors hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:gap-4 max-sm:px-5 max-sm:py-5"
          >
            <ProductTile slug={listing.slug} thumbnail={listing.thumbnail} size={72} phoneSize={52} />
            <span className="min-w-0 flex-1 self-center">
              <span className="block truncate text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground max-sm:text-[19px]">
                {listing.slug}
              </span>
              {listing.tagline ? (
                <span className="mt-2 line-clamp-2 block text-[16px] leading-[1.5] text-copy max-sm:text-[15px]">
                  {listing.tagline}
                </span>
              ) : null}
            </span>
          </AppLink>
        </li>
      ))}
    </ul>
  );
}

/** The host, for a link label. A bare URL on a page is noise; a host is a fact. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
