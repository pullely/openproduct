// openproduct-worker router (saas-openproduct OD1, extended by OD2).
//
// Two route families that share a database connection and nothing else:
//
//   /internal/openproduct/…        the authenticated maintainer door (OD2)
//   /internal/public/openproduct/… the unauthenticated public read (OD3)
//
// Both enter through api-edge's facade; this worker has no public hostname of
// its own (`workers_dev: false`, asserted in CI).
//
// ALWAYS-ON. The OPENPRODUCT_ENABLED launch flag was retired once prod began
// serving openproduct directly: the routes serve wherever the worker is
// deployed. Going dark is a deploy — delete api-edge's facade branch
// (teardown.md) — and retracting one listing is unpublish + the cache TTL.

import { repoFor } from "./db.js";
import { startRequestScope, type RequestScope } from "./request.js";

import type { ActorContext } from "./authorize.js";
import type { Env } from "./env.js";
import { readOnly } from "./env.js";
import { handleHealth } from "./handlers/health.js";
import {
  handleSweepOutcome,
  handleSweepState,
  type SweepStateHandlerDeps,
} from "./handlers/sweep-state.js";
import {
  handleCreateProfile,
  handleDeleteRoleOpening,
  handleGetProfile,
  handleListProfiles,
  handlePublishProfile,
  handleRecordRepoObservation,
  handleReviewProfile,
  handleSetLinkGrant,
  handleSetMaintainers,
  handleUnpublishProfile,
  handleUpdateProfile,
  handleUpsertRoleOpening,
  type ProfileHandlerDeps,
} from "./handlers/profiles.js";
import {
  handleAddMedia,
  handleListMedia,
  handleRemoveMedia,
  handleReorderGallery,
  handleUpdateMedia,
} from "./handlers/media.js";
import {
  handleListDueCaptures,
  handleRecordCapture,
  type CaptureHandlerDeps,
} from "./handlers/captures.js";
import {
  handleCatalogFacets,
  handleCatalogList,
  handleCatalogProduct,
  type CatalogHandlerDeps,
} from "./handlers/catalog.js";
import {
  handleContributorsDirectory,
  handlePublicContributor,
  handlePublicPeopleIndex,
  handlePublicDirectory,
  handlePublicProfile,
  type PublicHandlerDeps,
} from "./handlers/public.js";
import {
  handleListDueSignals,
  handleRecordObservation,
  type SignalHandlerDeps,
} from "./handlers/signals.js";
import {
  handleListReportQueue,
  handleSubmitReport,
  type ReportHandlerDeps,
} from "./handlers/reports.js";
import {
  handleAppealQueue,
  handleDecideAppeal,
  handleFileAppeal,
  handleMyAppealableActs,
  type AppealHandlerDeps,
} from "./handlers/appeals.js";
import {
  handleTransparency,
  type TransparencyHandlerDeps,
} from "./handlers/transparency.js";
import {
  handleModerationAct,
  handleListFlagQueue,
  handleResolveFlag,
  handleSubjectDossier,
  handleTriageReport,
  type ModerationHandlerDeps,
} from "./handlers/moderation.js";
import {
  handleCreatePost,
  handleCreateComment,
  handleCreateThread,
  handleVotePost,
  handleListProfileThreads,
  handleMaintainThread,
  handlePublicThread,
  handlePublicForum,
  handlePublicThreads,
  type DiscussionHandlerDeps,
} from "./handlers/discussions.js";
import {
  handleRebuildSearchIndex,
  handleSearch,
  type SearchHandlerDeps,
} from "./handlers/search.js";
import {
  handleSnapshotSweep,
  type SnapshotHandlerDeps,
} from "./handlers/snapshots.js";
import { handleRebuildCatalogue, type CatalogueHandlerDeps } from "./handlers/catalogue.js";
import {
  handleAnswerRosterInvitation,
  handleInviteToRoster,
  handleMyRoster,
  handlePublicRoster,
  type RosterHandlerDeps,
} from "./handlers/roster.js";
import {
  handleCancelLaunch,
  handleFireDueLaunches,
  handleListLaunches,
  handleRescheduleLaunch,
  handleScheduleLaunch,
  type LaunchHandlerDeps,
} from "./handlers/launches.js";
import {
  handleDigest,
  handleDigestWeeks,
  type DigestHandlerDeps,
} from "./handlers/digest.js";
import {
  handleBoardDay,
  handleBoardDays,
  handleBoardSweep,
  type BoardHandlerDeps,
} from "./handlers/board.js";
import { handleFeed, type FeedHandlerDeps } from "./handlers/feed.js";
import { handleLeaderboard, type LeaderboardHandlerDeps } from "./handlers/leaderboard.js";
import { handleTopic, handleTopics, type TopicsHandlerDeps } from "./handlers/topics.js";
import { handleSidebar, type SidebarHandlerDeps } from "./handlers/sidebar.js";
import { handleMakerTab, type MakerHandlerDeps } from "./handlers/maker.js";
import { handleInbox, type InboxHandlerDeps } from "./handlers/inbox.js";
import {
  handleSignUp,
  handleVerify,
  handleReadCredential,
  type AuthHandlerDeps,
} from "./handlers/auth.js";
import {
  handleIssueSession,
  handleResolveSession,
  handleRevokeSession,
  type SessionHandlerDeps,
} from "./handlers/sessions.js";
import { handleFollow, type FollowsHandlerDeps } from "./handlers/follows.js";
import {
  handleCollection,
  handleCollectionItems,
  handleCollectionState,
  handleCollectionsIndex,
  handleCreateCollection,
  handleMyCollections,
  type CollectionHandlerDeps,
} from "./handlers/collections.js";
import { handleDefenceSweep, type DefenceHandlerDeps } from "./handlers/defence.js";
import {
  handleDigestDelivered,
  handleDigestPending,
  handleDigestPreference,
  handleDigestQueue,
  type DigestMailHandlerDeps,
} from "./handlers/digest-mail.js";
import {
  handleIntegrityDisclosure,
  handleIntegritySweep,
  type IntegrityHandlerDeps,
} from "./handlers/integrity.js";
import {
  handleGetMe,
  handleGetOverlay,
  handleEndorse,
  handleSetHandle,
  handleWithdrawEndorsement,
  handleSetProfileVisibility,
  handleUpsertMe,
  handleDeleteMe,
  handleExportMe,
  handleListMyApplications,
  handleListMyListings,
  handleListSaved,
  handleSaveProduct,
  handleUnsaveProduct,
  type MeHandlerDeps,
} from "./handlers/me.js";
import {
  handleSeamJoinRequestEvent,
  handleSeamWorkspaceEvent,
  type SeamEventDeps,
  type SeamWorkspaceDeps,
} from "./handlers/seam-events.js";
import { errorResponse, methodNotAllowed, notFound, withTimings } from "./http.js";
import { handleOpenproductWorkspacePurge } from "./handlers/workspace-purge.js";
import {
  parseLaunchPublicId,
  parseOrgPublicId,
  parseProfilePublicId,
  parseRoleOpeningPublicId,
  roleOpeningPublicId,
} from "./ids.js";

const REQUEST_ID_RE = /^[\w-]{1,128}$/;

const ORG_PROFILES_RE = /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles$/;
const ORG_PROFILE_RE = /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)$/;
const PROFILE_PUBLISH_RE = /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/publish$/;
const PROFILE_REPO_OBSERVATION_RE =
  /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/repo-observation$/;
const PROFILE_REVIEW_RE = /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/review$/;
const PROFILE_MAINTAINERS_RE = /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/maintainers$/;
const PROFILE_LINK_GRANT_RE = /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/link-grant$/;
// MD1 — the media rows. The bytes never come here; see handlers/media.ts.
const PROFILE_MEDIA_RE = /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/media$/;
const PROFILE_MEDIA_ITEM_RE =
  /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/media\/([0-9a-fA-F-]{36})$/;
const PROFILE_OPENINGS_RE = /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/role-openings$/;
const PROFILE_OPENING_RE =
  /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/role-openings\/([^/]+)$/;

/** TS0 — the report door and its queue. Live before any public write surface
 *  exists, because OPC-8 makes every later surface wait on it. */
const REPORTS_PATH = "/internal/openproduct/reports";
const REPORT_QUEUE_PATH = "/internal/openproduct/reports/queue";
/** TS3 — the acting half. Under the same path family as the queue it acts on,
 *  so one operator check and one route guard cover both. */
