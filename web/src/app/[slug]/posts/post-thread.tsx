import { nestPosts, type PublicPost } from "@openproduct/contracts";

import { initialsOf } from "../../feed/tile";
import { PersonName } from "../../ui/bits";
import { CommentVote } from "../../ui/comment-vote";
import { ConversationLive } from "../../ui/conversation-live";
import { FOCUS } from "../../ui/design";
import { ChevronIcon } from "../../ui/icons";
import { conversationKey } from "../../ui/live-posts";
import { MaintainerBadge } from "../../ui/maintainer-badge";
import { PostBody } from "../../ui/post-body";
import { absoluteOf } from "../../ui/time";

import { PostCommentField } from "./post-comment-field";
import {
  POST_COMMENTS_CLOSED,
  POST_COMMENTS_ID,
  POST_COMMENTS_UNREAD,
  POST_COMMENT_ID,
  POST_COMMENT_REMOVED,
  repliesLabel,
  type PostThreadState,
} from "./post-page";

/**
 * The comments under a post (openproduct-redesign OPR-3; boards `Post`,
 * `PhonePost`): each comment a bubble with its replies under it, the vote
 * comments already have, *Reply*, and the box at the bottom.
 *
 * IT IS A THREAD (design §6), read with the thread's own public read and
 * written through the site's own posting path, so every rule already written
 * about a thread applies unchanged: who may post, what a removed comment
 * shows, one level of replies (`nestPosts`).
 *
 * A SERVER COMPONENT THAT READS NO SESSION. The forms are always the forms;
 * the route reads the session and bounces through sign-in when there is
 * none (I6). `ConversationLive` takes a signed-in reader's submit and draws
 * the comment at once; a reply is drawn inside the comment it answers, which
 * is why each comment's column carries `post-<id>`.
 *
 * REPLIES, BY WIDTH. On a desktop they are always open (board `Post`). On a
 * phone they sit behind an `N replies` toggle, the first comment's open
 * (board `PhonePost`). The toggle is a checkbox and a rule — no script — and
 * above the phone width it is not there at all.
 *
 * REPLY IS ON A COMMENT, NOT ON A REPLY: threads nest one level, and a
 * control that opened and then failed at the API would be the rule enforced
 * as an error message instead of as a shape.
 *
 * THE TWO IDS THE CARDS LINK TO are always here: `comments` on the section,
 * `comment` on the box — or, where nobody can comment, on the line that says
 * so.
 */
export function PostThread({
  posts,
  state,
  threadId,
  action,
  returnTo,
  draftKey,
}: {
  posts: readonly PublicPost[];
  state: PostThreadState;
  /** The thread the comments are in; null when the post has none. */
  threadId: string | null;
  /** Where the forms post: the page's own comment route. */
  action: string;
  /** The post's page: where a vote's sign-in returns. */
  returnTo: string;
  draftKey: string;
}) {
  const open = state === "open" || state === "unread";
  const nested = nestPosts(posts);

  const list =
    nested.length > 0 ? (
      <ol className="m-0 flex list-none flex-col gap-4 p-0 max-sm:gap-2" data-post-comments>
        {nested.map(({ post, replies }, index) => (
          <Comment key={post.id} post={post} replies={replies} open={open} action={action} returnTo={returnTo} first={index === 0} />
        ))}
      </ol>
    ) : null;

  const box = open ? (
    <form method="post" action={action} data-live="post" className="order-last flex items-start gap-2.5 pt-1">
      <span aria-hidden="true" className="h-[34px] w-[34px] shrink-0 rounded-full bg-sunken max-sm:hidden" />
      <PostCommentField id={POST_COMMENT_ID} label="Write a comment" placeholder="Write a comment" sendLabel="Post comment" draftKey={draftKey} notices />
    </form>
  ) : (
    <p id={POST_COMMENT_ID} className="order-last m-0 scroll-mt-[80px] text-[13px] text-muted-foreground">
      {POST_COMMENTS_CLOSED}
    </p>
  );

  return (
    <section
      id={POST_COMMENTS_ID}
      aria-label="Comments"
      // The live comments `ConversationLive` appends sit between the list
      // and the box: its wrapper is a column and the box is ordered last.
      className="scroll-mt-[80px] border-t border-line px-[22px] pb-[22px] pt-3.5 max-sm:mx-2 max-sm:px-1.5 max-sm:pb-3.5 max-sm:pt-3 [&>div]:flex [&>div]:flex-col [&>div]:gap-4 max-sm:[&>div]:gap-2"
    >
      {threadId ? (
        <ConversationLive conversation={conversationKey("thread", threadId)} renderedIds={posts.map((post) => post.id)} variant="post" draftKey={draftKey}>
          {state === "unread" ? <p className="m-0 text-[13px] text-muted-foreground">{POST_COMMENTS_UNREAD}</p> : null}
          {list}
          {box}
        </ConversationLive>
      ) : (
        <div>{box}</div>
      )}
    </section>
  );
}

