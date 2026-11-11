// The answer to an act (openproduct-commons TS5).
//
// TS-4 in one sentence: EVERY MODERATION ACT IS APPEALABLE AND COUNTED IN
// PUBLIC. The first half is this module; the second is `transparency.ts`, and
// they were written together because either alone is the failure mode of the
// other. An appeal path nobody counts is a mailbox; a published number with
// no appeal path behind it is a statistic about people who had no say.
//
// ─── AN APPEAL NAMES AN ACT, NOT A THING ──────────────────────────────────
//
// A listing delisted in March and removed in June has been acted on twice.
// An appeal "about the listing" cannot say which decision it disputes, so an
// upheld one cannot say what to put back. Naming the act makes the reversal
// mechanical rather than a judgement call at decision time — and 1330 paired
// the whole act vocabulary (remove/restore, delist/relist, deindex/reindex)
// for exactly this moment, with the note that "an act that cannot be undone
// in the same vocabulary is an act TS5's report cannot show the reversal of".
//
// ─── THE PART THAT IS EASY TO GET WRONG ───────────────────────────────────
//
// An appeal surface is trivially turned into a second moderation queue with
// worse manners: unbounded, argumentative, and reachable by anyone. Three
// rules keep it from becoming one, and each costs something real:
//
//   STANDING     only the person the act affected may appeal it. Not
//                a bystander who disagrees, not the reporter. The cost is
//                that a genuinely wrong removal of somebody else's work
//                cannot be appealed by a friend — and the alternative is a
//                surface where any signed-in account can demand a re-hearing
//                of any decision about anybody, which is a brigading tool.
//
//   ONE ATTEMPT  a refused appeal cannot be re-filed. The cost is that
//                somebody who argued badly the first time has no second go.
//                The alternative is a queue one determined person can occupy
//                forever, which takes the hearing away from everybody else.
//
//   AN ARGUMENT  `says` is required and bounded. The cost is friction. The
//                benefit is that the person deciding has something to be
//                persuaded by — an appeal with no argument makes refusal the
//                path of least resistance, and a form that permits one is a
//                form that produces mostly those.
//
// None of the three is comfortable. All three are written down here rather
// than discovered later in a handler, because a rule with no stated cost is
// a rule somebody removes the first time it is inconvenient.

import type { ModerationAct } from "./trust.js";

// ---------------------------------------------------------------------------
// What can be appealed
// ---------------------------------------------------------------------------

/**
 * The acts a person may appeal, and what undoes each one.
 *
 * A MAP RATHER THAN A LIST, because "is this appealable" and "what would
 * upholding it do" are the same question asked twice, and answering them from
 * two constants is how they come to disagree. The handler reads the value; a
 * missing key IS the refusal.
 *
 * `lock` and `trust_demote` are in 1330's vocabulary and deliberately absent
 * here: nothing on the estate takes either act yet, and an appeal path for an
 * act nobody can take is a branch no test can reach and no reader can trust.
 * The day a milestone starts locking threads, its pair belongs in this table
 * and a test below will be the thing that notices it is missing.
 */
export const APPEAL_REVERSAL: Partial<Record<ModerationAct, ModerationAct>> = {
  remove: "restore",
  delist: "relist",
  deindex: "reindex",
};

export const APPEALABLE_ACTS: readonly ModerationAct[] = Object.keys(
  APPEAL_REVERSAL,
) as ModerationAct[];

export function actIsAppealable(act: ModerationAct): boolean {
  return APPEAL_REVERSAL[act] !== undefined;
}

export function reversalOf(act: ModerationAct): ModerationAct | null {
  return APPEAL_REVERSAL[act] ?? null;
}

/**
 * Why the rest of the vocabulary is not here, published rather than implied.
 *
 * A person told "that cannot be appealed" and given no reason has been
 * refused twice. Each of these is a real class with a real answer, and the
 * third one is the only one where the answer is "you already have a better
 * route" rather than "there is nothing to appeal".
 */
