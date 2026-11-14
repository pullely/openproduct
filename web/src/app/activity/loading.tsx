// The inbox, arriving (openproduct-performance OPP9), at `/activity` since
// openproduct-redesign OPR1 moved the page.
//
// ITS OWN, BECAUSE IT DRAWS ROWS, unlike the shared one: an inbox is a list
// of rows of a known height, so reserving five of them reserves real space
// rather than guessing at a shape. XP3's rule cuts both ways — the sin is
// drawing what is unknown, not drawing what is known.
//
// Five rather than twenty, for the reason XP3 gives: "drawing three where
// there will be twenty is a smaller lie than drawing twenty where there will
// be three". An empty inbox is a real state, and a screenful of grey rows
// promising mail that is not there is the worse of the two lies.

import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../ui/skeleton";
import { ME_MAIN, ME_NAV_WIDTHS } from "../me/nav";

export default function NotificationsLoading() {
  return (
    // The SAME frame as `activity/page.tsx`.
    // `min-h` for the reason `me/loading.tsx` records: a skeleton shorter than its
    // content leaves the footer high, and the footer then travels the whole
    // difference when the content lands.
    <main className={`${ME_MAIN} min-h-[78vh]`}>
      <LoadingAnnouncement what="your notifications" />
      <div className="flex flex-wrap items-center gap-1">
        {ME_NAV_WIDTHS.map((width, i) => (
          <Shimmer key={i} className="h-[32px] rounded-[8px]" style={{ width }} />
        ))}
      </div>
      {/* The 26px title, with the mark-all control opposite it. */}
      <div className="mt-7 flex items-end justify-between gap-4">
        <Shimmer className="h-[31px] w-[190px]" />
        <Shimmer className="h-[30px] w-[124px] rounded-[8px]" />
      </div>
      <ul className="m-0 mt-6 grid list-none gap-0 overflow-hidden rounded-[12px] border border-border bg-card p-0">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-start gap-3 border-t border-line px-[18px] py-3.5 first:border-t-0">
            <Shimmer className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full" />
            <ShimmerLine width="w-[58%]" className="h-[14px]" />
            <span className="flex-1" />
            <ShimmerLine width="w-[64px]" className="h-[12.5px]" />
          </li>
        ))}
      </ul>
    </main>
  );
}
