"use client";

import * as React from "react";

/**
 * A thread's page, just arrived at from the composer (`?started={slug}`):
 * drop that product's draft from the tab — the words are a thread now — and
 * take the marker out of the address so a reload or a shared link does not
 * carry it. Renders nothing.
 */
export function TalkStarted() {
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const slug = url.searchParams.get("started");
    if (!slug) return;
    url.searchParams.delete("started");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (!/^[A-Za-z0-9-]{1,64}$/.test(slug)) return;
    try {
      window.sessionStorage.removeItem(`op.draft.thread.${slug}`);
    } catch {
      // No storage, no draft to drop.
    }
  }, []);
  return null;
}
