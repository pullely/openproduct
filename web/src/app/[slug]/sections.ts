/**
 * The product page's sections (openproduct-worldclass-v2 PP2; reshaped by
 * openproduct-redesign OPR-3).
 *
 * OPR1's page was one document with an outline of anchors in its header. The
 * redesign's tabs are now real — each a route of its own (`tabs.ts`) — so the
 * outline row is gone, and what is left here is what the tabs' cards and the
 * keyboard layer still share: the attribute a section wears, and the card it
 * is drawn in.
 *
 * `j` AND `k` STILL WALK THE SECTIONS of whichever tab is open: every card
 * with a heading wears `SECTION_ATTRIBUTE`, and the keyboard layer reads it.
 *
 * PURE, AND SEPARATE FROM THE PAGE: the web test lane is module-level and has
 * no JSX, so a rule inside a `.tsx` is a rule no test here can hold.
 */

import { BOARD_CARD } from "../ui/design";

/**
 * The attribute a section wears so the keyboard layer can find it. One name,
 * on the cards a reader moves between with `j` and `k`.
 */
export const SECTION_ATTRIBUTE = "data-keysection";

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
