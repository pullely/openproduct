/**
 * Rank marks (openproduct-worldclass-v2 PP4).
 *
 * THE BENCHMARK CONFERS; THIS DERIVES. Product Hunt's product page carries
 * badges — *#1 Product of the Day*, *Golden Kitty* — some of which are a
 * board's output and some of which a person awarded. The design (WC2 §PP)
 * keeps the first kind and refuses the second by construction: every mark
 * here is a pure function of a board row the sweep already published, with
 * the formula that produced the row linked from the mark. There is no table
 * of awards, no field a person can set, and no mark this module can emit
 * without a placement to emit it from.
 *
 * THREE MARKS, EACH FROM ONE BOARD.
 *
 *   #1 today          the day's board, while the day is today (OL2's own
 *                     `isFirstToday` rule, applied to the placement)
 *   #N on 9 Sept      the day's board, after the day — and only the podium,
 *                     because a permanent pill saying *#9 on 9 Sept* is a
 *                     claim nobody would make about themselves, and the
 *                     ordinal is on the facts card for every rank anyway
 *   Top of the week   the weekly leaderboard, while the launch is inside its
 *                     seven-day window and first on it
 *
 * WHAT THE CARD CARRIES. `og.ts` says a share card carries only what does
 * not rot. *#1 today* rots at midnight and *Top of the week* rots with the
 * window; *#N on 9 Sept* is a dated fact and stays true. `cardMark` therefore
 * hands the card the dated form only, for a podium rank, whatever day it is.
 */
import type { PublicLaunchPlacement } from "./index.js";
import type { FormulaId } from "./provenance.js";
import { BOARD_FORMULA, type BoardDay, parseDayId } from "./board.js";
import { LEADERBOARD_FORMULA, leaderboardPath } from "./leaderboard.js";

export type RankMarkKind = "today" | "day" | "week";

export interface RankMark {
  readonly kind: RankMarkKind;
  /** The words on the pill. */
  readonly label: string;
  /** Where the pill goes: the board that produced it. */
  readonly href: string;
  /** The published rule behind the number (OPC-4). */
  readonly formula: FormulaId;
  /** The hover: what was counted, so the mark is checkable in place. */
  readonly title: string;
}

/** The highest rank that earns a dated mark after its day. */
export const RANK_MARK_PODIUM = 3;

/** `9 Sept`, from a day id — short enough for a pill, unambiguous in UTC. */
export function shortDayLabel(dayId: string): string {
  const parsed = parseDayId(dayId);
  if (!parsed.ok) return dayId;
  const { year, month, day } = parsed.day;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function countedTitle(launch: PublicLaunchPlacement): string {
  return `${launch.counted} upvotes counted on ${launch.day}${
    launch.ineligible > 0 ? `, and ${launch.ineligible} from accounts younger than the launch` : ""
  }`;
}

/**
 * The marks a placement earns, in the order the hero wears them.
 *
 * NO PLACEMENT, NO MARK — and never a mark for a rank the podium rule does
 * not admit. The function is total over its inputs and never throws: a
 * placement the page cannot decorate is simply a placement with no pills.
 */
export function rankMarks(
  launch: PublicLaunchPlacement | null | undefined,
  today: BoardDay,
): readonly RankMark[] {
  if (!launch) return [];
  const marks: RankMark[] = [];
  const dayHref = `/launches/${launch.day}`;
  if (launch.day === today.id) {
    if (launch.rank === 1) {
      marks.push({
        kind: "today",
        label: "#1 today",
        href: dayHref,
        formula: BOARD_FORMULA,
        title: `First on today's board — ${countedTitle(launch)}`,
      });
    }
  } else if (launch.rank <= RANK_MARK_PODIUM) {
    marks.push({
      kind: "day",
      label: `#${launch.rank} on ${shortDayLabel(launch.day)}`,
      href: dayHref,
      formula: BOARD_FORMULA,
      title: `${ordinalWord(launch.rank)} of ${launch.of} that day — ${countedTitle(launch)}`,
    });
  }
  if (launch.week && launch.week.rank === 1) {
    marks.push({
      kind: "week",
      label: "Top of the week",
      href: leaderboardPath("week"),
      formula: LEADERBOARD_FORMULA,
      title: `First of ${launch.week.of} on the leaderboard for ${launch.week.from} to ${launch.week.to}`,
    });
  }
  return marks;
}

/** What the share card carries: the dated podium mark, or nothing. */
export function cardMark(launch: PublicLaunchPlacement | null | undefined): string | null {
  if (!launch || launch.rank > RANK_MARK_PODIUM) return null;
  return `#${launch.rank} on ${shortDayLabel(launch.day)}`;
}

function ordinalWord(rank: number): string {
  return rank === 1 ? "First" : rank === 2 ? "Second" : rank === 3 ? "Third" : `#${rank}`;
}
