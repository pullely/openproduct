"use client";

import * as React from "react";

import {
  FOLLOWING_LABEL,
  FOLLOWER_COUNT_TITLE,
  FOLLOW_LABEL,
  FOLLOW_MEANING,
  followKey,
  followerLine,
  type FollowKind,
} from "@openproduct/contracts";

import { isFollowing, useOverlay } from "./use-overlay";
import { useToggle } from "./use-toggle";

/**
 * The Follow control (openproduct-launch FL0), at the design's measurements.
 *
 * ONE CONTROL FOR BOTH KINDS. A topic page and a maker page draw the same
 * button because they mean the same act — the contract's own argument for one
 * table, one route and one overlay key, carried through to the surface.
 *
 * FOUR SIZES, ALL THE DESIGN'S OWN:
 *
 *   compact  26px tall, radius 7, 12.5px  — the sidebar's rows
 *   card     30px tall, radius 8, 13px    — a topic card
 *   regular  38px tall, radius 10, 14px   — a topic page's header
 *   hero     40px tall, radius 11, 14.5px — a maker's profile header
 *
 * THE FOLLOWED STATE IS THE ACCENT'S SOFT WASH — `--accent-soft` inside
 * `--accent-line` in `--accent-ink`, reading `Following` — exactly as the
 * prototype's `followBtn` draws it. At rest it is the card on a hairline.
 *
 * THE SERVER RENDER IS THE ANONYMOUS ONE (I6). A plain form that says `Follow`
 * with the public count beside it, byte-identical in every visitor's HTML.
 * After hydration the overlay may say this visitor already follows it, and only
 * then does the label change. Signed out, the form still posts: the handler
 * bounces through sign-in and returns by fragment, so the intent survives the
 * round trip (XP2).
 *
 * THE COUNT IS PUBLIC, THE STATE IS NOT — and that gap is the whole privacy
 * model in one component. The sidebar hides even the count (`countHidden`):
 * a follower number beside a suggested person is a ratchet — the followed
 * get more followed — rather than a measurement anybody asked for.
 * `followers` comes from the page's cached document and is the same number
 * for everybody; whether YOU follow it arrives after paint and is never in
 * anybody else's HTML. Nobody, including the followed, can turn the count
 * back into a list.
 */
export function FollowButton({
  kind,
  value,
  followers,
  returnTo,
  size = "regular",
  countHidden = false,
}: {
  kind: FollowKind;
  value: string;
  /** The public count. Rendered at zero: something observes a follow now, so
   *  a zero has been counted and found empty (OPC-C). */
  followers: number;
  /** Where sign-in returns to — the page the button is on. */
  returnTo: string;
  size?: "compact" | "card" | "regular" | "hero";
  /** The sidebar's rows draw the button alone; the count is on the page. */
  countHidden?: boolean;
}) {
  const key = followKey({ kind, value });
  const state = useOverlay(
    React.useMemo(() => [], []),
    React.useMemo(() => [key], [key]),
  );
  const following = isFollowing(state, key);
  const { delta, pending, onSubmit } = useToggle("follows", key, !following);
  const target = `${returnTo}#follow-${kind}-${value}`;

  // THE DESIGN'S FOUR SIZES: 28px at a 6px radius in a rail row, 30px in
  // a card, 36px at 8px beside a title — the hero and the regular button
  // are the same 36px button.
  const geometry =
    size === "compact"
      ? "h-[28px] rounded-full px-3 text-[13px]"
      : size === "card"
        ? "h-[30px] rounded-full px-3.5 text-[13px]"
        : "h-[36px] rounded-full px-4 text-[14px]";

  return (
    <form
      onSubmit={onSubmit}
      id={`follow-${kind}-${value}`}
      method="post"
      className="flex shrink-0 items-center gap-2.5"
      action={`/me/follow?kind=${encodeURIComponent(kind)}&value=${encodeURIComponent(value)}&on=${
        following ? "0" : "1"
      }&return_to=${encodeURIComponent(target)}`}
    >
      <button
        type="submit"
        disabled={pending}
        aria-pressed={following}
        title={FOLLOW_MEANING}
        className={`inline-flex items-center border font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${geometry} ${
          following
            ? "border-border-strong bg-secondary text-foreground"
            : "border-border-strong bg-card text-foreground hover:border-faint"
        }`}
      >
        {following ? FOLLOWING_LABEL : FOLLOW_LABEL}
      </button>
      {/* The count sits OUTSIDE the button, and that is not only layout: the
          button's label changes with the visitor and the number does not, so
          putting the number inside would make a public figure look like part
          of a personal state. */}
      {countHidden ? null : (
        <span
          className="whitespace-nowrap text-[13.5px] text-muted-foreground"
          title={FOLLOWER_COUNT_TITLE}
        >
          {followerLine(followers + delta)}
        </span>
      )}
    </form>
  );
}
