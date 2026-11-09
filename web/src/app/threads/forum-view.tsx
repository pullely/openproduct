import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  FORUM_ORDERS,
  FORUM_ORDER_LABEL,
  FORUM_TITLE,
  THREAD_COMPOSER_TITLE,
  THREAD_TAG_LABELS,
  type ChosenThreadTag,
  type ForumOrder,
  collectionPageJsonLd,
  formulaHref,
  forumCategories,
  forumMeaning,
  forumPath,
  threadComposerHref,
} from "@openproduct/contracts";

import { listCardMeta } from "../ui/og";
import { BTN_PRIMARY, PAGE_HEAD, PAGE_TITLE, TAB, TAB_OFF, TAB_ON } from "../ui/design";
import { FailurePanel } from "../ui/failure";
import { JsonLd } from "../ui/json-ld";
import { AppLink } from "../ui/link";
import { fetchForum, publicApexOrigin } from "../public-api";
import { ThreadTile } from "./thread-tile";

/**
 * The forum index (openproduct-worldclass-v2 FO1).
 *
 * ONE BODY, FOUR ROUTES: `/threads`, `/threads/replied`, `/threads/tag/<tag>`
 * and `/threads/tag/<tag>/replied` each render this with the order and the
 * category their path names. Path segments, not `searchParams`, so every one
 * is a cacheable, actor-free document (OPC-1, I6) — the leaderboard's own
 * rule.
 *
 * TWO ORDERS, BOTH PUBLISHED, AND NO "HOT". The switch is two links in the
 * underline strip; the sentence beside them is the order's own formula at
 * its own address (OPC-4). Each thread is a tile (`thread-tile.tsx`, CP3);
 * its count is the thread's visible replies — the number the launch row
 * shows for the same listing, by the same rule (HB3).
 *
 * THE AVATAR IS INITIALS UNTIL MD5. A picture nobody uploaded is a claim;
 * the tile the estate already draws for a person is not.
 */

/** The forum's column: 1000px, narrower than `PAGE`'s 1200, with the calm
 *  frame's room around it (CL-R2): 80px above the title. The thread page
 *  shares it. */
export const FORUM_PAGE =
  "mx-auto box-border w-full max-w-[1000px] px-[44px] pb-[104px] pt-[80px] max-lg:px-7 max-sm:px-4 max-sm:pb-[72px] max-sm:pt-12";

/** A category is a FILTER, so it stays a pill (CP-R2, CL4's filter pills):
 *  36px, round, a hairline — filled with the foreground when it is on. */
const CATEGORY = "tap inline-flex h-[36px] items-center rounded-full border px-4 text-[14px] no-underline transition-colors";
const CATEGORY_ON = "border-foreground bg-foreground text-background";
const CATEGORY_OFF = "border-border text-copy hover:text-foreground";

export function forumMetadata(order: ForumOrder, tag: ChosenThreadTag | null): Metadata {
  const origin = publicApexOrigin();
  const path = forumPath(order, tag);
  // QE1 — the forum's own card, where FO1 borrowed the site's.
  const card = listCardMeta(origin, "threads");
  return {
    title: tag ? `${THREAD_TAG_LABELS[tag]} threads` : FORUM_TITLE,
    description: forumMeaning(order, tag),
    ...(origin ? { alternates: { canonical: `${origin}${path}` } } : {}),
    ...(card ?? {}),
  };
}

export async function ForumView({ order, tag }: { order: ForumOrder; tag: ChosenThreadTag | null }) {
  const doc = await fetchForum(order, tag);
  if (doc === null) {
    return (
      <FailurePanel
        kind="unavailable"
        what="The threads could not be loaded. It is not something you did, and trying again in a moment usually works."
        actions={[
          { label: "Try again", href: forumPath(order, tag) },
          { label: "Products", href: "/" },
        ]}
      />
    );
  }
  const origin = publicApexOrigin();
  const path = forumPath(order, tag);

  return (
    <main className={FORUM_PAGE}>
      <JsonLd
        data={collectionPageJsonLd(
          {
            name: tag ? `${THREAD_TAG_LABELS[tag]} threads` : FORUM_TITLE,
            description: forumMeaning(order, tag),
            path,
            paths: doc.threads.map((thread) => `/threads/${thread.id}`),
          },
          origin,
        )}
      />
      <header className={PAGE_HEAD}>
        <div>
          <h1 className={PAGE_TITLE}>{FORUM_TITLE}</h1>
        </div>
        {/* The one act on the page, in ink (CP-R1). */}
        <AppLink
          href={threadComposerHref()}
          className={`tap ${BTN_PRIMARY} no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
        >
          {THREAD_COMPOSER_TITLE}
        </AppLink>
      </header>

      {/* THE CATEGORIES ARE LINKS, so a filter is an address a reader can
          share and a crawler can hold. "All" is the bare path. */}
      <nav aria-label="Category" className="mt-8 flex flex-wrap gap-2">
        <AppLink
          href={forumPath(order, null)}
          aria-current={tag === null ? "page" : undefined}
          className={`${CATEGORY} ${tag === null ? CATEGORY_ON : CATEGORY_OFF}`}
        >
          All
        </AppLink>
        {forumCategories().map((category) => (
          <AppLink
            key={category.value}
            href={forumPath(order, category.value)}
            aria-current={tag === category.value ? "page" : undefined}
            className={`${CATEGORY} ${tag === category.value ? CATEGORY_ON : CATEGORY_OFF}`}
          >
            {category.label}
          </AppLink>
        ))}
      </nav>

      {/* THE ORDER IS A VIEW, so it is the underline strip every list's sorts
          use (CP-R2, CL-R6): sticky from `sm` up, on the page's ground, with
          the order's own sentence as its caption — linked to its published
          formula (OPC-4) — where the list begins. */}
      <div
        data-threads-strip
        className="sticky top-0 z-20 mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-b border-line bg-background max-sm:static"
      >
        <nav aria-label="Order" className="flex gap-6">
          {FORUM_ORDERS.map((candidate) => {
            const on = candidate === order;
            return (
              <AppLink
                key={candidate}
                href={forumPath(candidate, tag)}
                aria-current={on ? "page" : undefined}
                className={`tap-h ${TAB} h-[52px] px-0 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  on ? TAB_ON : TAB_OFF
                }`}
              >
                {FORUM_ORDER_LABEL[candidate]}
              </AppLink>
            );
          })}
        </nav>
        <AppLink
          href={formulaHref(doc.formula)}
          data-threads-caption
          className="tap py-2 text-[13.5px] text-faint hover:text-foreground"
        >
          {forumMeaning(order, tag)}
        </AppLink>
      </div>

      {doc.threads.length === 0 ? (
        // The list IS the page, so its empty state stays — said once.
        <p className="m-0 mt-6 rounded-[20px] border border-dashed border-border px-8 py-14 text-center text-[16px] text-muted-foreground">
          No threads yet.
        </p>
      ) : (
        <ul className="m-0 mt-6 grid list-none gap-[14px] p-0" data-thread-tiles>
          {doc.threads.map((thread) => (
            <ThreadTile key={thread.id} thread={thread} slug={thread.slug} now={Date.now()} />
          ))}
        </ul>
      )}
    </main>
  );
}

/** A tag segment outside the vocabulary is a 404 — the topic page's rule. */
export function tagOrNotFound(raw: string): ChosenThreadTag {
  const tag = forumCategories().find((c) => c.value === decodeURIComponent(raw));
  if (!tag) notFound();
  return tag.value;
}
