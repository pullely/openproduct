// Consequence, and the shape of what is left behind (openproduct-commons TS3).
//
// TS0 built the report door, the queue and the append-only `moderation_acts`
// ledger. It deliberately stopped there: a queue a human can read, and no way
// to act on what they read. This is the acting half.
//
// THE ONE DECISION EVERYTHING ELSE FOLLOWS FROM: moderation state is a
// SEPARATE AXIS from `visibility`, not a value of it.
//
// `visibility` is the maintainer's own switch — their draft, their choice,
// theirs to flip back. If a removal were written as `visibility = 'private'`
// then the person it was applied to could undo it from their own studio, and
// a removal the subject can reverse is not a removal. Worse, a private
// listing 404s, and TS-3 exists precisely to forbid that: on a linkable,
// crawlable, permanent surface, silent deletion is indistinguishable from a
// bug and reads as censorship to the person it happened to.
//
// So a listing has two independent facts — "the maintainer means it to be
// public" and "the estate has acted on it" — and the page renders the
// intersection. A delisted listing whose maintainer privates it is still
// delisted when they publish again.
//
// WHAT A TOMBSTONE MAY SAY. The state, the date, and nothing else. Not the
// reason (a reason is a judgement about a person, published at their address,
// which they have not had the chance to appeal — TS5 publishes reasons in
// AGGREGATE for exactly this asymmetry). Not who acted. Not who reported: the
// reporter's identity is the queue's, never the subject's, or reporting
// becomes an act of standing in front of the person you reported.
//
// The tombstone is therefore the same for every viewer, which is what lets it
// be cached like every other public read (OPC-1) and keeps I6 — anonymous and
// signed-in bytes identical.

import type { ModerationAct } from "./trust.js";

// ---------------------------------------------------------------------------
// The state of a thing, after acts
// ---------------------------------------------------------------------------

/**
 * Three states, and the middle one is the one worth defending.
 *
 * `visible`  — nothing has been done, or everything done has been undone.
 * `delisted` — off the directory, off search, off the digest and the feeds;
 *              its own page still renders it, in full, with a line saying it
 *              was delisted and when. This is the proportionate act, and it
 *              is what "this does not belong in a directory of open products"
 *              looks like without erasing anybody's work.
 * `removed`  — the content itself is gone from the page. The address still
 *              resolves, and says so.
 *
 * DELIST IS NOT A WEAKER REMOVE, it is a different claim. Removing says the
 * content should not exist here; delisting says it should not be AMPLIFIED
 * here. Collapsing them into one state would force every act to be the
 * maximal one, which is how moderation surfaces become feared.
 */
export const MODERATION_STATES = ["visible", "delisted", "removed"] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

/**
 * Which act produces which state.
 *
 * The acts TS0's vocabulary already names; this is the half that says what
 * each one MEANS for the thing it names. Acts absent from this table change
 * no state — `deindex` moves `indexable` (TS1 owns that column), the trust
 * acts move a ladder, and the report/appeal acts record a judgement about a
 * report rather than about content.
 *
 * The `null` entries are as load-bearing as the others: they are why a
 * handler cannot quietly grow a fourth state by inventing a transition.
 */
export const ACT_RESULT: Partial<Record<ModerationAct, ModerationState>> = {
  remove: "removed",
  restore: "visible",
  delist: "delisted",
  relist: "visible",
};

/** The acts TS3 wires to content, in the order a triager meets them. */
export const CONTENT_ACTS: readonly ModerationAct[] = ["delist", "remove", "relist", "restore"];

/**
 * Which act is legal from which state — an explicit table rather than a rule.
 *
 * `restore` undoes `remove` and `relist` undoes `delist`, and the pairing is
 * not decoration: an appeal has to be able to ask what was done and when it
 * was undone, and a `relist` recorded against a removal would answer that
 * question wrongly forever. The ledger is append-only, so a mislabelled act
 * is a mislabelled act permanently.
 *
 * Escalation from `delisted` to `removed` is allowed — triage learns more.
 * De-escalation from `removed` to `delisted` is NOT: it would need two acts
 * to describe (a restore and a delist), and one button writing two ledger
 * rows is a button whose ledger nobody can read back.
 */
export const ACT_LEGAL_FROM: Partial<Record<ModerationAct, readonly ModerationState[]>> = {
  delist: ["visible"],
  remove: ["visible", "delisted"],
  relist: ["delisted"],
  restore: ["removed"],
};

export function actIsLegalFrom(act: ModerationAct, state: ModerationState): boolean {
  return ACT_LEGAL_FROM[act]?.includes(state) ?? false;
}

/** What a thing becomes after an act, or null if the act does not move it. */
export function stateAfter(act: ModerationAct): ModerationState | null {
  return ACT_RESULT[act] ?? null;
}

// ---------------------------------------------------------------------------
// The tombstone
// ---------------------------------------------------------------------------

/**
 * What a public surface renders in place of a thing that was acted on.
 *
 * Exactly two fields, and the key set is pinned by a test (I2). Every field
 * anybody has ever wanted to add here — the reason, the actor, the report
 * count, an appeal link addressed to the subject — is a fact about a person
 * published at their own address before they have answered it.
 */
export interface Tombstone {
  state: Exclude<ModerationState, "visible">;
  /** When the act that produced this state occurred. ISO 8601. */
  at: string;
}

