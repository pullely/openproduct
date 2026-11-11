// The openproduct gateway router (openproduct-independence OX3).
//
// The api-edge facade's two doors, re-homed to the product that owns them —
// shape preserved deliberately, because the shape IS the security model:
//
//   /v1/public/openproduct/…              UNAUTHENTICATED. No subject is ever
//                                         resolved: there is no anonymous
//                                         principal, so there is no anonymous
//                                         authority to widen anywhere. 60s
//                                         edge cache (real since OPP4 — see
//                                         `cache.ts`); failure bodies from
//                                         core are never passed through.
//
//   /v1/openproduct/me/…                  AUTHENTICATED (S2): bearer →
//   /v1/organizations/{org}/openproduct/… subject via the platform's public
//                                         identity read, subject headers
//                                         forwarded, core authorizes. The
//                                         maintainer family is transitional —
//                                         it thins at OX4 when authority
//                                         becomes openproduct-local.
//
// What did NOT come along from api-edge, both deliberate: the idempotency
// replay (KV-backed there; the write paths are review-gated and slug-unique,
// and a gateway KV is an OX5-era addition if it earns one — recorded in the
// epic's status doc), and the Durable-Object rate counter (see ratelimit.ts).

import type { WriteAction } from "@openproduct/contracts";

import type { Env } from "./env.js";
import { errorResponse, methodNotAllowed, notFound, resolveRequestId, successResponse } from "./http.js";
import {
  buildInfo,
  buildOpenApiDocument,
  deprecationHeaders,
  ingestionBudget,
  screenshotBudget,
  sweepHealth,
  type ApiDeprecation,
} from "@openproduct/contracts";

import { observeRepo, parseGithubRepo, type RepoObservation } from "./github.js";
import { readSweepState } from "./sweep.js";
import { cacheTagHeader, purgeTags, purgeTagsForWrite } from "./tags.js";
import {
  handleSignUp as handleAuthSignUp,
  handleVerify as handleAuthVerify,
  handleSignIn as handleAuthSignIn,
  handleSignOut as handleAuthSignOut,
} from "./auth.js";
import { resolveSubjectByEmail } from "./auth-seam.js";
import { verifyPassword } from "./password.js";
import { hashPassword } from "./password.js";
import { anonKey, rateLimitGate } from "./ratelimit.js";
import { checkVelocity } from "./velocity.js";
import { verifySeamSignature } from "./seam.js";
import { resolveSubject } from "./subject.js";
import { handleMcp } from "./mcp.js";
import {
  handleMediaServe,
  handleMediaUpload,
  isMediaPath,
  parseUploadFields,
  preflightUpload,
} from "./media.js";
import {
  CATALOG_FACETS_TARGET,
  CATALOG_LIST_TARGET,
  catalogProductTarget,
} from "./targets.js";

const ORG_OPENPRODUCT_RE = /^\/v1\/organizations\/([^/]+)\/openproduct\/profiles(?:\/[^/]+)*$/;
const ME_OPENPRODUCT_RE = /^\/v1\/openproduct\/me(?:\/[^/]+)*$/;
const REPO_CHECK_RE = /^\/v1\/organizations\/([^/]+)\/openproduct\/profiles\/([^/]+)\/repo-check$/;
// MD1 — the upload door. POST is intercepted here (the bytes stay in this
// worker); GET and DELETE on the same collection forward to core like every
// other maintainer route, because they carry no bytes.
const MEDIA_UPLOAD_RE = /^\/v1\/organizations\/([^/]+)\/openproduct\/profiles\/([^/]+)\/media$/;
/** CT2 — the documented catalog API (OPC-9). Anonymous and edge-cached like
 *  every other public read; the only new thing is that a machine can consume
 *  it, which is the whole of the "OpenRouter for products" claim. */
const CATALOG_LIST_PATH = "/v1/products";
const CATALOG_PRODUCT_RE = /^\/v1\/products\/([A-Za-z0-9-]{1,64})$/;
const CATALOG_FACETS_PATH = "/v1/facets";
/** AG1 — the agent surface. One path, one method; see `mcp.ts`. */
const MCP_PATH = "/mcp";
const OPENAPI_PATH = "/v1/openapi.json";
/** DS0 — search. Public, anonymous and edge-cached like every other read here:
 *  the order is a published formula (`search.relevance`) with no personal
 *  input, so one visitor's results are every visitor's results. */
const SEARCH_PATH = "/v1/search";
/**
 * CG1 — a contributor's public page. Anonymous and edge-cached like every
 * other public read: a profile is a page ABOUT a person, not a page FOR a
 * viewer, so one visitor's view is every visitor's.
 *
 * The pattern is the CG0 grammar EXACTLY, lower-case included. The API speaks
 * canonical handles only — matching `/people/Ada` here would give one person
 * two API addresses and two cache entries for one page. The WEBSITE is the
 * forgiving half: it folds what somebody typed and says which URL counts, via
 * `<link rel="canonical">`.
 */
const PUBLIC_PERSON_RE = /^\/v1\/public\/openproduct\/people\/([a-z0-9][a-z0-9-]{0,30}[a-z0-9])$/;

/** MP0 — a maker page's tab. The handle grammar is enforced here as it is for
 *  the bare page, and the TAB is a closed set of three literals: a value that
 *  is not one of them never reaches core, because there is no fourth tab and
 *  no reason to make core answer for one. */
const PUBLIC_MAKER_TAB_RE =
  /^\/v1\/public\/openproduct\/people\/([a-z0-9][a-z0-9-]{0,30}[a-z0-9])\/tab\/(launched|upvoted|comments|history)$/;

/**
 * DS4 — the addresses of every public profile, for the sitemap.
 *
 * A LITERAL PATH, and it must not be reachable by the person pattern: the CG0
 * grammar requires at least two characters, so `/people` cannot be mistaken
 * for a handle — but the ordering below resolves this one FIRST anyway,
 * because relying on a grammar to keep a collection and a member apart is the
 * kind of thing that stops being true when a grammar is relaxed.
 */
const PUBLIC_PEOPLE_INDEX_PATH = "/v1/public/openproduct/people";

/** CG2 — the contributors directory. Anonymous and edge-cached like every
 *  other public read: who is in it does not depend on who is asking. */
const PUBLIC_CONTRIBUTORS_PATH = "/v1/public/openproduct/contributors";

/** CG3 — a listing's roster. Confirmed edges only; the filter is in core's
 *  SQL, so this is a passthrough like every other public read. */
const PUBLIC_ROSTER_RE = /^\/v1\/public\/openproduct\/projects\/([A-Za-z0-9-]{1,64})\/people$/;
/** CB1 — the discussion reads. Public for the same reason every other read
 *  here is: they resolve no actor, nothing about who is asking enters them,
 *  and the answer is identical for everyone (OPC-1, I6). */
