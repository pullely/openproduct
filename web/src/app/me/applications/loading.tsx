// The visitor's applications, arriving (openproduct-performance OPP9).
//
// ITS OWN, BECAUSE ITS HEIGHT IS NOT THE FORM'S. `me/loading.tsx` draws a
// profile form and reserves that form's height, which it can do honestly
// because a form is a fixed set of fields. A list of applications is not: it
// is nothing, or three rows, or forty.
//
// So this draws the chrome that IS certain — the frame, the nav, the title —
// and three rows, on XP3's rule: "drawing three where there will be twenty is
// a smaller lie than drawing twenty where there will be three". An empty list
// is a real state here — most visitors have applied to nothing — and a
// screenful of grey rows promising applications nobody made is the worse lie.

import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../../ui/skeleton";
import { ME_MAIN, ME_NAV_WIDTHS } from "../nav";

export default function ApplicationsLoading() {
  return (
    <main className={ME_MAIN}>
      <LoadingAnnouncement what="your applications" />
      <div className="flex flex-wrap items-center gap-1">
        {ME_NAV_WIDTHS.map((width, i) => (
          <Shimmer key={i} className="h-[32px] rounded-[8px]" style={{ width }} />
        ))}
      </div>
      <Shimmer className="mt-7 h-[31px] w-[240px]" />
      {/* Three rows of the card: a name, its line, a 24px pill. */}
      <div className="mt-7 overflow-hidden rounded-[12px] border border-border bg-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 border-t border-line px-[18px] py-3.5 first:border-t-0">
            <ShimmerLine width="w-[22%]" className="h-[14.5px]" />
            <ShimmerLine width="w-[40%]" className="h-[13.5px]" />
            <span className="flex-1" />
            <Shimmer className="h-[24px] w-[96px] rounded-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
