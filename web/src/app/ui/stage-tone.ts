// Each stage's colour (openproduct-stages-crew SC-2, design §1.1): lavender
// for an idea, amber for building, slate for on stage, green for in
// production — no red, which is for danger only.
//
// Its own module, apart from `stage.ts`: that one is in every page's bundle
// through the header search, and these class strings are drawn only by the
// stage's marks, badges and the Where it runs strip.

import type { ProductStage } from "@openproduct/contracts";

/** The classes a stage is drawn in: its ink (text), its dot (a fill) and its
 *  soft ground (a pill's background). */
export interface StageTone {
  readonly ink: string;
  readonly dot: string;
  readonly soft: string;
}

export const STAGE_TONE: Readonly<Record<ProductStage, StageTone>> = {
  idea: { ink: "text-idea", dot: "bg-idea", soft: "bg-idea-soft" },
  building: { ink: "text-amber-ink", dot: "bg-amber", soft: "bg-amber-soft" },
  stage: { ink: "text-version", dot: "bg-version", soft: "bg-version-soft" },
  production: { ink: "text-success", dot: "bg-success", soft: "bg-success-soft" },
};
