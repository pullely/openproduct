"use client";

import { usePathname } from "next/navigation";

import { AccountChip } from "./account-chip";
import { Logomark } from "./logomark";
import { NotificationBell } from "./notification-bell";
import { CommandPalette } from "./palette";
import { sectionFor } from "./section-for";
import { SECTIONS } from "./shell";

import { PlusIcon } from "../ui/icons";
import { AppLink } from "../ui/link";

/**
 * The top bar (openproduct-calm CL1, CL-R1; first drawn at openproduct-launch
 * OL1).
 *
 * IT SPANS THE WINDOW. The bar used to sit inside the same 1180px column as
 * the page, which tucked the wordmark in from the corner and made the bar
 * read as part of the content. CL1 takes it out of the column: the mark
 * (32px) and the wordmark (Newsreader 28px, regular, -0.03em) sit in the
 * left corner at the page gutter, the sections follow as WORDS with a 2px
 * underline under the current one (no pill, no glyph: the glyphs live in the
 * phone's bottom bar, where there are no words), and the search field, the
 * bell, *Open a build* and the account chip sit at the right, all round.
 *
 * IT SCROLLS AWAY FROM `sm` UP. A list's sort tabs are the one strip that
 * stays in reach (CL-R6); a sticky bar on top of them was 132px of chrome
 * before the first build. On a phone the bar stays FR1's sticky 56px row,
 * because there the bottom bar and this row are the whole navigation.
 *
 * WHAT DID NOT CHANGE. Still a client component, and still not for
 * personalisation — for `usePathname`, which resolves during the server
 * render too, so the lit section is correct in the cached HTML instead of
 * appearing on hydration. The path is not personal, so the output is still
 * identical for every visitor (invariant I6); the islands that *are*
 * personal — `AccountChip`, `NotificationBell` — render their anonymous
 * state on the server exactly as before.
 *
 * THE PLANNED SECTIONS ARE RENDERED, NOT OMITTED — the convention this shell
 * has kept since XP0. A destination that does not exist yet renders muted and
 * inert with an accessible description naming the milestone that will fill
 * it.
 */
