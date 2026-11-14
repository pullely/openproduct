// The post cards (openproduct-redesign OPR-3; boards `Feed`, `PhoneFeed`,
// and the lists on `Product` and `Person`).
//
// ONE CARD PER KIND, AND THE KIND IS THE CARD'S SHAPE, NOT A LABEL (design §2,
// the owner's rule). Nothing here prints "Feature shipped" on a card for a
// reader — the article carries the kind's name for a screen reader only:
//
//   feature  the launch card: an amber glow in its corner, the check badge,
//            the feature's name, what it does, the milestone bars, "Try it"
//   version  the release-notes panel: the version big and mono, then a row
//            per line under Added / Changed / Fixed / Security
//   idea     the lavender note with one square corner: "an idea, not built
//            yet", the problem as a serif italic quote
//   seat     the ticket: two notches, a dashed empty seat, "Take the seat"
//   demo     in the vocabulary, recorded not typed (OPR4): a plain card with
//            whatever it carries, so a demo in a feed never breaks the page
//
// SERVER COMPONENTS. Everything a reader reads is drawn here from the post's
// own blocks, the same bytes for everybody. The three islands are the ones
// that must be personal: Follow, the reaction summary, the reaction picker
// (`reaction-control.tsx`), each of which server-renders its anonymous state.
//
// TEMPLATE-ONLY: a card draws the blocks its kind's catalogue names, in the
// catalogue's order, and only those the post carries. A URL becomes a link
// only when it is http(s) (`blockLink`); a `lines` block is a list.
//
// A DRAFT IS NEVER DRAWN. `ProductPostCard` renders nothing for anything
// that is not a published post (`isPublishedPost`).

import type * as React from "react";

import {
  PRODUCT_POST_KIND_LABELS,
  makerPath,
  productPostPagePath,
  type MilestoneCounts,
  type PublicProductPost,
} from "@openproduct/contracts";

import { PersonName } from "../ui/bits";
import { BTN_SEAT, FOCUS, SEAT_RING } from "../ui/design";
import { FollowButton } from "../ui/follow-button";
import { PlusIcon } from "../ui/icons";
import { AppLink } from "../ui/link";
import { ProductTile } from "../ui/product-tile";
import { IDEA_MARK, IDEA_NEEDS_BUILDER } from "../ui/stage";
import { MilestoneSegments } from "../ui/stage-mark";
import { absoluteOf } from "../ui/time";

import {
  blockLines,
  blockLink,
  blockText,
  drawnBlocks,
  isPublishedPost,
  postAnchor,
  postHeadline,
  productSeatsPath,
} from "./blocks";

import { commentCountLine, reactionCountLine, safeCounts } from "./reactions";

/**
 * Where a card is drawn.
 *
 *   feed     the whole card: product row with Follow, the body, the reaction
 *            and comment footer (the feed, and a post's own page)
 *   product  a row in a product's own list (board `Product`, "Updates"): no
 *            product row — the page is the product — and one quiet line of
 *            counts under the body
 *   person   a row in a person's list (board `Person`): like `product`, and
 *            it names the product it is for
 */
export type PostCardVariant = "feed" | "product" | "person";

export interface PostCardProps {
  post: PublicProductPost;
  variant?: PostCardVariant;
  /** The page the card is on. Sign-in returns here, at the control pressed. */
  returnTo: string;
  /**
   * The product's milestone counts, when the page holds fresher ones than the
   * post's own (`post.product.milestoneCounts`, which every post carries). A
   * Feature shipped card draws its progress bars from whichever it has.
   */
  milestoneCounts?: MilestoneCounts | null;
  /** Where "Take the seat" / "Take a seat" goes. The product's own seats by
   *  default (`productSeatsPath`). */
  seatHref?: string;
  /** Extra controls for the compact variants' last line (a maker's "Edit
   *  post", drawn by the page after load). Not drawn on `feed`. */
  actions?: React.ReactNode;
  /**
   * The `feed` variant's last rows: `<PostFooter>` from `post-footer.tsx`,
   * handed in by the page that draws full cards.
   *
   * A PROP, NOT AN IMPORT, for one reason: weight. The footer holds the two
   * reaction controls, which are client components, and a page downloads
   * the code of every client component its files import — drawn or not. A
   * product's Updates and a person's list draw compact cards only (they say
   * the counts in words); while this file imported the footer, each of them
   * downloaded the reaction controls for nothing. Not drawn on a compact card.
   */
  footer?: React.ReactNode;
  /**
   * The level of the card's headline, which is whatever comes next in the
   * page's outline: `3` under a section's `h2` (the default), `2` in a list
   * that sits straight under the page's `h1` (the feed, a product's
   * Updates), and `1` on the post's own page, where the headline IS the
   * page's heading — drawn once, visible, and not said a second time by a
   * hidden one. A level is never skipped.
   */
  headingLevel?: 1 | 2 | 3;
}

