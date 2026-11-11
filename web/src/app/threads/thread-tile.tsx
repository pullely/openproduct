import { THREAD_TAG_LABELS, THREAD_TILE_LABEL, type PublicThread } from "@openproduct/contracts";

import { initialsOf } from "../feed/tile";
import { AppLink } from "../ui/link";
import { absoluteOf, agoOf } from "../ui/time";

/**
 * A thread, as a tile (openproduct-calm-pages CP3, CP-R6 — the build tile's
 * shape for a thing that is not a build).
 *
 * WHO AND WHAT on the left: the starter's initials (a picture nobody
 * uploaded is a claim, FO1), the tag, the title at 19px, and the line under
 * it — the build it is about, when the list spans builds, and who started
 * it. HOW IT IS MOVING on the right: two figures, each a small label said
 * once and a value (CL-R4) — the visible replies, and when it last moved.
 *
 * THE TILE IS THE TARGET (FR2): the title's link stretches over it; the
 * build's link sits above the stretch on its own. `data-keyrow`, so `j`/`k`
 * walk a list of threads as they walk the builds (QE3).
 */
export function ThreadTile({
  thread,
  slug = null,
  now,
}: {
  thread: PublicThread;
  /** The build the thread lives on, when the list spans builds. */
  slug?: string | null;
  now: number;
}) {
  const author = thread.authorName ?? thread.authorHandle ?? "a contributor";
  const moved = thread.lastPostAt ?? thread.createdAt;
  return (
    <li
      data-keyrow
      data-thread-tile
      className="relative flex list-none items-center gap-[22px] rounded-[20px] border border-border bg-card px-8 py-6 transition-colors hover:border-border-strong max-sm:flex-wrap max-sm:gap-4 max-sm:px-5 max-sm:py-5"
    >
      <span
        aria-hidden="true"
        className="grid h-[44px] w-[44px] shrink-0 place-items-center self-start rounded-full bg-secondary font-mono text-[12px] text-copy max-sm:h-[36px] max-sm:w-[36px]"
      >
        {initialsOf(thread.authorName ?? thread.authorHandle ?? slug ?? thread.title)}
      </span>
      <div className="min-w-0 flex-1">
        <span className="inline-flex h-[24px] items-center rounded-full border border-border px-2.5 text-[12.5px] text-muted-foreground">
          {THREAD_TAG_LABELS[thread.tag]}
        </span>
        <AppLink
          href={`/threads/${thread.id}`}
          className="mt-2 block text-[19px] font-semibold leading-[1.3] tracking-[-0.015em] text-foreground after:absolute after:inset-0 after:content-[''] hover:text-copy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:text-[17px]"
        >
          {thread.title}
        </AppLink>
        <p className="m-0 mt-1.5 text-[14px] text-muted-foreground">
          {slug ? (
            <>
              <AppLink href={`/${slug}`} className="tap relative z-10 hover:text-foreground">
                {slug}
              </AppLink>
              <span className="text-faint"> · </span>
            </>
          ) : null}
          {author}
          {thread.state === "answered" ? " · answered" : thread.state === "locked" ? " · locked" : ""}
        </p>
      </div>
      <dl className="m-0 grid shrink-0 grid-cols-2 gap-8 max-sm:w-full max-sm:gap-4 max-sm:pl-[52px]">
        <div data-thread-replies>
          <dt className="text-[12.5px] text-faint">{THREAD_TILE_LABEL.replies}</dt>
          <dd className="m-0 mt-1.5 text-[22px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground max-sm:text-[19px]">
            {thread.postCount}
          </dd>
        </div>
        <div data-thread-moved>
          <dt className="text-[12.5px] text-faint">
            {thread.lastPostAt ? THREAD_TILE_LABEL.lastReply : THREAD_TILE_LABEL.started}
          </dt>
          <dd
            className="m-0 mt-1.5 whitespace-nowrap text-[15px] leading-[22px] text-copy"
            title={absoluteOf(moved)}
          >
            {agoOf(moved, now)}
          </dd>
        </div>
      </dl>
    </li>
  );
}