export function TopPanel() {
  const pathname = usePathname() ?? "/";
  const activeSection = sectionFor(pathname);

  return (
    // FR1 — on a phone the height is on the HEADER with `box-border`, so the
    // hairline is inside the 56px rather than a fifty-seventh pixel on top of
    // it; there the bar is sticky glass, as it always was. From `sm` up it is
    // the page's own ground and scrolls with the page (CL1).
    <header className="relative z-40 border-b border-line bg-background max-sm:sticky max-sm:top-0 max-sm:box-border max-sm:h-[56px] max-sm:border-border max-sm:bg-card/[0.92] max-sm:backdrop-blur-[10px]">
      {/* EIGHTY PIXELS, ONE ROW, AND IT DOES NOT MOVE (FR1's rule, CL1's
          height). Nothing inside may wrap: anything that changes width — the
          account control resolving from `Sign in` to an avatar, the bell
          gaining a badge — lands in the search field's slack, never in a
          second row. Below `sm` the sections leave for `section-bar.tsx` and
          the row is the 56px header's full height. FULL WIDTH (CL-R1): the
          gutter is the page's, so the mark lines up with the page's edge
          rather than a column's. */}
      <div className="mx-auto box-border flex h-[80px] w-full flex-nowrap items-center gap-x-10 px-[44px] max-xl:gap-x-7 max-lg:px-7 max-sm:h-full max-sm:gap-x-2 max-sm:px-4">
        <AppLink
          href="/"
          // QE0 — OFF. OPP13 prefetched the wordmark's destination on sight;
          // the home is the heaviest document on the estate, and a visitor on
          // any other page paid for it whether or not they went there. The
          // hover warm in `AppLink` fetches it the moment intent shows.
          prefetch={false}
          aria-label="openproduct — home"
          // Height only, below `sm`: the mark's drawn size is unchanged, the
          // hit area grows to meet the 44px tap minimum (OL9's walk).
          className="flex shrink-0 items-center gap-3 rounded-[8px] max-sm:min-h-[44px] max-sm:min-w-[44px] max-sm:justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Logomark size={32} stroke={2.2} />
          {/* THE WORDMARK STEPS ASIDE BELOW `sm` (FR1). 148px of a 343px row
              is the difference between a search field a person can read their
              query in and a button they have to guess at; the mark still goes
              home, and the row above carries the whole brand as its name.
              REGULAR WEIGHT: the face ships at 400 only, and a 500 here was
              the browser's synthetic bold. */}
          <span className="font-serif text-[28px] font-normal leading-none tracking-[-0.03em] text-foreground max-sm:hidden">
            openproduct
          </span>
        </AppLink>

        {/* THE SECTIONS, AS WORDS (CL-R1). The nav stretches to the bar's full
            height so the current section's 2px underline sits on the bar's
            own hairline. Between `sm` and `xl` it may scroll sideways
            (`min-w-0` lets it shrink into the space it has rather than
            pushing the bar); below `sm` the sections are the bottom bar
            instead (FR1), so every one of them is still reachable on a phone
            (XP4). */}
        <nav
          aria-label="Sections"
          className="flex shrink-0 items-stretch gap-7 self-stretch max-xl:min-w-0 max-xl:shrink max-xl:gap-5 max-xl:overflow-x-auto max-xl:[scrollbar-width:none] max-sm:hidden"
        >
          {SECTIONS.map((section) =>
            section.status === "live" && section.href ? (
              <AppLink
                key={section.id}
                href={section.href}
                // QE0 — OFF, with the section bar's. OPP13 fetched five
                // documents on every page load for the click that usually
                // never comes; the wire lane counted them (desktop home: 30
                // requests, the listing 34, both at or over WC2-8's 30). The
                // hover warm in `AppLink` keeps the switch instant for the
                // person who reaches for it. `prefetch={false}` rather than
                // omitted, so the decision is visible where OPP13's was.
                prefetch={false}
                aria-current={section.id === activeSection ? "page" : undefined}
                className={`-mb-px flex shrink-0 items-center border-b-2 text-[15px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  section.id === activeSection
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {section.label}
              </AppLink>
            ) : (
              <span
                key={section.id}
                aria-disabled="true"
                title={
                  section.arrivesWith
                    ? `Arrives with ${section.arrivesWith.cluster} — ${section.arrivesWith.holds}`
                    : undefined
                }
                className="relative -mb-px flex shrink-0 cursor-default items-center border-b-2 border-transparent text-[15px] font-medium text-faint"
              >
                {section.label}
                <span className="sr-only">
                  {section.arrivesWith
                    ? ` — not yet available; arrives with ${section.arrivesWith.cluster}, and will hold ${section.arrivesWith.holds}`
                    : " — not yet available"}
                </span>
              </span>
            ),
          )}
        </nav>

        {/* DS3 — the palette. It answers from the DS0 INDEX, never from a scan
            of whatever the current page happens to have rendered. Its own
            island, so the bar around it stays server-rendered. It takes the
            row's slack from `sm` up (`sm:ml-auto` in `palette.tsx`), which is
            what puts the sections beside the wordmark and the controls at the
            right edge. */}
        <CommandPalette />

        <div className="flex shrink-0 items-center gap-2 max-sm:ml-auto max-sm:gap-1.5">
          <NotificationBell />
          {/* The two buttons are NOT the same button: this one is an outlined
              pill on the page, and the black one is `Sign in` inside
              AccountChip. Opening a build is the thing a signed-in reader does
              occasionally; signing in is the thing the page is asking a
              stranger to do. */}
          <AppLink
            href="/submit"
            aria-label="Open a build"
            className="inline-flex h-[44px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border px-5 text-[15px] font-medium text-foreground transition-colors hover:border-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-lg:px-4 max-sm:w-[44px] max-sm:px-0"
          >
            {/* OPEN A BUILD (OB1, D4), and the plus is the same glyph at every
                width: beside the words at `lg` and up, beside the short word
                below it, alone on a phone. The long label is worth about 70px,
                and below `lg` that is the difference between a nav that fits
                and a nav that scrolls. `aria-label` carries the whole act, so
                nothing is lost to anyone reading it another way. */}
            <PlusIcon />
            <span className="max-lg:hidden" aria-hidden="true">Open a build</span>
            <span className="max-sm:hidden lg:hidden" aria-hidden="true">Build</span>
          </AppLink>
          <AccountChip />
        </div>
      </div>
    </header>
  );
}
