import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Children, type ReactNode } from "react";

import {
  BADGE_VARIANTS,
  BADGE_VARIANT_LABEL,
  BUILD_DETAILS_HEADING,
  BUILD_STAT_LABEL,
  CLEAN_VOTE_LABEL,
  CLEAN_VOTE_TITLE,
  FOLLOWER_COUNT_TITLE,
  INSTALL_HEADING,
  LISTING_FORUM_TITLE,
  PRICING_PROVENANCE_NOTE,
  THREAD_COMPOSER_TITLE,
  alternativesFor,
  badgeHtml,
  badgeMarkdown,
  badgeValue,
  badgeVariantValue,
  breadcrumbJsonLd,
  cardMark,
  dayOf,
  demandLine,
  followerLine,
  formulaHref,
  labelOf,
  launchHealth,
  listingForumPath,
  listingJsonLd,
  mostActiveRankOf,
  observedRow,
  pricingPath,
  rankMarks,
  shareIntents,
  shareText,
  shareUrl,
  takingOffersLine,
  thumbnailOf,
  threadComposerHref,
  topicPath,
  type Alternative,
  type Demand,
  type MilestoneCounts,
  type PublicMilestone,
  type PublicRoleOpening,
  type ProductPostsPage,
  type PublicMetric,
  type PublicProductPost,
  type PublicProfile,
} from "@openproduct/contracts";

import {
  fetchDiscussion,
  fetchListing,
  fetchPublicDirectory,
  maintainerLabel,
  publicApexOrigin,
  publicApiBase,
  type ListingRead,
} from "../public-api";
import { initialsOf } from "../feed/tile";
import { blockText } from "../posts/blocks";
import { ProductPostCard } from "../posts/post-card";
import { fetchProductPosts } from "../posts/posts-api";
import { DASH, NewPill, PersonName } from "../ui/bits";
import { LiveCount } from "../ui/conversation-live";
import {
  BOARD_CARD_TITLE,
  BOARD_COLUMNS,
  BOARD_PAGE,
  BOARD_STACK,
  BTN_INK,
  BTN_SOFT,
  CARD,
  COVER_PRODUCT,
  FOCUS,
  H3,
  PAGE_TITLE,
  PANEL,
  SECTION_PILL,
  SECTION_PILL_OFF,
  SECTION_PILL_ON,
  SEAT_RING,
  SEAT_ROW,
  SIDE_CARD,
  SIDE_ROW,
  SIDE_TITLE,
  STACK_PILL,
} from "../ui/design";
import { FollowButton } from "../ui/follow-button";
import { ActiveIcon, ChangesIcon, ClockIcon, UpvoteIcon } from "../ui/icons";
import { JsonLd } from "../ui/json-ld";
import { AppLink } from "../ui/link";
import { conversationKey } from "../ui/live-posts";
import { MetricValue, agoOf, fromEpochSeconds, metricsByKey } from "../ui/metric";
import { cardMeta, productCopy } from "../ui/og";
import { ordinal } from "../ui/ordinal";
import { PENDING, pendingProps } from "../ui/pending";
import { ProductTile } from "../ui/product-tile";
import { ReportControl } from "../ui/report-control";
import { SaveControl } from "../ui/save-control";
import { IDEA_MARK, IDEA_NEEDS_BUILDER, milestoneProgress } from "../ui/stage";
import { StageMark } from "../ui/stage-mark";
import { DelistedNote, ListingTombstone } from "../ui/tombstone";
import { VoteBox } from "../ui/vote-box";

import { AnchorForward } from "./anchor-forward";
import { BadgeSnippet, type BadgeChoice } from "./badge-snippet";
import { Changes } from "./changes";
import { Comments } from "./comments";
import { EarlierDiscussions } from "./discussions";
import { InstallLine } from "./install-line";
import { LaunchHealth } from "./launch-health";
import { MakerHeaderActions, ProductPitch, VisitorOnly } from "./maker/details";
import { MilestonesManager } from "./maker/milestones";
import { NeedsYou } from "./maker/needs-you";
import { EditPostLink, NewPostRow } from "./maker/new-post";
import { CrewNoticeLine } from "./maker/notice";
import { AddSeatLink, SeatAction } from "./maker/seats";
import { ViewSwitch } from "./maker/view-switch";
import { MediaPanel } from "./media-panel";
import { ObservedRow } from "./observed-row";
import { SECTION_ATTRIBUTE, SECTION_CARD, SECTION_PROSE } from "./sections";
import { ShareControl } from "./share-control";
import { WORKSPACE_VIEW_LABEL, workspaceConsentPath } from "./workspace-view";
import {
  PRODUCT_TABS_LABEL,
  PRODUCT_TAB_LABELS,
  pageKindOf,
  productTabLinks,
  productTabPath,
  productUpdatesPagePath,
  type ProductTab,
} from "./tabs";
import { WouldUseButton } from "./would-use";

/**
 * A product's page (openproduct-redesign OPR-3; boards `Product`,
 * `PhoneProduct`, `ProductIdea`, `PhoneProductIdea`).
 *
 * ONE ADDRESS, TWO PAGES. The public product document says whether the
 * product is `shipping` or an `idea`, and that alone picks the page
 * (`pageKindOf`). Both are public, cached, and the same bytes for every
 * visitor.
 *
 *   shipping  the header card — the cover, the logo, the name with its stage
 *             mark (`SHIPPING · 3 OF 4`), the one-line pitch, a line of
 *             facts, Follow / Take a seat / Try it — then the four tabs, each
 *             a route of its own (`tabs.ts`): Updates (the product's posts),
 *             About (what it does, milestones, details), Crew (the people,
 *             the open seats), Talk (the discussion). Beside them: Crew,
 *             Built with, In the open.
 *   idea      the lavender note — `AN IDEA, NOT BUILT YET`, the name, the
 *             idea in one line as a serif quote, who it is by — with Take a
 *             seat / I'd use this / Follow and where the idea stands; then
 *             the problem, the open seats, anything posted, the discussion.
 *             No tabs.
 *
 * THE MAKER VIEW IS NOT IN THIS RENDER (design §4). The switch, "Edit
 * details", "New post", "Needs you", the milestone manager, "Edit post" and
 * "Add a seat" are client components under `maker/`, each gated on
 * `useMaker(slug)` → `useCrewOf(slug)`; on the server every one of them
 * returns null. They draw in the crew's own browser once the overlay has
 * answered, so the cached HTML is the visitor's page for everybody.
 *
 * The page renders ONLY what the public projection carries, and where a
 * figure was not observed it renders a dash and says what brings it. Never a
 * zero: a zero is a claim, and an unobserved thing has not made one (OPC-C).
 */

const NEW_MS = 14 * 24 * 60 * 60 * 1000;

function longDate(iso: string | null): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * `Name — tagline`, trimmed to what a tab and a search result actually show.
 *
 * The brand is NOT here: `layout.tsx`'s template appends it, and a title that
 * carries its own brand is how `/signin` came to serve it twice.
 */
export function listingTitle(slug: string, tagline: string | null): string {
  const trimmed = (tagline ?? "").trim();
  if (trimmed === "") return slug;
  const full = `${slug} — ${trimmed}`;
  // 48 leaves room for ` · openproduct` inside a ~62-character budget.
  if (full.length <= 48) return full;
  return `${full.slice(0, 47).trimEnd()}…`;
}

/**
 * The metadata for one view of a product. The product's own address
 * (`updates`) keeps the title and the card it has always had; a tab is
 * `About · name`, canonical at its own address.
 */
export async function productMetadata(slug: string, tab: ProductTab): Promise<Metadata> {
  const read = await fetchListing(slug);
  const profile = read?.profile;
  if (!profile) {
    // TS3 — a removed listing still HAS an address, so it still has a title,
    // and that title is the fact rather than the name of the thing that was
    // there. `index: false` on both branches: a 404 has nothing to index, and
    // a tombstone indexed is a removal amplified.
    if (read?.tombstone) {
      return { title: "No longer listed", robots: { index: false, follow: false } };
    }
    return { title: "Not found" };
  }

  const description = profile.tagline ?? "A product built in the open, looking for people.";
  const apex = publicApexOrigin();
  // RE0 — the listing's own card. `cardMeta` returns null on a deployment
  // with no canonical origin: `og:image` has to be absolute.
  const card = cardMeta(
    apex,
    `/og/product/${profile.slug}`,
    productCopy(profile.slug, profile.tagline, cardMark(profile.launch)).alt,
  );
  const root = tab === "updates";
  return {
    // `Name — tagline`, and the template adds `· openproduct` (RE2).
    title: root ? listingTitle(profile.slug, profile.tagline) : `${PRODUCT_TAB_LABELS[tab]} · ${profile.slug}`,
    description,
    ...(apex ? { alternates: { canonical: `${apex}${productTabPath(profile.slug, tab)}` } } : {}),
    // TS1 — a first listing from a maker nobody has reviewed is LIVE and
    // READABLE, and simply not amplified. Read from the projection, never
    // recomputed here.
    ...(profile.indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: `${profile.slug} · openproduct`,
      description,
      type: "article",
      ...(card ? { images: card.images } : {}),
    },
    ...(card ? { twitter: card.twitter } : {}),
  };
}

