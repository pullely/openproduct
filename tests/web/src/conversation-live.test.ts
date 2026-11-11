// The conversation, live (openproduct-performance OPP14).
//
// A post used to cost a form POST, a 303 and a full reload of a cached
// document that did not have the post in it — and then the post was not
// there, for up to a minute, because none of the caches between the write
// and the page can know that THIS reader is the author. What is pinned here
// is the shape that closes that without giving anything up:
//
//   1. the FORMS DID NOT CHANGE — same method, same action, same sign-in
//      bounce with the draft kept, and they work with no JavaScript;
//   2. the island only takes a submit from a form that opted in, and only
//      for a visitor who is (or is hinted to be) signed in;
//   3. the routes answer JSON to a caller that asks for it and keep every
//      redirect for one that does not;
//   4. the vote acts while the overlay is still pending, and the membership
//      it could not move yet is applied when the overlay arrives;
//   5. none of it reads a session in a section that renders (I6).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SIGNED_IN_CLASS } from "@openproduct-web/app/auth/auth";
import {
  __resetOverlayForTests,
  deferMembership,
  overlayState,
  request,
  setMembership,
  subscribeOverlay,
} from "@openproduct-web/app/ui/overlay";
import {
  publishVisitor,
  resetVisitorForTests,
  subscribeVisitor,
  unknownVisitor,
  visitorSnapshot,
} from "@openproduct-web/app/ui/visitor";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const read = (file: string) => readFileSync(resolve(APP_DIR, file), "utf-8");
/** The file with its prose removed — a guard about code must not read the
 *  comment that names the thing the code rejects. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ISLAND = "ui/conversation-live.tsx";
const STORE = "ui/live-posts.ts";
const VISITOR = "ui/visitor.ts";
const TOGGLE = "ui/use-toggle.ts";
const OVERLAY = "ui/overlay.ts";
const CHIP = "shell/account-chip.tsx";
const SECTION = "[slug]/comments.tsx";
const BOX = "[slug]/comment-draft.tsx";
const LISTING_PAGE = "[slug]/page.tsx";
const THREAD_PAGE = "threads/[id]/page.tsx";
const COMMENT_ROUTE = "comment/route.ts";
const REPLY_ROUTE = "threads/[id]/reply/route.ts";

describe("the forms did not change", () => {
  it("the comment box still posts the plain form to `/comment`, and only OPTS IN to the island", () => {
    const section = code(SECTION);
    expect(section).toContain('method="post" action="/comment"');
    expect(section).toContain('data-live="post"');
    // The composer is still the server component it was: no session, no
    // fetch, no client directive on the section that renders the comments.
    expect(section).not.toMatch(/cookies\(|decodeSession|fetch\(|"use client"/);
  });

  it("the draft box still has no network of its own", () => {
    // OPP14 gave the SECTION a listener. The box that keeps the draft across
    // sign-in must not have grown one too — two things posting one form is
    // the double-post this island exists to avoid.
    expect(code(BOX)).not.toMatch(/fetch\(|document\.cookie|navigator\.sendBeacon/);
  });

  it("both reply forms on a thread opt in, and the disclosure stays a `<details>`", () => {
    const page = code(THREAD_PAGE);
    const optedIn = page.match(/data-live="post"/g) ?? [];
    expect(optedIn).toHaveLength(2);
    expect(page).toContain("action={`/threads/${thread.id}/reply`}");
    expect(page).toContain("action={`/threads/${threadId}/reply`}");
    expect(page).toContain("<details");
    expect(page).not.toContain('"use client"');
    expect(page).not.toMatch(/cookies\(|decodeSession/);
  });

  it("the vote forms did not opt in — they have their own hook", () => {
    // `data-live="post"` is for the two writes that make a post. The four
    // toggles keep `use-toggle.ts`; a second listener on them would race it.
    for (const file of ["ui/vote-box.tsx", "ui/comment-vote.tsx", "ui/save-control.tsx", "ui/follow-button.tsx"]) {
      const src = code(file);
      expect([file, src.includes("useToggle(")]).toEqual([file, true]);
      expect([file, src.includes('data-live="post"')]).toEqual([file, false]);
    }
  });
});

describe("the island wraps the section and the section is still the page's", () => {
  it("the comment section is wrapped, with the ids the document rendered and the draft's key", () => {
    const section = code(SECTION);
    expect(section).toContain("<ConversationLive");
    expect(section).toContain('conversation={conversationKey("listing", slug)}');
    expect(section).toContain("renderedIds={posts.map((post) => post.id)}");
    expect(section).toContain('variant="comment"');
    expect(section).toContain("draftKey={`op.draft.comment.${slug}`}");
    // The key the island clears is the key the box writes.
    expect(read(BOX)).toContain("op.draft.comment.${");
  });

  it("the thread is wrapped as posts, with the ids the document rendered", () => {
    const page = code(THREAD_PAGE);
    expect(page).toContain('conversation={conversationKey("thread", thread.id)}');
    expect(page).toContain("renderedIds={posts.map((post) => post.id)}");
    expect(page).toContain('variant="post"');
  });

  it("the heading's count moves with the visitor's own comments", () => {
    const page = code(LISTING_PAGE);
    expect(page).toContain("<LiveCount");
    expect(page).toContain('conversation={conversationKey("listing", profile.slug)}');
  });

  it("the island is a client component that renders NOTHING on the server (I6)", () => {
    const island = read(ISLAND);
    expect(island.startsWith('"use client"')).toBe(true);
    const src = code(ISLAND);
    // The server snapshot of every store it reads is empty or unknown, and
    // the list of live posts is gated on `mounted` — so the document is the
    // same bytes for the author and for everybody else.
    expect(src).toContain("emptyLivePosts");
    expect(src).toContain("unknownVisitor");
    expect(src).toContain("const mine = mounted ?");
    expect(src).not.toMatch(/cookies\(|decodeSession|next\/headers/);
  });

  it("takes a submit only from a form that opted in, and only for a signed-in (or hinted) visitor", () => {
    const src = code(ISLAND);
    expect(src).toContain("form.getAttribute(LIVE_FORM_ATTRIBUTE) !== LIVE_FORM_VALUE) return");
    expect(src).toContain(
      'const signedIn = overlay.status === "ready" || (overlay.status === "pending" && hintedSignedIn())',
    );
    expect(src).toContain("if (!signedIn) return");
    // `preventDefault` comes AFTER every early return — a form that is not
    // taken over posts exactly as it did.
    const guard = src.indexOf("if (!signedIn) return");
    const prevent = src.indexOf("event.preventDefault()");
    expect(guard).toBeGreaterThan(0);
    expect(prevent).toBeGreaterThan(guard);
    expect(src).toContain(`classList.contains(SIGNED_IN_CLASS)`);
  });

  it("posts the same form to the same action, asking for JSON, same-origin, uncached", () => {
    const src = code(ISLAND);
    expect(src).toContain("fetch(form.action, {");
    expect(src).toContain('method: "POST"');
    expect(src).toContain("body: data");
    expect(src).toContain('headers: { accept: "application/json" }');
    expect(src).toContain('credentials: "same-origin"');
    expect(src).toContain('cache: "no-store"');
    // The FormData is built BEFORE the box is cleared, or the post would be
    // empty by the time it left.
    expect(src.indexOf("new FormData(form)")).toBeLessThan(src.indexOf('if (field) field.value = ""'));
  });

  it("a stale hint (401) lets the plain form post; a refusal keeps the words", () => {
    const src = code(ISLAND);
    expect(src).toContain("if (res.status === 401) {");
    expect(src).toContain("dropLivePost(clientId)");
    expect(src).toContain("form.submit()");
    expect(src).toContain("failLivePost(clientId, await failureMessage(res))");
    expect(src).toContain("failLivePost(clientId, LIVE_POST_NETWORK_MESSAGE)");
    // Every failure restores the draft. Count the restores against the
    // failure paths: 401, !ok, no id, thrown.
    expect(src.match(/restore\(\)/g)?.length).toBe(4);
  });

  it("a settled post clears the draft the box kept, and only then", () => {
    const src = code(ISLAND);
    const settle = src.indexOf("settleLivePost(clientId, id)");
    const clear = src.indexOf("window.sessionStorage.removeItem(draftKey)");
    expect(settle).toBeGreaterThan(0);
    expect(clear).toBeGreaterThan(settle);
  });

  it("draws a post through the SAME render subset the server applies", () => {
    // A live post that rendered raw text — or, worse, HTML — would look
    // different from the same post after the reload, and the difference is
    // the kind a visitor notices. `parseBody` + `PostBody` is the one path.
    const src = code(ISLAND);
    expect(src).toContain("parseBody(post.body)");
    expect(src).toContain("<PostBody nodes=");
    expect(src).not.toContain("dangerouslySetInnerHTML");
  });

  it("a reply is drawn INTO the post it answers, where the server will draw it", () => {
    const src = code(ISLAND);
    expect(src).toContain("document.getElementById(`post-${post.parentPostId}`)");
    expect(src).toContain("createPortal(");
    // And a pending post is marked so, for assistive tech and for the eye.
    expect(src).toContain('aria-busy={post.status === "pending"}');
    expect(src).toContain("data-live-post={post.status}");
    expect(src).toContain('role="alert"');
  });
});

describe("the routes answer twice", () => {
  for (const [route, ok, invalid, failed, signIn] of [
    [COMMENT_ROUTE, "?commented=ok#discussion", "?commented=invalid#discussion", "?commented=failed#discussion", "/signin?return_to="],
    [REPLY_ROUTE, "#post-${parentPostId}", "?posted=invalid", "?posted=failed", "/signin?return_to="],
  ] as const) {
    it(`${route}: JSON for a caller that asks, the redirects for one that does not`, () => {
      const src = code(route);
      expect(src).toContain("wantsJson(request)");
      // The four JSON answers.
      expect(src).toContain("status: 201");
      expect(src).toContain("status: 401");
      expect(src).toContain("refused(422");
      expect(src).toContain("refused(502");
      expect(src).toContain("postId: result.data.postId");
      // Never cached, whichever answer: a 201 with a post id is personal.
      expect(src).toContain('"cache-control": "no-store"');
      // The redirects, byte for byte.
      expect(src).toContain(ok);
      expect(src).toContain(invalid);
      expect(src).toContain(failed);
      expect(src).toContain(signIn);
      // The session is read ONCE here; the body is bounded before the network.
      expect(src.match(/decodeSession\(/g)?.length).toBe(1);
      expect(src).toContain("body.length > MAX_POST_BODY");
    });
  }

  it("a signed-out JSON caller gets an EMPTY 401, not a redirect to follow", () => {
    // `fetch` follows redirects. A 303 to `/signin` would come back as a 200
    // HTML document, the island would read it as success, and the post would
    // be drawn for somebody who cannot post.
    for (const route of [COMMENT_ROUTE, REPLY_ROUTE]) {
      const src = code(route);
      expect(src).toContain("new NextResponse(null, { status: 401, headers: NO_STORE })");
    }
  });

  it("the reply route keeps a malformed parent as a top-level post, in both answers", () => {
    const src = code(REPLY_ROUTE);
    expect(src).toContain("UUID_RE.test(parentRaw) ? parentRaw : null");
  });
});

describe("the vote acts before the overlay arrives", () => {
  it("declines only when signed out, or unknown AND not hinted", () => {
    const src = code(TOGGLE);
    expect(src).toContain(
      'if (status === "absent" || (status === "pending" && !hintedSignedIn()) || pending) return;',
    );
    expect(src).toContain("classList.contains(SIGNED_IN_CLASS)");
    // The count moves either way; the membership moves only with the
    // overlay in hand, and is deferred otherwise.
    expect(src).toContain('const revertMembership = status === "ready" ? setMembership(list, key, on) : () => {};');
    expect(src).toContain('if (status !== "ready") deferMembership(list, key, on);');
    // A 401 undoes and lets the form post — the pre-OPP14 path, exactly.
    expect(src).toContain("if (res.status === 401) {");
    expect(src).toContain("form.submit()");
  });

  it("the hint is the class `layout.tsx` stamps before first paint, and nothing else", () => {
    // Not a cookie read (JavaScript cannot see `HttpOnly`, and the hint
    // cookie is the ONE thing the document already turned into a class).
    for (const file of [TOGGLE, ISLAND]) {
      const src = code(file);
      expect(src).toContain("SIGNED_IN_CLASS");
      expect(src).not.toContain("document.cookie");
    }
    expect(SIGNED_IN_CLASS).toBe("op-signed-in");
  });
});

describe("the visitor store", () => {
  beforeEach(() => resetVisitorForTests());

  it("is unknown on the server, and the same frozen instance every time (I6)", () => {
    expect(unknownVisitor()).toEqual({ known: false, signedIn: false, displayName: null });
    expect(unknownVisitor()).toBe(unknownVisitor());
    expect(visitorSnapshot()).toBe(unknownVisitor());
    expect(Object.isFrozen(unknownVisitor())).toBe(true);
  });

  it("is written by the chip, once, and read by anyone", () => {
    const seen: Array<string | null> = [];
    const stop = subscribeVisitor(() => seen.push(visitorSnapshot().displayName));
    publishVisitor({ signedIn: true, displayName: "Ada Lovelace" });
    expect(visitorSnapshot()).toEqual({ known: true, signedIn: true, displayName: "Ada Lovelace" });
    stop();
    publishVisitor({ signedIn: false, displayName: "Ada Lovelace" });
    expect(seen).toEqual(["Ada Lovelace"]);
    // A name never survives a signed-out answer.
    expect(visitorSnapshot()).toEqual({ known: true, signedIn: false, displayName: null });
  });

  it("the chip publishes what `/auth/session` said, and nothing else fetches it", () => {
    const chip = code(CHIP);
    expect(chip).toContain("publishVisitor({");
    expect(chip).toContain("signedIn: body.data?.signedIn === true");
    for (const file of [ISLAND, STORE, VISITOR]) {
      expect([file, code(file).includes("/auth/session")]).toEqual([file, false]);
    }
    expect(code(VISITOR)).not.toContain("fetch(");
  });
});

describe("a membership deferred into the overlay (deferMembership)", () => {
  // A hinted visitor upvotes while the overlay is pending. The write lands;
  // the overlay's answer may already have left the server without it. If the
  // move were simply dropped, the arrow would flip back to "Upvote" the
  // moment the overlay arrived — the one visible way an optimistic act lies.

  let scheduled: Array<() => void>;

  function stubFetch(answer: () => Response) {
    const urls: string[] = [];
    const impl = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return answer();
    }) as unknown as typeof fetch;
    return { urls, impl };
  }

  function emptyOverlay() {
    return {
      saved: [] as string[],
      endorsed: [] as string[],
      follows: [] as string[],
      postVotes: [] as string[],
      savedCount: 0,
      unread: 0,
      requests: 0,
      listings: 0,
      handle: null,
      profilePublic: false,
    };
  }

  function json(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  async function settle(): Promise<void> {
    for (const run of scheduled.splice(0)) run();
    await new Promise((r) => setTimeout(r, 0));
  }

  /** A signed-in visitor's overlay, about to answer with these lists. */
  function armSignedIn(overrides: Record<string, unknown> = {}) {
    const stub = stubFetch(() => json({ data: { overlay: { ...emptyOverlay(), ...overrides } } }));
    __resetOverlayForTests({ fetchImpl: stub.impl, schedule: (run) => scheduled.push(run) });
  }

  /** A signed-out visitor: `/me/overlay` answers 204. */
  function armSignedOut() {
    const stub = stubFetch(() => new Response(null, { status: 204 }));
    __resetOverlayForTests({ fetchImpl: stub.impl, schedule: (run) => scheduled.push(run) });
  }

  function readyOverlay() {
    const state = overlayState();
    if (state.status !== "ready") throw new Error(`overlay is ${state.status}`);
    return state.overlay;
  }

  beforeEach(() => {
    scheduled = [];
    __resetOverlayForTests();
  });

  it("is applied when the overlay arrives, on top of what the overlay said", async () => {
    armSignedIn({ endorsed: ["a-thing"], saved: ["a-thing"], savedCount: 1 });
    request(["a-thing", "b-thing"]);
    expect(overlayState().status).toBe("pending");
    deferMembership("endorsed", "b-thing", true);
    deferMembership("saved", "b-thing", true);
    // Nothing moved yet — `setMembership` refuses while pending, and this
    // must not go round it.
    expect(overlayState().status).toBe("pending");

    await settle();
    const overlay = readyOverlay();
    expect(overlay.endorsed).toEqual(["a-thing", "b-thing"]);
    expect(overlay.saved).toEqual(["a-thing", "b-thing"]);
    expect(overlay.savedCount).toBe(2);
  });

  it("does not double up when the overlay's answer already carried the act", async () => {
    // The write landed BEFORE the overlay's answer left the server: the act
    // is already in the list, and applying it again must move nothing.
    armSignedIn({ saved: ["b-thing"], savedCount: 1 });
    request(["b-thing"]);
    deferMembership("saved", "b-thing", true);
    await settle();
    expect(readyOverlay().saved).toEqual(["b-thing"]);
    expect(readyOverlay().savedCount).toBe(1);
  });

  it("keeps only the LAST act on one key — an upvote then its undo is no upvote", async () => {
    armSignedIn();
    request(["a-thing"]);
    deferMembership("endorsed", "a-thing", true);
    deferMembership("endorsed", "a-thing", false);
    await settle();
    expect(readyOverlay().endorsed).toEqual([]);
  });

  it("applies at once when the overlay is already in hand", async () => {
    armSignedIn();
    request(["a-thing"]);
    await settle();
    const seen: number[] = [];
    const stop = subscribeOverlay(() => seen.push(1));
    deferMembership("follows", "topic:dev-tools", true);
    stop();
    expect(seen).toEqual([1]);
    expect(readyOverlay().follows).toEqual(["topic:dev-tools"]);
  });

  it("is DROPPED when the overlay comes back absent — the hint was stale", async () => {
    // A 204 is a visitor whose memberships were never received. Inventing
    // one is the thing `setMembership` refuses; the deferred act must not
    // survive to a later `ready` either.
    armSignedOut();
    request(["a-thing"]);
    deferMembership("endorsed", "a-thing", true);
    await settle();
    expect(overlayState().status).toBe("absent");
    deferMembership("endorsed", "a-thing", true);
    expect(overlayState().status).toBe("absent");

    // A later real answer does not carry the ghost.
    const stub = stubFetch(() => json({ data: { overlay: emptyOverlay() } }));
    __resetOverlayForTests({ fetchImpl: stub.impl, schedule: (run) => scheduled.push(run) });
    request(["a-thing"]);
    await settle();
    expect(readyOverlay().endorsed).toEqual([]);
  });

  it("is cleared by the test seam, like every other piece of store state", async () => {
    __resetOverlayForTests();
    deferMembership("endorsed", "a-thing", true);
    armSignedIn();
    request(["a-thing"]);
    await settle();
    expect(readyOverlay().endorsed).toEqual([]);
  });

  it("is the store's own seam: `setMembership` itself still refuses while pending", () => {
    __resetOverlayForTests();
    setMembership("endorsed", "a-thing", true);
    expect(overlayState().status).toBe("pending");
    // And the deferred queue is applied INSIDE the store on `ready`, not by
    // any caller — which is what makes it impossible to forget.
    const overlay = code(OVERLAY);
    expect(overlay).toContain("if (overlay) applyDeferred()");
  });
});
