import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { consoleOrigin } from "@/lib/platform";

import {
  observedRow,
  BUILD_DETAILS_HEADING,
  BUILD_ROLES_HEADING,
  BUILD_STAT_LABEL,
  mostActiveRankOf,
  rolesOpenLabel,
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
  primaryAction,
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
import { SECTION_ATTRIBUTE, SECTION_CARD, SECTION_NAV_LABEL, listingSections } from "./sections";
import { ProductBar } from "./product-bar";
import { WORKSPACE_VIEW_LABEL, workspaceConsentPath } from "./workspace-view";
import { InstallLine } from "./install-line";
import { ShareControl } from "./share-control";
import { JsonLd } from "../ui/json-ld";
import {
  BTN_OUTLINE,
  BTN_PRIMARY,
  CARD,
  CRUMBS,
  H2_SECTION,
  PROSE,
  H3,
  PAGE,
  PAGE_TITLE,
  PANEL,
  RAIL,
  TAB,
  TAB_OFF,
  TWO_COL,
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
import { ActiveIcon, ChangesIcon, ClockIcon, RoleIcon, UpvoteIcon } from "../ui/icons";

/**
 * A public product page (OD5, re-cut to the launch design's product view):
 * a back link, the hero, then one reading column beside an aside of cards.
 *
 * The page renders ONLY what the public projection carries. There is nothing
 * to filter here, because nothing private ever arrives — and where the design
 * shows a number this projection does not yet have, the page renders a dash
 * and says which part of the product brings it. Never a zero: a zero is a
 * claim, and an unobserved thing has not made one (OPC-C).
 *
 * EVERY MEASUREMENT BELOW IS THE DESIGN'S OWN, read out of the prototype's
 * inline styles rather than eyeballed, and the shared ones come from
 * `ui/design.ts`. Since openproduct-calm CL3 the hero is the build tile,
 * grown: no banner, the 76px face beside the 44px title, an 18px tagline,
 * and the stat strip's figures as numbers with one label each; one 20px-radius
 * card per section and the 320px rail of panels. Where the app carries a section the design does
 * not draw (launch health, the stack, the titled discussions) it is drawn in
 * the same idiom rather than left in the old one.
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
    makers: profile.maintainers.length > 0,
  });
  const components = profile.components ?? [];
  // CP-R3 — the sections with nothing in them, in the page's order, each
  // named once on the *Not yet* line. *What changed* folds only when a
  // snapshot was compared and nothing moved; with no earlier snapshot there
  // is nothing to say (PV4).
  const notYet = [
    ...(profile.changes !== null && profile.changes.length === 0
      ? [{ id: "changed", label: "a change in the last week" }]
      : []),
    ...(components.length === 0 ? [{ id: "components", label: "published components" }] : []),
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

  // CB3 — decided by the contract, not by a conditional here: the rule is
  // about what the product offers a reader, and two copies of it would drift.
  const primary = primaryAction({ openRoleCount: openRoles.length });

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
      <main className={PAGE}>
        {/* TS3 — a DELISTED listing renders in full and says so. Delisting
            means "not amplified here", not "not shown here", so nothing is
            taken off the page; what is added is the one sentence a reader who
            followed a link needs, because a page whose presence in the
            directory has been withdrawn without saying so is quietly
            misleading about what its own presence means. */}
        {read?.tombstone ? <DelistedNote tombstone={read.tombstone} /> : null}
        {/* DS4 — the structured record, for a crawler that already has this
            page. Built from the same projection rendered below and nothing
            else, so the two cannot disagree.

            ONLY WHEN THE PAGE ASKS TO BE INDEXED. A listing TS1 marks
            `noindex` gets no JSON-LD: the page is live and readable either way,
            but handing a rich record to a crawler we have just asked not to
            amplify would be arguing both sides of the same instruction.

            THERE IS NO RATING IN IT AND THERE WILL NOT BE, even after EN2 ships
            a real total. An endorsement is a person putting their name to a
            product, not a score, and `aggregateRating` is a format designed to
            be believed without being read. See `NO_RATING_NOTE`. */}
        {/* RE1 moved the escaping into `ui/json-ld.tsx`. It was correct here
            and it is the kind of rule that is correct in the file where
            somebody thought about it and forgotten in the five that copy the
            shape — and RE1 added five. */}
        {profile.indexable ? <JsonLd data={listingJsonLd(profile, apex, publicApiBase())} /> : null}
        {/* THE TRAIL, and it is emitted even where the listing is not, which
            is not an inconsistency. `noindex` says do not amplify THIS page;
            a breadcrumb is about the pages ABOVE it, which are indexable and
            whose relationship is true regardless. */}
        <JsonLd data={breadcrumbJsonLd([{ name: "Open builds", path: "/" }, { name: profile.slug, path: `/${profile.slug}` }], apex)} />

        {/* `‹ All builds` (OB5, D4). A cached page cannot know where a
            reader came from, so it goes to the one place every build is
            listed: Open builds at the root. */}
        <AppLink
          href="/"
          className={`tap inline-flex items-center gap-1.5 ${CRUMBS} hover:text-foreground`}
        >
          <Glyph d="M9.5 3.5 5 8l4.5 4.5" />
          All builds
        </AppLink>

        {/* ── the hero card ────────────────────────────────────────── */}
        {/* FR4 — a listing is ONE row, so `u` upvotes it without the reader
            having tabbed to anything first. `data-keyrow` is the same
            attribute the feed's rows wear; the layer counts rows and does not
            care what shape they are. */}
        {/* NO BANNER (openproduct-calm CL3). The 96px band of the tile's hue
            was the loudest thing on the page and said nothing the face beside
            the name does not; the face carries the build's colour alone. */}
        <section id={HERO_ID} data-keyrow aria-label="Listing" className={`${CARD} mt-6 pt-9 max-sm:pt-6`}>
          <div className="flex flex-wrap items-center gap-7 px-9 max-sm:gap-4 max-sm:px-5">
            {/* openproduct-studio OSD3 — the maker's logo when there is one,
                the monogram otherwise; one component on every surface. */}
            <ProductTile
              slug={profile.slug}
              thumbnail={thumbnail}
              size={76}
            />
            {/* FR1 — `max-sm:min-w-0`. A 260px floor plus a 76px tile plus the
                page's own gutters needs 372px, and a phone has 375 with 32 of
                them already spent. The floor is right on a laptop, where it
                stops the title column collapsing next to a wide action row, and
                it is what gave the whole document a sideways scroll at 375. */}
            <div className="min-w-[260px] flex-1 max-sm:min-w-0 max-sm:basis-full">
              <h1 className={PAGE_TITLE}>{profile.slug}</h1>
              {profile.tagline ? (
                <p className="m-0 mt-3 max-w-[60ch] text-[18px] leading-[1.55] text-copy [text-wrap:pretty] max-sm:text-[16px]">
                  {profile.tagline}
                </p>
              ) : null}
              {/* The meta line: category · licence · Repository ↗ · Website ↗ ·
                  followers. Each one is what it was on the old hero — the
                  category is still an ADDRESS (TP0), absent rather than
                  "Other" when the listing has not answered (CT1); the two
                  outbound links still carry `noreferrer noopener`. */}
              <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[14px] leading-[1.4] text-muted-foreground">
                {profile.category ? (
                  <>
                    <AppLink
                      href={topicPath(profile.category)}
                      className="text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-[3px]"
                    >
                      {labelOf("category", profile.category) ?? profile.category}
                    </AppLink>
                    <Dot />
                  </>
                ) : null}
                {profile.licence ? (
                  <>
                    <span>{profile.licence}</span>
                    <Dot />
                  </>
                ) : null}
                {profile.repoUrl ? (
                  <>
                    <a
                      href={profile.repoUrl}
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <Glyph d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
                      Repository
                    </a>
                    <Dot />
                  </>
                ) : null}
                {profile.liveUrl ? (
                  <>
                    <a
                      href={profile.liveUrl}
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <Glyph d="M9.5 2.5h4v4M13.5 2.5 8 8M12.5 9.5V13a.5.5 0 0 1-.5.5H3.5A.5.5 0 0 1 3 13V4a.5.5 0 0 1 .5-.5H7" />
                      Website
                    </a>
                    <Dot />
                  </>
                ) : null}
                {/* PP1 — the count is the document's own and is the follow's
                    only public face — nothing lists followers, here as
                    anywhere (FL0, WC2-7). */}
                <span title={FOLLOWER_COUNT_TITLE}>{followerLine(profile.followers)}</span>
              </div>
            </div>
          </div>

          {/* FR1 — the action row wraps, and is allowed to shrink. */}
          <div className="mt-7 flex flex-wrap items-center gap-2 px-9 max-sm:px-5">
            {/* CB3 — the header's ONE action, and which one depends on
                whether there is a door. A header whose main button leads to a
                door that is not there wastes the single action most visitors
                take; with nothing open, the useful offer is the conversation.
                A plain fragment, which works with no JavaScript. */}
            <a
              href={primary.kind === "offer" ? "#people-wanted" : "#discussion"}
              className={`tap ${BTN_PRIMARY}`}
            >
              {primary.label}
            </a>
            {/* XP2 — the same static markup for every visitor at the SERVER
                render, personalised only after hydration by the overlay.

                TWO CONTROLS, SIDE BY SIDE, AND THAT IS THE POINT (OPC-3). The
                gold one is public and has the visitor's name on it; the grey
                one is private and is counted nowhere. The distinction is only
                real if a person can see both options at the moment they
                choose, so they are rendered together and neither is a mode of
                the other.

                THE ENDORSEMENT LIVES ONLY HERE, not on a directory row. A row
                shows a tagline; this page shows the licence, the code, the
                activity and the people. The row gets the NUMBER (EN2); the
                act stays where the reading happened. */}
            {/* UV0 — the design's box, and the SAME component the feed row
                draws, in its 36px hero shape. It carries the count: the
                number and the act are one control, so a reader can see what
                pressing it moves. */}
            <VoteBox
              slug={profile.slug}
              count={endorsements ? endorsements.value : null}
              returnTo={`/${profile.slug}`}
              shape="hero"
            />
            {/* PP1 — FOLLOW, the one social object the page lacked (P1·07).
                The same component the topic and maker pages draw. The count
                is on the meta line above rather than beside the button, as
                the design draws it. */}
            <FollowButton
              kind="listing"
              value={profile.slug}
              followers={profile.followers}
              returnTo={`/${profile.slug}`}
              size="hero"
              countHidden
            />
            <SaveControl slug={profile.slug} />
            {/* RE3 — SHARE, AND NOT A WIDGET. The audit measured zero
                third-party requests on this site and named it one of only two
                dimensions the product already wins; every share widget on the
                internet is a script from somebody else's origin that reports
                who looked at the page. This is the browser's own sheet, the
                address, and three ordinary links.

                `null` without a canonical origin, like every absolute URL
                here: sharing a preview host is sharing the wrong page. */}
            {share ? (
              <ShareControl url={share.url} text={share.text} intents={share.intents} />
            ) : null}

            {/* PP4 — the rank marks, every one derived from a board row the
                sweep published and none conferred by a person: `#1 today` by
                OL2's own rule, `#N on 9 Sept` for a podium place after its
                day, `Top of the week` from the weekly leaderboard. On the
                right, as the design's pills. */}
            <div className="ml-auto flex flex-wrap items-center gap-x-3.5 gap-y-1.5 max-sm:ml-0">
              {marks.map((mark) => (
                <AppLink
                  key={mark.kind}
                  href={mark.href}
                  title={mark.title}
                  className="tap inline-flex h-[28px] items-center rounded-full border border-endorse-line bg-endorse-soft px-2.5 text-[13px] font-medium text-endorse-ink no-underline hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {mark.label}
                  {/* OPC-4 — the rule behind the mark, at its own address, for
                      the reader who cannot hover. */}
                  <span className="sr-only"> — how this is ranked: {formulaHref(mark.formula)}</span>
                </AppLink>
              ))}
              {isNew ? <NewPill /> : null}
              {/* The workspace view door (openproduct-reader OPR5, seam S12).
                  A PLAIN ANCHOR to the consent page on THIS origin, rendered
                  on `workspaceRef` alone — present only while the maker's
                  link grant attests a public workspace — so the page stays
                  the same bytes signed in and out (OPC-1/I6) and no listing
                  without a door shows one. */}
              {profile.workspaceRef ? (
                <AppLink
                  href={workspaceConsentPath(profile.slug)}
                  className="tap inline-flex h-[28px] items-center rounded-full border border-line px-2.5 text-[13px] font-medium text-foreground no-underline hover:underline"
                >
                  {WORKSPACE_VIEW_LABEL}
                </AppLink>
              ) : null}
              {/* The one green pill: `N people wanted`, and it goes to the
                  section that says where. Green always means "this is open
                  to you" (XP-1). */}
              {openRoles.length > 0 ? (
                <a
                  href="#people-wanted"
                  className="tap inline-flex h-[28px] items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-[13px] font-medium text-success no-underline hover:brightness-[0.97]"
                >
                  {/* OB5 (D4) — the seat, the site's one glyph for an open role. */}
                  <RoleIcon className="h-4 w-4 shrink-0" />
                  {rolesOpenLabel(openRoles.length)}
                </a>
              ) : null}
            </div>
          </div>

          {/* ── the stat strip (OB5) ───────────────────────────────── */}
          {/* HOW IT IS MOVING, FIRST. Four figures moved up from the rail so a
              reader meets them under the name: this week's merged changes,
              this week's counted upvotes, the place on the front page's Most
              active list, and when the last change landed. Each is a glyph
              the rows use, a label, and a value that is a dash — never a zero
              — when it was not observed (OPC-C). The labels carry the moment
              of each read in their title (I9). */}
          <dl
            data-stat-strip
            className="m-0 mt-8 grid grid-cols-4 border-t border-line max-sm:grid-cols-2"
          >
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

          {/* ── the outline (PP2) ──────────────────────────────────── */}
          {/* ANCHORS, NOT ROUTES. The benchmark's product page carries a tab
              strip that routes; this one carries its outline, which scrolls
              the one cacheable document. The list is `listingSections`, the
              same list `j` and `k` walk. Drawn as the design's tab strip
              inside the hero card's bottom edge; the product bar repeats it
              once the hero has scrolled away (`product-bar.tsx`). A scrolling
              row rather than a `<select>`, because a select that navigates on
              change is a change of context on input (WCAG 3.2.2). */}
          <nav
            aria-label={SECTION_NAV_LABEL}
            className="overflow-x-auto border-t border-line px-7 max-sm:px-2"
          >
            <ul className="m-0 flex list-none gap-1 p-0 pb-px">
              {sections.map((section) => (
                <li key={section.id} className="shrink-0">
                  <a
                    href={`#${section.id}`}
                    className={`tap ${TAB} ${TAB_OFF} h-[46px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring`}
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </section>

        {/* The product bar — the hero's name, outline and one action, pinned
            under the shell's bar once the hero has scrolled out of view. */}
        <ProductBar
          slug={profile.slug}
          // openproduct-studio OSD3 — the tile is rendered HERE, on the
          // server, and handed to the client island as a node: the island
          // reads no data, and `ProductTile` stays a server component.
          tile={<ProductTile slug={profile.slug} thumbnail={thumbnail} size={32} />}
          tagline={profile.tagline}
          sections={sections}
          heroId={HERO_ID}
          primary={{ href: primary.kind === "offer" ? "#people-wanted" : "#discussion", label: primary.label }}
        />

        {/* ── the two columns ──────────────────────────────────────── */}
        <div className={TWO_COL}>
          {/* THE TRACK IS minmax(0,1fr), NOT THE IMPLICIT `auto` (openproduct-studio
              OSD1). An implicit column's minimum is its items' min-content,
              and the gallery strip's min-content is every thumbnail side by
              side — `overflow-x-auto` on the strip does not lower it. With
              four images the column grew to 1389px inside a 790px track and
              the About card ran under the sidebar. */}
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
            {/* THE DESIGN HAS NO TABS. One column a reader scrolls, and each
                section carries a heading with an id, so the page has an
                outline — which is what a long document needs and a tab strip
                cannot give it. */}
            <section
              id="about"
              aria-labelledby="about-heading"
              className={SECTION_CARD}
              {...{ [SECTION_ATTRIBUTE]: true }}
            >
              <h2 id="about-heading" tabIndex={-1} className={`${H2_SECTION} outline-none`}>
                About
              </h2>
              {/* MD2 — THE PICTURES, where the design draws a gallery above
                  the pitch: the maker's hero and gallery in a hairline frame,
                  the automated capture in a dashed one with its date — and
                  NOTHING when there are no rows. Never a generated image,
                  never a stock one. The monogram in the hero is the stand-in
                  and it says so (VC4). */}
              <MediaPanel media={profile.media} apiBase={publicApiBase()} now={new Date(now)} />
              {profile.pitch ? (
                // The maintainer's own words, rendered as plain text in
                // visibly their voice. Deliberately NOT markdown-to-HTML:
                // this string comes from a form and ends up on a page anyone
                // can read, and an HTML-rendering pitch is an injection
                // surface the epic has no reason to open.
                <p className={`m-0 mt-4 whitespace-pre-wrap ${PROSE}`}>
                  {profile.pitch}
                </p>
              ) : (
                <p className="m-0 mt-4 max-w-[68ch] text-[16px] leading-[1.65] text-muted-foreground">
                  No pitch has been published for this product yet.
                </p>
              )}

              {/* PV2 — HOW TO GET IT, immediately after what it is, inside the
                  About card as the design draws it: a mono box with Copy.

                  ABSENT WHEN THERE IS NONE, never an empty box with a
                  placeholder. A listing without an install line is a listing
                  whose maintainers have not given one — a plaque saying "no
                  install command" is a claim about a product this page has not
                  measured, and OPC-C's rule is that a panel whose data does not
                  exist renders absent rather than as a zero. */}
              {profile.installLine ? (
                <div id="install" aria-labelledby="install-heading" className="mt-5 border-t border-line pt-4">
                  <h3
                    id="install-heading"
                    className="m-0 text-[13px] font-medium tracking-[0.01em] text-muted-foreground"
                  >
                    {INSTALL_HEADING}
                  </h3>
                  <InstallLine command={profile.installLine} />
                </div>
              ) : null}
            </section>

            {/* The design gives this its own card rather than tucking it
                under About, and the difference is not cosmetic: it is the
                section a contributor came for. A reader scanning headings for
                somewhere to help finds one that says so.

                ABSENT WHEN THERE IS NOTHING OPEN, not empty. A heading over
                "nothing right now" is a section whose job is to disappoint;
                the Makers section below already says bug reports and reviews
                are welcome, which is the true and useful version of the same
                thing. */}
            {openRoles.length > 0 ? (
              <section className={SECTION_CARD} id="people-wanted" aria-labelledby="people-wanted-heading">
                <h2 id="people-wanted-heading" className={`${H2_SECTION} flex items-center gap-2`}>
                  <RoleIcon className="h-[17px] w-[17px] shrink-0 text-success" />
                  {BUILD_ROLES_HEADING}
                </h2>
                <ul className="m-0 mt-1 grid list-none p-0">
                  {openRoles.map((role) => (
                    <li key={role.id} className="border-t border-line pb-1 pt-4">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <span className="text-[15px] font-semibold text-foreground">{role.title}</span>
                        {role.commitment ? (
                          <span className="text-[13px] text-muted-foreground">{role.commitment}</span>
                        ) : null}
                      </div>
                      {role.description ? (
                        <p className="m-0 mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.55] text-copy">
                          {role.description}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {/* The apply door (OD4). A LINK, not a form: applying
                            requires sign-in, and `/join/{secret}` is the
                            shipped page that handles that — there is no
                            anonymous write anywhere in this epic. Since OX2
                            the door lives on the CONSOLE origin (seam edge
                            S5). */}
                        {role.joinLinkRef ? (
                          <a
                            href={`${consoleOrigin()}/join/${role.joinLinkRef}?from=openproduct`}
                            className={`tap ${BTN_OUTLINE}`}
                          >
                            Offer to contribute
                          </a>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">
                            Not accepting offers yet.
                          </span>
                        )}
                        {/* CB2's demand line — floored at three by the API,
                            never here. The page renders the sentence the
                            contract chose; it never sees a raw count, because
                            a raw count in the response is a raw count anybody
                            can read (OPC-F). */}
                        {demandLine(role.demand) ? (
                          <span className="text-[13px] text-muted-foreground">
                            {demandLine(role.demand)}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* PV4 — WHAT CHANGED. Below the product and above the
                components, because it is a fact ABOUT the listing rather than
                part of it: a reader who came for the product reads the pitch,
                the install line and the roles first, and a returning reader
                scrolls to this. Absent entirely when there is no earlier
                snapshot — see `changes.tsx`. */}
            <Changes changes={profile.changes} now={now} />

            {/* PP5 — LAUNCHES. Every launch this listing has made, newest
                first, each with where the board put it and how many spoke
                under it — READ from the feed's own rows (OL-2a), so this
                list, the feed and the archive cannot disagree. Absent when
                there is none: a heading over "no launches" is a claim about
                a count. A day the sweep has not ranked says so rather than
                showing a zero (OPC-C). */}
            {profile.launches.length > 0 ? (
              <section
                className={SECTION_CARD}
                id="launches"
                aria-labelledby="launches-heading"
                {...{ [SECTION_ATTRIBUTE]: true }}
              >
                <h2 id="launches-heading" tabIndex={-1} className={`${H2_SECTION} outline-none`}>
                  Launches
                </h2>
                <ul className="m-0 mt-3 list-none p-0">
                  {profile.launches.map((entry) => (
                    <li
                      key={`${entry.day}-${entry.launchedAt}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line py-3 text-[14px]"
                    >
                      <span className="flex min-w-0 items-baseline gap-2 text-foreground">
                        {entry.versionLabel ? (
                          <span className="font-mono text-[13px]">{entry.versionLabel}</span>
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
                      <span className="flex items-baseline gap-4 tabular-nums text-muted-foreground">
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
                        <span>
                          {entry.commentCount} {entry.commentCount === 1 ? "comment" : "comments"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* CP-R3 — a panel only when something is published; none is
                said once, in the *Not yet* line under the discussion. */}
            {components.length > 0 ? (
              <section className={SECTION_CARD} id="components" aria-labelledby="components-heading">
                <h2 id="components-heading" className={H2_SECTION}>
                  Components
                </h2>
                <ul className="m-0 mt-3 list-none p-0">
                  {components.map((component) => (
                    <li
                      key={component.name}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-4 border-t border-line py-[11px]"
                    >
                      <span className="min-w-0 break-words font-mono text-[13.5px] text-foreground">
                        {component.name}
                      </span>
                      {/* The design's third column is a note about the
                          component. The note this app will carry is what the
                          repository says — test counts and last touched —
                          and nothing observes those yet, so the cell is a
                          dash that says which part of the product fills it
                          rather than a sentence somebody typed. */}
                      <span
                        className="font-mono text-[12.5px] text-muted-foreground"
                        {...pendingProps(PENDING.componentTests)}
                      >
                        {DASH}
                      </span>
                      <span className="text-[13px] text-muted-foreground">
                        {component.kind ?? DASH}
                      </span>
                    </li>
                  ))}
                </ul>
                {/* A snapshot is never mistaken for a live view: the publish
                    moment sits under it (OH4, and now OPC-7). Names and kinds
                    come from the workspace's own component manifest at
                    publish; nothing here is typed by hand, and nothing private
                    is carried across. */}
                {publishedOn ? (
                  <p className="m-0 mt-2 text-[12.5px] text-muted-foreground">Snapshot · {publishedOn}</p>
                ) : null}
              </section>
            ) : null}

            {profile.maintainers.length > 0 ? (
              <section
                className={SECTION_CARD}
                id="makers"
                aria-labelledby="makers-heading"
                {...{ [SECTION_ATTRIBUTE]: true }}
              >
                <h2 id="makers-heading" tabIndex={-1} className={`${H2_SECTION} outline-none`}>
                  Makers
                </h2>
                <ul className="m-0 mt-3 list-none p-0">
                  {profile.maintainers.map((maintainer) => (
                    <li
                      key={maintainer.subjectId}
                      className="flex items-center gap-3 border-t border-line py-3"
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[12px] text-copy"
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
                          className="tap-h text-[14.5px] font-semibold text-foreground"
                        />
                        {maintainer.roleLabel ? (
                          <span className="text-[13px] text-muted-foreground">
                            {maintainer.roleLabel}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {/* CG3 — the sentence the roster owes a reader. Every name
                    above is there because its owner put it there; a
                    maintainer can name somebody, and only that person can
                    make it public (OPC-5). Offers are read by these people,
                    and the list is never derived from a workspace roster. */}
              </section>
            ) : null}

            <section
              className={SECTION_CARD}
              id="discussion"
              aria-labelledby="discussion-heading"
              {...{ [SECTION_ATTRIBUTE]: true }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
                <h2 id="discussion-heading" tabIndex={-1} className={`${H2_SECTION} outline-none`}>
                  Discussion{" "}
                  <span className="ml-1 font-normal text-muted-foreground">
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
                  className="tap text-[13.5px] text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-[3px]"
                >
                  Open the {LISTING_FORUM_TITLE.toLowerCase()}
                </AppLink>
              </div>
              {/* DQ0b — the design's comment box FIRST, because it is what a
                  reader of a product page came to the section for: something
                  to say, and what other people said. The titled discussions
                  follow it as what they are — longer conversations somebody
                  chose to name and classify. */}
              <Comments
                slug={profile.slug}
                launch={discussion?.launch ?? null}
              />

              {/* PP0 (WC-6) — ONE CONVERSATION. The second module is gone;
                  what remains is a link list for titled threads that already
                  existed, which renders nothing when there are none. */}
              <EarlierDiscussions threads={discussion?.threads ?? null} />
            </section>

            {/* CP-R3 — WHAT IS NOT HERE YET, said once. Each empty section
                folds into this line rather than taking a panel to say none;
                each keeps its anchor, so an old link to `#makers` still lands
                on the sentence that answers it. Absent when every section
                has something in it. */}
            {notYet.length > 0 ? (
              <p data-not-yet className="m-0 px-2 text-[14px] leading-[1.6] text-muted-foreground">
                Not yet on {profile.slug}:{" "}
                {notYet.map((item, index) => (
                  <span key={item.id} id={item.id} className="scroll-mt-[72px] sm:scroll-mt-[116px]">
                    {index > 0 ? <span className="text-faint"> · </span> : null}
                    {item.label}
                  </span>
                ))}
                .
              </p>
            ) : null}
          </div>

          {/* ── the rail ─────────────────────────────────────────────── */}
          {/* The rail sits under the product bar once that is pinned, so its
              sticky top is the bar's bottom edge rather than the shell's. */}
          <aside className={`${RAIL} lg:top-[88px]`}>
            {/* THE REPOSITORY PANEL. Two halves, drawn apart on purpose: the
                observed frame (PV0) is what was READ from the repository,
                with the moment of the read and every line linking its rule;
                `On openproduct` under it is what happened on this site.
                What is not observed yet is a dash with a reason, never a
                zero (OPC-C, SN-1). */}
            <section
              className={PANEL}
              aria-labelledby={observed.length > 0 ? "observed" : "facts-heading"}
            >
              <ObservedRow signals={observed} now={now} />
              <h3
                id="facts-heading"
                className={
                  observed.length > 0
                    ? "m-0 mt-4 text-[13px] font-medium text-muted-foreground"
                    : H3
                }
              >
                {BUILD_DETAILS_HEADING}
              </h3>
              <div className="mt-1 grid">
                {/* UV1 — WHERE IT PLACED ON THE DAY IT LAUNCHED, and the row
                    is absent when there is nothing to say: no launch, or a
                    day the sweep has not reached. The rank is not
                    unmeasured, it does not exist.

                    "2nd of 11" rather than a bare ordinal, because a
                    position a reader cannot scale is a number they have to
                    take on trust. The day links to its own board, so the
                    claim is checkable in one click (OPC-4).

                    THE ORDER IS THE BOARD'S, read rather than derived, so
                    this page, the feed and the archive cannot disagree
                    about who was first (OL-2a). */}
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
                {/* OB5 — the week's upvotes, the merges and the last touch
                    moved UP, to the stat strip under the name; this list
                    keeps what the maintainers answered and what happened on
                    this site. */}
                <Fact
                  label="Published"
                  value={publishedOn ?? DASH}
                  title={publishedOn ? "first listed" : "not published yet"}
                />
                {/* PV0 MOVED THE LICENCE OUT OF THIS LIST. It sat here beside
                    Category and Hosting — which a maintainer chose — and a
                    page that renders "what we read" and "what they answered"
                    the same way is a page saying they are equally its word
                    for it. The observed frame above is where it lives now. */}
                {/* CT1 — the assigned facets. Absent, not "Other", when the
                    listing has not answered: a default bucket would put it in
                    a facet its maintainers did not choose. */}
                {profile.category ? (
                  <Fact
                    label="Category"
                    value={labelOf("category", profile.category) ?? profile.category}
                    href={topicPath(profile.category)}
                  />
                ) : null}
                {profile.hosting ? (
                  <Fact
                    label="Hosting"
                    value={labelOf("hosting", profile.hosting) ?? profile.hosting}
                  />
                ) : null}
                {/* PP3 — pricing, authored, and the hover says so (WC-3). The
                    link is the filter page: the same list every other listing
                    that answered this way is on. */}
                {profile.pricing ? (
                  <Fact
                    label="Pricing"
                    value={labelOf("pricing", profile.pricing) ?? profile.pricing}
                    href={pricingPath(profile.pricing)}
                    title={PRICING_PROVENANCE_NOTE}
                  />
                ) : null}
                {/* CB2 — the summary over the whole listing, DERIVED FROM
                    WHAT THE CARDS ALREADY SAY, never from a separate total
                    (OPC-F). */}
                <Fact label="Taking offers" value={offersSummary(openRoles)} />
              </div>
              {/* OPC-4 — the count in the vote box is discounted, and a
                  number that decides what a reader sees owes them a sentence
                  at an address. The moment it was read rides beside it (I9). */}
              {/* PV3 — THE CLEAN-VOTE MARK, and the note renders in both
                  states: beside the mark it explains why most listings lack
                  one, and in place of the mark it says the same thing. A
                  reader who is not told supplies their own explanation for
                  an absence, and the one they supply is the accusation the
                  floor was spent to avoid. */}
              {profile.cleanVotes ? (
                <p className="m-0 mt-3 flex flex-wrap items-baseline gap-x-1.5 border-t border-line pt-3 text-[12px] leading-[1.5] text-muted-foreground">
                  <span
                    title={CLEAN_VOTE_TITLE}
                    className="rounded-[5px] border border-border px-1.5 py-px font-medium text-foreground"
                  >
                    {CLEAN_VOTE_LABEL}
                  </span>
                </p>
              ) : null}
            </section>

            {/* PP6 — LAUNCH HEALTH (PV1 carried): five observed facts, a
                checklist and no number. After the repository panel because
                it is read from the same repository read, and drawn as its
                own panel because it answers a different question — "is this
                product in a state to try" rather than "what is it". */}
            <LaunchHealth items={launchHealth(profile, new Date(now))} now={now} />

            {/* `Built with`, ITS OWN PANEL: a stack is the first thing a
                contributor scans a listing for. Same words the directory's
                rows carry, as the design's mono chips. */}
            <section className={PANEL} aria-labelledby="stack-heading">
              <h3 id="stack-heading" className={H3}>
                Built with
              </h3>
              {profile.stack.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {profile.stack.map((entry) => (
                    <span
                      key={entry}
                      className="inline-flex h-[26px] items-center rounded-[7px] bg-secondary px-[9px] font-mono text-[12px] text-copy"
                    >
                      {entry}
                    </span>
                  ))}
                </div>
              ) : (
                // NOT "none": a listing that has not stated its stack has not
                // stated it, which is different from being built with nothing.
                <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-muted-foreground">Stack not stated.</p>
              )}
            </section>

            {/* `IN COLLECTIONS` IS ABSENT, DELIBERATELY: nothing reads the
                membership rows BY LISTING yet, and a card cannot be rendered
                empty here — "In no collections" is a claim about curation
                this page has not measured (OPC-C). It lands with the read. */}

            {/* PV2 — alternatives, and the reason beside every one.
                REPLACES DS4's "Similar launches". The reason DIFFERS per row
                — and a reason only some readers get is the unexplained list
                this milestone's done-when refuses, so it is rendered where
                everybody can see it. Ties break alphabetically, so the panel
                is the same for every reader and the same tomorrow. */}
            <section
              className={`${PANEL} scroll-mt-[72px] sm:scroll-mt-[88px]`}
              id="alternatives"
              aria-labelledby="alternatives-heading"
              {...{ [SECTION_ATTRIBUTE]: true }}
            >
              <h3 id="alternatives-heading" tabIndex={-1} className={`${H3} outline-none`}>
                Alternatives
              </h3>
              {alternatives === null ? (
                // The catalog could not be read. NOT "nothing overlaps": an
                // empty room and a locked door look nothing alike to a reader,
                // and this panel should not have to guess.
                <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-muted-foreground">
                  Couldn&rsquo;t load these just now.
                </p>
              ) : alternatives.length === 0 ? (
                <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-muted-foreground">
                  None yet.
                </p>
              ) : (
                <>
                  <ul className="m-0 mt-1 grid list-none p-0">
                    {alternatives.map(({ card, reason }) => (
                      <li key={card.slug} data-keyrow className="border-t border-line">
                        <AppLink
                          href={`/${card.slug}`}
                          className="tap flex items-center gap-3 py-2.5 no-underline"
                        >
                          <ProductTile slug={card.slug} thumbnail={card.thumbnail} size={44} />
                          <span className="grid min-w-0 leading-[1.35]">
                            <span className="truncate text-[14px] font-medium text-foreground">{card.slug}</span>
                            {/* THE REASON, not the tagline. A sidebar row has
                                one line to spend and this milestone is about
                                spending it on why the listing is here — the
                                tagline is on the listing's own page, one
                                click away. */}
                            <span className="truncate text-[12.5px] text-muted-foreground">
                              {reason}
                            </span>
                          </span>
                        </AppLink>
                      </li>
                    ))}
                  </ul>
                  {/* OPC-4 — the order resolves to published prose, at an
                      address, from the panel it ordered. The design draws no
                      line for it, so it is there for a screen reader and the
                      keyboard, not the eye. */}
                </>
              )}
            </section>

            {/* RE4 — THE BADGE, AND ITS LINE. An embeddable badge is the
                audit's own nomination for "Product Hunt's single largest
                organic growth loop", and it is worth nothing unless the
                person who would paste it can find the line without reading
                documentation. So the line lives here, on the listing, in the
                design's collapsible panel — for the maintainer rather than
                for the reader who arrived from a search result.

                `null` on a deployment with no canonical origin, for the reason
                every absolute URL in this product is gated: a snippet copied
                off a preview host would put that host in somebody's README
                permanently. */}
            {badgeChoices ? (
              <details className="rounded-[12px] border border-border bg-card px-5 py-4">
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
      <footer className="border-t border-border">
        <div className="mx-auto box-border flex w-full max-w-[1180px] flex-wrap items-center justify-between gap-x-5 gap-y-3 px-7 pb-9 pt-5 text-[13px] text-muted-foreground max-sm:px-4">
          <span>
            Components, openings and licence as observed at publish
            {publishedOn ? ` — ${publishedOn}` : ""}.
          </span>
          <ThemeToggle />
          {apex ? <span className="font-mono">openproduct.live/{profile.slug}</span> : null}
        </div>
      </footer>
    </>
  );
}

/** The hero card's id, which the product bar watches for. */
const HERO_ID = "listing-hero";

/** A facts row: a `--line` rule above, `9px 0`, 13.5px, label muted and the
 *  value tabular in `--foreground`, as the design's rail rows. */
const FACT_ROW = "flex items-baseline justify-between gap-3 border-t border-line py-[9px] text-[13.5px]";

/** The `·` between two entries of the meta line. */
function Dot() {
  return (
    <span aria-hidden="true" className="text-border-strong">
      ·
    </span>
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
 * One row of the facts card, at the design's measurements: a 14px row, the
 * label muted, the value 500 and tabular. `href` makes the value a link where
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
  icon: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  title?: string;
  href?: string;
  /** An unobserved figure's dash says why it is a dash (XP0's convention). */
  pending?: (typeof PENDING)[keyof typeof PENDING];
}) {
  const inert = pending ? pendingProps(pending) : {};
  return (
    // THE TILE'S FIGURES, GROWN (openproduct-calm CL3, CL-R3): a small faint
    // label over a large number, with room around it.
    <div className="border-line px-9 py-6 max-sm:px-5 max-sm:py-4 [&:not(:first-child)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <dt className="text-[13px] text-faint">
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
        className="m-0 mt-2.5 text-[30px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[24px]"
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
  label: React.ReactNode;
  value: React.ReactNode;
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
