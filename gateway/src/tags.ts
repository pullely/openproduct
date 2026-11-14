// The public plane's cache tags (openproduct-performance OPP4a).
//
// Workers Caching stores a response under a key made of the path and query
// string; `Cache-Tag` is how a WRITE finds every key it invalidated without
// knowing what those keys were. `ctx.cache.purge({ tags })` then removes them
// across the whole network — and, unlike the zone purge API, it runs at Free
// tier limits **regardless of the account's plan**, which is what took this off
// D7's list of things waiting on a fact nobody here holds.
//
// ─── THE VOCABULARY IS FAMILIES, NOT DOCUMENTS ────────────────────────────
//
// A tag per listing slug would let a publish purge exactly one document. It
// would also put a caller-supplied string into a header, and the thing that
// actually invalidates these documents is not a single publish — it is THE
// SWEEP, which rebuilds the index, re-counts endorsements, ranks the boards
// and fires launches every ten minutes, changing whole families at once.
// Families are the grain the writer actually writes at.
//
// So: one tag naming the plane, and one naming the family. A sweep purges the
// families it touched; `op-public` is the blunt instrument for a deploy or an
// incident, and it exists because the alternative — discovering during an
// incident that no tag covers everything — is worse than one redundant tag.
//
// ─── WHAT THIS DOES *NOT* BUY, YET ────────────────────────────────────────
//
// A longer TTL. Sixty seconds is the retraction SLA (OD-H) and lengthening it
// is D2, which is open. What a purge buys TODAY is a retraction that lands in
// about a second instead of up to sixty — strictly better than the promise,
// without spending the decision. What it buys TOMORROW is the mechanism that
// makes D2 answerable at all: "safe to be stale for five minutes" is only a
// sane question once a write can end the staleness on demand.

/** Every public document carries this. The whole-plane purge. */
export const TAG_PUBLIC = "op-public";

/** The families, in the shape the sweep changes them. */
export const TAG_FEED = "op-feed";
export const TAG_CATALOG = "op-catalog";
export const TAG_LISTING = "op-listing";
export const TAG_PEOPLE = "op-people";
export const TAG_TOPICS = "op-topics";
export const TAG_BOARD = "op-board";
export const TAG_DIGEST = "op-digest";
export const TAG_COLLECTIONS = "op-collections";
export const TAG_SEARCH = "op-search";
export const TAG_LEADERBOARD = "op-leaderboard";
export const TAG_THREADS = "op-threads";
export const TAG_TRANSPARENCY = "op-transparency";
/** OPR-3 — product posts: the feed, one post, one product's posts. */
export const TAG_POSTS = "op-posts";

/** Every tag this worker will ever emit. The suite walks it. */
export const ALL_TAGS = [
  TAG_PUBLIC,
  TAG_FEED,
  TAG_CATALOG,
  TAG_LISTING,
  TAG_PEOPLE,
  TAG_TOPICS,
  TAG_BOARD,
  TAG_DIGEST,
  TAG_COLLECTIONS,
  TAG_SEARCH,
  TAG_LEADERBOARD,
  TAG_THREADS,
  TAG_TRANSPARENCY,
  TAG_POSTS,
] as const;

/**
 * The families a public path belongs to.
 *
 * DRIVEN BY THE ROUTER'S OWN PATHS, not by a guess at their shape — a first
 * draft of this table tested for `/v1/public/openproduct/catalog`, which is
 * not a path this worker serves (the catalogue is `/v1/products` and
 * `/v1/facets`), so the catalogue would have carried no family tag and a purge
 * would have missed it silently. `tags.test.ts` now walks every public route
 * the router declares and asserts each one lands on a family.
 *
 * A path may belong to MORE THAN ONE family, and two do: a listing's roster is
 * both the listing and the people, and the sidebar (OPP7's one round trip) is
 * built from the topics and the catalogue at once. Purging either family has
 * to reach them.
 *
 * The fallthrough is the listing family rather than nothing, because the
 * public branch's own fallthrough is a profile read. A public document with no
 * family tag is one a purge can only reach via `op-public`, and silently.
 */