export interface ProductPageProps {
  slug: string;
  tab: ProductTab;
  /** The updates page after the first: the previous page's `next`. */
  cursor?: string | null;
}

export async function ProductPage({ slug, tab, cursor = null }: ProductPageProps) {
  const read = await fetchListing(slug);
  const profile = read?.profile;

  // TS3 — REMOVED IS NOT MISSING. A removed listing renders its tombstone:
  // the address keeps working and inbound links do not break. It caches
  // exactly like the page it replaced (OPC-1, I6).
  if (!profile && read?.tombstone) {
    return <ListingTombstone tombstone={read.tombstone} />;
  }
  // Unknown, unpublished and unreachable all land here: one 404 for all
  // three keeps this page from becoming the oracle the API refuses to be.
  if (!profile) notFound();

  if (pageKindOf(profile.stage) === "idea") {
    // An idea has one page and no tabs: its tab addresses are that page.
    if (tab !== "updates" || cursor) redirect(`/${profile.slug}`);
    return <IdeaPage read={read!} profile={profile} />;
  }
  return <ShippingPage read={read!} profile={profile} tab={tab} cursor={cursor} />;
}

// ─── what both pages share ─────────────────────────────────────────────────

function shareOf(profile: PublicProfile) {
  // RE3 — the address, the sentence and the three links, built once. `null`
  // without a canonical origin.
  const url = shareUrl(publicApexOrigin(), profile.slug);
  if (!url) return null;
  const text = shareText(profile.slug, profile.tagline);
  return { url, text, intents: shareIntents(url, text) };
}

/** The structured record and the trail, for a crawler that already has the
 *  page. The record only on the product's own address, and only when the
 *  page asks to be indexed (TS1); there is no rating in it and there will
 *  not be (`NO_RATING_NOTE`). The trail is emitted either way. */
function Records({ profile, tab }: { profile: PublicProfile; tab: ProductTab }) {
  const apex = publicApexOrigin();
  const trail = [
    { name: "Products", path: "/products" },
    { name: profile.slug, path: `/${profile.slug}` },
    ...(tab === "updates" ? [] : [{ name: PRODUCT_TAB_LABELS[tab], path: productTabPath(profile.slug, tab) }]),
  ];
  return (
    <>
      {tab === "updates" && profile.indexable ? <JsonLd data={listingJsonLd(profile, apex, publicApiBase())} /> : null}
      <JsonLd data={breadcrumbJsonLd(trail, apex)} />
    </>
  );
}

/** The crew's pieces that belong to the page rather than to a card: the
 *  header's switch and the one line a crew form came back with. Both render
 *  nothing on the server. */
function MakerChrome({ slug }: { slug: string }) {
  return (
    <>
      <ViewSwitch slug={slug} />
      <CrewNoticeLine slug={slug} />
    </>
  );
}

/** The smaller acts, kept in the header (owner rule 10: small controls live
 *  there, none takes a row of its own). Save is private and counted nowhere;
 *  Share is the browser's own sheet and three ordinary links. */
function SecondaryActs({ profile, upvote }: { profile: PublicProfile; upvote: ReactNode }) {
  const share = shareOf(profile);
  return (
    <div data-secondary-acts className="flex flex-wrap items-center justify-end gap-2 max-sm:justify-start">
      {upvote}
      <SaveControl slug={profile.slug} />
      {share ? <ShareControl url={share.url} text={share.text} intents={share.intents} /> : null}
    </div>
  );
}

// ─── the shipping page ─────────────────────────────────────────────────────

