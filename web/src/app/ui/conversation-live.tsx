"use client";

// The conversation, live (openproduct-performance OPP14).
//
// ─── WHAT A POST USED TO COST ─────────────────────────────────────────────
//
// A form POST, a 303, and a full reload of a cached document that did not
// have the post in it. One to two seconds of a blank page, and then the
// comment was not there — for up to a minute, sometimes two. Every cache
// between the write and the page was doing its job; none of them can know
// that THIS reader is the author.
//
// ─── WHAT IT COSTS NOW ────────────────────────────────────────────────────
//
// Nothing visible. The same form posts the same fields to the same route,
// but from here, with `accept: application/json`, and the post is on the
// page before the request leaves — drawn from the words in the box, with the
// name `/auth/session` already gave the shell, through the same render
// subset the server will apply. The route's answer settles it (an id) or
// fails it (the reason, said beside the post, with the words back in the
// box). `ui/live-posts.ts` keeps a settled post through every reload and hop
// until the document itself carries its id.
//
// ─── WHAT DID NOT CHANGE, WHICH IS THE POINT ─────────────────────────────
//
// The forms. They still say `method="post"` and `action="/comment"`, still
// bounce a signed-out visitor through sign-in with their draft intact, and
// still work with no JavaScript at all. This is a DELEGATED listener on a
// wrapper — the same progressive enhancement OPP2 gave the four toggles —
// and it takes a submit only from a form marked `data-live="post"`, only
// when the visitor is (or is hinted to be) signed in. A signed-out visitor's
// form posts exactly as before, because an optimistic post from somebody
// who cannot post would be a lie the route then has to undo.
//
// I6 holds: this renders nothing on the server, and the section it wraps is
// the same server component it always was.

import { parseBody } from "@openproduct/contracts";
import { useSyncExternalStore } from "react";
import * as React from "react";
import { createPortal } from "react-dom";

import { SIGNED_IN_CLASS } from "../auth/auth";
import { initialsOf } from "../feed/tile";
import { PersonName } from "./bits";
import {
  addLivePost,
  dropLivePost,
  emptyLivePosts,
  failLivePost,
  livePosts,
  loadLivePosts,
  reconcileLivePosts,
  settleLivePost,
  subscribeLivePosts,
  type LivePost,
} from "./live-posts";
import { PostBody } from "./post-body";
import { useOverlay } from "./use-overlay";
import { subscribeVisitor, unknownVisitor, visitorSnapshot } from "./visitor";

export type LiveVariant = "comment" | "post";

/** What a post that could not be made says. The route's own message when it
 *  gave one; these when it did not. */
export const LIVE_POST_NETWORK_MESSAGE = "It could not reach the server.";
export const LIVE_POST_FAILED_MESSAGE = "The discussion may be closed, or your account may not be eligible yet.";
export const LIVE_POST_FAILED_PREFIX = "That did not post";
export const LIVE_POST_RESTORED_NOTE = "Your words are back in the box.";

/** A form this wrapper takes over. Everything else — the votes, the report
 *  control — keeps its own submit. */
export const LIVE_FORM_ATTRIBUTE = "data-live";
export const LIVE_FORM_VALUE = "post";

function hintedSignedIn(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains(SIGNED_IN_CLASS)
  );
}

async function failureMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } } | null;
    const message = body?.error?.message;
    if (typeof message === "string" && message.length > 0) return message;
  } catch {
    // No body, or not JSON: the generic sentence is the honest one.
  }
  return LIVE_POST_FAILED_MESSAGE;
}

function useVisitor() {
  return useSyncExternalStore(subscribeVisitor, visitorSnapshot, unknownVisitor);
}

