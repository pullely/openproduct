"use client";

import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

import {
  NAVIGATION_TIMEOUT_MS,
  idleNavigation,
  navigationSettled,
  navigationState,
  subscribeNavigation,
} from "../ui/navigation";

/**
 * The click, shown (openproduct-performance OPP13).
 *
 * A two-pixel bar along the top edge while a soft navigation is in flight,
 * drawn from `ui/navigation.ts`. It exists because the App Router changes
 * nothing on screen until the destination's payload has arrived, and on a
 * cold render in production that was one to two and a half seconds of a page
 * that looked ignored. The bar is the answer to "did that click take?" —
 * nothing more, and it says nothing about how long the wait will be.
 *
 * NOT A SKELETON. XP3's skeletons are a promise about the layout of a route
 * that is streaming; a public page here does not stream (it is one cacheable
 * document, OPC-1), so there is no moment at which a skeleton could be shown.
 * This is the one affordance that works for a document that arrives whole.
 *
 * NOTHING IN THE HTML. The server snapshot is idle, the bar mounts only on a
 * click, and the fallback below is `null`, so the cached document is the same
 * bytes for every visitor (I6). `aria-hidden`, because the route announcer
 * already tells a screen reader where they went and a "loading" said before
 * it would be said twice on every hop.
 *
 * INK, NOT THE ACCENT. XP-1 gives the accent colour one meaning on this site
 * and it is not "busy".
 *
 * Motion: the global reduced-motion rule in `globals.css` collapses both
 * animations to their end state, so a visitor who asked for no movement gets
 * a bar that appears and disappears rather than one that grows.
 */
export function NavigationProgress() {
  const nav = React.useSyncExternalStore(subscribeNavigation, navigationState, idleNavigation);
  const pathname = usePathname();
  const [finishing, setFinishing] = React.useState(false);
  const wasLoading = React.useRef(false);

  // The route arrived: the bar's job is done.
  React.useEffect(() => {
    navigationSettled();
  }, [pathname]);

  // Give up on a navigation nothing settles — a second click, a payload
  // that never came.
  React.useEffect(() => {
    if (!nav.loading) return;
    const timer = setTimeout(navigationSettled, NAVIGATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [nav.loading, nav.sequence]);

  // loading → idle runs the bar to the far edge and fades it, instead of
  // cutting it off wherever it was.
  React.useEffect(() => {
    if (nav.loading) {
      wasLoading.current = true;
      setFinishing(false);
      return;
    }
    if (!wasLoading.current) return;
    wasLoading.current = false;
    setFinishing(true);
    const timer = setTimeout(() => setFinishing(false), 240);
    return () => clearTimeout(timer);
  }, [nav.loading, nav.sequence]);

  return (
    <>
      {/* `useSearchParams` needs its own boundary on a static route, and a
          search-only navigation (`/search?q=a` → `?q=b`) changes no pathname. */}
      <React.Suspense fallback={null}>
        <SearchSettles />
      </React.Suspense>
      {nav.loading || finishing ? (
        <div
          aria-hidden="true"
          data-navigation={nav.loading ? "loading" : "done"}
          className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-foreground/70 ${
            nav.loading ? "animate-nav-progress" : "animate-nav-done"
          }`}
        />
      ) : null}
    </>
  );
}

function SearchSettles() {
  const search = useSearchParams();
  const key = search?.toString() ?? "";
  React.useEffect(() => {
    navigationSettled();
  }, [key]);
  return null;
}
