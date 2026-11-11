// What the shell knows about a navigation in flight (openproduct-performance
// OPP13).
//
// ─── THE DEFECT ───────────────────────────────────────────────────────────
//
// A soft navigation under the App Router changes NOTHING on screen until the
// destination's payload has arrived. On a cache miss that is one to two and a
// half seconds in production, during which the page the visitor clicked away
// from sits there unchanged. Nobody could tell a slow click from a dead one,
// and the 2026-09-09 investigation found that was the whole felt cost.
//
// ─── WHAT THIS IS ─────────────────────────────────────────────────────────
//
// One tiny store. `AppLink` writes to it when the router accepts a click
// (`onNavigate`, which fires only for an actual soft navigation — never for a
// modified click, an external href or a download), the palette writes to it
// before `router.push`, and `shell/navigation-progress.tsx` reads it and
// draws a bar. The route's own arrival settles it.
//
// Outside React and outside the DOM, so it is checkable from the module
// lane: `navigation.test.ts` drives every transition without a browser.

export interface NavigationState {
  /** Whether a soft navigation is in flight. */
  readonly loading: boolean;
  /** Where it is going, for a test to assert and for nothing else. */
  readonly href: string | null;
  /** Counts navigations, so a component can key a timeout to THIS one. */
  readonly sequence: number;
}

type Listener = () => void;

const IDLE: NavigationState = Object.freeze({ loading: false, href: null, sequence: 0 });

let state: NavigationState = IDLE;
const listeners = new Set<Listener>();

function publish(next: NavigationState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function navigationState(): NavigationState {
  return state;
}

export function subscribeNavigation(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The server snapshot: nothing is ever loading in the HTML (I6). */
export function idleNavigation(): NavigationState {
  return IDLE;
}

/** Hash dropped, an empty search dropped, an empty path made `/`. */
function normalize(href: string): string {
  const route = (href.split("#")[0] ?? "").replace(/\?$/, "");
  return route.length > 0 ? route : "/";
}

/**
 * The route `href` lands on, resolved against `current` (the page's own path
 * plus search) — path and search, hash dropped, which is what the router
 * compares. A hash-only href is the page itself; a search-only href is the
 * page's path with that search.
 */
export function resolveRoute(href: string, current: string): string {
  if (href.startsWith("#")) return normalize(current);
  if (href.startsWith("?")) return normalize(normalize(current).split("?")[0] + href);
  return normalize(href);
}

/**
 * A soft navigation to `href` has started from `current`.
 *
 * A no-op when the two are the same route: the router accepts a click on the
 * page a visitor is already reading and changes no route, so nothing would
 * ever settle a bar drawn for it.
 */
export function navigationStarted(href: string, current: string): void {
  if (resolveRoute(href, current) === resolveRoute(current, current)) return;
  publish({ loading: true, href, sequence: state.sequence + 1 });
}

/** The route changed, or the wait was given up on. */
export function navigationSettled(): void {
  if (!state.loading) return;
  publish({ loading: false, href: null, sequence: state.sequence });
}

/** Test seam. */
export function resetNavigation(): void {
  state = IDLE;
}

/**
 * How long a bar may stay up with nothing arriving. Long enough that a real
 * cold render never trips it; short enough that a navigation the router
 * abandoned (a second click, a failed payload) does not leave a bar behind.
 */
export const NAVIGATION_TIMEOUT_MS = 12_000;
