import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  CONTRIBUTES_TO_NOTE,
  PROFILE_PROVENANCE_NOTE,
  PROFILE_STAT_FORMULAS,
  breadcrumbJsonLd,
} from "@openproduct/contracts";

import { publicApexOrigin } from "../../public-api";
import { StatInline } from "../../ui/bits";
import { BOARD_PAGE, EMPTY_NOTE, HEAD_META, SIDE_CARD, SIDE_TITLE } from "../../ui/design";
import { ReportControl } from "../../ui/report-control";
import { JsonLd } from "../../ui/json-ld";
import { CopyLink } from "./copy-link";
import { MakerView, loadMaker, makerMetadata } from "./maker-view";
import { ProductRows } from "./product-rows";

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
      <main className={BOARD_PAGE}>
        {/* RE1 — the trail. `/people` is a live index and a crawler landing
            on a profile from a search result has no way to know it exists.
            In the record only: the directory left the navigation (owner rule
            4), and the board draws no crumb over a profile. */}
        <JsonLd
          data={breadcrumbJsonLd(
            [
              { name: "People", path: "/people" },
              { name: `@${profile.handle}`, path: `/@${profile.handle}` },
            ],
            apex,
          )}
        />

        {/* MP0 — the profile card, its facts and its sections. One
            component, three addresses: `/@ada`, `/@ada/upvoted` and
            `/@ada/comments` share this body so the card cannot drift
            between them.

            THE AUTHORED LINKS RIDE IN THE CARD, under the facts: they are
            facts about where else to find this person, drawn beside the facts
            about them here. */}
        {/* OB6 — THE DEFAULT SECTION IS ONE LIST: every listing they run. The
            card's "Maker of N" and the pill's count read the same array this
            list renders (WC-7). */}
        <MakerView
          doc={doc}
          now={Date.parse(doc.observedAt)}
          builds={
            profile.maintains.length === 0 ? (
              <p className={EMPTY_NOTE}>No published products right now.</p>
            ) : (
              <section aria-label="Products" className="rounded-[16px] bg-card p-2">
                <ProductRows listings={profile.maintains} />
              </section>
            )
          }
          aside={
            // CG4 — THE SECOND HALF OF THE GRAPH, and it renders only when
            // there is something in it. An empty "Contributes to · nothing" on
            // every profile would print an absence as a finding about a
            // person, which is exactly what OPC-C forbids.
            //
            // RETIRED PLACES ARE HERE. Somebody who left a product still did
            // the work; a profile that erased them on the way out would make
            // leaving cost something, which is the pressure CG3's unilateral
            // retire exists to remove.
            profile.contributesToListings.length > 0 ? (
              <section aria-labelledby="contributes-to" className={SIDE_CARD}>
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h2 id="contributes-to" className={SIDE_TITLE}>
                    Contributes to
                  </h2>
                  <span className={HEAD_META}>
                    <StatInline
                      value={profile.contributesTo}
                      label="confirmed a place on, ever"
                      formula={PROFILE_STAT_FORMULAS.contributesTo}
                    />
                  </span>
                </div>
                <ProductRows listings={profile.contributesToListings} />
                <p className="sr-only">{CONTRIBUTES_TO_NOTE}</p>
              </section>
            ) : undefined
          }
          links={
            <>
              <CopyLink value={`https://${shortLink}`} label={shortLink} />
              {profile.githubUrl || profile.siteUrl ? (
                <span className="ml-1.5 flex flex-wrap gap-[18px] text-[13px] text-muted-foreground">
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
        {/* THE SENTENCE — OPC-2 and OPC-5 in one line, and the reason CG can
            build a social graph on the most exposed surface in the estate
            without inheriting the platform's identity model. The line prints
            its short form; the whole of it rides as the title and reaches a
            screen reader in full. Beside it, the report door (TS3): last,
            quietest, opened by intent.

            THE PAGE'S LAST LINE, NOT A FOOTER OF ITS OWN. It was one, with a
            theme control, while the site's footer stepped aside here; the
            site's footer is on this page now (OPR1), so this is two facts
            about the profile at the end of its column and nothing more. */}
        <div className="flex flex-wrap items-baseline gap-5 px-1 pt-2 text-[13px] text-muted-foreground">
          <span title={PROFILE_PROVENANCE_NOTE}>
            Profile authored on openproduct
            <span className="sr-only"> — {PROFILE_PROVENANCE_NOTE}</span>
          </span>
          <ReportControl subjectKind="profile" subjectRef={profile.handle} returnTo={`/@${profile.handle}`} bare />
        </div>
      </main>
    </>
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
