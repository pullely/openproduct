// A person's marks (openproduct-worldclass-v2 PE2).
//
// THREE MARKS, EACH DERIVED, EACH LINKING ITS FORMULA. *First launch* — the
// day a listing they maintain first went live; *Clean vote* — a listing they
// maintain earned PV3's mark; *Maintains N* — how many public listings they
// run. Nothing here is conferred: every mark is a function of a read the
// page already makes, and a mark that could not name its input does not
// render. The same rule PP4's rank marks follow, for the same reason — a
// badge is a claim about a person, and a claim with nowhere to check it is
// a decoration.
//
// NO MARK IS A SCORE. "Maintains 3" is a count with its formula beside it,
// like the header's counters; "Clean vote" is a fact about a listing, not a
// grade for the person; "First launch" is a date. None of them orders
// anybody anywhere.

import { PROFILE_STAT_FORMULAS } from "./profiles.js";
import type { FormulaId } from "./provenance.js";
import { shortDayLabel } from "./marks.js";

export const MAKER_MARK_KINDS = ["first-launch", "clean-vote", "maintains"] as const;
export type MakerMarkKind = (typeof MAKER_MARK_KINDS)[number];

/** What the marks are derived from — the inputs travel on the wire, never the marks. */
export interface MakerMarkInputs {
  /** `YYYY-MM-DD` of the earliest live launch of a listing they maintain, or null. */
  readonly firstLaunchDay: string | null;
  /** How many listings they maintain carry PV3's clean-vote mark. */
  readonly cleanVoteListings: number;
  /** How many public listings they maintain. */
  readonly maintains: number;
}

export const MAKER_MARK_INPUT_KEYS = ["firstLaunchDay", "cleanVoteListings", "maintains"] as const;

export interface MakerMark {
  readonly kind: MakerMarkKind;
  readonly label: string;
  readonly formula: FormulaId;
  /** The input, in words — what a reader is told the mark is made of. */
  readonly input: string;
}

export const MAKER_MARK_FORMULAS: Record<MakerMarkKind, FormulaId> = {
  "first-launch": "maker.first-launch",
  "clean-vote": "votes.clean",
  maintains: PROFILE_STAT_FORMULAS.maintains,
};

/** The marks a person has earned, from the inputs. Pure. */
export function makerMarks(inputs: MakerMarkInputs): readonly MakerMark[] {
  const out: MakerMark[] = [];
  if (inputs.firstLaunchDay !== null && /^\d{4}-\d{2}-\d{2}$/.test(inputs.firstLaunchDay)) {
    out.push({
      kind: "first-launch",
      label: "First launch",
      formula: MAKER_MARK_FORMULAS["first-launch"],
      input: `A listing they maintain first went live on ${shortDayLabel(inputs.firstLaunchDay)}.`,
    });
  }
  if (inputs.cleanVoteListings > 0) {
    out.push({
      kind: "clean-vote",
      label: "Clean vote",
      formula: MAKER_MARK_FORMULAS["clean-vote"],
      input:
        inputs.cleanVoteListings === 1
          ? "A listing they maintain earned the clean-vote mark."
          : `${inputs.cleanVoteListings} listings they maintain earned the clean-vote mark.`,
    });
  }
  if (inputs.maintains > 0) {
    out.push({
      kind: "maintains",
      label: `Maintains ${inputs.maintains}`,
      formula: MAKER_MARK_FORMULAS.maintains,
      input:
        inputs.maintains === 1
          ? "They maintain one public listing."
          : `They maintain ${inputs.maintains} public listings.`,
    });
  }
  return out;
}

/** The one mark a card carries: the first earned, or none. A card has room
 *  for one claim, and "First launch" is the durable one. */
export function makerCardMark(inputs: MakerMarkInputs): string | null {
  return makerMarks(inputs)[0]?.label ?? null;
}
