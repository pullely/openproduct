// The overlay store (openproduct-commons XP2) — the browser half of OPC-1.
//
// The public pages are one cacheable document that resolves no actor, so
// nothing personal can be in the HTML. This module is where "personal"
// re-enters: one small fetch, after paint, whose answer marks parts of the
// already-rendered document as belonging to this visitor.
//
// IT IS A MODULE SINGLETON RATHER THAN A REACT CONTEXT, deliberately. The
// consumers are on opposite sides of the tree — the account chip lives in the
// root layout, the save controls live inside the page — and wrapping the
// layout in a provider to join them would make the whole app a client
// boundary to serve one after-paint fetch. A singleton with a subscription
// costs nothing at render time and lets any component anywhere ask.
//
// IT COALESCES. Every component that needs a per-slug answer contributes its
// ids; the flush is scheduled rather than immediate, so a directory of forty
// cards plus the chip produce ONE request rather than forty-one. This is why
// `request()` returns nothing and never a promise: a caller that could await
// its own request would be a caller that could serialise the batch.
//
// THERE ARE EXACTLY THREE STATES and the third is the important one:
//
//   pending  nothing is known yet — render the anonymous page
//   ready    the overlay answered — mark what is the visitor's
//   absent   signed out, OR the read failed, OR it was refused
//
// `absent` collapses those three because no caller may act on the difference.
// A page that rendered differently for "failed" than for "signed out" would
// be a page that announces our outages to anonymous visitors. And because
// every anonymous visitor takes the `absent` path on every page load, it is
// the most-exercised branch in the module rather than the least.

import type { MeOverlay } from "@openproduct/contracts";

export type OverlayState =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly overlay: MeOverlay }
  | { readonly status: "absent" };

/**
 * ONE frozen instance, not a literal built per call.
 *
 * `useSyncExternalStore` compares snapshots by identity: a `getServerSnapshot`
 * that returns a fresh `{ status: "pending" }` every time looks to React like
 * a store that changes on every read, and it warns about (and can enter) an
 * infinite render loop. Exported so the hook returns THIS object rather than
 * an equal one.
 */
export const OVERLAY_PENDING: OverlayState = Object.freeze({ status: "pending" });
const PENDING = OVERLAY_PENDING;
const ABSENT: OverlayState = Object.freeze({ status: "absent" });

/**
 * The path the browser fetches. Pure, so a test can pin the shape.
 *
 * TWO BOUNDED PARAMETERS, NOT ONE (FL0). `ids` are product slugs and `follows`
 * are follow keys (`topic:dev-tools`, `person:ada`), and they are separate
 * because they name different things — a slug and a topic value can collide,
 * and one list holding both would make the answer's meaning depend on which
 * kind of page happened to ask. Both are bounded by what the page rendered,
 * which is the property XP2's whole design rests on.
 */
export function overlayPath(
  ids: readonly string[],
  follows: readonly string[] = [],
  posts: readonly string[] = [],
): string {
  const parts: string[] = [];
  if (ids.length > 0) parts.push(`ids=${encodeURIComponent(ids.join(","))}`);
  if (follows.length > 0) parts.push(`follows=${encodeURIComponent(follows.join(","))}`);
  // DQ1 — a third bound. A post id and a slug are different namespaces, so
  // one list holding both would make the answer's meaning depend on which
  // kind of page happened to ask.
  if (posts.length > 0) parts.push(`posts=${encodeURIComponent(posts.join(","))}`);
  return parts.length === 0 ? "/me/overlay" : `/me/overlay?${parts.join("&")}`;
}

/**
 * Read an overlay out of a response body, or refuse.
 *
 * Every field is checked. This is a response from our own origin, so the
 * paranoia is not about an attacker — it is that a shape change downstream
 * should degrade to `absent` (an anonymous-looking page, which is always
 * correct) rather than to `undefined` reaching a renderer.
 */
export function parseOverlay(body: unknown): MeOverlay | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const overlay = (data as { overlay?: unknown }).overlay;
  if (typeof overlay !== "object" || overlay === null) return null;
  const o = overlay as Record<string, unknown>;
  for (const key of ["saved", "endorsed", "follows", "postVotes"] as const) {
    const list = o[key];
    if (!Array.isArray(list) || !list.every((v) => typeof v === "string")) return null;
  }
  for (const key of ["savedCount", "requests", "listings", "unread"] as const) {
    if (typeof o[key] !== "number" || !Number.isFinite(o[key])) return null;
  }
  if (o.handle !== null && typeof o.handle !== "string") return null;
  if (typeof o.profilePublic !== "boolean") return null;
  return {
    saved: o.saved as string[],
    // EN1 — a SEPARATE list, never merged with `saved`. One is private and
    // one is public (OPC-3), and a single "you interacted with this" field
    // would be the conflation the EN sub-epic exists to refuse.
    endorsed: o.endorsed as string[],
    savedCount: o.savedCount as number,
    requests: o.requests as number,
    listings: o.listings as number,
    // The account menu's identity block: the visitor's own address and
    // whether the page behind it is on.
    handle: o.handle as string | null,
    profilePublic: o.profilePublic as boolean,
    // FL0 — a THIRD list, and separate for the same reason `endorsed` is
    // separate from `saved`: it is a different act over a different table with
    // a different privacy rule. Its members are keys rather than slugs.
    follows: o.follows as string[],
    // DQ1 — a FOURTH list, for the reason the third is separate from the
    // second: a different act over a different table. Its members are post
    // ids, which is a different namespace again.
    postVotes: o.postVotes as string[],
    // NF0 — the badge. A number, and the one field here that is not bounded
    // by what the page rendered: it is a fact about the reader rather than
    // about anything on the page, and cannot be turned into a listing.
    unread: o.unread as number,
  };
}

