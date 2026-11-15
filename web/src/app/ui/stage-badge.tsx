import { PRODUCT_STAGE_MARKS, type MilestoneCounts, type ProductStage } from "@openproduct/contracts";

import { isBuilt, milestoneProgress } from "./stage";
import { STAGE_TONE } from "./stage-tone";

/**
 * The stage badge (boards `Product`, `Stage`; SC-2): a 26px pill on the
 * stage's soft ground, an 8px dot and the mono word — `ON STAGE`, with
 * `· 3 OF 4` when `counts` has milestones to count. Beside the product's name
 * in the header, and in the Stage row inside Edit details.
 */
export function StageBadge({
  stage,
  counts = null,
  className = "",
}: {
  stage: ProductStage;
  counts?: MilestoneCounts | null;
  className?: string;
}) {
  const tone = STAGE_TONE[stage];
  const progress = isBuilt(stage) ? milestoneProgress(counts) : null;
  return (
    <span
      data-stage-badge={stage}
      className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-2.5 font-mono text-mono-label uppercase ${tone.soft} ${tone.ink} ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
      {progress ? `${PRODUCT_STAGE_MARKS[stage]} · ${progress}` : PRODUCT_STAGE_MARKS[stage]}
    </span>
  );
}
