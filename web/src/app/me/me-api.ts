// The authenticated half's API client (openproduct-home OH2).
//
// A SECOND client, beside OD5's anonymous one — deliberately not the anonymous
// client grown a token parameter (design.md §1): a shared client with an
// optional credential is exactly how a visitor with a session in another tab
// silently authenticates a request that must be anonymous. This one is the
// mirror image: the token is a REQUIRED argument, so there is no code path
// that sends an unauthenticated request by accident either.
//
// The header set is closed (the OD5 discipline): accept, authorization, and —
// on writes — content-type. Nothing is copied from any inbound request.
// Every read is `no-store`: this is a per-person surface.
import type {
  DigestSubscription,
  ContributorApplication,
  ContributorProfile,
  InboxItem,
  MeOverlay,
  PublicProfileCard,
} from "@openproduct/contracts";

import { publicApiBase } from "../public-api";

export type MeFetch = typeof fetch;

interface Envelope<T> {
  data?: T;
}

/**
 * Every call distinguishes the two ways it can not-succeed, because the pages
 * react differently: `unauthorized` (the token is dead — expired, revoked)
 * reads as signed out and redirects into sign-in; `unavailable` (the service
 * failed) renders an error state. Conflating them turned every API outage
 * into a redirect loop through the authorization server.
 */
export type MeResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "unavailable" };

/**
 * A WRITE has a fourth way to not-succeed that a read never needs: the
 * service understood it and said no, with a reason — a handle that is
 * taken, a link that is not on github.com, a page that cannot go public
 * without a name. That reason is the whole answer the profile form owes the
 * person, so it travels as `fields` (the API's own 422 envelope) rather than
 * collapsing into `unavailable` and telling them the service is down.
 */
export type MeWriteResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "unauthorized" }
  | { kind: "refused"; status: number; message: string; fields: Record<string, string[]> }
  | { kind: "unavailable" };

async function meWrite<T>(
  token: string,
  path: string,
  init: { method: string; body: unknown },
  fetchImpl: MeFetch = fetch,
): Promise<MeWriteResult<T>> {
  try {
    const res = await fetchImpl(`${publicApiBase()}${path}`, {
      method: init.method,
      headers: meHeaders(token, true),
      body: JSON.stringify(init.body),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { kind: "unauthorized" };
    if (res.status >= 400 && res.status < 500) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string; details?: { fields?: Record<string, string[]> } } }
        | null;
      return {
        kind: "refused",
        status: res.status,
        message: body?.error?.message ?? "The service refused this change",
        fields: body?.error?.details?.fields ?? {},
      };
    }
    if (!res.ok) return { kind: "unavailable" };
    const data = ((await res.json()) as Envelope<T>).data;
    return data === undefined || data === null ? { kind: "unavailable" } : { kind: "ok", data };
  } catch {
    return { kind: "unavailable" };
  }
}

export function meHeaders(token: string, withBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    ...(withBody ? { "content-type": "application/json" } : {}),
  };
}