/** A card's headline, at the level the page gives it. The look is the
 *  caller's `className` either way: a level changes what the heading is, not
 *  how it is drawn. */
function PostTitle({
  level = 3,
  className,
  children,
}: {
  level?: 1 | 2 | 3 | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  return (
    <Tag data-post-title className={className}>
      {children}
    </Tag>
  );
}

/** The shell each kind's card is: the SHAPE that says what kind it is. */
export const POST_CARD_SHELL: Record<PublicProductPost["kind"], string> = {
  feature:
    "relative overflow-hidden rounded-[16px] bg-card bg-[radial-gradient(520px_200px_at_100%_0%,oklch(var(--brand-amber-inverted)/0.22),transparent_70%)]",
  version: "relative overflow-hidden rounded-[16px] bg-card",
  demo: "relative overflow-hidden rounded-[16px] bg-card",
  idea: "relative overflow-hidden rounded-[4px_16px_16px_16px] bg-idea-wash",
  // No `overflow-hidden`: the ticket's notches sit half outside it.
  seat: "relative rounded-[16px] bg-card",
};

/** A post's date as a card prints it. Absolute, so a cached page never says
 *  "2h ago" about something from yesterday. */
export function postDate(iso: string): string {
  return absoluteOf(iso);
}

/**
 * The one switch. Draws the card for the post's kind in the asked variant;
 * draws NOTHING for a draft, a removed post, or anything that is not a
 * published post.
 */
export function ProductPostCard(props: PostCardProps) {
  const { post, variant = "feed" } = props;
  if (!isPublishedPost(post)) return null;
  const compact = variant !== "feed";
  return (
    <article
      id={postAnchor(post.id)}
      aria-label={`${PRODUCT_POST_KIND_LABELS[post.kind]}: ${postHeadline(post)}`}
      data-post-card={post.kind}
      data-post-variant={variant}
      className={`${POST_CARD_SHELL[post.kind]} scroll-mt-[80px] ${compact && post.kind !== "seat" ? "flex flex-col gap-3 px-[22px] py-5 max-sm:gap-2.5 max-sm:p-[14px]" : ""}`}
    >
      {post.kind === "seat" ? <TicketNotches /> : null}
      {compact ? null : <PostHead post={post} returnTo={props.returnTo} />}
      <PostBody {...props} variant={variant} />
      {compact ? (
        post.kind === "seat" ? null : <CompactFooter post={post} actions={props.actions} />
      ) : (
        // The full card's last rows — the reaction summary and the React /
        // Comment row — are the page's to hand in (`PostFooter`).
        (props.footer ?? null)
      )}
    </article>
  );
}

function PostBody(props: PostCardProps & { variant: PostCardVariant }) {
  switch (props.post.kind) {
    case "feature":
      return <FeatureBody {...props} />;
    case "version":
      return <VersionBody {...props} />;
    case "idea":
      return <IdeaBody {...props} />;
    case "seat":
      return <SeatBody {...props} />;
    case "demo":
      return <DemoBody {...props} />;
  }
}

// ─── the pieces every card shares ──────────────────────────────────────────

/**
 * The product row: the logo tile and the name, both to the product's page;
 * `by <author>` linking to the person when they have a public page (plain
 * text never — an author with no page is not named at all, `author` is null);
 * the date; and ONE Follow, which follows the PRODUCT.
 */
export function PostHead({ post, returnTo }: { post: PublicProductPost; returnTo: string }) {
  const href = `/${post.product.slug}`;
  return (
    <div data-post-head className="flex items-center gap-3 px-5 pb-2.5 pt-[18px] max-sm:gap-2.5 max-sm:px-[14px] max-sm:pb-1.5 max-sm:pt-[14px]">
      <AppLink href={href} tabIndex={-1} aria-hidden="true" className="shrink-0">
        <ProductTile slug={post.product.slug} thumbnail={post.product.logo} size={44} />
      </AppLink>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 24px tall: the smallest a pointer target may be (WCAG 2.5.8). */}
        <AppLink href={href} className={`inline-flex min-h-[24px] items-center self-start font-semibold text-foreground no-underline hover:underline ${FOCUS}`}>
          {post.product.name}
        </AppLink>
        <span className="text-[13px] text-muted-foreground">
          <Byline post={post} /> <time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time>
        </span>
      </div>
      <FollowButton
        kind="listing"
        value={post.product.slug}
        followers={0}
        returnTo={returnTo}
        size="regular"
        tone="ink"
        countHidden
      />
    </div>
  );
}