const PUBLIC_THREADS_RE = /^\/v1\/public\/openproduct\/projects\/([A-Za-z0-9-]{1,64})\/threads$/;
const PUBLIC_THREAD_RE = /^\/v1\/public\/openproduct\/threads\/([0-9a-fA-F-]{36})$/;
/** CB1 — the writes. Never on the public branch. */
const THREADS_WRITE_RE = /^\/v1\/openproduct\/threads(?:\/[^/]+)*$/;

/** DQ0b — a comment on a listing. Its own path rather than `/threads` with an
 *  absent tag, so it can be rate-limited as the act it is: a reply on a page
 *  where nobody was asked to start a discussion. */
// AC1 — the auth plane. NEITHER PUBLIC NOR AUTHENTICATED, and that is a third
// class this router did not have: somebody signing up has no bearer to present
// (so it is not authenticated) and these are writes that must never be cached
// or fanned out to core's public reads (so they are not public either).
//
// They are dispatched BEFORE both branches, beside the seam receivers, for the
// same reason those are: the ordering is part of the guarantee.
const AUTH_SIGN_UP_PATH = "/v1/openproduct/auth/sign-up";
const AUTH_VERIFY_PATH = "/v1/openproduct/auth/verify";
// AC2b — the design's modal posts here, and the account menu ends a session
// here. Both sit beside sign-up rather than under the authenticated family:
// sign-in has no bearer by definition, and sign-out has one that is about to
// stop meaning anything.
const AUTH_SIGN_IN_PATH = "/v1/openproduct/auth/sign-in";
const AUTH_SIGN_OUT_PATH = "/v1/openproduct/auth/sign-out";

const COMMENT_WRITE_PATH = "/v1/openproduct/comments";

/** DQ1 — an upvote on a comment. The POST ID IS IN THE PATH, which is what
 *  lets a per-post velocity bound exist at all: a brigade on one comment is
 *  the shape this defends against, and this layer never reads a body. */
const POST_VOTE_RE = /^\/v1\/openproduct\/posts\/([0-9a-fA-F-]{36})\/vote$/;

// NF0's inbox needs NO ROUTE OF ITS OWN. `/v1/openproduct/me/notifications`
// already matches `ME_OPENPRODUCT_RE` above, which is the point of that
// pattern: everything about the READER lives under one prefix, is
// authenticated the same way, and is never cached. A constant here would have
// been a second place to keep in step for no gain.

/** CG3 — the maintainer's roster door. On the AUTHENTICATED plane: naming
 *  somebody on a listing is a write about a person, and it needs a subject. */
const LISTING_ROSTER_RE = /^\/v1\/openproduct\/listings\/([A-Za-z0-9-]{1,64})\/people(?:\/[^/]+)?$/;
/**
 * TS3 — the report door and the moderation surface behind it.
 *
 * Org-free for the same reason `/me` is: the only authority any of them uses
 * is "this subject". Whether that subject may act is core's question, asked
 * against the operator allowlist; the gateway's job is to forward, and to put
 * the surface behind TS2's velocity bounds like every other write here.
 */
const REPORTS_RE = /^\/v1\/openproduct\/reports(?:\/[^/]+)*$/;

/** LC1 — the digest, and the index of weeks that held something. Public and
 *  anonymous like every other read here; a settled week is also immutable,
 *  which core says with its own `cache-control` and this layer honours. */
const PUBLIC_DIGEST_INDEX_PATH = "/v1/public/openproduct/digest";
const PUBLIC_DIGEST_RE = /^\/v1\/public\/openproduct\/digest\/(\d{4}-w\d{1,2})$/i;

/** LC3 — the launch board and its archive index. Public and anonymous for the
 *  reason the digest is: the order resolves no actor and is identical for
 *  every reader, which is what lets it be one cacheable document. The day
 *  shape is pinned HERE as well as in the contract, so a malformed day never
 *  reaches core as a slug-shaped string. */
const PUBLIC_BOARD_INDEX_PATH = "/v1/public/openproduct/launches";

/** OL2 — the launch feed, the front page. Public and anonymous for the reason
 *  the board is: it IS the board underneath, a week of its days grouped, and
 *  the order resolves no actor. */
const PUBLIC_FEED_PATH = "/v1/public/openproduct/feed";

/** UV2 — the leaderboard. The query string carries the range, and it is
 *  FORWARDED rather than parsed here: the gateway's job on a public read is to
 *  decide whether the address is public, not to second-guess its parameters.
 *  Core refuses an unknown range with a 400, in one place. */
const PUBLIC_LEADERBOARD_PATH = "/v1/public/openproduct/leaderboard";

/** TP0 — the topic index and one topic. The value shape is pinned HERE as well
 *  as in the contract, so a path segment that could never be a facet value
 *  never reaches core: canonical values are lower-case, digits and dashes, and
 *  anything else is not a topic that exists. */
const PUBLIC_TOPICS_INDEX_PATH = "/v1/public/openproduct/topics";

/** FL1 — the feed's sidebar. A SECOND document beside the feed, so a panel
 *  nobody scrolled to cannot slow the launch board and a sidebar read that
 *  fails cannot take it down. */
const PUBLIC_SIDEBAR_PATH = "/v1/public/openproduct/sidebar";
/** FO1 — the forum index. Public and anonymous; the order and the tag ride
 *  the query to core, which refuses what it does not know. */
const PUBLIC_FORUM_PATH = "/v1/public/openproduct/threads";
const PUBLIC_TOPIC_RE = /^\/v1\/public\/openproduct\/topics\/([a-z0-9][a-z0-9-]{0,63})$/;
const PUBLIC_BOARD_RE = /^\/v1\/public\/openproduct\/launches\/(\d{4}-\d{2}-\d{2})$/;

/** LC4 — collections and their index. Public and anonymous like every other
 *  read here. The slug shape is pinned at this layer too, so a malformed
 *  address never reaches core. */
const PUBLIC_COLLECTIONS_INDEX_PATH = "/v1/public/openproduct/collections";
const PUBLIC_COLLECTION_RE =
  /^\/v1\/public\/openproduct\/collections\/([a-z0-9][a-z0-9-]{0,63})$/;

/** TS5 — the transparency record. Public and anonymous, and the ONE READ ON
 *  THE ESTATE THAT MUST BE for a reason beyond caching: a page of numbers
 *  about how an intermediary uses its power is worth nothing if it can only
 *  be seen by people who have signed up to that intermediary. */
const PUBLIC_TRANSPARENCY_PATH = "/v1/public/openproduct/transparency";

