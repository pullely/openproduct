"use client";

import * as React from "react";

import {
  MAX_POST_BODY,
  TALK_BADGE_PRIVATE,
  TALK_CREW_TAG,
  TALK_MARK_RESOLVED,
  TALK_REPLY_PRIVATE,
  TALK_RESOLVED,
  THREAD_LOCKED_NOTE,
  threadAcceptsPosts,
  type PrivateThreadDocument,
} from "@openproduct/contracts";

import { BOARD_PAGE, FOCUS } from "../ui/design";
import { AppLink } from "../ui/link";
import { NotFoundBody } from "../ui/not-found-body";
import { PostBody } from "../ui/post-body";
import { agoOf } from "../ui/time";

import {
  TALK_ACTION,
  TALK_ACTION_DONE,
  TALK_ACTION_INK,
  TALK_ACTION_PLAIN,
  TALK_BADGE,
  TALK_BADGE_PRIVATE_CLASS,
  TALK_CARD,
  TALK_CARD_PRIVATE,
  TALK_CREW_TAG_CLASS,
  TALK_FIELD,
  TALK_REPLIES,
  TALK_REPLY,
  TALK_RESOLVED_MARK,
} from "./classes";
import { CheckGlyph, LockGlyph } from "./glyphs";
import {
  isThreadId,
  privateThreadDataRoute,
  privateThreadReplyRoute,
  talkNotice,
  talkThreadOf,
  threadAuthor,
  threadKindLabel,
  threadMonogram,
  threadResolveRoute,
} from "./model";
import { TalkStarted } from "./started";

type State =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; document: PrivateThreadDocument; now: number };

/**
 * A private thread, for its author and the product's crew (board `Product`
 * Talk tab's private card, opened).
 *
 * THREE STATES, AND ONLY ONE OF THEM KNOWS ANYTHING.
 *
 *   loading  the shell: an empty column the height of a page, so the footer
 *            does not jump when the answer arrives
 *   ready    the thread: who started it, its kind, its words, the replies
 *            with the Crew tag on the crew's, the reply box, and — for the
 *            crew, on an issue — Mark resolved
 *   missing  the site's ordinary not-found (`NotFoundBody`), word for word
 *            what an unknown address shows
 *
 * `missing` is every answer that is not the thread: no session, not the
 * reader's, never existed, a malformed id, an outage. The data route gives
 * them one 404 and this gives them one page.
 */
