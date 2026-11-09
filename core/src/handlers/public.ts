// The public read (saas-openproduct OD3).
//
// The only handlers in this repository that answer a request with no
// principal behind it. What makes that safe is four things, none of which
// lives in this file — which is the point:
//
//   1. No actor is resolved anywhere on this path. api-edge's public branch
//      never calls `resolveActor`, so there is no anonymous principal, no
//      anonymous role, and no anonymous policy decision (design.md §1).
//   2. The repository's `*Public*` methods filter `visibility = 'public'` in
//      SQL. There is no function reachable from here that can return a
//      private row, so a bug in this file cannot leak a draft.
//   3. This isolate holds no binding through which a privileged question
//      could be asked (design.md §3, asserted in CI).
//   4. The response is an AUTHORED projection with a pinned key set, not a
//      filtered internal type (design.md §4).
//
// What this file adds is the fifth: it assembles only from what the projection
// names, and it resolves nothing it cannot resolve safely.

import {
  chooseDemand,
  chooseFreshness,
  diffSnapshots,
  type Change,
  metricState,
  parseFreshnessThreshold,
  openingsFacetValues,
  parseHandle,
  type MetricName,
  type PublicContributor,
  type PublicContributorCard,
  type PublicMetric,
  type PublicLaunchPlacement,
  type PublicLaunchWeek,
  type PublicListingLaunch,
  type PublicProfile,
  buildLeaderboard,
  dayOf,
  leaderboardDays,
  leaderboardToday,
  rankBoard,
  type PublicProfileCard,
  thumbnailOf,
  type MediaThumbnail,
  decodeCursor,
  encodeCursor,
  pageSize,
} from "@openproduct/contracts";
import type {
  OpenproductRepository,
  ProfileRecord,
  PublicContributorRecord,
  ProductMediaRecord,
} from "@openproduct/db";

import { orgPublicId, type Uuid } from "../ids.js";
import { snapshotBaseline, snapshotDay, snapshotFields } from "./snapshots.js";
import { mediaFactOf, thumbnailsForSlugs } from "./media.js";
import { readCardsPage } from "./cards-page.js";

import type { Env } from "../env.js";
import { errorResponse, successResponse, validationError } from "../http.js";

export interface PublicHandlerDeps {
  repo: Pick<
    OpenproductRepository,
    | "listPublicCards"
    | "listPublicCardsPage"
    // OS5 — the materialised catalogue, read first.
    | "listCataloguePage"
    | "getPublicProfile"
    // PV4 — the diff's baseline, one indexed `LIMIT 1` read.
    | "latestSnapshotBefore"
    | "listPublicRoleOpenings"
    | "countOpeningDemand"
    | "listPublicMaintainers"
    // MD2 — the listing's media rows, the public read (listed() listings only).
    | "listPublicMedia"
    | "latestMetrics"
    | "latestMetricsForSlugs"
    // MD3 — the cards' tiles, one read for the directory page.
    | "listPublicMediaForSlugs"
    // CG1 — the contributor page. Same deps object, same repository, same
    // connection: one public branch, not two.
    | "getPublicContributor"
    // FL0 — the follower count on a profile, and the handle→subject
    // translation it needs. The count only; nothing lists followers.
    | "getSubjectsForHandles"
    | "countFollowers"
    // DS4 — the addresses of those pages, for the sitemap.
    | "listPublicContributorHandles"
    // CG2 — the directory those pages are reached from.
    | "listPublicContributorCards"
    // LC2 — the strip's counts.
    | "countPublishedWindows"
    // UV1 — where this listing placed on the day it launched. Two reads, and
    // both are on the DATABASE rather than on the gateway: the product page's
    // read budget counts round trips across the seam, and this costs none.
    | "listLaunchesForProfile"
    | "readBoardRanks"
    // PP4 — the weekly standing: the leaderboard's own read, made only when
    // the launch's day is inside the window.
    | "listFeedLaunches"
  >;
  now?: () => Date;
}

/**
 * Observed numbers, as the surface may render them (openproduct-commons SN2).
 *
 * WITHDRAWN AND UNOBSERVED NEVER REACH THE WIRE. They are dropped here, so a
 * page has no code path that could render one — invariant I9 becomes a
 * property of the projection rather than a rule the renderer has to remember.
 * A consumer asking for a missing metric gets nothing, which is far harder to
 * accidentally print as "0" than a 0 would be.
 */