const MODERATION_ACTS_PATH = "/internal/openproduct/reports/acts";
const MODERATION_TRIAGE_PATH = "/internal/openproduct/reports/triage";
const MODERATION_DOSSIER_PATH = "/internal/openproduct/reports/subject";
/** TS4 — what the detectors noticed. Under the same path family, so one
 *  operator check and one route guard cover the queue and the flags both. */
const FLAG_QUEUE_PATH = "/internal/openproduct/reports/flags";
const FLAG_RESOLVE_PATH = "/internal/openproduct/reports/flags/resolve";
/** TS5 — the appeal queue, under `reports` for the same reason the flags are:
 *  one operator check and one route guard cover all three queues, and a
 *  triager has one attention. */
const APPEAL_QUEUE_PATH = "/internal/openproduct/reports/appeals";
const APPEAL_DECIDE_PATH = "/internal/openproduct/reports/appeals/decide";

const ME_PATH = "/internal/openproduct/me";
const ME_APPLICATIONS_PATH = "/internal/openproduct/me/applications";
const ME_LISTINGS_PATH = "/internal/openproduct/me/listings";
const ME_SAVED_PATH = "/internal/openproduct/me/saved";
/** LC4 — the curator's own surface. Under `/me` because a collection belongs
 *  to a PERSON rather than to an org: it is their judgement with their name on
 *  it, and an org-scoped collection would be the unsigned staff-picks page
 *  LC-4 exists to refuse. */
/** LC5 — where somebody stands on the weekly digest. Under `/me` because a
 *  subscription belongs to a PERSON, and opt-in because a broadcast nobody
 *  asked for by acting is a different consent from a reply in their thread. */
const ME_DIGEST_PATH = "/internal/openproduct/me/digest";
/** TS5 — what was done to the caller's listings, and the door to appeal it.
 *  Under `/me` because standing is the whole of its authorization: the read
 *  derives which listings are theirs, and the write re-derives it. */
const ME_APPEALS_PATH = "/internal/openproduct/me/appeals";
const ME_COLLECTIONS_PATH = "/internal/openproduct/me/collections";
const ME_COLLECTION_ITEMS_RE =
  /^\/internal\/openproduct\/me\/collections\/(add|remove|reorder)$/;
const ME_COLLECTION_STATE_PATH = "/internal/openproduct/me/collections/state";
// XP2 — the personalisation overlay. The one per-subject read a public page
// makes, and the highest-frequency route in the product.
const ME_OVERLAY_PATH = "/internal/openproduct/me/overlay";
/** CS3 — everything the subject may take with them, from the registry. */
const ME_EXPORT_PATH = "/internal/openproduct/me/export";
// NF0 — the inbox. GET reads it, PUT moves the read cursor. Under `/me`
// because it is the one openproduct surface that is ABOUT the reader rather
// than about a product, and therefore the one that may resolve an actor.
const ME_INBOX_PATH = "/internal/openproduct/me/notifications";
// CG0/CG1 — the two acts that bring a public profile into existence: an
// address, and the decision to use it.
const ME_HANDLE_PATH = "/internal/openproduct/me/handle";
const ME_PROFILE_VISIBILITY_PATH = "/internal/openproduct/me/profile-visibility";
// EN1 — the PUBLIC act. Its own path, over its own table, beside but never
// merged with `/me/saved`, which is the private one (OPC-3).
const ME_ENDORSEMENTS_PATH = "/internal/openproduct/me/endorsements";
/** FL0 — one follow, addressed by kind and value. The TARGET IS IN THE PATH
 *  for the reason EN1's slug moved there: the gateway bounds a write per
 *  target, and a target it could only learn by buffering a body is a target it
 *  cannot bound. */
const ME_FOLLOW_RE = /^\/internal\/openproduct\/me\/follows\/([a-z]+)\/([^/]+)$/;
const ME_ENDORSEMENT_SLUG_RE = /^\/internal\/openproduct\/me\/endorsements\/([^/]+)$/;
const ME_SAVED_SLUG_RE = /^\/internal\/openproduct\/me\/saved\/([^/]+)$/;

/** S6 — the seam event receivers; reached only through the gateway, which
 *  verified the platform's webhook signature before forwarding. */
/** SN1 — the ingestion door. Reachable only over the gateway's service
 *  binding: this worker has no public hostname, which is the same property
 *  that makes the seam receivers safe. */
const SIGNALS_DUE_PATH = "/internal/openproduct/signals/due";
const SIGNALS_OBSERVATION_PATH = "/internal/openproduct/signals/observation";
// MD4 — observed screenshots: the capture queue and the ledger's door. The
// sweep's, like the signals'; no actor, and no public route maps here.
const CAPTURES_DUE_PATH = "/internal/openproduct/media/captures/due";
const CAPTURES_PATH = "/internal/openproduct/media/captures";

// AC1 — sign-up and verification. NO ACTOR RIDES THESE: somebody signing up
// has no subject yet, which is the whole point of the path. Authenticity comes
// from the gateway, which is the only worker that can reach the platform and
// therefore the only one that can have completed a challenge.
//
// NEITHER TAKES AN ADDRESS. Core has a database binding and no way to reach
// the platform, so the address is typed by a person, forwarded upstream, and
// gone when that request ends. It never arrives here.
const AUTH_SIGN_UP_PATH = "/internal/openproduct/auth/sign-up";
const AUTH_VERIFY_PATH = "/internal/openproduct/auth/verify";
// AC2b — openproduct's own sessions. A POST for the read too, because the
// token is the input and a token in a URL is a token in an access log.
const AUTH_SESSIONS_PATH = "/internal/openproduct/auth/sessions";
const AUTH_SESSIONS_RESOLVE_PATH = "/internal/openproduct/auth/sessions/resolve";
const AUTH_SESSIONS_REVOKE_PATH = "/internal/openproduct/auth/sessions/revoke";
// AC2b — the gateway reads a stored VERIFIER to check a typed password
// against it. The verifier comes out; the password never goes in.
const CREDENTIAL_READ_RE = /^\/internal\/openproduct\/credentials\/([^/]+)$/;
const SEAM_JOIN_REQUEST_PATH = "/internal/openproduct/seam/join-request";
const SEAM_WORKSPACE_EVENT_PATH = "/internal/openproduct/seam/workspace-event";

/** CT2 — the documented catalog API. Same public branch, same guarantees;
 *  what it adds is provenance on every field (OPC-9). */
const CATALOG_LIST_PATH = "/internal/public/openproduct/catalog/products";
const CATALOG_PRODUCT_RE = /^\/internal\/public\/openproduct\/catalog\/products\/([^/]+)$/;
const CATALOG_FACETS_PATH = "/internal/public/openproduct/catalog/facets";
// DS0 — search. On the PUBLIC branch: no actor, nothing personal in the order.
const SEARCH_PATH = "/internal/public/openproduct/search";
// CG1 — a contributor's public page. Its own path segment rather than a bare
// handle, so the two root namespaces stay apart inside the API exactly as
// they do in the URL (OPC-B).
const PUBLIC_PEOPLE_RE = /^\/internal\/public\/openproduct\/people\/([^/]+)$/;
// MP0 — a maker page's tab. `tab/` is a literal segment rather than a bare
// second one, so a handle can never be mistaken for a tab or a tab for a
// handle no matter how either grammar is relaxed later.
const PUBLIC_MAKER_TAB_RE = /^\/internal\/public\/openproduct\/people\/([^/]+)\/tab\/([^/]+)$/;
// DS4 — the ADDRESSES of every public profile, for the sitemap. Handles and
// dates only; the page is where a person's details live.
const PUBLIC_PEOPLE_INDEX_PATH = "/internal/public/openproduct/people";
// CG2 — the directory itself. Its OWN path, not `/people?fields=`: two reads
// with two projections, because one endpoint serving both would end up
// carrying the union of what each needs.
const PUBLIC_CONTRIBUTORS_PATH = "/internal/public/openproduct/contributors";
// CG3 — the public roster: confirmed edges only, and the filter is in SQL.
const PUBLIC_ROSTER_RE = /^\/internal\/public\/openproduct\/projects\/([^/]+)\/people$/;
/** CB1 — the discussion reads, on the PUBLIC branch: no actor, edge-cached,
 *  byte-identical for everyone (OPC-1, I6). */
