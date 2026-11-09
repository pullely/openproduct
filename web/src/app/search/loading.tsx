// The search page, arriving (openproduct-performance OPP13, on XP3's rule).
//
// `/search` is the ONE public route that streams: it reads `searchParams`, so
// it is dynamic in Next 15 and cannot be the cacheable document every other
// public page is (the reasoning is at the top of `page.tsx`). A streamed route
// shows its `loading.tsx` the moment the router takes the click, which is
// exactly the affordance the other pages get from the progress bar — so this
// is the one place a skeleton belongs, and it was the one place without one.
//
// What is certain: the title, the field, and that results are rows. How many
// is not, so it draws three (XP3: drawing three where there will be twenty is
// a smaller lie than drawing twenty where there will be three).

import { CARD, PAGE, PAGE_HEAD } from "../ui/design";
import { LoadingAnnouncement, Shimmer, ShimmerLine, TextLine } from "../ui/skeleton";

export default function SearchLoading() {
  return (
    <main className={PAGE}>
      <LoadingAnnouncement what="search results" />
      <header className={PAGE_HEAD}>
        <div>
          <div className="w-[260px]">
            <TextLine line={31} ink={22} />
          </div>
          <ShimmerLine width="w-[320px]" className="mt-1.5 h-[15px]" />
        </div>
      </header>
      <Shimmer className="mt-5 h-[38px] w-full rounded-[8px]" />
      <div className="mt-5 min-w-0">
        <ShimmerLine width="w-[120px]" className="h-[16px]" />
        <ul className={`m-0 mt-2.5 list-none divide-y divide-line p-0 ${CARD}`}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex h-[84px] items-center gap-4 px-5 py-4">
              <Shimmer className="h-[52px] w-[52px] shrink-0 rounded-[14px]" />
              <span className="min-w-0 flex-1">
                <div className="w-[34%]">
                  <TextLine line={22} ink={14} />
                </div>
                <div className="mt-1 w-[62%]">
                  <TextLine line={18} ink={11} />
                </div>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
