"use client";

import * as React from "react";

import { isSaved, useOverlay } from "./use-overlay";
import { useToggle } from "./use-toggle";

/**
 * The save control (openproduct-commons XP2) — a private bookmark, and
 * nothing more.
 *
 * OPC-3 REVERSES OH0 HERE: a save and an endorsement are two objects, not one
 * control with a visibility flag. A save is private — nobody but the visitor
 * ever learns of it, it appears in no count on any public page, and it moves
 * no ranking. The endorsement EN1 brings is its opposite in every one of
 * those respects, and it will be a DIFFERENT control beside this one. The
 * gold token this program reserves for endorsement is deliberately not used
 * here, so the two can never be mistaken for each other at a glance.
 *
 * THE SERVER RENDER IS THE ANONYMOUS ONE. Always — a plain form posting to
 * `/me/save`, identical in every visitor's HTML, which is invariant I6. After
 * hydration the overlay may say the visitor already saved this, and only then
 * does the control change: to `Saved`, posting to the unsave path instead.
 *
 * SIGNED OUT, IT STILL WORKS. The form posts, the route handler finds no
 * session and bounces through sign-in, and the visitor comes back to this
 * page — to this exact control, because the return path carries the `#save`
 * fragment. They arrive where they left off rather than at the top of a page
 * they had scrolled halfway down. Nothing about the signed-out render says
 * "sign in first": the intent is the click, and making someone declare their
 * identity before expressing an intent loses the intent.
 */
export function SaveControl({ slug }: { slug: string }) {
  const state = useOverlay(React.useMemo(() => [slug], [slug]));
  const saved = isSaved(state, slug);
  const { pending, onSubmit } = useToggle("saved", slug, !saved);

  return (
    <form
      onSubmit={onSubmit}
      id="save"
      method="post"
      action={
        saved
          ? `/me/unsave?slug=${encodeURIComponent(slug)}&return_to=${encodeURIComponent(`/${slug}#save`)}`
          : `/me/save?slug=${encodeURIComponent(slug)}`
      }
    >
      <button
        type="submit"
        disabled={pending}
        aria-pressed={saved}
        title={
          saved
            ? "Saved to your list — only you can see this"
            : "Save privately to your own list. Not an upvote: nobody else sees it."
        }
        // FR5 — THE SAME RING AS EVERYTHING BESIDE IT. This button and the
        // upvote box next to it carried no `focus-visible` rule, so they fell
        // back to the browser's default outline while the share trigger two
        // inches away drew the estate's `--ring`: one hero row, three
        // controls, two different answers to "where am I". The default is
        // accessible on its own; being the odd one out is the defect.
        // THE DESIGN'S ICON BUTTON: a 36px square, the bookmark glyph, and
        // NO GOLD in either state (OPC-3) — the saved state fills the glyph
        // and washes the square in `--secondary`, which is the grey the
        // design reserves for a private thing. A fixed square is also what
        // keeps the overlay's flip from moving the row (OPP9/OPP12): the box
        // is the same 36px whether or not this visitor saved it.
        className={
          "tap inline-flex h-[36px] w-[36px] items-center justify-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" +
          (saved
            ? " border-border-strong bg-secondary text-foreground"
            : " border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground")
        }
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="M4 2.5h8v11l-4-3-4 3z" />
        </svg>
        {/* The word is for the accessible name; the glyph is for the eye. */}
        <span className="sr-only">{saved ? "Saved" : "Save"}</span>
      </button>
    </form>
  );
}
