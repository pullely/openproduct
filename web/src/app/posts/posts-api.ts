// Product posts: the readers and the reader's own writes (openproduct-redesign
// OPR-3, design §6.2).
//
// TWO HALVES IN ONE FILE, AND THEY CANNOT BE CONFUSED FOR EACH OTHER.
//
//   public   `fetchFeedPage`, `fetchProductPosts`, `fetchAuthorPosts`, `fetchProductPost` go
//            through `readPublic` (`public-api.ts`): no credential, the 60s
//            revalidate, `null` for a read that did not answer. There is no
//            token parameter to pass by accident.
//   mine     `setReaction`, `clearReaction`, `fetchFollowing` take a REQUIRED
//            token and are `no-store` (the `me-api.ts` discipline), answering
//            in `MeResult` / `MeWriteResult`.
//
// A PRODUCT POST IS NOT A FORUM POST. Everything here says `ProductPost`; the
// thread replies under a post are `PublicPost` and are read with
// `fetchThread(post.threadId)` from `public-api.ts`.
//
// The crew's own routes (drafts, milestones, needs-you) are in `crew-api.ts`.

import {
  PRODUCT_POST_API,
  PRODUCT_POST_ID_RE,
  isProductPostKind,
  type MeFollowing,
  type ProductPostReaction,
  type ProductPostReactionState,
  type ProductPostsPage,
  type PublicProductPost,
} from "@openproduct/contracts";

import { meHeaders, type MeFetch, type MeResult, type MeWriteResult } from "../me/me-api";
import { publicApiBase, readPublic, type PublicFetch } from "../public-api";

/**
 * A post this page can draw: an id, a kind in the vocabulary, a product with
 * a slug, blocks that are a list. Anything else is dropped from a page rather
 * than handed to a card — a card renders what the catalogue names and has no
 * branch for a shape it was never promised.
 */
export function isDrawablePost(value: unknown): value is PublicProductPost {
  if (typeof value !== "object" || value === null) return false;
  const post = value as Partial<PublicProductPost>;
  return (
    typeof post.id === "string" &&
    isProductPostKind(post.kind) &&
    typeof post.product === "object" &&
    post.product !== null &&
    typeof post.product.slug === "string" &&
    Array.isArray(post.blocks) &&
    typeof post.publishedAt === "string"
  );
}

function pageOf(data: { posts?: unknown; next?: unknown } | null): ProductPostsPage | null {
  if (!data || !Array.isArray(data.posts)) return null;
  return {
    posts: data.posts.filter(isDrawablePost),
    next: typeof data.next === "string" && data.next.length > 0 ? data.next : null,
  };
}

/**
 * One page of the feed: every listed product's published posts, newest first.
 *
 * `null` AND AN EMPTY PAGE ARE DIFFERENT ANSWERS (the OD5 finding):
 *
 *   `{posts: [], next: null}`  the feed is reachable and nobody has posted
 *   `null`                     it could not be read (5xx, unreachable, a body
 *                              that is not a page, a cursor it did not issue)
 *
 * `cursor` is the previous page's `next`, opaque, and lives in a URL.
 */
export async function fetchFeedPage(
  cursor: string | null = null,
  fetchImpl?: PublicFetch,
): Promise<ProductPostsPage | null> {
  return pageOf(await readPublic<{ posts?: unknown; next?: unknown }>(PRODUCT_POST_API.feed(cursor), fetchImpl));
}

/**
 * One product's published posts, newest first. `null` covers an unknown
 * product, an unlisted one and a failed read alike — the API answers the
 * first two identically on purpose, and the product page already 404s on its
 * own read before it asks for this.
 */
export async function fetchProductPosts(
  slug: string,
  cursor: string | null = null,
  fetchImpl?: PublicFetch,
): Promise<ProductPostsPage | null> {
  return pageOf(
    await readPublic<{ posts?: unknown; next?: unknown }>(PRODUCT_POST_API.ofProduct(slug, cursor), fetchImpl),
  );
}

/**
 * The published posts one person pressed Post on, across every product,
 * newest first — the Posts section of their page. `handle` is the canonical
 * (lower-case) one. `null` covers a person with no public page and a failed
 * read alike; the person's page 404s on its own read before it asks for this.
 */
export async function fetchAuthorPosts(
  handle: string,
  cursor: string | null = null,
  fetchImpl?: PublicFetch,
): Promise<ProductPostsPage | null> {
  return pageOf(
    await readPublic<{ posts?: unknown; next?: unknown }>(PRODUCT_POST_API.ofAuthor(handle, cursor), fetchImpl),
  );
}

/**
 * One published post. `null` covers "no such post", "not published", "its
 * product is not listed" and "could not be read": the page 404s on all four
 * rather than say which. An id that is not a post id never reaches the
 * network.
 */
export async function fetchProductPost(
  postId: string,
  fetchImpl?: PublicFetch,
): Promise<PublicProductPost | null> {
  if (!PRODUCT_POST_ID_RE.test(postId)) return null;
  const data = await readPublic<{ post?: unknown }>(PRODUCT_POST_API.post(postId), fetchImpl);
  return data && isDrawablePost(data.post) ? data.post : null;
}

// ─── mine ──────────────────────────────────────────────────────────────────

async function mine<T>(
  token: string,
  path: string,
  init: { method: string; body?: unknown },
  fetchImpl: MeFetch = fetch,
): Promise<MeWriteResult<T>> {
  try {
    const res = await fetchImpl(`${publicApiBase()}${path}`, {
      method: init.method,
      headers: meHeaders(token, init.body !== undefined),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
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
    const data = ((await res.json()) as { data?: T }).data;
    return data === undefined || data === null ? { kind: "unavailable" } : { kind: "ok", data };
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * Set my reaction on a post (one per person per post; setting another
 * replaces it). `refused` with status 409 is "this is your own post", 404 is
 * a post that is not published; neither is an outage.
 */
export function setReaction(
  token: string,
  postId: string,
  reaction: ProductPostReaction,
  fetchImpl?: MeFetch,
): Promise<MeWriteResult<{ reaction: ProductPostReactionState }>> {
  return mine(token, PRODUCT_POST_API.reaction(postId), { method: "PUT", body: { reaction } }, fetchImpl);
}

/** Clear my reaction on a post. Idempotent. */
export function clearReaction(
  token: string,
  postId: string,
  fetchImpl?: MeFetch,
): Promise<MeWriteResult<{ reaction: ProductPostReactionState }>> {
  return mine(token, PRODUCT_POST_API.reaction(postId), { method: "DELETE" }, fetchImpl);
}

/**
 * The products and people I follow, for `/me` and the feed's Following view.
 * Personal, so never cached; `unauthorized` reads as signed out and
 * `unavailable` renders an error state, like every other `/me` read.
 */
export async function fetchFollowing(
  token: string,
  fetchImpl?: MeFetch,
): Promise<MeResult<{ following: MeFollowing }>> {
  const result = await mine<{ following?: Partial<MeFollowing> }>(
    token,
    PRODUCT_POST_API.following(),
    { method: "GET" },
    fetchImpl,
  );
  if (result.kind === "unauthorized") return result;
  if (result.kind !== "ok" || !result.data.following) return { kind: "unavailable" };
  const { products, people } = result.data.following;
  return {
    kind: "ok",
    data: {
      following: {
        products: Array.isArray(products) ? products : [],
        people: Array.isArray(people) ? people : [],
      },
    },
  };
}