async function ShippingPage({
  read,
  profile,
  tab,
  cursor,
}: {
  read: ListingRead;
  profile: PublicProfile;
  tab: ProductTab;
  cursor: string | null;
}) {
  const slug = profile.slug;
  // EACH TAB READS WHAT IT DRAWS. All anonymous, all cached for a minute,
  // and concurrent: the catalogue for the side column's place and
  // alternatives, the posts for Updates, the discussion for Talk.
  const [catalog, posts, discussion] = await Promise.all([
    fetchPublicDirectory(),
    tab === "updates" ? fetchProductPosts(slug, cursor) : Promise.resolve(null),
    tab === "talk" ? fetchDiscussion(slug) : Promise.resolve(null),
  ]);
  const now = Date.now();
  const openRoles = profile.roleOpenings.filter((role) => role.status === "open");
  const isNew = profile.publishedAt !== null && now - Date.parse(profile.publishedAt) < NEW_MS;
  const metrics = metricsByKey(profile.metrics);
  const endorsements = metrics.get("endorsements.total");
  // PP4 — the rank marks, every one derived from a board row the sweep
  // published and none conferred by a person.
  const marks = rankMarks(profile.launch, dayOf(now));
  const thumbnail = thumbnailOf(profile.media);
  const seatsHref = `${productTabPath(slug, "crew")}#${SEATS_ANCHOR}`;
  const here = productTabPath(slug, tab);

  return (
    <main className={BOARD_PAGE}>
      {/* TS3 — a DELISTED listing renders in full and says so. */}
      {read.tombstone ? <DelistedNote tombstone={read.tombstone} /> : null}
      <Records profile={profile} tab={tab} />
      <AnchorForward slug={slug} tab={tab} />

      {/* ── the header card (board `Product`) ─────────────────────────── */}
      {/* FR4 — a listing is ONE row, so `u` upvotes it without the reader
          having tabbed to anything first. */}
      <section id={HERO_ID} data-keyrow aria-label="Listing" className={CARD}>
        {/* The cover band: decoration, and on the desktop board only. */}
        <div aria-hidden="true" className={COVER_PRODUCT} />
        <div className="flex flex-wrap items-end justify-between gap-5 px-[30px] pb-6 max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5 max-sm:p-[14px]">
          <div className="-mt-[44px] flex min-w-0 flex-[1_1_480px] flex-col gap-2.5 max-sm:mt-0 max-sm:flex-none">
            <div className="flex flex-col gap-2.5 max-sm:flex-row max-sm:items-center max-sm:gap-3">
              {/* openproduct-studio OSD3 — the maker's logo when there is one,
                  the monogram otherwise; one component on every surface. */}
              <ProductTile slug={slug} thumbnail={thumbnail} size={76} phoneSize={52} className={HERO_TILE} />
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
                <h1 className={`${PAGE_TITLE} min-w-0 break-words`}>{slug}</h1>
                {/* THE STAGE MARK, beside the name: an amber dot and
                    `SHIPPING · 3 OF 4` — `SHIPPING` alone when the product
                    has no milestones to count. */}
                <span data-hero-stage className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber max-sm:h-[7px] max-sm:w-[7px]" />
                  <StageMark stage="shipping" counts={profile.milestoneCounts} />
                </span>
                {marks.length > 0 || isNew ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {marks.map((mark) => (
                      <AppLink
                        key={mark.kind}
                        href={mark.href}
                        title={mark.title}
                        // The pill is 28px; the link round it is the 44px
                        // target on a phone (`tap`).
                        className={`tap rounded-full no-underline hover:underline ${FOCUS}`}
                      >
                        <span className="inline-flex h-[28px] items-center rounded-full bg-endorse-soft px-2.5 text-[13px] font-medium text-endorse-ink">
                          {mark.label}
                        </span>
                        {/* OPC-4 — the rule behind the mark, at its own
                            address, for the reader who cannot hover. */}
                        <span className="sr-only"> — how this is ranked: {formulaHref(mark.formula)}</span>
                      </AppLink>
                    ))}
                    {isNew ? <NewPill /> : null}
                  </span>
                ) : null}
              </div>
            </div>
            {/* The one-line pitch — and, for the crew, the form that edits
                it in place. */}
            <ProductPitch slug={slug} tagline={profile.tagline} tryUrl={profile.tryUrl} look="shipping" />
            {/* The line of facts: category · licence · hosting · followers ·
                open seats. Each is what the data holds and is absent when it
                holds nothing (TP0, CT1). */}
            <HeroFacts>
              {profile.category ? (
                <AppLink
                  href={topicPath(profile.category)}
                  className="tap-h inline-flex text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-[3px]"
                >
                  {labelOf("category", profile.category) ?? profile.category}
                </AppLink>
              ) : null}
              {profile.licence ? <span>{profile.licence}</span> : null}
              {profile.hosting ? <span>{labelOf("hosting", profile.hosting) ?? profile.hosting}</span> : null}
              {/* PP1 — the count is the follow's only public face (FL0,
                  WC2-7). Above zero only. */}
              {profile.followers > 0 ? <span title={FOLLOWER_COUNT_TITLE}>{followerLine(profile.followers)}</span> : null}
              {/* Teal always means "this is open to you". */}
              {openRoles.length > 0 ? (
                <AppLink
                  href={seatsHref}
                  className="tap-h inline-flex font-medium text-seat-ink no-underline hover:underline hover:underline-offset-[3px]"
                >
                  {openSeatsLabel(openRoles.length)}
                </AppLink>
              ) : null}
            </HeroFacts>
          </div>

          <div className="flex flex-col items-end gap-2 max-sm:items-stretch">
            {/* THE BOARD'S ACTIONS. A visitor: Follow (the product, owner
                rule 3), Take a seat (only when a seat is open), Try it. The
                crew, on Manage: Edit details, Try it, New post — Follow and
                Take a seat step aside (`VisitorOnly`), after load.

                "TRY IT" ONLY WITH `tryUrl`: the address the crew gave for
                the running product. No address, no button. */}
            <div
              data-hero-actions
              className="flex flex-wrap justify-end gap-2 max-sm:grid max-sm:grid-cols-2 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2"
            >
              <VisitorOnly slug={slug}>
                <FollowButton
                  kind="listing"
                  value={slug}
                  followers={profile.followers}
                  returnTo={here}
                  size="hero"
                  tone="outline"
                  countHidden
                />
                {openRoles.length > 0 ? (
                  <AppLink href={seatsHref} className={BTN_SOFT}>
                    Take a seat
                  </AppLink>
                ) : null}
              </VisitorOnly>
              <MakerHeaderActions slug={slug} look="shipping" />
              {profile.tryUrl ? (
                <a href={profile.tryUrl} rel="noreferrer noopener" data-try-it className={BTN_INK}>
                  Try it
                  <Glyph d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
                </a>
              ) : null}
            </div>
            {/* THE ENDORSEMENT LIVES ONLY HERE, not on a directory row
                (OPC-3, UV0): the box carries the count, so a reader can see
                what pressing it moves. */}
            <SecondaryActs
              profile={profile}
              upvote={<VoteBox slug={slug} count={endorsements ? endorsements.value : null} returnTo={here} shape="hero" />}
            />
          </div>
        </div>

        {/* ── the tabs ─────────────────────────────────────────────── */}
        {/* LINKS, NOT BUTTONS: each tab is an address of its own and a
            cached document of its own (`tabs.ts`), so a tab can be shared,
            bookmarked and opened beside another. The open one is
            `aria-current="page"`. */}
        <nav aria-label={PRODUCT_TABS_LABEL} className="overflow-x-auto px-[22px] pb-4 max-sm:px-2.5 max-sm:pb-2.5 max-sm:[scrollbar-width:none]">
          <ul className="m-0 flex list-none gap-1.5 p-0">
            {productTabLinks(slug, tab).map((link) => (
              <li key={link.tab} className="shrink-0">
                <AppLink
                  href={link.href}
                  aria-current={link.current ? "page" : undefined}
                  data-product-tab={link.tab}
                  className={`${SECTION_PILL} ${link.current ? SECTION_PILL_ON : SECTION_PILL_OFF} ${FOCUS}`}
                >
                  {link.label}
                </AppLink>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      <MakerChrome slug={slug} />

      {/* ── the two columns ──────────────────────────────────────────── */}
      <div className={BOARD_COLUMNS}>
        {/* THE TRACK IS minmax(0,1fr), NOT THE IMPLICIT `auto`
            (openproduct-studio OSD1): the gallery strip's min-content is
            every thumbnail side by side. */}
        <div className={BOARD_STACK} data-tab-panel={tab}>
          {tab === "updates" ? (
            <UpdatesTab slug={slug} profile={profile} posts={posts} cursor={cursor} seatsHref={seatsHref} />
          ) : null}
          {tab === "about" ? <AboutTab profile={profile} now={now} /> : null}
          {tab === "crew" ? (
            <>
              {profile.maintainers.length > 0 ? (
                <section id="crew" aria-labelledby="crew-heading" className={TAB_CARD} {...{ [SECTION_ATTRIBUTE]: true }}>
                  <CardHead id="crew-heading" title="On the crew" />
                  <CrewPeople maintainers={profile.maintainers} size={44} />
                </section>
              ) : null}
              <OpenSeatsCard slug={slug} openRoles={openRoles} always />
            </>
          ) : null}
          {tab === "talk" ? <TalkCards slug={slug} discussion={discussion} /> : null}
        </div>

        {/* ── the side column ────────────────────────────────────────── */}
        {/* The board's three cards — Crew, Built with, In the open — then
            what the page read from the repository and from this site. The
            Crew card steps aside on the Crew tab, which is the same people
            and seats at full width: nothing is on the page twice. */}
        <aside className={BOARD_STACK}>
          {tab === "crew" ? null : (
            <CrewSideCard slug={slug} maintainers={profile.maintainers} openRoles={openRoles} />
          )}
          <BuiltWithCard entries={builtWithOf(profile)} />
          <InTheOpenCard profile={profile} />
          <RepositoryPanel profile={profile} catalog={catalog} openRoles={openRoles} now={now} />
          {/* PP6 — LAUNCH HEALTH (PV1 carried): five observed facts, a
              checklist and no number. */}
          <LaunchHealth items={launchHealth(profile, new Date(now))} now={now} />
          <AlternativesPanel slug={slug} catalog={catalog} />
          <BadgePanel profile={profile} catalog={catalog} />
          {/* TS3 — the report door: last and quietest, opened by intent. */}
          <ReportControl subjectKind="listing" subjectRef={slug} returnTo={here} bare />
        </aside>
      </div>
    </main>
  );
}

/**
 * Updates: the crew's "Needs you" and "New post" (after load, crew only),
 * then the product's published posts, newest first, a page at a time.
 *
 * THE NEXT PAGE IS AN ADDRESS (`/{slug}/updates/{cursor}`), so it is cached
 * like the first. A read that failed says so; an empty list says nothing has
 * been posted — the two are different answers.
 */
function UpdatesTab({
  slug,
  profile,
  posts,
  cursor,
  seatsHref,
}: {
  slug: string;
  profile: PublicProfile;
  posts: ProductPostsPage | null;
  cursor: string | null;
  seatsHref: string;
}) {
  return (
    <>
      {cursor ? null : (
        <>
          <NeedsYou slug={slug} />
          <NewPostRow slug={slug} />
        </>
      )}
      {posts === null ? (
        <p data-updates-failed className="m-0 rounded-[16px] bg-card p-6 text-center text-[15px] text-muted-foreground max-sm:p-4">
          Couldn&rsquo;t load the updates just now.
        </p>
      ) : posts.posts.length === 0 ? (
        <p data-updates-empty className="m-0 rounded-[16px] bg-card p-6 text-center text-[15px] text-muted-foreground max-sm:p-4">
          Nothing posted yet.
        </p>
      ) : (
        <PostList
          slug={slug}
          posts={posts.posts}
          milestoneCounts={profile.milestoneCounts}
          returnTo={cursor ? productUpdatesPagePath(slug, cursor) : `/${slug}`}
          seatHref={seatsHref}
        />
      )}
      {cursor || posts?.next ? (
        <nav aria-label="More updates" className="flex flex-wrap items-center justify-between gap-2">
          {cursor ? (
            <AppLink href={`/${slug}`} className={`${BTN_SOFT} ${FOCUS}`}>
              Newest updates
            </AppLink>
          ) : (
            <span />
          )}
          {posts?.next ? (
            <AppLink href={productUpdatesPagePath(slug, posts.next)} rel="next" data-updates-next className={`${BTN_SOFT} ${FOCUS}`}>
              Older updates
            </AppLink>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

/**
 * About: what it does (the pictures, the pitch, how to get it), the
 * milestones, the details tiles — then what changed and the launches, which
 * are facts about the listing.
 */
function AboutTab({ profile, now }: { profile: PublicProfile; now: number }) {
  return (
    <>
      <section id="about" aria-labelledby="about-heading" className={TAB_CARD} {...{ [SECTION_ATTRIBUTE]: true }}>
        <CardHead id="about-heading" title="What it does" />
        {/* MD2 — THE PICTURES, above the pitch: the maker's hero and gallery,
            the automated capture with its date — and NOTHING when there are
            no rows. Never a generated image, never a stock one (VC4). */}
        <MediaPanel media={profile.media} apiBase={publicApiBase()} now={new Date(now)} />
        {profile.pitch ? (
          // The maintainer's own words, as plain text. Deliberately NOT
          // markdown-to-HTML: this string comes from a form and ends up on a
          // page anyone can read.
          <p className={`m-0 whitespace-pre-wrap ${SECTION_PROSE}`}>{profile.pitch}</p>
        ) : (
          <p className="m-0 max-w-[68ch] text-[15px] leading-[1.6] text-muted-foreground">
            No pitch has been published for this product yet.
          </p>
        )}
        {/* PV2 — HOW TO GET IT, immediately after what it is. ABSENT WHEN
            THERE IS NONE, never an empty box (OPC-C). */}
        {profile.installLine ? (
          <div id="install" aria-labelledby="install-heading" className="mt-1">
            <h3 id="install-heading" className="m-0 text-[13px] font-semibold text-foreground">
              {INSTALL_HEADING}
            </h3>
            <InstallLine command={profile.installLine} />
          </div>
        ) : null}
      </section>

      <MilestonesCard milestones={profile.milestones ?? []} counts={profile.milestoneCounts}>
        <MilestonesManager slug={profile.slug} />
      </MilestonesCard>

      <DetailsCard tiles={detailTiles(profile)} />

      {/* PV4 — WHAT CHANGED. Absent entirely when there is no earlier
          snapshot — see `changes.tsx`. */}
      <Changes changes={profile.changes} now={now} />

      {/* PP5 — LAUNCHES, newest first, each with where the board put it and
          how many spoke under it — READ from the feed's own rows (OL-2a).
          Absent when there is none. */}
      {profile.launches.length > 0 ? (
        <section className={SECTION_CARD} id="launches" aria-labelledby="launches-heading" {...{ [SECTION_ATTRIBUTE]: true }}>
          <h2 id="launches-heading" tabIndex={-1} className={`${BOARD_CARD_TITLE} outline-none`}>
            Launches
          </h2>
          <ul className="m-0 mt-2 list-none p-0">
            {profile.launches.map((entry) => (
              <li
                key={`${entry.day}-${entry.launchedAt}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line py-2.5 text-[15px] first:border-t-0"
              >
                <span className="flex min-w-0 items-baseline gap-2 text-foreground">
                  {entry.versionLabel ? (
                    <span className="rounded-full bg-version-soft px-2 py-px font-mono text-[13px] text-version">
                      {entry.versionLabel}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Launched</span>
                  )}
                  <AppLink
                    href={`/launches/${entry.day}`}
                    className="tap-h text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    title="That day's board"
                  >
                    {longDate(entry.launchedAt) ?? entry.day}
                  </AppLink>
                </span>
                <span className="flex items-baseline gap-4 text-[13px] tabular-nums text-muted-foreground">
                  {entry.rank !== null && entry.of !== null ? (
                    <span className="text-foreground" title={`${entry.counted ?? 0} upvotes counted on ${entry.day}`}>
                      {ordinal(entry.rank)} of {entry.of}
                    </span>
                  ) : (
                    <span title="The board has not ranked that day yet">not yet ranked</span>
                  )}
                  {entry.commentCount > 0 ? (
                    <span>
                      {entry.commentCount} {entry.commentCount === 1 ? "comment" : "comments"}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

// ─── the idea page ─────────────────────────────────────────────────────────

/** Where an idea stands (board `ProductIdea`): three steps, the first one
 *  current — an idea becomes a shipping product when its first milestone
 *  ships, and then this page is the other one. */
export const IDEA_STEPS = ["Idea", "First builder", "First milestone"] as const;

/** The idea post's three blocks, as the page's "The problem" reads them. */
function problemOf(post: PublicProductPost | null, pitch: string | null) {
  if (post) {
    return {
      problem: blockText(post.blocks, "problem"),
      who: blockText(post.blocks, "who"),
      whyNow: blockText(post.blocks, "why-now"),
    };
  }
  return { problem: pitch, who: null, whyNow: null };
}

async function IdeaPage({ read, profile }: { read: ListingRead; profile: PublicProfile }) {
  const slug = profile.slug;
  const [posts, discussion] = await Promise.all([fetchProductPosts(slug), fetchDiscussion(slug)]);
  const openRoles = profile.roleOpenings.filter((role) => role.status === "open");
  const thumbnail = thumbnailOf(profile.media);
  const endorsements = metricsByKey(profile.metrics).get("endorsements.total");
  const maker = profile.maintainers[0] ?? null;
  // THE PROBLEM comes from the product's idea post when it has one — its
  // Problem, Who has it and Why now blocks — and from the pitch otherwise.
  const ideaPost = posts?.posts.find((post) => post.kind === "idea") ?? null;
  const { problem, who, whyNow } = problemOf(ideaPost, profile.pitch);
  // Anything else the idea has posted. The idea post itself is the section
  // above, so it is not drawn a second time.
  const updates = (posts?.posts ?? []).filter((post) => post.id !== ideaPost?.id);
  const here = `/${slug}`;
  const seatsHref = `#${SEATS_ANCHOR}`;
  const posted = longDate(profile.publishedAt);

  return (
    <main className={BOARD_PAGE}>
      {read.tombstone ? <DelistedNote tombstone={read.tombstone} /> : null}
      <Records profile={profile} tab="updates" />

      {/* ── the note (board `ProductIdea`) ────────────────────────────── */}
      {/* The lavender note with its one square corner: the shape that says
          "an idea" before a word is read. */}
      <section
        id={HERO_ID}
        data-keyrow
        data-idea-note
        aria-label="Listing"
        className="flex flex-col gap-4 rounded-[4px_16px_16px_16px] bg-idea-wash px-[30px] py-7 max-sm:gap-2.5 max-sm:p-[14px]"
      >
        <div className="flex flex-wrap items-center gap-4 max-sm:flex-nowrap max-sm:gap-3">
          <ProductTile slug={slug} thumbnail={thumbnail} size={76} phoneSize={52} className={IDEA_TILE} />
          <div className="flex min-w-0 flex-col gap-1">
            <span data-hero-stage className="font-mono text-mono-label uppercase text-idea">
              {IDEA_MARK}
            </span>
            <h1 className={`${PAGE_TITLE} min-w-0 break-words`}>{slug}</h1>
          </div>
        </div>
        {/* The idea in one line, as the serif quote — and, for the crew, the
            form that edits it in place. */}
        <ProductPitch slug={slug} tagline={profile.tagline} tryUrl={profile.tryUrl} look="idea" />
        <HeroFacts tone="idea">
          {maker ? (
            <span>
              by{" "}
              <PersonName
                name={maintainerLabel(maker.displayName)}
                handle={maker.handle}
                className="tap-h font-semibold text-idea-deep no-underline hover:underline"
              />
            </span>
          ) : null}
          {profile.category ? (
            <AppLink href={topicPath(profile.category)} className="tap-h inline-flex text-inherit hover:underline hover:underline-offset-[3px]">
              {labelOf("category", profile.category) ?? profile.category}
            </AppLink>
          ) : null}
          {openRoles.length > 0 ? (
            <a href={seatsHref} className="tap-h inline-flex text-inherit no-underline hover:underline hover:underline-offset-[3px]">
              {openSeatsLabel(openRoles.length)}
            </a>
          ) : null}
        </HeroFacts>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3.5 max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5">
          {/* THE BOARD'S ACTIONS. Take a seat (when one is open), "I'd use
              this" — the product upvote, relabelled, its count only above
              zero — and Follow. The crew, on Manage: Edit details and New
              post instead of Take a seat and Follow. */}
          <div
            data-hero-actions
            className="flex flex-wrap gap-2 max-sm:grid max-sm:grid-cols-2 max-sm:[&>*:first-child:nth-last-child(odd)]:col-span-2"
          >
            <VisitorOnly slug={slug}>
              {openRoles.length > 0 ? (
                <a href={seatsHref} className={`${BTN_INK} !bg-idea-deep !text-idea-wash`}>
                  Take a seat
                </a>
              ) : null}
            </VisitorOnly>
            <WouldUseButton slug={slug} count={endorsements ? endorsements.value : null} returnTo={here} />
            <VisitorOnly slug={slug}>
              <FollowButton
                kind="listing"
                value={slug}
                followers={profile.followers}
                returnTo={here}
                size="hero"
                tone="outline"
                countHidden
              />
            </VisitorOnly>
            <MakerHeaderActions slug={slug} look="idea" />
          </div>
          <ol aria-label="Where this idea stands" data-idea-track className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
            {IDEA_STEPS.map((step, index) => (
              <li
                key={step}
                aria-current={index === 0 ? "step" : undefined}
                className={`inline-flex h-[28px] items-center gap-1.5 rounded-full px-3 text-[13px] ${
                  index === 0 ? "bg-idea font-semibold text-card" : "bg-idea-deep/[0.06] text-idea-deep"
                }`}
              >
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full max-sm:hidden ${index === 0 ? "bg-card" : "bg-idea-deep/30"}`} />
                {step}
              </li>
            ))}
          </ol>
        </div>
        {/* On an idea the upvote IS "I'd use this", above; Save and Share
            stay in the header's secondary row. */}
        <SecondaryActs profile={profile} upvote={null} />
      </section>

      <MakerChrome slug={slug} />

      <div className={BOARD_COLUMNS}>
        <div className={BOARD_STACK}>
          <NeedsYou slug={slug} />
          {/* The crew's way from an idea to a shipping product: add the
              first milestone, and ship it. Crew only, after load. */}
          <MilestonesManager slug={slug} standalone />

          <section id="about" aria-labelledby="problem-heading" className={TAB_CARD} {...{ [SECTION_ATTRIBUTE]: true }}>
            <CardHead id="problem-heading" title="The problem">
              {ideaPost ? <EditPostLink slug={slug} postId={ideaPost.id} label="Edit" /> : null}
            </CardHead>
            {problem ? (
              <p className="m-0 max-w-[68ch] whitespace-pre-wrap text-card-title font-normal leading-[1.5] text-copy max-sm:text-[15px]">
                {problem}
              </p>
            ) : (
              <p className="m-0 text-[15px] text-muted-foreground">The problem has not been written up yet.</p>
            )}
          </section>

          {who || whyNow ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-[18px] max-sm:gap-2.5">
              {who ? (
                <section aria-labelledby="who-heading" className={TAB_CARD}>
                  <CardHead id="who-heading" title="Who has it" />
                  <p className="m-0 whitespace-pre-wrap text-[15px] text-copy">{who}</p>
                </section>
              ) : null}
              {whyNow ? (
                <section aria-labelledby="why-now-heading" className={TAB_CARD}>
                  <CardHead id="why-now-heading" title="Why now" />
                  <p className="m-0 whitespace-pre-wrap text-[15px] text-copy">{whyNow}</p>
                </section>
              ) : null}
            </div>
          ) : null}

          <OpenSeatsCard slug={slug} openRoles={openRoles} />

          {/* NO UPDATES UNTIL SOMETHING IS POSTED. An idea with posts shows
              them; an idea without has no heading over nothing. */}
          {updates.length > 0 ? (
            <>
              <h2 className={`${SIDE_TITLE} mx-1 mt-2`}>Updates</h2>
              <PostList
                slug={slug}
                posts={updates}
                milestoneCounts={profile.milestoneCounts}
                returnTo={here}
                seatHref={`${here}${seatsHref}`}
              />
            </>
          ) : null}

          <h2 id="talk" className={`${SIDE_TITLE} mx-1 mt-2 scroll-mt-[80px]`}>
            Talk
          </h2>
          <TalkCards slug={slug} discussion={discussion} />
        </div>

        <aside className={BOARD_STACK}>
          <CrewSideCard
            slug={slug}
            maintainers={profile.maintainers}
            openRoles={[]}
            // The dashed slot while the crew is only its maker.
            needsBuilder={profile.maintainers.length <= 1}
          />
          <InTheOpenCard
            profile={profile}
            emptyRepository
            lead={
              <>
                <div className={SIDE_ROW}>
                  <span className="text-muted-foreground">Stage</span>
                  <span className="text-right text-foreground">Idea</span>
                </div>
                {posted ? (
                  <div className={SIDE_ROW}>
                    <span className="text-muted-foreground">Posted</span>
                    <span className="text-right text-foreground">{posted}</span>
                  </div>
                ) : null}
              </>
            }
          />
          <ReportControl subjectKind="listing" subjectRef={slug} returnTo={here} bare />
        </aside>
      </div>
    </main>
  );
}

// ─── the side column's panels (OPR1, carried) ──────────────────────────────

type Catalog = Awaited<ReturnType<typeof fetchPublicDirectory>>;

/**
 * THE REPOSITORY PANEL. Two halves, drawn apart on purpose: the observed
 * frame (PV0) is what was READ from the repository, with the moment of the
 * read and every line linking its rule; the details under it are what
 * happened on this site. What is not observed yet is a dash with a reason,
 * never a zero (OPC-C, SN-1).
 */
function RepositoryPanel({
  profile,
  catalog,
  openRoles,
  now,
}: {
  profile: PublicProfile;
  catalog: Catalog;
  openRoles: readonly { demand: Demand }[];
  now: number;
}) {
  const metrics = metricsByKey(profile.metrics);
  const merges = metrics.get("merges.7d");
  const lastTouched = metrics.get("last_touched.all");
  // UV0 — the SEVEN-DAY window: the total lives in the vote box; the week
  // says whether anybody is reading it.
  const endorsementsRecent = metrics.get("endorsements.7d");
  // OB5 — the position on the front page's list, read from the SAME
  // catalogue document the front page orders, so the two cannot disagree.
  const mostActiveRank = catalog ? mostActiveRankOf(catalog, profile.slug) : null;
  const observed = observedRow(profile, new Date(now));
  const publishedOn = longDate(profile.publishedAt);
  return (
    <section className={PANEL} aria-labelledby={observed.length > 0 ? "observed" : "facts-heading"}>
      <ObservedRow signals={observed} now={now} />
      <h3
        id="facts-heading"
        className={observed.length > 0 ? "m-0 mt-4 text-[13px] font-semibold text-muted-foreground" : H3}
      >
        {BUILD_DETAILS_HEADING}
      </h3>
      {/* ── the four figures (OB5) ─────────────────────────────────── */}
      <dl data-stat-strip className="m-0 mt-2 grid grid-cols-2 gap-2">
        <Stat
          icon={<ChangesIcon className="h-[15px] w-[15px] shrink-0" />}
          label={observedNote(merges, now, BUILD_STAT_LABEL.changes)}
          value={<MetricValue metric={merges} />}
          {...(merges ? {} : { pending: PENDING.activity })}
        />
        <Stat
          icon={<UpvoteIcon className="h-[15px] w-[15px] shrink-0" />}
          label={observedNote(endorsementsRecent, now, BUILD_STAT_LABEL.upvotes)}
          value={<MetricValue metric={endorsementsRecent} />}
        />
        <Stat
          icon={<ActiveIcon className="h-[15px] w-[15px] shrink-0" />}
          label={BUILD_STAT_LABEL.rank}
          value={
            mostActiveRank === null ? (
              DASH
            ) : (
              <AppLink href="/" className="tap underline-offset-4 hover:underline">
                #{mostActiveRank}
              </AppLink>
            )
          }
          title={
            mostActiveRank === null
              ? "Not on the Most active list: its changes are not observed, or it is below the floor"
              : "Its place on the front page's Most active list"
          }
        />
        <Stat
          icon={<ClockIcon className="h-[15px] w-[15px] shrink-0" />}
          label={observedNote(lastTouched, now, BUILD_STAT_LABEL.lastMerge)}
          value={lastTouched ? agoOf(fromEpochSeconds(lastTouched.value), now) : DASH}
          {...(lastTouched ? {} : { pending: PENDING.activity })}
        />
      </dl>
      <div className="mt-3 grid gap-2.5">
        {/* UV1 — WHERE IT PLACED ON THE DAY IT LAUNCHED; absent when there
            is nothing to say. THE ORDER IS THE BOARD'S, read rather than
            derived (OL-2a). */}
        {profile.launch ? (
          <div className={SIDE_ROW}>
            <span className="text-muted-foreground">Rank that day</span>
            <AppLink
              className="tap-h text-right tabular-nums text-foreground underline-offset-4 hover:underline"
              href={`/launches/${profile.launch.day}`}
              title={`${profile.launch.counted} upvotes counted on ${profile.launch.day}${
                profile.launch.ineligible > 0
                  ? `, and ${profile.launch.ineligible} from accounts younger than the launch`
                  : ""
              }`}
            >
              {ordinal(profile.launch.rank)} of {profile.launch.of}
            </AppLink>
          </div>
        ) : null}
        <Fact label="Published" value={publishedOn ?? DASH} title={publishedOn ? "first listed" : "not published yet"} />
        {/* CB2 — the summary over the whole listing, DERIVED FROM WHAT THE
            CARDS ALREADY SAY, never from a separate total (OPC-F). */}
        <Fact label="Taking offers" value={offersSummary(openRoles)} />
      </div>
      {/* PV3 — THE CLEAN-VOTE MARK. */}
      {profile.cleanVotes ? (
        <p className="m-0 mt-3 flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-[1.5] text-muted-foreground">
          <span title={CLEAN_VOTE_TITLE} className="rounded-full bg-sunken px-2 py-px font-medium text-foreground">
            {CLEAN_VOTE_LABEL}
          </span>
        </p>
      ) : null}
    </section>
  );
}

/**
 * PV2 — alternatives, and the reason beside every one. `catalog === null` is
 * NOT the same as "nothing overlaps", so it is not folded into the same
 * branch (the OD5 finding). Ties break alphabetically, so the panel is the
 * same for every reader and the same tomorrow.
 */
function AlternativesPanel({ slug, catalog }: { slug: string; catalog: Catalog }) {
  const alternatives: Alternative[] | null = catalog ? alternativesFor(catalog, slug) : null;
  return (
    <section className={`${PANEL} scroll-mt-[80px]`} id="alternatives" aria-labelledby="alternatives-heading" {...{ [SECTION_ATTRIBUTE]: true }}>
      <h3 id="alternatives-heading" tabIndex={-1} className={`${H3} outline-none`}>
        Alternatives
      </h3>
      {alternatives === null ? (
        // The catalog could not be read. NOT "nothing overlaps": an empty
        // room and a locked door look nothing alike to a reader.
        <p className="m-0 mt-1 text-[13px] leading-[1.45] text-muted-foreground">Couldn&rsquo;t load these just now.</p>
      ) : alternatives.length === 0 ? (
        <p className="m-0 mt-1 text-[13px] leading-[1.45] text-muted-foreground">None yet.</p>
      ) : (
        <ul className="m-0 mt-1 grid list-none p-0">
          {alternatives.map(({ card, reason }) => (
            <li key={card.slug} data-keyrow>
              <AppLink href={`/${card.slug}`} className="tap flex items-center gap-3 py-1.5 no-underline">
                <ProductTile slug={card.slug} thumbnail={card.thumbnail} size={44} />
                <span className="grid min-w-0 leading-[1.35]">
                  <span className="truncate text-[15px] font-semibold text-foreground">{card.slug}</span>
                  {/* THE REASON, not the tagline: why the listing is here. */}
                  <span className="truncate text-[13px] text-muted-foreground">{reason}</span>
                </span>
              </AppLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * RE4 — THE BADGE, AND ITS LINE, for the maintainer rather than for the
 * reader who arrived from a search result. OB7 — each badge a maker can
 * choose: a variant with nothing true to say reads *listed*, so the chooser
 * offers it only when its value differs from the bare badge's. Absent on a
 * deployment with no canonical origin: a snippet copied off a preview host
 * would put that host in somebody's README permanently.
 */
function BadgePanel({ profile, catalog }: { profile: PublicProfile; catalog: Catalog }) {
  const apex = publicApexOrigin();
  if (!apex) return null;
  const merges = metricsByKey(profile.metrics).get("merges.7d");
  const facts = {
    profile,
    rank: catalog ? mostActiveRankOf(catalog, profile.slug) : null,
    merges: merges?.value ?? null,
  };
  const listedValue = badgeValue(profile);
  const choices: BadgeChoice[] = [];
  for (const variant of BADGE_VARIANTS) {
    const value = variant === "listed" ? listedValue : badgeVariantValue(variant, facts);
    if (variant !== "listed" && value === "listed") continue;
    const markdown = badgeMarkdown(apex, profile.slug, variant);
    const html = badgeHtml(apex, profile.slug, value, variant);
    if (markdown && html) choices.push({ id: variant, label: BADGE_VARIANT_LABEL[variant], value, markdown, html });
  }
  if (choices.length === 0) return null;
  return (
    <details className={`${CARD} px-[18px] py-3.5`}>
      <summary
        id="badge-heading"
        className="tap flex cursor-pointer list-none items-center justify-between gap-2 text-[15px] font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden"
      >
        Badge for your README
        <Glyph d="M4 6.5 8 10.5l4-4" />
      </summary>
      <div className="mt-3">
        <BadgeSnippet choices={choices} />
      </div>
    </details>
  );
}

// ─── small pieces ──────────────────────────────────────────────────────────

/** The header card's id — the listing's one keyboard row. */
const HERO_ID = "listing-hero";

/** The header's tile (board `Product`): 92px at a 26px radius, the name's
 *  initials at 28px/600, with the card's own colour ringed 5px round it where
 *  it overlaps the cover band. On a phone it is `ProductTile`'s 52px, at the
 *  phone board's 16px radius, and there is no band to ring it against. */
const HERO_TILE =
  "ring-[5px] ring-card max-sm:ring-0 sm:!h-[92px] sm:!w-[92px] sm:!rounded-[26px] sm:!font-sans sm:!text-title sm:!font-semibold max-sm:!rounded-[16px]";

/** The idea note's tile (board `ProductIdea`): 72px at a 22px radius, white
 *  under a lavender hairline; the phone board's 52px at 16. */
const IDEA_TILE =
  "ring-[1.5px] ring-inset ring-idea/30 sm:!h-[72px] sm:!w-[72px] sm:!rounded-[22px] sm:!font-sans sm:!font-semibold max-sm:!rounded-[16px]";

/** The line of facts under the pitch: 13px, a `·` between the entries that
 *  are there and none where one is absent. */
function HeroFacts({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "idea" }) {
  const facts = Children.toArray(children);
  if (facts.length === 0) return null;
  return (
    <div
      data-hero-facts
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-[1.4] ${tone === "idea" ? "text-idea-deep/80" : "text-muted-foreground"}`}
    >
      {facts.map((fact, index) => (
        // The dot travels with the fact after it, so a line never ends on one.
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {fact}
        </span>
      ))}
    </div>
  );
}

/** A 16px stroked glyph from one path, as the design draws its icons. */
function Glyph({ d }: { d: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * A facts row's label: the word the design prints, carrying WHEN the figure
 * was observed as its title (SN2 — a metric never travels without its
 * moment).
 */
function observedNote(metric: PublicMetric | undefined, now: number, unit: string) {
  if (!metric) return unit;
  const when = `observed ${agoOf(metric.observedAt, now)}${metric.state === "stale" ? " (stale)" : ""}`;
  return <span title={when}>{unit}</span>;
}

/**
 * The facts card's demand summary, over openings whose lines are already on
 * the page. Picks the STRONGEST claim already made rather than computing a
 * total: two numbers about a small set can be subtracted from each other.
 */
function offersSummary(roles: readonly { demand: Demand }[]): string {
  if (roles.length === 0) return "Not right now";
  const counted = roles
    .map((r) => r.demand)
    .filter((d): d is Extract<Demand, { kind: "counted" }> => d.kind === "counted");
  if (counted.length > 0) {
    const most = counted.reduce((a, b) => (b.pending > a.pending ? b : a));
    return takingOffersLine(most).replace("Taking offers · ", "");
  }
  if (roles.some((r) => r.demand.kind === "few")) return "a few pending";
  return `${roles.length} open`;
}

/**
 * One figure in the stat strip (OB5): a glyph and a label over a value, on
 * the lighter well — two to a row in the side card.
 */
function Stat({
  icon,
  label,
  value,
  title,
  pending,
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  title?: string;
  /** An unobserved figure's dash says why it is a dash (XP0's convention). */
  pending?: (typeof PENDING)[keyof typeof PENDING];
}) {
  const inert = pending ? pendingProps(pending) : {};
  return (
    <div className="rounded-[14px] bg-well px-3 py-2.5">
      <dt className="text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      </dt>
      <dd className="m-0 mt-1 text-card-title font-semibold tabular-nums text-foreground" {...(title ? { title } : {})} {...inert}>
        {value}
      </dd>
    </div>
  );
}

/** One row of the facts card: the label muted, the value tabular. */
function Fact({ label, value, title }: { label: ReactNode; value: ReactNode; title?: string }) {
  return (
    <div className={SIDE_ROW}>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums text-foreground" {...(title ? { title } : {})}>
        {value}
      </span>
    </div>
  );
}

// ─── the cards both pages are made of ──────────────────────────────────────

/**
 * The cards both product pages are made of (openproduct-redesign OPR-3;
 * boards `Product`, `ProductIdea` and their phone boards).
 *
 * SERVER COMPONENTS, AND PUBLIC. Everything here is drawn from the public
 * product document and is the same for every visitor. The few controls that
 * differ per visitor — "Requested" on a seat you asked for, the crew's "Edit
 * seat", "Add a seat" and "Edit post" — are client islands from `maker/`
 * that render the visitor's control (or nothing) on the server and change
 * only after the overlay answers.
 */

type Maintainer = PublicProfile["maintainers"][number];

/** The open seats' anchor: "Take a seat" and every Help wanted card land here. */
export const SEATS_ANCHOR = "people-wanted";

/** `N open seats`. */
export function openSeatsLabel(count: number): string {
  return count === 1 ? "1 open seat" : `${count} open seats`;
}

/** A card's head: its title, and one small control on the right. */
export function CardHead({ id, title, children }: { id?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5">
      <h2 id={id} tabIndex={-1} className={`${SIDE_TITLE} outline-none`}>
        {title}
      </h2>
      {children}
    </div>
  );
}

/** A reading-column card at the boards' 18px padding and 12px gap. */
export const TAB_CARD = `flex flex-col gap-3 rounded-[16px] bg-card p-[18px] max-sm:gap-2.5 max-sm:p-[14px] scroll-mt-[80px]`;

// ─── crew ──────────────────────────────────────────────────────────────────

/** One person on the crew: a disc of initials, the name, the role. */
function CrewPerson({ maintainer, size }: { maintainer: Maintainer; size: 38 | 44 }) {
  return (
    <li className={`flex items-center ${size === 44 ? "gap-3" : "gap-2.5"}`}>
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center rounded-full bg-sunken font-semibold text-copy ${
          size === 44 ? "h-[44px] w-[44px] text-[15px]" : "h-[38px] w-[38px] text-[13px]"
        }`}
      >
        {initialsOf(maintainerLabel(maintainer.displayName))}
      </span>
      <span className="grid min-w-0 leading-[1.35]">
        {/* CG4 — a link when there is somewhere to go, plain text otherwise;
            the rule lives in `PersonName`. The label is a written fallback,
            never a raw subject id. */}
        <PersonName
          name={maintainerLabel(maintainer.displayName)}
          handle={maintainer.handle}
          className="tap-h truncate text-[15px] font-semibold text-foreground"
        />
        {maintainer.roleLabel ? (
          <span className="truncate text-[13px] text-muted-foreground">{maintainer.roleLabel}</span>
        ) : null}
      </span>
    </li>
  );
}

/** The people on the crew. Every name is there because its owner put it
 *  there (OPC-5, CG3); the list is never derived from a workspace roster. */
export function CrewPeople({ maintainers, size = 38 }: { maintainers: readonly Maintainer[]; size?: 38 | 44 }) {
  if (maintainers.length === 0) return null;
  return (
    <ul id="makers" className="m-0 grid list-none scroll-mt-[80px] gap-3 p-0">
      {maintainers.map((maintainer) => (
        <CrewPerson key={maintainer.subjectId} maintainer={maintainer} size={size} />
      ))}
    </ul>
  );
}

/**
 * The side column's Crew card (board `Product`): the people, then each open
 * seat as a teal row with its dashed ring and "Take it".
 *
 * On an idea whose crew is only its maker (board `ProductIdea`), the dashed
 * lavender slot instead: "Needs a first builder".
 *
 * ABSENT when there is nobody, no seat and no slot to draw.
 */
export function CrewSideCard({
  slug,
  maintainers,
  openRoles,
  needsBuilder = false,
}: {
  slug: string;
  maintainers: readonly Maintainer[];
  openRoles: readonly PublicRoleOpening[];
  needsBuilder?: boolean;
}) {
  if (maintainers.length === 0 && openRoles.length === 0 && !needsBuilder) return null;
  return (
    <section id="crew" aria-labelledby="crew-heading" className={`${SIDE_CARD} scroll-mt-[80px]`} {...{ [SECTION_ATTRIBUTE]: true }}>
      <CardHead id="crew-heading" title="Crew" />
      <CrewPeople maintainers={maintainers} />
      {needsBuilder ? (
        <div
          data-needs-builder
          className="flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-idea/[0.35] px-3 py-2.5 text-[15px] text-idea-deep"
        >
          {IDEA_NEEDS_BUILDER}
        </div>
      ) : (
        openRoles.map((role) => (
          <div key={role.id} className={SEAT_ROW}>
            <span className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className={`${SEAT_RING} h-[32px] w-[32px] border-[1.5px]`} />
              <span className="min-w-0 break-words text-[15px] text-foreground">{role.title}</span>
            </span>
            <SeatAction slug={slug} openingId={role.id} title={role.title} joinLinkRef={role.joinLinkRef} quiet />
          </div>
        ))
      )}
    </section>
  );
}

/**
 * Open seats (boards `Product` Crew tab, `ProductIdea`): each seat as a teal
 * row — the dashed ring, the role, what it asks for — with "Take the seat".
 *
 * The apply door is a LINK, not a form: applying needs sign-in and the join
 * page on the Orunbase console handles that; there is no anonymous write
 * anywhere (OD4, seam edge S5). No door, no button.
 *
 * ABSENT WHEN NOTHING IS OPEN, unless `always` (the Crew tab keeps the card,
 * so the crew has somewhere to add the first seat).
 */
export function OpenSeatsCard({
  slug,
  openRoles,
  always = false,
}: {
  slug: string;
  openRoles: readonly PublicRoleOpening[];
  always?: boolean;
}) {
  if (openRoles.length === 0 && !always) return null;
  return (
    <section id="people-wanted" aria-labelledby="seats-heading" className={TAB_CARD} {...{ [SECTION_ATTRIBUTE]: true }}>
      <CardHead id="seats-heading" title="Open seats">
        <AddSeatLink slug={slug} />
      </CardHead>
      {openRoles.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">No seat is open right now.</p>
      ) : (
        <ul className="m-0 grid list-none gap-2.5 p-0">
          {openRoles.map((role) => (
            <li key={role.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[14px] bg-seat-wash px-3.5 py-3">
              <span aria-hidden="true" className={`${SEAT_RING} h-[40px] w-[40px] border-2 max-sm:h-[36px] max-sm:w-[36px]`} />
              <div className="min-w-0 flex-[1_1_220px]">
                <div className="break-words text-card-title font-semibold tracking-[-0.015em] text-foreground max-sm:text-[15px]">
                  {role.title}
                </div>
                {/* CB2's demand line — floored at three by the API, never
                    here. The page renders the sentence the contract chose
                    and never sees a raw count (OPC-F). */}
                {role.commitment || demandLine(role.demand) ? (
                  <div className="text-[13px] text-muted-foreground">
                    {[role.commitment, demandLine(role.demand)].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
                {role.description ? (
                  <p className="m-0 mt-1.5 max-w-[68ch] text-[15px] leading-[1.5] text-copy">{role.description}</p>
                ) : null}
              </div>
              <SeatAction slug={slug} openingId={role.id} title={role.title} joinLinkRef={role.joinLinkRef} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── built with, in the open ───────────────────────────────────────────────

/** The dots before the "Built with" pills, in the board's order — decoration
 *  that tells one pill from the next, and nothing else. */
const STACK_DOTS = ["bg-muted-foreground", "bg-version", "bg-amber", "bg-seat", "bg-brand-amber-inverted", "bg-idea"] as const;

/** What a listing is built with: its stated stack, the components its
 *  workspace published and where it is hosted — each said once. */
export function builtWithOf(profile: PublicProfile): string[] {
  const components = profile.components ?? [];
  return [
    ...new Set([
      ...profile.stack,
      ...components.map((component) => (component.kind ? `${component.kind} · ${component.name}` : component.name)),
      ...(profile.hosting ? [labelOf("hosting", profile.hosting) ?? profile.hosting] : []),
    ]),
  ];
}

/** BUILT WITH (board `Product`): pills, a dot and a word. ABSENT when the
 *  listing states nothing — which is different from being built with nothing. */
export function BuiltWithCard({ entries }: { entries: readonly string[] }) {
  if (entries.length === 0) return null;
  return (
    <section className={SIDE_CARD} id="components" aria-labelledby="stack-heading">
      <h2 id="stack-heading" className={SIDE_TITLE}>
        Built with
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {entries.map((entry, index) => (
          <li key={entry} className={STACK_PILL}>
            <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${STACK_DOTS[index % STACK_DOTS.length]}`} />
            {entry}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `owner/repo` out of a repository address; the host and path when it is
 *  not that shape, and the address itself when it does not parse. */
export function repositoryLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]!.replace(/\.git$/, "")}`;
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

/**
 * IN THE OPEN (boards `Product`, `ProductIdea`): where the work is, as
 * label/value rows — the repository, the workspace, the pricing. Each row
 * only when the listing has it. `lead` is the idea page's own first rows
 * (its stage, when it was posted); `emptyRepository` says "Not started"
 * where an idea has no repository yet.
 */
export function InTheOpenCard({
  profile,
  lead,
  emptyRepository = false,
}: {
  profile: PublicProfile;
  lead?: ReactNode;
  emptyRepository?: boolean;
}) {
  if (!lead && !profile.repoUrl && !profile.workspaceRef && !profile.pricing) return null;
  return (
    <section className={SIDE_CARD} aria-labelledby="open-heading">
      <h2 id="open-heading" className={SIDE_TITLE}>
        In the open
      </h2>
      <div className="grid gap-2.5">
        {lead}
        {profile.repoUrl ? (
          <div className={SIDE_ROW}>
            <span className="text-muted-foreground">Repository</span>
            <a
              href={profile.repoUrl}
              rel="noreferrer noopener"
              className="tap-h min-w-0 break-all text-right text-link underline-offset-[3px] hover:underline"
            >
              {repositoryLabel(profile.repoUrl)}
            </a>
          </div>
        ) : emptyRepository ? (
          <div className={SIDE_ROW}>
            <span className="text-muted-foreground">Repository</span>
            <span className="text-right text-foreground">Not started</span>
          </div>
        ) : null}
        {/* The workspace view door (openproduct-reader OPR5, seam S12). A
            PLAIN ANCHOR to the consent page on THIS origin, rendered on
            `workspaceRef` alone, so the page stays the same bytes signed in
            and out (OPC-1/I6) and no listing without a door shows one. */}
        {profile.workspaceRef ? (
          <div className={SIDE_ROW}>
            <span className="text-muted-foreground">Workspace</span>
            <AppLink href={workspaceConsentPath(profile.slug)} className="tap-h text-right text-link underline-offset-[3px] hover:underline">
              {WORKSPACE_VIEW_LABEL}
            </AppLink>
          </div>
        ) : null}
        {/* PP3 — pricing, authored, and the hover says so (WC-3). */}
        {profile.pricing ? (
          <div className={SIDE_ROW}>
            <span className="text-muted-foreground">Pricing</span>
            <AppLink
              href={pricingPath(profile.pricing)}
              title={PRICING_PROVENANCE_NOTE}
              className="tap-h text-right text-link underline-offset-[3px] hover:underline"
            >
              {labelOf("pricing", profile.pricing) ?? profile.pricing}
            </AppLink>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ─── milestones, details ───────────────────────────────────────────────────

/** `3 OF 4 SHIPPED` (the mark's class uppercases it), or null with nothing
 *  to count. */
export function shippedMark(counts: MilestoneCounts | null | undefined): string | null {
  const progress = milestoneProgress(counts);
  return progress ? `${progress} shipped` : null;
}

/**
 * Milestones (board `Product`, About tab): each with its shipped state, its
 * title and summary, and its code; "N OF M SHIPPED" in the head.
 *
 * A shipped milestone wears the amber check; one that has not shipped a
 * clock on the sunken fill, with its title in the muted ink. The state is
 * also SAID (`Shipped` / `Not shipped yet`), so it does not depend on a
 * colour or a glyph. `children` is the crew's manager, drawn after load.
 */
export function MilestonesCard({
  milestones,
  counts,
  children,
}: {
  milestones: readonly PublicMilestone[];
  counts: MilestoneCounts | null | undefined;
  children?: ReactNode;
}) {
  const mark = shippedMark(counts);
  return (
    <section id="milestones" aria-labelledby="milestones-heading" className={TAB_CARD} {...{ [SECTION_ATTRIBUTE]: true }}>
      <CardHead id="milestones-heading" title="Milestones">
        {mark ? (
          <span data-shipped-mark className="font-mono text-mono-label uppercase text-amber-ink">
            {mark}
          </span>
        ) : null}
      </CardHead>
      {milestones.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">No milestones yet.</p>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {milestones.map((milestone, index) => {
            const shipped = milestone.shippedAt !== null;
            return (
              <li
                key={`${milestone.code}-${index}`}
                data-milestone={shipped ? "shipped" : "open"}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2.5 first:border-t-0"
              >
                <span
                  aria-hidden="true"
                  className={`grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full ${
                    shipped
                      ? "bg-[linear-gradient(135deg,oklch(var(--brand-amber-inverted)),oklch(var(--brand-amber)))] text-card"
                      : "bg-sunken text-muted-foreground"
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d={shipped ? "M5 12l5 5 9-10" : "M12 6v6l4 2"} />
                  </svg>
                </span>
                <span className="flex min-w-0 flex-[1_1_240px] flex-col">
                  <span className={`break-words text-[15px] font-semibold ${shipped ? "text-foreground" : "text-muted-foreground"}`}>
                    {milestone.title}
                    <span className="sr-only"> — {shipped ? "Shipped" : "Not shipped yet"}</span>
                  </span>
                  {milestone.summary ? (
                    <span className="break-words text-[13px] text-muted-foreground">{milestone.summary}</span>
                  ) : null}
                </span>
                <span className="font-mono text-label text-muted-foreground">{milestone.code}</span>
              </li>
            );
          })}
        </ol>
      )}
      {children}
    </section>
  );
}

export interface DetailTile {
  readonly label: string;
  readonly value: string;
  readonly href?: string;
  readonly external?: boolean;
}

/** The host a "Live on" tile names, or the address itself when it does not parse. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The Details tiles (board `Product`, About tab): category, licence, what it
 * is built on, pricing, where it is live. ONLY THE TILES THE DATA HAS — a
 * listing that has not answered a question gets no tile for it, never a tile
 * that says "Other" or a dash (CT1, OPC-C).
 */
export function detailTiles(profile: PublicProfile): DetailTile[] {
  const tiles: DetailTile[] = [];
  if (profile.category) {
    tiles.push({
      label: "Category",
      value: labelOf("category", profile.category) ?? profile.category,
      href: topicPath(profile.category),
    });
  }
  if (profile.licence) tiles.push({ label: "Licence", value: profile.licence });
  if (profile.hosting) tiles.push({ label: "Built on", value: labelOf("hosting", profile.hosting) ?? profile.hosting });
  if (profile.pricing) {
    tiles.push({
      label: "Pricing",
      value: labelOf("pricing", profile.pricing) ?? profile.pricing,
      href: pricingPath(profile.pricing),
    });
  }
  if (profile.liveUrl) tiles.push({ label: "Live on", value: hostOf(profile.liveUrl), href: profile.liveUrl, external: true });
  return tiles;
}

export function DetailsCard({ tiles }: { tiles: readonly DetailTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <section id="details" aria-labelledby="details-heading" className={TAB_CARD} {...{ [SECTION_ATTRIBUTE]: true }}>
      <CardHead id="details-heading" title="Details" />
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} data-detail-tile className="flex flex-col rounded-[14px] bg-well px-3 py-2.5">
            <dt className="text-[13px] text-muted-foreground">{tile.label}</dt>
            <dd className="m-0 break-words text-[15px] font-semibold text-foreground">
              {tile.href ? (
                tile.external ? (
                  <a href={tile.href} rel="noreferrer noopener" className="tap-h text-foreground underline-offset-[3px] hover:underline">
                    {tile.value}
                  </a>
                ) : (
                  <AppLink href={tile.href} className="tap-h text-foreground underline-offset-[3px] hover:underline">
                    {tile.value}
                  </AppLink>
                )
              ) : (
                tile.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ─── updates ───────────────────────────────────────────────────────────────

/**
 * A product's published posts, as the board's "Updates" list: one
 * `ProductPostCard` each, in its `product` variant (no product row — the page
 * is the product).
 *
 * A DRAFT IS NEVER HERE: the list is the public read, and the card itself
 * draws nothing for a post that is not published.
 *
 * "Edit post" is the crew's, drawn after load: in the card's last line, or —
 * for a Help wanted ticket, which has no last line — under it.
 */
export function PostList({
  slug,
  posts,
  milestoneCounts,
  returnTo,
  seatHref,
}: {
  slug: string;
  posts: readonly PublicProductPost[];
  milestoneCounts: MilestoneCounts | null | undefined;
  returnTo: string;
  seatHref: string;
}) {
  return (
    <>
      {posts.map((post) => (
        <div key={post.id} data-update className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <ProductPostCard
            post={post}
            variant="product"
            returnTo={returnTo}
            milestoneCounts={milestoneCounts ?? null}
            seatHref={seatHref}
            actions={post.kind === "seat" ? undefined : <EditPostLink slug={slug} postId={post.id} />}
          />
          {post.kind === "seat" ? (
            <div className="flex justify-end px-2 text-[13px] empty:hidden">
              <EditPostLink slug={slug} postId={post.id} />
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}

// ─── talk ──────────────────────────────────────────────────────────────────

type Discussion = Awaited<ReturnType<typeof fetchDiscussion>>;

/**
 * Talk (boards `Product` Talk tab, `ProductIdea`): the product's discussion,
 * in the new look.
 *
 * WHAT IS HERE IS WHAT THE PRODUCT ALREADY HAS: the door to start a thread
 * (the existing composer), the one conversation under the product with its
 * comment box, and the titled threads about it as a list of links. The board's kinds of thread,
 * its public/private switch, its filters and "Mark resolved" are milestone
 * OPR3 and are not drawn — nothing stands in for them.
 */
export function TalkCards({ slug, discussion }: { slug: string; discussion: Discussion }) {
  // The count beside the heading is of VISIBLE posts, which is what a
  // reader can see.
  const comments = discussion?.launch?.posts.length ?? 0;
  return (
    <>
      <section aria-label={THREAD_COMPOSER_TITLE} className="flex flex-col rounded-[16px] bg-card p-3 max-sm:p-2.5">
        {/* The board's field, as the door it is today: the composer is a page
            of its own (a thread has a title, a category and a product). */}
        <AppLink
          href={threadComposerHref(slug)}
          data-start-thread
          className={`flex h-[44px] items-center rounded-full bg-well px-4 text-nozoom text-muted-foreground no-underline hover:bg-sunken ${FOCUS}`}
        >
          {THREAD_COMPOSER_TITLE}
        </AppLink>
      </section>

      <section id="discussion" aria-labelledby="discussion-heading" className={SECTION_CARD} {...{ [SECTION_ATTRIBUTE]: true }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          <h2 id="discussion-heading" tabIndex={-1} className={`${BOARD_CARD_TITLE} outline-none`}>
            Discussion{" "}
            <span className="ml-1 text-[13px] font-normal tracking-normal text-muted-foreground">
              {/* OPP14 — the document's count, plus what this browser just
                  posted and the document has not caught up with. */}
              <LiveCount base={comments} conversation={conversationKey("listing", slug)} one="comment" many="comments" />
            </span>
          </h2>
          {/* FO2 — the forum: the same conversation at an address of its
              own, plus every thread about this product. */}
          <AppLink
            href={listingForumPath(slug)}
            className="tap text-[13px] font-semibold text-link no-underline hover:underline hover:underline-offset-[3px]"
          >
            Open the {LISTING_FORUM_TITLE.toLowerCase()}
          </AppLink>
        </div>
        {/* DQ0b — the comment box FIRST: something to say, and what other
            people said. */}
        <Comments slug={slug} launch={discussion?.launch ?? null} />

        {/* PP0 (WC-6) — ONE CONVERSATION. What remains is a link list for
            the titled threads about this product, which renders nothing when
            there are none. A failed read (`null`) and an empty list stay
            different answers (OD5). */}
        <EarlierDiscussions threads={discussion?.threads ?? null} />
      </section>

    </>
  );
}
