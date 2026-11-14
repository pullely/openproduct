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

// OPR1 — the board's shape: the count and the title, the segmented tray, one
// flat card of rows. On a phone the field leads and the title is not drawn,
// exactly as the page does it.

import { RESULT_CARD, SEARCH_COLUMN } from "./frame";

import { LoadingAnnouncement, Shimmer, ShimmerLine, TextLine } from "../ui/skeleton";

export default function SearchLoading() {
  return (
    <main className={SEARCH_COLUMN}>
      <LoadingAnnouncement what="search results" />
      <Shimmer className="hidden h-[44px] w-full rounded-full max-sm:block" />
      <div className="flex flex-col gap-[6px] max-sm:hidden">
        <ShimmerLine width="w-[90px]" className="h-[14px]" />
        <div className="w-[260px]">
          <TextLine line={44} ink={30} />
        </div>
      </div>
      <Shimmer className="h-[48px] w-[360px] max-w-full rounded-full max-sm:h-[50px] max-sm:w-full" />
      <ul className={RESULT_CARD}>
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex h-[68px] list-none items-center gap-[14px] border-t border-line px-[10px] first:border-t-0 max-sm:gap-3 max-sm:px-0"
          >
            <Shimmer className="h-[44px] w-[44px] shrink-0 rounded-[13px]" />
            <span className="min-w-0 flex-1">
              <div className="w-[34%]">
                <TextLine line={22} ink={14} />
              </div>
              <div className="mt-px w-[62%]">
                <TextLine line={19} ink={11} />
              </div>
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