const PUBLIC_DIRECTORY_PATH = "/v1/public/openproduct/projects";
const PUBLIC_PROFILE_RE = /^\/v1\/public\/openproduct\/projects\/([^/]+)$/;

// The seam receivers (OX5 — S6/S7). Signed by the platform, never by a
// browser: no CORS, no bearer, no subject — the HMAC is the whole identity.
const SEAM_JOIN_REQUESTS_PATH = "/seam/v1/join-requests";
const SEAM_WORKSPACE_EVENTS_PATH = "/seam/v1/workspace-events";
const SEAM_WORKSPACE_PURGE_PATH = "/seam/v1/workspace-purge";

/** 60s: the retraction SLA (OD-H), unchanged across the front-door swap. */
const PUBLIC_CACHE_SECONDS = 60;

const FORWARDED_HEADERS = ["content-type", "traceparent", "idempotency-key"];

// TS2 — which write is this, and what is it about.
//
// ONE TABLE, READ ONCE PER REQUEST, and it is deliberately a function of the
// PATH AND METHOD ONLY. The gateway streams request bodies straight through
// to core; a classifier that needed to read one would have to buffer it,
// which is both a per-request memory cost and the exact resource a flood is
// trying to spend. That constraint is why EN1's endorse slug moved out of the
// body and into the path — a limit that cannot see its target cannot bound
// it.
//
// UNCLASSIFIED WRITES ARE NOT REFUSED. A write this table does not know
// still passes, because the alternative — refusing anything unrecognised —
// turns every new route into an outage until somebody remembers this file.
// The coarse per-identity bucket below still applies to it, and the
// `every write is classified` test is what stops the gap being permanent.
const ME_ENDORSE_RE = /^\/v1\/openproduct\/me\/endorsements\/([A-Za-z0-9-]{1,64})$/;
const ME_SAVED_RE = /^\/v1\/openproduct\/me\/saved(?:\/([A-Za-z0-9-]{1,64}))?$/;
const ME_FOLLOW_RE = /^\/v1\/openproduct\/me\/follows\/([a-z]+)\/([a-z0-9][a-z0-9-]{0,63})$/;
const ORG_PUBLISH_RE = /^\/v1\/organizations\/[^/]+\/openproduct\/profiles\/[^/]+\/(publish|unpublish)$/;

interface WriteClassification {
  readonly action: WriteAction;
  /** The thing acted upon, for the per-target bound. Null when there is no
   *  meaningful target, which is most of them. */
  readonly target: string | null;
}

export function classifyWrite(pathname: string, method: string): WriteClassification | null {
  if (method === "GET" || method === "HEAD") return null;

  const endorse = ME_ENDORSE_RE.exec(pathname);
  if (endorse) return { action: "endorse", target: endorse[1]!.toLowerCase() };

  // FL0 — a follow. NO TARGET BOUND, and that is the one place this departs
  // from the endorsement above: a target rule catches a brigade moving a
  // PUBLIC number, and a follower count ranks nothing and decides nothing
  // about what anybody else is shown. Bounding it would slow a crowd
  // discovering a topic and stop no attack.
  if (ME_FOLLOW_RE.test(pathname)) return { action: "follow", target: null };

  const saved = ME_SAVED_RE.exec(pathname);
  // A save is PRIVATE and counted nowhere (OPC-3), so it has no target bound:
  // there is nothing to inflate and nobody to shout at.
  if (saved) return { action: "save", target: null };

  // TS5 — filing an appeal. The exact path and POST only, so the GET that
  // shows somebody what was done to their listings is an ordinary read.
  if (pathname === "/v1/openproduct/me/appeals") return { action: "appeal", target: null };
  if (pathname === "/v1/openproduct/me/handle") return { action: "handle-claim", target: null };
  if (
    pathname === "/v1/openproduct/me" ||
    pathname === "/v1/openproduct/me/profile-visibility"
  ) {
    return { action: "profile-write", target: null };
  }
  // CG3 — naming somebody on a listing is a write ABOUT A PERSON, so it is
  // bounded like every other one. Same rule as a listing edit: it is the
  // maintainer's own listing, and the honest version of it is occasional.
  if (/^\/v1\/openproduct\/listings\/[^/]+\/people/.test(pathname)) {
    return { action: "listing-write", target: null };
  }
  // CB1 — the two discussion writes, bounded separately because they cost
  // different amounts (see the contract's rules). The TARGET is in the PATH
  // for a reply, which is what lets a per-thread bound exist at all: the
  // gateway never reads a body, so a limit can only see what the URL carries.
  //
  // A NEW THREAD HAS NO TARGET, and this comment used to say its per-listing
  // bound was "applied in core". IT IS NOT — no such bound exists anywhere
  // (DQ0b went looking). What holds is the SUBJECT rule, which is the one that
  // stops a flood: forty threads on forty listings is the same limit as forty
  // on one. A per-listing bound would need the slug, the slug is in the body,
  // and reading a body to make a limit decision is a thing this layer does not
  // do. Saying so plainly is better than a comment that reassures.
  const threadPost = /^\/v1\/openproduct\/threads\/([^/]+)\/posts$/.exec(pathname);
  if (threadPost) return { action: "post", target: threadPost[1]! };
  if (pathname === "/v1/openproduct/threads") return { action: "thread-create", target: null };
  // DQ0b — a comment is a POST, not a thread-create, even though it may make
  // the thread. `thread-create`'s tighter bound exists to stop somebody
  // manufacturing forty titled discussions on one listing, and this cannot do
  // that: there is one comment thread per listing and no title to fill, so
  // what it produces is replies.
  //
  // NO TARGET, and for the same reason `thread-create` has none: the listing
  // is in the BODY, not in the URL, and this layer does not read bodies. The
  // SUBJECT bound applies and is what stops a flood.
  if (pathname === "/v1/openproduct/comments") {
    return { action: "post", target: null };
  }
  // DQ1 — an upvote on a comment, bounded PER POST because the id is in the
  // path. `endorse` is the right action for it: same act, same shape, and a
  // separate one would be a second set of numbers to keep in step for a
  // gesture that is identical in everything but what it moves.
  const postVote = /^\/v1\/openproduct\/posts\/([^/]+)\/vote$/.exec(pathname);
  if (postVote) return { action: "endorse", target: postVote[1]! };
  // LC4 — CREATING a collection only. The exact path, so the item and state
  // routes under it (`/me/collections/add`, `/state`, …) are ordinary writes:
  // they edit a thing the curator already made and cost a reader nothing,
  // while creation is the act that can flood.
  if (pathname === "/v1/openproduct/me/collections" && method === "POST") {
    return { action: "collection-create", target: null };
  }
  if (ORG_PUBLISH_RE.test(pathname)) return { action: "listing-publish", target: null };
  if (ORG_OPENPRODUCT_RE.test(pathname)) return { action: "listing-write", target: null };
  return null;
}

