// Trust and safety (openproduct-commons TS0).
//
// TS is not a wave, it is a GATE: every public write surface this program
// adds has a named control here that must exist before that surface opens
// (OPC-8). This module is the vocabulary all of them share.
//
// Three closed vocabularies, and each is closed for the same reason: these
// values are rendered on a public transparency report (TS5) and counted in
// aggregate. An open vocabulary produces a report nobody can read and totals
// that mean different things in different months.

// ---------------------------------------------------------------------------
// Layer 1 — eligibility
// ---------------------------------------------------------------------------

/**
 * The ladder that replaces OD's per-publish admin review.
 *
 * Reviewing every publish is a fine lever at fifteen listings and an outage at
 * the design's 1,284. Making the FIRST publish cautious and every subsequent
 * one immediate puts the human cost where the risk actually is.
 */
export const TRUST_LEVELS = ["new", "established", "trusted", "restricted"] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

/** No row means `new`. A row per signed-in subject would be a shadow user
 *  directory, which is not a thing openproduct keeps. */
export const DEFAULT_TRUST_LEVEL: TrustLevel = "new";

/** What a level permits, as data rather than as branches spread across
 *  handlers. Consumed by TS1 when the ladder starts gating publishes. */
export interface TrustPolicy {
  /** May publish a listing without a human clearing it first. */
  readonly publishesImmediately: boolean;
  /** A published listing is indexable by crawlers. */
  readonly indexable: boolean;
  /** May perform public writes at all (posting, endorsing, reporting). */
  readonly mayWrite: boolean;
}

export const TRUST_POLICY: Record<TrustLevel, TrustPolicy> = {
  // A first listing is rate-limited and unindexed until it clears the bar or
  // a human clears it. It is not blocked: the maker can build their page,
  // share the link, and be read — search engines simply do not amplify it yet.
  new: { publishesImmediately: false, indexable: false, mayWrite: true },
  established: { publishesImmediately: true, indexable: true, mayWrite: true },
  trusted: { publishesImmediately: true, indexable: true, mayWrite: true },
  // Demoted after a sustained act. Reading is never restricted — OPX-2 —
  // and an appeal is always available (TS-4).
  restricted: { publishesImmediately: false, indexable: false, mayWrite: false },
};

// ---------------------------------------------------------------------------
// Layer 3 — consequence
// ---------------------------------------------------------------------------

/** What can be reported. Every value names a surface this program ships, so
 *  a report can never point at a nothing. */
export const REPORT_SUBJECT_KINDS = [
  "listing",
  "profile",
  "thread",
  "post",
  "collection",
] as const;
export type ReportSubjectKind = (typeof REPORT_SUBJECT_KINDS)[number];

/**
 * Why. Closed, short, and written as what a reporter would actually say.
 *
 * `not-the-maintainer` is here because it is the likeliest real report on
 * this particular surface: someone listing a product they do not maintain.
 * There is deliberately NO "this is not open source" reason — OPC-I settles
 * that this directory shows the licence it observed and does not adjudicate
 * which licences qualify, and a report reason is not the place to relitigate
 * a locked decision.
 */
export const REPORT_REASONS = [
  "spam",
  "impersonation",
  "not-the-maintainer",
  "abuse-or-harassment",
  "malware-or-security",
  "misleading-claims",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** What a reporter reads beside each reason. Rendered in the report control,
 *  so a person picks the right one rather than defaulting to `other`. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or generated filler",
  impersonation: "Impersonates a person or organisation",
  "not-the-maintainer": "Listed by someone who does not maintain it",
  "abuse-or-harassment": "Abusive or targets a person",
  "malware-or-security": "Malware, or a security risk to anyone who runs it",
  "misleading-claims": "Claims something about itself that is not true",
  other: "Something else",
};

export const REPORT_STATES = ["open", "triaged", "actioned", "declined"] as const;
export type ReportState = (typeof REPORT_STATES)[number];

/**
 * Every moderation act, forever, in one vocabulary.
 *
 * Paired deliberately — `remove`/`restore`, `lock`/`unlock`,
 * `delist`/`relist`, `deindex`/`reindex` — because an act that cannot be
 * undone in the same vocabulary is an act TS5's report cannot show the
 * reversal of.
 */
export const MODERATION_ACTS = [
  "remove",
  "restore",
  "lock",
  "unlock",
  "delist",
  "relist",
  "deindex",
  "reindex",
  "trust_promote",
  "trust_demote",
  "report_declined",
  "appeal_upheld",
  "appeal_refused",
] as const;
export type ModerationAct = (typeof MODERATION_ACTS)[number];

/**
 * The one actor id automation may use, and the only two acts it may take.
 *
 * TS-5 in three lines: automation flags, rate-limits, discounts and
 * DE-INDEXES; only a human removes. A false positive on removal erases a real
 * person's work from a page search engines have already crawled, and the
 * asymmetry between "slower" and "wrongly erased" is not close. The database
 * enforces this too (a CHECK on moderation_acts) so the two cannot disagree.
 */
export const AUTOMATIC_ACTOR = "automatic";
export const AUTOMATABLE_ACTS: readonly ModerationAct[] = ["deindex", "reindex"];

export function actIsAutomatable(act: ModerationAct): boolean {
  return AUTOMATABLE_ACTS.includes(act);
}

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------

/** What a signed-in reporter sends. */
export interface SubmitReportRequest {
  subjectKind: ReportSubjectKind;
  subjectRef: string;
  reason: ReportReason;
  detail?: string | null;
}

/** What they get back — an acknowledgement, and nothing about the queue.
 *  A reporter learning that three others reported the same thing is a
 *  brigading signal we would be handing out for free. */
export interface SubmitReportResponse {
  id: string;
  state: ReportState;
}

