// The overlay's three OPR-3 answers (openproduct-redesign OPR-3): my reaction
// per product post, the products I am on the crew of, the seats I asked for.
//
// A cached page is the same bytes for everybody; these three are how a page
// learns, after load, what on it is the visitor's. What is pinned here:
//
//   - a page ASKS with two new bounds (`productPosts`, `openings`), coalesced
//     into the one request, and `crew` needs none (it answers `ids`);
//   - the answer is read member by member, so nothing but a reaction word,
//     three strings or an id can reach a renderer;
//   - the readers say NOTHING while the overlay is pending or absent — which
//     is the server render, and every signed-out visitor;
//   - a reaction moves optimistically and can be put back exactly.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OVERLAY_PENDING,
  __resetOverlayForTests,
  deferReaction,
  overlayPath,
  overlayState,
  parseOverlay,
  request,
  setOpeningRequested,
  setReaction,
  type OverlayState,
} from "@openproduct-web/app/ui/overlay";
import { crewOf, isOpeningRequested, reactionOn } from "@openproduct-web/app/ui/use-overlay";
import { OVERLAY_BOUND_KEYS } from "@openproduct-web/app/me/me-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "../../../web/src/app");
const code = (file: string) =>
  readFileSync(resolve(APP_DIR, file), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PPO_A = `ppo_${"0".repeat(31)}a`;
const PPO_B = `ppo_${"0".repeat(31)}b`;
const OPR = `opr_${"0".repeat(31)}1`;

const base = () => ({
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
});

function stubFetch(answer: () => Response) {
  const urls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return answer();
  }) as unknown as typeof fetch;
  return { urls, impl };
}

const json = (overlay: unknown) =>
  new Response(JSON.stringify({ data: { overlay } }), { status: 200, headers: { "content-type": "application/json" } });

async function settle(pending: Array<() => void>): Promise<void> {
  for (const run of pending.splice(0)) run();
  await new Promise((r) => setTimeout(r, 0));
}

/** A store that has answered with this overlay. */
async function ready(overlay: Record<string, unknown>): Promise<void> {
  const scheduled: Array<() => void> = [];
  __resetOverlayForTests({ fetchImpl: stubFetch(() => json({ ...base(), ...overlay })).impl, schedule: (run) => scheduled.push(run) });
  request([]);
  await settle(scheduled);
}

describe("how a page asks", () => {
  it("names product posts and seats as their own bounds, after the three there were", () => {
    expect(overlayPath([], [], [], [PPO_A, PPO_B])).toBe(`/me/overlay?productPosts=${PPO_A}%2C${PPO_B}`);
    expect(overlayPath([], [], [], [], [OPR])).toBe(`/me/overlay?openings=${OPR}`);
    expect(overlayPath(["ackstack"], ["topic:x"], [], [PPO_A], [OPR])).toBe(
      `/me/overlay?ids=ackstack&follows=topic%3Ax&productPosts=${PPO_A}&openings=${OPR}`,
    );
    // A page that asks about neither sends neither.
    expect(overlayPath(["ackstack"])).toBe("/me/overlay?ids=ackstack");
  });

  it("the route in the middle forwards both, from the one key list", () => {
    expect([...OVERLAY_BOUND_KEYS]).toContain("productPosts");
    expect([...OVERLAY_BOUND_KEYS]).toContain("openings");
    // `crew` has no bound of its own: it is answered for the slugs in `ids`.
    expect([...OVERLAY_BOUND_KEYS]).not.toContain("crew");
    expect(code("me/overlay/route.ts")).toContain("OVERLAY_BOUND_KEYS.map((key) => [key, params.get(key)])");
  });

  it("coalesces every card's post id, and the product's slug, into ONE request", async () => {
    const scheduled: Array<() => void> = [];
    const f = stubFetch(() => json({ ...base(), reactions: { [PPO_B]: "useful" }, crew: [], requestedOpenings: [] }));
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });
    // Two cards' reaction controls, a product page's maker view, a seat.
    request([], [], [], [PPO_B]);
    request([], [], [], [PPO_A]);
    request(["ackstack"]);
    request([], [], [], [], [OPR]);
    await settle(scheduled);
    expect(f.urls).toEqual([`/me/overlay?ids=ackstack&productPosts=${PPO_A}%2C${PPO_B}&openings=${OPR}`]);
    expect(reactionOn(overlayState(), PPO_B)).toBe("useful");
  });

  it("asks again when a post arrives that the answer did not cover", async () => {
    const scheduled: Array<() => void> = [];
    const f = stubFetch(() => json({ ...base(), reactions: {} }));
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });
    request([], [], [], [PPO_A]);
    await settle(scheduled);
    // The same post again: answered, nothing new, no request.
    request([], [], [], [PPO_A]);
    await settle(scheduled);
    expect(f.urls).toHaveLength(1);
    // "Show more" drew another card.
    request([], [], [], [PPO_B]);
    await settle(scheduled);
    expect(f.urls).toEqual([`/me/overlay?productPosts=${PPO_A}`, `/me/overlay?productPosts=${PPO_A}%2C${PPO_B}`]);
    // And a seat that appears later is asked about too.
    request([], [], [], [], [OPR]);
    await settle(scheduled);
    expect(f.urls[2]).toBe(`/me/overlay?productPosts=${PPO_A}%2C${PPO_B}&openings=${OPR}`);
  });
});

