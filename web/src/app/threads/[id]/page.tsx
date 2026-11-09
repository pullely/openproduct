import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  nestPosts,
  MAX_POST_BODY,
  POSTING_NOTICE,
  THREAD_LOCKED_NOTE,
  THREAD_REMOVED_NOTE,
  THREAD_TAG_LABELS,
  threadAcceptsPosts,
  postPermalink,
  shareIntents,
  threadShareText,
  threadShareUrl,
  type PublicPost,
} from "@openproduct/contracts";

import { PersonName } from "../../ui/bits";
import { CommentVote } from "../../ui/comment-vote";
import { BTN_PRIMARY, CRUMBS, PAGE_TITLE, TEXTAREA } from "../../ui/design";
import { MaintainerBadge } from "../../ui/maintainer-badge";

import { ConversationLive } from "../../ui/conversation-live";
import { conversationKey } from "../../ui/live-posts";
import { PostBody } from "../../ui/post-body";
import { ReportControl } from "../../ui/report-control";
import { ShareControl } from "../../[slug]/share-control";
import { initialsOf } from "../../feed/tile";
import { AppLink } from "../../ui/link";
import { ROW_ATTRIBUTE } from "../../ui/keys";
import { absoluteOf, agoOf } from "../../ui/time";
import { fetchThread, publicApexOrigin } from "../../public-api";
import { FORUM_PAGE } from "../forum-view";

/**
 * One discussion (openproduct-commons CB1).
 *
 * ANONYMOUS AND CACHED, like every other public page here: no actor, no
 * personalisation, the same bytes for everybody (OPC-1, I6). The composer at
 * the bottom is static markup and the session is read on the POST.
 *
 * A REMOVED THREAD RENDERS AS REMOVED (TS-3), not as a 404 — the address
 * keeps working so inbound links do not break, and the person it happened to
 * has something to point at.
 *
 * THE DESIGN'S THREAD: `← All threads`, the tag pill, the title at the page
 * title's 26px, the author's line with a 32px mark, and then ONE CARD that
 * holds the composer at its top and the posts as rows beneath it — each row
 * a 32px mark, the name at 14px/600, the moment, and the words.
 */
export const revalidate = 60;

/** XP4 — without this the `revalidate` above is accepted and ignored, and the
 *  route is served `no-store` to everybody. See the long note on the same
 *  function in `app/[slug]/page.tsx`; `[]` prerenders nothing and lets the ISR
 *  cache do the work from the first request onward. */
export async function generateStaticParams() {
  return [];
}


interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const read = await fetchThread(id);
  if (!read) return { title: "Not found" };
  if (read.thread.state === "removed") {
    // Naming it would republish, in the tab and in every preview card, the
    // title of the thing that was taken down.
    return { title: "No longer here", robots: { index: false, follow: false } };
  }
  return { title: read.thread.title };
}