export const NOT_APPEALABLE = [
  {
    acts: ["restore", "relist", "reindex", "unlock", "trust_promote"] as const,
    because:
      "These undo an earlier act. Nobody was harmed by them — they are the outcome an appeal asks for.",
  },
  {
    acts: ["appeal_upheld", "appeal_refused"] as const,
    because:
      "An appeal against the outcome of an appeal has no end. One hearing is what this promises, and a second one would only ever be granted to whoever asked most often.",
  },
  {
    acts: ["lock", "trust_demote"] as const,
    because:
      "Nothing on openproduct takes these acts yet. They exist in the record's vocabulary so that a future one has a name and an undo waiting for it, and the day anything starts locking a discussion or restricting an account, the appeal against it lands here with the rest — that is not a promise held in a document, it is a test that fails the moment the act becomes reachable.",
  },
  {
    acts: ["report_declined"] as const,
    because:
      "The person affected is the reporter, and they already have a better route: a declined report can simply be filed again, with what was missing the first time. A second channel for the same request would double the queue and give a reporter a standing conversation about somebody else's listing.",
  },
] as const;

// ---------------------------------------------------------------------------
// The appeal itself
// ---------------------------------------------------------------------------

export const APPEAL_STATES = ["open", "upheld", "refused"] as const;
export type AppealState = (typeof APPEAL_STATES)[number];

/**
 * What the appellant sees about their own appeal.
 *
 * NO DECIDER AND NO OUTCOME REASON. The person who decided is an individual
 * whose name would turn a disagreement about a listing into a disagreement
 * about a person, and the estate answers for its decisions in aggregate, at
 * `/transparency`, where the asymmetry is bearable. What the appellant gets
 * is the fact, the date, and — when it is upheld — the thing actually being
 * back, which is the only part of an outcome that can be checked.
 */
export interface AppealView {
  readonly id: string;
  readonly actId: string;
  readonly act: ModerationAct;
  readonly subjectKind: string;
  readonly subjectRef: string;
  readonly says: string;
  readonly state: AppealState;
  readonly filedAt: string;
  readonly decidedAt: string | null;
  /** Whether the act was actually undone. Null while open. */
  readonly reversed: boolean | null;
}

export const APPEAL_VIEW_KEYS = [
  "id",
  "actId",
  "act",
  "subjectKind",
  "subjectRef",
  "says",
  "state",
  "filedAt",
  "decidedAt",
  "reversed",
] as const;

/**
 * One act taken against something the reader maintains, with the appeal
 * standing beside it.
 *
 * THIS CARRIES THE ACT'S REASON, and it is the only surface on the estate
 * that does. The tombstone deliberately does not (TS3: a reason is a
 * judgement about a person, published at their own address, before they have
 * answered it) — but the person appealing has to know what they are answering,
 * and telling them "something was decided, argue with it" is not a hearing.
 * The asymmetry is the point: the reason is private to the person it is about.
 */
