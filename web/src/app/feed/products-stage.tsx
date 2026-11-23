import { FOCUS } from "../ui/design";
import { AppLink } from "../ui/link";

import {
  PRODUCT_STAGE_FILTERS,
  PRODUCT_STAGE_FILTER_LABEL,
  productsPath,
  type ProductSort,
  type ProductStageCounts,
  type ProductStageFilter,
} from "./products";

/**
 * The Products page's stage filter (openproduct-redesign OPR-3; boards
 * `Products`, `PhoneProducts`): Everything, then the four stages (SC-2) —
 * Ideas, Building, On stage, In production — each with how many there are.
 *
 * LINKS, NOT A WIDGET — the sort control's rule. Each filter is an address
 * (`productsPath(sort, stage)`), so it works with no JavaScript, the page it
 * goes to is one static document, and the current one carries
 * `aria-current`. A client-side filter would narrow only the cards the page
 * happens to hold.
 *
 * ONE LIST, TWO DRAWINGS: a card of rows in the left column from `md` up (a
 * 32px tile in the stage's colour, the word, the count); a row of five 44px
 * pills on a phone, the current one in ink, scrolling sideways inside its
 * own row when they do not fit (the page itself never scrolls sideways).
 *
 * A COUNT THAT COULD NOT BE READ IS NOT DRAWN: a zero would be a claim.
 */
/** Each stage's glyph, as the Change stage popup draws it (board `Stage`). */
const GLYPH: Record<ProductStageFilter, string> = {
  all: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  idea: "M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0012 3z",
  building: "M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  stage: "M8 5v14l11-7z",
  production: "M5 12l5 5 9-10",
};

/** A colour here is a KIND (design §3): ink is everything, and each stage
 *  wears its own (SC-2, design §1.1) — lavender, amber, slate, green. */
export function StageFilter({
  current,
  sort,
  counts,
}: {
  current: ProductStageFilter;
  /** The sort the page is on: a filter keeps it. */
  sort: ProductSort;
  counts: ProductStageCounts | null;
}) {
  return (
    <nav
      aria-label="Product stages"
      data-product-stages
      className="flex flex-row flex-wrap gap-1.5 max-sm:-mx-3 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-3 max-sm:[scrollbar-width:none]"
    >
      <div className="sr-only">Stage</div>
      {PRODUCT_STAGE_FILTERS.map((stage) => {
        const on = stage === current;
        return (
          <AppLink
            key={stage}
            href={productsPath(sort, stage)}
            {...(on ? { "aria-current": "page" as const } : {})}
            data-product-stage-option={stage}
            className={`flex min-h-[40px] flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] no-underline transition-colors max-sm:min-h-[44px] ${
              on ? "bg-secondary font-semibold text-foreground" : "font-medium text-foreground hover:bg-accent"
            } ${FOCUS}`}
          >
            <span aria-hidden="true" className="grid shrink-0 place-items-center text-muted-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d={GLYPH[stage]} />
              </svg>
            </span>
            <span>{PRODUCT_STAGE_FILTER_LABEL[stage]}</span>
            {counts === null ? null : (
              <span
                className={`text-[12px] ${
                  on ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {counts[stage]}
              </span>
            )}
          </AppLink>
        );
      })}
    </nav>
  );
}
