// The inbox, arriving (openproduct-performance OPP9), at `/activity` since
// openproduct-redesign OPR1 moved the page — and in the boards' shape since
// the same milestone rebuilt it.
//
// ITS OWN, BECAUSE IT DRAWS ROWS: an inbox is a list of rows of a known
// height, so reserving five of them reserves real space rather than guessing
// at a shape. XP3's rule cuts both ways — the sin is drawing what is unknown,
// not drawing what is known.
//
// Five rather than twenty, for the reason XP3 gives: "drawing three where
// there will be twenty is a smaller lie than drawing twenty where there will
// be three". An empty inbox is a real state, and a screenful of grey rows
// promising mail that is not there is the worse of the two lies.

import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../ui/skeleton";
import { ACTIVITY_MAIN } from "../me/nav";

export default function ActivityLoading() {
  return (
    // The SAME frame as `activity/page.tsx`.
    // `min-h` for the reason `me/loading.tsx` records: a skeleton shorter than its
    // content leaves the footer high, and the footer then travels the whole
    // difference when the content lands.
    <main className={`${ACTIVITY_MAIN} min-h-[78vh]`}>
      <LoadingAnnouncement what="your activity" />
      {/* The title with the read action opposite it; neither on a phone,
          where the action sits opposite the switch. */}
      <div className="flex items-center justify-between gap-3 max-sm:hidden">
        <Shimmer className="h-[44px] w-[150px]" />
        <Shimmer className="h-[40px] w-[118px] rounded-full" />
      </div>
      {/* The segmented switch: a 48px pill. */}
      <div className="flex items-center justify-between gap-2">
        <Shimmer className="h-[48px] w-[282px] rounded-full max-sm:h-[50px] max-sm:w-[226px]" />
        <Shimmer className="h-[44px] w-[112px] rounded-full sm:hidden" />
      </div>
      {/* One group: its mono label, then five rows in the group's card. */}
      <Shimmer className="ml-1.5 h-[14px] w-[52px]" />
      <ul className="m-0 flex list-none flex-col gap-0.5 rounded-[16px] bg-card p-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex items-center gap-3.5 px-3.5 py-3 max-sm:gap-2.5 max-sm:p-2.5">
            <Shimmer className="h-10 w-10 shrink-0 rounded-[12px] max-sm:h-9 max-sm:w-9" />
            <div className="min-w-0 flex-1">
              <ShimmerLine width="w-[62%]" className="h-[15px]" />
              <ShimmerLine width="w-[48px]" className="mt-2 h-[11px]" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
