/**
 * The listing page's outline (openproduct-worldclass-v2 PP2).
 *
 * THE SUB-NAV IS ANCHORS, NOT ROUTES (design §PP). One document a reader
 * scrolls, and each section carries a heading with an id, so the page has an
 * outline. (The redesign's board draws tabs in this row; they arrive with the
 * posts they switch between, OPR2.) This module is that
 * outline, written down once: the row in the header card renders it, and the
 * keyboard layer walks it with `j` and `k`, so a section the nav lists and
 * the keys skip, or the keys visit and the nav omits, is not a state the
 * page can reach.
 *
 * IN DOCUMENT ORDER, UNDER THE PAGE'S OWN HEADINGS. The plan wrote *Overview
 * · Discussion · Changes · Alternatives · Team* — the benchmark's order and
 * the benchmark's words. An outline that lists sections in an order other
 * than the one a reader scrolls through is a map drawn upside down, and a
 * link that says *Team* landing on a heading that says *Crew* asks the
 * reader to hold a translation table. The labels here ARE the headings.
 *
 * PURE, AND SEPARATE FROM THE PAGE, for the reason `ui/keys.ts` gives about
 * itself: the web test lane is module-level and has no JSX, so a rule inside
 * a `.tsx` is a rule no test here can hold.
 */

import { DIFF_HEADING } from "@openproduct/contracts";

import { BOARD_CARD } from "../ui/design";

/** One entry of the outline: the anchor and the words on it. */
export interface ListingSection {
  /** The `id` of the section element the anchor scrolls to. */
  readonly id: string;
  /** The heading's own text, so the nav and the page say the same word. */
  readonly label: string;
}

/** What the page has to say about which optional sections it rendered. */
export interface SectionPresence {
  /** PV4's *What changed* has a panel only when something changed: with no
   *  earlier snapshot it is absent, and with nothing changed it folds into
   *  the page's one *Not yet* line (CP-R3). An anchor to nothing is a broken
   *  link. */
  readonly changes: boolean;
  /** PP5's *Launches* is absent when the listing has never launched. */
  readonly launches: boolean;
  /** *Crew* (board `Product`) has a card only when somebody is listed or a
   *  seat is open (CP-R3). */
  readonly crew: boolean;
}

/**
 * The attribute a section wears so the keyboard layer can find it. One name,
 * on exactly the sections the nav lists — the outline and the traversal are
 * the same list by construction.
 */
export const SECTION_ATTRIBUTE = "data-keysection";

/** The nav's accessible name. A landmark a screen reader lists by it. */
export const SECTION_NAV_LABEL = "On this page";

/**
 * The outline, in the order the page renders it.
 *
 * *Crew* and *Alternatives* are last although they sit in the side column:
 * on a narrow viewport the side column stacks under the reading column, and
 * on a wide one it is the column a reader reaches after the first — last in
 * either reading order, and in the order the side column draws them.
 */
export function listingSections(present: SectionPresence): readonly ListingSection[] {
  const sections: ListingSection[] = [{ id: "about", label: "About" }];
  if (present.changes) sections.push({ id: "changed", label: DIFF_HEADING });
  if (present.launches) sections.push({ id: "launches", label: "Launches" });
  sections.push({ id: "discussion", label: "Discussion" });
  if (present.crew) sections.push({ id: "crew", label: "Crew" });
  sections.push({ id: "alternatives", label: "Alternatives" });
  return sections;
}

/**
 * The listing page's section card (openproduct-redesign OPR1): the flat card
 * — white at a 16px radius, no border, no shadow — with the board's
 * `20px 22px` inside, 14px on a phone; one per section of the reading column
 * that has something in it (CP-R3). Here rather than in `page.tsx` because
 * `changes.tsx` and the forum page draw one too. `scroll-mt` keeps an
 * anchored heading clear of the site's header, which stays at the top.
 */
export const SECTION_CARD = `${BOARD_CARD} scroll-mt-[80px]`;

/** The maker's own words inside a section card: the board's 15px body in
 *  `--copy`, in at most 68ch. */
export const SECTION_PROSE = "max-w-[68ch] text-[15px] leading-[1.6] text-copy";
