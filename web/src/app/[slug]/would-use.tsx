"use client";

import * as React from "react";

import { ENDORSEMENT_MEANING } from "@openproduct/contracts";

import { FOCUS } from "../ui/design";
import { isEndorsed, useOverlay } from "../ui/use-overlay";
import { useToggle } from "../ui/use-toggle";

/** What the upvote is called on an idea (board `ProductIdea`). */
export const WOULD_USE_LABEL = "I’d use this";

/**
 * "I'd use this" (boards `ProductIdea`, `PhoneProductIdea`): the product
 * upvote, on an idea.
 *
 * THE SAME ACT AS THE UPVOTE, RELABELLED — the same two routes
 * (`/me/endorse`, `/me/unendorse`), the same overlay field, the same public
 * count. An idea has nothing to try, so what a reader can say about it is
 * that they would use it; a second table for that would be a second number
 * about the same thing.
 *
 * The count is shown ONLY ABOVE ZERO (design §2: a count is a claim, and
 * "0" beside a new idea is the wrong one). The server render is the unpressed
 * pill for everybody; whether THIS visitor pressed it arrives with the
 * overlay.
 */
export function WouldUseButton({
  slug,
  count,
  returnTo,
}: {
  slug: string;
  /** The public count, or null when it was not measured. */
  count: number | null;
  returnTo: string;
}) {
  const state = useOverlay(React.useMemo(() => [slug], [slug]));
  const pressed = isEndorsed(state, slug);
  const { delta, pending, onSubmit } = useToggle("endorsed", slug, !pressed);
  const target = `${returnTo}#vote-${slug}`;
  const shown = (count ?? 0) + delta;

  return (
    <form
      onSubmit={onSubmit}
      id={`vote-${slug}`}
      method="post"
      className="grid shrink-0"
      action={
        pressed
          ? `/me/unendorse?slug=${encodeURIComponent(slug)}&return_to=${encodeURIComponent(target)}`
          : `/me/endorse?slug=${encodeURIComponent(slug)}&return_to=${encodeURIComponent(target)}`
      }
    >
      <button
        type="submit"
        disabled={pending}
        aria-pressed={pressed}
        title={ENDORSEMENT_MEANING}
        className={`inline-flex h-[40px] shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-0 px-[18px] text-[15px] font-semibold transition-colors max-sm:h-[44px] ${FOCUS} ${
          pressed ? "bg-idea text-card" : "bg-idea-deep/[0.08] text-idea-deep hover:bg-idea-deep/[0.12]"
        }`}
      >
        {WOULD_USE_LABEL}
        {shown > 0 ? <span className="tabular-nums">· {shown}</span> : null}
      </button>
    </form>
  );
}
