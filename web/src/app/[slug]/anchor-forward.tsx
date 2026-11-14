"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { forwardedAddress, type ProductTab } from "./tabs";

/**
 * An arrival at an anchor that lives on another tab goes to that tab
 * (openproduct-redesign OPR-3).
 *
 * Before the tabs, `/{slug}#discussion`, `/{slug}#people-wanted` and
 * `/{slug}#changed` were all on one page, and a comment's return address, an
 * inbox row, a Help wanted card and the weekly digest still link to them. A
 * fragment never reaches the server, so the cached page cannot redirect it;
 * this does, in the browser, once: `/{slug}?commented=ok#discussion` becomes
 * `/{slug}/talk?commented=ok#discussion`.
 *
 * Renders nothing, and does nothing when the anchor is on the open tab or is
 * nobody's.
 */
export function AnchorForward({ slug, tab }: { slug: string; tab: ProductTab }) {
  const router = useRouter();
  React.useEffect(() => {
    const forward = () => {
      const { hash, search } = window.location;
      // An element with that id on this page wins: the anchor is here.
      if (hash.length > 1 && document.getElementById(decodeURIComponent(hash.slice(1)))) return;
      const to = forwardedAddress(slug, tab, search, hash);
      if (to) router.replace(to);
    };
    forward();
    window.addEventListener("hashchange", forward);
    return () => window.removeEventListener("hashchange", forward);
  }, [router, slug, tab]);
  return null;
}
