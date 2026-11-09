// The posts this browser made, before the document has them
// (openproduct-performance OPP14), driven against a fake storage and clock.
//
// What is pinned: a post is drawn the moment it is made; the server's id
// settles it; a refusal fails it with the reason and the words survive; a
// settled post survives a reload (storage) and a pending one does not; the
// document catching up removes it; the TTL bounds how long a post can be
// shown from this browser's memory alone.

import {
  LIVE_POSTS_STORAGE_KEY,
  LIVE_POST_TTL_MS,
  addLivePost,
  conversationKey,
  dropLivePost,
  emptyLivePosts,
  failLivePost,
  livePosts,
  livePostsFor,
  loadLivePosts,
  reconcileLivePosts,
  resetLivePostsForTests,
  settleLivePost,
  subscribeLivePosts,
} from "@openproduct-web/app/ui/live-posts";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

const LISTING = conversationKey("listing", "kettleworks");
const THREAD = conversationKey("thread", "thr_1");

const draft = (conversation = LISTING, parentPostId: string | null = null) => ({
  conversation,
  parentPostId,
  body: "Does it boil water **carefully**?",
  authorName: "Ada Lovelace",
  authorHandle: "ada",
});

let clock = 1_700_000_000_000;
let storage = fakeStorage();

beforeEach(() => {
  clock = 1_700_000_000_000;
  storage = fakeStorage();
  resetLivePostsForTests({ storage, now: () => clock });
});

describe("the conversation key", () => {
  it("keeps a listing's comment section and a thread apart", () => {
    expect(conversationKey("listing", "x")).toBe("listing:x");
    expect(conversationKey("thread", "x")).toBe("thread:x");
    expect(conversationKey("listing", "x")).not.toBe(conversationKey("thread", "x"));
  });
});

describe("a post's life", () => {
  it("is drawn the moment it is made, as pending, with the visitor's name on it", () => {
    const seen: number[] = [];
    const stop = subscribeLivePosts(() => seen.push(livePosts().length));
    const clientId = addLivePost(draft());
    stop();
    expect(seen).toEqual([1]);
    expect(livePostsFor(LISTING)).toEqual([
      {
        clientId,
        id: null,
        conversation: LISTING,
        parentPostId: null,
        body: "Does it boil water **carefully**?",
        authorName: "Ada Lovelace",
        authorHandle: "ada",
        createdAt: new Date(clock).toISOString(),
        status: "pending",
        error: null,
      },
    ]);
    expect(livePostsFor(THREAD)).toEqual([]);
  });

  it("is settled by the server's id", () => {
    const clientId = addLivePost(draft());
    settleLivePost(clientId, "post_1");
    expect(livePostsFor(LISTING)[0]).toMatchObject({ id: "post_1", status: "posted", error: null });
  });

  it("fails with the reason, and is replaced by the next attempt", () => {
    const first = addLivePost(draft());
    failLivePost(first, "The discussion may be closed");
    expect(livePostsFor(LISTING)[0]).toMatchObject({ status: "failed", error: "The discussion may be closed" });
    // Pressing Post again with the words back in the box: one post, not two.
    const second = addLivePost(draft());
    expect(livePostsFor(LISTING).map((p) => p.clientId)).toEqual([second]);
    // A failed post in ANOTHER conversation is not this one's to drop.
    const elsewhere = addLivePost(draft(THREAD));
    failLivePost(elsewhere, "closed");
    addLivePost(draft());
    expect(livePostsFor(THREAD)).toHaveLength(1);
  });

  it("can be dropped, which is what a stale sign-in hint does", () => {
    const clientId = addLivePost(draft());
    dropLivePost(clientId);
    expect(livePosts()).toEqual([]);
  });

  it("keeps the parent, so a reply is drawn under the post it answers", () => {
    addLivePost(draft(THREAD, "post_parent"));
    expect(livePostsFor(THREAD)[0]?.parentPostId).toBe("post_parent");
  });
});

