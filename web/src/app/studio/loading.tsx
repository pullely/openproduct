// A studio surface, arriving (openproduct-commons XP3).
//
// The frame's chrome is certain on every maintainer surface — crumbs, a
// title, the section strip — so this draws exactly that and stops. What sits
// under it differs per surface and is the part a shared skeleton would have
// to guess at.

import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../ui/skeleton";

export default function StudioLoading() {
  return (
    <main className="box-border mx-auto w-full max-w-[1000px] px-8 pb-20 pt-5 max-sm:px-4">
      <LoadingAnnouncement what="your studio" />
      <ShimmerLine width="w-[140px]" className="h-[12px]" />
      {/* The 26px title (a 31px line). */}
      <Shimmer className="mt-4 h-[31px] w-[240px]" />
      {/* The 38px section strip on its hairline. */}
      <div className="mt-5 flex gap-1 border-b border-border">
        {[74, 82].map((w, i) => (
          <span key={i} style={{ width: w }} className="block">
            <Shimmer className="mb-[-1px] h-[36px] rounded-b-none" />
          </span>
        ))}
      </div>
      <ul className="m-0 mt-7 grid list-none gap-2.5 p-0">
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-[12px] border border-border bg-card px-4 py-3.5">
            <ShimmerLine width="w-[34%]" className="h-[16px]" />
            <ShimmerLine width="w-[60%]" className="mt-2" />
          </li>
        ))}
      </ul>
    </main>
  );
}
