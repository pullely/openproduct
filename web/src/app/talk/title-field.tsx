"use client";

import * as React from "react";

import { MAX_THREAD_TITLE, TALK_COMPOSER_LABEL } from "@openproduct/contracts";

import { TALK_FIELD } from "./classes";
import { TALK_FIELD_TITLE, talkNotice } from "./model";

/**
 * The composer's one field, and what makes the sign-in round trip
 * survivable: what was typed is still there on the way back.
 *
 * THE DRAFT STAYS IN THIS TAB (`sessionStorage`), the way the comment box's
 * does. It is never put in an address — a private thread's words in a query
 * string would be in a history, a log and a referrer — and never sent
 * anywhere until the form is posted.
 *
 * THE MARKUP IS THE SAME FOR EVERY VISITOR: the restore, and the sentence
 * for a refused post (`?talk=…`), happen after paint in the reader's own
 * browser, so the page stays one cached document (I6).
 */
export function TalkTitleField({ slug }: { slug: string }) {
  const key = `op.draft.thread.${slug}`;
  const field = React.useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    const answer = url.searchParams.get("talk");
    if (answer) {
      url.searchParams.delete("talk");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      setNotice(talkNotice(answer));
    }
    try {
      const saved = window.sessionStorage.getItem(key);
      if (saved && field.current && field.current.value === "") field.current.value = saved;
    } catch {
      // No storage: no draft, and the field is simply empty.
    }
  }, [key]);

  const remember = (value: string) => {
    try {
      if (value.trim() === "") window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, value);
    } catch {
      // Nothing to do: they can still post.
    }
  };

  return (
    <>
      {notice ? (
        <p role="status" aria-live="polite" className="m-0 px-1 text-[13px] leading-[1.45] text-copy">
          {notice}
        </p>
      ) : null}
      <label className="flex">
        <span className="sr-only">{TALK_COMPOSER_LABEL}</span>
        <input
          ref={field}
          type="text"
          name={TALK_FIELD_TITLE}
          required
          maxLength={MAX_THREAD_TITLE}
          autoComplete="off"
          placeholder={TALK_COMPOSER_LABEL}
          onChange={(event) => remember(event.target.value)}
          className={TALK_FIELD}
        />
      </label>
    </>
  );
}
