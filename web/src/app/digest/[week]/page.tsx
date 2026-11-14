import type { Metadata } from "next";
import { EmptyState } from "../../ui/empty-state";
import { notFound, redirect } from "next/navigation";

import {
  COLLECTION_PENDING_NOTE,
  DIGEST_NO_CHANGES,
  DIGEST_ORDER_FORMULA,
  NO_ENDORSEMENTS_NOTE,
  NO_LAUNCHES_NOTE,
  NO_LAUNCHES_WHY,
  formulaHref,
  nextWeek,
  parseWeekId,
  previousWeek,
  weekDates,
  type Digest,
} from "@openproduct/contracts";

import { fetchDigest, publicApexOrigin } from "../../public-api";
import {
  CARD,
  CARD_HEAD,
  CRUMBS,
  EYEBROW,
  H2,
  HEAD_META,
  LINK_QUIET,
  PAGE_TITLE,
  PANEL,
  ROW,
} from "../../ui/design";
import { listCardMeta } from "../../ui/og";
import { ProductMark } from "../../ui/bits";

import { AppLink } from "../../ui/link";

/**
 * One week, published (openproduct-commons LC1).
 *
 * THE ZERO-LAUNCH WEEK IS WHAT THIS PAGE WAS DESIGNED AROUND. A digest that
 * looks right with twenty launches and broken with none cannot ship until the
 * catalog is already busy, which is backwards: the digest is one of the few
 * things that makes a quiet catalog compound. So every section states what it
 * holds INCLUDING when that is nothing, and an empty week is a sentence
 * rather than a gap.
 *
 * AND IT NEVER PADS. The tempting fix for an empty week is to widen the
 * window until something appears. That is a lie about a date, on an archive
 * whose only value is that its dates are exact.
 *
 * ONE SPELLING PER WEEK. `2026-w4` redirects to `2026-w04` rather than
 * serving a second address for one document — an archive with two addresses
 * splits its own links and teaches a crawler that the canonical one is
 * arbitrary. The API 404s the same input, because a client should learn the
 * grammar rather than be quietly forgiven.
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
  params: Promise<{ week: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { week } = await params;
  const parsed = parseWeekId(week);
  if (!parsed.ok) return { title: "Not found", robots: { index: false, follow: false } };
  const apex = publicApexOrigin();
  const card = listCardMeta(apex, "digest");
  const title = `Week ${parsed.week.week}, ${parsed.week.year}`;
  return {
    title,
    description: `Everything launched on openproduct in the week of ${weekDates(parsed.week)}.`,
    ...(apex ? { alternates: { canonical: `${apex}/digest/${parsed.week.id}` } } : {}),
    // QE1 — an `openGraph` without `images` threw the root layout's default
    // card away (Next replaces the object whole); the week carries the
    // digest's card now.
    ...(card
      ? { openGraph: { title: `${title} · openproduct`, type: "article", images: card.images }, twitter: card.twitter }
      : { openGraph: { title: `${title} · openproduct`, type: "article" } }),
  };
}

/** The week's column: 820px, `28px 28px 72px`; 16px gutters on a phone. */
const WEEK_PAGE =
  "mx-auto box-border w-full max-w-[820px] px-7 pb-[96px] pt-[64px] max-sm:px-4 max-sm:pb-[72px] max-sm:pt-10";

/** A row that is a link: the design's row, with the underline off. */
const ROW_LINK = `${ROW} no-underline`;

/** The sentence a section renders instead of an empty list. */
const EMPTY = "m-0 px-5 pb-4 text-[15px] leading-[1.55] text-muted-foreground";

