"use client";

import { usePathname } from "next/navigation";

import { SEARCH_PATH } from "@openproduct/contracts";

import { AccountChip } from "./account-chip";
import { Logomark } from "./logomark";
import { NotificationBell } from "./notification-bell";
import { HeaderSearch } from "./palette";
import { SearchGlyph } from "./palette-glyph";
import { sectionFor } from "./section-for";
import { SECTIONS, SIGN_IN_PATH } from "./shell";

import { AppLink } from "../ui/link";

/**
 * The header (openproduct-redesign OPR1; boards `Products`, `Feed`,
 * `PhoneFeed`).
 *
 * ONE STICKY FROSTED BAR, ON EVERY PAGE. White at 62% over a blur, with no
 * border and no shadow (design.md §2 rule 11: flat), so the page's dot grid
 * shows through it as it scrolls under. Its content stands in the page's own
 * column — 1180px, 24px gutters — so the mark lines up with the page's edge.
 *
 * FROM `sm` UP, left to right: the mark and the word (home), the three
 * sections as 36px pills with the current one in ink, then — pushed to the
 * right — the search box that opens in place (`palette.tsx`), the Activity
 * bell and the profile control, each a 40px disc.
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
    <header className="sticky top-0 z-40 w-full bg-panel/[0.62] backdrop-blur-[16px] backdrop-saturate-[1.6]">
      <div className="mx-auto box-border flex h-[60px] w-full max-w-[1180px] flex-nowrap items-center gap-x-6 px-6 max-lg:gap-x-4 max-sm:h-[68px] max-sm:gap-x-[10px] max-sm:px-[14px]">
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
          className="flex min-h-[40px] shrink-0 items-center gap-[10px] rounded-[8px] text-foreground no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-lg:min-w-[40px] max-lg:justify-center max-sm:min-h-[44px] max-sm:min-w-[44px]"
        >
          <Logomark size={24} className="max-sm:h-[26px] max-sm:w-[26px]" />
          {/* THE WORD STEPS ASIDE BELOW `lg`. At 768px the word, three pills,
              a 268px search box and two discs do not fit in one row; the
              mark still goes home and the link still says the brand in its
              name. Hanken Grotesk at 18px/600, the board's wordmark. */}
          <span className={`text-[18px] font-semibold leading-none tracking-[-0.02em] ${door ? "" : "max-lg:hidden"}`}>
            openproduct
          </span>
        </AppLink>

        {door ? null : (
          <>
            {/* THE SECTIONS, AS PILLS. 36px tall, 2px apart; the current one is
                an ink pill with the light ink on it. Below `sm` they are the
                bottom tab bar instead, so every one is still reachable on a
                phone (XP4). Both navs are labelled "Main", which is correct
                because only one is ever displayed. */}
            <nav aria-label="Main" className="flex shrink-0 items-center gap-[2px] max-sm:hidden">
              {SECTIONS.map((section) => {
                const current = section.id === activeSection;
                return (
                  <AppLink
                    key={section.id}
                    href={section.href}
                    // QE0 — OFF, with the tab bar's: a prefetch per section on
                    // every page load, for the click that usually never comes.
                    // The hover warm in `AppLink` keeps the switch instant for
                    // the person who reaches for it.
                    prefetch={false}
                    aria-current={current ? "page" : undefined}
                    className={`flex h-[36px] shrink-0 items-center whitespace-nowrap rounded-full px-[14px] text-[15px] no-underline transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      current
                        ? "bg-foreground font-semibold text-background"
                        : "font-medium text-copy hover:bg-foreground/[0.05]"
                    }`}
                  >
                    {section.label}
                  </AppLink>
                );
              })}
            </nav>

            {/* The right-hand group takes the row's slack and packs to the right,
                so the search box, the bell and the profile control sit at the
                column's edge. `min-w-0` lets the search box shrink inside it. */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-[10px]">
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