/** `by Ada ·` — or nothing, when the post has no author to name. */
function Byline({ post }: { post: PublicProductPost }) {
  if (!post.author) return null;
  return (
    <>
      by{" "}
      <PersonName
        name={post.author.displayName ?? `@${post.author.handle}`}
        handle={post.author.handle}
        className="font-semibold text-copy no-underline"
      />{" "}
      ·
    </>
  );
}

/** A compact card's last line: `5 reactions · 5 comments`, each only above
 *  zero, and on the right whatever the page adds plus the kind's own link. */
function CompactFooter({ post, actions }: { post: PublicProductPost; actions?: React.ReactNode }) {
  const page = productPostPagePath(post.product.slug, post.id);
  const reactions = reactionCountLine(safeCounts(post.reactions));
  const comments = commentCountLine(post.commentCount);
  const tryLink = post.kind === "feature" ? blockLink(post.blocks, "try") : null;
  return (
    <div data-post-summary className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
      <span>
        {reactions}
        {reactions && comments ? " · " : null}
        {comments ? (
          <AppLink href={`${page}#comments`} data-post-comments className={`text-muted-foreground underline underline-offset-[3px] ${FOCUS}`}>
            {comments}
          </AppLink>
        ) : null}
        {!reactions && !comments ? (
          <AppLink href={page} className={`text-muted-foreground underline underline-offset-[3px] ${FOCUS}`}>
            Open post
          </AppLink>
        ) : null}
      </span>
      <span className="flex items-center gap-4">
        {actions}
        {tryLink ? (
          <a href={tryLink} rel="nofollow noopener" className={`tap justify-end font-semibold no-underline hover:underline ${FOCUS}`}>
            Try it
          </a>
        ) : null}
      </span>
    </div>
  );
}

/** The meta line under a compact card's title: the product (on a person's
 *  list), the milestone, the date, the author. */
function CompactMeta({
  post,
  variant,
  lead,
  tone = "text-muted-foreground",
}: {
  post: PublicProductPost;
  variant: PostCardVariant;
  lead?: string | null;
  /** The line's ink. The muted grey is 4.46:1 on the release-notes panel's
   *  slate tint, so that panel passes its own. */
  tone?: string;
}) {
  return (
    <span className={`text-[13px] ${tone}`}>
      {variant === "person" ? (
        <>
          for{" "}
          <AppLink href={`/${post.product.slug}`} className={`font-semibold no-underline hover:underline ${FOCUS}`}>
            {post.product.name}
          </AppLink>{" "}
          ·{" "}
        </>
      ) : null}
      {lead ? `${lead} · ` : null}
      <time dateTime={post.publishedAt}>{postDate(post.publishedAt)}</time>
      {variant === "product" && post.author ? (
        <>
          {" "}
          · by{" "}
          <PersonName
            name={post.author.displayName ?? `@${post.author.handle}`}
            handle={post.author.handle}
            className="font-semibold text-copy no-underline"
          />
        </>
      ) : null}
    </span>
  );
}

/** An address a maker gave, as a link out. `nofollow`: nobody here vouches
 *  for an outbound link. */
function OutLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} rel="nofollow noopener" className={`font-semibold no-underline hover:underline ${FOCUS} ${className}`}>
      {children}
    </a>
  );
}

// ─── Feature shipped: the launch card ──────────────────────────────────────

function CheckBadge() {
  return (
    <span
      aria-hidden="true"
      className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,oklch(var(--brand-amber-inverted)),oklch(var(--brand-amber)))] text-card max-sm:h-[26px] max-sm:w-[26px]"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-4 w-4 max-sm:h-3 max-sm:w-3">
        <path d="M5 12l5 5 9-10" />
      </svg>
    </span>
  );
}

