// A studio surface, arriving (openproduct-commons XP3).
//
// The frame's chrome is certain on every maintainer surface — crumbs, a
// title, the section strip — so this draws exactly that and stops. What sits
// under it differs per surface and is the part a shared skeleton would have
// to guess at.

import { TILE } from "../ui/design";
import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../ui/skeleton";

export default function StudioLoading() {
  return (
    <main className="box-border mx-auto w-full max-w-[1000px] px-8 pb-20 pt-5 max-sm:px-4">
      <LoadingAnnouncement what="your studio" />
      <ShimmerLine width="w-[140px]" className="h-[12px]" />
      {/* The 26px title (a 31px line). */}
      <Shimmer className="mt-4 h-[31px] w-[240px]" />
      {/* The section pills (OPR1): 32px chips. */}
      <div className="mt-5 flex gap-1.5">
        {[74, 82].map((w, i) => (
          <span key={i} style={{ width: w }} className="block">
            <Shimmer className="h-[32px] rounded-full" />
          </span>
        ))}
      </div>
      <ul className="m-0 mt-7 grid list-none gap-[14px] p-0">
        {[0, 1, 2].map((i) => (
          <li key={i} className={`px-6 py-5 ${TILE}`}>
            <ShimmerLine width="w-[34%]" className="h-[16px]" />
            <ShimmerLine width="w-[60%]" className="mt-2" />
          </li>
        ))}
      </ul>
    </main>
  );
}
