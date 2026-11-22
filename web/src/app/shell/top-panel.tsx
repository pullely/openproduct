"use client";

import { usePathname } from "next/navigation";

import { SEARCH_PATH } from "@openproduct/contracts";

import { AccountChip } from "./account-chip";
import { Logomark } from "./logomark";
import { NotificationBell } from "./notification-bell";
import { HeaderSearch } from "./palette";
import { SearchGlyph } from "./palette-glyph";
import { sectionFor } from "./section-for";
import { RailToggle } from "./rail-toggle";
import { SIGN_IN_PATH } from "./shell";

import { AppLink } from "../ui/link";

/**
 * The header (openproduct-redesign OPR1; boards `Products`, `Feed`,
 * `PhoneFeed`).
 *
 * ONE STICKY BAR, ON EVERY PAGE, THAT MELTS INTO THE PAGE (openproduct-ui-
 * fixes UF2, design §2). No fill and no line of its own: a frosted band
 * behind it (`.bar-frost` in globals.css) reaches 10px below and fades out,
 * light at the top of a page and deep once it scrolls. Its content stands in
 * the page's own shell — fluid to 1920px, 24px gutters — so the mark lines up
 * with the page's edge. The bar is set in Geist.
 *
 * FROM `sm` UP it is three columns, 56px tall: the 30px mark and the word
 * (home) on the left; the three sections as plain text in the centre, 36px
 * apart, the current one in ink at medium weight and the others grey; and on
 * the right the search box that opens in place (`palette.tsx`), the Activity
 * bell and the profile control as plain 40px icon buttons.
 *
 * ON A PHONE the sections are the bottom tab bar (`section-bar.tsx`) and
 * Activity is its fourth tab, so this row is three things: the mark, a
 * search field that is a LINK to `/search` (44px; a field that opens a card
 * under itself has nowhere to put it at 390px), and the profile control
 * (44px).
 *
 * ONE ROW, AND IT DOES NOT WRAP (FR1's rule, kept). The board's header
 * wraps; a bar that may wrap gets taller every time something inside it
 * does, and at tablet widths everything inside it does. So nothing wraps
 * and something gives way instead: the search box shrinks from its 268px,
 * and below `lg` the word steps aside and the mark alone goes home.
 *
 * STILL A CLIENT COMPONENT, AND STILL NOT FOR PERSONALISATION — for
 * `usePathname`, which resolves during the server render too, so the lit
 * section is correct in the cached HTML instead of appearing on hydration.
 * The path is not personal, so the output is identical for every visitor
 * (invariant I6); the islands that ARE personal — `AccountChip`,
 * `NotificationBell` — render their anonymous state on the server.
 *
 * AT MOST ONE `aria-current` IN THE BAR: `sectionFor` names one destination
 * or none, and the pills and the bell both ask it.
 *
 * TWO PAGES TAKE LESS OF IT, and both are the boards' own:
 *
 *   `/signin` (boards `SignIn`, `PhoneSignIn`) — the mark and the word, and
 *   nothing else. The page IS the way in, so a profile control that offers
 *   to sign in, a bell with nothing behind it and a search box are three
 *   ways to leave the one thing the visitor came to do. The word stays at
 *   every width here: with nothing beside it, it has the room.
 *
 *   `/search` on a phone (board `PhoneSearch`) — no search link. The page's
 *   own field is the search, directly under this bar; a second pill above
 *   it that links to the page it is on is the same control twice.
 *
 * Both are read from the path, which is the same for every visitor (I6).
 */
export function TopPanel() {
  const pathname = usePathname() ?? "/";
  const activeSection = sectionFor(pathname);
  const path = pathname.split("?")[0] ?? "/";
  const door = path === SIGN_IN_PATH;
  const onSearch = path === SEARCH_PATH;

  return (
    <header className="bar-frost sticky top-0 z-40 w-full font-bar">
      <div className="mx-auto box-border flex h-[56px] w-full max-w-[1920px] flex-nowrap items-center gap-x-6 px-6 max-lg:gap-x-4 max-sm:h-[68px] max-sm:gap-x-[10px] max-sm:px-[14px]">
        {/* LR2 — the menu button: below 960px it opens the rail as a drawer.
            Not on the door, which has no rail. */}
        {door ? null : <RailToggle />}
        <AppLink
          href="/"
          // QE0 — OFF. The home is the heaviest document on the estate, and a
          // visitor on any other page paid for it whether or not they went
          // there. The hover warm in `AppLink` fetches it the moment intent
          // shows.
          prefetch={false}
          aria-label="openproduct — home"
          // The mark's drawn size is the board's (24px; 26px on a phone); the
          // hit area is what grows, to 40px here and 44px on a phone.
          className="flex min-h-[40px] shrink-0 items-center gap-[10px] justify-self-start rounded-[8px] text-foreground no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-lg:min-w-[40px] max-lg:justify-center max-sm:min-h-[44px] max-sm:min-w-[44px]"
        >
          <Logomark size={30} className="max-sm:h-[26px] max-sm:w-[26px]" />
          {/* THE WORD STEPS ASIDE BELOW `lg`. At 768px the word, three pills,
              a 268px search box and two discs do not fit in one row; the
              mark still goes home and the link still says the brand in its
              name. Hanken Grotesk at 18px/600, the board's wordmark. */}
          <span className={`text-[21px] font-semibold leading-none tracking-[-0.035em] ${door ? "" : "max-lg:hidden"}`}>
            openproduct
          </span>
        </AppLink>

        {door ? null : (
          <>
            {/* The right-hand group takes the row's slack and packs to the right,
                so the search box, the bell and the profile control sit at the
                column's edge. `min-w-0` lets the search box shrink inside it. */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {/* A NAMED, EMPTY SLOT (openproduct-redesign OPR-3). A page may
                  draw one small control here, left of the search — today the
                  product page's Manage / Visitor switch, portalled in by the
                  crew's own browser after load (`[slug]/maker/view-switch.tsx`).
                  `contents`, so empty it takes no room and no gap: the bar is
                  the same bytes and the same layout for everybody else. */}
              <div id="page-view-switch" data-header-slot="view-switch" className="contents" />

              {/* The search that opens in place — its own island, so the bar
                  around it stays one static render. Not displayed on a phone. */}
              <HeaderSearch />

              {/* THE PHONE'S SEARCH IS A LINK. The same pill, 44px tall, going
                  to the search page, where the field and its results have the
                  whole screen — and so not drawn ON that page, whose own field
                  sits directly under this bar. */}
              {onSearch ? null : (
                <AppLink
                  href={SEARCH_PATH}
                  aria-label="Search"
                  className="box-border flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-full bg-card px-3 text-[16px] text-muted-foreground no-underline ring-1 ring-inset ring-foreground/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:hidden"
                >
                  <SearchGlyph />
                  Search
                </AppLink>
              )}

              <NotificationBell current={activeSection === "activity"} />
              <AccountChip />
            </div>
          </>
        )}
      </div>
    </header>
  );
}
