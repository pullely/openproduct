"use client";

import { useMaker } from "../[slug]/maker/use-maker";
import { FOCUS } from "../ui/design-core";
import { AppLink } from "../ui/link";

import { TALK_ACTION, TALK_ACTION_INK, TALK_ACTION_SOFT } from "./classes";
import { threadHref, threadRepliesLabel, type TalkThread } from "./model";
import { ResolveControl } from "./resolve-control";

/**
 * A thread row's actions (boards `Product`, `PhoneProduct`): the replies
 * pill, which opens the thread at its own address, and what an issue says
 * about being resolved.
 *
 * THE SERVER RENDER IS THE VISITOR'S, FOR EVERYBODY. `useMaker` answers
 * "not the crew" on the server and until the overlay has spoken, so the
 * cached page carries "Reply" / "3 replies" and, on a resolved issue, the
 * green "Resolved". The crew's variants — "Answer" on a thread nobody has
 * answered, and the Mark resolved button — are drawn in the crew's own
 * browser after load. Nothing here contains a time, so the visitor's render
 * and the browser's first render are the same text.
 */
export function ThreadActions({ slug, thread }: { slug: string; thread: TalkThread }) {
  const { managing } = useMaker(slug);
  const answer = managing && thread.postCount === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AppLink
        href={threadHref(thread)}
        data-thread-open
        className={`${TALK_ACTION} ${answer ? TALK_ACTION_INK : TALK_ACTION_SOFT} ${FOCUS}`}
      >
        {threadRepliesLabel(thread, managing)}
      </AppLink>
      <ResolveControl slug={slug} thread={thread} />
    </div>
  );
}
