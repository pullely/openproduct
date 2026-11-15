import type { MilestoneCounts, ProductStage } from "@openproduct/contracts";

import {
  IDEA_NEEDS_BUILDER,
  PROGRESS_SEGMENT_LIMIT,
  isBuilt,
  milestoneProgress,
  progressSegments,
  stageMarkText,
  stageWord,
  usableCounts,
} from "./stage";
import { STAGE_TONE } from "./stage-tone";

/**
 * The milestone progress segments (openproduct-redesign OPR-3; boards `Feed`,
 * `Products`, `Product`): one bar per milestone, the shipped ones in the
 * amber run, the rest in the sunken fill. 5px tall, 4px on a phone.
 *
 * NOTHING WHEN THERE IS NOTHING TO COUNT — a product with no milestones draws
 * no bar, never an empty track. The bars are decoration: the same fact is
 * said in words (`3 of 4`) by the mark or the line beside them, so the group
 * carries a label and the bars none.
 */
export function MilestoneSegments({
  counts,
  className = "",
}: {
  counts: MilestoneCounts | null | undefined;
  className?: string;
}) {
  const usable = usableCounts(counts);
  if (!usable) return null;
  const label = `${milestoneProgress(usable)} milestones shipped`;
  const shipped = "bg-[linear-gradient(90deg,oklch(var(--brand-amber)),oklch(var(--brand-amber-inverted)))]";
  if (usable.total > PROGRESS_SEGMENT_LIMIT) {
    const percent = Math.round((usable.shipped / usable.total) * 100);
    return (
      <div
        role="img"
        aria-label={label}
        data-milestone-segments
        className={`h-[5px] overflow-hidden rounded-[3px] bg-sunken max-sm:h-1 ${className}`}
      >
        <div className={`h-full rounded-[3px] ${shipped}`} style={{ width: `${percent}%` }} />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={label}
      data-milestone-segments
      className={`flex gap-1 max-sm:gap-[3px] ${className}`}
    >
      {progressSegments(usable).map((done, index) => (
        <span
          key={index}
          className={`h-[5px] flex-1 rounded-[3px] max-sm:h-1 max-sm:rounded-[2px] ${done ? shipped : "bg-sunken"}`}
        />
      ))}
    </div>
  );
}

/**
 * The stage mark (boards `Products`, `Feed`): the mono label a card or a
 * post wears to say where the product is, in its stage's ink (SC-2).
 *
 *   built     `BUILDING · 3 OF 4`, `ON STAGE · 3 OF 4`, `IN PRODUCTION`
 *             (the stage alone with no milestones to count)
 *   idea      `AN IDEA, NOT BUILT YET` in the lavender — `IDEA` when `short`
 *
 * `bars` draws the progress segments under a built product's mark, and under
 * an idea's the dashed ring and `Needs a first builder` (board `Products`).
 */
export function StageMark({
  stage,
  counts,
  short = false,
  bars = false,
  className = "",
}: {
  stage: ProductStage;
  counts?: MilestoneCounts | null;
  short?: boolean;
  bars?: boolean;
  className?: string;
}) {
  const mark = (
    <span
      data-stage-mark={stage}
      className={`font-mono text-mono-label uppercase ${STAGE_TONE[stage].ink} ${bars ? "" : className}`}
    >
      {stageMarkText(stage, counts, { short })}
    </span>
  );
  if (!bars) return mark;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {mark}
      {isBuilt(stage) ? (
        <MilestoneSegments counts={counts} />
      ) : (
        <span className="flex items-center gap-1.5 text-[13px] text-idea">
          <span aria-hidden="true" className="box-border h-3 w-3 rounded-full border-[1.5px] border-dashed border-idea" />
          {IDEA_NEEDS_BUILDER}
        </span>
      )}
    </div>
  );
}

/**
 * The stage as a word beside a name (boards `Search`, the header card): a
 * 7px dot and `On stage`, in the stage's own colour.
 */
export function StageWord({ stage, className = "" }: { stage: ProductStage; className?: string }) {
  const tone = STAGE_TONE[stage];
  return (
    <span
      data-stage-word={stage}
      className={`inline-flex shrink-0 items-center gap-[5px] text-[13px] font-medium ${tone.ink} ${className}`}
    >
      <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${tone.dot}`} />
      {stageWord(stage)}
    </span>
  );
}