export function ConversationLive({
  conversation,
  renderedIds,
  variant,
  draftKey,
  children,
}: {
  /** `conversationKey(...)` — which conversation these forms post into. */
  conversation: string;
  /** The ids the DOCUMENT rendered, so a settled post the page has caught
   *  up with is drawn once, by the page. */
  renderedIds: readonly string[];
  variant: LiveVariant;
  /** The sessionStorage key `comment-draft.tsx` keeps the draft under, so a
   *  post that lands clears it the way the redirect used to. */
  draftKey?: string;
  children: React.ReactNode;
}) {
  const overlay = useOverlay();
  const visitor = useVisitor();
  const all = useSyncExternalStore(subscribeLivePosts, livePosts, emptyLivePosts);
  const [mounted, setMounted] = React.useState(false);

  // The join, not the array, is the dependency (the `use-overlay.ts` rule).
  const idsKey = renderedIds.join(",");
  React.useEffect(() => {
    loadLivePosts();
    reconcileLivePosts(conversation, idsKey.length > 0 ? idsKey.split(",") : []);
    setMounted(true);
  }, [conversation, idsKey]);

  const onSubmit = (event: React.FormEvent<HTMLDivElement>) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.getAttribute(LIVE_FORM_ATTRIBUTE) !== LIVE_FORM_VALUE) return;
    if (event.defaultPrevented) return;
    // Signed in, or hinted so before the overlay has answered. Anyone else
    // posts the form, and bounces through sign-in with the draft kept.
    const signedIn = overlay.status === "ready" || (overlay.status === "pending" && hintedSignedIn());
    if (!signedIn) return;

    const field = form.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
    const body = (field?.value ?? "").trim();
    if (body.length === 0) return;
    event.preventDefault();

    const parentValue = form.querySelector<HTMLInputElement>('input[name="parentPostId"]')?.value ?? "";
    const data = new FormData(form);
    const clientId = addLivePost({
      conversation,
      parentPostId: parentValue.length > 0 ? parentValue : null,
      body,
      authorName: visitor.displayName,
      authorHandle: overlay.status === "ready" ? overlay.overlay.handle : null,
    });
    if (field) field.value = "";
    form.closest("details")?.removeAttribute("open");

    const restore = () => {
      if (field && field.value.trim().length === 0) field.value = body;
    };

    void (async () => {
      try {
        const res = await fetch(form.action, {
          method: "POST",
          body: data,
          headers: { accept: "application/json" },
          credentials: "same-origin",
          cache: "no-store",
        });
        if (res.status === 401) {
          // The hint was stale. The plain form does what it always did.
          dropLivePost(clientId);
          restore();
          form.submit();
          return;
        }
        if (!res.ok) {
          failLivePost(clientId, await failureMessage(res));
          restore();
          return;
        }
        const json = (await res.json().catch(() => null)) as { data?: { postId?: unknown } } | null;
        const id = json?.data?.postId;
        if (typeof id !== "string" || id.length === 0) {
          failLivePost(clientId, LIVE_POST_FAILED_MESSAGE);
          restore();
          return;
        }
        settleLivePost(clientId, id);
        if (draftKey) {
          try {
            window.sessionStorage.removeItem(draftKey);
          } catch {
            // A draft that outlives its post is the smaller failure.
          }
        }
      } catch {
        failLivePost(clientId, LIVE_POST_NETWORK_MESSAGE);
        restore();
      }
    })();
  };

  const mine = mounted ? all.filter((post) => post.conversation === conversation) : [];

  return (
    <div onSubmit={onSubmit}>
      {children}
      {mine.length > 0 ? <LivePosts posts={mine} variant={variant} /> : null}
    </div>
  );
}

