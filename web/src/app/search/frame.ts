// The search page's column (openproduct-redesign OPR1, boards `Search` and
// `PhoneSearch`), in one place so the page and its skeleton cannot disagree
// about it — a skeleton in a different frame is a layout shift the moment
// the results land.

/** A 760px column, `40px 24px 72px`, its blocks 26px apart; on a phone
 *  `10px 12px` with 10px between (the tab bar's reserve is the shell's). */
export const SEARCH_COLUMN =
  "mx-auto box-border flex w-full max-w-[760px] flex-col gap-[26px] px-6 pb-[72px] pt-10 max-sm:gap-[10px] max-sm:px-3 max-sm:pb-6 max-sm:pt-[10px]";

/** The flat card a section's rows sit in: `6px 8px` inside; `4px 12px` on a
 *  phone, where the rows run edge to edge. */
export const RESULT_CARD = "m-0 list-none rounded-[16px] bg-card px-2 py-[6px] max-sm:px-3 max-sm:py-1";
