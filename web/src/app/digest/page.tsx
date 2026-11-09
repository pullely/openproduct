import type { Metadata } from "next";

import {
  FEED_DESCRIPTION,
  collectionPageJsonLd,
  parseWeekId,
  weekDates,
} from "@openproduct/contracts";

import { fetchDigestWeeks, publicApexOrigin } from "../public-api";
import { H2_SECTION, PAGE_TITLE } from "../ui/design";
import { JsonLd } from "../ui/json-ld";
import { LIST_CARDS, listOpenGraph } from "../ui/og";
import { DigestControl } from "../ui/digest-control";

import { AppLink } from "../ui/link";

/**
 * The archive (openproduct-commons LC1).
 *
 * LISTS THE WEEKS THAT HELD SOMETHING, not every week that ever was. A digest
 * exists at every week's address — typing one works — but an index of four
 * hundred empty weeks is an index nobody reads. The archive stays complete;
 * the list stays useful.
 *
 * A FAILED READ IS NOT AN EMPTY ARCHIVE. The two look identical if you let
 * them, and an empty room and a locked door look nothing alike to a visitor
 * (the OD5 finding) — so `null` and `[]` render differently here.
 */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Digest",
  description: FEED_DESCRIPTION,
  // QE1 — the archive's own card.
  ...listOpenGraph(publicApexOrigin(), "digest"),
};

/** The digest's column: 1000px in the calm frame (CL-R2: 80px above the
 *  title); 16px gutters on a phone. */
const DIGEST_PAGE =
  "mx-auto box-border w-full max-w-[1000px] px-[44px] pb-[104px] pt-[80px] max-lg:px-7 max-sm:px-4 max-sm:pb-[72px] max-sm:pt-12";

/** A feed button: a 34px pill, on `--input`. */
const FEED_BTN =
  "inline-flex h-[34px] items-center rounded-full border border-input bg-card px-3 text-[14px] font-medium text-foreground no-underline transition-colors hover:border-faint";

/** A week is a tile (CP-R6): the tile's 20px radius and room, the border
 *  darkening on hover. */
const WEEK_CARD =
  "block rounded-[20px] border border-border bg-card px-8 py-6 no-underline transition-colors hover:border-border-strong max-sm:px-5 max-sm:py-5";

export default async function DigestIndexPage() {
  const weeks = await fetchDigestWeeks();

  return (
    <main className={DIGEST_PAGE}>
      {/* QE1 — the list, as structured data: every week the archive holds. */}
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: LIST_CARDS.digest.title,
            description: LIST_CARDS.digest.description,
            path: "/digest",
            paths: (weeks ?? []).map((id) => `/digest/${id}`),
          },
          publicApexOrigin(),
        )}
      />
      <h1 className={PAGE_TITLE}>The digest</h1>

      {/* LC-5 — THE FEEDS ARE THE PRODUCT, not a footnote to an email signup
          that does not exist. A feed needs no address, works at any volume,
          and cannot leak a subscriber list because there is not one. */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <a href="/digest/feed.xml" className={`tap-h ${FEED_BTN}`}>
          RSS
        </a>
        <a href="/digest/feed.json" className={`tap-h ${FEED_BTN}`}>
          JSON Feed
        </a>
        <span className="text-[13.5px] text-muted-foreground">No account, no address.</span>
      </div>

      {/* LC5 — the email option, AFTER the feeds and saying so. The feed
          needs no account and no address at all; leading with the one that
          asks for something would be asking for what we do not need. The
          control renders identically for every visitor (OPC-1, I6) — the
          session is read on the POST, never here. */}
      <DigestControl returnTo="/digest" showFeedNote />

      <section className="mt-14">
        <h2 className={H2_SECTION}>Every week</h2>
        {weeks === null ? (
          <p className="m-0 mt-3 text-[15px] leading-[1.55] text-muted-foreground">
            The archive could not be loaded right now. Trying again in a moment usually works — the
            weeks themselves are still there.
          </p>
        ) : weeks.length === 0 ? (
          <p className="m-0 mt-3 max-w-[68ch] text-[16px] leading-[1.6] text-muted-foreground">
            Nothing has launched yet, so there is no week to look back on. The first one appears
            here the week after the first launch.
          </p>
        ) : (
          <ul className="m-0 mt-5 grid list-none gap-[14px] p-0" data-digest-weeks>
            {weeks.map((id) => {
              const parsed = parseWeekId(id);
              return (
                <li key={id}>
                  <AppLink href={`/digest/${id}`} className={WEEK_CARD}>
                    <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                      {id}
                    </span>
                    <span className="mt-1.5 block font-sans text-[20px] font-semibold leading-[1.25] tracking-[-0.015em] text-foreground">
                      {parsed.ok ? `Week ${parsed.week.week} · ${weekDates(parsed.week)}` : id}
                    </span>
                  </AppLink>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
