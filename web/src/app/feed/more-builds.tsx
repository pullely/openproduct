"use client";

import * as React from "react";

import {
  CATALOGUE_NEXT_LABEL,
  MORE_BUILDS_FAILED,
  MORE_BUILDS_LOADING,
  cataloguePagePath,
  type PublicProfileCard,
} from "@openproduct/contracts";

import { BuildTile } from "./build-tile";

import { LINK_QUIET } from "../ui/design";
import { AppLink } from "../ui/link";

/** How far before the end the next page is read: about two screens, so a
 *  reader moving at a normal pace never reaches the status line. */
const READ_AHEAD = "1200px 0px";

/**
 * The list that does not end on a button (openproduct-calm CL2, CL-R7).
 *
 * A PROGRESSIVE LAYER, NOT A CLIENT LIST. The front page is still one
 * cacheable document with the first catalogue page in it, rendered on the
 * server (OPC-1), and this component's server render is exactly what the
 * page had before: the plain *More builds* link to `/products/{cursor}`,
 * which a crawler follows and a reader without JavaScript clicks. After
 * paint, when that link comes within two screens, the next page is read from
 * `/api/builds/{cursor}` — the SAME directory page, as JSON, at a path the
 * edge caches — and its tiles are appended under the server's, drawn by the
 * same `BuildTile`. The link then points at the page after, until there is
 * none.
 *
 * NOTHING PERSONAL. The read is anonymous and the same for every visitor;
 * each appended vote box resolves its own state from the overlay, as the
 * server-rendered ones do (I6).
 *
 * A FAILED READ KEEPS THE LINK. The status says so in one line and the plain
 * link is still there to click; nothing retries in a loop.
 */
export function MoreBuilds({ next, returnTo }: { next: string; returnTo: string }) {
  const [builds, setBuilds] = React.useState<PublicProfileCard[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(next);
  const [state, setState] = React.useState<"idle" | "loading" | "failed">("idle");
  const sentinel = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (cursor === null || state !== "idle") return;
    const node = sentinel.current;
    if (node === null || typeof IntersectionObserver === "undefined") return;
    let live = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setState("loading");
        fetch(`/api/builds/${encodeURIComponent(cursor)}`, { headers: { accept: "application/json" } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
          .then((page: { builds?: PublicProfileCard[]; next?: unknown }) => {
            if (!live) return;
            setBuilds((shown) => {
              // A listing that moved between two reads could arrive twice;
              // it is drawn once.
              const seen = new Set(shown.map((card) => card.slug));
              return [...shown, ...(page.builds ?? []).filter((card) => !seen.has(card.slug))];
            });
            setCursor(typeof page.next === "string" && page.next.length > 0 ? page.next : null);
            setState("idle");
          })
          .catch(() => {
            if (live) setState("failed");
          });
      },
      { rootMargin: READ_AHEAD },
    );
    observer.observe(node);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [cursor, state]);

  return (
    <>
      {builds.length > 0 ? (
        <ul className="m-0 mt-[14px] grid list-none gap-[14px] p-0" data-build-tiles-more>
          {builds.map((card) => (
            <BuildTile key={card.slug} card={card} returnTo={returnTo} />
          ))}
        </ul>
      ) : null}
      {cursor !== null ? (
        <div ref={sentinel} className="mt-8 flex flex-col items-center gap-2 text-center text-[14px] text-faint">
          {state === "loading" ? (
            <p role="status" className="m-0 inline-flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="animate-spin">
                <path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {MORE_BUILDS_LOADING}
            </p>
          ) : null}
          {state === "failed" ? (
            <p role="status" className="m-0">
              {MORE_BUILDS_FAILED}
            </p>
          ) : null}
          {/* THE PLAIN LINK STAYS (CL-R7): in the server's HTML for a crawler
              and a reader without JavaScript, and beside a failed read. It
              steps out of sight, not out of the document, while a read is in
              flight. */}
          <AppLink
            href={cataloguePagePath(cursor)}
            data-catalogue-next
            className={`tap font-medium text-copy ${LINK_QUIET} ${state === "loading" ? "sr-only" : ""}`}
          >
            {CATALOGUE_NEXT_LABEL} →
          </AppLink>
        </div>
      ) : null}
    </>
  );
}
