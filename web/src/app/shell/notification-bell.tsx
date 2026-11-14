"use client";

import * as React from "react";

import { unreadCount, useOverlay } from "../ui/use-overlay";

import { ACTIVITY_PATH } from "./shell";

import { ActivityIcon } from "../ui/icons";
import { AppLink } from "../ui/link";

/**
 * The Activity bell (first drawn at NF0; the board's shape since
 * openproduct-redesign OPR1).
 *
 * A 40px white disc in the header, the bell in `--muted`, linking to
 * `/activity`. When the inbox has unread rows it wears an amber DOT at its
 * top right — a dot and not the old numbered pill: the board draws no count
 * in the chrome, and the number is one click away on the page that lists
 * what it counts. The count is still said aloud, in the control's name.
 *
 * THE SERVER RENDER HAS NO DOT, for everybody (I6). Whether anything is
 * unread is personal and arrives from the XP2 overlay after paint — the same
 * read the account chip already makes, shared through one store, so this
 * island costs no second request. Until the overlay answers, and whenever it
 * fails, the bell is a bell: `unreadCount` is zero for a pending overlay, and
 * zero renders NOTHING, because a mark saying something is waiting would be a
 * claim an unread overlay has not made (OPC-C).
 *
 * A LINK, ALWAYS. Signed out, `/activity` bounces through sign-in and
 * returns; the bell is the same control for every visitor, as the board
 * draws it.
 *
 * NOT ON A PHONE (`max-sm:hidden`): there Activity is the fourth tab of the
 * bottom bar (`section-bar.tsx`), which wears the same dot from the same
 * read, and the top bar keeps its width for the search field.
 */
export function NotificationBell({ current = false }: { readonly current?: boolean }) {
  const unread = useUnread();
  return (
    <AppLink
      href={ACTIVITY_PATH}
      aria-label={unread > 0 ? `Activity — ${unread} unread` : "Activity"}
      aria-current={current ? "page" : undefined}
      className={`relative grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-sm:hidden ${
        current ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      <ActivityIcon className="h-[18px] w-[18px]" />
      {unread > 0 ? <UnreadDot className="right-[9px] top-[9px]" /> : null}
    </AppLink>
  );
}

/**
 * How many inbox rows are unread, from the shared overlay read.
 *
 * One hook for the two places the chrome marks unread activity (the bell and
 * the phone's Activity tab), so they cannot disagree. Zero until the overlay
 * answers, and for a signed-out visitor.
 */
export function useUnread(): number {
  return unreadCount(useOverlay(React.useMemo(() => [], [])));
}

/**
 * The unread mark: an 8px amber dot, ringed in 2px of the surface it sits on
 * so it reads over the glyph rather than against it. Decorative — the
 * control that wears it says the count in its name.
 */
export function UnreadDot({ className = "" }: { readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-unread-dot
      className={`absolute box-content h-[8px] w-[8px] rounded-full border-2 border-card bg-endorse ${className}`}
    />
  );
}