export function publicCacheTags(pathname: string): string[] {
  const p = pathname;
  const families: string[] = [];
  const add = (...tags: string[]) => {
    for (const tag of tags) if (!families.includes(tag)) families.push(tag);
  };

  if (p === "/v1/public/openproduct/transparency") add(TAG_TRANSPARENCY);
  else if (p.startsWith("/v1/public/openproduct/collections")) add(TAG_COLLECTIONS);
  else if (p.startsWith("/v1/public/openproduct/launches")) add(TAG_BOARD);
  else if (p.startsWith("/v1/public/openproduct/digest")) add(TAG_DIGEST);
  else if (p === "/v1/public/openproduct/feed") add(TAG_FEED);
  else if (p === "/v1/public/openproduct/leaderboard") add(TAG_LEADERBOARD);
  else if (p === "/v1/public/openproduct/sidebar") add(TAG_TOPICS, TAG_CATALOG);
  else if (p.startsWith("/v1/public/openproduct/topics")) add(TAG_TOPICS);
  else if (p.startsWith("/v1/public/openproduct/threads")) add(TAG_THREADS);
  else if (p === "/v1/public/openproduct/contributors") add(TAG_PEOPLE);
  // OPR-3 — a person's posts are posts first: a publish purges them with the
  // feed, and a change to the person's page purges them with the person.
  else if (/^\/v1\/public\/openproduct\/people\/[^/]+\/product-posts$/.test(p)) add(TAG_POSTS, TAG_PEOPLE);
  else if (p.startsWith("/v1/public/openproduct/people")) add(TAG_PEOPLE);
  else if (p === "/v1/search") add(TAG_SEARCH);
  else if (p === "/v1/facets") add(TAG_CATALOG);
  else if (p === "/v1/products" || p.startsWith("/v1/products/")) add(TAG_CATALOG);
  else if (p.startsWith("/v1/public/openproduct/product-posts")) add(TAG_POSTS);
  else if (/^\/v1\/public\/openproduct\/projects\/[^/]+\/product-posts$/.test(p)) add(TAG_POSTS, TAG_LISTING);
  else if (/^\/v1\/public\/openproduct\/projects\/[^/]+\/threads$/.test(p)) add(TAG_THREADS, TAG_LISTING);
  else if (/^\/v1\/public\/openproduct\/projects\/[^/]+\/people$/.test(p)) add(TAG_LISTING, TAG_PEOPLE);
  else add(TAG_LISTING);

  return [TAG_PUBLIC, ...families];
}

/** The header value. Comma-separated, per Cloudflare's `Cache-Tag`. */
export function cacheTagHeader(pathname: string): string {
  return publicCacheTags(pathname).join(",");
}

/**
 * Which families a sweep run actually changed (OPP4a).
 *
 * THE SWEEP IS THE NATURAL PURGER because it is the thing that changes what
 * these documents say. It rebuilds the search index, re-counts endorsements,
 * ranks the boards, fires launches and cuts the digest — every ten minutes,
 * inward-only. A publish is not the invalidating event here; the sweep that
 * notices it is.
 *
 * NOTHING CHANGED MEANS NOTHING PURGED. A sweep run that observed no source,
 * rebuilt no index and ranked no board returns `[]`, and the caller sends no
 * purge at all. `ctx.cache.purge()` is rate-limited at Free-tier limits
 * regardless of plan, and this runs every ten minutes in three environments —
 * spending that budget on runs that changed nothing is how a purge path stops
 * working on the day it matters.
 */
export function purgeTagsForSweep(result: {
  observed: number;
  reindexed: boolean;
  integritySwept: boolean;
  launchesFired: { live: number; missed: number };
  defenceSwept: boolean;
  boardsRanked: number;
  digest: { queued: number; sent: number };
  captures: { looked: number; captured: number; failed: number };
}): string[] {
  const tags: string[] = [];
  const add = (...names: string[]) => {
    for (const name of names) if (!tags.includes(name)) tags.push(name);
  };

  // Ingestion wrote observations onto listings, which the directory, the feed
  // and the catalogue all render.
  if (result.observed > 0) add(TAG_LISTING, TAG_CATALOG, TAG_FEED);
  if (result.reindexed) add(TAG_SEARCH);
  // The integrity sweep moves endorsement counts, which appear on the listing,
  // in the catalogue, on the feed row, on the leaderboard and beside a person.
  if (result.integritySwept) add(TAG_LISTING, TAG_CATALOG, TAG_FEED, TAG_LEADERBOARD, TAG_PEOPLE);
  if (result.launchesFired.live > 0 || result.launchesFired.missed > 0) add(TAG_BOARD, TAG_FEED);
  if (result.boardsRanked > 0) add(TAG_BOARD);
  if (result.defenceSwept) add(TAG_LISTING, TAG_LEADERBOARD);
  if (result.digest.sent > 0 || result.digest.queued > 0) add(TAG_DIGEST);
  // MD4 — a new capture changes the listing page and nothing else: the row's
  // tile is the hero (MD3), never the screenshot, so the feed stands.
  if (result.captures.captured > 0) add(TAG_LISTING);

  return tags;
}