describe("the answer is read member by member", () => {
  it("keeps a reaction only when it is one of the four", () => {
    const overlay = parseOverlay({
      data: { overlay: { ...base(), reactions: { [PPO_A]: "would_use", [PPO_B]: "love", x: 7, y: null } } },
    })!;
    expect(overlay.reactions).toEqual({ [PPO_A]: "would_use" });
  });

  it("keeps a crew entry only when it is a slug and two ids", () => {
    const overlay = parseOverlay({
      data: {
        overlay: {
          ...base(),
          crew: [
            { slug: "ackstack", org: "org_1", profile: "opp_1", role: "maintainer", tagline: "leaked" },
            { slug: "no-role", org: "org_3", profile: "opp_3" },
            { slug: "owner", org: "org_4", profile: "opp_4", role: "owner" },
            { slug: "half", org: "org_2" },
            "ackstack",
            null,
          ],
        },
      },
    })!;
    // The extra member is dropped: ids and the role only, nothing a page
    // could render. A role the page does not know (SC-3) is the narrowest.
    expect(overlay.crew).toEqual([
      { slug: "ackstack", org: "org_1", profile: "opp_1", role: "maintainer" },
      { slug: "no-role", org: "org_3", profile: "opp_3", role: "member" },
      { slug: "owner", org: "org_4", profile: "opp_4", role: "member" },
    ]);
  });

  it("keeps a requested seat only when it is a string, and an older body is still an overlay", () => {
    expect(parseOverlay({ data: { overlay: { ...base(), requestedOpenings: [OPR, 4, null] } } })!.requestedOpenings).toEqual([OPR]);
    const older = parseOverlay({ data: { overlay: base() } })!;
    expect([older.reactions, older.crew, older.requestedOpenings]).toEqual([{}, [], []]);
    const odd = parseOverlay({ data: { overlay: { ...base(), reactions: ["useful"], crew: "yes", requestedOpenings: "all" } } })!;
    expect([odd.reactions, odd.crew, odd.requestedOpenings]).toEqual([{}, [], []]);
  });
});