function isPublicRoute(pathname: string): boolean {
  return (
    pathname === PUBLIC_DIRECTORY_PATH ||
    PUBLIC_PROFILE_RE.test(pathname) ||
    // CT2's catalog family. On the SAME branch as OD3's read, deliberately:
    // the ordering that returns before any auth code is reachable is part of
    // the guarantee, and a second public branch would be a second place for
    // that ordering to be got wrong.
    pathname === CATALOG_LIST_PATH ||
    pathname === CATALOG_FACETS_PATH ||
    CATALOG_PRODUCT_RE.test(pathname) ||
    // DS0's search. Public for the same reason the catalog is: it resolves no
    // actor and nothing about who is asking enters the order, so the answer
    // is cacheable and identical for everyone.
    pathname === SEARCH_PATH ||
    // CG1's contributor page, and DS4's index of their addresses.
    PUBLIC_PERSON_RE.test(pathname) ||
    // MP0's maker tabs.
    PUBLIC_MAKER_TAB_RE.test(pathname) ||
    pathname === PUBLIC_PEOPLE_INDEX_PATH ||
    pathname === PUBLIC_CONTRIBUTORS_PATH ||
    // LC1's digest, and its index.
    pathname === PUBLIC_DIGEST_INDEX_PATH ||
    PUBLIC_DIGEST_RE.test(pathname) ||
    // OL2's feed.
    pathname === PUBLIC_FEED_PATH ||
    // UV2's leaderboard.
    pathname === PUBLIC_LEADERBOARD_PATH ||
    // TP0's topics, and one topic.
    pathname === PUBLIC_TOPICS_INDEX_PATH ||
    // FL1's sidebar.
    pathname === PUBLIC_SIDEBAR_PATH ||
    pathname === PUBLIC_FORUM_PATH ||
    PUBLIC_TOPIC_RE.test(pathname) ||
    // LC3's board, and the archive index.
    pathname === PUBLIC_BOARD_INDEX_PATH ||
    PUBLIC_BOARD_RE.test(pathname) ||
    // TS5's transparency record.
    pathname === PUBLIC_TRANSPARENCY_PATH ||
    // LC4's collections, and their index.
    pathname === PUBLIC_COLLECTIONS_INDEX_PATH ||
    PUBLIC_COLLECTION_RE.test(pathname) ||
    PUBLIC_ROSTER_RE.test(pathname) ||
    PUBLIC_THREADS_RE.test(pathname) ||
    PUBLIC_THREAD_RE.test(pathname)
  );
}

/**
 * Is this a path the authenticated plane serves?
 *
 * THE ONE PLACE THE ANSWER LIVES. `internalPath` maps a path to core's; this
 * says whether it is ours at all, and `route` asks only this. A path that can
 * be mapped and cannot be dispatched is a 404 on a door that exists, which is
 * the failure this pair replaced.
 */
export function isAuthenticatedRoute(pathname: string): boolean {
  return (
    LISTING_ROSTER_RE.test(pathname) ||
    ME_OPENPRODUCT_RE.test(pathname) ||
    REPORTS_RE.test(pathname) ||
    THREADS_WRITE_RE.test(pathname) ||
    pathname === COMMENT_WRITE_PATH ||
    POST_VOTE_RE.test(pathname) ||
    ORG_OPENPRODUCT_RE.test(pathname)
  );
}

export function internalPath(pathname: string): string | null {
  // CG3 — the maintainer's roster door keeps its shape across the seam.
  if (LISTING_ROSTER_RE.test(pathname)) {
    return `/internal/openproduct${pathname.slice("/v1/openproduct".length)}`;
  }
  if (ME_OPENPRODUCT_RE.test(pathname)) {
    return `/internal/openproduct${pathname.slice("/v1/openproduct".length)}`;
  }
  // TS3 — the report door and its triage surface.
  if (REPORTS_RE.test(pathname)) {
    return `/internal/openproduct${pathname.slice("/v1/openproduct".length)}`;
  }
  // CB1 — the discussion writes. DQ0b's comment is one of them.
  if (
    THREADS_WRITE_RE.test(pathname) ||
    pathname === COMMENT_WRITE_PATH ||
    POST_VOTE_RE.test(pathname)
  ) {
    return `/internal/openproduct${pathname.slice("/v1/openproduct".length)}`;
  }
  const match = ORG_OPENPRODUCT_RE.exec(pathname);
  if (!match) return null;
  const rest = pathname.slice(`/v1/organizations/${match[1]}/openproduct/profiles`.length);
  return `/internal/openproduct/orgs/${match[1]}/profiles${rest}`;
}