export interface AppealableAct {
  readonly actId: string;
  readonly act: ModerationAct;
  readonly subjectKind: string;
  readonly subjectRef: string;
  readonly reason: string;
  readonly occurredAt: string;
  readonly appealable: boolean;
  /** Their appeal, if they have filed one. */
  readonly appeal: AppealView | null;
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/** The same shape as a triager's reason: long enough to be an argument,
 *  short enough that the box is not a place to put a manifesto. */
export const MIN_APPEAL_SAYS = 20;
export const MAX_APPEAL_SAYS = 2000;

export function appealSaysIsAcceptable(says: string): boolean {
  const trimmed = says.trim();
  return trimmed.length >= MIN_APPEAL_SAYS && trimmed.length <= MAX_APPEAL_SAYS;
}

/** How many appeals one queue read returns. Bounded like every list here. */
export const MAX_APPEAL_QUEUE = 100;

/** How many acts the "what was done to my listings" read walks back. */
export const MAX_APPEALABLE_ACTS = 200;

// ---------------------------------------------------------------------------
// What is said
// ---------------------------------------------------------------------------

export const APPEAL_INVITATION =
  "If you think this was wrong, say so. A person will read it, and whatever they decide is counted in the public record.";

export const APPEAL_SAYS_LABEL = "What we got wrong";

export const APPEAL_SAYS_HINT =
  "The person deciding has the listing and the reason in front of them. What they do not have is your side of it.";

export const APPEAL_ONE_ATTEMPT_NOTE =
  "One appeal per decision. Take the time to say everything — you will not get a second attempt at the same act, because a queue that can be re-entered is a queue somebody can occupy.";

export const APPEAL_STANDING_NOTE =
  "Only the people who maintain a listing can appeal a decision about it. Not because a bystander is wrong, but because an appeal anybody can file about anybody is a way to attack a queue rather than a way to be heard.";

export const APPEAL_STATE_COPY: Record<AppealState, { title: string; says: string }> = {
  open: {
    title: "Waiting to be read",
    says:
      "Nobody has decided yet. Appeals are worked oldest first, so this will be read in the order it arrived and not in the order anybody shouts.",
  },
  upheld: {
    title: "Upheld — the decision was wrong",
    says:
      "The act has been reversed and the reversal is on the record, next to the act it undid. Both are counted at /transparency.",
  },
  refused: {
    title: "Refused — the decision stands",
    says:
      "This was read by a person and the original act stands. Refusals are counted publicly too: an estate that publishes only the appeals it granted is publishing a boast.",
  },
};

/** What an upheld appeal says when there was nothing left to reverse — the
 *  act had already been undone while the appeal waited. Its own sentence,
 *  because "upheld" with no visible change looks like a bug otherwise. */
export const APPEAL_UPHELD_ALREADY_REVERSED =
  "Upheld. The act had already been undone before this was read, so there was nothing left to reverse — but the judgement stands and is counted.";

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type AppealRefusalReason =
  | "not-appealable"
  | "no-standing"
  | "unknown-act"
  | "already-appealed"
  | "already-open"
  | "already-decided"
  | "says-required"
  | "not-an-operator";

export const APPEAL_REFUSALS: Record<AppealRefusalReason, { says: string }> = {
  "not-appealable": {
    says:
      "That act cannot be appealed. Either it undid something rather than doing it, or it was itself the outcome of an appeal.",
  },
  "no-standing": {
    says: APPEAL_STANDING_NOTE,
  },
  "unknown-act": {
    says: "There is no record of that decision.",
  },
  "already-appealed": {
    says:
      "You have already appealed this decision. One appeal per act — see the note beside the form for why.",
  },
  "already-open": {
    says:
      "Somebody else who maintains this listing has already appealed this decision, and it is waiting to be read. One appeal per decision — two people arguing the same one separately is two people asking one question, and the second would be read against a decision the first had already moved.",
  },
  "already-decided": {
    says: "Somebody has already decided this appeal.",
  },
  "says-required": {
    says:
      "An appeal needs an argument. A form that accepts an empty one produces mostly empty ones, and an empty appeal makes refusing it the easiest thing to do.",
  },
  "not-an-operator": {
    says: "The appeal queue is not yours.",
  },
};

/** What an operator deciding an appeal must write, in the same shape and with
 *  the same bounds as the reason on the act itself. Reused rather than
 *  re-declared: a decision recorded with less care than the act it reviews is
 *  the wrong way round. */
export const APPEAL_DECISION_LABEL = "Why";

export const APPEAL_DECISION_HINT =
  "This goes in the append-only ledger next to the act. It is never shown to the appellant — they are told the outcome, not judged in prose — but it is what makes the decision reviewable later.";

/** The two decisions, in the order the queue offers them.
 *
 *  UPHOLD IS FIRST, deliberately, and for the reason TS4's flag queue puts
 *  "the check was wrong" first: the estate wants this path used, the reversal
 *  rate is its only production measurement of how often it acts wrongly, and
 *  putting the agreeable answer second makes "the original stands" the easy
 *  default. */
export const APPEAL_DECISIONS = ["uphold", "refuse"] as const;
export type AppealDecision = (typeof APPEAL_DECISIONS)[number];

export const APPEAL_DECISION_COPY: Record<AppealDecision, string> = {
  uphold: "We got this wrong — reverse it",
  refuse: "The act stands",
};

/** Which ledger act each decision writes. */
export const APPEAL_OUTCOME_ACT: Record<AppealDecision, ModerationAct> = {
  uphold: "appeal_upheld",
  refuse: "appeal_refused",
};