export const TOMBSTONE_KEYS = ["state", "at"] as const;

/**
 * The sentence each state renders, and the one thing it always adds.
 *
 * Written in the passive on purpose. "We removed this" invites the reader to
 * ask who "we" are and why, at an address where the answer cannot be given
 * fairly; "This has been removed" states the fact and points at the one place
 * the estate does answer for itself, which is the transparency record.
 */
export const TOMBSTONE_COPY: Record<Tombstone["state"], { title: string; says: string }> = {
  delisted: {
    title: "This listing has been delisted",
    says:
      "It no longer appears in the directory, in search, or in the weekly digest. " +
      "The page is still here, and so is everything on it.",
  },
  removed: {
    title: "This listing has been removed",
    says:
      "The address still resolves, so links to it do not break, but the listing " +
      "itself is no longer shown.",
  },
};

/**
 * The line under the sentence.
 *
 * A date, and only a date. It is here because a tombstone without one cannot
 * be argued with — "when" is the first thing anybody appealing needs, and the
 * first thing a reader weighing the page wants to know.
 */
export function tombstoneDate(at: string): string {
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Where a tombstone points, since it will not argue its own case. */
export const TOMBSTONE_WAYS_ONWARD = [
  { label: "What we remove, and how often", href: "/transparency" },
  { label: "Browse the directory", href: "/" },
] as const;

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

/**
 * What a triager may do to a report, as distinct from what they may do to
 * content. Reading a report and acting on the thing it names are two
 * decisions, and a queue that fuses them is a queue where "I have read this"
 * is unavailable — which is how two people end up working the same row.
 */
export const TRIAGE_DECISIONS = ["claim", "decline", "action"] as const;
export type TriageDecision = (typeof TRIAGE_DECISIONS)[number];

export const TRIAGE_COPY: Record<TriageDecision, string> = {
  claim: "Mark as being looked at",
  decline: "No action needed",
  action: "Act on this",
};

/** A declined report writes a ledger row too — TS-4: every act is counted. */
export const DECLINE_ACT: ModerationAct = "report_declined";

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type ModerationRefusalReason =
  | "not-an-operator"
  | "unknown-subject"
  | "illegal-transition"
  | "reason-required"
  | "already-resolved"
  | "automated-removal";

export const MODERATION_REFUSALS: Record<ModerationRefusalReason, { says: string }> = {
  "not-an-operator": {
    says: "The moderation queue is not yours.",
  },
  "unknown-subject": {
    says: "There is nothing at that address to act on.",
  },
  "illegal-transition": {
    says:
      "That act does not apply from where this is now. A removal is undone by restoring it, " +
      "and a delisting by relisting it — never the other way round.",
  },
  "reason-required": {
    says:
      "Every act needs a reason. An act nobody wrote a reason for is an act nobody can appeal.",
  },
  "already-resolved": {
    says: "Somebody has already resolved this report.",
  },
  "automated-removal": {
    says: "Only a person removes. Automation may flag, discount and de-index.",
  },
};

/** The reason a triager types. Bounded at the write boundary, like `detail`. */
export const MAX_ACT_REASON = 1000;
export const MIN_ACT_REASON = 3;

export function reasonIsAcceptable(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= MIN_ACT_REASON && trimmed.length <= MAX_ACT_REASON;
}

// ---------------------------------------------------------------------------
// The report control, on every public surface
// ---------------------------------------------------------------------------

/**
 * TS0 shipped the door; this is the handle on it, and the copy is the whole
 * design. "Report" alone reads as an accusation the reader has to be sure of
 * before they touch it, and under-reporting is the failure mode that matters
 * on a surface nobody is paid to watch.
 */
export const REPORT_CONTROL_LABEL = "Report this listing";
export const REPORT_CONTROL_PROFILE_LABEL = "Report this profile";
export const REPORT_CONTROL_THREAD_LABEL = "Report this discussion";
export const REPORT_CONTROL_POST_LABEL = "Report this post";

/**
 * The label for each thing that can be reported.
 *
 * A LOOKUP RATHER THAN A CONDITIONAL at the call site: CB1 added threads and
 * the surface said "Report this listing" on a discussion page, because the
 * component branched on `profile` and defaulted everything else to listing.
 * A map cannot default wrongly — a new subject kind fails the typecheck here
 * instead of mislabelling itself on a page.
 */
export const REPORT_CONTROL_LABELS: Record<ReportSubjectKindName, string> = {
  listing: REPORT_CONTROL_LABEL,
  profile: REPORT_CONTROL_PROFILE_LABEL,
  thread: REPORT_CONTROL_THREAD_LABEL,
  post: REPORT_CONTROL_POST_LABEL,
  collection: "Report this collection",
};

/** Local alias so this module does not import the whole trust contract. */
type ReportSubjectKindName = "listing" | "profile" | "thread" | "post" | "collection";

export const REPORT_SIGNED_OUT_NOTE =
  "Reporting needs an account, so that a report has somebody behind it.";

export const REPORT_FILED_NOTE =
  "Thank you — a person will read this. We will not tell you who else reported it, " +
  "or what we decide about anybody else's report.";

/** What the reporter is NOT told, said once so no surface invents it. */
export const REPORT_DISCLOSURE_NOTE =
  "The listing's maintainers are never told who reported them.";
