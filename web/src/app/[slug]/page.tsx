import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Children, type ReactNode } from "react";

import { consoleOrigin } from "@/lib/platform";

import {
  observedRow,
  BUILD_DETAILS_HEADING,
  BUILD_STAT_LABEL,
  mostActiveRankOf,
  CLEAN_VOTE_LABEL,
  CLEAN_VOTE_TITLE,
  INSTALL_HEADING,
  dayOf,
  formulaHref,
  LISTING_FORUM_TITLE,
  labelOf,
  launchHealth,
  listingForumPath,
  PRICING_PROVENANCE_NOTE,
  cardMark,
  pricingPath,
  rankMarks,
  badgeHtml,
  badgeMarkdown,
  badgeValue,
  badgeVariantValue,
  BADGE_VARIANTS,
  BADGE_VARIANT_LABEL,
  breadcrumbJsonLd,
  listingJsonLd,
  thumbnailOf,
  shareIntents,
  shareText,
  shareUrl,
  alternativesFor,
  type Alternative,
  topicPath,
  type PublicMetric,
  demandLine,
  FOLLOWER_COUNT_TITLE,
  followerLine,
  takingOffersLine,
  type Demand,
} from "@openproduct/contracts";

import { ObservedRow } from "./observed-row";

import {
  fetchPublicDirectory,
  fetchListing,
  fetchDiscussion,
  maintainerLabel,
  publicApexOrigin,
  publicApiBase,
} from "../public-api";
import { MediaPanel } from "./media-panel";
import { BadgeSnippet, type BadgeChoice } from "./badge-snippet";
import { Changes } from "./changes";
import { LaunchHealth } from "./launch-health";
import { SECTION_ATTRIBUTE, SECTION_CARD, SECTION_NAV_LABEL, SECTION_PROSE, listingSections } from "./sections";
import { WORKSPACE_VIEW_LABEL, workspaceConsentPath } from "./workspace-view";
import { InstallLine } from "./install-line";
import { ShareControl } from "./share-control";
import { JsonLd } from "../ui/json-ld";
import {
  BOARD_CARD_TITLE,
  BOARD_COLUMNS,
  BOARD_PAGE,
  BOARD_STACK,
  BTN_INK,
  BTN_SEAT,
  BTN_SOFT,
  CARD,
  COVER_PRODUCT,
  FOCUS,
  FOLLOW_PILL_OUTLINE,
  H3,
  PAGE_TITLE,
  PANEL,
  SEAT_RING,
  SEAT_ROW,
  SECTION_PILL,
  SECTION_PILL_OFF,
  SIDE_CARD,
  SIDE_ROW,
  SIDE_TITLE,
  STACK_PILL,
} from "../ui/design";
import { cardMeta, productCopy } from "../ui/og";
import { ThemeToggle } from "../ui/theme-toggle";
import { initialsOf } from "../feed/tile";
import { DASH, NewPill, PersonName } from "../ui/bits";
import { ProductTile } from "../ui/product-tile";
import { PENDING, pendingProps } from "../ui/pending";
import { ordinal } from "../ui/ordinal";
import { FollowButton } from "../ui/follow-button";
import { SaveControl } from "../ui/save-control";
import { VoteBox } from "../ui/vote-box";
import { MetricValue, agoOf, fromEpochSeconds, metricsByKey } from "../ui/metric";
import { DelistedNote, ListingTombstone } from "../ui/tombstone";
import { ReportControl } from "../ui/report-control";
import { Comments } from "./comments";
import { EarlierDiscussions } from "./discussions";

import { LiveCount } from "../ui/conversation-live";
import { conversationKey } from "../ui/live-posts";

import { AppLink } from "../ui/link";
import { ActiveIcon, ChangesIcon, ClockIcon, PlusIcon, UpvoteIcon } from "../ui/icons";

/**
 * A public product page (OD5), rebuilt to the redesign's `Product` board —
 * the VISITOR view, on the data the listing has today (openproduct-redesign
 * OPR1).
 *
 * The header card is the board's: a cover band, the logo overlapping it, the
 * name as the page's one `h1`, the one-line pitch, a line of facts, and the
 * actions — Follow (the product), Take a seat, Try it. Under it, two columns
 * (one on a phone): the reading column holds what the page has — About with
 * its pictures and install line, what each open seat asks for, what changed,
 * the launches, the discussion — each a flat card; the side column holds the
 * board's Crew, Built with and In the open, then what was read from the
 * repository.
 *
 * The board's tabs, its progress mark, its template posts and its maker view
 * arrive with the data they show (OPR2, OPR3). Nothing stands in for them.
 *
 * The page renders ONLY what the public projection carries. There is nothing
 * to filter here, because nothing private ever arrives — and where a figure
 * was not observed the page renders a dash and says which part of the product
 * brings it. Never a zero: a zero is a claim, and an unobserved thing has not
 * made one (OPC-C).
 */
export const revalidate = 60;

/**
 * WHAT MAKES `revalidate` ABOVE ACTUALLY DO ANYTHING (openproduct-commons XP4).
 *
 * A dynamic segment is only entered in the prerender manifest — the registry
 * the ISR cache is keyed from — when it declares this function. Without it,
 * Next 15 resolves the route as fully dynamic: `revalidate` is accepted,
 * ignored, and every response goes out
 * `Cache-Control: private, no-cache, no-store, must-revalidate`. No edge, no
 * browser and no CDN may keep it, so every visitor pays a full server render
 * and the page is not the one cacheable document OPC-1 describes.
 *
 * XP4's budget lane found it, because it could not otherwise explain why the
 * detail archetype scored a layout shift the directory did not: an uncacheable
 * route is a STREAMED route, so every visit paints `loading.tsx` first and
 * moves the page when the content lands.
 *
 * Returning `[]` prerenders nothing at build (the slugs are not knowable
 * then), and `dynamicParams` defaults to true, so the first request for a slug
 * renders it and every request inside the window is served from the cache.
 * That is the behaviour `revalidate = 60` was always meant to describe.
 */
export async function generateStaticParams() {
  return [];
}

const NEW_MS = 14 * 24 * 60 * 60 * 1000;

interface PageProps {
  params: Promise<{ slug: string }>;
}