/**
 * What a WRITE has to purge (openproduct-performance OPP14).
 *
 * The sweep purges families when it changes them; a visitor's own act did
 * not, so a new comment sat behind this cache for up to sixty seconds and
 * behind the web's for sixty more. The writer no longer waits on that
 * (`web/src/app/ui/conversation-live.tsx` draws their post at once), but
 * everyone else did.
 *
 * ONLY THE DISCUSSION FAMILY. A comment, a reply, a new thread and a vote on
 * a post all change `op-threads` documents and nothing else that is cached
 * here: a listing's endorsement count reaches the page through the sweep's
 * metrics, and purging the catalogue on every upvote would spend the
 * Free-tier purge budget on a number that is recomputed on a schedule.
 */
export function purgeTagsForWrite(pathname: string, action: string): string[] {
  // A comment under a product post is a reply in its thread (OPR-3), so it
  // purges the thread like any other. The comment COUNT on the post's card
  // is not purged with it: this layer cannot tell a product post's thread
  // from a forum thread without a read, and the count is true again within
  // the document's sixty seconds.
  // OPR-4 — a reply in a PRIVATE thread changes no cached document: a
  // private thread is in none of them. (A new private thread arrives on the
  // same path as a public one — the visibility is in the body, which this
  // layer does not read — so that purge stays; it costs one tag.)
  if (/^\/v1\/openproduct\/threads\/private(?:\/|$)/.test(pathname)) return [];
  if (action === "post" || action === "thread-create") return [TAG_THREADS];
  if (action === "endorse" && /^\/v1\/openproduct\/posts\/[^/]+\/vote$/.test(pathname)) {
    return [TAG_THREADS];
  }
  // OPR-3 — a reaction moves the counts on a product post's card.
  if (action === "endorse" && /^\/v1\/openproduct\/me\/product-post-reactions\/[^/]+$/.test(pathname)) {
    return [TAG_POSTS];
  }
  if (action === "listing-write") return purgeTagsForCrewWrite(pathname);
  return [];
}

const CREW_PROFILE = "^/v1/organizations/[^/]+/openproduct/profiles/[^/]+";

/**
 * OPR-3 — what a crew write on a product page has to purge.
 *
 * The product page is where its crew edits it (design §2 rule 5), so the
 * person who pressed Save or Post is looking at the public page when the
 * answer comes back; sixty seconds of the old one reads as a save that did
 * not take. By path, because this layer never reads a body:
 *
 *   a product post published, edited or removed   the feed and the post
 *   a milestone written, shipped or reordered     the product page — and,
 *                                                 since a post's card carries
 *                                                 its product's stage, the
 *                                                 feed when shipping changed
 *   the listing itself patched (name, tagline,    the product page
 *   the Try it address)
 *
 * CREATING a draft purges nothing: `POST …/product-posts` writes a row no
 * public read returns. Editing one does purge, because a draft and a
 * published post are edited at the same address and telling them apart would
 * take the body; the cost is one tag on a crew member's own save.
 *
 * The catalogue's cards carry the stage too and are NOT purged here: they are
 * read from the table the sweep materialises every ten minutes, so a purge
 * would refill the cache with the same card.
 */
function purgeTagsForCrewWrite(pathname: string): string[] {
  if (new RegExp(`${CREW_PROFILE}/product-posts/[^/]+(?:/publish)?$`).test(pathname)) return [TAG_POSTS];
  if (new RegExp(`${CREW_PROFILE}/milestones/[^/]+/shipped$`).test(pathname)) return [TAG_LISTING, TAG_POSTS];
  if (new RegExp(`${CREW_PROFILE}/milestones(?:/[^/]+)?$`).test(pathname)) return [TAG_LISTING];
  if (new RegExp(`${CREW_PROFILE}$`).test(pathname)) return [TAG_LISTING];
  return [];
}

/**
 * The purge, with its failure said and never thrown. Shared by the sweep
 * and the write path: a failed purge leaves documents that expire in sixty
 * seconds anyway, which is a slower answer and not a wrong one.
 */
export async function purgeTags(
  ctx: { cache?: { purge(options: { tags: string[] }): Promise<{ success: boolean; errors?: unknown }> } },
  tags: string[],
): Promise<void> {
  if (tags.length === 0 || !ctx.cache) return;
  try {
    const purged = await ctx.cache.purge({ tags });
    if (!purged.success) {
      console.warn(
        JSON.stringify({ level: "warn", msg: "cache_purge_failed", tags, errors: purged.errors }),
      );
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "cache_purge_threw",
        tags,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
