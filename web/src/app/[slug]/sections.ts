/**
 * The listing page's outline (openproduct-worldclass-v2 PP2).
 *
 * THE SUB-NAV IS ANCHORS, NOT ROUTES (design §PP). The audit's W·10 named a
 * product page with no sub-nav; the benchmark's is a tab strip that routes,
 * and a tab strip is exactly what the page's own comment refuses — "THE
 * DESIGN HAS NO TABS. One column a reader scrolls, and each section carries
 * a heading with an id, so the page has an outline." This module is that
 * outline, written down once: the nav under the hero renders it, and the
 * keyboard layer walks it with `j` and `k`, so a section the nav lists and
 * the keys skip, or the keys visit and the nav omits, is not a state the
 * page can reach.
 *
 * IN DOCUMENT ORDER, UNDER THE PAGE'S OWN HEADINGS. The plan wrote *Overview
 * · Discussion · Changes · Alternatives · Team* — the benchmark's order and
 * the benchmark's words. An outline that lists sections in an order other
 * than the one a reader scrolls through is a map drawn upside down, and a
 * link that says *Team* landing on a heading that says *Makers* asks the
 * reader to hold a translation table. The labels here ARE the headings.
 *
 * PURE, AND SEPARATE FROM THE PAGE, for the reason `ui/keys.ts` gives about
 * itself: the web test lane is module-level and has no JSX, so a rule inside
 * a `.tsx` is a rule no test here can hold.
 */

import { DIFF_HEADING } from "@openproduct/contracts";

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
  /** *Makers* has a panel only when somebody is listed (CP-R3). */
  readonly makers: boolean;
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
 * *Alternatives* is last although it sits in the aside: on a narrow viewport
 * the aside stacks under the column, and on a wide one it is the column a
 * reader reaches after the first — last in either reading order.
 */
export function listingSections(present: SectionPresence): readonly ListingSection[] {
  const sections: ListingSection[] = [{ id: "about", label: "About" }];
  if (present.changes) sections.push({ id: "changed", label: DIFF_HEADING });
  if (present.launches) sections.push({ id: "launches", label: "Launches" });
  if (present.makers) sections.push({ id: "makers", label: "Makers" });
  sections.push({ id: "discussion", label: "Discussion" }, { id: "alternatives", label: "Alternatives" });
  return sections;
}

/**
 * The listing page's section card: the tile's 20px radius and room (CL-R3,
 * CP-R4) — `28px 32px` inside, `20px` on a phone — one per section of the
 * reading column that has something in it (CP-R3). Here rather than in `ui/design.ts` because only
 * this page draws it, and here rather than in `page.tsx` because
 * `changes.tsx` draws one too. `scroll-mt` keeps an anchored heading clear
 * of the shell's bar and the product bar under it.
 */
export const SECTION_CARD =
  "rounded-[20px] border border-border bg-card px-8 py-7 scroll-mt-[72px] max-sm:px-5 max-sm:py-5 sm:scroll-mt-[116px]";
