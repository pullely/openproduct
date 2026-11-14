"use client";

import * as React from "react";

import { MAX_POST_BODY } from "@openproduct/contracts";

/**
 * The comment box, and the one thing that makes the sign-in round trip
 * survivable: what you typed is still there when you come back.
 *
 * ─── THE BUG ─────────────────────────────────────────────────────────────
 *
 * Posting needs a session, and the section cannot know whether there is one
 * (I6) — so `POST /comment` reads it, and a signed-out visitor is bounced
 * through the door and returned to `#discussion`. They arrived back at an
 * EMPTY box, having written a comment and pressed a button that, from where
 * they stood, deleted it. `/submit` solved exactly this in the same app and
 * in the same way: stash the draft beside the flow, re-hydrate on the way
 * back, and say in the doc that nothing typed is lost to the round trip.
 *
 * ─── WHY sessionStorage, AND WHY THIS IS STILL ONE DOCUMENT ──────────────
 *
 * The draft is this tab's, never a cookie and never a server's: an unposted
 * comment is not something openproduct should hold, and a cookie would be
 * sent on every request to a cached page. The markup this island renders is
 * the same for every visitor — the restore happens after paint, in the
 * reader's own browser — so the page stays one cacheable document with no
 * actor in it (I6, OPC-1), exactly as it was when the textarea was inert.
 *
 * ─── AND THE ANSWER FROM THE ROUTE IS FINALLY READ ───────────────────────
 *
 * `/comment` has always redirected back with `?commented=invalid` (empty or
 * over the limit) or `?commented=failed` (locked, or CB-2 ineligible), and
 * NOTHING rendered either one: a refused comment looked exactly like a
 * successful one, minus the comment. The same island reads the parameter,
 * because it is already the thing on this page that reads the URL.
 */
const NOTICES: Record<string, string> = {
  invalid: "That comment was empty or too long to post. It is still in the box.",
  failed: "That comment did not post. The discussion may be closed, or your account may not be eligible yet.",
};

export function CommentDraft({ slug }: { slug: string }) {
  const key = `op.draft.comment.${slug}`;
  const field = React.useRef<HTMLTextAreaElement | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const answer = url.searchParams.get("commented");
    // Strip the marker either way: a reload or a shared link must not
    // resurrect an answer to something that already happened.
    if (answer) {
      url.searchParams.delete("commented");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    if (answer === "ok") {
      // It is on the page now. Holding the draft would re-fill the box with
      // the comment somebody just posted.
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        // A browser with storage denied simply never had a draft to clear.
      }
      return;
    }
    setNotice(answer ? (NOTICES[answer] ?? null) : null);
    try {
      const saved = window.sessionStorage.getItem(key);
      if (saved && field.current && field.current.value === "") field.current.value = saved;
    } catch {
      // Same: no storage, no draft, and the box is simply empty.
    }
  }, [key]);

  const remember = (value: string) => {
    try {
      if (value.trim() === "") window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, value);
    } catch {
      // Nothing to do and nothing worth telling anybody: they can still post.
    }
  };

  return (
    <>
      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className="m-0 mb-2 text-[13px] leading-[1.45] text-copy"
        >
          {notice}
        </p>
      ) : null}
      <label>
        <span className="sr-only">Add a comment</span>
        <textarea
          ref={field}
          name="body"
          required
          rows={3}
          maxLength={MAX_POST_BODY}
          onChange={(event) => remember(event.target.value)}
          placeholder="Ask the makers something"
          className="box-border block w-full resize-y border-0 bg-transparent p-0 text-[15px] leading-[1.55] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
    </>
  );
}
