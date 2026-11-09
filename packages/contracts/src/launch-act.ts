// The act of launching, named where its absence shows
// (openproduct-worldclass-v2 CF5).
//
// W·05 found three empty states — the board, the leaderboard, a person's
// `0 launched` — that each described the SWEEP ("has not been counted yet")
// when what the reader was looking at was the absence of an ACT. Five
// listings were published; none had been launched, because launching is a
// separate thing a maintainer does (LC0), and nothing on those pages said so.
// A reader took the quiet for a fault, and a maintainer never learned there
// was a button.
//
// So the sentence lives here, once, and the three states and the studio's
// checklist all say the same one and link the same place. The place is the
// docs section LC0 already wrote; HB1 pointed at it "until CF5 moves it", and
// CF5 chose not to move it — a second page saying what `/docs#launching`
// says would be two addresses for one rule.
//
// NOT A "LAUNCH NOW" BUTTON. A launch fires because its moment arrived
// (`core/src/handlers/launches.ts`); the studio schedules, the sweep fires.
// The checklist's last row therefore links the scheduler, not an act.

import { listingBasePath } from "./intake.js";

/** The fact, in one sentence. Every surface that names the act says this. */
export const LAUNCH_ACT_NOTE = "A listing launches when its maintainer says so.";

/** Where "how launching works" is written down. One address, four surfaces. */
export const LAUNCH_HOW_HREF = "/docs#launching";

export const LAUNCH_HOW_LABEL = "How launching works";

/** The checklist's last row — the plan's own words. */
export const LAUNCH_STEP_LABEL = "Launch it";

/** What sits beside that row, so a maker who has filled everything in knows
 *  the list ending is not the listing launching. */
export const LAUNCH_STEP_NOTE =
  "Publishing puts it in the directory. Launching puts it on the board, on a morning you choose.";

/** The studio scheduler's address — LC0's page, on IN1's strip. */
export function launchStepHref(org: string, profile: string): string {
  return `${listingBasePath(org, profile)}/launches`;
}

// ─── OB6 — the checklist ends at Publish ───
//
// A build is published, not launched: the studio's checklist used to end
// with "Launch it", the act of a launch site. OB6 ends it with the act that
// puts a build on Open builds. The launch scheduler is still at its address
// (`launchStepHref`) for anyone holding the link; it left the strip.

/** The checklist's last row (OB6). */
export const PUBLISH_STEP_LABEL = "Publish it";

/** The overview's publish panel — where the act is. */
export function publishStepHref(org: string, profile: string): string {
  return `${listingBasePath(org, profile)}#publish`;
}
