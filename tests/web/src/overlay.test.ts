// The personalisation overlay (openproduct-commons XP2).
//
// The overlay is the one place personal state re-enters a set of pages whose
// entire architecture (OPC-1) is built on having none. So what is pinned here
// is not "does it fetch" but the four rules that keep it from undoing that:
//
//   1. it never blocks — `request()` issues nothing synchronously;
//   2. it COALESCES — a page of forty cards plus the chip is ONE request;
//   3. signed-out and failed are the SAME state, so the fail-open path is the
//      one every anonymous visitor takes rather than a branch nobody runs;
//   4. a malformed answer degrades to that same state, never to `undefined`
//      reaching a renderer.

import {
  ME_OVERLAY_KEYS,
  ME_OVERLAY_MAX_IDS,
  parseOverlayIds,
} from "@openproduct/contracts";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  __resetOverlayForTests,
  setMembership,
  overlayPath,
  overlayState,
  parseOverlay,
  request,
  subscribeOverlay,
} from "@openproduct-web/app/ui/overlay";

/** A fetch stub that records what it was asked and answers what it is told. */
function stubFetch(answer: () => Response | Promise<Response>) {
  const urls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return answer();
  }) as unknown as typeof fetch;
  return { urls, impl };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Runs whatever the store scheduled, then lets its promise settle. */
async function settle(pending: Array<() => void>): Promise<void> {
  for (const run of pending.splice(0)) run();
  await new Promise((r) => setTimeout(r, 0));
}

describe("the id parameter is parsed by the contract, not by each caller", () => {
  it("dedupes, drops what is not a slug, and caps the list", () => {
    expect(parseOverlayIds("a-thing,b-thing,a-thing")).toEqual(["a-thing", "b-thing"]);
    // Each of these would be a different kind of bad day if it reached SQL or
    // a URL. All four cost exactly their own answer, not the whole request.
    expect(parseOverlayIds("ok-thing, not a slug ,../etc/passwd,,%2e%2e")).toEqual(["ok-thing"]);
    expect(parseOverlayIds(null)).toEqual([]);
    expect(parseOverlayIds("")).toEqual([]);

    const many = Array.from({ length: ME_OVERLAY_MAX_IDS + 10 }, (_, i) => `s-${i}`).join(",");
    expect(parseOverlayIds(many)).toHaveLength(ME_OVERLAY_MAX_IDS);
  });
});

describe("the request the browser makes", () => {
  it("names every id in one query string, and omits it entirely when there are none", () => {
    expect(overlayPath([])).toBe("/me/overlay");
    expect(overlayPath(["a-thing", "b-thing"])).toBe("/me/overlay?ids=a-thing%2Cb-thing");
  });
});

