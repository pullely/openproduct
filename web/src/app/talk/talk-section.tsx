import type { PublicThread } from "@openproduct/contracts";

import { TalkComposer } from "./composer";
import { publicThreadCount, talkThreadOf } from "./model";
import { TalkList } from "./gates";
import { ThreadRow } from "./thread-row";

/**
 * Talk's own part of a product page (boards `Product` Talk tab,
 * `ProductIdea`, and their phone boards; openproduct-redesign OPR-4):
 *
 *   the composer   one field, the thread's kind, who can see it, the button
 *   the filter     All / Public, and Private for a signed-in reader
 *   the threads    the product's PUBLIC threads; each opens at its own
 *                  address, where its replies are
 *
 * A SERVER COMPONENT, GIVEN ONLY PUBLIC THREADS. `threads` is the public
 * discussion read's list — a private thread is in no public read — so this
 * renders the same bytes for every visitor (I6). `null` is "they could not
 * be read", which is not "there are none" (OD5): no count is claimed and
 * nothing says "No threads".
 */
export function TalkSection({
  slug,
  threads,
  onPage = false,
}: {
  slug: string;
  threads: readonly PublicThread[] | null;
  /** An idea's page: Talk is a section of the page, under its own heading. */
  onPage?: boolean;
}) {
  const now = Date.now();
  const heading = onPage ? "h3" : "h2";
  return (
    <>
      <TalkComposer slug={slug} returnTo={onPage ? `/${slug}#talk` : `/${slug}/talk`} />
      <TalkList slug={slug} publicCount={publicThreadCount(threads)} heading={heading}>
        {(threads ?? []).map((thread) => (
          <ThreadRow key={thread.id} slug={slug} thread={talkThreadOf(thread)} now={now} heading={heading} />
        ))}
      </TalkList>
    </>
  );
}