const PUBLIC_THREADS_RE = /^\/internal\/public\/openproduct\/projects\/([^/]+)\/threads$/;
/** FO1 — the forum index: every titled thread on a listed listing. */
const PUBLIC_FORUM_PATH = "/internal/public/openproduct/threads";
const PUBLIC_THREAD_RE = /^\/internal\/public\/openproduct\/threads\/([^/]+)$/;
/** CB1 — the writes. Signed, always. */
const THREADS_PATH = "/internal/openproduct/threads";
const THREAD_POSTS_RE = /^\/internal\/openproduct\/threads\/([^/]+)\/posts$/;
// DQ0b — a comment on a listing. Its own path rather than `/threads` with an
// absent tag, because it is a different ACT to authorise and to rate-limit:
// the caller names a listing and says something, and core decides whether that
// listing's one comment thread exists yet.
const THREAD_COMMENT_PATH = "/internal/openproduct/comments";
// DQ1 — an upvote on a comment. The POST ID IS IN THE PATH so TS2 can bound
// votes per post without reading a body: a brigade on one comment is the shape
// this defends against, and the target has to be visible to the layer bounding
// it.
const POST_VOTE_RE = /^\/internal\/openproduct\/posts\/([^/]+)\/vote$/;
const THREAD_MANAGE_RE = /^\/internal\/openproduct\/threads\/([^/]+)$/;
// CG3 — the maintainer's door, and the named person's answer.
const ORG_ROSTER_RE = /^\/internal\/openproduct\/listings\/([^/]+)\/people$/;
// LC0 — the launch scheduler's door. Keyed by ORG AND LISTING, unlike the
// roster's slug-keyed one: a launch is an act on a listing you administer
// rather than a fact about a person, and it sits beside `publish` in the same
// authority family (OX4's `publish` action).
const PROFILE_THREADS_RE =
  /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/threads$/;
const PROFILE_LAUNCHES_RE =
  /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/launches$/;
const PROFILE_LAUNCH_RE =
  /^\/internal\/openproduct\/orgs\/([^/]+)\/profiles\/([^/]+)\/launches\/([^/]+)$/;
const ORG_ROSTER_SUBJECT_RE = /^\/internal\/openproduct\/listings\/([^/]+)\/people\/([^/]+)$/;
const ME_ROSTER_PATH = "/internal/openproduct/me/roster";
const ME_ROSTER_ANSWER_RE = /^\/internal\/openproduct\/me\/roster\/([^/]+)\/(confirm|decline|leave)$/;
// DS0 — the rebuild, deliberately NOT public: a read that writes is a read
// somebody can turn into a write amplifier by holding down refresh.
const SEARCH_REBUILD_PATH = "/internal/openproduct/search/rebuild";
// EN3 — the integrity sweep, and the aggregate it produces. Internal for the
// same reason as the rebuild above, and one reason more: this one walks a
// week of endorsements, so a public read that triggered it would be the
// cheapest denial of service in the estate.
const INTEGRITY_SWEEP_PATH = "/internal/openproduct/endorsements/integrity-sweep";
/** PV4 — today's snapshot for every public listing, so next week's diff has a
 *  baseline. Internal for the rebuild's reason: it walks every listing, so a
 *  public read that triggered it would be a cheap way to spend the database. */
const SNAPSHOT_SWEEP_PATH = "/internal/openproduct/snapshots/sweep";
/** OS5 — the catalogue phase: write the table the front page and the API
 *  read. Internal for the same reason; the sweep is its only caller. */
const CATALOGUE_REBUILD_PATH = "/internal/openproduct/catalogue/rebuild";
/** LC0 — the sweep's tick: fire what is due. No actor; the gateway's binding
 *  is the only caller, exactly like the search rebuild above. */
const LAUNCH_FIRE_PATH = "/internal/openproduct/launches/fire";
const INTEGRITY_DISCLOSURE_PATH = "/internal/openproduct/endorsements/integrity-disclosure";
// TS4 — the defence sweep. Internal for all of the reasons above and one
// more: it is the only path on the estate by which automation changes
// anything a reader sees, so it has exactly one caller and that caller is the
// gateway's own binding.
const DEFENCE_SWEEP_PATH = "/internal/openproduct/defence/sweep";
/** RS1 — what the sweep has actually done. A READ beside the four sweeps
 *  above, internal for the same reason and one fewer: it writes nothing, so
 *  the only argument for keeping it internal is that the gateway's /health is
 *  where these three numbers belong and a second address for them is a second
 *  thing to keep true. */
const SWEEP_STATE_PATH = "/internal/openproduct/sweep/state";
/** LI0 (openproduct-worldclass-v2) — the write beside the read: what the
 *  gateway saw of each phase this tick, so /health can say `failed` and why. */
const SWEEP_OUTCOME_PATH = "/internal/openproduct/sweep/outcome";
/** LC3 — the board sweep. Internal beside the other three: it walks a day of
 *  endorsements, and a public read that triggered it would be an aggregate on
 *  the request path, which is exactly what the metrics store exists to end. */
const BOARD_SWEEP_PATH = "/internal/openproduct/launches/board-sweep";
/**
 * LC5 — the weekly queue, and the drain in TWO HALVES across SN1's boundary.
 *
 * Core knows who is waiting and holds the database; the gateway can reach the
 * internet. So core hands out what is pending and is told what went, rather
 * than making the outbound call itself — a worker with no network reaching
 * for the network is the shape SN1 drew this boundary to prevent.
 *
 * Queue and drain stay separate because they fail differently: queueing is
 * idempotent and cheap, delivery can half-succeed.
 */
const DIGEST_QUEUE_PATH = "/internal/openproduct/digest/queue";
const DIGEST_PENDING_PATH = "/internal/openproduct/digest/pending";
const DIGEST_DELIVERED_PATH = "/internal/openproduct/digest/delivered";

// LC1 — the digest. Public, anonymous, and on the SAME public branch as every
// other read: a page whose content depended on who asked could not be one
// document at one address, which is the whole of what makes an archive.
/** TS5 — the transparency record. Public and anonymous like every other read
 *  on this branch, and that is load-bearing rather than incidental: a page
 *  whose numbers could differ by who is looking is not one anybody can
 *  quote. */
const PUBLIC_TRANSPARENCY_PATH = "/internal/public/openproduct/transparency";
const PUBLIC_DIGEST_WEEKS_PATH = "/internal/public/openproduct/digest";
const PUBLIC_DIGEST_RE = /^\/internal\/public\/openproduct\/digest\/([^/]+)$/;
// OL2 — the launch feed, the front page. Public and anonymous for the reason
// the board is, and it IS the board underneath: a week of its days, grouped.
// Ahead of the board's paths in this file only because it is the one every
// visitor hits first.
const PUBLIC_FEED_PATH = "/internal/public/openproduct/feed";
const PUBLIC_LEADERBOARD_PATH = "/internal/public/openproduct/leaderboard";
const PUBLIC_TOPICS_PATH = "/internal/public/openproduct/topics";
const PUBLIC_SIDEBAR_PATH = "/internal/public/openproduct/sidebar";
const PUBLIC_TOPIC_RE = /^\/internal\/public\/openproduct\/topics\/([^/]+)$/;

// LC3 — the board. Public and anonymous like the digest, and for the same
// reason: the order is the same for every reader, which is the only thing
// that lets it be one cacheable document (OPC-1).
const PUBLIC_BOARD_DAYS_PATH = "/internal/public/openproduct/launches";
const PUBLIC_BOARD_RE = /^\/internal\/public\/openproduct\/launches\/([^/]+)$/;
// LC4 — collections. Public and anonymous like the board and the digest: a
// collection is one document, identical for everybody, which is what lets it
// be cached and what makes it quotable. The curator sees the same page their
// readers do.
const PUBLIC_COLLECTIONS_PATH = "/internal/public/openproduct/collections";
const PUBLIC_COLLECTION_RE = /^\/internal\/public\/openproduct\/collections\/([^/]+)$/;

const PUBLIC_DIRECTORY_PATH = "/internal/public/openproduct/projects";
const PUBLIC_PROFILE_RE = /^\/internal\/public\/openproduct\/projects\/([^/]+)$/;