async function handlePublicRead(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
  deprecations: readonly ApiDeprecation[] | undefined,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed(requestId);
  }
  if (!env.CORE) {
    return errorResponse("internal_error", "Openproduct service unavailable", 503, requestId);
  }
  // CS1 — the bucket, first, and counted in one place. Workers Caching
  // answers a hit before this function runs at all, so what reaches here is
  // a miss: a flood of one URL spends nothing of ours and a flood of distinct
  // URLs spends tokens, which is the order the limiter's header always
  // wanted. A refusal is 429 with Retry-After and names the bucket.
  const limited = await rateLimitGate("anon", anonKey(request), env, requestId);
  if (limited) return limited;

  const url = new URL(request.url);
  const catalogProduct = CATALOG_PRODUCT_RE.exec(pathname);
  const makerTab = PUBLIC_MAKER_TAB_RE.exec(pathname);
  const person = PUBLIC_PERSON_RE.exec(pathname);
  const publicRoster = PUBLIC_ROSTER_RE.exec(pathname);
  const publicThreads = PUBLIC_THREADS_RE.exec(pathname);
  const publicThread = PUBLIC_THREAD_RE.exec(pathname);
  const digestWeek = PUBLIC_DIGEST_RE.exec(pathname);
  const boardDay = PUBLIC_BOARD_RE.exec(pathname);
  const publicCollection = PUBLIC_COLLECTION_RE.exec(pathname);
  const publicTopic = PUBLIC_TOPIC_RE.exec(pathname);
  const target =
    // TS5 — first in the chain because it is an exact path and the fallthrough
    // at the bottom is `PUBLIC_PROFILE_RE.exec(pathname)![1]`, which throws on
    // anything that reached here without a branch. A route added to
    // `isPublicRoute` and not to this table is a 500, not a 404, and that is
    // exactly how this one was caught.
    pathname === PUBLIC_TRANSPARENCY_PATH
      ? "/internal/public/openproduct/transparency"
      : publicCollection
      ? `/internal/public/openproduct/collections/${publicCollection[1]}`
      : pathname === PUBLIC_COLLECTIONS_INDEX_PATH
      ? "/internal/public/openproduct/collections"
      : boardDay
      ? `/internal/public/openproduct/launches/${boardDay[1]}`
      : pathname === PUBLIC_BOARD_INDEX_PATH
      ? "/internal/public/openproduct/launches"
      : pathname === PUBLIC_FEED_PATH
      ? "/internal/public/openproduct/feed"
      : pathname === PUBLIC_LEADERBOARD_PATH
      ? `/internal/public/openproduct/leaderboard${url.search}`
      : pathname === PUBLIC_TOPICS_INDEX_PATH
      ? "/internal/public/openproduct/topics"
      : pathname === PUBLIC_SIDEBAR_PATH
      ? "/internal/public/openproduct/sidebar"
      : pathname === PUBLIC_FORUM_PATH
      ? `/internal/public/openproduct/threads${url.search}`
      : publicTopic
      ? `/internal/public/openproduct/topics/${publicTopic[1]}`
      : publicThreads
      ? `/internal/public/openproduct/projects/${publicThreads[1]}/threads${url.search}`
      : publicThread
      ? `/internal/public/openproduct/threads/${publicThread[1]}`
      : digestWeek
      ? `/internal/public/openproduct/digest/${digestWeek[1]}`
      : pathname === PUBLIC_DIGEST_INDEX_PATH
      ? "/internal/public/openproduct/digest"
      : publicRoster
      ? `/internal/public/openproduct/projects/${publicRoster[1]}/people`
      : pathname === PUBLIC_CONTRIBUTORS_PATH
      ? `/internal/public/openproduct/contributors${url.search}`
      : pathname === PUBLIC_PEOPLE_INDEX_PATH
      ? "/internal/public/openproduct/people"
      : makerTab
      ? `/internal/public/openproduct/people/${makerTab[1]}/tab/${makerTab[2]}`
      : person
      ? `/internal/public/openproduct/people/${person[1]}`
      : pathname === SEARCH_PATH
      ? `/internal/public/openproduct/search${url.search}`
      : pathname === CATALOG_LIST_PATH
      ? `${CATALOG_LIST_TARGET}${url.search}`
      : pathname === CATALOG_FACETS_PATH
        ? CATALOG_FACETS_TARGET
        : catalogProduct
          ? catalogProductTarget(catalogProduct[1]!)
          : pathname === PUBLIC_DIRECTORY_PATH
            ? `/internal/public/openproduct/projects${url.search}`
            : `/internal/public/openproduct/projects/${PUBLIC_PROFILE_RE.exec(pathname)![1]}`;

  // A deliberately empty header set — a header cannot reach core by being
  // forgotten in a denylist. A request that arrives carrying a bearer is
  // served exactly as one that does not.
  const headers = new Headers({ "x-request-id": requestId });

  // OPP4a — THE CACHE IS NO LONGER IN THIS FILE.
  //
  // OPP4 wrapped this branch in `caches.default` by hand. OPP4a deleted that
  // and turned on **Workers Caching** (`"cache": { "enabled": true }` in
  // `wrangler.jsonc`), which sits IN FRONT of the worker: on a hit this
  // function never runs at all. Cloudflare's own guidance is that the Cache
  // API is "by design, a lower-level primitive", and the three things it
  // lacked are the three that matter on a launch board:
  //
  //   read-through       a hit costs no worker invocation, not just no
  //                      database read
  //   request collapsing a burst on a cold key runs this ONCE per data
  //                      centre. The hand-rolled version ran it once per
  //                      request, which is precisely the shape of traffic a
  //                      front-page listing produces
  //   tiered cache       on by default; the Cache API can never have it
  //
  // So the whole cache configuration surface is now the two headers below.
  try {
    const downstream = await env.CORE.fetch(
      new URL(target, "https://openproduct.internal").toString(),
      { method: "GET", headers },
    );
    // A failure body is never passed through: core's own 404 names an
    // internal path, and this surface refuses to distinguish "private",
    // "nonexistent" and "dark" everywhere else. Only the status survives.
    if (!downstream.ok) {
      const status = downstream.status === 404 ? 404 : downstream.status;
      // `errorResponse` already says `no-store` (OPP4a inverted the default),
      // so a failure cannot be cached by being forgotten about.
      return errorResponse(
        status === 404 ? "not_found" : "internal_error",
        status === 404 ? "Not found" : "Service unavailable",
        status,
        requestId,
      );
    }
    const response = new Response(downstream.body, {
      status: downstream.status,
      headers: { "content-type": "application/json" },
    });
    response.headers.set("x-request-id", requestId);
    // OPP6 — core's own breakdown, carried deliberately. This branch builds a
    // fresh Response so that NO downstream header travels by accident (its
    // 404 names an internal path); the price is that a header worth having
    // must be named here, like the `cache-control` below.
    const downstreamTiming = downstream.headers.get("server-timing");
    if (downstreamTiming) response.headers.set("Server-Timing", downstreamTiming);
    // CORE MAY KNOW MORE THAN THIS LAYER DOES about how long one document
    // stays true, and where it says so, it wins (LC1). The default is right
    // for everything that changes when the catalog changes — a listing, the
    // directory, a profile — and wrong for a document that CANNOT change: a
    // digest for a week that ended is immutable, and serving it with sixty
    // seconds of freshness makes every crawler re-fetch an archive.
    //
    // Only ever a `public` directive, and only from core. A downstream that
    // could set `no-store` here would be a downstream that could make a
    // public read uncacheable, and this gateway's whole shape is that public
    // reads are one document for everybody.
    //
    // THIS IS THE ONLY PLACE IN THE WORKER THAT MAKES ANYTHING CACHEABLE.
    // Every other response inherits `no-store` from `http.ts`.
    const downstreamCache = downstream.headers.get("cache-control");
    response.headers.set(
      "cache-control",
      downstreamCache && /^public, max-age=\d+$/.test(downstreamCache)
        ? downstreamCache
        : `public, max-age=${PUBLIC_CACHE_SECONDS}`,
    );
    // CS0/CS1 — a field in its notice period is announced ON THE WIRE, from
    // the same entry that puts it on /docs/api and marks the schema: RFC 9745
    // `Deprecation` with the moment the notice began, RFC 8594 `Sunset` with
    // the day it goes. Absent while nothing is in notice, which is today; the
    // list is the contract's unless a test hands one in.
    const notice = deprecationHeaders(new Date(), deprecations);
    if (notice) {
      response.headers.set("deprecation", notice.deprecation);
      response.headers.set("sunset", notice.sunset);
    }
    // OPP4a — what a write has to purge to invalidate this document. Cloudflare
    // strips this header before the response reaches the visitor; it exists for
    // `ctx.cache.purge({ tags })`, which the sweep calls (see `index.ts`).
    response.headers.set("Cache-Tag", cacheTagHeader(pathname));
    return response;
  } catch {
    return errorResponse("internal_error", "Openproduct service unavailable", 503, requestId);
  }
}