describe("the readers say nothing until the overlay has answered", () => {
  const ABSENT: OverlayState = { status: "absent" };

  it("pending is the server render: no reaction, no crew, no requested seat", () => {
    for (const state of [OVERLAY_PENDING, ABSENT]) {
      expect(reactionOn(state, PPO_A)).toBeNull();
      expect(crewOf(state, "ackstack")).toBeNull();
      expect(isOpeningRequested(state, OPR)).toBe(false);
    }
  });

  it("the hooks read through the one store, whose server snapshot is pending", () => {
    const hooks = code("ui/use-overlay.ts");
    expect(hooks).toContain("useSyncExternalStore(subscribeOverlay, overlayState, serverSnapshot)");
    expect(hooks).toContain("return OVERLAY_PENDING;");
    // Each hook asks for exactly what it reads, through `useOverlay`.
    expect(hooks).toMatch(/export function useReaction\(postId: string\)[\s\S]*?reactionOn\(useOverlay\(NONE, NONE, NONE, ids\), postId\)/);
    expect(hooks).toMatch(/export function useCrewOf\(slug: string\)[\s\S]*?crewOf\(useOverlay\(ids\), slug\)/);
    expect(hooks).toMatch(/export function useOpeningRequested\(openingId: string\)[\s\S]*?isOpeningRequested\(useOverlay\(NONE, NONE, NONE, NONE, ids\), openingId\)/);
    // And none of them reads a cookie or a header to decide anything.
    expect(hooks).not.toMatch(/cookies\(|headers\(|op_session|SESSION_COOKIE|document\.cookie/);
  });

  it("answers once it is ready, for what was asked and nothing else", async () => {
    await ready({
      reactions: { [PPO_A]: "curious" },
      crew: [{ slug: "ackstack", org: "org_1", profile: "opp_1", role: "lead" }],
      requestedOpenings: [OPR],
    });
    const state = overlayState();
    expect(reactionOn(state, PPO_A)).toBe("curious");
    expect(reactionOn(state, PPO_B)).toBeNull();
    expect(crewOf(state, "ackstack")).toEqual({ slug: "ackstack", org: "org_1", profile: "opp_1", role: "lead" });
    expect(crewOf(state, "someone-elses")).toBeNull();
    expect(isOpeningRequested(state, OPR)).toBe(true);
    expect(isOpeningRequested(state, `opr_${"0".repeat(31)}2`)).toBe(false);
  });
});

describe("a reaction moves before the server answers, and can be put back", () => {
  it("sets, replaces and clears on a ready overlay, and the undo restores the snapshot", async () => {
    await ready({ reactions: { [PPO_A]: "useful" } });
    const before = overlayState();

    const undoReplace = setReaction(PPO_A, "impressive");
    expect(reactionOn(overlayState(), PPO_A)).toBe("impressive");
    undoReplace();
    expect(overlayState()).toBe(before);

    const undoClear = setReaction(PPO_A, null);
    expect(reactionOn(overlayState(), PPO_A)).toBeNull();
    const cleared = overlayState();
    expect(cleared.status === "ready" ? Object.keys(cleared.overlay.reactions) : null).toEqual([]);
    undoClear();
    expect(reactionOn(overlayState(), PPO_A)).toBe("useful");

    setReaction(PPO_B, "would_use");
    expect(reactionOn(overlayState(), PPO_B)).toBe("would_use");
    // Another post's reaction is untouched.
    expect(reactionOn(overlayState(), PPO_A)).toBe("useful");
  });

  it("tells every subscriber, so the summary and the picker cannot disagree", async () => {
    await ready({ reactions: {} });
    let told = 0;
    const { subscribeOverlay } = await import("@openproduct-web/app/ui/overlay");
    const stop = subscribeOverlay(() => {
      told += 1;
    });
    setReaction(PPO_A, "useful");
    // Setting what is already set is not a change.
    setReaction(PPO_A, "useful");
    stop();
    expect(told).toBe(1);
  });

  it("invents nothing for a visitor whose reactions were never received", () => {
    __resetOverlayForTests();
    // Pending: no move, and a no-op undo.
    setReaction(PPO_A, "useful")();
    expect(overlayState()).toBe(OVERLAY_PENDING);
    setOpeningRequested(OPR)();
    expect(overlayState()).toBe(OVERLAY_PENDING);
  });

  it("a reaction set while the overlay was still pending is applied when it arrives", async () => {
    const scheduled: Array<() => void> = [];
    // The overlay left the server before the write landed: it says nothing.
    const f = stubFetch(() => json({ ...base(), reactions: {} }));
    __resetOverlayForTests({ fetchImpl: f.impl, schedule: (run) => scheduled.push(run) });
    request([], [], [], [PPO_A]);
    deferReaction(PPO_A, "curious");
    expect(overlayState().status).toBe("pending");
    await settle(scheduled);
    expect(reactionOn(overlayState(), PPO_A)).toBe("curious");
  });

  it("a deferred reaction is dropped, not invented, when the visitor turns out to be signed out", async () => {
    const scheduled: Array<() => void> = [];
    __resetOverlayForTests({ fetchImpl: stubFetch(() => new Response(null, { status: 204 })).impl, schedule: (run) => scheduled.push(run) });
    request([], [], [], [PPO_A]);
    deferReaction(PPO_A, "curious");
    await settle(scheduled);
    expect(overlayState().status).toBe("absent");
    deferReaction(PPO_A, "useful");
    expect(reactionOn(overlayState(), PPO_A)).toBeNull();
  });

  it("a seat asked for is added once, and only ever added", async () => {
    await ready({ requestedOpenings: [] });
    const undo = setOpeningRequested(OPR);
    setOpeningRequested(OPR);
    const now = overlayState();
    expect(now.status === "ready" ? now.overlay.requestedOpenings : null).toEqual([OPR]);
    undo();
    expect(isOpeningRequested(overlayState(), OPR)).toBe(false);
  });
});
