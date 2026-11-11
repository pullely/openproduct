"use client";

import * as React from "react";

import { unreadCount, useOverlay } from "../ui/use-overlay";

import { AppLink } from "../ui/link";

/**
 * The design's bell, with its unread badge (NF0).
 *
 * A 38px square, radius 10, the glyph in `--copy`, hover `--hover`; when the
 * inbox has unread rows, a 16px pill at the top right in the accent, white
 * mono digits, ringed in 2px of card so it sits over the glyph rather than
 * against it. Those are the prototype's numbers.
 *
 * THE SERVER RENDER HAS NO BADGE, for everybody (I6). The count is personal
 * and arrives from the XP2 overlay after paint — the same read the account
 * chip already makes, shared through one store, so this island costs no
 * second request. Until the overlay answers, and whenever it fails, the bell
 * is a bell: `unreadCount` is zero for a pending overlay, and zero renders
 * NOTHING rather than a `0` badge, because a badge saying nothing is waiting
 * would be a claim an unread overlay has not made (OPC-C).
 *
 * A LINK, ALWAYS. Signed out, `/me/notifications` bounces through sign-in and
 * returns; the bell is the same control for every visitor, as the design
 * draws it.
 */
export function NotificationBell() {
  const state = useOverlay(React.useMemo(() => [], []));
  const unread = unreadCount(state);
  return (
    <AppLink
      href="/me/notifications"
      aria-label={unread > 0 ? `Notifications — ${unread} unread` : "Notifications"}
      className="relative grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:h-[44px] max-sm:w-[44px]"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M5 8a5 5 0 0 1 10 0v3l1.6 2.4H3.4L5 11V8Z" />
        <path d="M8 16a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute right-[8px] top-[8px] box-border grid h-[16px] min-w-[16px] place-items-center rounded-full border-2 border-card bg-endorse px-1 font-mono text-[10px] font-medium text-background"
        >
          {unread}
        </span>
      ) : null}
    </AppLink>
  );
}