function resolveRequestId(request: Request): string {
  const header = request.headers.get("x-request-id");
  if (header && REQUEST_ID_RE.test(header)) return header;
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/**
 * The actor api-edge resolved. This worker never resolves one itself — it has
 * no `IDENTITY_WORKER` binding and never will (design.md §3). The headers are
 * trustworthy for the same reason every other internal worker trusts them:
 * they arrive over a service binding, and api-edge strips client-supplied
 * `x-actor-*` before forwarding.
 */
function resolveActor(request: Request): ActorContext | null {
  const subjectId = request.headers.get("x-actor-subject-id");
  const subjectType = request.headers.get("x-actor-subject-type");
  if (!subjectId || !subjectType) return null;
  return { subjectId, subjectType };
}

export async function route(
  request: Request,
  env: Env,
  injected?: ProfileHandlerDeps,
  injectedPublic?: PublicHandlerDeps,
  /**
   * LAST, and optional, so every existing caller — including several hundred
   * lines of tests that pass injected deps positionally — keeps working
   * unchanged. Present, the request's clients are closed after the response
   * goes out; absent, they are closed before it returns (OPP10).
   */
  ctx?: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
  const url = new URL(request.url);
  const requestId = resolveRequestId(request);
  const startedAt = Date.now();
  // FIRST LINE, and that is the point — see `timing.ts`. PERF4 started this
  // clock inside the handler and lost the phase that turned out to be most of
  // the request.
  const scope = startRequestScope();
  let response: Response;

  try {
    response = await dispatch(request, url, env, requestId, scope, injected, injectedPublic);
  } catch (error) {
    // The one line that says WHY a request became a 500. The request line
    // below records that it did; without this, a failed write (a constraint,
    // a column, a connection) leaves nothing an operator can act on.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "unhandled",
        method: request.method,
        path: url.pathname,
        requestId,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        stack: error instanceof Error ? (error.stack ?? null) : null,
      }),
    );
    response = errorResponse("internal_error", "Internal error", 500, requestId);
  }

  // eslint-disable-next-line no-console -- structured request line for prod observability
  console.log(
    JSON.stringify({
      level: "info",
      msg: "request",
      method: request.method,
      path: url.pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
      requestId,
    }),
  );
  // OPP6 — the header `http.ts` has been able to render since OX6a and that
  // nothing asked it for. The ROUTE rather than the URL: a path carries slugs
  // and handles, and a per-request label with a tenant's identifier in it is
  // a metric nobody can aggregate and a log line nobody should have written.
  const timed = withTimings(response, requestId, routeLabel(url.pathname), scope.finish());

  // OPP10 — the close `createSqlExecutor` has always offered and nothing had
  // ever called. AFTER the response, because closing a pooled client costs a
  // round trip of its own and a visitor should not wait for a connection they
  // have finished with.
  //
  // Awaited when there is no `ctx` — a test, or a caller that is not the
  // worker entry — because the alternative is a floating promise that
  // resolves after the isolate has been told the request is over.
  if (ctx) ctx.waitUntil(scope.disposeAll());
  else await scope.disposeAll();

  return timed;
}

/**
 * The pathname with its identifiers replaced by their shape.
 *
 * `/internal/public/openproduct/projects/kettleworks` becomes
 * `/internal/public/openproduct/projects/:slug`, so the timing lines aggregate
 * per ROUTE. Without this every listing is its own metric and the dashboard
 * OPP6 exists to build has one row per product.
 */
export function routeLabel(pathname: string): string {
  return pathname
    .replace(/\/(?:prf|org|prj|usr|sub|thr|pst|inb|rep|apl)_[A-Za-z0-9]+/g, "/:id")
    .replace(/\/\d{4}-w\d{1,2}\b/gi, "/:week")
    .replace(/\/\d{4}-\d{2}-\d{2}\b/g, "/:day")
    .replace(/(\/projects|\/collections|\/topics)\/[^/]+/g, "$1/:slug")
    .replace(/(\/people|\/contributors)\/[^/]+/g, "$1/:handle");
}