describe("the document catching up", () => {
  it("removes a settled post the page now renders, and keeps the ones it does not", () => {
    const a = addLivePost(draft());
    const b = addLivePost(draft());
    settleLivePost(a, "post_a");
    settleLivePost(b, "post_b");
    reconcileLivePosts(LISTING, ["post_a", "post_older"]);
    expect(livePostsFor(LISTING).map((p) => p.id)).toEqual(["post_b"]);
  });

  it("never removes a pending post — it has no id the page could carry", () => {
    addLivePost(draft());
    reconcileLivePosts(LISTING, ["post_x"]);
    expect(livePostsFor(LISTING)).toHaveLength(1);
  });

  it("only touches the conversation that was rendered", () => {
    const a = addLivePost(draft(THREAD));
    settleLivePost(a, "post_a");
    reconcileLivePosts(LISTING, ["post_a"]);
    expect(livePostsFor(THREAD)).toHaveLength(1);
  });

  it("publishes nothing when nothing changed", () => {
    let calls = 0;
    const stop = subscribeLivePosts(() => calls++);
    reconcileLivePosts(LISTING, ["post_x"]);
    stop();
    expect(calls).toBe(0);
  });
});

describe("what survives a reload", () => {
  it("a settled post, with its id, and nothing pending or failed", () => {
    const a = addLivePost(draft());
    settleLivePost(a, "post_a");
    addLivePost(draft());
    const c = addLivePost(draft(THREAD));
    failLivePost(c, "no");
    const stored = JSON.parse(storage.map.get(LIVE_POSTS_STORAGE_KEY) ?? "[]") as unknown[];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: "post_a", status: "posted" });

    // A new document in the same browser.
    resetLivePostsForTests({ storage, now: () => clock });
    expect(livePosts()).toEqual([]);
    loadLivePosts();
    expect(livePostsFor(LISTING).map((p) => p.id)).toEqual(["post_a"]);
  });

  it("clears the key when nothing settled is left", () => {
    const a = addLivePost(draft());
    settleLivePost(a, "post_a");
    expect(storage.map.has(LIVE_POSTS_STORAGE_KEY)).toBe(true);
    reconcileLivePosts(LISTING, ["post_a"]);
    expect(storage.map.has(LIVE_POSTS_STORAGE_KEY)).toBe(false);
  });

  it("loads once per page, and never duplicates what is already held", () => {
    const a = addLivePost(draft());
    settleLivePost(a, "post_a");
    loadLivePosts();
    loadLivePosts();
    expect(livePosts()).toHaveLength(1);
  });

  it("drops a post older than the TTL, on load and on reconcile", () => {
    const a = addLivePost(draft());
    settleLivePost(a, "post_a");
    clock += LIVE_POST_TTL_MS;
    resetLivePostsForTests({ storage, now: () => clock });
    loadLivePosts();
    expect(livePosts()).toEqual([]);

    resetLivePostsForTests({ storage, now: () => clock });
    const b = addLivePost(draft());
    settleLivePost(b, "post_b");
    clock += LIVE_POST_TTL_MS;
    reconcileLivePosts(THREAD, []);
    expect(livePosts()).toEqual([]);
  });

  it("refuses storage that is not the shape it wrote", () => {
    storage.setItem(LIVE_POSTS_STORAGE_KEY, "not json");
    loadLivePosts();
    expect(livePosts()).toEqual([]);
    resetLivePostsForTests({ storage, now: () => clock });
    storage.setItem(LIVE_POSTS_STORAGE_KEY, JSON.stringify([{ clientId: "x", status: "posted" }]));
    loadLivePosts();
    expect(livePosts()).toEqual([]);
  });

  it("works with no storage at all", () => {
    resetLivePostsForTests({ storage: null, now: () => clock });
    const a = addLivePost(draft());
    settleLivePost(a, "post_a");
    loadLivePosts();
    expect(livePostsFor(LISTING)).toHaveLength(1);
  });

  it("the TTL outlasts every cache between the write and the page", () => {
    // 60 s at the edge, 60 s in the ISR store, 60 s at the gateway, a render.
    expect(LIVE_POST_TTL_MS).toBeGreaterThanOrEqual(4 * 60 * 1000);
    expect(LIVE_POST_TTL_MS).toBeLessThanOrEqual(30 * 60 * 1000);
  });
});

describe("the server snapshot", () => {
  it("is empty, and the same instance every time (I6)", () => {
    expect(emptyLivePosts()).toEqual([]);
    expect(emptyLivePosts()).toBe(emptyLivePosts());
    addLivePost(draft());
    expect(emptyLivePosts()).toEqual([]);
  });
});
