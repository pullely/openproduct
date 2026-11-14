import { AppLink } from "../ui/link";
import { FOCUS } from "../ui/design-core";
import { agoOf } from "../ui/time";

import {
  TALK_BADGE,
  TALK_BADGE_PRIVATE_CLASS,
  TALK_BADGE_PUBLIC_CLASS,
  TALK_CARD,
  TALK_CARD_PRIVATE,
  TALK_CARD_PUBLIC,
} from "./classes";
import { GlobeGlyph, LockGlyph } from "./glyphs";
import { threadAuthor, threadBadge, threadKindLabel, threadMonogram, type TalkThread } from "./model";
import { ThreadActions } from "./gates";

/**
 * One thread in a Talk list (boards `Product` Talk tab, `PhoneProduct`):
 * who started it and what kind it is, a badge for who can see it, its words,
 * and one row of actions.
 *
 * NO HOOKS AND NO "use client": a public thread's row is drawn by the server
 * into the cached page, a private one by the browser after the signed-in
 * read. `now` is the caller's clock for that reason — the server's at
 * render, the browser's for a private row — so the relative time is never
 * computed twice for one row.
 *
 * The card's words are the thread's title; its replies are at its own
 * address, which the row's action opens.
 */
export function ThreadRow({
  slug,
  thread,
  now,
  heading = "h2",
}: {
  slug: string;
  thread: TalkThread;
  now: number;
  /** `h3` where Talk sits under a section heading of its own (an idea's page). */
  heading?: "h2" | "h3";
}) {
  const Title = heading;
  const isPrivate = thread.visibility === "private";
  const author = threadAuthor(thread);
  const badge = threadBadge(thread.visibility);
  return (
    <article
      data-thread={thread.id}
      data-visibility={thread.visibility}
      className={`${TALK_CARD} ${isPrivate ? TALK_CARD_PRIVATE : TALK_CARD_PUBLIC} ${
        isPrivate
          ? "group-data-[talk-filter=public]/talk:hidden"
          : "group-data-[talk-filter=private]/talk:hidden"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-semibold text-copy"
        >
          {threadMonogram(author)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
          {thread.authorHandle && !thread.mine ? (
            <AppLink
              href={`/@${thread.authorHandle}`}
              className={`self-start truncate text-[15px] font-semibold text-foreground no-underline hover:underline ${FOCUS}`}
            >
              {author}
            </AppLink>
          ) : (
            <span className="truncate text-[15px] font-semibold text-foreground">{author}</span>
          )}
          <span className="text-[13px] text-muted-foreground">
            {threadKindLabel(thread)} · {agoOf(thread.createdAt, now)}
          </span>
        </span>
        <span className={`${TALK_BADGE} ${isPrivate ? TALK_BADGE_PRIVATE_CLASS : TALK_BADGE_PUBLIC_CLASS}`}>
          {isPrivate ? <LockGlyph size={12} /> : <GlobeGlyph size={12} />}
          <span className="max-sm:hidden">{badge.label}</span>
          <span className="sm:hidden">{badge.short}</span>
        </span>
      </div>
      <Title className="m-0 break-words text-card-title font-normal leading-[1.35] tracking-[-0.01em] text-foreground">
        {thread.title}
      </Title>
      <ThreadActions slug={slug} thread={thread} />
    </article>
  );
}