async function dispatch(
  request: Request,
  url: URL,
  env: Env,
  requestId: string,
  scope: RequestScope,
  injected?: ProfileHandlerDeps,
  injectedPublic?: PublicHandlerDeps,
): Promise<Response> {
  // Health answers regardless of the flag: "deployed and dark" is a state an
  // operator must be able to observe.
  if (url.pathname === "/health") {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleHealth(env, requestId);
  }

  // The OX-E cutover freeze (CUTOVER-RUNBOOK.md step 1): reads keep serving,
  // every write refuses honestly. Seam deliveries and purges included — both
  // recover by design (S6 reconciliation, orchestrator retry).
  if (readOnly(env) && request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("read_only", "openproduct is briefly read-only for maintenance", 503, requestId);
  }

  // Workspace purge (saas-workspace-deletion WD4b) — deliberately BEFORE the
  // feature flag below.
  //
  // A profile row created while openproduct was enabled still exists after the
  // feature is switched off. If the purge sat behind the flag, a workspace
  // deleted during a dark period would silently keep its row and the deletion
  // certificate would be a lie. Whether the surface is *serving* has nothing to
  // do with whether a deleted workspace's data must go.
  //
  // This route has its own, separate kill switch (WORKSPACE_PURGE_ENABLED),
  // which is what actually gates destruction here.
  if (url.pathname === "/v1/internal/openproduct/workspace-purge") {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleOpenproductWorkspacePurge(request, env, requestId);
  }

  // AC1 — sign-up and verification, beside the seam receivers and for the same
  // reason: no actor rides either. Somebody signing up has no subject yet.
  if (url.pathname === AUTH_SIGN_UP_PATH || url.pathname === AUTH_VERIFY_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const deps: AuthHandlerDeps =
      (injected as unknown as AuthHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as AuthHandlerDeps);
    return url.pathname === AUTH_SIGN_UP_PATH
      ? handleSignUp(env, request, requestId, deps)
      : handleVerify(env, request, requestId, deps);
  }

  // AC2b — the verifier read. No actor: the gateway is asking on behalf of
  // somebody who has not proved anything yet, which is the point.
  const credentialMatch = CREDENTIAL_READ_RE.exec(url.pathname);
  if (credentialMatch) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const deps: AuthHandlerDeps =
      (injected as unknown as AuthHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as AuthHandlerDeps);
    return handleReadCredential(
      env,
      request,
      requestId,
      decodeURIComponent(credentialMatch[1]!),
      deps,
    );
  }

  // AC2b — the session plane, and no actor rides these either: the token IS
  // the thing being asked about, so a resolved actor would be circular.
  if (
    url.pathname === AUTH_SESSIONS_PATH ||
    url.pathname === AUTH_SESSIONS_RESOLVE_PATH ||
    url.pathname === AUTH_SESSIONS_REVOKE_PATH
  ) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const deps: SessionHandlerDeps =
      (injected as unknown as SessionHandlerDeps) ??
      ({
        repo: repoFor(env, scope),
      } as SessionHandlerDeps);
    if (url.pathname === AUTH_SESSIONS_RESOLVE_PATH) {
      return handleResolveSession(env, request, requestId, deps);
    }
    if (url.pathname === AUTH_SESSIONS_REVOKE_PATH) {
      return handleRevokeSession(env, request, requestId, deps);
    }
    return handleIssueSession(env, request, requestId, deps);
  }

  // S6 — the seam event receiver (OX5), before the maintainer family: no
  // actor rides this path. The gateway verified the platform's webhook
  // signature before forwarding, so authenticity is settled upstream; what
  // remains here is the upsert.
  if (url.pathname === SEAM_JOIN_REQUEST_PATH || url.pathname === SEAM_WORKSPACE_EVENT_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const deps: SeamEventDeps & SeamWorkspaceDeps =
      injected ?? { repo: repoFor(env, scope) };
    return url.pathname === SEAM_JOIN_REQUEST_PATH
      ? handleSeamJoinRequestEvent(env, request, requestId, deps)
      : handleSeamWorkspaceEvent(env, request, requestId, deps);
  }

  // SN1 — ingestion. No actor at all: the sweep is not a person, and the
  // binding is the authorization. Before the maintainer family so `signals`
  // never parses as an org segment.
  if (url.pathname === SIGNALS_DUE_PATH || url.pathname === SIGNALS_OBSERVATION_PATH) {
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const deps: SignalHandlerDeps =
      (injected as unknown as SignalHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as SignalHandlerDeps);
    if (url.pathname === SIGNALS_DUE_PATH) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return handleListDueSignals(env, requestId, deps);
    }
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleRecordObservation(env, request, requestId, deps);
  }

  // MD4 — the capture queue and the ledger. Ingestion, like the signals
  // above: no actor, the binding is the authorization, and a page view has
  // no path here (the gateway maps no public route to `media/captures`).
  if (url.pathname === CAPTURES_DUE_PATH || url.pathname === CAPTURES_PATH) {
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const deps: CaptureHandlerDeps =
      (injected as unknown as CaptureHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as CaptureHandlerDeps);
    if (url.pathname === CAPTURES_DUE_PATH) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return handleListDueCaptures(env, requestId, deps);
    }
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleRecordCapture(env, request, requestId, deps);
  }

  // RS1 — the sweep's own liveness, read by the gateway's /health.
  if (url.pathname === SWEEP_STATE_PATH || url.pathname === SWEEP_OUTCOME_PATH) {
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const sweepStateDeps: SweepStateHandlerDeps =
      (injected as unknown as SweepStateHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as SweepStateHandlerDeps);
    if (url.pathname === SWEEP_STATE_PATH) {
      if (request.method !== "GET") return methodNotAllowed(requestId);
      return handleSweepState(env, requestId, sweepStateDeps);
    }
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleSweepOutcome(env, request, requestId, sweepStateDeps);
  }

  // DS0 — the search rebuild. Beside the signals family and for the same
  // reason: it is called by the scheduled sweep, not by a person, and it
  // resolves no actor because there is none to resolve.
  if (url.pathname === SEARCH_REBUILD_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const searchDeps: SearchHandlerDeps =
      (injected as unknown as SearchHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as SearchHandlerDeps);
    return handleRebuildSearchIndex(env, requestId, searchDeps, {
      force: url.searchParams.get("force") === "1",
    });
  }

  // OS5 — the catalogue, materialised. Beside the rebuild it feeds.
  if (url.pathname === CATALOGUE_REBUILD_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const catalogueDeps: CatalogueHandlerDeps =
      (injected as unknown as CatalogueHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as CatalogueHandlerDeps);
    return handleRebuildCatalogue(env, requestId, catalogueDeps);
  }

  // PV4 — today's snapshot for every public listing.
  if (url.pathname === SNAPSHOT_SWEEP_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const snapshotDeps: SnapshotHandlerDeps =
      (injected as unknown as SnapshotHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as SnapshotHandlerDeps);
    return handleSnapshotSweep(env, requestId, snapshotDeps);
  }

  // EN3 — the integrity sweep, and the aggregate it feeds TS5.
  if (url.pathname === INTEGRITY_SWEEP_PATH || url.pathname === INTEGRITY_DISCLOSURE_PATH) {
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const integrityDeps: IntegrityHandlerDeps =
      (injected as unknown as IntegrityHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as IntegrityHandlerDeps);
    return url.pathname === INTEGRITY_SWEEP_PATH
      ? handleIntegritySweep(env, request, requestId, integrityDeps)
      : handleIntegrityDisclosure(env, request, url, requestId, integrityDeps);
  }

  // TS4 — the defence sweep. Beside EN3's because they are the same kind of
  // work: scheduled, actorless, and writing where a public read must not.
  if (url.pathname === DEFENCE_SWEEP_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const defenceDeps: DefenceHandlerDeps =
      (injected as unknown as DefenceHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as DefenceHandlerDeps);
    return handleDefenceSweep(env, request, requestId, defenceDeps);
  }

  // LC5 — queue the week's digest, and hand what is pending to the seam.
  // Internal beside the other scheduled work, and for the same reason: this
  // is work on a schedule rather than a request, with no actor on the path.
  if (
    url.pathname === DIGEST_QUEUE_PATH ||
    url.pathname === DIGEST_PENDING_PATH ||
    url.pathname === DIGEST_DELIVERED_PATH
  ) {
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const mailDeps: DigestMailHandlerDeps =
      (injected as unknown as DigestMailHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as DigestMailHandlerDeps);
    if (url.pathname === DIGEST_QUEUE_PATH) {
      return handleDigestQueue(env, request, requestId, mailDeps);
    }
    if (url.pathname === DIGEST_PENDING_PATH) {
      return handleDigestPending(env, request, requestId, mailDeps);
    }
    return handleDigestDelivered(env, request, requestId, mailDeps);
  }

  // LC3 — rank the boards that can still move. AFTER the launch fire below
  // in the gateway's ordering, because a launch that fires today belongs on
  // today's board and ranking before it fired would leave it off until the
  // next tick.
  if (url.pathname === BOARD_SWEEP_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const boardDeps: BoardHandlerDeps =
      (injected as unknown as BoardHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as BoardHandlerDeps);
    return handleBoardSweep(env, request, requestId, boardDeps);
  }

  // LC0 — fire the launches whose moment has passed. Beside the two sweeps
  // above and for the same reason: it is work on a schedule, not a request,
  // and there is no actor on the path.
  if (url.pathname === LAUNCH_FIRE_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.PLATFORM_DB && !injected) {
      return errorResponse("internal_error", "Service unavailable", 503, requestId);
    }
    const launchDeps: LaunchHandlerDeps =
      (injected as unknown as LaunchHandlerDeps) ??
      ({ repo: repoFor(env, scope) } as LaunchHandlerDeps);
    return handleFireDueLaunches(env, requestId, launchDeps);
  }

  // The contributor surface (openproduct-home OH2): subject-keyed, org-free.
  // Before the maintainer family so /me never parses as an org segment.
  if (url.pathname === ME_PATH || url.pathname.startsWith(`${ME_PATH}/`)) {
    return meRoutes(request, url, env, requestId, scope, injected);
  }

  // The report door (openproduct-commons TS0): subject-keyed and org-free for
  // the same reason /me is — the only authority it uses is "this subject".
  // Before the maintainer family so `reports` never parses as an org segment.
  if (url.pathname === REPORTS_PATH || url.pathname.startsWith(`${REPORTS_PATH}/`)) {
    return reportRoutes(request, url, env, requestId, scope, injected);
  }

  // CB1 — the discussion writes. Subject-keyed and org-free, like /me and the
  // report door: the only authority any of them uses is "this subject" plus,
  // for the maintainer acts, a role on the listing the thread belongs to.
  // Before the maintainer family so `threads` never parses as an org segment.
  if (
    url.pathname === THREADS_PATH ||
    url.pathname === THREAD_COMMENT_PATH ||
    POST_VOTE_RE.test(url.pathname) ||
    THREAD_POSTS_RE.test(url.pathname) ||
    THREAD_MANAGE_RE.test(url.pathname)
  ) {
    return discussionRoutes(request, url, env, requestId, scope, injected);
  }

  if (url.pathname.startsWith("/internal/openproduct/")) {
    return maintainerRoutes(request, url, env, requestId, scope, injected);
  }

  if (url.pathname.startsWith("/internal/public/openproduct/")) {
    return publicRoutes(request, url, env, requestId, scope, injectedPublic ?? injected);
  }

  return notFound(requestId, url.pathname);
}

/**
 * The public read (OD3). NOTE WHAT IS ABSENT: no `resolveActor`, no actor
 * headers read, no policy call, no org scope. There is no principal on this
 * path at all — which is why nothing here can be escalated (design.md §1).
 *
 * It reaches only the repository's `*Public*` methods, and those filter
 * `visibility = 'public'` in SQL, so a bug in a handler cannot surface a draft.
 */
