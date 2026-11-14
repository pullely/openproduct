"use client";

import * as React from "react";

import {
  TALK_EMPTY,
  TALK_FILTER_GROUP_LABEL,
  TALK_FILTER_LABELS,
  type PrivateThread,
  type PrivateThreadList,
  type TalkFilter,
} from "@openproduct/contracts";

import { FOCUS } from "../ui/design-core";
import { useOverlay } from "../ui/use-overlay";

import { TALK_SEGMENT, TALK_SEGMENTS, TALK_SEGMENT_OFF, TALK_SEGMENT_ON } from "./classes";
import { TALK_PRIVATE_ANCHOR, talkFilters, talkPrivateRoute } from "./model";

/** The private rows' own chunk: fetched once there is a private thread to
 *  draw, and by nobody else (`private-rows.tsx`). */
const PrivateRows = React.lazy(() => import("./private-rows"));

/**
 * A product's threads, with the All / Public / Private filter (boards
 * `Product` Talk tab, `PhoneProduct`).
 *
 * WHAT THE SERVER DRAWS IS PUBLIC, AND THE SAME FOR EVERYBODY. The public
 * rows are this component's `children`, rendered on the server into the
 * cached page with the filter's All and Public segments. Nothing about the
 * reader is in that HTML (I6).
 *
 * WHAT ARRIVES AFTER LOAD IS THE READER'S OWN. Once the overlay says the
 * reader is signed in, one `no-store` read of `GET /{slug}/talk/private`
 * returns the private threads they may see — their own, or every one for
 * the product's crew; core decides which. The Private segment appears then,
 * and those rows are drawn above the public ones. A signed-out reader, and
 * the server, never have a Private segment and never make the read.
 *
 * THE FILTER HIDES ROWS; IT DOES NOT FETCH. It sets one attribute on the
 * list and each row's own class answers it, so the public rows stay the
 * server's markup.
 */
export function TalkList({
  slug,
  publicCount,
  heading = "h2",
  children,
}: {
  slug: string;
  /** How many public rows `children` holds; null when the public threads
   *  could not be read — then no count is claimed and nothing says "none". */
  publicCount: number | null;
  heading?: "h2" | "h3";
  children: React.ReactNode;
}) {
  const overlay = useOverlay([slug]);
  const signedIn = overlay.status === "ready";
  const [filter, setFilter] = React.useState<TalkFilter>("all");
  const [privateThreads, setPrivateThreads] = React.useState<PrivateThread[] | null>(null);
  const [now, setNow] = React.useState(0);
  const root = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!signedIn) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch(talkPrivateRoute(slug), {
          headers: { accept: "application/json" },
          credentials: "same-origin",
          cache: "no-store",
        });
        const body = (await res.json().catch(() => null)) as { data?: PrivateThreadList } | null;
        if (!live) return;
        setNow(Date.now());
        setPrivateThreads(res.ok && body?.data ? body.data.threads : []);
      } catch {
        if (live) setPrivateThreads([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [signedIn, slug]);

  // "Needs you" → Open arrives at `#private`: show the Private filter.
  React.useEffect(() => {
    if (!signedIn) return;
    const open = () => {
      if (window.location.hash !== `#${TALK_PRIVATE_ANCHOR}`) return;
      setFilter("private");
      root.current?.scrollIntoView({ block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [signedIn]);

  const privateCount = privateThreads?.length ?? 0;
  const counts: Record<TalkFilter, number | null> = {
    all: publicCount === null ? null : publicCount + privateCount,
    public: publicCount,
    private: privateCount,
  };
  const shown = filter === "private" && !signedIn ? "all" : filter;

  return (
    <div
      ref={root}
      id="threads"
      data-talk-filter={shown}
      className="group/talk flex scroll-mt-[80px] flex-col gap-[18px] max-sm:gap-2.5"
    >
      <div role="group" aria-label={TALK_FILTER_GROUP_LABEL} className={`${TALK_SEGMENTS} flex-wrap self-start`}>
        {talkFilters(signedIn).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={shown === name}
            onClick={() => setFilter(name)}
            data-talk-filter-option={name}
            className={`${TALK_SEGMENT} border-0 ${shown === name ? TALK_SEGMENT_ON : TALK_SEGMENT_OFF} ${FOCUS}`}
          >
            {TALK_FILTER_LABELS[name]}
            {counts[name] === null ? null : (
              <span className="font-mono text-[11px] font-normal text-muted-foreground">{counts[name]}</span>
            )}
          </button>
        ))}
      </div>

      {privateThreads && privateThreads.length > 0 ? (
        <React.Suspense fallback={null}>
          <PrivateRows slug={slug} threads={privateThreads} now={now} heading={heading} />
        </React.Suspense>
      ) : null}
      {children}

      {counts[shown] === 0 ? (
        <p data-talk-empty className="m-0 rounded-[16px] bg-card p-6 text-center text-[15px] text-muted-foreground max-sm:p-4">
          {TALK_EMPTY}
        </p>
      ) : null}
    </div>
  );
}