const AVATAR = "grid shrink-0 place-items-center rounded-full bg-sunken font-semibold text-copy";
const QUIET = "text-[13px] font-semibold text-muted-foreground";

function Bubble({ post, reply }: { post: PublicPost; reply: boolean }) {
  const name = post.authorName ?? post.authorHandle ?? "Somebody";
  return (
    <div className={`box-border max-w-full self-start rounded-[16px] bg-sunken px-3 max-sm:rounded-[14px] ${reply ? "py-[7px]" : "py-2"}`}>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        {/* XP-5 — a name is a link or plain text, never a dead link. */}
        <PersonName name={name} handle={post.authorHandle} className="text-[13px] font-semibold text-foreground" />
        {post.authorIsMaintainer ? <MaintainerBadge /> : null}
        {post.editedAt ? <span className="text-[13px] text-muted-foreground">edited</span> : null}
      </div>
      {/* A removed comment keeps its place and says so: the replies around
          it still follow. */}
      {post.state === "removed" ? (
        <p className="m-0 text-[13px] italic text-muted-foreground">{POST_COMMENT_REMOVED}</p>
      ) : (
        <div className={`text-copy ${reply ? "text-[13px]" : "text-[15px]"}`}>
          <PostBody nodes={post.body} />
        </div>
      )}
    </div>
  );
}

function Comment({
  post,
  replies,
  open,
  action,
  returnTo,
  first,
}: {
  post: PublicPost;
  replies: readonly PublicPost[];
  open: boolean;
  action: string;
  returnTo: string;
  /** The first comment's replies start open on a phone. */
  first: boolean;
}) {
  const name = post.authorName ?? post.authorHandle ?? "Somebody";
  return (
    <li className="flex gap-2.5 max-sm:gap-2" data-post-comment>
      <span aria-hidden="true" className={`${AVATAR} h-[34px] w-[34px] text-[13px] max-sm:h-8 max-sm:w-8`}>
        {initialsOf(name)}
      </span>
      <div id={`post-${post.id}`} className="group/comment flex min-w-0 flex-1 scroll-mt-[80px] flex-col gap-1">
        <Bubble post={post} reply={false} />
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pl-3 text-[13px]">
          {post.state === "removed" ? null : <CommentVote postId={post.id} votes={post.votes} returnTo={returnTo} />}
          <time dateTime={post.createdAt} className="text-muted-foreground">
            {absoluteOf(post.createdAt)}
          </time>
          {replies.length > 0 ? (
            <label className={`ml-auto hidden min-h-[44px] cursor-pointer items-center gap-1 text-[13px] font-semibold text-copy has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring max-sm:flex`}>
              <input type="checkbox" defaultChecked={first} className="sr-only" data-replies-toggle />
              {repliesLabel(replies.length)}
              <ChevronIcon className="h-[13px] w-[13px] group-has-[:checked]/comment:rotate-180" />
            </label>
          ) : null}
          {open && post.state !== "removed" ? (
            <details className="min-w-0 open:basis-full">
              <summary className={`flex min-h-[32px] cursor-pointer list-none items-center ${QUIET} hover:text-foreground max-sm:min-h-[44px] [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                Reply
              </summary>
              <form method="post" action={action} data-live="post" className="flex items-start gap-2 pb-1 pt-1">
                <input type="hidden" name="parentPostId" value={post.id} />
                <PostCommentField label="Write a reply" placeholder={`Reply to ${name}`} sendLabel="Send reply" />
              </form>
            </details>
          ) : null}
        </div>
        {replies.length > 0 ? (
          <ol className="m-0 flex list-none flex-col gap-2.5 p-0 pt-1.5 max-sm:hidden max-sm:gap-1 max-sm:group-has-[:checked]/comment:flex" data-post-replies>
            {replies.map((reply) => {
              const replier = reply.authorName ?? reply.authorHandle ?? "Somebody";
              return (
                <li key={reply.id} id={`post-${reply.id}`} className="flex scroll-mt-[80px] gap-2">
                  <span aria-hidden="true" className={`${AVATAR} h-[26px] w-[26px] text-[11px]`}>
                    {initialsOf(replier)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Bubble post={reply} reply />
                    <div className="flex flex-wrap items-center gap-x-3.5 pl-3 text-[13px]">
                      {reply.state === "removed" ? null : <CommentVote postId={reply.id} votes={reply.votes} returnTo={returnTo} />}
                      <time dateTime={reply.createdAt} className="text-muted-foreground">
                        {absoluteOf(reply.createdAt)}
                      </time>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </li>
  );
}
