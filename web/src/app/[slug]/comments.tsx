import {
  type PublicPost,
  type PublicThread,
  THREAD_TAGS,
  THREAD_TAG_LABELS,
} from "@openproduct/contracts";

import { CommentDraft } from "./comment-draft";

import { ConversationLive } from "../ui/conversation-live";
import { conversationKey } from "../ui/live-posts";

import { initialsOf } from "../feed/tile";
import { PersonName } from "../ui/bits";
import { CommentVote } from "../ui/comment-vote";
import { PostBody } from "../ui/post-body";
import { ReportControl } from "../ui/report-control";

import { MaintainerBadge } from "../ui/maintainer-badge";

import { AppLink } from "../ui/link";

/**
 * The product page's comment section (openproduct-launch DQ0b), at the
 * design's measurements: an 8px-radius composer on `--border-strong` with a
 * borderless textarea and a 32px `Post` button in its foot, then a list of
 * 36px-avatar rows under `--line` rules.
 *
 * IT IS A THREAD, and calling it one is the milestone's whole decision. The
 * design draws a box with no title and no tag: you type and you have said
 * something. That is not a different object from a discussion — it is a
 * discussion nobody was asked to name — so it is the listing's one `launch`
 * thread, and every rule already written about a thread applies to it
 * unchanged: TS3 removes it through the same ledger, TS2 gates the same write,
 * CB4 notifies the same participants, and the body goes through the same
 * render subset on the way out.
 *
 * FLAT, WITH NO REPLY BUTTON. The design draws one; CB0's posts are a flat
 * list with no parent, and a Reply control that only scrolled to the box below
 * would be a control that looks like threading and is not. When somebody
 * builds nesting the button arrives with it.
 *
 * THE VOTE CONTROL IS DQ1's, and it works. XP1's rule is that an inert
 * control says which sub-epic makes it real; this one is not inert.
 *
 * A SERVER COMPONENT THAT READS NO SESSION, like CB1's composer below it. The
 * form is always the form; the POST reads the session once, in the route
 * handler, and bounces through sign-in when there is none. A page that swapped
 * the textarea for a prompt would have to know who is reading it, and then it
 * is not one document any more (I6). That is also why the composer's avatar
 * is a blank disc rather than the design's initials: the initials are the
 * VISITOR's, and the server does not know who that is.
 *
 * THE HEADING IS THE PAGE'S. The design draws `Discussion` and the count on
 * one line above the box; the page owns that line, because the heading's id
 * is what the hero's action and the feed row's `N comments` link point at.
 */
export function Comments({
  slug,
  launch,
}: {
  slug: string;
  launch: { thread: PublicThread; posts: PublicPost[] } | null;
  // CV2 TOOK A PROP AWAY FROM HERE, and the prop was the bug. This component
  // used to be handed the listing's maintainer HANDLES and compare each
  // comment's author against them — which quietly un-badged every maintainer
  // who had not published a profile, because they have no handle to compare.
  // Each post now carries `authorIsMaintainer`, decided in core over subject
  // ids, which is what the roster actually holds.
}) {
  const posts = launch?.posts ?? [];
  const locked = launch?.thread.state === "locked";

  return (
    <div>
      {/* CB-2's standing notice, said BEFORE anybody types rather than after
          they have. It is a rule, not a caution. */}

      {/* OPP14 — THE SECTION IS LIVE, AND STILL ONE DOCUMENT. The wrapper is
          a client island that takes the composer's submit when the visitor
          is signed in, draws the comment at once, and posts it in the
          background; the composer inside is the same form it always was, and
          a signed-out visitor's press posts it exactly as before. The ids the
          document rendered ride along, so a comment the page has caught up
          with is drawn once. Nothing here reads a session (I6). */}
      <ConversationLive
        conversation={conversationKey("listing", slug)}
        renderedIds={posts.map((post) => post.id)}
        variant="comment"
        draftKey={`op.draft.comment.${slug}`}
      >
        {locked ? (
          // A locked thread STAYS READABLE — locking ends a conversation, it
          // does not retract it. The composer goes, because a box that posts
          // nowhere is worse than an absent one.
          <p className="m-0 mt-4 max-w-[70ch] rounded-[14px] bg-well px-3.5 py-3 text-[15px] text-muted-foreground">
            Closed to new comments.
          </p>
        ) : (
          <Composer slug={slug} />
        )}

        {posts.length === 0 ? null : (
          <ul className="m-0 mt-2 list-none p-0">
            {posts.map((post) => (
              // CV2 — the projection decides. This page used to compare
              // handles here, which quietly un-badged every maintainer without
              // a public profile.
              <Comment key={post.id} post={post} slug={slug} />
            ))}
          </ul>
        )}
      </ConversationLive>

      {/* TS3's door, on the conversation rather than on each comment. One
          report control for the thread is the shape the report queue already
          takes; a control per post would be a queue of one-line reports about
          a conversation nobody can see the shape of. */}
      {launch ? (
        <div className="mt-3 border-t border-line pt-3">
          <ReportControl
            subjectKind="thread"
            subjectRef={launch.thread.id}
            returnTo={`/${slug}#discussion`}
            bare
          />
        </div>
      ) : null}
    </div>
  );
}

