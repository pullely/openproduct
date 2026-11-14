"use client";

import * as React from "react";

import { FOLLOWING_LABEL, FOLLOW_LABEL, followKey } from "@openproduct/contracts";

import { FOCUS } from "../ui/design";
import { isFollowing, useOverlay } from "../ui/use-overlay";
import { useToggle } from "../ui/use-toggle";

/**
 * Follow, on a product's search row (openproduct-redesign OPR1, board
 * `Search`).
 *
 * IT FOLLOWS THE PRODUCT (design.md §2 rule 3): the same `listing` follow
 * the product page's own button writes, through the same route, overlay key
 * and optimistic toggle (`ui/follow-button.tsx` — the hooks are shared, the
 * skin is this board's). A person is followed only from their profile, so a
 * person row carries no such control.
 *
 * THE BOARD'S PILL: 40px (44px on a phone), ink under #FAF9F5 at rest, the
 * 6% ink wash once followed. No count beside it — the search read carries
 * none, and the row has no room for one.
 *
 * THE SERVER RENDER IS THE ANONYMOUS ONE (I6): a plain form that says
 * `Follow`, the same bytes for every visitor. The overlay may say this
 * visitor already follows the product, and only then does the label change.
 * Signed out, the form posts and the handler bounces through sign-in and
 * back to this row.
 */
export function ProductFollow({
  slug,
  name,
  returnTo,
}: {
  slug: string;
  /** The product's name, for the control's accessible name. */
  name: string;
  /** Where sign-in returns to: this results page, query and all. */
  returnTo: string;
}) {
  const key = followKey({ kind: "listing", value: slug });
  const state = useOverlay(
    React.useMemo(() => [], []),
    React.useMemo(() => [key], [key]),
  );
  const following = isFollowing(state, key);
  const { pending, onSubmit } = useToggle("follows", key, !following);
  const target = `${returnTo}#follow-listing-${slug}`;

  return (
    <form
      onSubmit={onSubmit}
      id={`follow-listing-${slug}`}
      method="post"
      // Above the row's stretched link, so the press is the button's.
      className="relative z-[1] flex shrink-0"
      action={`/me/follow?kind=listing&value=${encodeURIComponent(slug)}&on=${
        following ? "0" : "1"
      }&return_to=${encodeURIComponent(target)}`}
    >
      <button
        type="submit"
        disabled={pending}
        aria-pressed={following}
        aria-label={`${following ? "Unfollow" : "Follow"} ${name}`}
        className={`inline-flex min-h-[40px] items-center rounded-full border-0 px-4 text-[13px] font-semibold transition-opacity max-sm:min-h-[44px] ${FOCUS} ${
          following
            ? "bg-foreground/[0.06] text-copy"
            : "bg-primary text-primary-foreground hover:opacity-90"
        }`}
      >
        {following ? FOLLOWING_LABEL : FOLLOW_LABEL}
      </button>
    </form>
  );
}
