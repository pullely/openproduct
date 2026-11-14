// The visitor's own profile, arriving (openproduct-commons XP3,
// openproduct-performance OPP9; redrawn for the boards `Me` and `PhoneMe` by
// openproduct-redesign OPR1).
//
// ─── THE RULE THIS FILE KEEPS ─────────────────────────────────────────────
//
// A skeleton in a different box is a skeleton that guarantees a shift. The
// first one here drew the right idea in the wrong frame and measured
// **CLS 0.101** signed in; the fix was the SAME frame as the page, and only
// what is certain inside it.
//
// On `/me` three things are certain whoever is looking: the frame, the
// profile card, and the switcher with its three sections. Those are drawn at
// their real sizes. What sits beside the switcher is a list — nothing, or
// three rows, or forty — so three rows are drawn, on XP3's rule: "drawing
// three where there will be twenty is a smaller lie than drawing twenty
// where there will be three".
//
// ─── AND IT RESERVES A HEIGHT, WHICH IS THE HALF THAT ACTUALLY MOVED CLS ──
//
// Measuring the shift entries found the real source in one line —
//
//     0.0978  FOOTER  y×h 609x111 -> 0x0
//
// — the SITE FOOTER, not anything on this page. A skeleton much shorter than
// the content it stands in for puts the footer near the top of the viewport,
// and when the real content streams in the footer travels. The old page was
// a form, whose height was known by construction; this one is a list, whose
// height is not — so the frame holds a `min-h` of most of a viewport, the
// way the inbox's skeleton always has.
//
// (`/me/saved` and `/me/applications`, the old addresses, redirect to a
// section of this page from the edge and draw nothing.) `/me/settings` is a
// form, and has its own.

import { BOARD_PAGE } from "../ui/design";
import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../ui/skeleton";
import { ME_LIST, ME_SECTIONS } from "./nav";

export default function MeLoading() {
  return (
    // The SAME frame as `me/page.tsx`.
    <main className={`${BOARD_PAGE} min-h-[78vh]`}>
      <LoadingAnnouncement what="your profile" />

      {/* The profile card: the band, the 92px disc over its edge, the name
          and the two controls. On a phone, no band: a 52px disc beside the
          name, and the controls under them. */}
      <div className="overflow-hidden rounded-[16px] bg-card max-sm:p-3.5">
        <div className="h-[120px] bg-sunken max-sm:hidden" />
        <div className="flex flex-wrap items-end justify-between gap-4 px-[30px] pb-6 max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5 max-sm:p-0">
          <div className="-mt-[46px] flex flex-col gap-2 max-sm:mt-0 max-sm:flex-row max-sm:items-center max-sm:gap-3">
            <Shimmer className="h-[92px] w-[92px] shrink-0 rounded-full ring-[5px] ring-card max-sm:h-[52px] max-sm:w-[52px] max-sm:ring-0" />
            <Shimmer className="h-[44px] w-[260px] max-sm:h-[31px] max-sm:w-[180px]" />
          </div>
          <div className="flex items-center gap-3.5 max-sm:grid max-sm:grid-cols-1">
            <Shimmer className="h-[40px] w-[148px] rounded-full max-sm:h-[44px] max-sm:w-full" />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-7 max-md:flex-col max-md:items-stretch max-md:gap-2.5">
        {/* The switcher: a card of three 40px rows under its label; three
            44px pills on a phone. */}
        <div className="flex w-[260px] shrink-0 flex-col gap-0.5 rounded-[16px] bg-card p-2.5 max-md:w-auto max-md:flex-row max-md:gap-1.5 max-md:bg-transparent max-md:p-0">
          <Shimmer className="mb-2 ml-2.5 mt-1.5 h-[14px] w-[32px] max-md:hidden" />
          {ME_SECTIONS.map((section) => (
            <div key={section.key} className="flex min-h-[40px] items-center gap-3 px-2.5 max-md:hidden">
              <Shimmer className="h-8 w-8 shrink-0 rounded-[10px]" />
              <ShimmerLine width="w-[96px]" className="h-[15px]" />
            </div>
          ))}
          {ME_SECTIONS.map((section) => (
            <Shimmer key={section.key} className="h-[44px] w-[112px] shrink-0 rounded-full md:hidden" />
          ))}
        </div>

        {/* The section: its 20px heading on a desktop, then three rows of
            the flat card — a 52px tile, a name over its line, a 40px pill. */}
        <div className="flex min-w-0 max-w-[760px] flex-1 flex-col gap-3.5 max-md:max-w-none max-sm:gap-2.5">
          <Shimmer className="mb-0.5 h-[25px] w-[150px] max-md:hidden" />
          <div className={ME_LIST}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3.5 rounded-[16px] bg-card p-[18px] max-sm:gap-3 max-sm:p-3.5">
                <Shimmer className="h-[52px] w-[52px] shrink-0 rounded-[14px]" />
                <div className="min-w-0 flex-1">
                  <ShimmerLine width="w-[32%]" className="h-[16px]" />
                  <ShimmerLine width="w-[58%]" className="mt-2 h-[13px]" />
                </div>
                <Shimmer className="h-[40px] w-[92px] shrink-0 rounded-full max-sm:h-[44px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