function Comment({ post, slug }: { post: PublicPost; slug: string }) {
  const name = post.authorName ?? post.authorHandle ?? "Somebody";
  const avatar =
    "grid h-[36px] w-[36px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[11px] text-copy";
  return (
    <li className="flex gap-3 border-t border-line pb-1 pt-4">
      {/* The avatar goes where the name goes, when the name goes anywhere.
          Hidden from assistive tech and the tab order: the name beside it is
          the same link with words on it. */}
      {post.authorHandle ? (
        <AppLink href={`/@${post.authorHandle}`} aria-hidden="true" tabIndex={-1} className={avatar}>
          {initialsOf(name)}
        </AppLink>
      ) : (
        <span aria-hidden="true" className={avatar}>
          {initialsOf(name)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 leading-[1.3]">
          {/* XP-5 — a name is a link or plain text, never a dead link. */}
          <PersonName name={name} handle={post.authorHandle} className="tap-h text-[15px] font-semibold text-foreground" />
          {post.authorIsMaintainer ? <MaintainerBadge /> : null}
          {/* PP0 — the tag a titled discussion used to carry, on the comment. */}
          {post.tag ? (
            <span className="inline-flex h-[18px] items-center rounded-full bg-secondary px-1.5 font-mono text-[11px] text-copy">
              {THREAD_TAG_LABELS[post.tag]}
            </span>
          ) : null}
          <span className="text-[13px] text-muted-foreground">{day(post.createdAt)}</span>
          {/* A trail whose posts can be rewritten silently is a trail nobody
              can rely on. */}
          {post.editedAt ? <span className="text-[13px] text-muted-foreground">· edited</span> : null}
        </div>
        {/* A removed comment keeps its place and says so — the conversation
            around it still follows (TS-3). */}
        <div className={`mt-1.5 max-w-[70ch] text-[15px] leading-[1.6] text-copy ${post.state === "removed" ? "italic text-muted-foreground" : ""}`}>
          <PostBody nodes={post.body} />
        </div>
        {/* DQ1 — the design's `▲`. NOT on a removed comment: there are no
            words there to agree with, and a control that let somebody upvote
            a tombstone would be a number about nothing. */}
        {post.state === "removed" ? null : (
          <div className="mt-1.5 flex items-center gap-3.5">
            <CommentVote postId={post.id} votes={post.votes} returnTo={`/${slug}`} />
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The box. Progressive enhancement, no client JS, posts to `/comment`.
 *
 * NO TITLE AND NO TAG, which is the difference from CB1's composer below it:
 * this is the design's product-page box, and asking somebody to classify a
 * sentence before they may say it is the friction DQ0b removes.
 */
function Composer({ slug }: { slug: string }) {
  return (
    <form method="post" action="/comment" data-live="post" className={COMPOSER}>
      <input type="hidden" name="slug" value={slug} />
      {/* NO AVATAR, as the design draws it — and the one this used to draw
          was blank anyway (I6): the initials would be the VISITOR's, and this
          document is the same bytes for everybody. */}
      <div className="min-w-0">
        {/* The BOX is an island (`comment-draft.tsx`), and the section around
            it is not. Two things need the browser and nothing else does: the
            draft has to survive the sign-in round trip, and the route's own
            answer — `?commented=invalid`, `?commented=failed` — has to be
            read by something. Both happen after paint in the reader's own
            browser, so the document is still one document with no actor in
            it (I6). */}
        <CommentDraft slug={slug} />
        {/* PP0 — OPTIONAL, and after the box rather than before it: the
            design's rule is that you type and you have said something, so
            classifying comes second and is never required. Radios, so the
            form still posts without JavaScript and "none" is the default. */}
        <fieldset className="m-0 mt-2 flex flex-wrap items-center gap-1.5 border-0 p-0">
          <legend className="sr-only">Tag this comment</legend>
          {THREAD_TAGS.map((tag) => (
            <label
              key={tag}
              className="tap inline-flex h-[26px] cursor-pointer items-center rounded-full border border-border px-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground has-[:checked]:border-border-strong has-[:checked]:bg-secondary has-[:checked]:text-foreground"
            >
              <input type="radio" name="tag" value={tag} className="sr-only" />
              {THREAD_TAG_LABELS[tag]}
            </label>
          ))}
        </fieldset>
        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="submit"
            className="tap inline-flex h-[32px] shrink-0 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Post
          </button>
        </div>
      </div>
    </form>
  );
}

/** The design's composer box: 8px radius on `--border-strong`, `12px 14px`,
 *  and the foreground hairline once anything inside it has focus. */
const COMPOSER =
  "mt-4 rounded-[14px] border border-border bg-card px-3.5 py-3 transition-colors focus-within:border-foreground";

function day(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? ""
    : new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