function LivePosts({ posts, variant }: { posts: LivePost[]; variant: LiveVariant }) {
  if (variant === "comment") {
    return (
      <ul className="m-0 mt-1 grid list-none gap-1 p-0" data-live-posts="">
        {posts.map((post) => (
          <LivePostItem key={post.clientId} post={post} variant="comment" />
        ))}
      </ul>
    );
  }
  // A reply belongs under the post it answers. The page rendered that post
  // as `<li id="post-…">`, so the reply is drawn INTO it, exactly where the
  // server will draw it once the document catches up; a reply whose parent
  // is not on this page — or a post with no parent — lands at the end.
  const nested: React.ReactNode[] = [];
  const top: LivePost[] = [];
  for (const post of posts) {
    const host = post.parentPostId ? document.getElementById(`post-${post.parentPostId}`) : null;
    if (host) {
      // `react-dom`'s portal type comes from a different copy of the React
      // types than this package pins (the 19 RC alias), so the two disagree
      // about `children`; at runtime it is the same node.
      nested.push(
        createPortal(
          <ol
            key={post.clientId}
            className="m-0 ml-1 mt-3 list-none border-l border-border pl-4 sm:ml-2 sm:pl-5"
            data-live-posts=""
          >
            <LivePostItem post={post} variant="post" />
          </ol>,
          host,
          post.clientId,
        ) as unknown as React.ReactNode,
      );
    } else {
      top.push(post);
    }
  }
  return (
    <>
      {nested}
      {top.length > 0 ? (
        <ol className="m-0 list-none p-0" data-live-posts="">
          {top.map((post) => (
            <LivePostItem key={post.clientId} post={post} variant="post" />
          ))}
        </ol>
      ) : null}
    </>
  );
}

function LivePostItem({ post, variant }: { post: LivePost; variant: LiveVariant }) {
  const name = post.authorName ?? post.authorHandle ?? "You";
  const when =
    post.status === "pending" ? "Posting…" : post.status === "failed" ? "not posted" : "just now";
  const failure =
    post.status === "failed" ? (
      <p role="alert" className="m-0 mt-1.5 text-[13px] leading-[1.45] text-destructive">
        {LIVE_POST_FAILED_PREFIX}: {post.error ?? LIVE_POST_FAILED_MESSAGE} {LIVE_POST_RESTORED_NOTE}
      </p>
    ) : null;
  const body = <PostBody nodes={parseBody(post.body)} />;

  if (variant === "comment") {
    return (
      <li
        aria-busy={post.status === "pending"}
        data-live-post={post.status}
        className={`flex gap-3 rounded-[14px] px-3 py-3.5 transition-opacity ${
          post.status === "pending" ? "opacity-70" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-full bg-secondary font-mono text-[12px] text-copy"
        >
          {initialsOf(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PersonName name={name} handle={post.authorHandle} className="text-[14.5px] font-medium text-foreground" />
            <span className="text-[13px] text-muted-foreground">{when}</span>
          </div>
          <div className="mt-1.5">{body}</div>
          {failure}
        </div>
      </li>
    );
  }
  return (
    <li
      aria-busy={post.status === "pending"}
      data-live-post={post.status}
      className={`mb-3 rounded-[12px] border border-border bg-card px-4 py-3.5 transition-opacity ${
        post.status === "pending" ? "opacity-70" : ""
      }`}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12.5px] text-muted-foreground">
        <PersonName name={name} handle={post.authorHandle} className="text-foreground" />
        <span>{when}</span>
      </div>
      {body}
      {failure}
    </li>
  );
}

/**
 * A count that moves with the visitor's own posts. The document's number is
 * the base; what this browser has posted and the document has not yet
 * caught up with is added on top, so "2 comments" and the three comments
 * under it never disagree.
 */
export function LiveCount({
  base,
  conversation,
  one,
  many,
}: {
  base: number;
  conversation: string;
  one: string;
  many: string;
}) {
  const all = useSyncExternalStore(subscribeLivePosts, livePosts, emptyLivePosts);
  React.useEffect(() => {
    loadLivePosts();
  }, []);
  const extra = all.filter((post) => post.conversation === conversation && post.status !== "failed").length;
  const count = base + extra;
  return (
    <>
      {count} {count === 1 ? one : many}
    </>
  );
}