function longDate(iso: string | null): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const read = await fetchListing(slug);
  const profile = read?.profile;
  if (!profile) {
    // TS3 — a removed listing still HAS an address, so it still has a title,
    // and that title is the fact rather than the name of the thing that was
    // there. Naming it would republish, in the browser tab and in every
    // preview card, exactly what was taken off the page.
    //
    // `index: false` on both branches, for two different reasons: a 404 has
    // nothing to index, and a tombstone indexed is a removal amplified.
    if (read?.tombstone) {
      return { title: "No longer listed", robots: { index: false, follow: false } };
    }
    return { title: "Not found" };
  }

  const description = profile.tagline ?? "A product built in the open, looking for people.";
  const apex = publicApexOrigin();
  // RE0 — the listing's own card. `cardMeta` returns null on a deployment
  // with no canonical origin, for the same reason `alternates` is gated on
  // the same value one line below: `og:image` has to be absolute, and a
  // preview host does not know its own public address.
  const card = cardMeta(
    apex,
    `/og/product/${profile.slug}`,
    productCopy(profile.slug, profile.tagline, cardMark(profile.launch)).alt,
  );
  return {
    // `Name — tagline`, and the template adds `· openproduct` (RE2).
    //
    // The slug alone told a search result and a shared link nothing: a person
    // scanning ten tabs or ten results reads the first few words, and
    // `my-product` is not one of them. The tagline is the maker's own sentence
    // about what the thing is, which is exactly what belongs there.
    //
    // BOUNDED, because a title is not a place to put a paragraph: past about
    // sixty characters every search engine truncates and every tab has long
    // since given up, and a title that gets cut mid-word reads as careless.
    // A listing with no tagline keeps the bare slug rather than growing an
    // em-dash with nothing after it.
    title: listingTitle(profile.slug, profile.tagline),
    description,
    ...(apex ? { alternates: { canonical: `${apex}/${profile.slug}` } } : {}),
    // TS1 — a first listing from a maker nobody has reviewed is LIVE and
    // READABLE, and simply not amplified. Anyone sent the link reads the
    // whole page; search engines are told not to index it until a human has
    // looked once. Blocking instead would punish the honest first-timer, who
    // is the overwhelming majority, to inconvenience the spammer, who will
    // make another account anyway.
    //
    // Read from the projection, never recomputed here: the decision was made
    // at publish time about THIS listing, and recomputing it would let a
    // later promotion or demotion silently change an old page's status.
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

export default async function OpenproductProfilePage({ params }: PageProps) {
  const { slug } = await params;
  // DS4 — TWO READS, AND THE SECOND IS THE DIRECTORY DOCUMENT THIS PAGE
  // ALREADY LIVES BESIDE. Similar launches could have been a third query with
  // its own ORDER BY; that ORDER BY would be a second implementation of
  // `sort.most-active`'s published sentence, free to drift from the one the
  // directory uses (OPC-4). Ranking the cached catalog with the same
  // comparator instead means the panel and the directory cannot disagree.
  //
  // It costs nothing per visitor: both reads are anonymous, both are
  // `max-age=60`, and the catalog document is the single most cached thing in
  // the estate — this page is joining a queue of one.
  //
  // Concurrent, because the second read does not depend on the first: a
  // serial pair would double this page's time-to-first-byte to compute a
  // sidebar.
  // A THIRD CONCURRENT READ (CB1). Anonymous and cached like the other two,
  // and concurrent for the same reason: serialising it would add a round trip
  // to a section most visitors never scroll to.
  const [read, catalog, discussion] = await Promise.all([
    fetchListing(slug),
    fetchPublicDirectory(),
    fetchDiscussion(slug),
  ]);
  const profile = read?.profile;

  // TS3 — REMOVED IS NOT MISSING, and this is the one page in the product
  // that draws the distinction. A removed listing renders its tombstone: the
  // address keeps working, inbound links do not break, and the person it
  // happened to can point at something. Everything else about the read — no
  // actor, no personalisation, same bytes for everyone — is unchanged, so the
  // tombstone caches exactly like the page it replaced (OPC-1, I6).
  if (!profile && read?.tombstone) {
    return <ListingTombstone tombstone={read.tombstone} />;
  }

  // Unknown, unpublished, and unreachable all land here. The API answers the
  // first two identically on purpose; one 404 for all three keeps this page
  // from becoming the oracle the API refuses to be.
  if (!profile) notFound();

  const openRoles = profile.roleOpenings.filter((role) => role.status === "open");
  // PP2 — the outline the nav lists and `j`/`k` walk. PV4's section is the
  // one optional entry: `changes.tsx` renders nothing at all without a
  // baseline, and an anchor to nothing is a broken link.
  const sections = listingSections({
    changes: profile.changes !== null && profile.changes.length > 0,
    launches: profile.launches.length > 0,
    crew: profile.maintainers.length > 0 || openRoles.length > 0,
  });
  const components = profile.components ?? [];
  // "Built with" (board `Product`): the stack the listing states, the
  // components its workspace published and where it is hosted — every one a
  // pill, said once (a component named like a stack entry is one pill).
  const builtWith = [
    ...new Set([
      ...profile.stack,
      ...components.map((component) => (component.kind ? `${component.kind} · ${component.name}` : component.name)),
      ...(profile.hosting ? [labelOf("hosting", profile.hosting) ?? profile.hosting] : []),
    ]),
  ];
  // CP-R3 — the sections with nothing in them, in the page's order, each
  // named once on the *Not yet* line. *What changed* folds only when a
  // snapshot was compared and nothing moved; with no earlier snapshot there
  // is nothing to say (PV4).
  const notYet = [
    ...(profile.changes !== null && profile.changes.length === 0
      ? [{ id: "changed", label: "a change in the last week" }]
      : []),
    ...(builtWith.length === 0 ? [{ id: "components", label: "a stated stack" }] : []),
    ...(profile.maintainers.length === 0 ? [{ id: "makers", label: "listed makers" }] : []),
  ];
  const isNew = profile.publishedAt !== null && Date.now() - Date.parse(profile.publishedAt) < NEW_MS;
  const publishedOn = longDate(profile.publishedAt);
  const apex = publicApexOrigin();
  // SN2 — what was observed. Empty for a listing whose tier cannot be read,
  // and every entry already filtered to what may be rendered (I9).
  const now = Date.now();
  const metrics = metricsByKey(profile.metrics);
  const merges = metrics.get("merges.7d");
  const lastTouched = metrics.get("last_touched.all");
  // EN2 — the public total and the trailing-week figure. Both from the one
  // metric read above; nothing on this page counts anything itself.
  const endorsements = metrics.get("endorsements.total");
  // UV0 — the SEVEN-DAY window, which EN2 already writes beside the total.
  // The total lives in the vote box in the hero; the week is the figure the
  // facts card carries, because a listing's all-time count says how long it
  // has existed and the week says whether anybody is reading it.
  const endorsementsRecent = metrics.get("endorsements.7d");

  // PP4 — the rank marks, every one derived from a board row the sweep
  // published and none conferred by a person: `#1 today` by OL2's own rule,
  // `#N on 9 Sept` for a podium place after its day (the archive is where
  // the day's order lives, and the pill links there), `Top of the week` from
  // the weekly leaderboard. `profile.launch` is absent when there is nothing
  // to say (UV1), and `rankMarks` of nothing is no pill.
  const marks = rankMarks(profile.launch, dayOf(now));

  // PV2 — `alternatives.overlap`, which REPLACES DS4's "Similar launches".
  // Two panels of small product tiles side by side would be the defect CV0
  // is fixing on the discussion modules, one plane over — and this one is
  // strictly more informative: category is one of four signals rather than
  // the only one, and every row states its own overlap where a reader can
  // see it.
  //
  // `catalog === null` is NOT the same as "nothing overlaps", so it is not
  // folded into the same branch (the OD5 finding, kept from DS4).
  const alternatives: Alternative[] | null = catalog
    ? alternativesFor(catalog, profile.slug)
    : null;
  // OB5 — the position on the front page's list, read from the SAME catalogue
  // document the front page orders (`mostActiveRankOf`), so the two cannot
  // disagree. Null — a dash — when there is no honest position: below the
  // floor, unobserved, or past the page this read holds.
  const mostActiveRank = catalog ? mostActiveRankOf(catalog, profile.slug) : null;

  // The comment count beside the Discussion heading is of VISIBLE posts,
  // which is what a reader can see. A count including what they cannot
  // reads as a bug the first time somebody counts the rows.
  const comments = discussion?.launch?.posts.length ?? 0;
  // RE3 — the address, the sentence and the three links, built once. `null`
  // without a canonical origin.
  const share = (() => {
    const url = shareUrl(apex, profile.slug);
    if (!url) return null;
    const text = shareText(profile.slug, profile.tagline);
    return { url, text, intents: shareIntents(url, text) };
  })();
  // RE4 — both forms, built once. `null` without a canonical origin.
  // OB7 — and each badge a maker can choose: *listed* (the bare address,
  // unchanged), *most active #n* and *n changes this week*. A variant with
  // nothing true to say reads *listed* (`badgeVariantValue`), so the chooser
  // offers it only when its value differs from the bare badge's.
  const badgeChoices: BadgeChoice[] | null = (() => {
    if (!apex) return null;
    const facts = { profile, rank: mostActiveRank, merges: merges?.value ?? null };
    const listedValue = badgeValue(profile);
    const choices: BadgeChoice[] = [];
    for (const variant of BADGE_VARIANTS) {
      const value = variant === "listed" ? listedValue : badgeVariantValue(variant, facts);
      if (variant !== "listed" && value === "listed") continue;
      const markdown = badgeMarkdown(apex, profile.slug, variant);
      const html = badgeHtml(apex, profile.slug, value, variant);
      if (markdown && html) choices.push({ id: variant, label: BADGE_VARIANT_LABEL[variant], value, markdown, html });
    }
    return choices.length > 0 ? choices : null;
  })();
  // The handles of the people on this listing, so the comment list can wear
  // the design's `Maker` badge on their comments. Handles rather than names:
  // a handle is present if and only if `/@handle` resolves (CG4), so this is
  // a match on a public identity and never on a display string two people
  // could share.

  // PV0 — what was read from the repository, computed once so the rail's
  // panel can decide its own heading: the observed frame's when there is a
  // read, the facts' own when there is not.
  const observed = observedRow(profile, new Date(now));
  // openproduct-studio OSD3 — the hero card's and the product bar's tile:
  // the maker's logo, read off the media the page already carries.
  const thumbnail = thumbnailOf(profile.media);

  return (
    <>
      <main className={BOARD_PAGE}>
        {/* TS3 — a DELISTED listing renders in full and says so. Delisting
            means "not amplified here", not "not shown here", so nothing is
            taken off the page; what is added is the one sentence a reader who
            followed a link needs. */}
        {read?.tombstone ? <DelistedNote tombstone={read.tombstone} /> : null}
        {/* DS4 — the structured record, for a crawler that already has this
            page. Built from the same projection rendered below and nothing
            else, so the two cannot disagree.

            ONLY WHEN THE PAGE ASKS TO BE INDEXED. A listing TS1 marks
            `noindex` gets no JSON-LD.

            THERE IS NO RATING IN IT AND THERE WILL NOT BE. An endorsement is a
            person putting their name to a product, not a score. See
            `NO_RATING_NOTE`. */}
        {profile.indexable ? <JsonLd data={listingJsonLd(profile, apex, publicApiBase())} /> : null}
        {/* THE TRAIL, and it is emitted even where the listing is not:
            `noindex` says do not amplify THIS page; a breadcrumb is about the
            pages ABOVE it. */}
        <JsonLd data={breadcrumbJsonLd([{ name: "Open builds", path: "/" }, { name: profile.slug, path: `/${profile.slug}` }], apex)} />

        {/* ── the header card (board `Product`, visitor view) ─────────── */}
        {/* FR4 — a listing is ONE row, so `u` upvotes it without the reader
            having tabbed to anything first. `data-keyrow` is the same
            attribute the feed's rows wear. */}
        <section id={HERO_ID} data-keyrow aria-label="Listing" className={CARD}>
          {/* The cover band: decoration, and on the desktop board only — the
              phone board starts at the logo and the name. */}
          <div aria-hidden="true" className={COVER_PRODUCT} />
          <div className="flex flex-wrap items-end justify-between gap-5 px-[30px] pb-6 max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5 max-sm:p-[14px]">
            <div className="-mt-[44px] flex min-w-0 flex-[1_1_480px] flex-col gap-2.5 max-sm:mt-0 max-sm:flex-none">
              <div className="flex flex-col gap-2.5 max-sm:flex-row max-sm:items-center max-sm:gap-3">
                {/* openproduct-studio OSD3 — the maker's logo when there is
                    one, the monogram otherwise; one component on every
                    surface. Here at the board's 92px with the card's own
                    colour ringed round it, where it overlaps the band; the
                    phone board's 52px beside the name. */}
                <ProductTile
                  slug={profile.slug}
                  thumbnail={thumbnail}
                  size={76}
                  phoneSize={52}
                  className={HERO_TILE}
                />
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
                  <h1 className={`${PAGE_TITLE} min-w-0 break-words`}>{profile.slug}</h1>
                  {/* PP4 — the rank marks, every one derived from a board row
                      the sweep published and none conferred by a person: `#1
                      today` by OL2's own rule, `#N on 9 Sept` for a podium
                      place after its day, `Top of the week` from the weekly
                      leaderboard. Beside the name, where the board keeps a
                      product's standing. */}
                  {marks.length > 0 || isNew ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {marks.map((mark) => (
                        <AppLink
                          key={mark.kind}
                          href={mark.href}
                          title={mark.title}
                          // The pill is 28px; the link round it is the 44px
                          // target on a phone (`tap`), so the fill is on the
                          // inner span and the name's row stays one line tall.
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
              {/* The one-line pitch: the maker's own sentence about what the
                  thing is. */}
              {profile.tagline ? (
                <p className="m-0 max-w-[640px] text-card-title font-normal leading-[1.5] text-copy [text-wrap:pretty] max-sm:text-[15px]">
                  {profile.tagline}
                </p>
              ) : null}
              {/* The line of facts: category · licence · hosting · followers ·
                  open seats. Each is what the data holds and is absent when it
                  holds nothing — the category is still an ADDRESS (TP0),
                  absent rather than "Other" when the listing has not answered
                  (CT1). */}
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
                {/* PP1 — the count is the document's own and is the follow's
                    only public face — nothing lists followers, here as
                    anywhere (FL0, WC2-7). Above zero only: a zero is what the
                    page used to lead with. */}
                {profile.followers > 0 ? (
                  <span title={FOLLOWER_COUNT_TITLE}>{followerLine(profile.followers)}</span>
                ) : null}
                {/* Teal always means "this is open to you": the seats, and the
                    way to them. */}
                {openRoles.length > 0 ? (
                  <a
                    href="#crew"
                    className="tap-h inline-flex font-medium text-seat-ink no-underline hover:underline hover:underline-offset-[3px]"
                  >
                    {openSeatsLabel(openRoles.length)}
                  </a>
                ) : null}
              </HeroFacts>
            </div>

            <div className="flex flex-col items-end gap-2 max-sm:items-stretch">
              {/* THE BOARD'S THREE ACTIONS. Follow follows the PRODUCT (owner
                  rule 3); Take a seat goes to the crew card and is there only
                  when a seat is open; Try it goes to the running product and
                  is there only when the listing has an address for one. */}
              <div data-hero-actions className="flex flex-wrap justify-end gap-2 max-sm:grid max-sm:grid-cols-2">
                {/* XP2 — the same static markup for every visitor at the
                    SERVER render, personalised only after hydration by the
                    overlay (I6). */}
                <div className={FOLLOW_PILL_OUTLINE}>
                  <FollowButton
                    kind="listing"
                    value={profile.slug}
                    followers={profile.followers}
                    returnTo={`/${profile.slug}`}
                    size="hero"
                    countHidden
                  />
                </div>
                {openRoles.length > 0 ? (
                  <a href="#crew" className={BTN_SOFT}>
                    Take a seat
                  </a>
                ) : null}
                {profile.liveUrl ? (
                  <a href={profile.liveUrl} rel="noreferrer noopener" className={BTN_INK}>
                    Try it
                    <Glyph d="M4.5 11.5 11.5 4.5M6 4.5h5.5V10" />
                  </a>
                ) : null}
              </div>
              {/* The smaller acts the page already had, kept in the header
                  (owner rule 10: small controls live there, none takes a row
                  of its own on the page).

                  THE ENDORSEMENT LIVES ONLY HERE, not on a directory row
                  (OPC-3, UV0): the box carries the count, so a reader can see
                  what pressing it moves. Save is private and counted nowhere.

                  RE3 — SHARE, AND NOT A WIDGET: the browser's own sheet, the
                  address, and three ordinary links. `null` without a canonical
                  origin. */}
              <div className="flex flex-wrap items-center justify-end gap-2 max-sm:justify-start">
                <VoteBox
                  slug={profile.slug}
                  count={endorsements ? endorsements.value : null}
                  returnTo={`/${profile.slug}`}
                  shape="hero"
                />
                <SaveControl slug={profile.slug} />
                {share ? (
                  <ShareControl url={share.url} text={share.text} intents={share.intents} />
                ) : null}
              </div>
            </div>
          </div>

          {/* ── the outline (PP2) ──────────────────────────────────── */}
          {/* ANCHORS, NOT ROUTES, in the row where the board keeps a product's
              sections. The board's own tabs (Updates · About · Crew · Talk)
              arrive with the posts they switch between (OPR2); until then the
              row is this page's outline, which scrolls the one cacheable
              document. The list is `listingSections`, the same list `j` and
              `k` walk. A scrolling row rather than a `<select>`, because a
              select that navigates on change is a change of context on input
              (WCAG 3.2.2). */}
          <nav
            aria-label={SECTION_NAV_LABEL}
            className="overflow-x-auto px-[22px] pb-4 max-sm:px-2.5 max-sm:pb-2.5 max-sm:[scrollbar-width:none]"
          >
            <ul className="m-0 flex list-none gap-1.5 p-0">
              {sections.map((section) => (
                <li key={section.id} className="shrink-0">
                  <a href={`#${section.id}`} className={`${SECTION_PILL} ${SECTION_PILL_OFF} ${FOCUS}`}>
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </section>

        {/* ── the two columns ──────────────────────────────────────── */}
        <div className={BOARD_COLUMNS}>
          {/* THE TRACK IS minmax(0,1fr), NOT THE IMPLICIT `auto`
              (openproduct-studio OSD1). An implicit column's minimum is its
              items' min-content, and the gallery strip's min-content is every
              thumbnail side by side — `overflow-x-auto` on the strip does not
              lower it. */}
          <div className={BOARD_STACK}>
            <section
              id="about"
              aria-labelledby="about-heading"
              className={SECTION_CARD}
              {...{ [SECTION_ATTRIBUTE]: true }}
            >
              <h2 id="about-heading" tabIndex={-1} className={`${BOARD_CARD_TITLE} outline-none`}>
                About
              </h2>
              {/* MD2 — THE PICTURES, above the pitch: the maker's hero and
                  gallery, the automated capture with its date — and NOTHING
                  when there are no rows. Never a generated image, never a
                  stock one (VC4). */}
              <MediaPanel media={profile.media} apiBase={publicApiBase()} now={new Date(now)} />
              {profile.pitch ? (
                // The maintainer's own words, rendered as plain text in
                // visibly their voice. Deliberately NOT markdown-to-HTML:
                // this string comes from a form and ends up on a page anyone
                // can read, and an HTML-rendering pitch is an injection
                // surface the epic has no reason to open.
                <p className={`m-0 mt-3 whitespace-pre-wrap ${SECTION_PROSE}`}>
                  {profile.pitch}
                </p>
              ) : (
                <p className="m-0 mt-3 max-w-[68ch] text-[15px] leading-[1.6] text-muted-foreground">
                  No pitch has been published for this product yet.
                </p>
              )}

              {/* PV2 — HOW TO GET IT, immediately after what it is, inside the
                  About card: a mono box with Copy.

                  ABSENT WHEN THERE IS NONE, never an empty box with a
                  placeholder (OPC-C). */}
              {profile.installLine ? (
                <div id="install" aria-labelledby="install-heading" className="mt-4">
                  <h3 id="install-heading" className="m-0 text-[13px] font-semibold text-foreground">
                    {INSTALL_HEADING}
                  </h3>
                  <InstallLine command={profile.installLine} />
                </div>
              ) : null}
            </section>

            {/* HELP WANTED — what each open seat asks for, in the maker's
                words. The crew card beside the page lists the same seats as
                rows; this is where a reader finds out what one is.

                ABSENT WHEN THERE IS NOTHING OPEN, not empty. A heading over
                "nothing right now" is a section whose job is to disappoint. */}
            {openRoles.length > 0 ? (
              <section className={SECTION_CARD} id="people-wanted" aria-labelledby="people-wanted-heading">
                <h2 id="people-wanted-heading" className={BOARD_CARD_TITLE}>
                  {SEATS_HEADING}
                </h2>
                <ul className="m-0 mt-3 grid list-none gap-2.5 p-0">
                  {openRoles.map((role) => (
                    <li key={role.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[14px] bg-seat-wash px-4 py-3.5">
                      <span aria-hidden="true" className={`${SEAT_RING} grid h-[44px] w-[44px] place-items-center border-2 text-seat`}>
                        <PlusIcon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0 flex-[1_1_220px]">
                        <div className="text-card-title font-semibold tracking-[-0.015em] text-foreground">{role.title}</div>
                        {/* CB2's demand line — floored at three by the API,
                            never here. The page renders the sentence the
                            contract chose; it never sees a raw count
                            (OPC-F). */}
                        {role.commitment || demandLine(role.demand) ? (
                          <div className="text-[13px] text-muted-foreground">
                            {[role.commitment, demandLine(role.demand)].filter(Boolean).join(" · ")}
                          </div>
                        ) : null}
                        {role.description ? (
                          <p className="m-0 mt-1.5 max-w-[68ch] text-[15px] leading-[1.5] text-copy">
                            {role.description}
                          </p>
                        ) : null}
                      </div>
                      {/* The apply door (OD4). A LINK, not a form: applying
                          requires sign-in, and `/join/{secret}` is the shipped
                          page that handles that — there is no anonymous write
                          anywhere. Since OX2 the door lives on the CONSOLE
                          origin (seam edge S5). No door, no button. */}
                      {role.joinLinkRef ? (
                        <a
                          href={`${consoleOrigin()}/join/${role.joinLinkRef}?from=openproduct`}
                          className={`${BTN_SEAT} max-sm:w-full`}
                        >
                          Take the seat
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* PV4 — WHAT CHANGED. A fact ABOUT the listing rather than part
                of it. Absent entirely when there is no earlier snapshot — see
                `changes.tsx`. */}
            <Changes changes={profile.changes} now={now} />

            {/* PP5 — LAUNCHES. Every launch this listing has made, newest
                first, each with where the board put it and how many spoke
                under it — READ from the feed's own rows (OL-2a), so this
                list, the feed and the archive cannot disagree. Absent when
                there is none. A day the sweep has not ranked says so rather
                than showing a zero (OPC-C). */}
            {profile.launches.length > 0 ? (
              <section
                className={SECTION_CARD}
                id="launches"
                aria-labelledby="launches-heading"
                {...{ [SECTION_ATTRIBUTE]: true }}
              >
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
                          <span
                            className="text-foreground"
                            title={`${entry.counted ?? 0} upvotes counted on ${entry.day}`}
                          >
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

            <section
              className={SECTION_CARD}
              id="discussion"
              aria-labelledby="discussion-heading"
              {...{ [SECTION_ATTRIBUTE]: true }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                <h2 id="discussion-heading" tabIndex={-1} className={`${BOARD_CARD_TITLE} outline-none`}>
                  Discussion{" "}
                  <span className="ml-1 text-[13px] font-normal tracking-normal text-muted-foreground">
                    {/* OPP14 — the document's count, plus what this browser
                        just posted and the document has not caught up with. */}
                    <LiveCount
                      base={comments}
                      conversation={conversationKey("listing", profile.slug)}
                      one="comment"
                      many="comments"
                    />
                  </span>
                </h2>
                {/* FO2 — the forum: the same conversation at an address
                    of its own, plus every thread about this product. A
                    route, not an anchor, so it sits beside the count
                    rather than in the outline. */}
                <AppLink
                  href={listingForumPath(profile.slug)}
                  className="tap text-[13px] font-semibold text-link no-underline hover:underline hover:underline-offset-[3px]"
                >
                  Open the {LISTING_FORUM_TITLE.toLowerCase()}
                </AppLink>
              </div>
              {/* DQ0b — the comment box FIRST, because it is what a reader of
                  a product page came to the section for: something to say,
                  and what other people said. */}
              <Comments
                slug={profile.slug}
                launch={discussion?.launch ?? null}
              />

              {/* PP0 (WC-6) — ONE CONVERSATION. What remains is a link list
                  for titled threads that already existed, which renders
                  nothing when there are none. */}
              <EarlierDiscussions threads={discussion?.threads ?? null} />
            </section>

            {/* CP-R3 — WHAT IS NOT HERE YET, said once. Each empty section
                folds into this line rather than taking a panel to say none;
                each keeps its anchor, so an old link to `#makers` still lands
                on the sentence that answers it. Absent when every section
                has something in it. */}
            {notYet.length > 0 ? (
              <p data-not-yet className="m-0 px-2 text-[13px] leading-[1.6] text-muted-foreground">
                Not yet on {profile.slug}:{" "}
                {notYet.map((item, index) => (
                  <span key={item.id} id={item.id} className="scroll-mt-[80px]">
                    {index > 0 ? <span className="text-faint"> · </span> : null}
                    {item.label}
                  </span>
                ))}
                .
              </p>
            ) : null}
          </div>

          {/* ── the side column ──────────────────────────────────────── */}
          {/* The board's three cards first — Crew, Built with, In the open —
              then what the page already read from the repository and from
              this site, in the same flat card. */}
          <aside className={BOARD_STACK}>
            {/* CREW (board `Product`): the people on the listing, then each
                open seat as a teal row with its dashed ring. Every name is
                there because its owner put it there; a maintainer can name
                somebody, and only that person can make it public (OPC-5, CG3).
                The list is never derived from a workspace roster.

                ABSENT when there is nobody and no seat: the *Not yet* line
                says so once. */}
            {profile.maintainers.length > 0 || openRoles.length > 0 ? (
              <section
                id="crew"
                aria-labelledby="crew-heading"
                className={`${SIDE_CARD} scroll-mt-[80px]`}
                {...{ [SECTION_ATTRIBUTE]: true }}
              >
                <h2 id="crew-heading" tabIndex={-1} className={`${SIDE_TITLE} outline-none`}>
                  Crew
                </h2>
                {profile.maintainers.length > 0 ? (
                  <ul id="makers" className="m-0 grid list-none scroll-mt-[80px] gap-3 p-0">
                    {profile.maintainers.map((maintainer) => (
                      <li key={maintainer.subjectId} className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-semibold text-copy"
                        >
                          {initialsOf(maintainerLabel(maintainer.displayName))}
                        </span>
                        <span className="grid min-w-0 leading-[1.35]">
                          {/* CG4 — a link when there is somewhere to go, plain
                              text otherwise. The rule lives in `PersonName`
                              rather than in a ternary here, so it cannot be
                              written twice and hold once (XP-5). The label is
                              a written fallback, never a raw subject id. */}
                          <PersonName
                            name={maintainerLabel(maintainer.displayName)}
                            handle={maintainer.handle}
                            className="tap-h truncate text-[15px] font-semibold text-foreground"
                          />
                          {maintainer.roleLabel ? (
                            <span className="truncate text-[13px] text-muted-foreground">
                              {maintainer.roleLabel}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {openRoles.map((role) => (
                  <div key={role.id} className={SEAT_ROW}>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden="true" className={`${SEAT_RING} h-[32px] w-[32px] border-[1.5px]`} />
                      <span className="min-w-0 break-words text-[15px] text-foreground">{role.title}</span>
                    </span>
                    {role.joinLinkRef ? (
                      <a
                        href={`${consoleOrigin()}/join/${role.joinLinkRef}?from=openproduct`}
                        className="tap shrink-0 justify-end text-[13px] font-semibold text-seat-ink no-underline hover:underline hover:underline-offset-[3px]"
                      >
                        Take it
                        <span className="sr-only">: {role.title}</span>
                      </a>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}

            {/* BUILT WITH (board `Product`): the stack, the published
                components and the hosting, as the board's pills — a dot and a
                word. Names and kinds come from the workspace's own component
                manifest at publish; nothing here is typed by hand, and
                nothing private is carried across.

                ABSENT when the listing states none of the three: a listing
                that has not stated its stack has not stated it, which is
                different from being built with nothing. */}
            {builtWith.length > 0 ? (
              <section className={SIDE_CARD} id="components" aria-labelledby="stack-heading">
                <h2 id="stack-heading" className={SIDE_TITLE}>
                  Built with
                </h2>
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                  {builtWith.map((entry, index) => (
                    <li key={entry} className={STACK_PILL}>
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 shrink-0 rounded-full ${STACK_DOTS[index % STACK_DOTS.length]}`}
                      />
                      {entry}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* IN THE OPEN (board `Product`): where the work is, as
                label/value rows — the repository, the workspace, the pricing.
                Each row only when the listing has it. */}
            {profile.repoUrl || profile.workspaceRef || profile.pricing ? (
              <section className={SIDE_CARD} aria-labelledby="open-heading">
                <h2 id="open-heading" className={SIDE_TITLE}>
                  In the open
                </h2>
                <div className="grid gap-2.5">
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
                  ) : null}
                  {/* The workspace view door (openproduct-reader OPR5, seam
                      S12). A PLAIN ANCHOR to the consent page on THIS origin,
                      rendered on `workspaceRef` alone — present only while the
                      maker's link grant attests a public workspace — so the
                      page stays the same bytes signed in and out (OPC-1/I6)
                      and no listing without a door shows one. */}
                  {profile.workspaceRef ? (
                    <div className={SIDE_ROW}>
                      <span className="text-muted-foreground">Workspace</span>
                      <AppLink
                        href={workspaceConsentPath(profile.slug)}
                        className="tap-h text-right text-link underline-offset-[3px] hover:underline"
                      >
                        {WORKSPACE_VIEW_LABEL}
                      </AppLink>
                    </div>
                  ) : null}
                  {/* PP3 — pricing, authored, and the hover says so (WC-3).
                      The link is the filter page: the same list every other
                      listing that answered this way is on. */}
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
            ) : null}

            {/* THE REPOSITORY PANEL. Two halves, drawn apart on purpose: the
                observed frame (PV0) is what was READ from the repository,
                with the moment of the read and every line linking its rule;
                the details under it are what happened on this site. What is
                not observed yet is a dash with a reason, never a zero
                (OPC-C, SN-1). */}
            <section
              className={PANEL}
              aria-labelledby={observed.length > 0 ? "observed" : "facts-heading"}
            >
              <ObservedRow signals={observed} now={now} />
              <h3
                id="facts-heading"
                className={
                  observed.length > 0
                    ? "m-0 mt-4 text-[13px] font-semibold text-muted-foreground"
                    : H3
                }
              >
                {BUILD_DETAILS_HEADING}
              </h3>
              {/* ── the four figures (OB5) ─────────────────────────────── */}
              {/* HOW IT IS MOVING, and no longer what the page leads with
                  (redesign §1: it counted instead of showing). This week's
                  merged changes, this week's counted upvotes, the place on
                  the Most active list, and when the last change landed. Each
                  is a glyph the rows use, a label, and a value that is a dash
                  — never a zero — when it was not observed (OPC-C). The
                  labels carry the moment of each read in their title (I9). */}
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
                      <AppLink href="/" className="tap-h underline-offset-4 hover:underline">
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
                {/* UV1 — WHERE IT PLACED ON THE DAY IT LAUNCHED, and the row
                    is absent when there is nothing to say: no launch, or a
                    day the sweep has not reached.

                    "2nd of 11" rather than a bare ordinal, because a
                    position a reader cannot scale is a number they have to
                    take on trust. The day links to its own board, so the
                    claim is checkable in one click (OPC-4).

                    THE ORDER IS THE BOARD'S, read rather than derived
                    (OL-2a). */}
                {profile.launch ? (
                  <div className={FACT_ROW}>
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
                <Fact
                  label="Published"
                  value={publishedOn ?? DASH}
                  title={publishedOn ? "first listed" : "not published yet"}
                />
                {/* The category and the licence are on the header's line of
                    facts, the hosting is a "Built with" pill and the pricing
                    is an "In the open" row: each is said once. */}
                {/* CB2 — the summary over the whole listing, DERIVED FROM
                    WHAT THE CARDS ALREADY SAY, never from a separate total
                    (OPC-F). */}
                <Fact label="Taking offers" value={offersSummary(openRoles)} />
              </div>
              {/* PV3 — THE CLEAN-VOTE MARK. */}
              {profile.cleanVotes ? (
                <p className="m-0 mt-3 flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-[1.5] text-muted-foreground">
                  <span
                    title={CLEAN_VOTE_TITLE}
                    className="rounded-full bg-sunken px-2 py-px font-medium text-foreground"
                  >
                    {CLEAN_VOTE_LABEL}
                  </span>
                </p>
              ) : null}
            </section>

            {/* PP6 — LAUNCH HEALTH (PV1 carried): five observed facts, a
                checklist and no number. After the repository panel because
                it is read from the same repository read. */}
            <LaunchHealth items={launchHealth(profile, new Date(now))} now={now} />

            {/* `IN COLLECTIONS` IS ABSENT, DELIBERATELY: nothing reads the
                membership rows BY LISTING yet (OPC-C). */}

            {/* PV2 — alternatives, and the reason beside every one. The
                reason DIFFERS per row, so it is rendered where everybody can
                see it. Ties break alphabetically, so the panel is the same
                for every reader and the same tomorrow. */}
            <section
              className={`${PANEL} scroll-mt-[80px]`}
              id="alternatives"
              aria-labelledby="alternatives-heading"
              {...{ [SECTION_ATTRIBUTE]: true }}
            >
              <h3 id="alternatives-heading" tabIndex={-1} className={`${H3} outline-none`}>
                Alternatives
              </h3>
              {alternatives === null ? (
                // The catalog could not be read. NOT "nothing overlaps": an
                // empty room and a locked door look nothing alike to a reader.
                <p className="m-0 mt-1 text-[13px] leading-[1.45] text-muted-foreground">
                  Couldn&rsquo;t load these just now.
                </p>
              ) : alternatives.length === 0 ? (
                <p className="m-0 mt-1 text-[13px] leading-[1.45] text-muted-foreground">
                  None yet.
                </p>
              ) : (
                <ul className="m-0 mt-1 grid list-none p-0">
                  {alternatives.map(({ card, reason }) => (
                    <li key={card.slug} data-keyrow>
                      <AppLink
                        href={`/${card.slug}`}
                        className="tap flex items-center gap-3 py-1.5 no-underline"
                      >
                        <ProductTile slug={card.slug} thumbnail={card.thumbnail} size={44} />
                        <span className="grid min-w-0 leading-[1.35]">
                          <span className="truncate text-[15px] font-semibold text-foreground">{card.slug}</span>
                          {/* THE REASON, not the tagline: why the listing is
                              here. The tagline is on its own page, one click
                              away. */}
                          <span className="truncate text-[13px] text-muted-foreground">
                            {reason}
                          </span>
                        </span>
                      </AppLink>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* RE4 — THE BADGE, AND ITS LINE, for the maintainer rather than
                for the reader who arrived from a search result.

                `null` on a deployment with no canonical origin: a snippet
                copied off a preview host would put that host in somebody's
                README permanently. */}
            {badgeChoices ? (
              <details className={`${CARD} px-[18px] py-3.5`}>
                <summary
                  id="badge-heading"
                  className="tap flex cursor-pointer list-none items-center justify-between gap-2 text-[15px] font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden"
                >
                  Badge for your README
                  <Glyph d="M4 6.5 8 10.5l4-4" />
                </summary>
                <div className="mt-3">
                  <BadgeSnippet choices={badgeChoices} />
                </div>
              </details>
            ) : null}

            {/* TS3 — the report door: last and quietest, opened by intent. */}
            <ReportControl subjectKind="listing" subjectRef={profile.slug} returnTo={`/${profile.slug}`} bare />
          </aside>
        </div>
      </main>

      {/* The page's own footer: what was observed at publish, the theme
          control (FR1 — this page carries its own footer instead of the
          site's, so it carries the control too), and the page's short
          address. The root layout's footer steps aside here. */}
      <footer className="mx-auto box-border flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-5 gap-y-3 px-6 pb-9 pt-2 text-[13px] text-muted-foreground max-sm:px-3">
        <span>
          Components, openings and licence as observed at publish
          {publishedOn ? ` — ${publishedOn}` : ""}.
        </span>
        <ThemeToggle />
        {apex ? <span className="font-mono">openproduct.live/{profile.slug}</span> : null}
      </footer>
    </>
  );
}

/** The header card's id — the listing's one keyboard row. */
const HERO_ID = "listing-hero";

/** The header's tile (board `Product`): 92px at a 26px radius, the name's
 *  initials at 30px/600, with the card's own colour ringed 5px round it where
 *  it overlaps the cover band. On a phone it is `ProductTile`'s 52px, at the
 *  phone board's 16px radius, and there is no band to ring it against. */
const HERO_TILE =
  "ring-[5px] ring-card max-sm:ring-0 sm:!h-[92px] sm:!w-[92px] sm:!rounded-[26px] sm:!font-sans sm:!text-[30px] sm:!font-semibold max-sm:!rounded-[16px]";

/** The heading over what each open seat asks for: the site's own name for it
 *  (the navigation's *Help wanted*). */
const SEATS_HEADING = "Help wanted";

/** `N open seats`, the header's last fact (board: "2 open seats"). */
function openSeatsLabel(count: number): string {
  return count === 1 ? "1 open seat" : `${count} open seats`;
}

/** The dots before the "Built with" pills, in the board's order: muted,
 *  slate, amber, teal, the lighter amber, lavender — decoration that tells
 *  one pill from the next, and nothing else. */
const STACK_DOTS = ["bg-muted-foreground", "bg-version", "bg-amber", "bg-seat", "bg-brand-amber-inverted", "bg-idea"] as const;

/** `owner/repo` out of a repository address (board: "pullely/ackstack"); the
 *  host and path when it is not that shape, and the address itself when it
 *  does not parse. A bare URL in a row is noise; the name is the fact. */
function repositoryLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]!.replace(/\.git$/, "")}`;
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

/** A facts row: 15px, the label muted and the value tabular in
 *  `--foreground`, as the board's side-card rows — no rule between them. */
const FACT_ROW = SIDE_ROW;

/** The line of facts under the pitch: 13px in `--muted`, a `·` between the
 *  entries that are there and none where one is absent. */
function HeroFacts({ children }: { children: ReactNode }) {
  const facts = Children.toArray(children);
  if (facts.length === 0) return null;
  return (
    <div data-hero-facts className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] leading-[1.4] text-muted-foreground">
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
 * moment; the design just does not give the moment a line of its own).
 */
function observedNote(metric: PublicMetric | undefined, now: number, unit: string) {
  if (!metric) return unit;
  const when = `observed ${agoOf(metric.observedAt, now)}${metric.state === "stale" ? " (stale)" : ""}`;
  return <span title={when}>{unit}</span>;
}

/**
 * The facts card's demand summary, over openings whose lines are already on
 * the page.
 *
 * Picks the STRONGEST claim already made rather than computing a total: a
 * total would be a second number about the same small set, and two numbers
 * about a small set can be subtracted from each other. "4 pending overall"
 * beside three cards reading "a few" tells a reader more than any card does.
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
 * One row of the facts card, at the board's measurements: a 15px row, the
 * label muted, the value tabular. `href` makes the value a link where
 * the fact has an address of its own; without one it is plain text, because a
 * link that goes nowhere is worse than a word (XP-5). `pending` marks a value
 * that is a dash because nothing observes it yet, and says what will.
 */
/**
 * One figure in the stat strip (OB5): a glyph and a label over a value. The
 * label links the figure's sentence when it has one (OPC-4).
 */
function Stat({
  icon,
  label,
  value,
  title,
  href,
  pending,
}: {
  icon: ReactNode;
  label: ReactNode;
  value: ReactNode;
  title?: string;
  href?: string;
  /** An unobserved figure's dash says why it is a dash (XP0's convention). */
  pending?: (typeof PENDING)[keyof typeof PENDING];
}) {
  const inert = pending ? pendingProps(pending) : {};
  return (
    // A small muted label over the figure at the card title's size, on the
    // lighter well — two to a row in the side card.
    <div className="rounded-[14px] bg-well px-3 py-2.5">
      <dt className="text-[13px] text-muted-foreground">
        {/* The glyph rides INSIDE the link when there is one, so the tap
            height lifts both together and the glyph stays beside its word. */}
        {href ? (
          <AppLink href={href} className="tap-h inline-flex items-center gap-1.5 hover:text-foreground">
            {icon}
            {label}
          </AppLink>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {icon}
            {label}
          </span>
        )}
      </dt>
      <dd
        className="m-0 mt-1 text-card-title font-semibold tabular-nums text-foreground"
        {...(title ? { title } : {})}
        {...inert}
      >
        {value}
      </dd>
    </div>
  );
}

function Fact({
  label,
  value,
  href,
  title,
  pending,
}: {
  label: ReactNode;
  value: ReactNode;
  href?: string;
  title?: string;
  pending?: (typeof PENDING)[keyof typeof PENDING];
}) {
  const inert = pending ? pendingProps(pending) : {};
  return (
    <div className={FACT_ROW}>
      <span className="text-muted-foreground">{label}</span>
      {href ? (
        <AppLink
          href={href}
          // NOT `hover:text-copy`, which the prototype's own rows use.
          // XP-1 reserves the accent for endorsement, and a category link that
          // turned gold on hover would make the colour mean "link" as well —
          // the reserved accent quietly acquiring a second meaning, which is
          // exactly what the guard in shell.test.ts caught here.
          className="tap-h text-right tabular-nums text-foreground underline-offset-4 hover:underline"
        >
          {value}
        </AppLink>
      ) : (
        <span
          className="text-right tabular-nums text-foreground"
          {...(title ? { title } : {})}
          {...inert}
        >
          {value}
        </span>
      )}
    </div>
  );
}