export default async function DigestPage({ params }: PageProps) {
  const { week } = await params;
  const parsed = parseWeekId(week);
  if (!parsed.ok) notFound();
  if (!parsed.canonical) redirect(`/digest/${parsed.week.id}`);

  const digest = await fetchDigest(parsed.week.id);
  if (!digest) notFound();

  const previous = previousWeek(parsed.week);
  const next = nextWeek(parsed.week, Date.now());

  return (
    <main className={WEEK_PAGE}>
      <nav aria-label="Breadcrumb" className={CRUMBS}>
        <AppLink href="/digest" className={`tap ${LINK_QUIET}`}>
          Digest
        </AppLink>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{parsed.week.id}</span>
      </nav>

      {/* THE DATES, SAID OUT LOUD. ISO weeks put 30 December 2025 in 2026-w01,
          which looks like a bug and is the standard behaving correctly — so
          the page says which days it means rather than leaving somebody to
          work it out. */}
      <span className={`mt-[18px] block ${EYEBROW}`}>
        {parsed.week.id}
      </span>
      <h1 className={`${PAGE_TITLE} mt-1.5`}>
        Week {parsed.week.week} · {weekDates(parsed.week)}
      </h1>

      {digest.note ? <Note note={digest.note} /> : null}

      <section className={`${CARD} mt-8`}>
        <div className={CARD_HEAD}>
          <h2 className={H2}>Launched</h2>
          <span className={HEAD_META}>
            {digest.launches.length} {digest.launches.length === 1 ? "launch" : "launches"}
          </span>
        </div>
        {digest.launches.length === 0 ? (
          <EmptyState className="px-5 pb-4" says={NO_LAUNCHES_NOTE} why={NO_LAUNCHES_WHY} />
        ) : (
          <ul className="m-0 list-none p-0">
            {digest.launches.map((launch) => (
              <li key={`${launch.slug}-${launch.versionLabel}`}>
                <AppLink href={`/${launch.slug}`} className={ROW_LINK}>
                  <ProductMark slug={launch.slug} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-semibold leading-[1.3] text-foreground">
                      {launch.slug}{" "}
                      <span className="font-mono text-[13px] font-normal text-muted-foreground">
                        {launch.versionLabel}
                      </span>
                    </span>
                    {launch.tagline ? (
                      <span className="mt-[2px] block truncate text-[15px] leading-[1.5] text-copy">
                        {launch.tagline}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-[13px] text-muted-foreground">
                    {dayOf(launch.launchedAt)}
                  </span>
                </AppLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* PV4 — WHAT CHANGED, ABOVE THE COUNT.

          This section exists to demote the one below it. "Most upvoted this
          week" is a ranking of how much attention things got, which is what
          every other directory leads with and what this epic has spent its
          length arguing is not the interesting question. What a maintainer
          actually changed is.

          NO `?` LINK, because there is no formula id and deliberately so: the
          order here (observed first, then alphabetical) sends a reader
          nowhere and ranks nothing — it is a lead, not a leaderboard. OPC-4
          asks for a published sentence where an ordering decides what a
          reader sees; this one decides which three of a handful get printed,
          and the sentence is in the section itself. */}
      <section className={`${CARD} mt-4`}>
        <div className={CARD_HEAD}>
          <h2 className={H2}>What changed</h2>
        </div>
        {digest.changed.length === 0 ? (
          <p className={EMPTY}>{DIGEST_NO_CHANGES}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {digest.changed.map((change) => (
              <li key={`${change.slug}-${change.field}`}>
                <AppLink href={`/${change.slug}#changed`} className={`${ROW_LINK} flex-wrap items-baseline gap-x-3 gap-y-1`}>
                  <span className="text-[16px] font-semibold text-foreground">{change.slug}</span>
                  <span className="text-[15px] text-muted-foreground">{change.label}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-muted-foreground">
                    {change.from} → {change.to}
                  </span>
                  {/* OPC-2 in one word. A licence moving is something we READ;
                      a tagline is somebody's act. A list that framed both the
                      same way would say a product's maintainers changed their
                      licence here, which nobody did. */}
                  <span className={`shrink-0 ${EYEBROW}`}>
                    {change.provenance.class === "observed" ? "observed" : "by its maintainers"}
                  </span>
                </AppLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${CARD} mt-4`}>
        <div className={CARD_HEAD}>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className={H2}>Most upvoted this week</h2>
            {/* OPC-4 — an ordering owes a sentence a reader can reach. The same
                `?` DS2 put on every sort pill and CG4 on every stat card. */}
            <AppLink
              href={formulaHref(DIGEST_ORDER_FORMULA)}
              aria-label="How this order is computed"
              title="How this order is computed"
              className="grid h-[18px] w-[18px] place-items-center rounded-full font-mono text-[12px] text-muted-foreground no-underline hover:bg-muted hover:text-foreground"
            >
              ?
            </AppLink>
          </div>
        </div>
        {digest.endorsed.length === 0 ? (
          <p className={EMPTY}>{NO_ENDORSEMENTS_NOTE}</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {digest.endorsed.map((entry) => (
              <li key={entry.slug}>
                <AppLink href={`/${entry.slug}`} className={`${ROW_LINK} items-baseline`}>
                  <span className="text-[16px] font-semibold text-foreground">{entry.slug}</span>
                  {entry.tagline ? (
                    <span className="min-w-0 flex-1 truncate text-[15px] text-muted-foreground">
                      {entry.tagline}
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1" />
                  )}
                  <span className="shrink-0 font-mono text-[13px] text-endorse-ink">
                    ▲ {entry.endorsements}
                  </span>
                </AppLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* LC4's slot, SAID rather than omitted — a reader who can see that
          collections are coming knows the page is unfinished, and one who
          sees two sections cannot tell whether a third was never built or was
          empty this week. */}
      <section className={`${CARD} mt-4`}>
        <div className={CARD_HEAD}>
          <h2 className={H2}>Collection</h2>
        </div>
        <p
          aria-disabled="true"
          data-pending="LC"
          className={`${EMPTY} max-w-[68ch]`}
        >
          {COLLECTION_PENDING_NOTE}
        </p>
      </section>

      <nav className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[14px]">
        <AppLink href={`/digest/${previous.id}`} className="tap text-muted-foreground no-underline hover:text-foreground">
          ← {previous.id}
        </AppLink>
        {next ? (
          <AppLink href={`/digest/${next.id}`} className="tap text-muted-foreground no-underline hover:text-foreground">
            {next.id} →
          </AppLink>
        ) : (
          <span className="text-muted-foreground">This is the most recent week</span>
        )}
      </nav>

      {/* I9 — the numbers say when they were counted. One stamp for the
          document, because every figure here came from the same read. */}
      <p className="m-0 mt-4 text-[13px] leading-[1.6] text-muted-foreground">
        Counted {stamp(digest.observedAt)}. This week has ended, so nothing on this page changes
        again.
      </p>
    </main>
  );
}

/**
 * The week's note, and its byline.
 *
 * THE NAME IS NOT DECORATION. A note is the one place on this page where
 * somebody says what they thought mattered, and LC-4 allows editorial
 * judgement exactly where it is attributable. The API drops a note whose
 * author has no resolvable profile rather than rendering it anonymously, so
 * by the time it reaches here the handle is always a link that works.
 */
function Note({ note }: { note: NonNullable<Digest["note"]> }) {
  return (
    <figure className={`${PANEL} m-0 mt-5 max-w-[70ch]`}>
      <blockquote className="m-0 font-serif text-[17px] italic leading-[1.6] text-copy">{note.body}</blockquote>
      <figcaption className="mt-2.5 text-[13px] text-muted-foreground">
        <AppLink href={`/@${note.byHandle}`} className="text-link underline underline-offset-[3px]">
          @{note.byHandle}
        </AppLink>
      </figcaption>
    </figure>
  );
}

/** `Tue 18` — the day inside the week, which is all a reader needs here. */
function dayOf(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? ""
    : new Date(at).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        timeZone: "UTC",
      });
}

function stamp(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? "at an unknown time"
    : `${new Date(at).toISOString().slice(0, 10)}`;
}
