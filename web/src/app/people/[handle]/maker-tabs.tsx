import {
  MAKER_TABS,
  MAKER_TAB_LABELS,
  makerPath,
  type MakerCounts,
  type MakerTab,
} from "@openproduct/contracts";

import { AppLink } from "../../ui/link";
import { SECTION_PILL, SECTION_PILL_OFF, SECTION_PILL_ON } from "../../ui/design";

/**
 * The words on a person's section pills (openproduct-redesign OPR1, board
 * `Person`). The default section — every listing they run — is *Products*,
 * the site's own word for them (the navigation's, the board's); the other
 * three keep the contract's labels. The ids, and so the addresses, are the
 * contract's and do not move.
 */
export const SECTION_LABELS: Record<MakerTab, string> = {
  ...MAKER_TAB_LABELS,
  launched: "Products",
};

/**
 * The sections of a person's page (openproduct-launch MP0), as the board's
 * row of pills at the bottom of the profile card: 36px, the current one ink;
 * 44px on a phone.
 *
 * ANCHORS, NOT BUTTONS, and the difference is not cosmetic. The board draws
 * `<button>`s that swap client state; each section here is a different
 * DOCUMENT at a different address, so it is a link — which means it can be
 * opened in a new tab, bookmarked, sent to somebody, crawled, and read by a
 * screen reader as the navigation it is.
 *
 * THE CURRENT ONE IS STILL A LINK, marked `aria-current="page"` rather than
 * removed. A missing link where a reader expects one is a control that looks
 * broken; a link to where you already are costs nothing and keeps the row's
 * shape stable as the section changes.
 *
 * EACH COUNT IS THE LENGTH OF THE LIST BEHIND IT, computed once by core and
 * rendered here — never `rows.length`, which would be the truncated number and
 * would disagree with the list the moment somebody has more than the page
 * shows. Above zero only: a pill that reads `0` leads with what is not there.
 */
export function MakerTabs({
  handle,
  current,
  counts,
  builds,
}: {
  handle: string;
  current: MakerTab;
  counts: MakerCounts;
  /** OB6 — the Products pill counts the listings they run, the list it opens. */
  builds: number;
}) {
  return (
    // On a phone the four pills can be wider than the screen, so the row
    // scrolls itself rather than the page.
    <nav
      aria-label="Profile sections"
      className="flex gap-1.5 overflow-x-auto px-[22px] pb-4 max-sm:px-2.5 max-sm:pb-2.5 max-sm:[scrollbar-width:none]"
    >
      {MAKER_TABS.map((tab) => {
        const isCurrent = tab === current;
        const count = countOf(counts, tab, builds);
        return (
          <AppLink
            key={tab}
            href={makerPath(handle, tab)}
            {...(isCurrent ? { "aria-current": "page" as const } : {})}
            className={`${SECTION_PILL} ${isCurrent ? SECTION_PILL_ON : SECTION_PILL_OFF} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
          >
            {SECTION_LABELS[tab]}
            {count > 0 ? (
              <span className="text-[13px] font-normal tabular-nums opacity-70">{count}</span>
            ) : null}
          </AppLink>
        );
      })}
    </nav>
  );
}

/** The tab's own number. `comments` counts POSTS while the tab lists LISTINGS,
 *  and that is deliberate: somebody with forty comments across three products
 *  said forty things, and a tab reading `3` would be counting the wrong noun. */
function countOf(counts: MakerCounts, tab: MakerTab, builds: number): number {
  if (tab === "upvoted") return counts.upvotesGiven;
  if (tab === "comments") return counts.comments;
  // OB6 — the default section is every listing they run, counted as the
  // list under it is.
  if (tab === "launched") return builds;
  return counts.launched;
}
