"use client";

// Every same-origin destination on this site (openproduct-performance OPP1,
// rewritten at OPP13).
//
// WHY THIS EXISTS RATHER THAN `next/link` AT EACH CALL SITE.
//
// The measured problem was that this app had almost no client-side navigation:
// the public surface was written in plain `<a href>`, so a click discarded the
// document, the React tree, the hydration and the XP2 overlay, and started
// again. The fix is `next/link`. What needs ONE place is the prefetch policy —
// and, since OPP13, the two things a click needs beyond the router: a fetch
// that starts before the click, and something on screen after it.
//
// ─── VIEWPORT PREFETCH DEFAULTS TO OFF ────────────────────────────────────
//
// `<Link>`'s automatic prefetch fetches the payload of every link in the
// viewport. OPP0 measured what that costs before anyone applied it broadly:
// ONE view of `/studio`, a page with five links to listing routes, caused
// twelve upstream reads. The front page renders twenty-four rows. So `prefetch`
// defaults to `false` and is opted into where the destination set is small and
// fixed — the shell's five sections, which every visitor is one click from.
//
// ─── BUT INTENT PREFETCH IS ON, AND THAT IS OPP13'S CORRECTION ────────────
//
// OPP1 recorded that "Next still prefetches on hover at `prefetch={false}`".
// It does not. In the App Router's `link.js` the mouse-enter and touch-start
// handlers return before prefetching whenever `prefetch` is `false`, so every
// click on this site started its network request at the click. So this
// component does what OPP1 believed it had: `router.prefetch` on mouse-enter
// and touch-start, one to three hundred milliseconds before the click lands.
// The router de-duplicates, so hovering twice fetches once.
//
// Never for a personal route. `/me`, `/studio`, `/auth`, `/signin` and
// `/search` are dynamic — a prefetch would be a personal render for a page
// the visitor may never open — and `/auth/*` are redirects off this origin.
//
// That rule is about warming a personal route FROM OUTSIDE IT. Inside the
// studio a maintainer is already on the listing whose steps they are hopping
// between, and OPP15 gives those links `prefetch="auto"`: the router's own
// policy, which on a dynamic route fetches the loading boundary and not the
// data. The skeleton is on screen the instant they click, no personal render
// happens for a step nobody opened, and `warmable` keeps its veto over the
// hover prefetch — a step is not warmed, it is merely outlined.
//
// ─── AND THE CLICK SHOWS ──────────────────────────────────────────────────
//
// `onNavigate` fires only when the router actually takes a click (not a
// modified click, not an external href), and reports it to `ui/navigation.ts`,
// which `shell/navigation-progress.tsx` draws as a bar. On a warm cache the
// bar is gone before it is noticed; on a cold render it is the difference
// between a slow click and a dead one.
//
// ─── WHAT THIS IS NOT FOR ─────────────────────────────────────────────────
//
// An EXTERNAL destination — a repo, a live site, a link somebody wrote in a
// comment. Those stay `<a>`, keep their `rel`, and must never be prefetched:
// `ui/post-body.tsx` already states the rule for user-authored hrefs, and
// prefetching a stranger's URL is a request the reader did not make.

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import type { ComponentPropsWithoutRef } from "react";

import { navigationStarted } from "./navigation";
import { warmable } from "./warmable";

// Derived from `next/link`'s own props rather than from `"a"`. Under
// `exactOptionalPropertyTypes` an anchor-shaped rest object is not assignable
// to `LinkProps` — every optional handler picks up `| undefined` on the way
// through — and widening it here is a cast that would hide a real mismatch.
type NextLinkProps = ComponentPropsWithoutRef<typeof NextLink>;

export interface AppLinkProps extends Omit<NextLinkProps, "href" | "prefetch"> {
  /** A same-origin path, always beginning with `/` (or `#` for an in-page
   *  jump that happens to be written through this component). */
  href: string;
  /**
   * Speculatively fetch this destination when the link enters the viewport.
   *
   * Off unless a call site says otherwise — see the argument above. Turn it on
   * only where the set of destinations is small and fixed.
   *
   * `"auto"` is the router's OWN policy, and OPP15 added it for the studio.
   * On a dynamic route that means the loading boundary and not the data — a
   * skeleton on click, with no personal render done speculatively — which is
   * exactly what a maintainer's five steps want and what neither `true` (five
   * full renders of one listing per page view, the OPP0 defect) nor `false`
   * (a click with nothing on screen) gives them.
   */
  prefetch?: boolean | "auto";
  /**
   * `"intent"`: on hover or touch, fetch the WHOLE destination — data and all
   * — even under a prefix `warmable` refuses (openproduct-studio OSD5).
   *
   * For the studio's step strip. `"auto"` prefetch gives a click its skeleton;
   * this gives it the card, in the 100–300 ms between a pointer arriving on a
   * tab and pressing it. One personal render per tab a maintainer reaches for,
   * never one per tab on screen — which is the line OPP0 drew against `true`.
   */
  warm?: "intent";
}

export function AppLink({
  href,
  prefetch = false,
  warm: warmPolicy,
  onMouseEnter,
  onTouchStart,
  onNavigate,
  ...rest
}: AppLinkProps) {
  const router = useRouter();
  const warm = () => {
    if (warmPolicy === "intent") router.prefetch(href, { kind: PrefetchKind.FULL });
    else if (warmable(href)) router.prefetch(href);
  };
  return (
    <NextLink
      href={href}
      prefetch={prefetch === "auto" ? null : prefetch}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        warm();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        warm();
      }}
      onNavigate={(event) => {
        onNavigate?.(event);
        navigationStarted(href, window.location.pathname + window.location.search);
      }}
      {...rest}
    />
  );
}