async function meRequest<T>(
  token: string,
  path: string,
  init: { method: string; body?: unknown },
  fetchImpl: MeFetch = fetch,
): Promise<MeResult<T>> {
  try {
    const res = await fetchImpl(`${publicApiBase()}${path}`, {
      method: init.method,
      headers: meHeaders(token, init.body !== undefined),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { kind: "unauthorized" };
    if (!res.ok) return { kind: "unavailable" };
    const data = ((await res.json()) as Envelope<T>).data;
    return data === undefined || data === null ? { kind: "unavailable" } : { kind: "ok", data };
  } catch {
    return { kind: "unavailable" };
  }
}

export function fetchMe(
  token: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ contributor: ContributorProfile | null; subjectId: string }>> {
  return meRequest(token, "/v1/openproduct/me", { method: "GET" }, fetchImpl);
}

/** CS3 — everything this person may take with them, as the API hands it over:
 *  the registry's own rows and their listings. The route streams it back as a
 *  file; nothing here reads into it. */
export function fetchExport(token: string, fetchImpl?: MeFetch): Promise<MeResult<Record<string, unknown>>> {
  return meRequest(token, "/v1/openproduct/me/export", { method: "GET" }, fetchImpl);
}

export function updateMe(
  token: string,
  input: {
    displayName: string | null;
    bio: string | null;
    githubUrl?: string | null;
    siteUrl?: string | null;
    openToProject?: boolean;
  },
  fetchImpl?: MeFetch,
): Promise<MeWriteResult<{ contributor: ContributorProfile }>> {
  return meWrite(token, "/v1/openproduct/me", { method: "PUT", body: input }, fetchImpl);
}

/** CG0/CG1 — claim a handle (`"ada"`), or release the current one (`null`). */
export function claimHandle(
  token: string,
  handle: string | null,
  fetchImpl?: MeFetch,
): Promise<MeWriteResult<{ handle: string | null }>> {
  return meWrite(token, "/v1/openproduct/me/handle", { method: "PUT", body: { handle } }, fetchImpl);
}

/** CG1 — turn the public page on or off. Core refuses "on" without a handle
 *  and a name or bio, and says so in `fields.public`. */
export function setProfileVisibility(
  token: string,
  isPublic: boolean,
  fetchImpl?: MeFetch,
): Promise<MeWriteResult<{ contributor: ContributorProfile }>> {
  return meWrite(
    token,
    "/v1/openproduct/me/profile-visibility",
    { method: "PUT", body: { public: isPublic } },
    fetchImpl,
  );
}

/** LC5 — where somebody stands on the weekly digest. Three standings, not
 *  two: "never asked" and "asked and left" say different things to a reader. */
export function fetchDigestStanding(
  token: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ subscription: DigestSubscription }>> {
  return meRequest(token, "/v1/openproduct/me/digest", { method: "GET" }, fetchImpl);
}

export function setDigestSubscription(
  token: string,
  subscribed: boolean,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ subscription: DigestSubscription }>> {
  return meRequest(
    token,
    "/v1/openproduct/me/digest",
    { method: "PUT", body: { subscribed } },
    fetchImpl,
  );
}

export function fetchMyApplications(
  token: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ applications: ContributorApplication[] }>> {
  return meRequest(token, "/v1/openproduct/me/applications", { method: "GET" }, fetchImpl);
}

export function fetchSaved(
  token: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ products: PublicProfileCard[] }>> {
  return meRequest(token, "/v1/openproduct/me/saved", { method: "GET" }, fetchImpl);
}

export function saveProduct(
  token: string,
  slug: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ saved: boolean }>> {
  return meRequest(token, "/v1/openproduct/me/saved", { method: "PUT", body: { slug } }, fetchImpl);
}

export function unsaveProduct(
  token: string,
  slug: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ removed: boolean }>> {
  return meRequest(token, `/v1/openproduct/me/saved/${encodeURIComponent(slug)}`, { method: "DELETE" }, fetchImpl);
}

/**
 * The overlay's THREE bounded questions, as a closed list.
 *
 * A CLOSED LIST rather than a forwarded query string, for the reason the
 * header set above is a closed list: what leaves this app should be
 * enumerable in one place rather than filtered out of something wider.
 *
 * AND THREE RATHER THAN ONE, which is the OPP8 fix. `overlayPath()` in
 * `ui/overlay.ts` has always sent `ids`, `follows` and `posts`, and core has
 * always parsed all three (`handlers/me.ts`) — but this function took only
 * `ids`, so `follows` and `posts` were dropped at the one hop between them.
 * The visible effect was not an error: every follow button rendered
 * unfollowed and every comment vote unvoted, for a visitor who had done both,
 * because `isFollowing()` and `hasVotedOnPost()` read a list that was always
 * empty. Worse, the store `cover()`s what it ASKED rather than what it got,
 * so it recorded them answered and never asked again.
 *
 * That is why the parameter is a named object now: a third bound added later
 * has to be added HERE, where the list is, rather than silently not arriving.
 */
export interface OverlayBounds {
  /** Product slugs the page rendered (XP2). */
  ids: string | null;
  /** Follow keys — `topic:…`, `person:…` — the page rendered (FL0). */
  follows: string | null;
  /** Post ids the page rendered (DQ1). */
  posts: string | null;
}

/** The wire names, in one place, so the route and this function cannot
 *  disagree about which parameters exist. */
export const OVERLAY_BOUND_KEYS = ["ids", "follows", "posts"] as const;

/**
 * The personalisation overlay (XP2). Every bound is passed through verbatim —
 * core's `parseOverlayIds`, `parseFollowKeys` and `parseOverlayPostIds` are
 * the authority on what is parseable, and a second parser here would be a
 * second place for the two to disagree.
 */
export function fetchOverlay(
  token: string,
  bounds: OverlayBounds,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ overlay: MeOverlay }>> {
  const params = new URLSearchParams();
  for (const key of OVERLAY_BOUND_KEYS) {
    const value = bounds[key];
    if (value && value.length > 0) params.set(key, value);
  }
  const query = params.toString();
  return meRequest(
    token,
    `/v1/openproduct/me/overlay${query.length > 0 ? `?${query}` : ""}`,
    { method: "GET" },
    fetchImpl,
  );
}

/**
 * The PUBLIC act (EN1). A separate function over a separate endpoint from
 * `saveProduct`, and they must stay separate: one is private and one has the
 * visitor's name on it (OPC-3).
 */
/**
 * FL0 — follow or unfollow one target.
 *
 * ONE FUNCTION FOR BOTH VERBS AND BOTH KINDS, unlike `endorseProduct` and
 * `withdrawEndorsement` beside it. That asymmetry is deliberate: endorsing and
 * withdrawing are two acts over an append-only row with different meanings to
 * the integrity model, while following and unfollowing are one control's two
 * positions over a row that is simply there or not.
 *
 * The TARGET IS IN THE PATH for TS2's reason: the gateway refuses before core
 * is reached and never reads a body, so a bound can only see a target the URL
 * carries. (It happens that follows take no per-target bound — the reason is
 * in `velocity.ts` — but the shape stays the one the gateway can police.)
 */
export function setFollow(
  token: string,
  kind: string,
  value: string,
  following: boolean,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ follow: { kind: string; value: string; following: boolean; followers: number } }>> {
  return meRequest(
    token,
    `/v1/openproduct/me/follows/${encodeURIComponent(kind)}/${encodeURIComponent(value)}`,
    { method: following ? "PUT" : "DELETE" },
    fetchImpl,
  );
}

export function endorseProduct(
  token: string,
  slug: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ endorsement: { slug: string; state: string } }>> {
  // TS2 — the slug is in the PATH, not the body. The gateway refuses before
  // core is reached and never reads a body, so a per-listing velocity bound
  // can only see a target the URL carries.
  return meRequest(
    token,
    `/v1/openproduct/me/endorsements/${encodeURIComponent(slug)}`,
    { method: "PUT" },
    fetchImpl,
  );
}

export function withdrawEndorsement(
  token: string,
  slug: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ withdrawn: boolean }>> {
  return meRequest(
    token,
    `/v1/openproduct/me/endorsements/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
    fetchImpl,
  );
}

/**
 * File a report (openproduct-commons TS0's door, TS3's control).
 *
 * NOT under `/me`, and that is deliberate: a report is not a fact about the
 * reporter's own account, it is a message about somebody else's thing. The
 * core keeps it org-free for the same reason `/me` is — the only authority it
 * uses is "this subject" — but it is a different door with a different
 * answer, and filing it never changes anything the reporter can then read
 * back. The response says only that we received it.
 */
export function submitReport(
  token: string,
  input: { subjectKind: string; subjectRef: string; reason: string; detail?: string | null },
  fetchImpl?: MeFetch,
): Promise<MeResult<{ id: string; state: string }>> {
  return meRequest(token, "/v1/openproduct/reports", { method: "POST", body: input }, fetchImpl);
}

/**
 * CB1's two writes. Signed, always — there is no anonymous path, and core
 * refuses anybody without a public profile (CB-2, which inherits CG-2's
 * eligibility bound).
 */
export function createThread(
  token: string,
  input: { slug: string; tag: string; title: string; body: string },
  fetchImpl?: MeFetch,
): Promise<MeResult<{ threadId: string }>> {
  return meRequest(token, "/v1/openproduct/threads", { method: "POST", body: input }, fetchImpl);
}

/**
 * DQ0b — a comment on a listing.
 *
 * ITS OWN PATH rather than `/threads` with an absent tag, because it is a
 * different act to authorise and to rate-limit: the caller names a listing and
 * says something, and core decides whether that listing's one comment thread
 * exists yet. The slug rides in the BODY, like `createThread`'s — the gateway
 * does not read bodies, so the per-listing question is core's.
 */
/**
 * DQ1 — upvote a comment, or withdraw it.
 *
 * THE POST ID IS IN THE PATH, not the body. The gateway bounds votes per POST
 * and never reads a body, so a per-post limit can only see a target the URL
 * carries — the same division `endorse` already makes with a slug.
 */
/** NF0 — the inbox. Personal, so it is never cached anywhere. */
export function fetchInbox(
  token: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ items: InboxItem[]; unread: number }>> {
  return meRequest(token, "/v1/openproduct/me/notifications", { method: "GET" }, fetchImpl);
}

/** NF0 — move the read cursor. The one read action this product has. */
export function markInboxRead(
  token: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ unread: number }>> {
  return meRequest(token, "/v1/openproduct/me/notifications", { method: "PUT" }, fetchImpl);
}

export function setCommentVote(
  token: string,
  postId: string,
  on: boolean,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ voted: boolean }>> {
  return meRequest(
    token,
    `/v1/openproduct/posts/${encodeURIComponent(postId)}/vote`,
    { method: on ? "PUT" : "DELETE" },
    fetchImpl,
  );
}

export function createComment(
  token: string,
  input: { slug: string; body: string; tag?: string | null },
  fetchImpl?: MeFetch,
): Promise<MeResult<{ threadId: string; postId: string }>> {
  return meRequest(token, "/v1/openproduct/comments", { method: "POST", body: input }, fetchImpl);
}

export function createPost(
  token: string,
  threadId: string,
  body: string,
  /** CV1 — the post being answered, or null for a top-level post. */
  parentPostId: string | null = null,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ postId: string }>> {
  // TS2 — the thread is in the PATH, not the body. The gateway refuses before
  // core is reached and never reads a body, so a per-thread velocity bound
  // can only see a target the URL carries.
  return meRequest(
    token,
    `/v1/openproduct/threads/${encodeURIComponent(threadId)}/posts`,
    { method: "POST", body: parentPostId === null ? { body } : { body, parentPostId } },
    fetchImpl,
  );
}

export function maintainThread(
  token: string,
  threadId: string,
  body: { intent: "lock" | "unlock" | "answer"; postId?: string },
  fetchImpl?: MeFetch,
): Promise<MeResult<{ state: string }>> {
  return meRequest(
    token,
    `/v1/openproduct/threads/${encodeURIComponent(threadId)}`,
    { method: "POST", body },
    fetchImpl,
  );
}
