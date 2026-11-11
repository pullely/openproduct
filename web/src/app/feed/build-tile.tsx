import {
  BUILD_TILE_LABEL,
  TOPIC_FACET,
  endorsementsOf,
  labelOf,
  mergesOf,
  recentEndorsementsOf,
  topicPath,
  type PublicProfileCard,
} from "@openproduct/contracts";

import { DASH } from "../ui/bits";
import { AppLink } from "../ui/link";
import { ProductTile } from "../ui/product-tile";
import { VoteBox } from "../ui/vote-box";

/**
 * A build, as a tile (openproduct-calm CL2, CL-R3 — render C's tile; it
 * replaced OB4's row on every list of builds).
 *
 * TWO HALVES. On the left, who it is: the face at 72px, the name at 22px,
 * the category under it, the tagline in at most two lines. On the right, how
 * it is moving: three figures, each a small label said once and a number
 * (CL-R4) — and the upvote box. One tile per row, so a list is a column a
 * reader moves down, never a grid they have to scan across.
 *
 * WHAT A CARD DOES NOT CARRY, THE TILE DOES NOT INVENT:
 *
 *   rank      none. A list in a published order is its own rank.
 *   changes   `merges.7d` as observed, or a dash when the repository was not
 *             read — never a zero for "we did not look" (OPC-C).
 *   upvotes   `endorsements.7d`, zero by the declared rule the Most active
 *             sentence states (`recentEndorsementsOf`).
 *   roles     the count of open roles, which is always known.
 *   votes     the box shows the listing's public total, or a dash while it
 *             has not been counted. The act endorses the LISTING.
 *
 * NO CLIENT DIRECTIVE, AND NOTHING SERVER-ONLY. The lists render it on the
 * server; `more-builds.tsx` renders the same component in the browser for
 * the pages it appends, so a build looks the same wherever it was drawn. The
 * vote box resolves the visitor's own state after paint either way (I6).
 */
export function BuildTile({ card, returnTo = "/" }: { card: PublicProfileCard; returnTo?: string }) {
  const href = `/${card.slug}`;
  const changes = mergesOf(card);
  const category = card.category ? (labelOf(TOPIC_FACET, card.category) ?? card.category) : null;
  return (
    // FR2 — the tile is the target: the name's link stretches over it, and
    // the category and the vote box sit above that stretch on their own.
    <li
      data-keyrow
      data-build-tile
      className="relative grid list-none grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] items-center gap-10 rounded-[20px] border border-border bg-card px-8 py-[26px] transition-colors hover:border-border-strong max-lg:grid-cols-[minmax(0,1fr)] max-lg:gap-6 max-sm:px-5 max-sm:py-5"
    >
      {/* WHO IT IS. The face spans the name and the tagline from `sm` up;
          on a phone the face is the 52px step and the tagline takes the full
          width under the face and the name, rather than a narrow column
          beside a large square. */}
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-[22px] max-sm:gap-x-4">
        <AppLink
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className="shrink-0 rounded-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:row-span-2"
        >
          <ProductTile slug={card.slug} thumbnail={card.thumbnail} size={72} phoneSize={52} />
        </AppLink>
        <div className="min-w-0 self-center sm:self-start">
          <AppLink
            href={href}
            className="block truncate text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground after:absolute after:inset-0 after:content-[''] hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:text-[19px]"
          >
            {card.slug}
          </AppLink>
          {category && card.category ? (
            <AppLink
              href={topicPath(card.category)}
              className="tap relative z-10 mt-1 inline-block text-[13.5px] text-faint hover:text-foreground"
            >
              {category}
            </AppLink>
          ) : null}
        </div>
        {/* NOT A LINK (FR2): under the name's stretch it would be
            unreachable anyway. TWO LINES at most; the build page holds the
            rest. */}
        {card.tagline ? (
          <p className="m-0 mt-[10px] line-clamp-2 max-w-[520px] text-[16px] leading-[1.5] text-copy max-sm:col-span-2 max-sm:mt-4 max-sm:text-[15px] sm:col-start-2">
            {card.tagline}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-5 max-sm:gap-3">
        <dl className="m-0 grid flex-1 grid-cols-3 gap-4 max-sm:gap-2">
          <div data-tile-changes title={changes === null ? "Repository not observed" : "Merged changes, last 7 days"}>
            <dt className="text-[12.5px] text-faint max-sm:text-[12px]">{BUILD_TILE_LABEL.changes}</dt>
            <dd
              className={`m-0 mt-1.5 text-[24px] font-medium leading-none tracking-[-0.02em] tabular-nums max-sm:text-[21px] ${
                changes === null ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              {changes === null ? DASH : changes}
            </dd>
          </div>
          <div data-tile-upvotes title="Counted upvotes, last 7 days">
            <dt className="text-[12.5px] text-faint max-sm:text-[12px]">{BUILD_TILE_LABEL.upvotes}</dt>
            <dd className="m-0 mt-1.5 text-[24px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[21px]">
              {recentEndorsementsOf(card)}
            </dd>
          </div>
          <div data-tile-roles>
            <dt className="text-[12.5px] text-faint max-sm:text-[12px]">{BUILD_TILE_LABEL.roles}</dt>
            <dd
              className={`m-0 mt-1.5 text-[24px] font-medium leading-none tracking-[-0.02em] tabular-nums max-sm:text-[21px] ${
                card.roleOpeningCount > 0 ? "text-success" : "text-muted-foreground"
              }`}
            >
              {card.roleOpeningCount}
            </dd>
          </div>
        </dl>
        {/* `relative z-10` — above the name's stretch, or the box stops being
            its own control and every press on it opens the listing. */}
        <div className="relative z-10 shrink-0">
          <VoteBox slug={card.slug} count={endorsementsOf(card)} returnTo={returnTo} shape="tile" />
        </div>
      </div>
    </li>
  );
}