type Listener = () => void;

interface Store {
  state: OverlayState;
  /** Every id any component has asked about on this page. */
  wanted: Set<string>;
  /** The ids the last completed (or in-flight) fetch covers. */
  covered: Set<string>;
  /** FL0 — the same pair for follow keys. A separate set rather than a
   *  prefix in `wanted`, so the two bounds cannot be confused for each other
   *  and a page asking about neither still sends neither parameter. */
  wantedFollows: Set<string>;
  coveredFollows: Set<string>;
  /** DQ1 — the same pair for post ids, and separate for the same reason. */
  wantedPosts: Set<string>;
  coveredPosts: Set<string>;
  listeners: Set<Listener>;
  scheduled: boolean;
  inFlight: boolean;
  /** OPP14 — memberships moved before the overlay arrived, applied on arrival. */
  deferred: DeferredAct[];
}

const store: Store = {
  state: PENDING,
  wanted: new Set(),
  covered: new Set(),
  wantedFollows: new Set(),
  coveredFollows: new Set(),
  wantedPosts: new Set(),
  coveredPosts: new Set(),
  listeners: new Set(),
  scheduled: false,
  inFlight: false,
  deferred: [],
};

export function overlayState(): OverlayState {
  return store.state;
}

export function subscribeOverlay(listener: Listener): () => void {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function publish(next: OverlayState): void {
  store.state = next;
  for (const listener of store.listeners) listener();
}

/** Injected in tests; the browser's own `fetch` otherwise. */
let fetchImpl: typeof fetch = (...args) => fetch(...args);
/** Injected in tests; a macrotask otherwise — see `request` for why. */
let schedule: (run: () => void) => void = (run) => {
  setTimeout(run, 0);
};

/** Both covered sets move together, because one fetch answers both bounds and
 *  a page that recorded only half of that would re-ask forever. */
function cover(
  ids: readonly string[],
  follows: readonly string[],
  posts: readonly string[],
): void {
  store.covered = new Set(ids);
  store.coveredFollows = new Set(follows);
  store.coveredPosts = new Set(posts);
}

async function flush(): Promise<void> {
  store.scheduled = false;
  if (store.inFlight) return;
  const ids = [...store.wanted].sort();
  const follows = [...store.wantedFollows].sort();
  const posts = [...store.wantedPosts].sort();
  store.inFlight = true;
  try {
    const res = await fetchImpl(overlayPath(ids, follows, posts), {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    // 204 is the signed-out AND the failed answer — one branch, taken by
    // every anonymous visitor on every page load, which is what keeps it
    // correct. See `me/overlay/route.ts`.
    if (!res.ok || res.status === 204) {
      cover(ids, follows, posts);
      publish(ABSENT);
      return;
    }
    const overlay = parseOverlay(await res.json());
    cover(ids, follows, posts);
    publish(overlay ? { status: "ready", overlay } : ABSENT);
    if (overlay) applyDeferred();
  } catch {
    // A network failure is indistinguishable from being signed out, on
    // purpose: neither is something a public page may render differently.
    cover(ids, follows, posts);
    publish(ABSENT);
  } finally {
    store.inFlight = false;
    // Ids that arrived while this one was in flight (a late-hydrating island,
    // a client navigation) get their own round. Without this they would wait
    // for a page load, and the visitor would see their own saves appear on
    // some cards and not others.
    if (missingIds().length > 0) request([]);
  }
}

function missingIds(): string[] {
  return [...store.wanted].filter((id) => !store.covered.has(id));
}

function missingFollows(): string[] {
  return [...store.wantedFollows].filter((key) => !store.coveredFollows.has(key));
}

function missingPosts(): string[] {
  return [...store.wantedPosts].filter((id) => !store.coveredPosts.has(id));
}

/**
 * Ask the overlay about these ids. Fire-and-forget by design.
 *
 * Never called during render — only from an effect — so the first paint never
 * waits on it. The flush is a macrotask rather than a microtask so it lands
 * after the browser has painted rather than merely after the commit: this
 * read is decoration, and decoration must not compete with the frame that
 * shows the visitor the page.
 */
export function request(
  ids: readonly string[],
  follows: readonly string[] = [],
  posts: readonly string[] = [],
): void {
  for (const id of ids) store.wanted.add(id);
  for (const key of follows) store.wantedFollows.add(key);
  for (const id of posts) store.wantedPosts.add(id);
  // ABSENT IS TERMINAL for this page load, and that is a cost decision as
  // much as a correctness one. Whether the visitor is signed out cannot
  // change without a navigation, so asking again — once per late-hydrating
  // island, once per new card — would be a request per component for every
  // anonymous visitor on a crawled public site. One 204 per page load is the
  // price of keeping the fail-open branch exercised; a dozen is not.
  if (store.state.status === "absent") return;
  // Already answered for everything asked about, and nothing new: no request.
  if (
    store.state.status !== "pending" &&
    missingIds().length === 0 &&
    missingFollows().length === 0 &&
    missingPosts().length === 0
  ) {
    return;
  }
  if (store.scheduled || store.inFlight) return;
  store.scheduled = true;
  schedule(() => {
    void flush();
  });
}

/**
 * The four membership lists an act can move (OPP2).
 *
 * NAMED, NOT INFERRED. `saved` is private, `endorsed` is public, `follows` is
 * a different table again and `postVotes` a fourth — four acts, four privacy
 * rules — and the module has deliberately never carried a helper that answers
 * the flattening question "did they interact with this". A caller must name
 * the list it means, here as everywhere else.
 */
export type OverlayList = "saved" | "endorsed" | "follows" | "postVotes";

/** The count that moves with each list, where one does. `follows` and
 *  `postVotes` have public counts the PAGE holds, not the overlay, so there is
 *  nothing here to move for them. */
const COUNT_OF: Partial<Record<OverlayList, "savedCount">> = { saved: "savedCount" };

/**
 * Move one membership before the server has answered, and hand back the undo.
 *
 * WHY THE STORE AND NOT COMPONENT STATE. Two controls on one page can name the
 * same slug — the hero's upvote and the row's — and `useSyncExternalStore` is
 * here precisely so they cannot disagree. An optimistic flip kept in one
 * component would move one of them and leave the other reading the old value,
 * which is the torn read the store exists to prevent.
 *
 * ONLY MEANINGFUL WHEN THE OVERLAY IS `ready`. A `pending` or `absent` overlay
 * is a visitor whose memberships we do not know — signed out, or a failed
 * read — and flipping a list we never received would be inventing state. The
 * caller checks this (`use-toggle.ts` lets the plain form submit instead, so
 * the visitor bounces through sign-in), and this returns a no-op undo so a
 * caller that does not check cannot corrupt anything either.
 */
export function setMembership(list: OverlayList, key: string, on: boolean): () => void {
  const before = store.state;
  if (before.status !== "ready") return () => {};
  const current = before.overlay[list];
  const has = current.includes(key);
  if (has === on) return () => {};

  const next = on ? [...current, key] : current.filter((k) => k !== key);
  const countKey = COUNT_OF[list];
  publish({
    status: "ready",
    overlay: {
      ...before.overlay,
      [list]: next,
      ...(countKey
        ? { [countKey]: Math.max(0, before.overlay[countKey] + (on ? 1 : -1)) }
        : {}),
    },
  });

  // The undo restores the SNAPSHOT rather than flipping back, so a revert
  // that arrives after a second act on the same page cannot leave the list
  // holding a value neither act asked for.
  return () => {
    if (store.state.status === "ready") publish(before);
  };
}

interface DeferredAct {
  list: OverlayList;
  key: string;
  on: boolean;
}

/**
 * OPP14 — a membership moved BEFORE the overlay arrived.
 *
 * `use-toggle.ts` lets a hinted visitor act while the overlay is still
 * pending. The act lands; the overlay's answer may already have left the
 * server without it. Applying the move when the overlay arrives is what
 * keeps the control from flipping back to "Upvote" a moment after the
 * visitor pressed it — the one visible way an optimistic act can lie.
 *
 * With the overlay in hand this is `setMembership` at once. Absent, it is
 * dropped: an `absent` overlay is a visitor whose memberships we never
 * received, and inventing one is the thing `setMembership` refuses.
 */
export function deferMembership(list: OverlayList, key: string, on: boolean): void {
  if (store.state.status === "ready") {
    setMembership(list, key, on);
    return;
  }
  if (store.state.status === "absent") return;
  store.deferred = [...store.deferred.filter((act) => !(act.list === list && act.key === key)), { list, key, on }];
}

function applyDeferred(): void {
  const acts = store.deferred;
  store.deferred = [];
  for (const act of acts) setMembership(act.list, act.key, act.on);
}

/** Test seam. Resets every piece of module state, so tests cannot leak. */
export function __resetOverlayForTests(overrides?: {
  fetchImpl?: typeof fetch;
  schedule?: (run: () => void) => void;
}): void {
  store.state = PENDING;
  store.wanted = new Set();
  store.covered = new Set();
  store.wantedFollows = new Set();
  store.wantedPosts = new Set();
  store.coveredFollows = new Set();
  store.coveredPosts = new Set();
  store.listeners = new Set();
  store.scheduled = false;
  store.inFlight = false;
  store.deferred = [];
  fetchImpl = overrides?.fetchImpl ?? ((...args) => fetch(...args));
  schedule =
    overrides?.schedule ??
    ((run) => {
      setTimeout(run, 0);
    });
}
