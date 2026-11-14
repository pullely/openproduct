"use client";

import * as React from "react";

import { MAX_POST_BODY } from "@openproduct/contracts";

import { POST_COMMENT_NOTICES } from "./post-page";

/**
 * The box a comment or a reply is typed in (openproduct-redesign OPR-3;
 * boards `Post`, `PhonePost`): one pill holding the words and the send
 * button — 40px, 44px on a phone.
 *
 * A FIELD IN A PLAIN FORM. The form around it posts with no JavaScript; this
 * island adds three things in the browser and changes no markup:
 *
 *   ENTER SENDS      as the boards have it; Shift+Enter is a new line.
 *   THE DRAFT STAYS  posting needs a session, and a signed-out reader is
 *                    bounced through sign-in and back. What they typed is
 *                    kept in this tab (`sessionStorage`, never a cookie) and
 *                    put back (the product page's box does the same,
 *                    `[slug]/comment-draft.tsx`).
 *   THE ANSWER SHOWS the route's `?commented=invalid|failed` is read and
 *                    said under the box.
 *
 * A TEXTAREA, though the boards draw one line: `ui/conversation-live.tsx`
 * takes a submit only from a form with a `textarea[name="body"]`, and a
 * comment may be longer than a line. The send button is quiet while the box
 * is empty (`:placeholder-shown`) and ink once it holds something; `required`
 * is what stops an empty post, with or without this island.
 *
 * THE SAME MARKUP FOR EVERY VISITOR (I6): the restore and the notice happen
 * after paint, in the reader's own browser.
 */
export function PostCommentField({
  id,
  label,
  placeholder,
  sendLabel,
  draftKey,
  notices = false,
}: {
  /** The textarea's id, when something links to it (`#comment`). */
  id?: string;
  /** The field's accessible name. */
  label: string;
  placeholder: string;
  sendLabel: string;
  /** Where this tab keeps the draft; none for a reply. */
  draftKey?: string;
  /** Whether this box reads the route's answer from the address. */
  notices?: boolean;
}) {
  const field = React.useRef<HTMLTextAreaElement>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (draftKey && field.current && field.current.value.length === 0) {
      try {
        const kept = window.sessionStorage.getItem(draftKey);
        if (kept) field.current.value = kept;
      } catch {
        // No storage: the box starts empty, which is what it did before.
      }
    }
    if (notices) {
      const said = new URLSearchParams(window.location.search).get("commented");
      setNotice(said ? (POST_COMMENT_NOTICES[said] ?? null) : null);
    }
  }, [draftKey, notices]);

  const keep = (event: React.FormEvent<HTMLTextAreaElement>) => {
    if (!draftKey) return;
    try {
      window.sessionStorage.setItem(draftKey, event.currentTarget.value);
    } catch {
      // A draft that is not kept is the smaller failure.
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <label className="flex min-h-[40px] items-center gap-1.5 rounded-[20px] bg-well pl-4 pr-[3px] focus-within:ring-2 focus-within:ring-ring max-sm:min-h-[44px] max-sm:rounded-[22px] max-sm:pr-0">
        <span className="sr-only">{label}</span>
        <textarea
          ref={field}
          id={id}
          name="body"
          required
          rows={1}
          maxLength={MAX_POST_BODY}
          placeholder={placeholder}
          onInput={keep}
          onKeyDown={onKeyDown}
          className="peer min-w-0 flex-1 resize-none border-0 bg-transparent py-2 text-[16px] leading-[1.5] text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label={sendLabel}
          className="grid h-[34px] w-[34px] shrink-0 cursor-pointer place-items-center self-end rounded-full border-0 bg-primary text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring peer-placeholder-shown:bg-transparent peer-placeholder-shown:text-muted-foreground max-sm:h-[44px] max-sm:w-[44px] sm:mb-[3px]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </label>
      {notice ? (
        <p role="status" className="m-0 px-1 text-[13px] text-destructive">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