describe("a malformed answer degrades, it does not leak", () => {
  it("refuses anything that is not the exact shape", () => {
    const good = {
      data: {
        overlay: {
          saved: ["a-thing"],
          endorsed: ["b-thing"],
          follows: ["topic:dev-tools"],
          postVotes: ["11111111-2222-4333-8444-555555555555"],
          unread: 7,
          savedCount: 3,
          requests: 1,
          listings: 2,
          handle: "ada",
          profilePublic: true,
        },
      },
    };
    expect(parseOverlay(good)).toEqual({
      saved: ["a-thing"],
      // EN1 — SAVED AND ENDORSED ARE DIFFERENT HERE ON PURPOSE. A fixture
      // where both lists held the same slug would pass against a parser that
      // read `saved` into both fields, and that parser would publish a
      // private bookmark on the first page that rendered it (OPC-3).
      endorsed: ["b-thing"],
      // FL0 — a THIRD list, distinct again. Its members are KEYS rather than
      // slugs, so a parser that read one list into another would be caught by
      // the shape as well as by the value.
      follows: ["topic:dev-tools"],
      // DQ1 — a FOURTH list, distinct again. Its members are POST IDS, a
      // third namespace, so a parser that read one list into another would
      // fail here rather than pass by coincidence.
      postVotes: ["11111111-2222-4333-8444-555555555555"],
      // NF0 — a NUMBER, and the one field here not bounded by what the page
      // rendered: it is a fact about the reader, and cannot become a listing.
      unread: 7,
      savedCount: 3,
      requests: 1,
      listings: 2,
      // The account menu's identity block (CG1): the visitor's own address
      // and whether the page behind it is on.
      handle: "ada",
      profilePublic: true,
    });
    // Not about an attacker — this is our own origin. It is that a shape
    // change downstream must degrade to an anonymous-looking page (always
    // correct) rather than to `undefined` reaching a renderer.
    expect(parseOverlay(null)).toBeNull();
    expect(parseOverlay({})).toBeNull();
    expect(parseOverlay({ data: {} })).toBeNull();
    expect(parseOverlay({ data: { overlay: { saved: "a-thing" } } })).toBeNull();
    expect(parseOverlay({ data: { overlay: { ...good.data.overlay, saved: [1] } } })).toBeNull();
    expect(parseOverlay({ data: { overlay: { ...good.data.overlay, requests: "1" } } })).toBeNull();
    expect(parseOverlay({ data: { overlay: { ...good.data.overlay, listings: NaN } } })).toBeNull();
    // And the public list is validated exactly as strictly as the private
    // one — an answer that dropped `endorsed` must degrade to anonymous,
    // never to a control rendering `undefined.includes(...)`.
    expect(parseOverlay({ data: { overlay: { ...good.data.overlay, endorsed: "b" } } })).toBeNull();
    expect(parseOverlay({ data: { overlay: { ...good.data.overlay, endorsed: [1] } } })).toBeNull();
    // The identity fields are held to the same standard. A handle is a
    // string or null (no handle claimed yet) and nothing else; the page
    // state is a boolean, never a string that happens to read "on".
    expect(parseOverlay({ data: { overlay: { ...good.data.overlay, handle: null } } })?.handle).toBeNull();
    expect(parseOverlay({ data: { overlay: { ...good.data.overlay, handle: 1 } } })).toBeNull();
    expect(parseOverlay({ data: { overlay: { ...good.data.overlay, handle: undefined } } })).toBeNull();
    expect(parseOverlay({ data: { overlay: { ...good.data.overlay, profilePublic: "on" } } })).toBeNull();
    const withoutEndorsed: Record<string, unknown> = { ...good.data.overlay };
    delete withoutEndorsed.endorsed;
    expect(parseOverlay({ data: { overlay: withoutEndorsed } })).toBeNull();
  });

  it("answers with exactly the keys the contract pins", () => {
    const overlay = parseOverlay({
      data: { overlay: { ...emptyOverlay(), tagline: "leaked" } },
    })!;
    // The extra field is DROPPED rather than carried through. The overlay may
    // only ever say which of the cached document is yours; a renderable field
    // arriving here would be a second rendering path for the same product.
    expect(Object.keys(overlay).sort()).toEqual([...ME_OVERLAY_KEYS]);
  });
});