function metricsOf(
  rows: Array<{ metric: string; window: string; value: number; observedAt: string }>,
  now: number,
): PublicMetric[] {
  const out: PublicMetric[] = [];
  for (const row of rows) {
    const state = metricState(row.metric as MetricName, row.observedAt, now);
    if (state !== "fresh" && state !== "stale") continue;
    out.push({
      key: `${row.metric}.${row.window}`,
      value: row.value,
      observedAt: row.observedAt,
      state,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** A slug arriving from the open internet. Bounded before it reaches SQL. */
const SLUG_RE = /^[A-Za-z0-9-]{1,64}$/;

function cardOf(row: {
  slug: string;
  tagline: string | null;
  stack: string[];
  stackCanonical: string[];
  category: string | null;
  hosting: string | null;
  pricing: string | null;
  licence: string | null;
  roleOpeningCount: number;
  openCommitments: string[];
  hasLiveUrl: boolean;
  indexable: boolean;
  publishedAt: string | null;
}, metrics: PublicMetric[], thumbnail: MediaThumbnail | null): PublicProfileCard {
  // Field by field, from the projection's own list — never by spreading the
  // record. CT1 widens this by four, and each one is a line somebody wrote.
  return {
    slug: row.slug,
    tagline: row.tagline,
    stack: row.stack,
    stackCanonical: row.stackCanonical,
    category: row.category,
    hosting: row.hosting,
    pricing: row.pricing,
    licence: row.licence,
    roleOpeningCount: row.roleOpeningCount,
    // DS1 — DERIVED here rather than on the page, so the API and the website
    // filter by the same values. A facet the machine and the browser disagree
    // about is a facet whose count nobody can check.
    //
    // The authored commitment lines go IN; only what the vocabulary
    // recognises comes out, and a listing with nothing open answers
    // `none-open` rather than nothing (CT-1).
    openingCommitments: [...openingsFacetValues(row.openCommitments)],
    hasLiveUrl: row.hasLiveUrl,
    // TS1 — read, never recomputed.
    indexable: row.indexable,
    publishedAt: row.publishedAt,
    // SN2. Already filtered to what may be rendered — a withdrawn or
    // unobserved metric never reaches this list, so the page has no code
    // path that could print one (I9).
    metrics,
    // MD3 — the tile's picture, or null for the monogram. Never an ordering input.
    thumbnail,
  };
}

/**
 * UV1 — where a listing placed on the day it launched.
 *
 * READ, NEVER DERIVED (OL-2a). The board already computed this order, stored
 * it and published its formula; deriving a second one here would give the
 * estate two answers to "who was first that day", differing whenever they
 * disagreed.
 *
 * THE MOST RECENT LIVE LAUNCH, and only that one. A listing can launch more
 * than once — LC0 made a launch a separate act from a publish precisely so a
 * v2 could have its own day — and a page showing every past placement would
 * be a leaderboard of one product against itself. The current one is the
 * claim worth making; the archive holds the rest.
 *
 * NULL FOR EVERY HONEST ABSENCE: no launch, no live launch, a day the sweep
 * has not reached, or a launch the sweep ranked into a board this listing is
 * somehow not on. None of those is a placement, and none of them is a zero.
 */
export async function placementOf(
  /** ONLY THE TWO READS IT MAKES. Two handlers call this and their dep
   *  objects are different shapes; asking for either one whole would have
   *  coupled the catalog's deps to the website's for no reason. */
  repo: Pick<OpenproductRepository, "listLaunchesForProfile" | "readBoardRanks" | "listFeedLaunches">,
  profileId: string,
  /** PP4 — the clock, for the weekly window. UTC, per OL-2. */
  now: number,
): Promise<PublicLaunchPlacement | null> {
  const launches = await repo.listLaunchesForProfile(profileId as Uuid);
  const live = launches
    .filter((launch) => launch.state === "live" && launch.launchedAt !== null)
    .sort((a, b) => Date.parse(b.launchedAt!) - Date.parse(a.launchedAt!));
  const latest = live[0];
  if (!latest?.launchedAt) return null;

  const day = dayOf(Date.parse(latest.launchedAt)).id;
  const board = rankBoard(
    (await repo.readBoardRanks(day)).map((row) => ({
      launchId: row.launchId,
      slug: row.slug,
      tagline: row.tagline,
      versionLabel: row.versionLabel,
      launchedAt: row.launchedAt,
      counted: row.counted,
      ineligible: row.ineligible,
    })),
  );
  const index = board.findIndex((entry) => entry.launchId === latest.id);
  if (index < 0) return null;

  const placed = board[index]!;
  return {
    day,
    rank: index + 1,
    of: board.length,
    counted: placed.counted,
    ineligible: placed.ineligible,
    versionLabel: latest.versionLabel,
    week: await weekStandingOf(repo, latest.id, day, now),
  };
}

/**
 * PP5 — every launch the listing has made, with where the board put each.
 *
 * ONE READ FOR THE WHOLE HISTORY: the feed's own rows for the launches'
 * days, which carry the rank, the discounted count and the visible-post
 * count the feed and the archive already render, so this list and those
 * pages cannot disagree (OL-2a). A launch the sweep has not reached is on
 * the list with `rank: null` — the launch happened; the board has not said
 * where it placed — and never with a zero (OPC-C).
 *
 * `of` is the count of RANKED launches on that day in the same read, which
 * is what the archive page's ordinal scales against.
 */
export async function launchHistoryOf(
  repo: Pick<OpenproductRepository, "listLaunchesForProfile" | "listFeedLaunches">,
  profileId: string,
): Promise<PublicListingLaunch[]> {
  const launches = (await repo.listLaunchesForProfile(profileId as Uuid))
    .filter((launch) => launch.state === "live" && launch.launchedAt !== null)
    .sort((a, b) => Date.parse(b.launchedAt!) - Date.parse(a.launchedAt!));
  if (launches.length === 0) return [];
  const days = [...new Set(launches.map((launch) => dayOf(Date.parse(launch.launchedAt!)).id))];
  const rows = await repo.listFeedLaunches(days);
  return launches.map((launch) => {
    const day = dayOf(Date.parse(launch.launchedAt!)).id;
    const row = rows.find((r) => r.launchId === launch.id);
    const ranked = row?.rank !== null && row?.rank !== undefined;
    return {
      day,
      launchedAt: launch.launchedAt!,
      versionLabel: launch.versionLabel,
      rank: ranked ? row!.rank : null,
      of: ranked ? rows.filter((r) => r.day === day && r.rank !== null).length : null,
      counted: ranked ? row!.counted : null,
      commentCount: row?.commentCount ?? 0,
    };
  });
}

/**
 * PP4 — where the launch stands on this week's leaderboard.
 *
 * THE LEADERBOARD'S OWN BUILD, over the leaderboard's own read, so this
 * number and the one on `/leaderboard` cannot disagree (OL-2a, again). The
 * makers and comment counts the leaderboard page carries do not enter its
 * order, so the candidates here carry none — the ORDER is the shared thing.
 *
 * ONE READ, AND ONLY WHEN IT CAN MATTER: a launch whose day is outside the
 * seven-day window is not on the leaderboard by definition, and the common
 * case — a listing that launched months ago, or never — costs nothing.
 */
async function weekStandingOf(
  repo: Pick<OpenproductRepository, "listFeedLaunches">,
  launchId: string,
  day: string,
  now: number,
): Promise<PublicLaunchWeek | null> {
  const today = leaderboardToday(now);
  const days = leaderboardDays("week", today);
  if (!days.some((d) => d.id === day)) return null;
  const rows = await repo.listFeedLaunches(days.map((d) => d.id));
  const board = buildLeaderboard(
    "week",
    today,
    rows
      .filter((row) => row.rank !== null)
      .map((row) => ({
        launchId: row.launchId,
        slug: row.slug,
        tagline: row.tagline,
        day: row.day,
        launchedAt: row.launchedAt,
        dayRank: row.rank,
        counted: row.counted,
        commentCount: 0,
        makers: [],
      })),
  );
  const entry = board.entries.find((e) => e.launchId === launchId);
  if (!entry) return null;
  return { rank: entry.rank, of: board.entries.length, from: board.from, to: board.to };
}

/**
 * Assemble the page.
 *
 * Field by field, from the projection's own list — never by spreading the
 * record. A spread would re-derive the public shape from whatever the table
 * happens to hold, which is the denylist failure this epic is built to avoid,
 * and the key-set test would only catch it after someone added a column.
 */
/** Whole days since an ISO instant. The "nobody yet" branch needs it, and a
 *  page computing its own age would be a second rule free to drift. */
function daysSince(iso: string, now: number): number {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? 0 : Math.floor((now - at) / 86_400_000);
}

function profileOf(
  profile: ProfileRecord,
  maintainers: Array<{
    subjectId: string;
    displayName: string | null;
    roleLabel: string | null;
    handle: string | null;
  }>,
  openings: Array<{
    id: string;
    title: string;
    description: string | null;
    commitment: string | null;
    status: "open" | "filled" | "closed";
    joinLinkRef: string | null;
  }>,
  publicRoleOpeningId: (uuid: string) => string,
  metrics: PublicMetric[],
  /**
   * CB2 — raw pending counts, keyed by opening id. FLOORED HERE, in core,
   * before anything crosses the seam: a response carrying `pending: 1` while
   * the page rendered "a few" would have published the exact number to
   * everybody who opened the network tab, which is the whole population that
   * would ever have tried (OPC-F).
   */
  demand: Map<string, { pending: number; openedAt: string }>,
  now: number,
  /** UV1 — absent when there is nothing to say. See `PublicLaunchPlacement`. */
  launch: PublicLaunchPlacement | null,
  /** PV4 — the diff, or `null` when there is no baseline. Never `[]` for the
   *  second case: they are different answers and the page renders them so. */
  changes: Change[] | null,
  /** PP1 — the follower count. Counted, never listed. */
  followers: number,
  /** PP5 — the history, newest first; `[]` when there is none. */
  launches: PublicListingLaunch[],
  /** MD2 — the media rows, already in document order from the repository. */
  media: readonly ProductMediaRecord[],
): PublicProfile {
  return {
    slug: profile.slug,
    // OPR5 (seam S12) — the console address of the PUBLIC workspace the
    // maker attested with the link grant, and nothing without one. The grant
    // is the fact that makes the row's org public; the raw `orgId` itself
    // stays off the wire (the FORBIDDEN list in public-projection.test.ts).
    workspaceRef: profile.linkGrant ? orgPublicId(profile.orgId) : null,
    followers,
    launches,
    // MD2 — each row as MD0's fact: `authored` for the hero and the gallery,
    // `observed` with its moment for a screenshot. ONE function, the same one
    // the catalogue API and the maintainer's own read use, so the three
    // surfaces cannot disagree about what a row is.
    media: media.map(mediaFactOf),
    tagline: profile.tagline,
    pitch: profile.pitchBody,
    pitchDigest: profile.pitchDigest,
    // PV2 — authored, and the page says so. Never derived: see install.ts.
    installLine: profile.installLine,
    // PV3 — the mark. A boolean, and the ONLY thing about the integrity
    // discount that reaches a listing page: no count, no ratio, no reason.
    cleanVotes: profile.cleanVotes,
    // PV4 — the diff, or `null` when there is no baseline. Computed here from
    // one indexed `LIMIT 1` read rather than stored, because unlike PV3's
    // boolean this is a LIST and a denormalised one would drift the first
    // time a snapshot was rewritten.
    changes,
    stack: profile.stack,
    stackCanonical: profile.stackCanonical,
    category: profile.category,
    hosting: profile.hosting,
    pricing: profile.pricing,
    repoUrl: profile.repoUrl,
    liveUrl: profile.liveUrl,
    // What the App observed at publish, not what a maintainer typed (§2.5).
    licence: profile.repoLicence,
    // PV0 — the rest of the observed row, and its moment. `observedAt` is
    // REQUIRED for any of it to render: a signal without the moment it was
    // read is a claim wearing a fact's clothes, so the shape carries them
    // together and the page has nothing to draw without it.
    observedAt: profile.repoCheckedAt,
    language: profile.repoLanguage,
    lastCommitAt: profile.repoPushedAt,
    openIssues: profile.repoOpenIssues,
    publishedAt: profile.publishedAt,
    // TS1 — decided at publish, raised by a review. Read, never recomputed.
    indexable: profile.indexable,
    // OH4 — the snapshot as published, composed literally (pinned entry keys).
    components: profile.components
      ? profile.components.map((c) => ({ name: c.name, kind: c.kind }))
      : null,
    maintainers: maintainers.map((m) => ({
      subjectId: m.subjectId,
      // Maintainer-authored (migration 1170). Null renders as PP's written
      // fallback rather than an id — a visitor never sees a raw subject id.
      displayName: m.displayName,
      roleLabel: m.roleLabel,
      // CG4 — non-null only when the profile it addresses actually resolves,
      // which is the property the page relies on to link or not link (XP-5).
      // The repository applies both gates; nothing here re-decides it.
      handle: m.handle,
    })),
    roleOpenings: openings.map((o) => {
      const raw = demand.get(o.id);
      return {
        id: publicRoleOpeningId(o.id),
        title: o.title,
        description: o.description,
        commitment: o.commitment,
        status: o.status,
        joinLinkRef: o.joinLinkRef,
        demand: chooseDemand({
          pending: raw?.pending ?? 0,
          openedDaysAgo: raw ? daysSince(raw.openedAt, now) : 0,
        }),
      };
    }),
    // SN2 — see cardOf.
    metrics,
    // ABSENT RATHER THAN NULL. A `launch: null` on the wire would be the page
    // saying "we looked and it placed nowhere"; there being no key is the
    // page not making a claim at all (OPC-C).
    ...(launch ? { launch } : {}),
  };
}

export async function handlePublicDirectory(
  _env: Env,
  requestId: string,
  url: URL,
  deps: PublicHandlerDeps,
): Promise<Response> {
  // OS1 — a PAGE of the catalogue, in the published order, by position. The
  // contract bounds the size; the repository bounds it again, so a hostile
  // `limit` never becomes a number the SQL layer has to reason about. A
  // cursor that is not one this directory issued is refused, never served
  // as a first page under a wrong address.
  const rawCursor = url.searchParams.get("cursor");
  const cursor = rawCursor === null ? null : decodeCursor(rawCursor);
  if (rawCursor !== null && cursor === null) {
    return validationError(requestId, { cursor: ["Not a position this directory issued"] });
  }
  const limit = pageSize(url.searchParams.get("limit"));
  const now = (deps.now ?? (() => new Date()))().getTime();
  // OS5 — ONE READ of the materialised catalogue: the cards, their latest
  // observations, their tiles (MD3 — never an ordering input, OPC-4), the
  // strip's census (LC2) from the same instant, and the moment. The live join
  // — one read each of cards, metrics, media and the census — only while the
  // catalogue has never been computed.
  const page = await readCardsPage(deps.repo, { cursor, limit }, now);
  const cards = page.cards;
  const bySlug = page.metrics;
  const mediaBySlug = page.media;
  const windows = page.windows;
  // THE WINDOW IS CHOSEN HERE, NOT ON THE PAGE. The threshold is
  // per-environment configuration (LC-3), and a page computing its own answer
  // would state a rule the estate is not applying — the same failure LC0's
  // scheduler avoided by having the API return the policy it enforces.
  const threshold = parseFreshnessThreshold(_env.OPENPRODUCT_FRESHNESS_THRESHOLD);
  return successResponse(
    {
      projects: cards.map((card) =>
        cardOf(
          card,
          metricsOf(bySlug.get(card.slug.toLowerCase()) ?? bySlug.get(card.slug) ?? [], now),
          thumbnailOf(
            (mediaBySlug.get(card.slug.toLowerCase()) ?? mediaBySlug.get(card.slug) ?? []).map(mediaFactOf),
          ),
        ),
      ),
      // OS1 — the page after this one, or null on the last; and the real
      // count over every listed row, never the page's length.
      next: page.next === null ? null : encodeCursor(page.next),
      total: windows.total,
      // OS5 — the moment the catalogue these rows came from was computed;
      // null on the live join. The page renders it (OPC-7).
      computedAt: page.computedAt,
      freshness: chooseFreshness(windows, threshold),
      // Returned so the page can say WHY it widened without guessing the
      // number it was measured against.
      freshnessThreshold: threshold,
    },
    requestId,
  );
}

export async function handlePublicProfile(
  _env: Env,
  requestId: string,
  slug: string,
  deps: PublicHandlerDeps,
  publicRoleOpeningId: (uuid: string) => string,
): Promise<Response> {
  // A malformed slug 404s exactly like an unknown one. Distinguishing them
  // would answer a question nobody unauthenticated should get an answer to.
  if (!SLUG_RE.test(slug)) return errorResponse("not_found", "Not found", 404, requestId);

  const profile = await deps.repo.getPublicProfile(slug);
  // A PRIVATE profile and a NONEXISTENT one are the same 404, with the same
  // body. Anything else is an existence oracle over every workspace's drafts.
  if (!profile) return errorResponse("not_found", "Not found", 404, requestId);

  // TS3 — A REMOVED LISTING IS NOT A 404. The address resolves, and says what
  // happened to it, because on a crawlable permanent surface silent deletion
  // is indistinguishable from a bug and reads as censorship to the person it
  // happened to (TS-3).
  //
  // The tombstone carries the state and the date and NOTHING ELSE — not the
  // reason, not the actor, not who reported it. A reason is a judgement about
  // a person published at their own address before they have answered it, and
  // a reporter named beside the thing they reported is a reporter who will
  // not report again. TS5 publishes reasons in aggregate, which is where that
  // asymmetry is bearable.
  //
  // It is identical for every viewer, which is what keeps it cacheable like
  // every other public read (OPC-1) and keeps anonymous and signed-in bytes
  // the same (I6).
  //
  // `delisted` falls through DELIBERATELY: it means "not amplified here", not
  // "not shown here", so the page renders in full and the tombstone rides
  // alongside it. Collapsing the two would make every act the maximal one.
  if (profile.moderationState === "removed") {
    return successResponse(
      {
        tombstone: {
          state: profile.moderationState,
          at: profile.moderatedAt ?? profile.updatedAt,
        },
      },
      requestId,
    );
  }

  const at = (deps.now ?? (() => new Date()))();
  const [maintainers, openings, metrics, demand, launch, baseline, followerCounts, launches, media] = await Promise.all([
    deps.repo.listPublicMaintainers(profile.id),
    deps.repo.listPublicRoleOpenings(profile.id),
    deps.repo.latestMetrics(profile.id),
    deps.repo.countOpeningDemand(profile.id),
    // IN THE SAME `Promise.all`, not after it. The placement needs two
    // queries of its own and they are sequential with each other; running the
    // pair beside the other four costs the page nothing it was not already
    // waiting for.
    placementOf(deps.repo, profile.id, at.getTime()),
    // PV4 — the diff's baseline, in the same batch for the same reason: one
    // indexed `LIMIT 1` read that costs the page nothing it was not already
    // waiting on.
    snapshotBaseline(deps.repo, profile.id, snapshotDay(at)),
    // PP1 — the count, in the same round as everything else; never a list.
    deps.repo.countFollowers("listing", [profile.slug]),
    // PP5 — the history, in the same round: one launches read and one feed
    // read, both on the database.
    launchHistoryOf(deps.repo, profile.id),
    // MD2 — the media rows, in the same round. The public read only: a draft's
    // rows stay behind the maintainer door until publish.
    deps.repo.listPublicMedia(profile.id),
  ]);
  const now = at.getTime();

  return successResponse(
    {
      profile: profileOf(
        profile,
        maintainers,
        openings,
        publicRoleOpeningId,
        metricsOf(metrics, now),
        new Map(demand.map((d) => [d.roleOpeningId, { pending: d.pending, openedAt: d.openedAt }])),
        now,
        launch,
        // PV4 — today's side is built by the SAME projection the sweep writes
        // with, so the thing compared and the thing recorded cannot drift.
        diffSnapshots(baseline, {
          takenAt: at.toISOString(),
          fields: snapshotFields(profile, openings.filter((o) => o.status === "open").length),
        }),
        followerCounts.get(profile.slug) ?? 0,
        launches,
        media,
      ),
      // A delisted listing renders in full AND says so. The key is absent
      // rather than null when there is nothing to say, so the visible case is
      // byte-identical to what it was before TS3 existed.
      ...(profile.moderationState === "delisted"
        ? { tombstone: { state: profile.moderationState, at: profile.moderatedAt! } }
        : {}),
    },
    requestId,
  );
}

/**
 * GET /internal/public/openproduct/people/{handle} — a contributor's public
 * page (openproduct-commons CG1).
 *
 * ON THE PUBLIC BRANCH, with everything that implies: no actor is resolved,
 * nothing personal enters it, and the answer is edge-cached and identical for
 * everyone (OPC-1, I6). A profile is a page about a person, not a page for a
 * viewer.
 *
 * NULL IS ONE ANSWER FOR FOUR QUESTIONS, deliberately. No such handle, a
 * released one, a contributor who never opted in, and one whose standing
 * lapsed all 404 identically. Distinguishing them would make this read an
 * oracle for "does this person have an account here", which is a question
 * nobody is entitled to ask of a stranger.
 *
 * ASSEMBLED FIELD BY FIELD from `PUBLIC_CONTRIBUTOR_KEYS`, never spread from
 * the record — the OD3 rule, applied where getting it wrong would publish
 * somebody's private field under their own name.
 */
export async function handlePublicContributor(
  _env: Env,
  requestId: string,
  handle: string,
  deps: {
    repo: Pick<
      OpenproductRepository,
      | "getPublicContributor"
      | "getSubjectsForHandles"
      | "countFollowers"
      // openproduct-studio OSD3 — the named listings' logos.
      | "listPublicMediaForSlugs"
    >;
  },
): Promise<Response> {
  const parsed = parseHandle(handle);
  // A malformed handle 404s rather than 400s: the shape of the string is not
  // information this surface owes anybody either.
  if (!parsed.ok) return errorResponse("not_found", "Not found", 404, requestId);

  const record = await deps.repo.getPublicContributor(parsed.handle);
  if (!record) return errorResponse("not_found", "Not found", 404, requestId);

  // FL0 — the follower COUNT, and only ever the count. The handle resolves to
  // a subject id here because that is what the table stores; the id does not
  // reach the projection, and nothing anywhere answers who the followers are.
  //
  // Resolved AFTER the 404 above rather than beside it, deliberately: a
  // handle that does not resolve to a public profile must not reach the
  // namespace at all, or the two reads together would tell a caller whether
  // an unpublished handle exists.
  const subjects = await deps.repo.getSubjectsForHandles([record.handle]);
  const subjectId = subjects.get(record.handle);
  const followers = subjectId
    ? (await deps.repo.countFollowers("person", [subjectId])).get(subjectId) ?? 0
    : 0;

  const thumbnailFor = await thumbnailsForSlugs(deps.repo, listingSlugsOf(record));
  return successResponse({ contributor: contributorProjection(record, followers, thumbnailFor) }, requestId, 200);
}

/** Every listing a contributor's page names — the slugs its tiles need. */
export function listingSlugsOf(record: PublicContributorRecord): string[] {
  return [...record.maintains, ...record.contributesTo].map((listing) => listing.slug);
}

/**
 * The public projection of a contributor record (CG1, CG4, FL0).
 *
 * EXTRACTED AT MP0 rather than copied, because the maker page now serves the
 * same header from a second endpoint. Two copies of a projection is how a
 * field somebody deliberately kept off one surface arrives on the other.
 */
export function contributorProjection(
  record: PublicContributorRecord,
  followers: number,
  // openproduct-studio OSD3 — each named listing's logo, from ONE batched
  // read the caller made over `listingSlugsOf(record)`.
  thumbnailFor: (slug: string) => MediaThumbnail | null = () => null,
): PublicContributor {
  return {
    handle: record.handle,
    displayName: record.displayName,
    bio: record.bio,
    githubUrl: record.githubUrl,
    siteUrl: record.siteUrl,
    openToProject: record.openToProject,
    publishedAt: record.publishedAt,
    maintains: record.maintains.map((listing) => ({
      slug: listing.slug,
      tagline: listing.tagline,
      thumbnail: thumbnailFor(listing.slug),
    })),
    // CG4 — the listings, not just the count. A stat card saying "3" that a
    // reader cannot expand is a number they have to take on trust; naming
    // them makes it checkable, and it is the same discipline `maintains` has
    // followed since CG1.
    contributesToListings: record.contributesTo.map((listing) => ({
      slug: listing.slug,
      tagline: listing.tagline,
      thumbnail: thumbnailFor(listing.slug),
    })),
    // CG4 — REAL NOW, because CG3 built the edges it counts. Confirmed
    // places on public listings they do not maintain, retired ones included:
    // the work happened whether or not they are still there.
    contributesTo: record.contributesTo.length,
    // FL0 — counted, never listed, and honest at zero: something observes a
    // follow now, so a zero has been measured rather than assumed (OPC-C).
    followers,
    // CG-5 — STILL NULL, and deliberately so. Nothing observes per-person
    // reviews: SN watches repositories, not people. A zero here would be a
    // fabricated claim about somebody's work, which is the one place a
    // made-up number does real harm — so the page renders a dash and the
    // published sentence says why. The rule ships before the number, which
    // is what lets a reader hold us to it when the number arrives.
    reviews: null,
  };
}

/**
 * GET /internal/public/openproduct/people — every public profile's ADDRESS
 * (openproduct-commons DS4).
 *
 * BUILT FOR THE SITEMAP, AND SHAPED BY THAT. It carries handles and dates and
 * nothing else — no names, no bios, no links. That is not an optimisation: a
 * public endpoint that enumerated every contributor's name and biography
 * would be a scrapeable people database assembled from pages people published
 * one at a time, which is a materially different thing from what any of them
 * agreed to. Someone who wants a person's details reads that person's page.
 *
 * IT IS STILL AN ENUMERATION, and that is the honest cost of being crawlable:
 * "every public listing and every public profile is reachable from the
 * sitemap" is DS4's own done-when, and it cannot be true of a document that
 * does not name them. What the shape buys is that the enumeration is of
 * ADDRESSES a crawler was going to fetch anyway, not of contents.
 *
 * THE SAME TWO GATES as the single read, at the repository. A sitemap that
 * advertised a page the single read 404s would be sending crawlers at doors
 * that are not there — and enough of those teaches a crawler to stop
 * trusting the document for the pages that ARE there.
 */
export async function handlePublicPeopleIndex(
  _env: Env,
  requestId: string,
  deps: { repo: Pick<OpenproductRepository, "listPublicContributorHandles"> },
): Promise<Response> {
  const rows = await deps.repo.listPublicContributorHandles();
  // Assembled field by field, like every other public projection (OD3): the
  // record could grow a column tomorrow and this must not carry it by
  // accident.
  const people = rows.map((row) => ({ handle: row.handle, publishedAt: row.publishedAt }));
  return successResponse({ people }, requestId, 200);
}


/**
 * GET /internal/public/openproduct/contributors — the directory (CG2).
 *
 * A SEPARATE PATH FROM `/people`, WHICH IS THE SITEMAP'S INDEX, and the two
 * are deliberately different reads with different projections rather than one
 * read with a `?fields=` parameter. `/people` carries addresses because a
 * sitemap needs addresses; this carries what a card draws because a card
 * draws it. A single endpoint serving both would end up carrying the union,
 * and the union is "every contributor's name, biography and links in one
 * response" — which is a link-harvesting endpoint nobody set out to build.
 *
 * ELIGIBILITY IS THE FEATURE. CG-2 is `[decided]` in the reference design: a
 * person appears here because they are on a listed product, not because they
 * signed up. That bound is what stops this becoming a spam directory, and it
 * lives in the repository's WHERE clause rather than in a filter here — a
 * filter would mean the ineligible rows were fetched, and a row fetched is a
 * row one refactor away from being returned.
 *
 * NOBODY IS RANKED. The order is when each profile became public, newest
 * first. Any order that scored people would be a ranking of people, which
 * this product does not do and has nowhere to publish a formula for (OPC-4).
 */
export async function handleContributorsDirectory(
  _env: Env,
  url: URL,
  requestId: string,
  deps: { repo: Pick<OpenproductRepository, "listPublicContributorCards"> },
): Promise<Response> {
  const requested = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  // The repository clamps too; doing it here as well means a hostile `limit`
  // never becomes a number the SQL layer has to reason about.
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 200) : 100;
  const rows = await deps.repo.listPublicContributorCards(limit);

  // Assembled field by field from the pinned key set (OD3), never spread from
  // the record — on this surface a silent widening is a disclosure about a
  // person, and the card is deliberately a SMALLER shape than the page it
  // links to rather than whatever the record happens to grow.
  const contributors: PublicContributorCard[] = rows.map((row) => ({
    handle: row.handle,
    displayName: row.displayName,
    bio: row.bio,
    openToProject: row.openToProject,
    maintains: row.maintains,
    // CG4 — REAL NOW. Counted, not named: the card carries one list of slugs
    // already, and a second would make a directory of people read as a
    // directory of products. The page names them.
    contributesTo: row.contributesTo,
    launched: row.launched,
  }));

  return successResponse({ contributors }, requestId, 200);
}
