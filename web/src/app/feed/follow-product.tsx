"use client";

import * as React from "react";

import { FOLLOWING_LABEL, FOLLOW_LABEL, followKey } from "@openproduct/contracts";

import { FOCUS } from "../ui/design";
import { isFollowing, useOverlay } from "../ui/use-overlay";
import { useToggle } from "../ui/use-toggle";

/**
 * A product card's Follow (openproduct-redesign OPR1; boards `Products`,
 * `PhoneProducts`).
 *
 * THE ACT IS `FollowButton`'S, THE SHAPE IS THE CARD'S. It follows the
 * LISTING (`listing:{slug}`) through the same overlay key, the same toggle
 * and the same `/me/follow` post as every other Follow on the site — nothing
 * about following is decided here. What differs is the drawing: the board's
 * card ends in a 40px pill (44px on a phone) ringed in ink at rest and filled
 * with the sunken tint once followed, with no count beside it, and that is a
 * different control from the four sizes `ui/follow-button.tsx` draws.
 *
 * THE SERVER RENDER IS THE ANONYMOUS ONE (I6): a form that says *Follow*,
 * the same bytes for every visitor. Whether THIS visitor follows the product
 * arrives after paint from the overlay. Signed out, the form still posts and
 * the handler carries the intent through sign-in (XP2, FR3).
 *
 * THE NAME IS IN THE LABEL. A grid holds a Follow per card, and thirty
 * buttons that all say "Follow" tell a screen reader nothing.
 */
export function FollowProduct({ slug, returnTo }: { slug: string; returnTo: string }) {
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
      className="flex shrink-0"
      action={`/me/follow?kind=listing&value=${encodeURIComponent(slug)}&on=${following ? "0" : "1"}&return_to=${encodeURIComponent(target)}`}
    >
      <button
        type="submit"
        disabled={pending}
        aria-pressed={following}
        aria-label={`${following ? "Unfollow" : "Follow"} ${slug}`}
        data-follow-product
        className={`inline-flex h-[40px] items-center rounded-full px-4 text-[13px] font-semibold transition-colors max-sm:h-[44px] max-sm:px-[18px] ${FOCUS} ${
          following
            ? "bg-foreground/[0.06] text-copy"
            : "bg-card text-foreground ring-[1.5px] ring-inset ring-foreground hover:bg-accent"
        }`}
      >
        {following ? FOLLOWING_LABEL : FOLLOW_LABEL}
      </button>
    </form>
  );
}
