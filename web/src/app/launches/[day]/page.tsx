import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  BOARD_MEANING,
  breadcrumbJsonLd,
  collectionPageJsonLd,
  dayIsOpen,
  dayLabel,
  monthStrip,
  nextDay,
  parseDayId,
  previousDay,
} from "@openproduct/contracts";

import { fetchBoard, publicApexOrigin } from "../../public-api";
import { cardMeta, dayCopy } from "../../ui/og";
import { FailurePanel } from "../../ui/failure";
import { Board } from "../board";

import { JsonLd } from "../../ui/json-ld";
import { AppLink } from "../../ui/link";
import { CRUMBS, LINK_QUIET } from "../../ui/design";

/**
 * `/launches/2026-08-26` — one day's board, permanently (LC3).
 *
 * THIS ADDRESS IS THE MILESTONE'S "permanently linkable" CLAUSE. A settled
 * day's order is final, so this URL answers the same way forever — which is
 * what makes it worth linking to from a release note or a thread a year
 * later, and what separates an archive from a query.
 *
 * A MALFORMED DAY IS A 404, not a redirect to today and not a 400. Coercing
 * `2026-8-26` to a real board would make two URLs for one document, which is
 * a duplicate a crawler indexes happily; bouncing to today would answer a
 * question nobody asked.
 */
export const revalidate = 3600;

/** XP4 — without this the `revalidate` above is accepted and ignored, and the
 *  route is served `no-store` to everybody. See the long note on the same
 *  function in `app/[slug]/page.tsx`; `[]` prerenders nothing and lets the ISR
 *  cache do the work from the first request onward. */
export async function generateStaticParams() {
  return [];
}


export async function generateMetadata({
  params,
}: {
  params: Promise<{ day: string }>;
}): Promise<Metadata> {
  const { day } = await params;
  const parsed = parseDayId(day);
  if (!parsed.ok) return { title: "Launches" };
  const label = dayLabel(parsed.day);
  // RE0 — the day's card. Gated on the canonical origin like every other one;
  // see `cardMeta`.
  const card = cardMeta(
    publicApexOrigin(),
    `/og/day/${parsed.day.id}`,
    dayCopy(label, BOARD_MEANING).alt,
  );
  return {
    title: `Launches — ${label}`,
    description: BOARD_MEANING,
    alternates: { canonical: `/launches/${parsed.day.id}` },
    ...(card
      ? {
          openGraph: {
            title: `Launches — ${label}`,
            description: BOARD_MEANING,
            type: "website",
            images: card.images,
          },
          twitter: card.twitter,
        }
      : {}),
  };
}

export default async function BoardDayPage({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const parsed = parseDayId(day);
  if (!parsed.ok) notFound();

  const now = Date.now();
  const board = await fetchBoard(parsed.day.id);
  if (board === null) {
    return (
      <FailurePanel
        kind="unavailable"
        what="This board could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: `/launches/${parsed.day.id}` },
          { label: "Products", href: "/" },
        ]}
      />
    );
  }

  const earlier = previousDay(parsed.day);
  const later = nextDay(parsed.day, now);

  return (
    <main className="mx-auto box-border w-full max-w-[1000px] px-8 pb-16 pt-8 max-sm:px-4">
      {/* RE1 — the same trail the `<nav>` below draws for a reader, in the
          form a search result will use. The two are built from the same two
          rungs so they cannot say different things. */}
      <JsonLd
        data={breadcrumbJsonLd(
          [
            { name: "Products", path: "/" },
            { name: dayLabel(parsed.day), path: `/launches/${parsed.day.id}` },
          ],
          publicApexOrigin(),
        )}
      />
      {/* A day IS a list of listings, in the order the board put them in. */}
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: `Launches — ${dayLabel(parsed.day)}`,
            description: BOARD_MEANING,
            path: `/launches/${parsed.day.id}`,
            paths: board.board.map((entry) => `/${entry.slug}`),
          },
          publicApexOrigin(),
        )}
      />
      <nav className={CRUMBS} aria-label="Breadcrumb">
        <AppLink href="/" className={`tap ${LINK_QUIET}`}>
          Launches
        </AppLink>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{parsed.day.id}</span>
      </nav>

      <div className="mt-4">
        <Board
          day={parsed.day}
          entries={board.board}
          open={dayIsOpen(parsed.day, now)}
          observedAt={board.observedAt}
          now={now}
        />
      </div>

      {/* HB2 — THE DAY-OF-MONTH STRIP. Every day of this month up to today,
          each a link to its own board; the current day is marked and not a
          link. The daily board IS this page — the leaderboard's switch sends
          "Today" here rather than to a second address — so the strip is how
          a reader walks the month without the arrows below. */}
      <nav aria-label="Days this month" className="mt-8 border-t border-border pt-4">
        <ol className="m-0 flex list-none flex-wrap gap-1 p-0">
          {monthStrip(parsed.day, now).map((d) =>
            d.id === parsed.day.id ? (
              <li key={d.id}>
                <span
                  aria-current="page"
                  className="grid h-[32px] min-w-[32px] max-sm:h-[44px] max-sm:min-w-[44px] place-items-center rounded-[8px] bg-foreground px-1.5 font-mono text-[12.5px] text-background"
                >
                  {d.day}
                </span>
              </li>
            ) : (
              <li key={d.id}>
                <AppLink
                  href={`/launches/${d.id}`}
                  title={dayLabel(d)}
                  className="tap grid h-[32px] min-w-[32px] max-sm:h-[44px] max-sm:min-w-[44px] place-items-center rounded-[8px] px-1.5 font-mono text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {d.day}
                </AppLink>
              </li>
            ),
          )}
        </ol>
      </nav>

      {/* Both directions, and `later` is null on today — a board must not link
          forward into a day nobody has launched in yet. */}
      <nav className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-[14px]">
        <AppLink href={`/launches/${earlier.id}`} className="tap text-foreground underline underline-offset-[3px]">
          ← {dayLabel(earlier)}
        </AppLink>
        {later ? (
          <AppLink href={`/launches/${later.id}`} className="tap text-foreground underline underline-offset-[3px]">
            {dayLabel(later)} →
          </AppLink>
        ) : (
          <span className="text-muted-foreground">Today</span>
        )}
      </nav>
    </main>
  );
}
