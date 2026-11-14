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
 * FOUR SIZES, every one a pill (openproduct-redesign OPR1):
 *
 *   compact  28px, 13px/500        — a rail's rows
 *   card     30px, 13px/500        — a topic card
 *   regular  36px, 14px/500        — a topic page's header
 *   hero     40px, 15px/600        — a header card's action (boards
 *            `Product`, `Person`); 44px and the cell's full width on a phone
 *
 * THREE TONES FOR THE UNFOLLOWED BUTTON, and they are the boards' too:
 *
 *   plain    the card on a hairline — everywhere a Follow is one of many
 *   outline  white under a 1.5px ink ring — a product's header, where
 *            "Try it" is the card's ink button
 *   ink      the ink button — a person's header, where Follow is the card's
 *            one action
 *
 * The hero size and the two header tones were descendant selectors wrapped
 * round this component from outside (`FOLLOW_PILL_*` in `design.ts`), which
 * restyled a button they could not see; they are variants here, so the
 * control's whole look is in the one place that draws it.
 *
 * THE FOLLOWED STATE IS THE QUIET ONE, reading `Following`: the sunken fill
 * on a hairline, and on a header card the soft pill (6% of ink, no ring).
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
  tone = "plain",
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
  /** How the UNFOLLOWED button is drawn; the followed one is always quiet. */
  tone?: "plain" | "outline" | "ink";
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

  const hero = size === "hero";
  const geometry =
    size === "compact"
      ? "h-[28px] px-3 text-[13px] font-medium"
      : size === "card"
        ? "h-[30px] px-3.5 text-[13px] font-medium"
        : hero
          ? "h-[40px] justify-center px-5 text-[15px] font-semibold max-sm:h-[44px] max-sm:w-full"
          : "h-[36px] px-4 text-[14px] font-medium";
  const resting =
    tone === "ink"
      ? "border-primary bg-primary text-primary-foreground hover:opacity-90"
      : tone === "outline"
        ? "border-[1.5px] border-foreground bg-card text-foreground hover:bg-foreground/[0.04]"
        : "border-border-strong bg-card text-foreground hover:border-faint";
  const followed = hero ? "border-transparent bg-foreground/[0.06] text-copy" : "border-border-strong bg-secondary text-foreground";

  return (
    <form
      onSubmit={onSubmit}
      id={`follow-${kind}-${value}`}
      method="post"
      className={`flex shrink-0 items-center gap-2.5 ${hero ? "max-sm:w-full" : ""}`}
      action={`/me/follow?kind=${encodeURIComponent(kind)}&value=${encodeURIComponent(value)}&on=${
        following ? "0" : "1"
      }&return_to=${encodeURIComponent(target)}`}
    >
      <button
        type="submit"
        disabled={pending}
        aria-pressed={following}
        title={FOLLOW_MEANING}
        className={`inline-flex items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${geometry} ${
          following ? followed : resting
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
