// One of the visitor's own pages, arriving (openproduct-commons XP3,
// openproduct-performance OPP9).
//
// ─── WHAT WAS WRONG WITH THE FIRST ONE ────────────────────────────────────
//
// It drew the right idea in the wrong box. The frame here was
// `max-w-[1000px] px-5 pb-16 pt-8`, and every page it stands in for uses the
// `/me` column (`ME_MAIN`, 768px with `48px 24px 72px` of padding) — so the
// content did not merely replace the skeleton, it moved sideways and up when
// it landed. And under the title it drew three DIRECTORY ROWS, which is what
// `/me/saved` shows and not what `/me` shows at all: `/me` is a form.
//
// The probe measured the result at **CLS 0.101** signed in, over the
// web-vitals "good" ceiling, against 0.000 for every anonymous page — and
// nothing could see it, because XP4 budgets the ANONYMOUS render's layout and
// separately asserts the two renders are byte-identical. Both were true.
//
// ─── SO THIS DRAWS ONLY WHAT IS CERTAIN, AND STOPS ────────────────────────
//
// XP3's own rule, applied properly: "drawing three where there will be twenty
// is a smaller lie than drawing twenty where there will be three", and the
// honest stopping point is where the route becomes data-dependent.
//
// On every `/me/*` page three things are certain and identical: the frame, the
// five-chip nav, and a 26px title. Those
// are drawn at their real sizes. What sits below them is a form on one page,
// product rows on another and application rows on a third — so nothing is
// drawn there, and the content arrives into space rather than on top of a
// guess.
//
// ─── AND IT RESERVES A HEIGHT, WHICH IS THE HALF THAT ACTUALLY MOVED CLS ──
//
// The first attempt at this fixed the frame and changed nothing: still 0.101.
// Measuring the shift entries instead of theorising found the real source in
// one line —
//
//     0.0978  FOOTER  y×h 609x111 -> 0x0
//
// — the SITE FOOTER, not anything on this page. A skeleton much shorter than
// the content it stands in for puts the footer near the top of the viewport,
// and when the real content streams in the whole page grows and the footer
// travels six hundred pixels. Every element drawn above it was already in the
// right place; the page was simply too short.
//
// The height had to come from somewhere honest, and on THIS page it does:
// `/me` is a FORM, and a form is a fixed set of fields. Four text inputs, a
// textarea, two checkbox rows, a submit and two short sections below it — the same
// shape for a visitor with a full profile and one with an empty one, because
// an empty field still occupies its box. So the skeleton draws that shape, and
// reserves the right height BY CONSTRUCTION rather than by a magic number that
// drifts the first time a field is added.
//
// That is why this file is `/me`'s alone now. `/me/saved` and
// `/me/applications` are LISTS whose height is data-dependent, so they have
// their own, shorter skeletons — a form's certainty is not theirs to borrow.

import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../ui/skeleton";
import { ME_CARD, ME_MAIN, ME_NAV_WIDTHS } from "./nav";

/** The form's controls, at the heights they render: display name, handle,
 *  the bio textarea, then the two link fields. */
const FIELDS = [38, 38, 118, 38, 38];

export default function MeLoading() {
  return (
    // The SAME frame as `me/page.tsx`, `me/saved` and `me/applications`. A
    // skeleton in a different box is a skeleton that guarantees a shift.
    <main className={ME_MAIN}>
      <LoadingAnnouncement what="your page" />
      {/* `MeNav`'s own geometry: five 32px chips, 4px apart. */}
      <div className="flex flex-wrap items-center gap-1">
        {ME_NAV_WIDTHS.map((width, i) => (
          <Shimmer key={i} className="h-[32px] rounded-[8px]" style={{ width }} />
        ))}
      </div>
      {/* The 26px title (a 31px line). */}
      <Shimmer className="mt-7 h-[31px] w-[190px]" />

      {/* The identity card: a 56px disc beside two lines. */}
      <div className={`${ME_CARD} mt-6 flex items-center gap-4`}>
        <Shimmer className="h-[56px] w-[56px] shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <ShimmerLine width="w-[38%]" className="h-[17px]" />
          <ShimmerLine width="w-[52%]" className="mt-2 h-[12.5px]" />
        </div>
      </div>

      {/* The form. A 13px label over its control, the 20px gap the card uses
          between fields, and the textarea at the rows it actually renders. */}
      <div className={`${ME_CARD} mt-4 grid gap-5`}>
        {FIELDS.map((height, i) => (
          <div key={i}>
            <Shimmer className="h-[13px] w-[128px]" />
            <Shimmer className="mt-1.5 w-full rounded-[8px]" style={{ height }} />
          </div>
        ))}
        {/* The two checkbox rows — a 16px box beside two lines of copy. */}
        {[0, 1].map((i) => (
          <div key={i} className="flex items-start gap-2.5">
            <Shimmer className="h-[16px] w-[16px] shrink-0 rounded-[4px]" />
            <div className="min-w-0 flex-1">
              <ShimmerLine width="w-[46%]" className="h-[13.5px]" />
              <ShimmerLine width="w-[78%]" className="mt-1.5 h-[13.5px]" />
            </div>
          </div>
        ))}
        <Shimmer className="h-[36px] w-[132px] rounded-[8px]" />
      </div>

      {/* The two cards under the form, each a heading and a line: the digest
          control and the account row. */}
      {[0, 1].map((i) => (
        <div key={i} className={`${ME_CARD} mt-4`}>
          <Shimmer className="h-[16px] w-[140px]" />
          <ShimmerLine width="w-[72%]" className="mt-3 h-[13.5px]" />
        </div>
      ))}
    </main>
  );
}