/**
 * The publish-time repo read (S8). Three hops, same order the facade used:
 * core authorizes the profile read (a caller with no rights never reaches
 * GitHub), GitHub answers from `repo_url`'s coordinates, and the observation
 * is written HERE — the caller's body never reaches core.
 */
async function handleRepoCheck(
  request: Request,
  env: Env,
  requestId: string,
  orgSegment: string,
  profileSegment: string,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(requestId);
  if (!env.CORE) {
    return errorResponse("internal_error", "Openproduct service unavailable", 503, requestId);
  }

  const session = await resolveSubject(request, env, fetch, env.CORE);
  if (!session.ok) return errorResponse(session.code, session.message, session.status, requestId);
  const limited = await rateLimitGate("identity", session.subject.subjectId, env, requestId);
  if (limited) return limited;

  const actorHeaders = new Headers({
    "x-request-id": requestId,
    "x-actor-subject-id": session.subject.subjectId,
    "x-actor-subject-type": session.subject.subjectType,
    "content-type": "application/json",
  });
  const base = `/internal/openproduct/orgs/${orgSegment}/profiles/${profileSegment}`;

  const profileRes = await env.CORE.fetch(
    new URL(base, "https://openproduct.internal").toString(),
    { method: "GET", headers: actorHeaders },
  );
  if (!profileRes.ok) {
    return new Response(profileRes.body, { status: profileRes.status, headers: profileRes.headers });
  }
  const profileBody = (await profileRes.json()) as {
    data?: { profile?: { repoUrl?: string | null } };
  };
  const repoUrl = profileBody.data?.profile?.repoUrl ?? null;

  // No linked repo is an OBSERVATION (linked: false) — the publish gate
  // reads it as its own blocker rather than a transport error.
  // IN2 — the observation carries three more fields now (name, description,
  // topics). `RepoObservation` is its shape, rather than a structural type
  // spelled here: the two drifted the moment the observation grew, and the
  // one that mattered was this file quietly recording `undefined` for the
  // fields it had not been told about.
  let observation: RepoObservation;
  if (!repoUrl) {
    observation = {
      linked: false,
      visibility: null,
      licence: null,
      name: null,
      description: null,
      topics: null,
      language: null,
      pushedAt: null,
      openIssues: null,
    };
  } else {
    const coords = parseGithubRepo(repoUrl);
    if (!coords) {
      // A repo_url that is not a github.com/{owner}/{repo} URL cannot be
      // verified public — recorded as private-equivalent, with the remedy in
      // the maintainer's hands (fix the URL), not swallowed as an outage.
      observation = {
        linked: true,
        visibility: "private",
        licence: null,
        name: null,
        description: null,
        topics: null,
        language: null,
        pushedAt: null,
        openIssues: null,
      };
    } else {
      const observed = await observeRepo(coords.owner, coords.repo, env.GITHUB_TOKEN);
      // An outage is not an observation — retriable error, never "private".
      if (!observed.ok) {
        return errorResponse("bad_gateway", "Could not check the repository right now", 502, requestId);
      }
      observation = observed.observation;
    }
  }

  const recordRes = await env.CORE.fetch(
    new URL(`${base}/repo-observation`, "https://openproduct.internal").toString(),
    { method: "PUT", headers: actorHeaders, body: JSON.stringify(observation) },
  );
  const response = new Response(recordRes.body, {
    status: recordRes.status,
    headers: recordRes.headers,
  });
  response.headers.set("cache-control", "no-store");
  return response;
}

/**
 * The seam receivers (OX5 — S6/S7): the platform's signed deliveries, verified
 * inline and forwarded over the one in-product binding.
 *
 * NOTE WHAT IS ABSENT: no CORS, no bearer, no subject resolution, and no rate
 * bucket — the HMAC is the entire identity, and a rate limit here would let
 * anyone who can name the path starve the platform's own deliveries. Every
 * refusal before the signature check is indistinguishable from one after it.
 *
 * S7 (workspace-purge) is SYNCHRONOUS by contract: the platform's purge
 * orchestrator parses the context receipt from this response, so core's body
 * passes through verbatim. S6 is fire-and-forget on the sending side; the
 * same passthrough serves both.
 */
async function handleSeamDelivery(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(requestId);
  const secret = (env.LISTING_SEAM_SECRET ?? "").trim();
  if (!secret || !env.CORE) {
    return errorResponse("internal_error", "Listing seam not configured", 503, requestId);
  }
  const body = await request.text();
  if (body.length > 64_000) {
    return errorResponse("bad_request", "Payload too large", 413, requestId);
  }
  if (!(await verifySeamSignature(secret, body, request.headers))) {
    return errorResponse("unauthorized", "Invalid seam signature", 401, requestId);
  }

  const target =
    pathname === SEAM_JOIN_REQUESTS_PATH
      ? "/internal/openproduct/seam/join-request"
      : pathname === SEAM_WORKSPACE_EVENTS_PATH
        ? "/internal/openproduct/seam/workspace-event"
        : "/v1/internal/openproduct/workspace-purge";
  try {
    const downstream = await env.CORE.fetch(
      new URL(target, "https://openproduct.internal").toString(),
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": requestId },
        body,
      },
    );
    const response = new Response(downstream.body, {
      status: downstream.status,
      headers: { "content-type": "application/json" },
    });
    response.headers.set("cache-control", "no-store");
    response.headers.set("x-request-id", requestId);
    return response;
  } catch {
    return errorResponse("internal_error", "Openproduct service unavailable", 503, requestId);
  }
}