describe("the store", () => {
  let scheduled: Array<() => void>;

  beforeEach(() => {
    scheduled = [];
  });

  it("issues nothing synchronously — the first paint never waits on it", () => {
    const f = stubFetch(() => json({ data: { overlay: emptyOverlay() } }));
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });

    request(["a-thing"]);
    // THE ASSERTION XP-3 IS ABOUT. Not "it is fast" — that nothing at all has
    // been sent by the time the caller's effect returns.
    expect(f.urls).toEqual([]);
    expect(overlayState().status).toBe("pending");
  });

  it("coalesces every caller on the page into ONE request", async () => {
    const f = stubFetch(() => json({ data: { overlay: { ...emptyOverlay(), saved: ["b-thing"] } } }));
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });

    // The chip asks for nothing; forty cards each ask for themselves.
    request([]);
    for (const slug of ["a-thing", "b-thing", "c-thing"]) request([slug]);
    await settle(scheduled);

    expect(f.urls).toHaveLength(1);
    expect(f.urls[0]).toBe("/me/overlay?ids=a-thing%2Cb-thing%2Cc-thing");
    expect(overlayState()).toEqual({
      status: "ready",
      overlay: { ...emptyOverlay(), saved: ["b-thing"] },
    });
  });

  it("treats 204 (signed out) and a 500 and a thrown fetch as ONE state", async () => {
    for (const answer of [
      () => new Response(null, { status: 204 }),
      () => new Response("nope", { status: 500 }),
      () => {
        throw new Error("network");
      },
    ]) {
      scheduled = [];
      const f = stubFetch(answer as () => Response);
      __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });
      request(["a-thing"]);
      await settle(scheduled);
      // Collapsing these is what keeps the fail-open path correct: it is the
      // branch every anonymous visitor takes on every page load, not one that
      // runs only during an outage and is therefore discovered broken by it.
      expect(overlayState()).toEqual({ status: "absent" });
    }
  });

  it("degrades to absent when the body is the wrong shape", async () => {
    const f = stubFetch(() => json({ data: { overlay: { saved: "not-an-array" } } }));
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });
    request(["a-thing"]);
    await settle(scheduled);
    expect(overlayState()).toEqual({ status: "absent" });
  });

  it("does not ask again once absent — one 204 per page load, not one per island", async () => {
    const f = stubFetch(() => new Response(null, { status: 204 }));
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });

    request(["a-thing"]);
    await settle(scheduled);
    // A late-hydrating island, a client navigation, another card: all ask.
    request(["b-thing"]);
    request(["c-thing"]);
    await settle(scheduled);

    // Being signed out cannot change without a navigation, so asking again
    // would be a request per component for every anonymous visitor on a
    // crawled public site.
    expect(f.urls).toHaveLength(1);
  });

  it("asks again when a NEW id appears after a successful answer", async () => {
    let call = 0;
    const f = stubFetch(() => {
      call += 1;
      return json({ data: { overlay: { ...emptyOverlay(), saved: call === 1 ? [] : ["b-thing"] } } });
    });
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });

    request(["a-thing"]);
    await settle(scheduled);
    request(["b-thing"]);
    await settle(scheduled);

    // Otherwise a visitor would see their own saves marked on some cards and
    // not others, depending on hydration order.
    expect(f.urls).toEqual([
      "/me/overlay?ids=a-thing",
      "/me/overlay?ids=a-thing%2Cb-thing",
    ]);
    expect(overlayState()).toEqual({
      status: "ready",
      overlay: { ...emptyOverlay(), saved: ["b-thing"] },
    });
  });

  it("does not re-ask when everything requested is already covered", async () => {
    const f = stubFetch(() => json({ data: { overlay: emptyOverlay() } }));
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });
    request(["a-thing"]);
    await settle(scheduled);
    request(["a-thing"]);
    await settle(scheduled);
    expect(f.urls).toHaveLength(1);
  });

  it("notifies every subscriber, and stops after unsubscribe", async () => {
    const f = stubFetch(() => json({ data: { overlay: emptyOverlay() } }));
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });

    let a = 0;
    let b = 0;
    subscribeOverlay(() => { a += 1; });
    const off = subscribeOverlay(() => { b += 1; });
    off();

    request([]);
    await settle(scheduled);
    // The save button in the header and the one in the card must never
    // disagree about whether the product is saved.
    expect(a).toBe(1);
    expect(b).toBe(0);
  });
});

function emptyOverlay() {
  // EN1 — `endorsed` is part of the pinned shape now, and a fixture missing
  // it is a fixture the parser correctly refuses. FL0 — so is `follows`, and
  // DQ1 — so is `postVotes`.
  return {
    saved: [] as string[],
    endorsed: [] as string[],
    follows: [] as string[],
    postVotes: [] as string[],
    savedCount: 0,
    // NF0 — the badge, and a fixture missing it is one the parser correctly
    // refuses.
    unread: 0,
    requests: 0,
    listings: 0,
    handle: null,
    profilePublic: false,
  };
}


describe("the proxy in the middle forwards what the browser asked (OPP8)", () => {
  // THE HOP NOTHING WAS TESTING. Every rule above is about the browser half,
  // and `tests/core` covers the answering half; between them sits
  // `me/overlay/route.ts`, which for the whole life of this feature read
  // `ids` and dropped `follows` and `posts`. Both halves were correct against
  // the contract and the feature did not work.
  //
  // This is a SOURCE guard rather than a call, because the route imports
  // `next/server` and this suite does not run Next. It asserts the shape that
  // makes the drop impossible rather than the values, which is what a source
  // guard can honestly claim.
  const routeSrc = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../web/src/app/me/overlay/route.ts",
    ),
    "utf-8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("builds its bounds from the shared key list, not from a hand-written parameter", () => {
    expect(routeSrc).toContain("OVERLAY_BOUND_KEYS");
    // The exact shape of the old bug: one named parameter read, the other two
    // never mentioned.
    expect(routeSrc).not.toMatch(/searchParams\.get\(\s*"ids"\s*\)/);
  });

  it("passes a bounds object to the client, so a missing key is a type error", () => {
    expect(routeSrc).toMatch(/fetchOverlay\(\s*session\.accessToken\s*,\s*bounds\s*\)/);
  });
});


