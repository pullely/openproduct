"use client";

import { usePathname } from "next/navigation";

import { SectionGlyph } from "./section-glyph";
import { SECTIONS } from "./shell";
import { sectionFor } from "./section-for";

import { AppLink } from "../ui/link";

/**
 * The sections, at the bottom, on a phone (openproduct-worldclass FR1).
 *
 * ─── WHAT THIS REPLACES ───────────────────────────────────────────────────
 *
 * The audit's P0·05, measured and reproduced: at 375×812 the header was
 * **147px** — eighteen percent of the viewport — across three wrapped rows,
 * and the section nav inside it scrolled, `scrollWidth 426` against
 * `clientWidth 347`, with **People hidden off the right edge and no
 * affordance saying so**. A destination that exists, is linked from the
 * shell, and cannot be reached by a reader who does not think to swipe a row
 * that gives no sign of being swipeable.
 *
 * A horizontal scroller was the right call when the alternative was hiding
 * the nav (XP4 said so, and it was right: "the nav is not hidden on a
 * phone"). It is the wrong call once the row cannot fit its contents at the
 * width most people hold. This keeps XP4's rule — every section is reachable
 * on a phone — and stops asking a reader to discover it.
 *
 * ─── A GLYPH OVER A WORD (OB1, D6) ─────────────────────────────────────────
 *
 * Until open builds this bar was five words and no pictures, on purpose: the
 * site had no icon set, and inventing glyphs for *Collections* and
 * *Leaderboard* would have been ambiguity for its own sake. OB1 gives the
 * site one set with one meaning per glyph, and the sections are its first
 * users — an open door for Builds, a seat for Open roles, a hash for Topics,
 * two heads for People. The word stays under every glyph: the glyph is how a
 * thumb finds the cell, the word is what the cell is.
 *
 * FOUR CELLS. Collections and Leaderboard left the bar with OB1, so each cell
 * is 93px at 375 and `Open roles` fits with room. `Open a build` stays in the
 * header as a plus.
 *
 * NO ACCENT. XP-1: the endorsement gold means one thing and the shell never
 * spends it. The lit cell is `--secondary` under `--foreground`, which is the
 * same pill the header uses at wider widths — one language, two positions.
 */
export function SectionBar() {
  const pathname = usePathname() ?? "/";
  const active = sectionFor(pathname);
  return (
    <nav
      aria-label="Sections"
      // `sm:hidden` — this is the phone's nav and the header's pills are
      // everywhere else's. Both render the same list from the same source, so
      // they cannot disagree about what the sections are.
      //
      // `pb-[env(safe-area-inset-bottom)]` puts the bar's own padding below
      // the cells rather than shrinking them, so a phone with a home
      // indicator gets a 56px row that is still 56px.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/[0.96] pb-[env(safe-area-inset-bottom)] backdrop-blur-[10px] sm:hidden"
    >
      <ul className="m-0 flex list-none items-stretch p-0">
        {SECTIONS.map((section) => (
          <li key={section.id} className="min-w-0 flex-1">
            {section.status === "live" && section.href ? (
              <AppLink
                href={section.href}
                // QE0 — OFF, and the measurement is why. OPP13 turned viewport
                // prefetch on here ("the bytes are the next click"), and the
                // 9 September audit counted what that costs on a phone: four
                // RSC documents, ~44 KB, on every home load, for a click that
                // usually never comes. WC2-8's budget is on the wire at both
                // viewports, and this bar is the one on screen at 375px.
                // `AppLink` still warms the destination on `touchstart`, which
                // lands before the tap completes — so the section switch stays
                // warm for the person who makes it and costs nothing for the
                // one who does not. The top panel keeps OPP13's setting: at
                // 1280px this bar is `display: none`, so only one of the two
                // bars prefetches on any viewport.
                prefetch={false}
                aria-current={section.id === active ? "page" : undefined}
                className={`flex h-[56px] items-center justify-center px-1 text-center text-[10.5px] font-medium leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                  section.id === active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`inline-flex flex-col items-center gap-[3px] rounded-[8px] px-2 py-1 ${
                    section.id === active ? "bg-secondary" : ""
                  }`}
                >
                  <SectionGlyph icon={section.icon} className="h-[18px] w-[18px] shrink-0" />
                  {section.label}
                </span>
              </AppLink>
            ) : (
              // The convention this shell has kept since XP0: a planned
              // destination renders, muted and inert, naming what will fill
              // it — a greyed control with no explanation is the thing this
              // program decided not to ship.
              <span
                aria-disabled="true"
                className="flex h-[56px] flex-col items-center justify-center gap-[3px] px-1 text-center text-[10.5px] font-medium leading-tight text-faint"
              >
                <SectionGlyph icon={section.icon} className="h-[18px] w-[18px] shrink-0" />
                {section.label}
                <span className="sr-only">
                  {section.arrivesWith
                    ? ` — not yet available; arrives with ${section.arrivesWith.cluster}`
                    : " — not yet available"}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