async function handleAuthenticated(
  request: Request,
  env: Env,
  requestId: string,
  pathname: string,
  ctx?: WriteContext,
): Promise<Response> {
  const allowed = ["GET", "POST", "PATCH", "PUT", "DELETE"];
  if (!allowed.includes(request.method)) return methodNotAllowed(requestId);
  if (!env.CORE) {
    return errorResponse("internal_error", "Openproduct service unavailable", 503, requestId);
  }

  const repoCheck = REPO_CHECK_RE.exec(pathname);
  if (repoCheck) {
    return handleRepoCheck(request, env, requestId, repoCheck[1]!, repoCheck[2]!);
  }

  // MD1 — the upload. THE ORDER HERE IS THE SECURITY DESIGN (media.ts):
  // the ceiling at the content-length header and the bucket guard run
  // BEFORE the subject is resolved, so a 50 MB anonymous body is refused
  // without a platform round trip; the subject is resolved BEFORE the body
  // is read, so an anonymous upload never costs a buffer.
  const mediaUpload = MEDIA_UPLOAD_RE.exec(pathname);
  if (mediaUpload && request.method === "POST") {
    const refused = preflightUpload(request, env, requestId);
    if (refused) return refused;
    const session = await resolveSubject(request, env, fetch, env.CORE);
    if (!session.ok) return errorResponse(session.code, session.message, session.status, requestId);
    const limited = await rateLimitGate("identity", session.subject.subjectId, env, requestId);
    if (limited) return limited;
    const fields = parseUploadFields(new URL(request.url), requestId);
    if (fields instanceof Response) return fields;
    return handleMediaUpload(request, env, requestId, fields, {
      subject: session.subject,
      core: env.CORE,
      internalPath: `/internal/openproduct/orgs/${mediaUpload[1]}/profiles/${mediaUpload[2]}/media`,
      origin: new URL(request.url).origin,
      ...(ctx ? { waitUntil: (p: Promise<unknown>) => ctx.waitUntil(p) } : {}),
    });
  }

  const session = await resolveSubject(request, env, fetch, env.CORE);
  if (!session.ok) return errorResponse(session.code, session.message, session.status, requestId);
  const limited = await rateLimitGate("identity", session.subject.subjectId, env, requestId);
  if (limited) return limited;
  const orgMatch = ORG_OPENPRODUCT_RE.exec(pathname);
  if (orgMatch) {
    const orgLimited = await rateLimitGate("org", orgMatch[1]!, env, requestId);
    if (orgLimited) return orgLimited;
  }

  // TS2 — VELOCITY, BEFORE THE HOP. This is the whole of "a synthetic flood
  // is refused at the gateway and never reaches a handler": the check runs
  // above `env.CORE.fetch`, so a refused request costs a map lookup rather
  // than a service binding hop, a database connection and a transaction.
  const write = classifyWrite(pathname, request.method);
  if (write) {
    const refusal = checkVelocity(env, write.action, {
      subject: session.subject.subjectId,
      target: write.target,
    });
    if (refusal) {
      // OBSERVABLE. Which action, which dimension, which of the two windows,
      // and what the limit was — enough to tell a misconfigured limit from a
      // real flood without guessing. The subject id is here because this is
      // an internal log and abuse is investigated by subject; no email
      // exists anywhere in this worker to leak (I3).
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "velocity_refused",
          action: refusal.action,
          dimension: refusal.dimension,
          window: refusal.window,
          limit: refusal.limit,
          windowSec: refusal.windowSec,
          subjectId: session.subject.subjectId,
          requestId,
        }),
      );
      // The person is told WHAT HAPPENED, not "Too many requests". A bare
      // 429 reads as either "the site is broken" or "I am being punished",
      // and neither is true — most people who hit a velocity limit are
      // enthusiastic rather than hostile.
      const response = errorResponse("rate_limited", refusal.message, 429, requestId, {
        retryAfterSeconds: refusal.retryAfterSec,
      });
      response.headers.set("retry-after", String(refusal.retryAfterSec));
      return response;
    }
  }

  // Fresh headers, never a filtered copy — client-supplied x-actor-* dies
  // here by construction. No x-actor-email exists to forward, ever.
  const headers = new Headers({
    "x-request-id": requestId,
    "x-actor-subject-id": session.subject.subjectId,
    "x-actor-subject-type": session.subject.subjectType,
  });
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const target = internalPath(pathname);
  if (!target) return notFound(requestId, pathname);

  const url = new URL(request.url);
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "DELETE") {
    init.body = request.body;
  }

  try {
    const downstream = await env.CORE.fetch(
      new URL(target + url.search, "https://openproduct.internal").toString(),
      init,
    );
    if (downstream.status >= 500) {
      // Core answered, and answered badly — say so here too, with the ids
      // that tie this line to core's own, so one search finds both.
      console.error(
        JSON.stringify({
          level: "error",
          msg: "core_5xx",
          method: request.method,
          path: pathname,
          target,
          status: downstream.status,
          requestId,
        }),
      );
    }
    const response = new Response(downstream.body, {
      status: downstream.status,
      headers: downstream.headers,
    });
    response.headers.set("cache-control", "no-store");
    // OPP14 — a discussion write that landed purges the documents it
    // changed, AFTER the answer: the writer is not made to wait on a purge,
    // and a purge that fails leaves documents that expire in sixty seconds.
    if (write && ctx && downstream.ok) {
      const tags = purgeTagsForWrite(pathname, write.action);
      if (tags.length > 0) ctx.waitUntil(purgeTags(ctx, tags));
    }
    return response;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "core_unreachable",
        method: request.method,
        path: pathname,
        target,
        requestId,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      }),
    );
    return errorResponse("internal_error", "Openproduct service unavailable", 503, requestId);
  }
}

/**
 * AC2b's one test seam, and it is narrow on purpose.
 *
 * `verifyPassword` is argon2id at AC0's parameters — ~82ms per call, by
 * design. A suite that exercises every refusal path would pay it a dozen
 * times for a comparison whose outcome it is dictating anyway. Nothing else
 * is injectable here: the seam client, the buckets and the token generator
 * all run for real, because they are what the tests are about.
 */
export interface RouteOptions {
  verifyPassword?: (plaintext: string, encoded: string) => Promise<boolean>;
  /** OPP14 — the request's execution context, for a purge scheduled after
   *  the answer (`ctx.waitUntil`). Absent in tests that do not care. */
  ctx?: WriteContext;
  /**
   * CS1 — the deprecation notices the public read announces on the wire.
   * A test seam: absent, `API_DEPRECATIONS` (empty today) is the list, and
   * a test hands in a synthetic notice to see the headers appear.
   */
  deprecations?: readonly ApiDeprecation[];
}

/** The slice of `ExecutionContext` a write needs: to purge, and to do it
 *  after the response has left. */
export interface WriteContext {
  waitUntil(promise: Promise<unknown>): void;
  cache?: { purge(options: { tags: string[] }): Promise<{ success: boolean; errors?: unknown }> };
}