describe("optimistic membership (OPP2)", () => {
  // The four acts used to be a form post answered with a 303, so toggling one
  // arrow cost a whole document. `setMembership` is what lets a control move
  // before the server answers — and what lets it move BACK when the answer
  // says the act did not land.

  let scheduled: Array<() => void>;

  beforeEach(() => {
    scheduled = [];
    __resetOverlayForTests();
  });

  /** Drive the store into `ready` with a real answer, the way a page does —
   *  through the same scheduler seam every other store test uses, because a
   *  store that has not actually answered is `pending` and refuses to move. */
  async function ready(overrides: Record<string, unknown> = {}): Promise<void> {
    const stub = stubFetch(() => json({ data: { overlay: { ...emptyOverlay(), ...overrides } } }));
    __resetOverlayForTests({ fetchImpl: stub.impl, schedule: (run) => scheduled.push(run) });
    request(["a-thing"]);
    await settle(scheduled);
  }

  it("adds and removes, and moves the count that belongs to the list", async () => {
    await ready({ saved: ["a-thing"], savedCount: 1 });
    setMembership("saved", "other-thing", true);
    let state = overlayState();
    expect(state.status).toBe("ready");
    if (state.status !== "ready") throw new Error("not ready");
    expect(state.overlay.saved).toEqual(["a-thing", "other-thing"]);
    expect(state.overlay.savedCount).toBe(2);

    setMembership("saved", "a-thing", false);
    state = overlayState();
    if (state.status !== "ready") throw new Error("not ready");
    expect(state.overlay.saved).toEqual(["other-thing"]);
    expect(state.overlay.savedCount).toBe(1);
  });

  it("moves no count for a list whose number the PAGE holds", async () => {
    // `follows` and `postVotes` have public counts that live in the cached
    // document, not in the overlay. The control adds its own delta to those;
    // there is nothing here to move, and inventing a field would be a second
    // claim about one number.
    await ready();
    setMembership("follows", "topic:dev-tools", true);
    const state = overlayState();
    if (state.status !== "ready") throw new Error("not ready");
    expect(state.overlay.follows).toEqual(["topic:dev-tools"]);
    expect(state.overlay.savedCount).toBe(0);
  });

  it("hands back an undo that restores the SNAPSHOT, not the opposite flip", async () => {
    await ready({ endorsed: ["a-thing"] });
    const undo = setMembership("endorsed", "b-thing", true);
    const during = overlayState();
    if (during.status !== "ready") throw new Error("not ready");
    expect(during.overlay.endorsed).toEqual(["a-thing", "b-thing"]);
    undo();
    const after = overlayState();
    if (after.status !== "ready") throw new Error("not ready");
    // `a-thing` survives — a revert that flipped rather than restored could
    // leave the list holding a value neither act asked for.
    expect(after.overlay.endorsed).toEqual(["a-thing"]);
  });

  it("REFUSES to move anything while the overlay is pending or absent", async () => {
    // The whole signed-out design rests on this. A visitor whose overlay never
    // answered has no membership to move, and flipping one would be inventing
    // state — so `use-toggle.ts` declines to intercept and the plain form
    // posts instead, bouncing through sign-in. This is the belt to that
    // braces: even a caller that forgot to check cannot corrupt the store.
    expect(overlayState().status).toBe("pending");
    const undoPending = setMembership("saved", "a-thing", true);
    expect(overlayState().status).toBe("pending");
    expect(() => undoPending()).not.toThrow();

    const stub = stubFetch(() => new Response(null, { status: 204 }));
    __resetOverlayForTests({ fetchImpl: stub.impl, schedule: (run) => scheduled.push(run) });
    request(["a-thing"]);
    await settle(scheduled);
    expect(overlayState().status).toBe("absent");
    setMembership("saved", "a-thing", true);
    expect(overlayState().status).toBe("absent");
  });

  it("is a no-op when the membership already says what the act would say", async () => {
    await ready({ saved: ["a-thing"], savedCount: 1 });
    setMembership("saved", "a-thing", true);
    const state = overlayState();
    if (state.status !== "ready") throw new Error("not ready");
    // Not two entries, and not a count moved twice — a double submit that
    // slipped past the pending guard must not double-count.
    expect(state.overlay.saved).toEqual(["a-thing"]);
    expect(state.overlay.savedCount).toBe(1);
  });

  it("tells EVERY subscriber, so two controls naming one slug cannot disagree", async () => {
    await ready();
    const seen: number[] = [];
    const un1 = subscribeOverlay(() => seen.push(1));
    const un2 = subscribeOverlay(() => seen.push(2));
    setMembership("endorsed", "a-thing", true);
    expect(seen).toEqual([1, 2]);
    un1();
    un2();
  });
});