/** One row of the moderation queue, as a triager sees it. */
export interface QueuedReport {
  id: string;
  subjectKind: ReportSubjectKind;
  subjectRef: string;
  reason: ReportReason;
  detail: string | null;
  state: ReportState;
  createdAt: string;
  /** How many OTHER open reports name the same subject. The one number that
   *  changes a triager's priority, and it is not shown to reporters. */
  alsoReported: number;
}

export const MAX_REPORT_DETAIL = 2000;

// ---------------------------------------------------------------------------
// The ladder, applied (openproduct-commons TS1)
// ---------------------------------------------------------------------------

/**
 * How many UNREVIEWED public listings one `new` maker may hold at once.
 *
 * The abuse bound for this surface, and it is a NUMBER rather than a
 * sentiment because a cap nobody can see is a cap a person experiences as the
 * product being broken. Three was the bound the ladder was designed around:
 * enough for somebody with a genuine small portfolio to get started and few
 * enough that a spam run stops being cheap before it stops being visible.
 *
 * FIFTY FOR NOW. No operator is configured yet (`OPENPRODUCT_OPERATORS` is
 * unset), so nothing can be reviewed and the cap would stop every maker at
 * three with no way through. Fifty keeps the bound visible and finite while
 * the reviewer is set up; bring it back down once one is.
 *
 * It applies only while nothing of the maker's has been reviewed. The first
 * review promotes them, and the cap stops existing for them entirely.
 */
export const UNREVIEWED_LISTING_CAP = 50;

/** What TS1 decides about one publish attempt. */
export interface PublishDecision {
  /** Publish may proceed. */
  readonly allowed: boolean;
  /** Why not. Empty when allowed. */
  readonly blockers: readonly ("awaiting_review" | "restricted" | "unreviewed_listing_cap")[];
  /**
   * Whether the listing may be AMPLIFIED once published. Stored on the row at
   * publish time (migration 1370) rather than recomputed at read time, so a
   * later promotion or demotion cannot retroactively change what a published
   * page was allowed to be.
   */
  readonly indexable: boolean;
  /** Whether a human review is still required before publishing at all. */
  readonly requiresReview: boolean;
}

/**
 * THE LADDER, IN ONE FUNCTION.
 *
 * Reviewing every publish is a fine lever at fifteen listings and an outage
 * at 1,284. TS1 moves the human cost to where the risk is: a maker's first
 * listing is cautious, every subsequent one is immediate.
 *
 * "Cautious" is UNINDEXED, NOT BLOCKED. The maker builds their page, shares
 * the link, and is read by anyone they send it to; crawlers simply do not
 * amplify it until a human has looked or the maker has earned their way up.
 * Blocking would punish the honest first-timer — the overwhelming majority —
 * to inconvenience the spammer, who will make another account anyway.
 *
 * `alreadyReviewed` is the OD escape hatch and it survives on purpose: a
 * human clearing a specific listing overrides the ladder in both directions.
 * It is what a `new` maker's first listing gets when somebody looks at it,
 * and it is the only way a `restricted` maker publishes anything.
 */
export function publishDecision(input: {
  readonly level: TrustLevel;
  readonly alreadyReviewed: boolean;
  readonly unreviewedListings: number;
}): PublishDecision {
  const policy = TRUST_POLICY[input.level];

  // A human looked at THIS listing. That answers every question the ladder
  // exists to ask, for any level — including `restricted`, because the point
  // of restriction is that a person decides, not that nothing may ever ship.
  if (input.alreadyReviewed) {
    return { allowed: true, blockers: [], indexable: true, requiresReview: false };
  }

  if (!policy.mayWrite) {
    return { allowed: false, blockers: ["restricted"], indexable: false, requiresReview: true };
  }

  if (policy.publishesImmediately) {
    return { allowed: true, blockers: [], indexable: policy.indexable, requiresReview: false };
  }

  // A `new` maker. They publish — unindexed — up to the cap.
  if (input.unreviewedListings >= UNREVIEWED_LISTING_CAP) {
    return {
      allowed: false,
      blockers: ["unreviewed_listing_cap"],
      indexable: false,
      requiresReview: true,
    };
  }
  return { allowed: true, blockers: [], indexable: false, requiresReview: false };
}

/**
 * What a maker is told, in their own terms. One sentence per outcome, naming
 * what happens next rather than what went wrong.
 *
 * The unindexed case is the one that must not read as a punishment: it is
 * true, it is temporary, and the maker can do something about it.
 */
export function publishStateCopy(decision: PublishDecision): string {
  if (!decision.allowed) {
    if (decision.blockers.includes("restricted")) {
      return "Publishing is paused on this account while a report is reviewed. You can appeal, and nothing you have already published has been removed.";
    }
    return `You can have ${UNREVIEWED_LISTING_CAP} listings published at a time until one of them has been reviewed. Reviews are usually quick — once the first goes through, this limit stops applying to you.`;
  }
  if (!decision.indexable) {
    return "Your page is live and anyone you send the link to can read it. Search engines will not index it until a first listing of yours has been reviewed — usually quick, and it only happens once.";
  }
  return "Your page is live and search engines can index it.";
}

/**
 * Should this maker be promoted, now that a listing of theirs was reviewed?
 *
 * The rule the done-when names: publishing a SECOND listing from an
 * established maker requires no human. That only holds if the first review
 * promotes — otherwise every listing waits for a person forever and TS1 has
 * changed nothing.
 *
 * `trusted` is deliberately NOT reachable here. It is latitude a later
 * milestone may spend, and a level that promotes itself is a level nobody
 * decided to grant.
 */
export function promotionAfterReview(level: TrustLevel): TrustLevel | null {
  return level === "new" ? "established" : null;
}