export async function route(
  request: Request,
  env: Env,
  options?: RouteOptions,
): Promise<Response> {
  const requestId = resolveRequestId(request);
  const pathname = new URL(request.url).pathname;

  if (pathname === "/health") {
    // RS1 — health stopped being a list of things that are CONFIGURED and
    // started including one thing that is HAPPENING.
    //
    // Every check beside this one asks whether a binding or a secret is
    // present, which is a question answerable without leaving the isolate and
    // which was true throughout the entire period the product was broken. The
    // sweep is the first check here that can only be answered by asking what
    // actually ran, and it is the check that would have caught the outage RS0
    // fixed on its first poll rather than on an audit four epics later.
    //
    // THE HTTP STATUS STAYS 200 EVEN WHEN THE SWEEP IS STALE, and that is a
    // decision rather than an oversight. A 5xx here would take the gateway
    // out of rotation, and a stale digest taking the public read plane down
    // is a cure considerably worse than the disease — the pages still render,
    // correctly, from data that is merely older than it should be. The
    // liveness question ("is this worker up") and the correctness question
    // ("is its machinery running") have different answers and different
    // audiences, so the body carries `status: "degraded"` and the code stays
    // 200. Anything that reads the body learns the truth; anything that only
    // reads the code learns whether to route traffic here, which is what it
    // was asking.
    const sweep = sweepHealth(await readSweepState(env), new Date());
    return successResponse(
      {
        status: sweep.healthy ? "ok" : "degraded",
        service: "openproduct-gateway",
        environment: env.ENVIRONMENT ?? "local",
        timestamp: new Date().toISOString(),
        // OO3 — which build is answering: the Worker version and its upload
        // moment, from the runtime's own metadata. A version, not a commit;
        // null where the binding is absent.
        build: buildInfo(env.CF_VERSION_METADATA),
        checks: {
          core: { configured: !!env.CORE },
          platform: { configured: !!(env.PLATFORM_API_URL ?? "").trim() },
          seam: { configured: !!(env.LISTING_SEAM_SECRET ?? "").trim() },
          sweep,
          // LI4 — whether the outward phase has the token that lifts GitHub's
          // ceiling: the presence, never the value.
          ingestion: ingestionBudget(env.GITHUB_TOKEN),
          // MD4 — whether this environment captures screenshots at all, and
          // its budget: the presence of the two settings, never their values.
          screenshots: screenshotBudget(env.SCREENSHOT_CAPTURE_URL, env.SCREENSHOT_CAPTURE_TOKEN),
        },
      },
      requestId,
    );
  }

  // The seam receivers (S6/S7) — before every browser-facing branch; the
  // platform signs, nobody else may speak here.
  if (
    pathname === SEAM_JOIN_REQUESTS_PATH ||
    pathname === SEAM_WORKSPACE_EVENTS_PATH ||
    pathname === SEAM_WORKSPACE_PURGE_PATH
  ) {
    return handleSeamDelivery(request, env, requestId, pathname);
  }

  // AC1 — sign-up and verification. Before the public branch (these are writes
  // and must never be cached) and before the authenticated one (there is no
  // bearer yet — having one is the outcome, not the precondition).
  //
  // THIS IS THE ONLY PLACE ON THE ESTATE THAT HOLDS AN ADDRESS, and it holds
  // one for the length of one request: core has no way to reach the platform
  // and AC0's schema has no column to store one.
  if (pathname === AUTH_SIGN_UP_PATH || pathname === AUTH_VERIFY_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.CORE) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    const deps = { hashPassword };
    return pathname === AUTH_SIGN_UP_PATH
      ? handleAuthSignUp(request, env, env.CORE, requestId, deps)
      : handleAuthVerify(request, env, env.CORE, requestId, deps);
  }

  // AC2b — sign-in and sign-out. Sign-in is the one route on this worker that
  // needs BOTH halves of AC2: the platform to say who an address is, and core
  // to say what their password is.
  if (pathname === AUTH_SIGN_IN_PATH || pathname === AUTH_SIGN_OUT_PATH) {
    if (request.method !== "POST") return methodNotAllowed(requestId);
    if (!env.CORE) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return pathname === AUTH_SIGN_IN_PATH
      ? handleAuthSignIn(request, env, env.CORE, requestId, {
          resolveSubjectByEmail,
          verifyPassword: options?.verifyPassword ?? verifyPassword,
        })
      : handleAuthSignOut(request, env, env.CORE, requestId);
  }

  // AG1 — the agent surface. Before the public read branch because it is a
  // POST and that branch is GET-only, and after the seam receivers because
  // nothing unsigned may be mistaken for one.
  //
  // 405 ON EVERYTHING BUT POST, with `Allow`, which is what a stateless MCP
  // server owes a client: `GET /mcp` is how a client opens the SSE stream a
  // stateful server would offer, and answering it with a 404 would read as
  // "no server here" rather than "this one does not stream".
  if (pathname === MCP_PATH) {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    }
    if (!env.CORE) return errorResponse("internal_error", "Service unavailable", 503, requestId);
    return handleMcp(request, env);
  }

  // CT2 — the OpenAPI document. Generated from the contracts this worker
  // already imports, so it is a pure response with no database hop: the
  // document that describes the catalog is available even when the catalog
  // is not, which is the right failure mode for documentation.
  if (pathname === OPENAPI_PATH) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed(requestId);
    }
    // CS0 — the document names where its changelog and policy live: the
    // website's /docs/api, on the one origin the gateway knows for it.
    const docsUrl = (env.SITE_ORIGIN ?? "").trim() ? `${(env.SITE_ORIGIN ?? "").trim().replace(/\/+$/, "")}/docs/api` : null;
    const body = JSON.stringify(buildOpenApiDocument(env.PUBLIC_API_ORIGIN ?? null, docsUrl), null, 2);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Longer than the catalog's 60s: the SHAPE changes when someone edits
        // a contract, not when a listing publishes.
        "cache-control": "public, max-age=600",
        "x-request-id": requestId,
      },
    });
  }

  // The unauthenticated branch first, returning before any auth code is
  // reachable — the ordering is part of the guarantee, as it was in the
  // facade this router replaces.
  // MD1 — served bytes. Before the public branch and without core: one R2
  // read, immutable, and the edge holds it (see media.ts for why no token).
  if (isMediaPath(pathname)) {
    return handleMediaServe(request, env, requestId, pathname);
  }
  if (isPublicRoute(pathname)) {
    return handlePublicRead(request, env, requestId, pathname, options?.deprecations);
  }
  // EVERY PATH `internalPath` CAN MAP IS DISPATCHED HERE, and the two lists
  // are the same list — `isAuthenticatedRoute` is what `internalPath` tests,
  // in the same order.
  //
  // They used to be written out twice, and they drifted: `REPORTS_RE` and
  // `THREADS_WRITE_RE` were mapped and never dispatched, so every discussion
  // write and the whole moderation surface answered 404 in production while
  // the pages that call them rendered fine. One list, one place, and
  // `router.test.ts` walks it.
  if (isAuthenticatedRoute(pathname)) {
    return handleAuthenticated(request, env, requestId, pathname, options?.ctx);
  }
  return notFound(requestId, pathname);
}
