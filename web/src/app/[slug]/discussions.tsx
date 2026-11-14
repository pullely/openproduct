import Link from "next/link";

import { THREAD_TAG_LABELS, type PublicThread } from "@openproduct/contracts";

import { PersonName } from "../ui/bits";

/**
 * The titled discussions (openproduct-commons CB1) — the placeholder XP1 drew
 * with `pendingCluster: "CB"`, now real.
 *
 * THE DESIGN DOES NOT DRAW THIS SECTION, so it borrows the design's own
 * idiom rather than keeping an older one: rows under `--line` rules inside
 * the Discussion card, the mono chip the stack uses for a thread's tag.
 *
 * A SERVER COMPONENT THAT READS NO SESSION. It renders inside `[slug]`, which
 * is anonymous and edge-cached; reading a session here would either break the
 * cache or make the page differ by viewer, and I6 says the bytes are the same
 * for everybody. The composer therefore renders IDENTICALLY signed in or out,
 * and the session is read once — on the POST, in the route handler.
 *
 * THAT IS ALSO WHY THE SIGNED-OUT PROMPT IS NOT CONDITIONAL. The plan asks
 * for "a signed-out form that prompts sign-in in place of the textarea", and
 * the honest way to do that on a cached page is the other way round: the form
 * is always the form, and the POST bounces through sign-in and comes back.
 * A page that swapped the textarea for a prompt would have to know who is
 * reading it, and then it is not one document any more.
 */
/**
 * PP0 (openproduct-worldclass-v2, WC-6) — ONE LAUNCH, ONE CONVERSATION.
 *
 * This module used to be the second conversation object on the listing page:
 * a list of titled threads with its own composer, forty pixels under the
 * launch thread's. It now renders only what already exists — titled threads
 * a listing had before the collapse — as links under one label, with no
 * composer and no claim about the conversation. On production there are
 * none (WC-B, 10 September 2026), so this renders nothing; it is here so a
 * database that does hold one keeps that thread reachable rather than
 * orphaning it at /threads/{id}.
 */
export function EarlierDiscussions({ threads }: { threads: PublicThread[] | null }) {
  if (threads === null || threads.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-3" data-earlier-discussions={threads.length}>
      <p className="m-0 text-[13px] font-medium text-muted-foreground">Earlier discussions</p>
      <ul className="m-0 mt-1 list-none p-0">
        {threads.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} />
        ))}
      </ul>
    </div>
  );
}

function ThreadCard({ thread }: { thread: PublicThread }) {
  return (
    <li className="border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex h-[22px] items-center rounded-full bg-secondary px-2 font-mono text-[11px] text-copy">
          {THREAD_TAG_LABELS[thread.tag]}
        </span>
        <Link
          href={`/threads/${thread.id}`}
          className="tap-h text-[15px] font-semibold text-foreground no-underline hover:underline hover:underline-offset-[3px]"
        >
          {thread.title}
        </Link>
        {thread.state === "answered" ? (
          <span className="font-mono text-[13px] uppercase tracking-[0.05em] text-muted-foreground">
            answered
          </span>
        ) : null}
        {thread.state === "locked" ? (
          <span className="font-mono text-[13px] uppercase tracking-[0.05em] text-muted-foreground">
            locked
          </span>
        ) : null}
      </div>

      <p className="m-0 mt-1 text-[13px] text-muted-foreground">
        {/* XP-5 — a name is a link or plain text, never a dead link. */}
        <PersonName
          name={thread.authorName ?? thread.authorHandle ?? "Somebody"}
          handle={thread.authorHandle}
          className="text-muted-foreground"
        />
        {" · "}
        {/* The count is of VISIBLE posts. A count including what a reader
            cannot see reads as a bug the first time somebody counts. */}
        {thread.postCount} {thread.postCount === 1 ? "post" : "posts"}
        {thread.lastPostAt ? ` · last ${day(thread.lastPostAt)}` : ""}
      </p>
    </li>
  );
}

/**
 * The composer. Progressive enhancement, no client JS, posts to `/threads/new`
 * which reads the session server-side and bounces through sign-in when there
 * is none — the same shape as every other act on this page.
 */
function day(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? ""
    : new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
