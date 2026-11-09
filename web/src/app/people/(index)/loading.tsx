// The people directory, arriving (openproduct-commons XP3).
//
// The design draws the directory as ROWS, not a card grid, so the promise
// this skeleton makes is rows: a title, the count line, the filter row, and
// a short run of rows — how many people come back is the one thing not
// certain, so it stops at a few rather than guessing a page size.

import { PAGE } from "../../ui/design";
import { LoadingAnnouncement, ProfileRowsSkeleton, Shimmer, ShimmerLine } from "../../ui/skeleton";

export default function PeopleLoading() {
  return (
    <main className={PAGE}>
      <LoadingAnnouncement what="the people directory" />
      <Shimmer className="h-[32px] w-[300px]" />
      <ShimmerLine width="w-[240px]" className="mt-5 h-[16px]" />
      <div className="mt-4 flex items-center gap-2">
        <Shimmer className="h-[38px] flex-1 rounded-[8px]" />
        <Shimmer className="h-[32px] w-[104px] rounded-full" />
        <Shimmer className="h-[32px] w-[190px] rounded-full" />
      </div>
      <div className="mt-2">
        <ProfileRowsSkeleton count={5} />
      </div>
    </main>
  );
}
