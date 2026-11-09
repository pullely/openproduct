// The public plane's cache tags (openproduct-performance OPP4a).
//
// `Cache-Tag` is how a WRITE finds the cache entries it invalidated without
// knowing what their keys were. Two ways to get that wrong, and this suite is
// built around both:
//
//   1. A tag table that tests for paths the worker does not serve. The first
//      draft of `tags.ts` looked for `/v1/public/openproduct/catalog`; the
//      catalogue is actually `/v1/products` and `/v1/facets`, so every
//      catalogue document would have carried no family tag and every purge
//      would have missed it — silently, which is this epic's recurring shape.
//   2. A purge that fires on every sweep run. `ctx.cache.purge()` is
//      rate-limited at Free-tier limits regardless of plan, and the sweep runs
//      every ten minutes in three environments. A purge path that spends its
//      budget on runs that changed nothing stops working on the day it matters.

import {
  ALL_TAGS,
  TAG_PUBLIC,
  TAG_THREADS,
  cacheTagHeader,
  publicCacheTags,
  purgeTags,
  purgeTagsForSweep,
  purgeTagsForWrite,
} from "@openproduct-gateway/tags";

/** A quiet run: the sweep looked and found nothing to do. */
const QUIET = {
  observed: 0,
  reindexed: false,
  integritySwept: false,
  launchesFired: { live: 0, missed: 0 },
  defenceSwept: false,
  boardsRanked: 0,
  digest: { queued: 0, sent: 0 },
  captures: { looked: 0, captured: 0, failed: 0 },
};

describe("every public document says which family it belongs to", () => {
  // The same list `router.test.ts` walks to prove every public path can be
  // MAPPED. If a route is added there and not here, this fails.
  const publicPaths: [string, string][] = [
    ["/v1/public/openproduct/feed", "op-feed"],
    ["/v1/public/openproduct/leaderboard", "op-leaderboard"],
    ["/v1/public/openproduct/sidebar", "op-topics"],
    ["/v1/public/openproduct/topics", "op-topics"],
    ["/v1/public/openproduct/topics/dev-tools", "op-topics"],
    ["/v1/public/openproduct/projects", "op-listing"],
    ["/v1/public/openproduct/projects/acme-thing", "op-listing"],
    ["/v1/public/openproduct/projects/acme-thing/people", "op-listing"],
    ["/v1/public/openproduct/projects/acme-thing/threads", "op-threads"],
    ["/v1/public/openproduct/threads/0d5e1f2a-1111-2222-3333-444455556666", "op-threads"],
    ["/v1/public/openproduct/launches", "op-board"],
    ["/v1/public/openproduct/launches/2026-08-26", "op-board"],
    ["/v1/public/openproduct/collections", "op-collections"],
    ["/v1/public/openproduct/collections/worth-a-look", "op-collections"],
    ["/v1/public/openproduct/digest", "op-digest"],
    ["/v1/public/openproduct/digest/2026-w21", "op-digest"],
    ["/v1/public/openproduct/transparency", "op-transparency"],
    ["/v1/public/openproduct/people", "op-people"],
    ["/v1/public/openproduct/people/ada", "op-people"],
    ["/v1/public/openproduct/contributors", "op-people"],
    // The catalogue — the family the first draft of this table could not see.
    ["/v1/products", "op-catalog"],
    ["/v1/products/acme-thing", "op-catalog"],
    ["/v1/facets", "op-catalog"],
    ["/v1/search", "op-search"],
  ];

  it.each(publicPaths)("%s carries %s", (path, family) => {
    expect(publicCacheTags(path)).toContain(family);
  });

  it("tags every one of them with the whole-plane tag too", () => {
    // `op-public` is the blunt instrument, and it exists because discovering
    // during an incident that no tag covers everything is worse than one
    // redundant tag on every response.
    for (const [path] of publicPaths) {
      expect([path, publicCacheTags(path)[0]]).toEqual([path, TAG_PUBLIC]);
    }
  });

  it("emits only tags from the declared vocabulary", () => {
    for (const [path] of publicPaths) {
      for (const tag of publicCacheTags(path)) {
        expect([path, tag, (ALL_TAGS as readonly string[]).includes(tag)]).toEqual([path, tag, true]);
      }
    }
  });

  it("gives the two composite documents both of their families", () => {
    // A listing's roster is the listing AND the people; the sidebar (OPP7's
    // one round trip) is built from the topics AND the catalogue. Purging
    // either family has to reach them.
    expect(publicCacheTags("/v1/public/openproduct/projects/acme/people")).toEqual([
      "op-public",
      "op-listing",
      "op-people",
    ]);
    expect(publicCacheTags("/v1/public/openproduct/sidebar")).toEqual([
      "op-public",
      "op-topics",
      "op-catalog",
    ]);
  });

  it("renders the header comma-separated, as Cloudflare reads it", () => {
    expect(cacheTagHeader("/v1/public/openproduct/feed")).toBe("op-public,op-feed");
  });
});

