"use client";

import { usePathname } from "next/navigation";

import { UnreadDot, useUnread } from "./notification-bell";
import { SectionGlyph } from "./section-glyph";
import { PHONE_TABS } from "./shell";
import { sectionFor } from "./section-for";

import { AppLink } from "../ui/link";

/**
 * The phone's tab bar (first built at openproduct-worldclass FR1; the board's
 * shape since openproduct-redesign OPR1, board `PhoneFeed`).
 *
 * ─── WHAT IT IS ───────────────────────────────────────────────────────────
 *
 * Four tabs fixed to the bottom of a phone: Feed, Products, Seats, Activity.
 * A white bar with 16px corners, inset 10px from the screen's edges and 14px
 * from its bottom (plus the home indicator's inset), on the page's own
 * colour — flat, no hairline and no shadow. Each tab is at least 54px tall:
 * a 22px glyph over an 11px word, the current one in ink at weight 600 and
 * the rest in `--muted`.
 *
 * ─── WHY IT EXISTS (FR1's finding, which still holds) ─────────────────────
 *
 * At 375px a header that carries the sections either wraps into three rows
 * or scrolls a destination off the right edge with nothing saying so. The
 * sections therefore live at the bottom on a phone, where every one of them
 * is in reach of a thumb, and the top bar is a mark, a search field and the
 * profile control.
 *
 * ─── ONE LIST ─────────────────────────────────────────────────────────────
 *
 * The tabs are `PHONE_TABS`, which `shell.ts` derives from the same
 * `SECTIONS` the header's pills render, so the two navs cannot disagree
 * about what the sections are. The fourth tab is Activity: the header's bell
 * has no room in a phone's top bar, so it is a tab here, wearing the same
 * unread dot from the same overlay read.
 *
 * ─── NOTHING PERSONAL IN THE SERVER RENDER (I6) ───────────────────────────
 *
 * A client component for `usePathname` (which resolves during the server
 * render, so the lit tab is in the cached HTML) and for the unread dot, which
 * is absent until the signed-in overlay answers after paint.
 */
export function SectionBar() {
  const pathname = usePathname() ?? "/";
  const active = sectionFor(pathname);
  const unread = useUnread();
  return (
    <nav
      aria-label="Main"
      // `sm:hidden` — this is the phone's nav and the header's pills are
      // everywhere else's. Both carry the same label, which is correct
      // because only one is ever displayed.
      //
      // The bottom offset adds the home indicator's inset OUTSIDE the bar, so
      // a phone with one gets the same 54px tabs lifted clear of it. The
      // page's reserve for this bar is `--tabbar-reserve` in globals.css.
      className="fixed inset-x-[10px] bottom-[calc(14px+env(safe-area-inset-bottom))] z-40 rounded-[16px] bg-card px-[6px] py-[4px] sm:hidden"
    >
      <ul className="m-0 grid list-none grid-cols-4 p-0">
        {PHONE_TABS.map((tab) => {
          const current = tab.id === active;
          const marked = tab.id === "activity" && unread > 0;
          return (
            <li key={tab.id} className="min-w-0">
              <AppLink
                href={tab.href}
                // QE0 — OFF, and the measurement is why. Viewport prefetch on
                // this bar cost four RSC documents on every phone page load
                // for a tap that usually never comes. `AppLink` still warms
                // the destination on `touchstart`, which lands before the tap
                // completes.
                prefetch={false}
                aria-current={current ? "page" : undefined}
                aria-label={marked ? `${tab.label} — ${unread} unread` : undefined}
                className={`flex min-h-[54px] flex-col items-center justify-center gap-[2px] rounded-[12px] text-center text-label leading-tight no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                  current ? "font-semibold text-foreground" : "font-normal text-muted-foreground"
                }`}
              >
                <span className="relative inline-flex">
                  <SectionGlyph icon={tab.icon} className="h-[22px] w-[22px] shrink-0" />
                  {marked ? <UnreadDot className="-right-[3px] -top-[2px]" /> : null}
                </span>
                {tab.label}
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