function FeatureBody({ post, variant, milestoneCounts, headingLevel }: PostCardProps & { variant: PostCardVariant }) {
  const compact = variant !== "feed";
  const what = blockText(post.blocks, "what");
  const forWho = blockText(post.blocks, "for");
  const milestone = blockText(post.blocks, "milestone");
  const tryLink = blockLink(post.blocks, "try");
  const screenshot = blockLink(post.blocks, "screenshot");
  const demo = blockLink(post.blocks, "demo");
  return (
    <div className={compact ? "contents" : "flex flex-col gap-3 px-[22px] pt-1 max-sm:gap-2 max-sm:px-[14px]"}>
      <div className="flex items-center gap-2.5 max-sm:gap-2">
        <CheckBadge />
        <div className="flex min-w-0 flex-col">
          <PostTitle level={headingLevel}
            className={`m-0 font-semibold leading-[1.2] tracking-[-0.02em] text-foreground [overflow-wrap:anywhere] max-sm:text-card-title ${
              compact ? "text-[20px]" : "text-[21px]"
            }`}
          >
            {postHeadline(post)}
          </PostTitle>
          {compact ? <CompactMeta post={post} variant={variant} lead={milestone} /> : null}
        </div>
      </div>
      {what ? <p className="m-0 whitespace-pre-line text-[15px] text-copy">{what}</p> : null}
      {!compact && (forWho || milestone) ? (
        <div className="flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-muted-foreground">
          {forWho ? (
            <span>
              <span className="font-semibold text-foreground">For</span> {forWho}
            </span>
          ) : null}
          {milestone ? (
            <span>
              <span className="font-semibold text-foreground">Milestone</span> {milestone}
            </span>
          ) : null}
        </div>
      ) : null}
      <MilestoneSegments counts={milestoneCounts ?? post.product.milestoneCounts} />
      {!compact && (screenshot || demo) ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {screenshot ? <OutLink href={screenshot}>See the screenshot</OutLink> : null}
          {demo ? <OutLink href={demo}>Watch the demo</OutLink> : null}
        </div>
      ) : null}
      {!compact && tryLink ? (
        <a
          href={tryLink}
          rel="nofollow noopener"
          data-post-try
          className={`flex min-h-[40px] items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground no-underline hover:opacity-90 max-sm:min-h-[42px] ${FOCUS}`}
        >
          Try it
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}

// ─── New version: the release-notes panel ──────────────────────────────────

/** The groups of a version's notes, in the catalogue's order, each with the
 *  mark its rows wear. */
const VERSION_GROUPS = [
  { block: "added", label: "Added", glyph: "+" },
  { block: "changed", label: "Changed", glyph: "~" },
  { block: "fixed", label: "Fixed", glyph: "✓" },
  { block: "security", label: "Security", glyph: "!" },
] as const;

function VersionBody({ post, variant, headingLevel }: PostCardProps & { variant: PostCardVariant }) {
  const compact = variant !== "feed";
  const breaking = blockText(post.blocks, "breaking");
  const rows = VERSION_GROUPS.flatMap((group) =>
    blockLines(post.blocks, group.block).map((text) => ({ ...group, text })),
  );
  return (
    <div
      data-release-notes
      className={`flex flex-col gap-3 rounded-[14px] bg-version-soft px-[18px] py-4 max-sm:px-[14px] max-sm:py-3 ${
        compact ? "" : "mx-[18px] mt-1 max-sm:mx-[14px]"
      }`}
    >
      <div className="flex flex-col">
        <span className="font-mono text-mono-label uppercase text-version">Release notes</span>
        <PostTitle level={headingLevel}
          className="m-0 font-mono text-[30px] font-medium leading-[1.1] tracking-[-0.02em] text-foreground [overflow-wrap:anywhere] max-sm:text-[24px]"
        >
          {postHeadline(post)}
        </PostTitle>
        {compact ? <CompactMeta post={post} variant={variant} tone="text-copy" /> : null}
      </div>
      {rows.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {rows.map((row, index) => (
            <li key={`${row.block}-${index}`} className="flex gap-2.5 border-t border-dashed border-version/20 py-1.5">
              <span aria-hidden="true" className={`w-3.5 shrink-0 font-mono text-label ${row.block === "security" ? "text-seat" : "text-success"}`}>
                {row.glyph}
              </span>
              <span className="w-[70px] shrink-0 font-mono text-label text-version">{row.label}</span>
              <span className="min-w-0 flex-1 text-[15px] text-foreground [overflow-wrap:anywhere]">{row.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {breaking ? (
        <p className="m-0 whitespace-pre-line border-t border-dashed border-version/20 pt-2 text-[15px] text-foreground">
          <span className="font-semibold">Breaking change.</span> {breaking}
        </p>
      ) : null}
      {/* The deploy strip goes here (OPR5): where this version is running. */}
    </div>
  );
}

// ─── New idea: the lavender note ───────────────────────────────────────────

function IdeaBody({ post, variant, seatHref, headingLevel }: PostCardProps & { variant: PostCardVariant }) {
  const compact = variant !== "feed";
  const detail = blockText(post.blocks, "detail");
  const who = blockText(post.blocks, "who");
  const whyNow = blockText(post.blocks, "why-now");
  const seats = blockText(post.blocks, "seats");
  const evidence = blockLink(post.blocks, "evidence");
  return (
    <div className={compact ? "contents" : "flex flex-col gap-3.5 px-6 pt-1 max-sm:gap-2.5 max-sm:px-4"}>
      <span data-stage-mark="idea" className="font-mono text-mono-label uppercase text-idea">
        {IDEA_MARK}
      </span>
      {headingLevel === 1 ? (
        // On the post's own page the quote is the page's heading.
        <h1
          data-post-title
          className="m-0 font-serif text-[22px] font-normal italic leading-[1.35] text-idea-deep [overflow-wrap:anywhere] max-sm:text-card-title"
        >
          {`“${postHeadline(post)}”`}
        </h1>
      ) : (
        <blockquote
          data-post-title
          className="m-0 font-serif text-[22px] italic leading-[1.35] text-idea-deep [overflow-wrap:anywhere] max-sm:text-card-title"
        >
          {`“${postHeadline(post)}”`}
        </blockquote>
      )}
      {compact ? <CompactMeta post={post} variant={variant} /> : null}
      {detail ? <p className="m-0 whitespace-pre-line text-[15px] text-idea-deep">{detail}</p> : null}
      {who || whyNow || evidence ? (
        <div className="flex flex-col gap-1 text-[13px] text-idea-deep">
          {who ? (
            <span>
              <span className="font-semibold">Who has it:</span> {who}
            </span>
          ) : null}
          {whyNow ? (
            <span>
              <span className="font-semibold">Why now:</span> {whyNow}
            </span>
          ) : null}
          {evidence ? (
            <span>
              <OutLink href={evidence} className="text-idea">
                Evidence
              </OutLink>
            </span>
          ) : null}
        </div>
      ) : null}
      {compact ? null : (
        <div className="flex items-center justify-between gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-idea/35 px-3.5 py-3 text-[13px] text-idea-deep max-sm:px-3 max-sm:py-2.5">
          <span className="min-w-0 [overflow-wrap:anywhere]">{seats ?? IDEA_NEEDS_BUILDER}</span>
          <AppLink
            href={seatHref ?? productSeatsPath(post.product.slug, post.product.stage)}
            data-post-seat
            className={`flex min-h-[40px] shrink-0 items-center rounded-full bg-idea-deep px-3.5 font-semibold text-idea-wash no-underline hover:opacity-90 max-sm:min-h-[44px] ${FOCUS}`}
          >
            Take a seat
          </AppLink>
        </div>
      )}
    </div>
  );
}

// ─── Help wanted: the ticket ───────────────────────────────────────────────

/** The ticket's two notches: the page colour, half outside the card. */
function TicketNotches() {
  return (
    <>
      <span aria-hidden="true" className="absolute -left-3 top-1/2 -mt-3 h-6 w-6 rounded-full bg-background" />
      <span aria-hidden="true" className="absolute -right-3 top-1/2 -mt-3 h-6 w-6 rounded-full bg-background" />
    </>
  );
}

function SeatBody({ post, variant, seatHref, headingLevel }: PostCardProps & { variant: PostCardVariant }) {
  const what = blockText(post.blocks, "what");
  const sub = [blockText(post.blocks, "time"), blockText(post.blocks, "return"), blockText(post.blocks, "skills")]
    .filter((part): part is string => part !== null)
    .join(" · ");
  const href = seatHref ?? productSeatsPath(post.product.slug, post.product.stage);
  if (variant !== "feed") {
    // The list's ticket (boards `Product`, `Person`): the seat on its side.
    return (
      <div className="flex flex-wrap items-center gap-4 px-[26px] py-[18px] max-sm:px-[18px] max-sm:py-[14px]">
        <span aria-hidden="true" className={`flex h-[52px] w-[52px] items-center justify-center border-2 text-seat max-sm:h-[44px] max-sm:w-[44px] ${SEAT_RING}`}>
          <PlusIcon className="h-5 w-5 shrink-0" />
        </span>
        <div className="flex min-w-0 flex-[1_1_220px] flex-col border-l-2 border-dashed border-border pl-4">
          <span className="font-mono text-mono-label uppercase text-seat-ink">
            {variant === "person" ? `Open seat · ${post.product.name}` : "Open seat"}
          </span>
          <PostTitle level={headingLevel} className="m-0 text-card-title font-semibold tracking-[-0.015em] text-foreground [overflow-wrap:anywhere]">
            {postHeadline(post)}
          </PostTitle>
          {sub ? <span className="text-[13px] text-muted-foreground">{sub}</span> : null}
        </div>
        <AppLink href={href} data-post-seat className={`${BTN_SEAT} max-sm:text-[13px] ${FOCUS}`}>
          Take the seat
        </AppLink>
      </div>
    );
  }
  return (
    <div className="mx-[22px] mt-1.5 flex flex-col items-center gap-2.5 border-t-2 border-dashed border-border pb-1 pt-[18px] text-center max-sm:mx-[14px]">
      <span aria-hidden="true" data-empty-seat className={`flex h-16 w-16 items-center justify-center border-2 text-seat ${SEAT_RING}`}>
        <PlusIcon className="h-6 w-6 shrink-0" />
      </span>
      <span className="font-mono text-mono-label uppercase text-seat-ink">Open seat on the crew</span>
      <PostTitle level={headingLevel} className="m-0 text-[21px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground [overflow-wrap:anywhere] max-sm:text-card-title">
        {postHeadline(post)}
      </PostTitle>
      {what ? <p className="m-0 max-w-[440px] whitespace-pre-line text-[15px] text-copy">{what}</p> : null}
      {sub ? <span className="text-[13px] text-muted-foreground">{sub}</span> : null}
      <AppLink href={href} data-post-seat className={`${BTN_SEAT} px-[22px] ${FOCUS}`}>
        Take the seat
      </AppLink>
    </div>
  );
}

// ─── Demo: in the vocabulary, drawn plainly until OPR4 ─────────────────────

function DemoBody({ post, variant, headingLevel }: PostCardProps & { variant: PostCardVariant }) {
  const compact = variant !== "feed";
  const blocks = drawnBlocks("demo", post.blocks, ["title"]);
  return (
    <div className={compact ? "contents" : "flex flex-col gap-1 px-5 pt-0.5 max-sm:px-[14px]"}>
      <PostTitle level={headingLevel} className="m-0 text-card-title font-semibold tracking-[-0.015em] text-foreground [overflow-wrap:anywhere]">
        {postHeadline(post)}
      </PostTitle>
      {compact ? <CompactMeta post={post} variant={variant} /> : null}
      {blocks.map((entry) => (
        <p key={entry.spec.id} className="m-0 whitespace-pre-line text-[15px] text-copy">
          {entry.text}
        </p>
      ))}
    </div>
  );
}

/**
 * A post's blocks as a plain labelled list, in catalogue order: every block
 * the post carries, a `lines` block as a list and a `url` block as a link.
 * For a surface that wants the whole post rather than a card's shape (the
 * builder's preview, a moderator's view).
 */
export function PostBlocks({ post, skip = [] }: { post: Pick<PublicProductPost, "kind" | "blocks">; skip?: readonly string[] }) {
  const blocks = drawnBlocks(post.kind, post.blocks, skip);
  if (blocks.length === 0) return null;
  return (
    <dl data-post-blocks className="m-0 flex flex-col gap-2.5">
      {blocks.map((entry) => (
        <div key={entry.spec.id} className="flex flex-col gap-0.5">
          <dt className="text-[13px] font-semibold text-foreground">{entry.spec.label}</dt>
          <dd className="m-0 text-[15px] text-copy [overflow-wrap:anywhere]">
            {entry.spec.type === "lines" ? (
              <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5">
                {entry.lines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            ) : entry.spec.type === "url" ? (
              <OutLink href={entry.text}>{entry.text}</OutLink>
            ) : (
              <span className="whitespace-pre-line">{entry.text}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A profile link for a post's author, when it has one — for callers that
 *  draw their own byline. */
export function authorHref(post: Pick<PublicProductPost, "author">): string | null {
  return post.author ? makerPath(post.author.handle) : null;
}

/**
 * A card's parts, for a page that lays the card out itself: the post's own
 * page (`[slug]/posts/[id]/page.tsx`) draws the head and the body exactly as
 * the feed does, then its own footer (React, Comment, Share) and the comment
 * thread inside the same article.
 */
export { PostBody as PostCardBody, TicketNotches as PostTicketNotches };
