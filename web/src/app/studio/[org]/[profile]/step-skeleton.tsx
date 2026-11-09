// What a step looks like while it arrives (openproduct-studio OSD5).
//
// Drawn UNDER the listing's layout, which stays on screen: the head, the hero
// and the strip are already there, so this is only the two columns — a card
// or two where the step's cards go and the rail's panel beside them. The
// router prefetches it with each tab ("auto"), so a click paints this at once
// instead of leaving the last tab frozen until every read is back.

import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../../../ui/skeleton";

export function StepSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_320px] items-start gap-x-6 gap-y-4 max-lg:grid-cols-[minmax(0,1fr)]">
      <LoadingAnnouncement what="this part of your listing" />
      <div className="grid min-w-0 gap-4">
        {[0, 1].map((i) => (
          <section key={i} className="rounded-[12px] border border-border bg-card px-6 pb-5 pt-4 max-sm:px-4">
            <ShimmerLine width="w-[28%]" className="h-[18px]" />
            <ShimmerLine width="w-[88%]" className="mt-4" />
            <ShimmerLine width="w-[72%]" className="mt-2" />
            <Shimmer className="mt-4 h-[38px] w-full" />
          </section>
        ))}
      </div>
      <aside className="grid min-w-0 gap-4">
        <div className="rounded-[12px] border border-border bg-card px-5 pb-[18px] pt-4">
          <ShimmerLine width="w-[50%]" className="h-[16px]" />
          <ShimmerLine width="w-[80%]" className="mt-3" />
          <ShimmerLine width="w-[64%]" className="mt-2" />
        </div>
      </aside>
    </div>
  );
}