async function publicRoutes(
  request: Request,
  url: URL,
  env: Env,
  requestId: string,
  scope: RequestScope,
  injected?: PublicHandlerDeps,
): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed(requestId);

  if (!env.PLATFORM_DB && !injected) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }

  const deps: PublicHandlerDeps =
    injected ?? { repo: repoFor(env, scope) };

  // CT2's catalog family, before the OD3 paths so `catalog` never parses as
  // a slug. Deps are the same object — one repository, one connection.
  if (url.pathname === CATALOG_FACETS_PATH) {
    // Pure: the taxonomy is a contract constant, so this needs no database
    // and answers even when one is unreachable.
    return handleCatalogFacets(requestId);
  }
  if (url.pathname === CATALOG_LIST_PATH) {
    return handleCatalogList(env, requestId, url, deps as unknown as CatalogHandlerDeps);
  }
  if (url.pathname === SEARCH_PATH) {
    return handleSearch(env, url, requestId, deps as unknown as SearchHandlerDeps);
  }
  if (url.pathname === PUBLIC_FORUM_PATH) {
    return handlePublicForum(env, requestId, url, deps as unknown as DiscussionHandlerDeps);
  }
  const publicThreads = PUBLIC_THREADS_RE.exec(url.pathname);
  if (publicThreads) {
    return handlePublicThreads(
      env,
      requestId,
      decodeURIComponent(publicThreads[1]!),
      url.searchParams.get("tag"),
      deps as unknown as DiscussionHandlerDeps,
    );
  }
  const publicThread = PUBLIC_THREAD_RE.exec(url.pathname);
  if (publicThread) {
    return handlePublicThread(
      env,
      requestId,
      decodeURIComponent(publicThread[1]!),
      deps as unknown as DiscussionHandlerDeps,
    );
  }
  const publicRoster = PUBLIC_ROSTER_RE.exec(url.pathname);
  if (publicRoster) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handlePublicRoster(
      env,
      requestId,
      decodeURIComponent(publicRoster[1]!),
      deps as unknown as RosterHandlerDeps,
    );
  }
  if (url.pathname === PUBLIC_CONTRIBUTORS_PATH) {
    return handleContributorsDirectory(env, url, requestId, deps);
  }
  if (url.pathname === PUBLIC_PEOPLE_INDEX_PATH) {
    return handlePublicPeopleIndex(env, requestId, deps);
  }
  const makerTab = PUBLIC_MAKER_TAB_RE.exec(url.pathname);
  if (makerTab) {
    return handleMakerTab(
      env,
      request,
      requestId,
      decodeURIComponent(makerTab[1]!),
      decodeURIComponent(makerTab[2]!),
      deps as unknown as MakerHandlerDeps,
    );
  }
  const person = PUBLIC_PEOPLE_RE.exec(url.pathname);
  if (person) {
    return handlePublicContributor(env, requestId, decodeURIComponent(person[1]!), deps);
  }
  const catalogProduct = CATALOG_PRODUCT_RE.exec(url.pathname);
  if (catalogProduct) {
    return handleCatalogProduct(
      env,
      requestId,
      catalogProduct[1]!,
      deps as unknown as CatalogHandlerDeps,
      roleOpeningPublicId,
    );
  }

  if (url.pathname === PUBLIC_DIRECTORY_PATH) {
    return handlePublicDirectory(env, requestId, url, deps);
  }

  // TS5 — before the profile matcher, so `transparency` never parses as a slug.
  if (url.pathname === PUBLIC_TRANSPARENCY_PATH) {
    return handleTransparency(env, requestId, deps as unknown as TransparencyHandlerDeps);
  }

  // LC1 — before the profile matcher, so `digest` never parses as a slug.
  if (url.pathname === PUBLIC_DIGEST_WEEKS_PATH) {
    return handleDigestWeeks(env, requestId, deps as unknown as DigestHandlerDeps);
  }
  const digestWeek = PUBLIC_DIGEST_RE.exec(url.pathname);
  if (digestWeek) {
    return handleDigest(
      env,
      requestId,
      decodeURIComponent(digestWeek[1]!),
      deps as unknown as DigestHandlerDeps,
    );
  }

  // LC4 — before the profile matcher, so `collections` never parses as a slug.
  if (url.pathname === PUBLIC_COLLECTIONS_PATH) {
    return handleCollectionsIndex(env, request, requestId, deps as unknown as CollectionHandlerDeps);
  }
  const collection = PUBLIC_COLLECTION_RE.exec(url.pathname);
  if (collection) {
    return handleCollection(
      env,
      request,
      decodeURIComponent(collection[1]!),
      requestId,
      deps as unknown as CollectionHandlerDeps,
    );
  }

  // OL2 — before the profile matcher, so `feed` never parses as a slug.
  if (url.pathname === PUBLIC_FEED_PATH) {
    return handleFeed(env, request, requestId, deps as unknown as FeedHandlerDeps);
  }

  // UV2 — before the profile matcher, so `leaderboard` never parses as a slug.
  if (url.pathname === PUBLIC_LEADERBOARD_PATH) {
    return handleLeaderboard(env, request, requestId, deps as unknown as LeaderboardHandlerDeps);
  }

  // FL1 — before the profile matcher, so `sidebar` never parses as a slug.
  if (url.pathname === PUBLIC_SIDEBAR_PATH) {
    return handleSidebar(env, request, requestId, deps as unknown as SidebarHandlerDeps);
  }

  // TP0 — before the profile matcher, so `topics` never parses as a slug.
  if (url.pathname === PUBLIC_TOPICS_PATH) {
    return handleTopics(env, request, requestId, deps as unknown as TopicsHandlerDeps);
  }
  const topic = PUBLIC_TOPIC_RE.exec(url.pathname);
  if (topic) {
    return handleTopic(
      env,
      request,
      decodeURIComponent(topic[1]!),
      requestId,
      deps as unknown as TopicsHandlerDeps,
    );
  }

  // LC3 — before the profile matcher, so `launches` never parses as a slug.
  if (url.pathname === PUBLIC_BOARD_DAYS_PATH) {
    return handleBoardDays(env, request, requestId, deps as unknown as BoardHandlerDeps);
  }
  const boardDay = PUBLIC_BOARD_RE.exec(url.pathname);
  if (boardDay) {
    return handleBoardDay(
      env,
      request,
      decodeURIComponent(boardDay[1]!),
      requestId,
      deps as unknown as BoardHandlerDeps,
    );
  }

  const profile = PUBLIC_PROFILE_RE.exec(url.pathname);
  if (profile) {
    return handlePublicProfile(env, requestId, profile[1]!, deps, roleOpeningPublicId);
  }

  return notFound(requestId, url.pathname);
}

/**
 * The report door and its queue (openproduct-commons TS0).
 *
 * Live before any public write surface exists, because OPC-8 makes every
 * later surface wait on it — and a control that arrives with the surface it
 * governs has never been exercised when it is first needed.
 *
 * Authorized by the forwarded subject alone, exactly as /me is: TS-1's first
 * layer is standing, so there is no anonymous branch here at all. Anonymous
 * visitors keep the footer report address (OD-C), which reaches a human
 * rather than this queue.
 */
/**
 * CB1's writes. Every one of them is signed — `resolveActor` first, and the
 * handlers refuse a service principal and anybody without a public profile.
 * An anonymous POST never reaches a handler.
 */
async function discussionRoutes(
  request: Request,
  url: URL,
  env: Env,
  requestId: string,
  scope: RequestScope,
  injected?: ProfileHandlerDeps,
): Promise<Response> {
  const actor = resolveActor(request);
  if (!actor) return errorResponse("unauthenticated", "Missing actor context", 401, requestId);

  if (!env.PLATFORM_DB && !injected) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const deps: DiscussionHandlerDeps =
    (injected as unknown as DiscussionHandlerDeps) ??
    ({ repo: repoFor(env, scope) } as DiscussionHandlerDeps);

  if (url.pathname === THREADS_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleCreateThread(env, request, requestId, actor, deps);
  }
  if (url.pathname === THREAD_COMMENT_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleCreateComment(env, request, requestId, actor, deps);
  }
  const postVote = POST_VOTE_RE.exec(url.pathname);
  if (postVote) {
    if (request.method !== "PUT" && request.method !== "DELETE") {
      return methodNotAllowed(requestId);
    }
    return handleVotePost(
      env,
      request,
      requestId,
      decodeURIComponent(postVote[1]!),
      actor,
      deps,
    );
  }
  const posts = THREAD_POSTS_RE.exec(url.pathname);
  if (posts) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleCreatePost(env, request, requestId, decodeURIComponent(posts[1]!), actor, deps);
  }
  const manage = THREAD_MANAGE_RE.exec(url.pathname);
  if (manage) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleMaintainThread(env, request, requestId, decodeURIComponent(manage[1]!), actor, deps);
  }
  return notFound(requestId, url.pathname);
}

async function reportRoutes(
  request: Request,
  url: URL,
  env: Env,
  requestId: string,
  scope: RequestScope,
  injected?: ProfileHandlerDeps,
): Promise<Response> {
  const actor = resolveActor(request);
  if (!actor) return errorResponse("unauthenticated", "Missing actor context", 401, requestId);

  if (!env.PLATFORM_DB && !injected) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  const deps: ReportHandlerDeps =
    (injected as unknown as ReportHandlerDeps) ??
    ({ repo: repoFor(env, scope) } as ReportHandlerDeps);

  if (url.pathname === REPORT_QUEUE_PATH) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleListReportQueue(env, requestId, actor, deps);
  }
  // TS3. Before the bare REPORTS_PATH match below, which is the door anybody
  // signed in may post through — these three are operator-only.
  if (url.pathname === MODERATION_ACTS_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleModerationAct(env, request, requestId, actor, deps as unknown as ModerationHandlerDeps);
  }
  if (url.pathname === MODERATION_TRIAGE_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleTriageReport(env, request, requestId, actor, deps as unknown as ModerationHandlerDeps);
  }
  // TS4 — the flag queue, before the dossier and for the same reason the
  // three above come before REPORTS_PATH: these are operator-only.
  if (url.pathname === FLAG_QUEUE_PATH) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleListFlagQueue(env, requestId, actor, deps as unknown as ModerationHandlerDeps);
  }
  if (url.pathname === FLAG_RESOLVE_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleResolveFlag(env, request, requestId, actor, deps as unknown as ModerationHandlerDeps);
  }
  // TS5 — the appeal queue and its decision, operator-only like the four
  // above. The decide path is matched FIRST so `appeals/decide` never falls
  // through to the queue's own GET.
  if (url.pathname === APPEAL_DECIDE_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleDecideAppeal(env, request, requestId, actor, deps as unknown as AppealHandlerDeps);
  }
  if (url.pathname === APPEAL_QUEUE_PATH) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleAppealQueue(env, requestId, actor, deps as unknown as AppealHandlerDeps);
  }
  if (url.pathname === MODERATION_DOSSIER_PATH) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleSubjectDossier(env, url, requestId, actor, deps as unknown as ModerationHandlerDeps);
  }
  if (url.pathname === REPORTS_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleSubmitReport(env, request, requestId, actor, deps);
  }
  return notFound(requestId, url.pathname);
}