export function PrivateThreadView({ id }: { id: string }) {
  const [state, setState] = React.useState<State>({ status: "loading" });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const form = React.useRef<HTMLFormElement | null>(null);

  const load = React.useCallback(async () => {
    if (!isThreadId(id)) {
      setState({ status: "missing" });
      return;
    }
    try {
      const res = await fetch(privateThreadDataRoute(id), {
        headers: { accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as { data?: PrivateThreadDocument } | null;
      if (res.ok && body?.data) setState({ status: "ready", document: body.data, now: Date.now() });
      else setState({ status: "missing" });
    } catch {
      setState({ status: "missing" });
    }
  }, [id]);

  React.useEffect(() => {
    void load();
    const url = new URL(window.location.href);
    const answer = url.searchParams.get("talk");
    if (answer) {
      url.searchParams.delete("talk");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      setNotice(talkNotice(answer));
    }
  }, [load]);

  if (state.status === "missing") return <NotFoundBody />;
  if (state.status === "loading") {
    return (
      <main className={`${BOARD_PAGE} min-h-[70vh]`} data-private-thread="loading" aria-busy="true">
        <TalkStarted />
      </main>
    );
  }

  const { document, now } = state;
  const thread = talkThreadOf(document.thread);
  const author = threadAuthor(thread);
  const open = threadAcceptsPosts(document.thread.state);
  const resolved = thread.kind === "issue" && thread.resolvedAt !== null;
  const crewCanResolve = document.crew && thread.kind === "issue";

  const reply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const body = String(data.get("body") ?? "").trim();
    if (body.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(privateThreadReplyRoute(id), {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        form.current?.reset();
        await load();
      } else if (res.status === 404) {
        setState({ status: "missing" });
      } else {
        setNotice(talkNotice(res.status === 422 ? "invalid" : "failed"));
      }
    } catch {
      setNotice(talkNotice("failed"));
    } finally {
      setBusy(false);
    }
  };

  const resolve = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(threadResolveRoute(id), {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ resolved: resolved ? "0" : "1" }),
      });
      if (res.ok) await load();
      else if (res.status === 404) setState({ status: "missing" });
      else setNotice(talkNotice("failed"));
    } catch {
      setNotice(talkNotice("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`${BOARD_PAGE} min-h-[70vh]`} data-private-thread="ready">
      <TalkStarted />
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-[18px] max-sm:gap-2.5">
        <nav aria-label="Breadcrumb" className="flex text-[13px]">
          <AppLink
            href={`/${document.slug}/talk`}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-1 font-medium text-muted-foreground no-underline hover:text-foreground max-sm:min-h-[44px] ${FOCUS}`}
          >
            <span aria-hidden="true">←</span> {document.slug}
          </AppLink>
        </nav>

        <article className={`${TALK_CARD} ${TALK_CARD_PRIVATE}`} data-thread={thread.id} data-visibility="private">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid h-[36px] w-[36px] shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-semibold text-copy"
            >
              {threadMonogram(author)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
              <span className="truncate text-[15px] font-semibold text-foreground">{author}</span>
              <span className="text-[13px] text-muted-foreground">
                {threadKindLabel(thread)} · {agoOf(thread.createdAt, now)}
              </span>
            </span>
            <span className={`${TALK_BADGE} ${TALK_BADGE_PRIVATE_CLASS}`}>
              <LockGlyph size={12} />
              <span className="max-sm:hidden">{TALK_BADGE_PRIVATE}</span>
              <span className="sm:hidden">Private</span>
            </span>
          </div>

          {/* The board's card: the thread's words at the card-title size. */}
          <h1 className="m-0 break-words text-card-title font-normal leading-[1.35] tracking-[-0.01em] text-foreground">
            {thread.title}
          </h1>

          {crewCanResolve || resolved ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {crewCanResolve ? (
                <button
                  type="button"
                  aria-pressed={resolved}
                  onClick={resolve}
                  data-resolve
                  className={`${TALK_ACTION} cursor-pointer border-0 ${resolved ? TALK_ACTION_DONE : TALK_ACTION_PLAIN} ${FOCUS}`}
                >
                  {resolved ? TALK_RESOLVED : TALK_MARK_RESOLVED}
                </button>
              ) : (
                <span data-resolved className={TALK_RESOLVED_MARK}>
                  <CheckGlyph />
                  {TALK_RESOLVED}
                </span>
              )}
            </div>
          ) : null}

          <div className={TALK_REPLIES}>
            {document.posts.map((post) => (
              <div key={post.id} className={TALK_REPLY} data-reply={post.id}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-foreground">
                    {post.authorName ?? post.authorHandle ?? "Somebody"}
                  </span>
                  {post.authorIsMaintainer ? <span className={TALK_CREW_TAG_CLASS}>{TALK_CREW_TAG}</span> : null}
                  <span className="text-[13px] text-muted-foreground">{agoOf(post.createdAt, now)}</span>
                </span>
                <div className={post.state === "removed" ? "italic text-muted-foreground" : ""}>
                  <PostBody nodes={post.body} />
                </div>
              </div>
            ))}

            {notice ? (
              <p role="status" aria-live="polite" className="m-0 px-1 text-[13px] leading-[1.45] text-copy">
                {notice}
              </p>
            ) : null}

            {open ? (
              <form
                ref={form}
                method="post"
                action={privateThreadReplyRoute(id)}
                onSubmit={reply}
                className="group/reply flex flex-wrap items-center gap-2"
              >
                <label className="flex min-w-0 flex-[1_1_240px]">
                  <span className="sr-only">{TALK_REPLY_PRIVATE}</span>
                  <input
                    type="text"
                    name="body"
                    required
                    maxLength={MAX_POST_BODY}
                    autoComplete="off"
                    placeholder={TALK_REPLY_PRIVATE}
                    className={TALK_FIELD}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className={`${TALK_ACTION} cursor-pointer border-0 ${TALK_ACTION_INK} ${FOCUS}`}
                >
                  Reply
                </button>
              </form>
            ) : (
              <p className="m-0 text-[13px] text-muted-foreground">{THREAD_LOCKED_NOTE}</p>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