// `Post` is above the page on purpose: the row's permalink is the first link
// a keyboard reader lands on, and the test that pins it reads source order.
function Post({
  post,
  threadId,
  open,
  replies,
  parent,
}: {
  post: PublicPost;
  threadId: string;
  /** FO3 — the post this one answers, for the *Replying to* line. Null on
   *  a top-level post. The name is the parent's own, as its header draws it. */
  parent: PublicPost | null;
  /** Whether this post can be answered. False on a reply — one level — and
   *  false on every post in a locked thread. */
  open: boolean;
  /**
   * The replies to this post, rendered INSIDE its own `<li>`.
   *
   * Not beside it in a wrapper: an `<li>` whose parent is an `<li>` is
   * invalid HTML, which axe caught the moment this was first drawn. The
   * nested `<ol>` is a child of the post it belongs to, which is also what
   * it means.
   */
  replies?: readonly PublicPost[];
}) {
  return (
    <li
      // CV1 — a reply returns the reader to the post they answered, and a
      // notification's link can name a post rather than the top of a thread.
      id={`post-${post.id}`}
      // FO3 — a post is a ROW for the keyboard layer (FR4): `j`/`k` move
      // between posts, landing on the permalink — the row's first link —
      // and `u` presses the comment's own upvote.
      {...{ [ROW_ATTRIBUTE]: true }}
      // The design's post row: a 32px mark, then the words, under a `--line`
      // rule. The answer is the row the thread's author marked, and it says
      // so in its header rather than in a frame.
      className="flex scroll-mt-20 gap-3 border-t border-line pb-1 pt-4"
    >
      <span
        aria-hidden="true"
        className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[11px] text-copy"
      >
        {initialsOf(post.authorName ?? post.authorHandle ?? "Somebody")}
      </span>
      <div className="min-w-0 flex-1">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
        {/* FO3 — THE PERMALINK, first in the row: a stable address for the
            post, which is what makes a quote checkable and a notification's
            link land on the words it names.

            A `#` is one glyph, 8px wide, and the design's 8px gap put the
            name's link exactly one 24px circle away — axe's target-size
            failed it at both widths. So the glyph keeps its place and its
            HIT AREA grows: 9px of padding each side, cancelled by the same
            negative margin, makes it at least 24px wide, and (above the phone width,
            where `tap-h` already makes it 44px tall) 3px top and bottom make
            it 24px tall without moving the line. */}
        <AppLink
          href={postPermalink(threadId, post.id)}
          title="Link to this post"
          className="tap-h -mx-[9px] px-[9px] text-center sm:-my-[3px] sm:py-[3px] font-mono text-faint hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          #
        </AppLink>
        <PersonName
          name={post.authorName ?? post.authorHandle ?? "Somebody"}
          handle={post.authorHandle}
          className="text-[14px] font-semibold text-foreground"
        />
        {/* FO3 — *Replying to*, so a reply read out of its nest still says
            whose words it answers. The parent's link is its permalink. */}
        {parent ? (
          <span>
            replying to{" "}
            <AppLink href={postPermalink(threadId, parent.id)} className="underline underline-offset-[3px] hover:text-foreground">
              {parent.authorName ?? parent.authorHandle ?? "somebody"}
            </AppLink>
          </span>
        ) : null}
        <span>{day(post.createdAt)}</span>
        {/* A trail whose posts can be rewritten silently is a trail nobody
            can rely on. */}
        {post.editedAt ? <span>· edited</span> : null}
        {/* CV2 — the same badge the product page's comments draw, from the
            same projection. A post appears on two surfaces and there is one
            component for it. */}
        {post.authorIsMaintainer ? <MaintainerBadge /> : null}
        {post.isAnswer ? (
          <span className="font-mono text-[12px] uppercase tracking-[0.06em]">the answer</span>
        ) : null}
      </div>
      {/* A removed post keeps its place and says so — the reply is still in
          the conversation, and the replies around it still follow (TS-3). */}
      <div className={`max-w-[70ch] ${post.state === "removed" ? "italic text-muted-foreground" : ""}`}>
        <PostBody nodes={post.body} />
      </div>
      {/* DQ1 — the same control the product page draws, because it is the
          same act. Absent on a removed post: there are no words there to
          agree with. */}
      {post.state === "removed" ? null : (
        // `items-start`: the disclosure grows downward when it opens, and a
        // centred row would float the vote box to the middle of an open
        // reply form.
        <div className="mt-2.5 flex flex-wrap items-start gap-x-4 gap-y-2">
          <CommentVote postId={post.id} votes={post.votes} returnTo={`/threads/${threadId}`} />
          {/* CV1 — A DISCLOSURE, NOT A CLIENT COMPONENT. `<details>` is the
              estate's own idiom for "more, on request" and costs no bundle:
              this page stays a server component and the form inside is the
              same progressive-enhancement post the thread's own box makes.

              ABSENT ON A REPLY, which is the one-level rule where a reader
              meets it. A control that opened and then failed at the API
              would be the rule enforced as an error message instead of as a
              shape. */}
          {open ? (
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer list-none text-[12.5px] text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Reply to this
              </summary>
              <form
                method="post"
                action={`/threads/${threadId}/reply`}
                data-live="post"
                className="mt-2.5 pt-1"
              >
                <input type="hidden" name="parentPostId" value={post.id} />
                <label className="block">
                  <span className="sr-only">Your reply</span>
                  <textarea name="body" required rows={3} maxLength={MAX_POST_BODY} className={TEXTAREA} />
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="submit"
                    className={`${BTN_PRIMARY} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
                  >
                    Reply
                  </button>
                  {/* CB-2 — the standing notice belongs BESIDE THE FIELD, not
                      elsewhere on the page. This composer is a second one, so
                      it carries the rule too; a reader who opened this one
                      never saw the box at the bottom. */}
                  <span className="text-[12.5px] text-muted-foreground">{POSTING_NOTICE}</span>
                </div>
              </form>
            </details>
          ) : null}
        </div>
      )}
      {replies && replies.length > 0 ? (
        // Indented once and never twice. `nestPosts` flattens anything
        // deeper, so this list cannot contain another.
        <ol className="m-0 mt-3 list-none p-0">
          {replies.map((reply) => (
            <Post key={reply.id} post={reply} threadId={threadId} open={false} parent={post} />
          ))}
        </ol>
      ) : null}
      </div>
    </li>
  );
}

export default async function ThreadPage({ params }: PageProps) {
  const { id } = await params;
  const read = await fetchThread(id);
  if (!read) notFound();

  const { thread, posts } = read;
  const open = threadAcceptsPosts(thread.state);
  // FO3 — RE3's share control, for the thread. `null` without a canonical
  // origin, as on the listing: sharing a preview host is sharing the wrong
  // page. A removed thread is not shared: there is nothing there to share.
  const share = (() => {
    const url = threadShareUrl(publicApexOrigin(), thread.id);
    if (!url || thread.state === "removed") return null;
    const text = threadShareText(thread.title, null);
    return { url, text, intents: shareIntents(url, text) };
  })();

  const author = thread.authorName ?? thread.authorHandle ?? "a contributor";

  return (
    <main className={FORUM_PAGE}>
      {/* The way back to the index, as the design draws it. */}
      <nav aria-label="Breadcrumb" className={CRUMBS}>
        <AppLink href="/threads" className="tap inline-flex items-center gap-1.5 hover:text-foreground">
          <span aria-hidden="true">←</span> All threads
        </AppLink>
      </nav>

      <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
        <span className="inline-flex h-[26px] items-center rounded-full border border-border px-3 text-[13px] text-muted-foreground">
          {THREAD_TAG_LABELS[thread.tag]}
        </span>
        {thread.state === "answered" ? (
          <span className="font-mono text-[13px] text-muted-foreground">answered</span>
        ) : null}
      </div>

      <h1 className={`${PAGE_TITLE} mt-2.5 max-w-[34ch]`}>{thread.title}</h1>

      {/* Who started it, and when, and how much followed — the forum row's
          own facts, on the thread. The moment is relative, as the row's is,
          and carries the absolute in its title. */}
      <div className="mt-3.5 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-[32px] w-[32px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[11px] text-copy"
        >
          {initialsOf(author)}
        </span>
        <span className="text-[13.5px] text-muted-foreground">
          <PersonName name={author} handle={thread.authorHandle} className="font-medium text-foreground" />
          {" · "}
          <span title={absoluteOf(thread.createdAt)}>started {agoOf(thread.createdAt, Date.now())}</span>
          {" · "}
          {thread.postCount} {thread.postCount === 1 ? "reply" : "replies"}
        </span>
      </div>
      {share ? (
        <div className="mt-3">
          <ShareControl url={share.url} text={share.text} intents={share.intents} />
        </div>
      ) : null}

      {thread.state === "removed" ? (
        <p className="m-0 mt-6 max-w-[68ch] rounded-[20px] border border-border bg-card px-6 py-5 text-[14.5px] leading-[1.6] text-muted-foreground">
          {THREAD_REMOVED_NOTE}
        </p>
      ) : (
        <>
          {/* CV1 — THE POLICY, SAID ON THE PAGE. Per-comment upvotes exist
              and order nothing; a number beside a post that a reader assumes
              is sorting the page is worse than no number. */}
          {/* OPP14 — the thread is live: a reply is drawn under its parent
              the moment it is posted, and the forms below stay the plain
              forms they were (see `ui/conversation-live.tsx`). */}
          <ConversationLive
            conversation={conversationKey("thread", thread.id)}
            renderedIds={posts.map((post) => post.id)}
            variant="post"
          >
          {/* THE CARD: the composer first, the posts as rows beneath it —
              `20px 24px` inside a 12px card, 860px at most. */}
          <div className="mt-10 max-w-[860px] rounded-[20px] border border-border bg-card px-8 py-7 max-sm:px-5 max-sm:py-5">
          {open ? (
            <form
              method="post"
              action={`/threads/${thread.id}/reply`}
              data-live="post"
              className="rounded-[14px] border border-border-strong bg-card px-4 py-3.5"
            >
              <label className="block">
                <span className="sr-only">Reply</span>
                <textarea
                  name="body"
                  required
                  rows={3}
                  maxLength={MAX_POST_BODY}
                  className={`${TEXTAREA} resize-y border-0 bg-transparent px-0 py-0 focus:ring-0`}
                />
              </label>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-2.5">
                {/* CB-2 — the standing notice, beside the field it governs.
                    d8b10168 cut it with the site's explainers, but it is not
                    one: it is the rule a person agrees to by pressing the
                    button, and the one line on this page that says their
                    words will be public and signed before they are. */}
                <span className="text-[12.5px] text-muted-foreground">{POSTING_NOTICE}</span>
                <button
                  type="submit"
                  className={`${BTN_PRIMARY} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
                >
                  Reply
                </button>
              </div>
            </form>
          ) : (
            // Locking ends a conversation; it does not retract it. The page
            // has to be clear which of those happened.
            <p className="m-0 text-[13.5px] text-muted-foreground">{THREAD_LOCKED_NOTE}</p>
          )}

          <ol className="m-0 mt-2 list-none p-0">
            {nestPosts(posts).map(({ post, replies }) => (
              <Post
                key={post.id}
                post={post}
                threadId={thread.id}
                open={open}
                replies={replies}
                parent={null}
              />
            ))}
          </ol>
          </div>
          </ConversationLive>
        </>
      )}

      <ReportControl subjectKind="thread" subjectRef={thread.id} returnTo={`/threads/${thread.id}`} />
    </main>
  );
}

function day(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? ""
    : new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