/**
 * The contributor's own routes (openproduct-home OH2). Authorized by the
 * forwarded subject id alone — no org, no policy call: the only authority any
 * of these use is "this subject", which api-edge already established (and
 * scope-checked, OI1) before forwarding.
 */
async function meRoutes(
  request: Request,
  url: URL,
  env: Env,
  requestId: string,
  scope: RequestScope,
  injected?: ProfileHandlerDeps,
): Promise<Response> {
  const actor = resolveActor(request);
  if (!actor) return errorResponse("unauthenticated", "Missing actor context", 401, requestId);

  if (!env.PLATFORM_DB && !injected) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }
  // OH3's live JR read left with the binding (OX5): the status snapshot heals
  // by S6 webhook now, so the contributor surface needs only its repository.
  const deps: MeHandlerDeps =
    injected ?? { repo: repoFor(env, scope) };

  const path = url.pathname;
  if (path === ME_PATH) {
    if (request.method === "GET") return handleGetMe(env, requestId, actor, deps);
    if (request.method === "PUT") return handleUpsertMe(env, request, requestId, actor, deps);
    if (request.method === "DELETE") return handleDeleteMe(env, requestId, actor, deps);
    return methodNotAllowed(requestId);
  }
  if (path === ME_EXPORT_PATH) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleExportMe(env, requestId, actor, deps);
  }
  if (path === ME_OVERLAY_PATH) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleGetOverlay(env, url, requestId, actor, deps);
  }
  if (path === ME_INBOX_PATH) {
    return handleInbox(env, request, requestId, actor, deps as unknown as InboxHandlerDeps);
  }
  if (path === ME_HANDLE_PATH) {
    if (request.method !== "PUT") return methodNotAllowed(requestId);
    return handleSetHandle(env, request, requestId, actor, deps);
  }
  if (path === ME_PROFILE_VISIBILITY_PATH) {
    if (request.method !== "PUT") return methodNotAllowed(requestId);
    return handleSetProfileVisibility(env, request, requestId, actor, deps);
  }
  // CG3 — the named person's own view, and their answer to an invitation.
  // On `/me` rather than under the listing because the authority is "this
  // subject" and nothing else: a person answering an invitation needs no
  // relationship to the listing beyond having been named on it.
  if (path === ME_ROSTER_PATH) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleMyRoster(env, requestId, actor, deps as unknown as RosterHandlerDeps);
  }
  const rosterAnswer = ME_ROSTER_ANSWER_RE.exec(path);
  if (rosterAnswer) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    // `leave` is the person's own word for retiring themselves. The act is
    // the same one a maintainer performs; the URL is the one that reads right
    // to somebody looking at their own page.
    const act = rosterAnswer[2] === "leave" ? "retire" : (rosterAnswer[2] as "confirm" | "decline");
    return handleAnswerRosterInvitation(
      env,
      requestId,
      actor,
      decodeURIComponent(rosterAnswer[1]!),
      act,
      deps as unknown as RosterHandlerDeps,
    );
  }

  const endorsedSlug = ME_ENDORSEMENT_SLUG_RE.exec(path);
  if (endorsedSlug) {
    // TS2 — THE SLUG MOVED FROM THE BODY INTO THE PATH. EN1 shipped
    // `PUT /me/endorsements` with `{slug}` in the body, which was fine until
    // velocity needed a per-LISTING bound: the gateway refuses before core
    // is reached, so it never sees a body, so a target it can only learn by
    // buffering the body is a target it cannot bound. Fifty accounts each
    // politely under their own limit arriving at one listing is exactly the
    // shape the per-target rule exists to slow, and it is unenforceable
    // against a body parameter.
    //
    // Both verbs are now the same shape, which is also just better.
    const slug = decodeURIComponent(endorsedSlug[1]!);
    if (request.method === "PUT") return handleEndorse(env, requestId, actor, slug, deps);
    if (request.method === "DELETE") return handleWithdrawEndorsement(env, requestId, actor, slug, deps);
    return methodNotAllowed(requestId);
  }
  const followTarget = ME_FOLLOW_RE.exec(path);
  if (followTarget) {
    if (request.method !== "PUT" && request.method !== "DELETE") return methodNotAllowed(requestId);
    return handleFollow(
      env,
      request,
      requestId,
      actor,
      followTarget[1]!,
      decodeURIComponent(followTarget[2]!),
      deps as unknown as FollowsHandlerDeps,
    );
  }
  if (path === ME_ENDORSEMENTS_PATH) {
    // The COLLECTION has no verbs: an endorsement is always about one
    // listing, so there is nothing to do here that is not done above.
    return methodNotAllowed(requestId);
  }
  if (path === ME_APPLICATIONS_PATH) {
    // POST retired at OX5b — the S6 webhook is the sole record path.
    if (request.method === "GET") return handleListMyApplications(env, requestId, actor, deps);
    return methodNotAllowed(requestId);
  }
  if (path === ME_LISTINGS_PATH) {
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleListMyListings(env, requestId, actor, deps);
  }
  if (path === ME_SAVED_PATH) {
    if (request.method === "GET") return handleListSaved(env, requestId, actor, deps);
    if (request.method === "PUT") return handleSaveProduct(env, request, requestId, actor, deps);
    return methodNotAllowed(requestId);
  }
  // TS5 — what was done to their listings, and the appeal against one.
  if (path === ME_APPEALS_PATH) {
    if (request.method === "GET") {
      return handleMyAppealableActs(env, requestId, actor, deps as unknown as AppealHandlerDeps);
    }
    if (request.method === "POST") {
      return handleFileAppeal(env, request, requestId, actor, deps as unknown as AppealHandlerDeps);
    }
    return methodNotAllowed(requestId);
  }
  // LC5 — the digest preference. GET where they stand, PUT to change it.
  if (path === ME_DIGEST_PATH) {
    return handleDigestPreference(env, request, requestId, actor, deps as unknown as DigestMailHandlerDeps);
  }

  // LC4 — the curator's own collections. Before the saved matcher, and each
  // path is exact, so none of them can be read as a saved slug.
  if (path === ME_COLLECTIONS_PATH) {
    if (request.method === "GET") {
      return handleMyCollections(env, request, requestId, actor, deps as unknown as CollectionHandlerDeps);
    }
    if (request.method === "POST") {
      return handleCreateCollection(env, request, requestId, actor, deps as unknown as CollectionHandlerDeps);
    }
    return methodNotAllowed(requestId);
  }
  if (path === ME_COLLECTION_STATE_PATH) {
    return handleCollectionState(env, request, requestId, actor, deps as unknown as CollectionHandlerDeps);
  }
  const collectionItems = ME_COLLECTION_ITEMS_RE.exec(path);
  if (collectionItems) {
    return handleCollectionItems(
      env,
      request,
      collectionItems[1] as "add" | "remove" | "reorder",
      requestId,
      actor,
      deps as unknown as CollectionHandlerDeps,
    );
  }

  const savedSlug = ME_SAVED_SLUG_RE.exec(path);
  if (savedSlug) {
    if (request.method !== "DELETE") return methodNotAllowed(requestId);
    return handleUnsaveProduct(env, requestId, actor, savedSlug[1]!, deps);
  }
  return notFound(requestId, path);
}