describe("a sweep purges what it changed, and nothing when it changed nothing", () => {
  it("sends no purge at all for a run that did nothing", () => {
    expect(purgeTagsForSweep(QUIET)).toEqual([]);
  });

  it("MD4 — a new capture purges the listing, and only the listing; a failed one purges nothing", () => {
    expect(purgeTagsForSweep({ ...QUIET, captures: { looked: 1, captured: 1, failed: 0 } })).toEqual(["op-listing"]);
    expect(purgeTagsForSweep({ ...QUIET, captures: { looked: 2, captured: 0, failed: 2 } })).toEqual([]);
  });

  it("purges search when — and only when — the index was rebuilt", () => {
    expect(purgeTagsForSweep({ ...QUIET, reindexed: true })).toEqual(["op-search"]);
    expect(purgeTagsForSweep(QUIET)).not.toContain("op-search");
  });

  it("follows an endorsement re-count everywhere a count is rendered", () => {
    // A count appears on the listing, in the catalogue, on the feed row, on
    // the leaderboard and beside a person. Missing one leaves a stale number
    // on a page for as long as its TTL.
    const tags = purgeTagsForSweep({ ...QUIET, integritySwept: true });
    expect(tags.sort()).toEqual(
      ["op-catalog", "op-feed", "op-leaderboard", "op-listing", "op-people"].sort(),
    );
  });

  it("purges the board when launches fire, whether they were live or missed", () => {
    expect(purgeTagsForSweep({ ...QUIET, launchesFired: { live: 1, missed: 0 } })).toContain("op-board");
    expect(purgeTagsForSweep({ ...QUIET, launchesFired: { live: 0, missed: 3 } })).toContain("op-board");
  });

  it("never repeats a tag, however many phases touched the same family", () => {
    const tags = purgeTagsForSweep({
      observed: 4,
      reindexed: true,
      integritySwept: true,
      launchesFired: { live: 2, missed: 1 },
      defenceSwept: true,
      boardsRanked: 3,
      digest: { queued: 1, sent: 1 },
      captures: { looked: 0, captured: 0, failed: 0 },
    });
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("only ever names tags a document actually carries", () => {
    // A purge for a tag nothing emits is a purge that does nothing, reports
    // success, and spends rate-limit budget doing it.
    const tags = purgeTagsForSweep({
      observed: 4,
      reindexed: true,
      integritySwept: true,
      launchesFired: { live: 2, missed: 1 },
      defenceSwept: true,
      boardsRanked: 3,
      digest: { queued: 1, sent: 1 },
      captures: { looked: 0, captured: 0, failed: 0 },
    });
    for (const tag of tags) {
      expect([tag, (ALL_TAGS as readonly string[]).includes(tag)]).toEqual([tag, true]);
    }
  });
});

describe("a discussion write purges the family it changed (OPP14)", () => {
  // The sweep purges on a schedule; a POST that made a comment used to wait
  // for it, or for the sixty-second TTL, before anybody but the author could
  // see the comment. This is the write-side purge: the three writes that
  // change a thread document name `op-threads`, and nothing else names
  // anything, because every purge spends the same rate-limited budget.

  it("names the thread family for a comment, a reply and a new thread", () => {
    expect(purgeTagsForWrite("/v1/openproduct/comments", "post")).toEqual([TAG_THREADS]);
    expect(purgeTagsForWrite("/v1/openproduct/threads/thr_1/posts", "post")).toEqual([TAG_THREADS]);
    expect(purgeTagsForWrite("/v1/openproduct/threads", "thread-create")).toEqual([TAG_THREADS]);
  });

  it("names it for a vote ON A POST, and not for an endorsement of a listing", () => {
    // Both are `endorse` to the velocity rules — same act, same bound. Only
    // the post vote changes a thread document; a listing's endorsement count
    // lives in the listing and the feed, which have their own sweep.
    expect(
      purgeTagsForWrite("/v1/openproduct/posts/0d5e1f2a-1111-2222-3333-444455556666/vote", "endorse"),
    ).toEqual([TAG_THREADS]);
    expect(purgeTagsForWrite("/v1/openproduct/me/endorsements/acme-thing", "endorse")).toEqual([]);
  });

  it("names nothing for every other write", () => {
    for (const [path, action] of [
      ["/v1/openproduct/me/saved/acme-thing", "save"],
      ["/v1/openproduct/me/follows/topic/dev-tools", "follow"],
      ["/v1/openproduct/me", "profile-write"],
      ["/v1/openproduct/me/handle", "handle-claim"],
      ["/v1/openproduct/reports", "report"],
      ["/v1/organizations/org_1/openproduct/profiles/p_1/publish", "listing-publish"],
    ]) {
      expect([path, purgeTagsForWrite(path!, action!)]).toEqual([path, []]);
    }
  });

  it("only ever names a tag a document actually carries", () => {
    for (const tag of purgeTagsForWrite("/v1/openproduct/comments", "post")) {
      expect((ALL_TAGS as readonly string[]).includes(tag)).toBe(true);
    }
    // And the documents it means to purge DO carry it.
    expect(publicCacheTags("/v1/public/openproduct/projects/acme-thing/threads")).toContain(TAG_THREADS);
    expect(publicCacheTags("/v1/public/openproduct/threads/0d5e1f2a-1111-2222-3333-444455556666")).toContain(
      TAG_THREADS,
    );
  });

  describe("the purge itself", () => {
    // ESM jest has no `jest` global to spy with; the swap is by hand.
    const realWarn = console.warn;
    let warned: string[] = [];
    beforeEach(() => {
      warned = [];
      console.warn = (line: unknown) => {
        warned.push(String(line));
      };
    });
    afterEach(() => {
      console.warn = realWarn;
    });

    it("asks the cache for exactly the tags it was given", async () => {
      const calls: string[][] = [];
      await purgeTags(
        { cache: { purge: async ({ tags }) => (calls.push(tags), { success: true }) } },
        [TAG_THREADS],
      );
      expect(calls).toEqual([[TAG_THREADS]]);
      expect(warned).toEqual([]);
    });

    it("spends nothing on an empty list, or where there is no cache to purge", async () => {
      const calls: string[][] = [];
      const cache = { purge: async ({ tags }: { tags: string[] }) => (calls.push(tags), { success: true }) };
      await purgeTags({ cache }, []);
      await purgeTags({}, [TAG_THREADS]);
      expect(calls).toEqual([]);
    });

    it("says a failed purge and never throws it — the document expires in sixty seconds anyway", async () => {
      await expect(
        purgeTags({ cache: { purge: async () => ({ success: false, errors: ["rate limited"] }) } }, [TAG_THREADS]),
      ).resolves.toBeUndefined();
      await expect(
        purgeTags(
          {
            cache: {
              purge: async () => {
                throw new Error("boom");
              },
            },
          },
          [TAG_THREADS],
        ),
      ).resolves.toBeUndefined();
      const said = warned.map((line) => JSON.parse(line) as { msg: string; tags: string[] });
      expect(said.map((line) => line.msg)).toEqual(["cache_purge_failed", "cache_purge_threw"]);
      expect(said.map((line) => line.tags)).toEqual([[TAG_THREADS], [TAG_THREADS]]);
    });
  });
});
