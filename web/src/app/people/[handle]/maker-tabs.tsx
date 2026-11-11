import {
  MAKER_TABS,
  MAKER_TAB_LABELS,
  makerPath,
  type MakerCounts,
  type MakerTab,
} from "@openproduct/contracts";

import { AppLink } from "../../ui/link";

/**
 * The design's `tabStyle` for a person's page: 42px tall, `0 14px`, 14.5/500,
 * a 2px underline in `--foreground` when current (the accent until
 * openproduct-calm CL4; CL-R8 keeps it for the upvote). It carries its count beside the
 * label.
 */
const PERSON_TAB =
  "-mb-px flex h-[42px] max-sm:min-h-[44px] max-sm:mb-0 shrink-0 items-center gap-1 border-b-2 px-3.5 text-[14.5px] font-medium no-underline transition-colors";
const PERSON_TAB_ON = "border-foreground text-foreground";
const PERSON_TAB_OFF = "border-transparent text-muted-foreground hover:text-foreground";

/**
 * The three tabs on a maker page (openproduct-launch MP0).
 *
 * ANCHORS, NOT BUTTONS, and the difference is not cosmetic. The design draws
 * `<button>`s that swap client state; each tab here is a different DOCUMENT at
 * a different address, so it is a link — which means it can be opened in a new
 * tab, bookmarked, sent to somebody, crawled, and read by a screen reader as
 * the navigation it is. UV2's range switch made the same call and the a11y
 * lane pins it there; this is the same rule on a second surface.
 *
 * THE CURRENT TAB IS STILL A LINK, marked `aria-current="page"` rather than
 * removed. A missing link where a reader expects one is a control that looks
 * broken; a link to where you already are costs nothing and keeps the row's
 * shape stable as the tab changes.
 *
 * EACH COUNT IS THE LENGTH OF THE LIST BEHIND IT, computed once by core and
 * rendered here — never `rows.length`, which would be the truncated number and
 * would disagree with the tab the moment somebody has more than the page shows.
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
  /** OB6 — the Builds tab counts the listings they run, the list it opens. */
  builds: number;
}) {
  return (
    // On a phone the four tabs are wider than the screen, so the strip
    // scrolls itself rather than the page (`-mb-px` comes off there, or the
    // 1px overhang would open a vertical scrollbar).
    <nav
      aria-label="What this person has done"
      className="mb-2 flex gap-1 border-b border-border max-sm:overflow-x-auto max-sm:[scrollbar-width:none]"
    >
      {MAKER_TABS.map((tab) => {
        const isCurrent = tab === current;
        return (
          <AppLink
            key={tab}
            href={makerPath(handle, tab)}
            {...(isCurrent ? { "aria-current": "page" as const } : {})}
            className={`${PERSON_TAB} ${isCurrent ? PERSON_TAB_ON : PERSON_TAB_OFF}`}
          >
            {MAKER_TAB_LABELS[tab]}
            <span className="font-mono text-[12.5px] font-normal text-muted-foreground tabular-nums">
              {countOf(counts, tab, builds)}
            </span>
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
  // OB6 — the default tab is Builds: every listing they run, counted as the
  // list under it is.
  if (tab === "launched") return builds;
  return counts.launched;
}