async function maintainerRoutes(
  request: Request,
  url: URL,
  env: Env,
  requestId: string,
  scope: RequestScope,
  injected?: ProfileHandlerDeps,
): Promise<Response> {
  const actor = resolveActor(request);
  if (!actor) return errorResponse("unauthenticated", "Missing actor context", 401, requestId);

  if (!env.PLATFORM_DB && !injected) {
    return errorResponse("internal_error", "Service unavailable", 503, requestId);
  }

  // OW4's per-request visibility read left with the binding (OX5): the
  // workspace gate reads the STORED link grant now, so the maintainer door
  // needs only its repository and the audit stream.
  // The audit trail is LOCAL since OX5c (openproduct.audit_log, written by
  // the repository itself) — the platform events repository is gone from
  // this worker entirely.
  const deps: ProfileHandlerDeps =
    injected ?? { repo: repoFor(env, scope) };

  const path = url.pathname;

  // Every route below resolves its org from the URL and authorizes against it.
  // A parse failure is a 404, not a 400: an unparseable org id is
  // indistinguishable from one that does not exist, and saying which is a
  // disclosure.
  // CG3 — the maintainer's roster door, keyed by SLUG rather than by org.
  // The authority is "you maintain this listing" (OX4's table), which is a
  // fact about the listing rather than about a tenant — and routing it under
  // an org would make a cross-org maintainer's own roster unreachable.
  const rosterSubject = ORG_ROSTER_SUBJECT_RE.exec(path);
  if (rosterSubject) {
    if (request.method !== "DELETE") return methodNotAllowed(requestId);
    return handleAnswerRosterInvitation(
      env,
      requestId,
      actor,
      decodeURIComponent(rosterSubject[1]!),
      "retire",
      deps as unknown as RosterHandlerDeps,
      decodeURIComponent(rosterSubject[2]!),
    );
  }
  const rosterCollection = ORG_ROSTER_RE.exec(path);
  if (rosterCollection) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleInviteToRoster(
      env,
      request,
      requestId,
      actor,
      decodeURIComponent(rosterCollection[1]!),
      deps as unknown as RosterHandlerDeps,
    );
  }

  // LC0 — the launch scheduler. Before ORG_PROFILE_RE so `/launches` never
  // parses as a profile id.
  const launchMember = PROFILE_LAUNCH_RE.exec(path);
  if (launchMember) {
    const orgId = parseOrgPublicId(launchMember[1]!);
    const profileId = parseProfilePublicId(launchMember[2]!);
    const launchId = parseLaunchPublicId(launchMember[3]!);
    if (!orgId || !profileId || !launchId) return notFound(requestId, path);
    const launchDeps = deps as unknown as LaunchHandlerDeps;
    if (request.method === "PATCH") {
      return handleRescheduleLaunch(env, request, requestId, actor, profileId, launchId, launchDeps);
    }
    if (request.method === "DELETE") {
      return handleCancelLaunch(env, requestId, actor, profileId, launchId, launchDeps);
    }
    return methodNotAllowed(requestId);
  }

  const profileThreads = PROFILE_THREADS_RE.exec(path);
  if (profileThreads) {
    const orgId = parseOrgPublicId(profileThreads[1]!);
    const profileId = parseProfilePublicId(profileThreads[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method !== "GET") return methodNotAllowed(requestId);
    return handleListProfileThreads(
      env,
      requestId,
      actor,
      profileId,
      deps as unknown as Parameters<typeof handleListProfileThreads>[4],
      orgId,
    );
  }

  const launchCollection = PROFILE_LAUNCHES_RE.exec(path);
  if (launchCollection) {
    const orgId = parseOrgPublicId(launchCollection[1]!);
    const profileId = parseProfilePublicId(launchCollection[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    const launchDeps = deps as unknown as LaunchHandlerDeps;
    if (request.method === "POST") {
      return handleScheduleLaunch(env, request, requestId, actor, profileId, launchDeps);
    }
    if (request.method === "GET") {
      return handleListLaunches(env, requestId, actor, profileId, launchDeps);
    }
    return methodNotAllowed(requestId);
  }

  const collection = ORG_PROFILES_RE.exec(path);
  if (collection) {
    const orgId = parseOrgPublicId(collection[1]!);
    if (!orgId) return notFound(requestId, path);
    if (request.method === "GET") return handleListProfiles(env, requestId, actor, orgId, deps);
    if (request.method === "POST") return handleCreateProfile(env, request, requestId, actor, orgId, deps);
    return methodNotAllowed(requestId);
  }

  const publish = PROFILE_PUBLISH_RE.exec(path);
  if (publish) {
    const orgId = parseOrgPublicId(publish[1]!);
    const profileId = parseProfilePublicId(publish[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method === "POST") return handlePublishProfile(env, request, requestId, actor, orgId, profileId, deps);
    if (request.method === "DELETE") {
      return handleUnpublishProfile(env, requestId, actor, orgId, profileId, deps);
    }
    return methodNotAllowed(requestId);
  }

  const observation = PROFILE_REPO_OBSERVATION_RE.exec(path);
  if (observation) {
    const orgId = parseOrgPublicId(observation[1]!);
    const profileId = parseProfilePublicId(observation[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method !== "PUT") return methodNotAllowed(requestId);
    return handleRecordRepoObservation(env, request, requestId, actor, orgId, profileId, deps);
  }

  const review = PROFILE_REVIEW_RE.exec(path);
  if (review) {
    const orgId = parseOrgPublicId(review[1]!);
    const profileId = parseProfilePublicId(review[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleReviewProfile(env, requestId, actor, orgId, profileId, deps);
  }

  const maintainers = PROFILE_MAINTAINERS_RE.exec(path);
  if (maintainers) {
    const orgId = parseOrgPublicId(maintainers[1]!);
    const profileId = parseProfilePublicId(maintainers[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method !== "PUT") return methodNotAllowed(requestId);
    return handleSetMaintainers(env, request, requestId, actor, orgId, profileId, deps);
  }

  const linkGrant = PROFILE_LINK_GRANT_RE.exec(path);
  if (linkGrant) {
    const orgId = parseOrgPublicId(linkGrant[1]!);
    const profileId = parseProfilePublicId(linkGrant[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method !== "PUT") return methodNotAllowed(requestId);
    return handleSetLinkGrant(env, request, requestId, actor, orgId, profileId, deps);
  }

  const opening = PROFILE_OPENING_RE.exec(path);
  if (opening) {
    const orgId = parseOrgPublicId(opening[1]!);
    const profileId = parseProfilePublicId(opening[2]!);
    const openingId = parseRoleOpeningPublicId(opening[3]!);
    if (!orgId || !profileId || !openingId) return notFound(requestId, path);
    if (request.method === "PUT") {
      return handleUpsertRoleOpening(env, request, requestId, actor, orgId, profileId, openingId, deps);
    }
    if (request.method === "DELETE") {
      return handleDeleteRoleOpening(env, requestId, actor, orgId, profileId, openingId, deps);
    }
    return methodNotAllowed(requestId);
  }

  const openings = PROFILE_OPENINGS_RE.exec(path);
  if (openings) {
    const orgId = parseOrgPublicId(openings[1]!);
    const profileId = parseProfilePublicId(openings[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method !== "POST") return methodNotAllowed(requestId);
    return handleUpsertRoleOpening(env, request, requestId, actor, orgId, profileId, null, deps);
  }

  // MD1 — media rows, before ORG_PROFILE_RE so `/media` never parses as a
  // profile id.
  const mediaItem = PROFILE_MEDIA_ITEM_RE.exec(path);
  if (mediaItem) {
    const orgId = parseOrgPublicId(mediaItem[1]!);
    const profileId = parseProfilePublicId(mediaItem[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method === "PATCH") {
      return handleUpdateMedia(env, request, requestId, actor, orgId, profileId, mediaItem[3]!, deps);
    }
    if (request.method !== "DELETE") return methodNotAllowed(requestId);
    return handleRemoveMedia(env, requestId, actor, orgId, profileId, mediaItem[3]!, deps);
  }
  const mediaCollection = PROFILE_MEDIA_RE.exec(path);
  if (mediaCollection) {
    const orgId = parseOrgPublicId(mediaCollection[1]!);
    const profileId = parseProfilePublicId(mediaCollection[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method === "GET") return handleListMedia(env, requestId, actor, orgId, profileId, deps);
    if (request.method === "POST") {
      return handleAddMedia(env, request, requestId, actor, orgId, profileId, deps);
    }
    if (request.method === "PUT") {
      return handleReorderGallery(env, request, requestId, actor, orgId, profileId, deps);
    }
    return methodNotAllowed(requestId);
  }

  const profile = ORG_PROFILE_RE.exec(path);
  if (profile) {
    const orgId = parseOrgPublicId(profile[1]!);
    const profileId = parseProfilePublicId(profile[2]!);
    if (!orgId || !profileId) return notFound(requestId, path);
    if (request.method === "GET") return handleGetProfile(env, requestId, actor, orgId, profileId, deps);
    if (request.method === "PATCH") {
      return handleUpdateProfile(env, request, requestId, actor, orgId, profileId, deps);
    }
    return methodNotAllowed(requestId);
  }

  return notFound(requestId, path);
}
