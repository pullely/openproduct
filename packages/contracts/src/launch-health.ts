/**
 * Launch health (openproduct-worldclass PV1, carried into WC2 as PP6).
 *
 * A CHECKLIST, NOT A SCORE — WC-E's answer, and the whole design of this
 * module. Five observed facts, each ✓, ✗, a dash or withdrawn, each carrying
 * the moment it was read. There is NO total, NO number out of five, and
 * nothing on the estate orders by these: a checklist cannot be gamed into a
 * ranking and cannot be mistaken for a judgement about a person, while a
 * score can be both, and the first person to sort by it makes it both. The
 * contract test proves no ordering module imports this one.
 *
 * ONE INPUT IS REFUSED BY NAME. The audit's example — how fast a maintainer
 * answered the first bug report — is the most dangerous item on its list,
 * because it measures a person's availability rather than a product, and
 * availability tracks employment, timezone, caring responsibilities and
 * health. Nothing here may be a proxy for how much time somebody has. The
 * WC2 plan's own sentence for PP6 carried it (*first bug answered*); PV1's
 * refusal is the older and the stronger rule, and it wins. The item in its
 * place is PV1's: *tests present*.
 *
 * AN UNOBSERVED ITEM IS A DASH, NEVER AN UNTICKED BOX (OPC-C): an unticked
 * box is a claim. Three of the five — builds, README, tests — have nothing
 * observing them yet; they render as dashes with the sentence that says
 * which read will fill them, and they turn into ✓ or ✗ the day that read
 * lands, with no change to this page. A STALE ITEM RENDERS WITHDRAWN rather
 * than false (OPC-7), on the same horizon the observed frame uses.
 */
import type { FormulaId } from "./provenance.js";
import { OBSERVED_SIGNAL_FORMULA, signalWithdrawn } from "./observed.js";

export const LAUNCH_HEALTH_ITEMS = ["builds", "licence", "readme", "tests", "activity"] as const;
export type LaunchHealthItemId = (typeof LAUNCH_HEALTH_ITEMS)[number];

/** What "recent" means for the activity item. Ninety days, as the plan said. */
export const LAUNCH_HEALTH_ACTIVITY_DAYS = 90;

/**
 * Four states and no fifth. `yes` and `no` are answers the repository gave;
 * `unobserved` is a dash — nothing has read this yet; `withdrawn` is a
 * reading older than the horizon, still shown, struck through.
 */
export type LaunchHealthState = "yes" | "no" | "unobserved" | "withdrawn";

export interface LaunchHealthItem {
  readonly id: LaunchHealthItemId;
  readonly label: string;
  readonly state: LaunchHealthState;
  /** When it was read, or null for an item nothing reads yet. */
  readonly observedAt: string | null;
  /** The published rule behind the reading, where one exists (OPC-4). */
  readonly formula: FormulaId | null;
  /** One sentence for the hover: what was read, or what will read it. */
  readonly note: string;
}

export const LAUNCH_HEALTH_LABEL: Readonly<Record<LaunchHealthItemId, string>> = {
  builds: "Builds",
  licence: "Licence detectable",
  readme: "README present",
  tests: "Tests present",
  activity: `A commit within ${LAUNCH_HEALTH_ACTIVITY_DAYS} days`,
};

/** The sentence beside a dash: which read will fill it. */
export const LAUNCH_HEALTH_PENDING_NOTE: Readonly<Record<"builds" | "readme" | "tests", string>> = {
  builds: "Not observed yet — the repository's checks will be read with the ingestion sweep",
  readme: "Not observed yet — the repository's contents will be read with the ingestion sweep",
  tests: "Not observed yet — the repository's contents will be read with the ingestion sweep",
};

// OB5 (D4) — *Repo health*: the five facts are about the repository, and a
// build is not launched, it is built. The data keys and the `#health` anchor
// do not change.
export const LAUNCH_HEALTH_HEADING = "Repo health";

export const LAUNCH_HEALTH_NOTE =
  "Five facts read from the repository, each with the moment it was read. There is no total, and nothing on this site orders by them.";

/** Said in the open, because the omission is the decision. */
export const LAUNCH_HEALTH_REFUSED_NOTE =
  "Not measured, by decision: how quickly a maintainer answered a first bug report. That measures a person's time, not a product.";

export const LAUNCH_HEALTH_DISPUTE = "Dispute an item";

/**
 * The five items, for the public projection the page already holds.
 *
 * TOTAL OVER ITS INPUTS AND RETURNS NO NUMBER: every field is a word, a
 * moment or a sentence, and a caller that wanted a count would have to write
 * the loop itself — which is the point.
 */
export function launchHealth(
  profile: {
    observedAt: string | null;
    licence: string | null;
    lastCommitAt: string | null;
  },
  now: Date,
): LaunchHealthItem[] {
  const read = profile.observedAt;
  const withdrawn = read !== null && signalWithdrawn(read, now);
  const answered = (yes: boolean): LaunchHealthState =>
    read === null ? "unobserved" : withdrawn ? "withdrawn" : yes ? "yes" : "no";

  const recent =
    profile.lastCommitAt !== null &&
    now.getTime() - Date.parse(profile.lastCommitAt) <= LAUNCH_HEALTH_ACTIVITY_DAYS * 86_400_000;

  return [
    {
      id: "builds",
      label: LAUNCH_HEALTH_LABEL.builds,
      state: "unobserved",
      observedAt: null,
      formula: null,
      note: LAUNCH_HEALTH_PENDING_NOTE.builds,
    },
    {
      id: "licence",
      label: LAUNCH_HEALTH_LABEL.licence,
      state: answered(profile.licence !== null),
      observedAt: read,
      formula: OBSERVED_SIGNAL_FORMULA.licence,
      note:
        read === null
          ? "Not read yet"
          : profile.licence
            ? `The repository declares ${profile.licence}`
            : "The repository declares no licence GitHub recognises",
    },
    {
      id: "readme",
      label: LAUNCH_HEALTH_LABEL.readme,
      state: "unobserved",
      observedAt: null,
      formula: null,
      note: LAUNCH_HEALTH_PENDING_NOTE.readme,
    },
    {
      id: "tests",
      label: LAUNCH_HEALTH_LABEL.tests,
      state: "unobserved",
      observedAt: null,
      formula: null,
      note: LAUNCH_HEALTH_PENDING_NOTE.tests,
    },
    {
      id: "activity",
      label: LAUNCH_HEALTH_LABEL.activity,
      state: answered(recent),
      observedAt: read,
      formula: OBSERVED_SIGNAL_FORMULA.lastCommit,
      note:
        read === null
          ? "Not read yet"
          : profile.lastCommitAt
            ? `Last commit ${profile.lastCommitAt.slice(0, 10)}`
            : "No commit date was read",
    },
  ];
}
