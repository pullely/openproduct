// A product's stage, in words (openproduct-redesign OPR-3; openproduct-stages-
// crew SC-2, design §1).
//
// FOUR STAGES, set by the crew one step at a time: IDEA, BUILDING, ON STAGE,
// IN PRODUCTION. Lists say which: a word beside a name (the search rows), a
// mono mark over a card (`ON STAGE · 3 OF 4`), a line under a profile's
// product (`on stage, 3 of 4`). Every one of those strings is built here, so
// a list cannot spell the stage its own way.
//
// ONE COLOUR PER STAGE (design §1.1; no red unless it is danger): lavender
// for an idea, amber for building, slate for on stage, green for in
// production — `STAGE_TONE`, in `stage-tone.ts`, so the header search's
// bundle (which reads this file) does not carry the class strings.
//
// PURE, AND NO JSX: the web test lane is module-level, and the header search's
// row model (`shell/palette-rows.ts`) imports this from a module that must
// stay compilable without React. The drawn pieces are in `stage-mark.tsx`.

import {
  PRODUCT_STAGE_LABELS,
  isProductStage,
  type MilestoneCounts,
  type ProductStage,
} from "@openproduct/contracts";

/** Whether the product has been built at all — every stage but an idea.
 *  These draw progress bars and the tabbed product page. Spelt here rather
 *  than imported: this module is in every page's bundle (the header search
 *  reads it), so it carries only what a word needs. */
export function isBuilt(stage: ProductStage): boolean {
  return stage !== "idea";
}

/** `On stage` / `Idea` — the word a row wears. */
export function stageWord(stage: ProductStage): string {
  return PRODUCT_STAGE_LABELS[stage];
}

/**
 * The same word for a value that came off the wire and may not be a stage at
 * all (a gateway deployed before OPR-3 sends none). Null when it is not one:
 * the row then says nothing rather than guessing.
 */
export function stageWordOf(stage: unknown): string | null {
  return isProductStage(stage) ? PRODUCT_STAGE_LABELS[stage] : null;
}

/** Milestone counts worth drawing: a real total, and shipped within it. */
export function usableCounts(counts: MilestoneCounts | null | undefined): MilestoneCounts | null {
  if (!counts) return null;
  const { shipped, total } = counts;
  if (!Number.isInteger(total) || !Number.isInteger(shipped)) return null;
  if (total <= 0 || shipped < 0) return null;
  return { shipped: Math.min(shipped, total), total };
}

/** `3 of 4`, or null when the product has no milestones to count. */
export function milestoneProgress(counts: MilestoneCounts | null | undefined): string | null {
  const usable = usableCounts(counts);
  return usable ? `${usable.shipped} of ${usable.total}` : null;
}

/** What an idea's mark says: nothing has been built. */
export const IDEA_MARK = "An idea, not built yet";
/** The short form, where the long one does not fit (a product card). */
export const IDEA_MARK_SHORT = "Idea";
/** The line under an idea's mark in a list. */
export const IDEA_NEEDS_BUILDER = "Needs a first builder";

/**
 * Whether an idea's crew is only its maker: at most one person on it.
 *
 * FROM A COUNT SOMEBODY MADE. `null` or anything that is not a number (a
 * card that predates the count) answers false: "needs a first builder" is a
 * claim about a crew, and it is not made of one nobody counted.
 */
export function needsFirstBuilder(crewCount: number | null | undefined): boolean {
  return typeof crewCount === "number" && Number.isFinite(crewCount) && crewCount <= 1;
}

/**
 * The mono mark, in sentence case (the mark's class uppercases it):
 * `On stage · 3 of 4`, `Building` when there is nothing to count,
 * `An idea, not built yet` — or `Idea` when `short`.
 */
export function stageMarkText(
  stage: ProductStage,
  counts?: MilestoneCounts | null,
  options: { short?: boolean } = {},
): string {
  if (stage === "idea") return options.short ? IDEA_MARK_SHORT : IDEA_MARK;
  const progress = milestoneProgress(counts);
  return progress ? `${PRODUCT_STAGE_LABELS[stage]} · ${progress}` : PRODUCT_STAGE_LABELS[stage];
}

/** The lower-case line a profile's product row carries: `on stage, 3 of 4`,
 *  `building`, `idea`. */
export function stageLine(stage: ProductStage, counts?: MilestoneCounts | null): string {
  const word = PRODUCT_STAGE_LABELS[stage].toLowerCase();
  const progress = isBuilt(stage) ? milestoneProgress(counts) : null;
  return progress ? `${word}, ${progress}` : word;
}

/** One segment per milestone, the shipped ones first: `[true, true, true, false]`. */
export function progressSegments(counts: MilestoneCounts | null | undefined): boolean[] {
  const usable = usableCounts(counts);
  if (!usable) return [];
  return Array.from({ length: usable.total }, (_, index) => index < usable.shipped);
}

/** The most segments a bar draws. A product with more milestones than this
 *  gets one proportional bar instead of sixty slivers. */
export const PROGRESS_SEGMENT_LIMIT = 12;
