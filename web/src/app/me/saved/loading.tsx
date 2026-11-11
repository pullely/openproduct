// The visitor's saved products, arriving (openproduct-performance OPP9).
//
// ITS OWN, BECAUSE ITS HEIGHT IS NOT THE FORM'S. `me/loading.tsx` draws a
// profile form and reserves that form's height, which it can do honestly
// because a form is a fixed set of fields. A saved list is not: it is nothing,
// or three rows, or forty.
//
// So this draws the chrome that IS certain — the frame, the nav, the title —
// and three rows, on XP3's rule: "drawing three where there will be twenty is
// a smaller lie than drawing twenty where there will be three". An empty list
// is a real state here, and a screenful of grey rows promising products the
// visitor has not saved is the worse lie.

import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../../ui/skeleton";
import { ME_MAIN, ME_NAV_WIDTHS } from "../nav";

export default function SavedLoading() {
  return (
    <main className={ME_MAIN}>
      <LoadingAnnouncement what="your saved products" />
      <div className="flex flex-wrap items-center gap-1">
        {ME_NAV_WIDTHS.map((width, i) => (
          <Shimmer key={i} className="h-[32px] rounded-[8px]" style={{ width }} />
        ))}
      </div>
      <Shimmer className="mt-7 h-[31px] w-[210px]" />
      <SavedRowsSkeleton />
    </main>
  );
}

/** Three rows of the saved card: a 44px tile, a name over its line, a
 *  30px button — at the row's own `14px 20px`. */
function SavedRowsSkeleton() {
  return (
    <div className="mt-6 overflow-hidden rounded-[12px] border border-border bg-card">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3.5 border-t border-line px-5 py-3.5 first:border-t-0">
          <Shimmer className="h-[44px] w-[44px] shrink-0 rounded-[13px]" />
          <div className="min-w-0 flex-1">
            <ShimmerLine width="w-[32%]" className="h-[15px]" />
            <ShimmerLine width="w-[58%]" className="mt-1.5 h-[13.5px]" />
          </div>
          <Shimmer className="h-[30px] w-[76px] rounded-[8px]" />
        </div>
      ))}
    </div>
  );
}
