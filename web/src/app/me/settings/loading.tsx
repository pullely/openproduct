// Settings, arriving (openproduct-redesign OPR1, boards `Settings` and
// `PhoneSettings`).
//
// ITS OWN, BECAUSE IT IS A FORM, and a form's height is known by
// construction: a fixed set of fields, the same for somebody with a full
// profile and somebody with an empty one, because an empty field still
// occupies its box. That is the argument `me/loading.tsx` made while `/me`
// WAS this form; the form moved here, and the argument moved with it. So this
// draws the cards at the heights they render — and reserves the page's
// height by drawing it rather than by a number that drifts the first time a
// field is added.

import { LoadingAnnouncement, Shimmer, ShimmerLine } from "../../ui/skeleton";
import { SETTINGS_MAIN } from "../nav";

/** The profile card's controls, at the heights they render: name, handle,
 *  the bio's five rows, then the two links side by side (one under the other
 *  on a phone, where each is its own row here). */
const FIELDS = [44, 44, 144];

const CARD = "rounded-[16px] bg-card p-[18px] max-sm:p-3.5";

export default function SettingsLoading() {
  return (
    // The SAME frame as `me/settings/page.tsx`.
    <main className={SETTINGS_MAIN}>
      <LoadingAnnouncement what="your settings" />
      {/* The title, with Save opposite it. */}
      <div className="flex items-center justify-between gap-3">
        <Shimmer className="h-[44px] w-[150px] max-sm:h-[31px] max-sm:w-[110px]" />
        <Shimmer className="h-[40px] w-[82px] rounded-full max-sm:h-[44px]" />
      </div>

      <div className="flex items-start gap-7 max-md:flex-col max-md:items-stretch">
        {/* The side list: its label and three 40px rows. A desktop's. */}
        <div className="flex w-[260px] shrink-0 flex-col gap-0.5 rounded-[16px] bg-card p-2.5 max-md:hidden">
          <Shimmer className="mb-2 ml-2.5 mt-1.5 h-[14px] w-[120px]" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex min-h-[40px] items-center gap-3 px-2.5">
              <Shimmer className="h-8 w-8 shrink-0 rounded-[10px]" />
              <ShimmerLine width="w-[96px]" className="h-[15px]" />
            </div>
          ))}
        </div>

        <div className="flex min-w-0 max-w-[720px] flex-1 flex-col gap-3.5 max-md:max-w-none max-sm:gap-2.5">
          {/* Profile: the heading, a label over each field, the two links,
              and the two switch rows. */}
          <div className={`${CARD} flex flex-col gap-[22px] max-sm:gap-3`}>
            <Shimmer className="h-[23px] w-[72px]" />
            {FIELDS.map((height, i) => (
              <div key={i}>
                <Shimmer className="h-[14px] w-[64px] max-sm:h-[19px]" />
                <Shimmer className="mt-1.5 w-full rounded-[14px] max-sm:mt-1" style={{ height }} />
              </div>
            ))}
            <div className="grid gap-[22px] sm:grid-cols-2 max-sm:gap-3">
              {[0, 1].map((i) => (
                <div key={i}>
                  <Shimmer className="h-[14px] w-[64px] max-sm:h-[19px]" />
                  <Shimmer className="mt-1.5 h-[44px] w-full rounded-[14px] max-sm:mt-1" />
                </div>
              ))}
            </div>
            <div>
              {[0, 1].map((i) => (
                <div key={i} className="flex min-h-[56px] items-center gap-3.5 border-t border-line px-1 max-sm:min-h-[48px]">
                  <ShimmerLine width="w-[44%]" className="h-[15px]" />
                  <span className="flex-1" />
                  <Shimmer className="h-[26px] w-[44px] rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Notifications: the heading and its one switch row. */}
          <div className={`${CARD} max-sm:pb-1.5`}>
            <Shimmer className="mb-2.5 h-[23px] w-[128px] max-sm:mb-2" />
            <div className="flex min-h-[56px] items-center border-t border-line px-1 max-sm:min-h-[48px]">
              <ShimmerLine width="w-[120px]" className="h-[15px]" />
              <span className="flex-1" />
              <Shimmer className="h-[26px] w-[44px] rounded-full" />
            </div>
          </div>

          {/* Account: the heading, the signed-in row, the two links. */}
          <div className={`${CARD} flex flex-col gap-[18px] max-sm:gap-2.5`}>
            <Shimmer className="h-[23px] w-[84px]" />
            <Shimmer className="h-[72px] w-full rounded-[16px]" />
            <div className="flex gap-2.5 border-t border-line pt-[18px] max-sm:flex-col max-sm:pt-2.5">
              <Shimmer className="h-[40px] w-[220px] rounded-full max-sm:h-[44px] max-sm:w-full" />
              <Shimmer className="h-[40px] w-[200px] rounded-full max-sm:h-[44px] max-sm:w-full" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
